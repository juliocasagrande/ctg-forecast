import express from 'express';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { initDB } from './db/schema.js';
import { seedAdmin } from './db/seed.js';

import {
  securityHeaders,
  requireHTTPS,
  apiLimiter,
  heavyOpLimiter,
  globalErrorHandler
} from './middleware/security.js';

import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import projectsRouter from './routes/projects.js';
import forecastRouter from './routes/forecast.js';
import messagesRouter from './routes/messages.js';
import exportRouter from './routes/export.js';
import settingsRouter from './routes/settings.js';
import sapMappingRouter from './routes/sap-mapping.js';
import reportRouter from './routes/report.js';
import feedbackRouter from './routes/feedback.js';
import documentsRouter from './routes/documents.js';
import delegationsRouter from './routes/delegations.js';
import vacationsRouter from './routes/vacations.js';
import monthlyReportRouter from './routes/monthly-report.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_PROD = process.env.NODE_ENV === 'production';

/* ──────────────────────────────────────────────────────────────
 * TRUST PROXY (OBRIGATÓRIO EM AZURE / RAILWAY)
 * ────────────────────────────────────────────────────────────── */
app.set('trust proxy', 1);

/* ──────────────────────────────────────────────────────────────
 * CORS (PRIMEIRO MIDDLEWARE)
 * ────────────────────────────────────────────────────────────── */
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(o => o.trim())
  : [];

const corsOptions = {
  origin: IS_PROD
    ? (origin, cb) => {
        // ✅ Permite chamadas sem Origin (curl, health check, server-to-server)
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('Origem não permitida pelo CORS'));
      }
    : true,
  credentials: true
};

// Preflight SEM rate-limit
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

/* ──────────────────────────────────────────────────────────────
 * SEGURANÇA
 * ────────────────────────────────────────────────────────────── */
app.use(requireHTTPS);
app.use(securityHeaders);

/* ──────────────────────────────────────────────────────────────
 * MIDDLEWARES BÁSICOS
 * ────────────────────────────────────────────────────────────── */
app.use(cookieParser());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

/* ──────────────────────────────────────────────────────────────
 * HEALTH CHECK (NUNCA PASSA POR RATE LIMIT)
 * ────────────────────────────────────────────────────────────── */
app.get('/api/health', (_, res) => {
  res.json({
    status: 'ok',
    version: '2.1.1-azure-ready'
  });
});

/* ──────────────────────────────────────────────────────────────
 * RATE LIMIT (APENAS APIs REAIS)
 * ────────────────────────────────────────────────────────────── */
app.use('/api', apiLimiter);

/* ──────────────────────────────────────────────────────────────
 * ROTAS
 * ────────────────────────────────────────────────────────────── */
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/projects/:projectId/messages', messagesRouter);
app.use('/api/forecast', forecastRouter);
app.use('/api/export', heavyOpLimiter, exportRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/settings', sapMappingRouter);
app.use('/api/report', reportRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/delegations', delegationsRouter);
app.use('/api/vacations', vacationsRouter);
app.use('/api/monthly-report', heavyOpLimiter, monthlyReportRouter);

/* ──────────────────────────────────────────────────────────────
 * FRONTEND (SPA)
 * ────────────────────────────────────────────────────────────── */
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(publicPath, 'index.html'));
  }
});

/* ──────────────────────────────────────────────────────────────
 * ERROR HANDLER (ÚLTIMO)
 * ────────────────────────────────────────────────────────────── */
app.use(globalErrorHandler);

/* ──────────────────────────────────────────────────────────────
 * START
 * ────────────────────────────────────────────────────────────── */
async function start() {
  try {
    await initDB();
    await seedAdmin();

    app.listen(PORT, () => {
      console.log(`🚀 App rodando na porta ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Falha ao iniciar:', err);
    process.exit(1);
  }
}

start();