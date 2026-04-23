import { Router, type Request, type Response } from 'express';
import pool from '../db/pool.js';
import { authenticateRequired } from '../middleware/auth.js';

const router = Router();
router.use(authenticateRequired);

// POST /api/presets
router.post('/', async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { name, devices } = req.body;
  if (!name || !Array.isArray(devices)) return res.status(400).json({ error: 'Name and devices array required.' });

  try {
    const result = await pool.query(
      'INSERT INTO device_presets (user_id, name, devices) VALUES ($1, $2, $3) RETURNING id',
      [user.id, name, JSON.stringify(devices)]
    );
    res.status(201).json({ presetId: result.rows[0].id });
  } catch (err) {
    console.error('Create preset error:', err);
    res.status(500).json({ error: 'Failed to create preset.' });
  }
});

// GET /api/presets
router.get('/', async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    const result = await pool.query(
      'SELECT id, name, devices, created_at, updated_at FROM device_presets WHERE user_id = $1 ORDER BY updated_at DESC',
      [user.id]
    );
    res.json({ presets: result.rows });
  } catch (err) {
    console.error('List presets error:', err);
    res.status(500).json({ error: 'Failed to list presets.' });
  }
});

// PATCH /api/presets/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { name, devices } = req.body;

  try {
    const existing = await pool.query('SELECT user_id FROM device_presets WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0 || existing.rows[0].user_id !== user.id) {
      return res.status(404).json({ error: 'Preset not found.' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (name) { updates.push(`name = $${idx++}`); values.push(name); }
    if (devices) { updates.push(`devices = $${idx++}`); values.push(JSON.stringify(devices)); }
    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    await pool.query(`UPDATE device_presets SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    res.json({ message: 'Preset updated.' });
  } catch (err) {
    console.error('Update preset error:', err);
    res.status(500).json({ error: 'Failed to update preset.' });
  }
});

// DELETE /api/presets/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    const result = await pool.query('DELETE FROM device_presets WHERE id = $1 AND user_id = $2', [req.params.id, user.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Preset not found.' });
    res.json({ message: 'Preset deleted.' });
  } catch (err) {
    console.error('Delete preset error:', err);
    res.status(500).json({ error: 'Failed to delete preset.' });
  }
});

export default router;
