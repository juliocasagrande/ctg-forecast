import express from 'express';
import cors from 'cors';
import compression from 'compression';
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
import sapMappingRouter from './routes/sap-mapping.js';
import reportRouter from './routes/report.js';
import feedbackRouter from './routes/feedback.js';
import delegationsRouter from './routes/delegations.js';
import monthlyReportRouter from './routes/monthly-report.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_PROD = process.env.NODE_ENV === 'production';

// ─── Security: HTTPS redirect (must be first) ───────────────────────────────
app.use(requireHTTPS);

// ─── CORS — deve vir antes do Helmet e de qualquer auth ─────────────────────
// Em produção, aceita apenas origens listadas em FRONTEND_URL (separadas por vírgula)
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(u => u.trim())
  : [];

const corsOptions = {
  origin: IS_PROD
    ? (origin, cb) => {
        // Permite requests sem origem (apps mobile, Postman, health checks)
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error('Origem não permitida pelo CORS'));
      }
    : true, // dev: permite qualquer origem
  credentials: true, // necessário para cookies httpOnly
};

// Responde preflights OPTIONS imediatamente, antes de auth ou outros middlewares
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// ─── Compressão gzip — reduz respostas grandes (ex: HTML do relatório mensal)
app.use(compression());

// ─── Security: Helmet headers (CSP, HSTS, X-Frame-Options, etc.) ────────────
app.use(securityHeaders);

// ─── Trust Railway's proxy para detecção correta de IP ───────────────────────
app.set('trust proxy', 1);

// ─── Cookie parser ───────────────────────────────────────────────────────────
app.use(cookieParser());

// ─── Body parser ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));

// ─── Rate limiter global de API ───────────────────────────────────────────────
app.use('/api', apiLimiter);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/projects/:projectId/messages', messagesRouter);
app.use('/api/forecast', forecastRouter);
app.use('/api/export', exportRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/settings', sapMappingRouter);
app.use('/api/report', reportRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/delegations', delegationsRouter);
app.use('/api/monthly-report', monthlyReportRouter);

app.get('/api/health', (_, res) => res.json({ status: 'ok', version: '2.1.0-security' }));

// ─── Serve frontend (build do React em /public) ───────────────────────────────
const publicPath = path.join(__dirname, '../../public');
app.use(express.static(publicPath));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) res.sendFile(path.join(publicPath, 'index.html'));
});

// ─── Global error handler ────────────────────────────────────────────────────
app.use(globalErrorHandler);

async function start() {
  // [DEBUG] Log de variáveis de ambiente relevantes ao iniciar
  console.log("[startup] NODE_ENV:", process.env.NODE_ENV);
  console.log("[startup] PORT:", process.env.PORT);
  console.log("[startup] FRONTEND_URL:", process.env.FRONTEND_URL);
  console.log("[startup] DATABASE_URL definida:", !!process.env.DATABASE_URL);
  try {
    await initDB();
    app.listen(PORT, () => console.log(`🚀 CTG Forecast v2.1 (security hardened) — porta ${PORT}`));
  } catch (err) {
    console.error('Falha ao iniciar:', err);
    process.exit(1);
  }
}
start();