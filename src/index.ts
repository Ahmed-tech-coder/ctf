import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import { apiGlobalLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';

import memberRoutes from './routes/member.routes';
import challengeRoutes from './routes/challenge.routes';
import leaderboardRoutes from './routes/leaderboard.routes';
import adminRoutes from './routes/admin.routes';

const app = express();

// Trust reverse proxy (Render / Cloudflare) for rate limiting & IP tracking
app.set('trust proxy', 1);

// Security Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(
  cors({
    origin: [env.CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global Rate Limiter
app.use('/api', apiGlobalLimiter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/members', memberRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.` });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

const PORT = parseInt(env.PORT, 10) || 4000;
app.listen(PORT, () => {
  console.log(`[CTF SERVER] Running on port ${PORT} in ${env.NODE_ENV} mode.`);
});
