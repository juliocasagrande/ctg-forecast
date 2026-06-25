/**
 * app.js — Fábrica do Express, sem listen() e sem initDB().
 * Importado tanto pelo servidor real (index.js) quanto pelos testes.
 */
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  securityHeaders,
  requireHTTPS,
  apiLimiter,
  heavyOpLimiter,
  globalErrorHandler
} from './middleware/security.js';

import authRouter        from './routes/auth.js';
import usersRouter       from './routes/users.js';
import projectsRouter    from './routes/projects.js';
import forecastRouter    from './routes/forecast.js';
import messagesRouter    from './routes/messages.js';
import exportRouter      from './routes/export.js';
import settingsRouter    from './routes/settings.js';
import sapMappingRouter  from './routes/sap-mapping.js';
import reportRouter      from './routes/report.js';
import feedbackRouter    from './routes/feedback.js';
import documentsRouter   from './routes/documents.js';
import delegationsRouter from './routes/delegations.js';
import vacationsRouter   from './routes/vacations.js';
import metasRouter       from './routes/metas.js';
import monthlyReportRouter from './routes/monthly-report.js';
import listsRouter          from './routes/lists.js';
import chatRouter           from './routes/chat.js';
import equipamentosRouter   from './routes/equipamentos.js';
import scheduleProjectsRouter from './routes/schedule-projects.js';
import workloadRouter       from './routes/workload.js';
import pmsRouter            from './routes/pms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {Object}  opts
 * @param {boolean} opts.disableRateLimit  — desativa apiLimiter/heavyOpLimiter (útil em testes)
 */
export function createApp({ disableRateLimit = false } = {}) {
  const app = express();
  const IS_PROD = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);

  /* ── CORS ─────────────────────────────────────────────────── */
  const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(o => o.trim())
    : [];

  const corsOptions = {
    origin: IS_PROD
      ? (origin, cb) => {
          if (!origin) return cb(null, true);
          if (allowedOrigins.includes(origin)) return cb(null, true);
          return cb(new Error('Origem não permitida pelo CORS'));
        }
      : true,
    credentials: true,
  };

  app.options('*', cors(corsOptions));
  app.use(cors(corsOptions));

  /* ── SEGURANÇA ─────────────────────────────────────────────── */
  app.use(requireHTTPS);
  app.use(securityHeaders);

  /* ── MIDDLEWARES BÁSICOS ───────────────────────────────────── */
  app.use(cookieParser());
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));

  /* ── HEALTH CHECK (sem rate-limit) ────────────────────────── */
  app.get('/api/health', (_, res) => {
    res.json({ status: 'ok', version: '2.1.1-azure-ready' });
  });

  /* ── RATE LIMIT ────────────────────────────────────────────── */
  if (!disableRateLimit) {
    app.use('/api', apiLimiter);
  }

  /* ── ROTAS ─────────────────────────────────────────────────── */
  app.use('/api/auth',     authRouter);
  app.use('/api/users',    usersRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/projects/:projectId/messages', messagesRouter);
  app.use('/api/forecast', forecastRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/settings', sapMappingRouter);
  app.use('/api/report',   reportRouter);
  app.use('/api/feedback', feedbackRouter);
  app.use('/api/documents',   documentsRouter);
  app.use('/api/delegations', delegationsRouter);
   app.use('/api/vacations',   vacationsRouter);
   app.use('/api/metas',      metasRouter);
   app.use('/api/workload',   workloadRouter);
  app.use('/api/pms',        pmsRouter);
   app.use('/api/lists',       listsRouter);
  app.use('/api/chat',        chatRouter);
  app.use('/api/equipamentos', equipamentosRouter);
  app.use('/api/schedule-projects', scheduleProjectsRouter);

  if (disableRateLimit) {
    app.use('/api/export',         exportRouter);
    app.use('/api/monthly-report', monthlyReportRouter);
  } else {
    app.use('/api/export',         heavyOpLimiter, exportRouter);
    app.use('/api/monthly-report', heavyOpLimiter, monthlyReportRouter);
  }

  /* ── FRONTEND SPA ──────────────────────────────────────────── */
  const publicPath = path.join(__dirname, '../public');
  app.use(express.static(publicPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(publicPath, 'index.html'));
    }
  });

  /* ── ERROR HANDLER (último) ────────────────────────────────── */
  app.use(globalErrorHandler);

  return app;
}
