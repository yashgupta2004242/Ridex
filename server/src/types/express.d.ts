export {};

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      cookies: Record<string, string>;
      auth?: {
        userId: string;
        role: 'rider' | 'driver' | 'admin';
      };
      idempotencyKey?: string;
      rawBody?: string;
    }
    interface Locals {
      ridex?: import('../app').RidexRuntime;
    }
  }
}
