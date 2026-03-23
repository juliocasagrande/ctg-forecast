import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB } from './db/schema.js';
import { securityHeaders, requireHTTPS, apiLimiter, globalErrorHandler } from './middleware/security.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import projectsRouter from './routes/projects.js';
import forecastRouter from './routes/forecast.js';
import messagesRouter from './routes/messages.js';
import exportRouter from './routes/export.js';
import settingsRouter from './routes/settings.js';
import reportRouter from './routes/report.js';
import feedbackRouter from './routes/feedback.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_PROD = process.env.NODE_ENV === 'production';

// ─── Security: HTTPS redirect (must be first) ───────────────────────────────
app.use(requireHTTPS);

// ─── Security: Helmet headers (CSP, HSTS, X-Frame-Options, etc.) ────────────
app.use(securityHeaders);

// ─── Trust Railway's proxy for correct IP detection ──────────────────────────
app.set('trust proxy', 1);

// ─── CORS with credentials (for httpOnly cookies) ───────────────────────────
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(u => u.trim())
  : [];

app.use(cors({
  origin: IS_PROD
    ? (origin, cb) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error('Origem não permitida pelo CORS'));
      }
    : true, // dev: allow all
  credentials: true, // required for cookies
}));

// ─── Cookie parser (reads httpOnly cookies) ──────────────────────────────────
app.use(cookieParser());

// ─── Body parser ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));

// ─── Global API rate limiter ─────────────────────────────────────────────────
app.use('/api', apiLimiter);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/projects/:projectId/messages', messagesRouter);
app.use('/api/forecast', forecastRouter);
app.use('/api/export', exportRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/report', reportRouter);
app.use('/api/feedback', feedbackRouter);

app.get('/api/health', (_, res) => res.json({ status: 'ok', version: '2.1.0-security' }));

// ─── Serve frontend ──────────────────────────────────────────────────────────
const publicPath = path.join(__dirname, '../../public');
app.use(express.static(publicPath));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) res.sendFile(path.join(publicPath, 'index.html'));
});

// ─── Global error handler (sanitizes errors in production) ───────────────────
app.use(globalErrorHandler);

async function start() {
  try {
    await initDB();
    app.listen(PORT, () => console.log(`🚀 CTG Forecast v2.1 (security hardened) — porta ${PORT}`));
  } catch (err) {
    console.error('Falha ao iniciar:', err);
    process.exit(1);
  }
}
start();
