import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ensureSessionId } from './middleware/sessionId.js';
import { authenticateOptional } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import reportRouter from './routes/reports.js';
import deviceRouter from './routes/devices.js';
import presetRouter from './routes/presets.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(ensureSessionId);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/reports', reportRouter);
app.use('/api/devices', deviceRouter);
app.use('/api/presets', presetRouter);

app.listen(PORT, () => {
  console.log(`Screenetic server running on port ${PORT}`);
});

export default app;
