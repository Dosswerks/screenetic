import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import pool from '../db/pool.js';
import { authenticateOptional, authenticateRequired } from '../middleware/auth.js';
import { reportRateLimit } from '../middleware/rateLimit.js';

const router = Router();

// POST /api/reports — Create a report
router.post('/', authenticateOptional, reportRateLimit, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const sessionId = req.cookies?.session_id;
  const { url, devices, isAutoAudit, networkProfile, cpuProfile, deviceDbVersion, metadata } = req.body;

  if (!url) return res.status(400).json({ error: 'URL required.' });

  const maxDevices = user ? 50 : 25;
  if (devices?.length > maxDevices) {
    return res.status(400).json({ error: 'device_limit_exceeded', message: `Maximum ${maxDevices} devices per report.`, limit: maxDevices });
  }

  try {
    const expiresAt = user ? null : "NOW() + INTERVAL '7 days'";
    const result = await pool.query(
      `INSERT INTO reports (user_id, session_id, url, device_count, visibility, device_db_version, is_auto_audit, network_profile, cpu_profile, metadata, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ${expiresAt ? expiresAt : 'NULL'})
       RETURNING id`,
      [user?.id || null, user ? null : sessionId, url, devices?.length || 0, user ? 'private' : 'unlisted', deviceDbVersion, isAutoAudit || false, networkProfile, cpuProfile, metadata ? JSON.stringify(metadata) : null]
    );

    const reportId = result.rows[0].id;

    // For anonymous reports, auto-generate a share token
    let shareToken = null;
    if (!user) {
      shareToken = crypto.randomBytes(16).toString('hex');
      await pool.query('UPDATE reports SET share_token = $1 WHERE id = $2', [shareToken, reportId]);
    }

    res.status(201).json({ reportId, shareUrl: shareToken ? `/report/${reportId}?token=${shareToken}` : `/report/${reportId}` });
  } catch (err) {
    console.error('Create report error:', err);
    res.status(500).json({ error: 'Failed to create report.' });
  }
});

// GET /api/reports — List user's reports
router.get('/', authenticateRequired, async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    const result = await pool.query(
      'SELECT id, url, device_count, issue_count, visibility, is_auto_audit, created_at FROM reports WHERE user_id = $1 ORDER BY created_at DESC',
      [user.id]
    );
    res.json({ reports: result.rows });
  } catch (err) {
    console.error('List reports error:', err);
    res.status(500).json({ error: 'Failed to list reports.' });
  }
});

// GET /api/reports/:id — Get report (respects visibility/auth/share tokens)
router.get('/:id', authenticateOptional, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const sessionId = req.cookies?.session_id;
  const shareTokenParam = req.query.token as string | undefined;

  try {
    const result = await pool.query('SELECT * FROM reports WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found.' });

    const report = result.rows[0];

    // Check access
    const isOwner = (user && report.user_id === user.id) || (!user && report.session_id === sessionId);
    const isUnlisted = report.visibility === 'unlisted';
    const hasValidShareToken = shareTokenParam && report.share_token === shareTokenParam;
    const shareExpired = report.share_expires_at && new Date(report.share_expires_at) < new Date();

    if (!isOwner && !(isUnlisted && hasValidShareToken && !shareExpired)) {
      if (report.visibility === 'private') return res.status(404).json({ error: 'Report not found.' });
      if (shareExpired) return res.status(410).json({ error: 'This report link has expired or been revoked.' });
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Check retention expiry
    if (report.expires_at && new Date(report.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This report is no longer available.' });
    }

    // Fetch devices
    const devices = await pool.query('SELECT * FROM report_devices WHERE report_id = $1 ORDER BY sort_order', [report.id]);

    res.json({ report: { ...report, devices: devices.rows }, isOwner });
  } catch (err) {
    console.error('Get report error:', err);
    res.status(500).json({ error: 'Failed to get report.' });
  }
});

// PATCH /api/reports/:id — Update visibility/expiry
router.patch('/:id', authenticateRequired, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { visibility, shareExpiresAt } = req.body;

  try {
    const result = await pool.query('SELECT user_id FROM reports WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0 || result.rows[0].user_id !== user.id) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (visibility) { updates.push(`visibility = $${idx++}`); values.push(visibility); }
    if (shareExpiresAt !== undefined) { updates.push(`share_expires_at = $${idx++}`); values.push(shareExpiresAt); }

    if (updates.length > 0) {
      values.push(req.params.id);
      await pool.query(`UPDATE reports SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    }

    res.json({ message: 'Report updated.' });
  } catch (err) {
    console.error('Update report error:', err);
    res.status(500).json({ error: 'Failed to update report.' });
  }
});

// DELETE /api/reports/:id
router.delete('/:id', authenticateOptional, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const sessionId = req.cookies?.session_id;

  try {
    const result = await pool.query('SELECT user_id, session_id FROM reports WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found.' });

    const report = result.rows[0];
    const isOwner = (user && report.user_id === user.id) || (!user && report.session_id === sessionId);
    if (!isOwner) return res.status(403).json({ error: 'Access denied.' });

    // TODO: Delete S3 screenshots
    await pool.query('DELETE FROM reports WHERE id = $1', [req.params.id]);
    res.json({ message: 'Report deleted.' });
  } catch (err) {
    console.error('Delete report error:', err);
    res.status(500).json({ error: 'Failed to delete report.' });
  }
});

// POST /api/reports/:id/share — Generate share link
router.post('/:id/share', authenticateRequired, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { expiresIn } = req.body; // '1h', '24h', '7d', '30d'

  try {
    const result = await pool.query('SELECT user_id FROM reports WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0 || result.rows[0].user_id !== user.id) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    const shareToken = crypto.randomBytes(16).toString('hex');
    const expiryMap: Record<string, string> = { '1h': '1 hour', '24h': '24 hours', '7d': '7 days', '30d': '30 days' };
    const interval = expiryMap[expiresIn];
    const expiresAt = interval ? `NOW() + INTERVAL '${interval}'` : 'NULL';

    await pool.query(
      `UPDATE reports SET share_token = $1, visibility = 'unlisted', share_expires_at = ${expiresAt} WHERE id = $2`,
      [shareToken, req.params.id]
    );

    res.json({ shareUrl: `/report/${req.params.id}?token=${shareToken}`, shareToken });
  } catch (err) {
    console.error('Share report error:', err);
    res.status(500).json({ error: 'Failed to share report.' });
  }
});

// DELETE /api/reports/:id/share — Revoke share link
router.delete('/:id/share', authenticateRequired, async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const result = await pool.query('SELECT user_id FROM reports WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0 || result.rows[0].user_id !== user.id) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    await pool.query("UPDATE reports SET share_token = NULL, visibility = 'private', share_expires_at = NULL WHERE id = $1", [req.params.id]);
    res.json({ message: 'Share link revoked.' });
  } catch (err) {
    console.error('Revoke share error:', err);
    res.status(500).json({ error: 'Failed to revoke share link.' });
  }
});

export default router;
