import { Router, type Request, type Response } from 'express';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { authenticateAdmin } from '../middleware/auth.js';

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

let deviceDB: any = null;
let etag: string = '';

function loadDeviceDB() {
  const dbPath = resolve(__dirname, '../../../shared/device-database.json');
  const raw = readFileSync(dbPath, 'utf-8');
  deviceDB = JSON.parse(raw);
  etag = crypto.createHash('md5').update(raw).digest('hex');
}

// Load on startup
loadDeviceDB();

// GET /api/devices
router.get('/', (req: Request, res: Response) => {
  const clientETag = req.headers['if-none-match'];
  if (clientETag === etag) {
    return res.status(304).end();
  }
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(deviceDB);
});

// POST /api/admin/invalidate-device-cache
router.post('/admin/invalidate-device-cache', authenticateAdmin, (_req: Request, res: Response) => {
  const previousVersion = deviceDB?.version;
  try {
    loadDeviceDB();
    res.json({ previousVersion, newVersion: deviceDB.version, deviceCount: deviceDB.devices.length });
  } catch (err) {
    console.error('Device DB reload error:', err);
    res.status(500).json({ error: 'Failed to reload device database.' });
  }
});

export default router;
