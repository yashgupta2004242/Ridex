import type { CookieOptions, Request, Response } from 'express';
import { success } from '../../common/ApiResponse';
import { AppError } from '../../common/AppError';
import { asyncHandler } from '../../common/asyncHandler';
import { ERROR_CODES, HTTP, REFRESH_COOKIE, REFRESH_TTL_SECONDS } from '../../common/constants';
import type { Env } from '../../config/env';
import type { UserService } from '../user/user.service';
import type { LoginInput, RegisterInput } from './auth.dto';
import type { AuthService } from './auth.service';

function meta(req: Request) {
  return {
    userAgent: req.header('user-agent') ?? '',
    ip: req.ip || req.socket.remoteAddress || '',
  };
}

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly env: Env,
  ) {}

  register = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.authService.register(req.body as RegisterInput, meta(req));
    this.setRefreshCookie(res, result.refreshToken);
    res
      .status(HTTP.CREATED)
      .json(success({ accessToken: result.accessToken, user: result.user }, req.requestId));
  });

  login = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.authService.login(req.body as LoginInput, meta(req));
    this.setRefreshCookie(res, result.refreshToken);
    res.status(HTTP.OK).json(success({ accessToken: result.accessToken, user: result.user }, req.requestId));
  });

  refresh = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.authService.refresh(req.cookies[REFRESH_COOKIE], meta(req));
    this.setRefreshCookie(res, result.refreshToken);
    res.status(HTTP.OK).json(success({ accessToken: result.accessToken, user: result.user }, req.requestId));
  });

  logout = asyncHandler(async (req: Request, res: Response) => {
    await this.authService.logout(req.cookies[REFRESH_COOKIE]);
    this.clearRefreshCookie(res);
    res.status(HTTP.OK).json(success({ loggedOut: true }, req.requestId));
  });

  logoutAll = asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) {
      throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Sign in to continue');
    }
    await this.authService.logoutAll(req.auth.userId);
    this.clearRefreshCookie(res);
    res.status(HTTP.OK).json(success({ loggedOut: true }, req.requestId));
  });

  sessions = asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) {
      throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Sign in to continue');
    }
    const sessions = await this.authService.listSessions(req.auth.userId, req.cookies[REFRESH_COOKIE]);
    res.status(HTTP.OK).json(success({ sessions }, req.requestId));
  });

  me = asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) {
      throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Sign in to continue');
    }
    const user = await this.userService.getPublicById(req.auth.userId);
    res.status(HTTP.OK).json(success({ user }, req.requestId));
  });

  verifyEmail = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { token: string };
    await this.authService.verifyEmail(body.token);
    res.status(HTTP.OK).json(success({ verified: true }, req.requestId));
  });

  requestOtp = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { phone: string };
    await this.authService.requestOtp(body.phone);
    res.status(HTTP.OK).json(success({ sent: true }, req.requestId));
  });

  verifyOtp = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { phone: string; code: string };
    await this.authService.verifyOtp(body.phone, body.code);
    res.status(HTTP.OK).json(success({ verified: true }, req.requestId));
  });

  forgotPassword = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { email: string };
    await this.authService.forgotPassword(body.email);
    res.status(HTTP.OK).json(success({ sent: true }, req.requestId));
  });

  resetPassword = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { token: string; password: string };
    await this.authService.resetPassword(body.token, body.password);
    this.clearRefreshCookie(res);
    res.status(HTTP.OK).json(success({ reset: true }, req.requestId));
  });

  googleStart = asyncHandler(async (_req: Request, res: Response) => {
    const url = await this.authService.startGoogle();
    res.redirect(url);
  });

  googleCallback = asyncHandler(async (req: Request, res: Response) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const result = await this.authService.finishGoogle(code, state, meta(req));
    this.setRefreshCookie(res, result.refreshToken);
    res.redirect(`${this.env.CLIENT_URL}/auth/callback`);
  });

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: REFRESH_TTL_SECONDS * 1000,
    };
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, this.cookieOptions());
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { ...this.cookieOptions(), maxAge: 0 });
  }
}
