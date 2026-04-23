import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export interface AuthUser {
  id: string;
  email: string;
}

export function authenticateOptional(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();

  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser;
    (req as any).user = payload;
  } catch {
    // Invalid token — proceed as anonymous
  }
  next();
}

export function authenticateRequired(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
  }

  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser;
    (req as any).user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token.' });
  }
}

export function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({ error: 'forbidden', message: 'Admin access required.' });
  }
  next();
}
