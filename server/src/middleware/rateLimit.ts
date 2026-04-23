import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

// Auth endpoints: 5 failed logins per 15 minutes
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'rate_limit_exceeded', message: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Password reset: 3 per hour
export const resetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'rate_limit_exceeded', message: 'Too many reset requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Report generation: 20/hr anonymous, 50/hr authenticated
export const reportRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: (req: Request) => (req as any).user ? 50 : 20,
  keyGenerator: (req: Request) => (req as any).user?.id || req.cookies?.session_id || req.ip || 'unknown',
  message: { error: 'rate_limit_exceeded', message: 'Report generation limit reached. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Email: 1 per address per 60 seconds
export const emailRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 1,
  keyGenerator: (req: Request) => req.body?.email || req.ip || 'unknown',
  message: { error: 'rate_limit_exceeded', message: 'Please wait before requesting another email.' },
  standardHeaders: true,
  legacyHeaders: false,
});
