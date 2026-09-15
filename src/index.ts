import 'express-async-errors';
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

// Security Middleware (Helmet with strict headers)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", env.CLIENT_URL, 'https://*.vercel.app', 'https://*.onrender.com'],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
  })
);

// Dynamic CORS configuration for cybersecurity CTF platform
const allowedOrigins = [
  env.CLIENT_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://ctf-six-iota.vercel.app',
  'https://ctf-0bud.onrender.com',
].filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    
    // Match allowed exact origins or any Vercel/Render subdomains
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.onrender.com')
    ) {
      return callback(null, origin);
    }
    
    // Return origin for credentials compatibility
    return callback(null, origin);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Disposition'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

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
