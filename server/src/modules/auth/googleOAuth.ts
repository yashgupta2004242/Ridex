import type { Env } from '../../config/env';
import { AppError } from '../../common/AppError';
import { ERROR_CODES, HTTP } from '../../common/constants';

export type GoogleProfile = {
  sub: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

export type GoogleOAuthPort = {
  buildAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<GoogleProfile>;
};

type TokenResponse = {
  access_token?: string;
  error?: string;
};

type UserInfoResponse = {
  sub?: string;
  email?: string;
  name?: string;
  email_verified?: boolean;
};

export class GoogleOAuthClient implements GoogleOAuthPort {
  constructor(private readonly env: Env) {}

  buildAuthUrl(state: string): string {
    if (!this.env.GOOGLE_CLIENT_ID || !this.env.GOOGLE_REDIRECT_URI) {
      throw new AppError(
        HTTP.SERVICE_UNAVAILABLE,
        ERROR_CODES.GOOGLE_NOT_CONFIGURED,
        'Google sign-in is not configured',
      );
    }
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', this.env.GOOGLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', this.env.GOOGLE_REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('access_type', 'online');
    url.searchParams.set('prompt', 'select_account');
    return url.toString();
  }

  async exchangeCode(code: string): Promise<GoogleProfile> {
    if (!this.env.GOOGLE_CLIENT_ID || !this.env.GOOGLE_CLIENT_SECRET || !this.env.GOOGLE_REDIRECT_URI) {
      throw new AppError(
        HTTP.SERVICE_UNAVAILABLE,
        ERROR_CODES.GOOGLE_NOT_CONFIGURED,
        'Google sign-in is not configured',
      );
    }

    const body = new URLSearchParams({
      code,
      client_id: this.env.GOOGLE_CLIENT_ID,
      client_secret: this.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: this.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const tokenJson = (await tokenRes.json()) as TokenResponse;
    if (!tokenRes.ok || !tokenJson.access_token) {
      throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Google authorization failed');
    }

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { authorization: `Bearer ${tokenJson.access_token}` },
    });
    const profile = (await profileRes.json()) as UserInfoResponse;
    if (!profileRes.ok || !profile.sub || !profile.email) {
      throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Google profile was incomplete');
    }

    return {
      sub: profile.sub,
      email: profile.email,
      name: profile.name ?? profile.email,
      emailVerified: Boolean(profile.email_verified),
    };
  }
}
