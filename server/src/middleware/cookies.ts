import type { NextFunction, Request, Response } from 'express';

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = decodeURIComponent(trimmed.slice(eq + 1).trim());
    out[key] = value;
  }
  return out;
}

export function cookies(req: Request, _res: Response, next: NextFunction): void {
  req.cookies = parseCookies(req.header('cookie'));
  next();
}
