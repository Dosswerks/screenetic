import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../db/pool.js';
import { loginRateLimit, resetRateLimit, emailRateLimit } from '../middleware/rateLimit.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';
const BCRYPT_ROUNDS = 12;

// Password validation: min 8 chars, 1 upper, 1 lower, 1 number
function validatePassword(pw: string): boolean {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// POST /api/auth/register
router.post('/register', emailRateLimit, async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
  if (!validatePassword(password)) {
    return res.status(400).json({ error: 'Password must be 8+ chars with uppercase, lowercase, and number.' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already registered.' });

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email.toLowerCase(), passwordHash]
    );
    const userId = result.rows[0].id;

    // Generate verification token
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      'INSERT INTO email_tokens (user_id, token_hash, type, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL \'24 hours\')',
      [userId, hashToken(token), 'verify']
    );

    // TODO: Send verification email via EmailService
    console.log(`[DEV] Verification token for ${email}: ${token}`);

    res.status(201).json({ message: 'Account created. Check your email to verify.' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

// POST /api/auth/verify
router.post('/verify', async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required.' });

  try {
    const result = await pool.query(
      'SELECT et.user_id FROM email_tokens et WHERE et.token_hash = $1 AND et.type = $2 AND et.used = FALSE AND et.expires_at > NOW()',
      [hashToken(token), 'verify']
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Invalid or expired token.' });

    const userId = result.rows[0].user_id;
    await pool.query('UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1', [userId]);
    await pool.query('UPDATE email_tokens SET used = TRUE WHERE token_hash = $1', [hashToken(token)]);

    res.json({ message: 'Email verified. You can now log in.' });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// POST /api/auth/login
router.post('/login', loginRateLimit, async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

  try {
    const result = await pool.query('SELECT id, email, password_hash, email_verified FROM users WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials.' });

    const user = result.rows[0];
    if (!user.email_verified) return res.status(403).json({ error: 'Please verify your email first.' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

    // Access token (24h)
    const accessToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });

    // Refresh token (7d)
    const refreshToken = crypto.randomBytes(32).toString('hex');
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
      [user.id, hashToken(refreshToken)]
    );

    res.json({ accessToken, refreshToken });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required.' });

  try {
    const result = await pool.query(
      'SELECT rt.id, rt.user_id, u.email FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE rt.token_hash = $1 AND rt.expires_at > NOW()',
      [hashToken(refreshToken)]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid or expired refresh token.' });

    const { id: tokenId, user_id, email } = result.rows[0];

    // Rotate: delete old, issue new
    await pool.query('DELETE FROM refresh_tokens WHERE id = $1', [tokenId]);
    const newRefreshToken = crypto.randomBytes(32).toString('hex');
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
      [user_id, hashToken(newRefreshToken)]
    );

    const accessToken = jwt.sign({ id: user_id, email }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed.' });
  }
});

// POST /api/auth/forgot
router.post('/forgot', emailRateLimit, resetRateLimit, async (req: Request, res: Response) => {
  const { email } = req.body;
  // Always return success to prevent email enumeration
  res.json({ message: 'If that email exists, a reset link was sent.' });

  if (!email) return;
  try {
    const result = await pool.query('SELECT id FROM users WHERE email = $1 AND email_verified = TRUE', [email.toLowerCase()]);
    if (result.rows.length === 0) return;

    const userId = result.rows[0].id;
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      'INSERT INTO email_tokens (user_id, token_hash, type, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL \'1 hour\')',
      [userId, hashToken(token), 'reset']
    );

    // TODO: Send reset email via EmailService
    console.log(`[DEV] Reset token for ${email}: ${token}`);
  } catch (err) {
    console.error('Forgot password error:', err);
  }
});

// POST /api/auth/reset
router.post('/reset', async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required.' });
  if (!validatePassword(newPassword)) {
    return res.status(400).json({ error: 'Password must be 8+ chars with uppercase, lowercase, and number.' });
  }

  try {
    const result = await pool.query(
      'SELECT user_id FROM email_tokens WHERE token_hash = $1 AND type = $2 AND used = FALSE AND expires_at > NOW()',
      [hashToken(token), 'reset']
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Invalid or expired reset token.' });

    const userId = result.rows[0].user_id;
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, userId]);
    await pool.query('UPDATE email_tokens SET used = TRUE WHERE token_hash = $1', [hashToken(token)]);
    // Invalidate all refresh tokens for this user
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

    res.json({ message: 'Password reset successful. Please log in.' });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ error: 'Password reset failed.' });
  }
});

// DELETE /api/auth/account
router.delete('/account', async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });

  try {
    // Cascade deletes handle refresh_tokens, email_tokens, reports, report_devices, presets
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    // TODO: Send account deletion confirmation email
    // TODO: Delete S3 screenshots for user's reports
    res.json({ message: 'Account deleted.' });
  } catch (err) {
    console.error('Account deletion error:', err);
    res.status(500).json({ error: 'Account deletion failed.' });
  }
});

export default router;
