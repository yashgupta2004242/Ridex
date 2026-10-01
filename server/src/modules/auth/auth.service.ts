import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AppError } from '../../common/AppError';
import {
  ACCESS_TTL_SECONDS,
  EMAIL_TOKEN_TTL_SECONDS,
  ERROR_CODES,
  HTTP,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  RESET_TOKEN_TTL_SECONDS,
} from '../../common/constants';
import type { CacheStore } from '../../config/cache';
import type { Env } from '../../config/env';
import { logger } from '../../config/logger';
import type { UserDocument, UserRole } from '../user/user.model';
import { UserRepository, toPublicUser, type PublicUser } from '../user/user.repository';
import { UserService } from '../user/user.service';
import type { LoginInput, RegisterInput } from './auth.dto';
import { randomOtp, randomToken, safeEqualHex, sha256 } from './crypto';
import type { GoogleOAuthPort } from './googleOAuth';
import { RefreshTokenRepository } from './refreshToken.repository';

export type MailerPort = {
  sendEmailVerification(email: string, token: string): Promise<void>;
  sendPasswordReset(email: string, token: string): Promise<void>;
};

export type RequestMeta = {
  userAgent: string;
  ip: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
};

type AccessClaims = {
  sub: string;
  role: UserRole;
  typ: 'access';
};

type OtpRecord = {
  hash: string;
  attempts: number;
};

export class AuthService {
  constructor(
    private readonly env: Env,
    private readonly users: UserRepository,
    private readonly userService: UserService,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly cache: CacheStore,
    private readonly mailer: MailerPort,
    private readonly google: GoogleOAuthPort,
    private readonly otpGenerator: () => string = randomOtp,
  ) {}

