import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Issues a session_id cookie for anonymous users.
 * HttpOnly, Secure, SameSite=Lax, 7-day expiry.
 */
export function ensureSessionId(req: Request, res: Response, next: NextFunction) {
  if (!req.cookies?.session_id) {
    const sessionId = crypto.randomBytes(32).toString('hex'); // 64 chars
    res.cookie('session_id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    req.cookies = req.cookies || {};
    req.cookies.session_id = sessionId;
  }
  next();
}