  async register(input: RegisterInput, meta: RequestMeta): Promise<AuthTokens> {
    const existingEmail = await this.users.findByEmail(input.email);
    if (existingEmail) {
      throw new AppError(HTTP.CONFLICT, ERROR_CODES.CONFLICT, 'Email already registered');
    }
    const existingPhone = await this.users.findByPhone(input.phone);
    if (existingPhone) {
      throw new AppError(HTTP.CONFLICT, ERROR_CODES.CONFLICT, 'Phone already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, this.env.BCRYPT_ROUNDS);
    const user = await this.users.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      role: input.role,
    });

    await this.issueEmailToken(user.email);
    return this.issueSession(user, meta);
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<AuthTokens> {
    const user = await this.users.findByEmail(input.email);
    if (!user?.passwordHash) {
      throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Invalid email or password');
    }
    const matches = await bcrypt.compare(input.password, user.passwordHash);
    if (!matches) {
      throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Invalid email or password');
    }
    this.assertLoginAllowed(user);
    return this.issueSession(user, meta);
  }

  async refresh(rawToken: string | undefined, meta: RequestMeta): Promise<AuthTokens> {
    if (!rawToken) {
      throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Refresh token missing');
    }
    const tokenHash = this.hashRefresh(rawToken);
    const stored = await this.refreshTokens.findByHash(tokenHash);
    if (!stored) {
      throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Refresh token is invalid');
    }
    if (stored.revokedAt) {
      await this.refreshTokens.revokeFamily(stored.familyId, new Date());
      logger.warn('Refresh token reuse detected; family revoked', { familyId: stored.familyId });
      throw new AppError(
        HTTP.UNAUTHORIZED,
        ERROR_CODES.TOKEN_REUSE,
        'This refresh token was already used. Sign in again.',
      );
    }
    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Refresh token expired');
    }

    stored.revokedAt = new Date();
    await this.refreshTokens.save(stored);

    const user = await this.userService.requireActiveById(stored.userId.toString());
    return this.issueSession(user, meta, stored.familyId);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const stored = await this.refreshTokens.findByHash(this.hashRefresh(rawToken));
    if (stored && !stored.revokedAt) {
      await this.refreshTokens.revokeFamily(stored.familyId, new Date());
    }
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId, new Date());
  }

  async listSessions(userId: string, rawToken: string | undefined) {
    const currentHash = rawToken ? this.hashRefresh(rawToken) : '';
    const rows = await this.refreshTokens.listByUser(userId);
    const families = new Map<
      string,
      { familyId: string; createdAt: Date; expiresAt: Date; revoked: boolean; current: boolean }
    >();
    for (const row of rows) {
      const existing = families.get(row.familyId);
      const current = row.tokenHash === currentHash;
      if (!existing) {
        families.set(row.familyId, {
          familyId: row.familyId,
          createdAt: row.createdAt,
          expiresAt: row.expiresAt,
          revoked: Boolean(row.revokedAt),
          current,
        });
      } else {
        existing.current = existing.current || current;
        existing.revoked = existing.revoked && Boolean(row.revokedAt);
      }
    }
    return [...families.values()];
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.cache.get(`email-verify:${sha256(token)}`);
    if (!userId) {
      throw new AppError(HTTP.BAD_REQUEST, ERROR_CODES.VALIDATION, 'Verification link is invalid or expired');
    }
    const user = await this.users.findById(userId);
    if (!user) {
      throw new AppError(HTTP.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'User not found');
    }
    user.isEmailVerified = true;
    await this.users.save(user);
    await this.cache.del(`email-verify:${sha256(token)}`);
  }

  async requestOtp(phone: string): Promise<void> {
    const user = await this.users.findByPhone(phone);
    if (!user) {
      throw new AppError(HTTP.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'No account for that phone number');
    }
    const code = this.otpGenerator();
    const record: OtpRecord = { hash: sha256(`${phone}:${code}`), attempts: 0 };
    await this.cache.set(`otp:${phone}`, JSON.stringify(record), OTP_TTL_SECONDS);
    if (this.env.NODE_ENV !== 'production') {
      logger.info('Dev OTP issued', { phone });
    }
  }

  async verifyOtp(phone: string, code: string): Promise<void> {
    const raw = await this.cache.get(`otp:${phone}`);
    if (!raw) {
      throw new AppError(HTTP.BAD_REQUEST, ERROR_CODES.INVALID_OTP, 'OTP is invalid or expired');
    }
    const record = JSON.parse(raw) as OtpRecord;
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      await this.cache.del(`otp:${phone}`);
      throw new AppError(HTTP.TOO_MANY_REQUESTS, ERROR_CODES.OTP_LOCKED, 'Too many OTP attempts. Request a new code.');
    }
    const matches = safeEqualHex(record.hash, sha256(`${phone}:${code}`));
    if (!matches) {
      record.attempts += 1;
      if (record.attempts >= OTP_MAX_ATTEMPTS) {
        await this.cache.del(`otp:${phone}`);
        throw new AppError(
          HTTP.TOO_MANY_REQUESTS,
          ERROR_CODES.OTP_LOCKED,
          'Too many OTP attempts. Request a new code.',
        );
      }
      await this.cache.set(`otp:${phone}`, JSON.stringify(record), OTP_TTL_SECONDS);
      throw new AppError(HTTP.BAD_REQUEST, ERROR_CODES.INVALID_OTP, 'OTP is invalid or expired');
    }
    const user = await this.users.findByPhone(phone);
    if (!user) {
      throw new AppError(HTTP.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'User not found');
    }
    user.isPhoneVerified = true;
    await this.users.save(user);
    await this.cache.del(`otp:${phone}`);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      return;
    }
    const token = randomToken();
    await this.cache.set(`pwd-reset:${sha256(token)}`, user._id.toString(), RESET_TOKEN_TTL_SECONDS);
    await this.mailer.sendPasswordReset(user.email, token);
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const userId = await this.cache.get(`pwd-reset:${sha256(token)}`);
    if (!userId) {
      throw new AppError(HTTP.BAD_REQUEST, ERROR_CODES.VALIDATION, 'Reset link is invalid or expired');
    }
    const user = await this.users.findById(userId);
    if (!user) {
      throw new AppError(HTTP.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'User not found');
    }
    user.passwordHash = await bcrypt.hash(password, this.env.BCRYPT_ROUNDS);
    await this.users.save(user);
    await this.cache.del(`pwd-reset:${sha256(token)}`);
    await this.refreshTokens.revokeAllForUser(userId, new Date());
  }

  async startGoogle(): Promise<string> {
    const state = randomToken(16);
    await this.cache.set(`oauth-state:${state}`, '1', 600);
    return this.google.buildAuthUrl(state);
  }

  async finishGoogle(code: string, state: string, meta: RequestMeta): Promise<AuthTokens> {
    const stateOk = await this.cache.get(`oauth-state:${state}`);
    if (!stateOk) {
      throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'OAuth state is invalid');
    }
    await this.cache.del(`oauth-state:${state}`);
    const profile = await this.google.exchangeCode(code);

    let user = await this.users.findByGoogleId(profile.sub);
    if (!user) {
      user = await this.users.findByEmail(profile.email);
      if (user) {
        user.googleId = profile.sub;
        if (profile.emailVerified) user.isEmailVerified = true;
        await this.users.save(user);
      } else {
        user = await this.users.create({
          name: profile.name,
          email: profile.email,
          phone: this.syntheticPhone(profile.sub),
          googleId: profile.sub,
          role: 'rider',
          isEmailVerified: profile.emailVerified,
        });
      }
    }
    this.assertLoginAllowed(user);
    return this.issueSession(user, meta);
  }

  verifyAccessToken(token: string): { userId: string; role: UserRole } {
    try {
      const decoded = jwt.verify(token, this.env.JWT_ACCESS_SECRET);
      if (typeof decoded === 'string' || decoded.typ !== 'access' || typeof decoded.sub !== 'string') {
        throw new Error('bad claims');
      }
      return { userId: decoded.sub, role: decoded.role as UserRole };
    } catch {
      throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Access token is invalid or expired');
    }
  }

  private async issueEmailToken(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return;
    const token = randomToken();
    await this.cache.set(`email-verify:${sha256(token)}`, user._id.toString(), EMAIL_TOKEN_TTL_SECONDS);
    await this.mailer.sendEmailVerification(email, token);
  }

  private async issueSession(
    user: UserDocument,
    meta: RequestMeta,
    familyId = randomToken(16),
  ): Promise<AuthTokens> {
    this.assertLoginAllowed(user);
    const accessToken = jwt.sign(
      { sub: user._id.toString(), role: user.role, typ: 'access' } satisfies AccessClaims,
      this.env.JWT_ACCESS_SECRET,
      { expiresIn: ACCESS_TTL_SECONDS },
    );
    const refreshToken = randomToken();
    await this.refreshTokens.create({
      userId: user._id.toString(),
      familyId,
      tokenHash: this.hashRefresh(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
      userAgent: meta.userAgent,
      ip: meta.ip,
    });
    return { accessToken, refreshToken, user: toPublicUser(user) };
  }

  private hashRefresh(raw: string): string {
    return sha256(`${this.env.JWT_REFRESH_SECRET}:${raw}`);
  }

  private assertLoginAllowed(user: UserDocument): void {
    if (user.status === 'suspended') {
      throw new AppError(HTTP.FORBIDDEN, ERROR_CODES.ACCOUNT_SUSPENDED, 'Account is suspended');
    }
    if (user.status === 'deleted') {
      throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Invalid email or password');
    }
  }

  private syntheticPhone(googleId: string): string {
    const n = BigInt(`0x${sha256(googleId).slice(0, 12)}`) % 10_000_000_000n;
    return `+1${n.toString().padStart(10, '0')}`;
  }
}
