import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

/* ──────────────────────────────────────────────────────────────
 * ORIGENS PERMITIDAS (CSP + ERROR HANDLER)
 * ────────────────────────────────────────────────────────────── */
const FRONTEND_URL = process.env.FRONTEND_URL || '';
const BACKEND_URL  = process.env.BACKEND_URL  || '';

const allowedOrigins = [
  ...FRONTEND_URL.split(',').map(u => u.trim()).filter(Boolean),
  ...BACKEND_URL.split(',').map(u => u.trim()).filter(Boolean),
];

/* ──────────────────────────────────────────────────────────────
 * HELMET (CONFIGURAÇÃO COMPATÍVEL COM AZURE)
 * ────────────────────────────────────────────────────────────── */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],

      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com"
      ],

      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",
        "https://cdnjs.cloudflare.com"
      ],

      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "https://cdnjs.cloudflare.com"
      ],

      imgSrc: [
        "'self'",
        "data:",
        "blob:"
      ],

      connectSrc: [
        "'self'",
        "https://fonts.googleapis.com",
        "https://fonts.gstatic.com",
        ...allowedOrigins
      ],

      // Permite abrir blob: URLs em iframes (relatório HTML)
      frameSrc: [
        "'self'",
        "blob:"
      ],

      // Permite blob: em workers (geração do relatório)
      workerSrc: [
        "'self'",
        "blob:"
      ]
    }
  },

  // Azure App Service quebra com COEP ativo
  crossOriginEmbedderPolicy: false,

  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

/* ──────────────────────────────────────────────────────────────
 * HTTPS REDIRECT (SAFE PARA PROXY REVERSO)
 * ────────────────────────────────────────────────────────────── */
export function requireHTTPS(req, res, next) {
  // Health check nunca deve ser redirecionado (evita loop em probe do Azure)
  if (req.path === '/api/health') return next();

  const isProd = process.env.NODE_ENV === 'production';

  // Azure envia x-forwarded-proto
  if (isProd && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(
      301,
      `https://${req.headers.host}${req.originalUrl}`
    );
  }

  next();
}

/* ──────────────────────────────────────────────────────────────
 * IP SEGURO (CORRIGE BUG AZURE / PROXY)
 * ────────────────────────────────────────────────────────────── */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  if (req.socket?.remoteAddress) {
    return req.socket.remoteAddress.replace(/^.*:/, '');
  }

  return 'unknown';
}

/* ──────────────────────────────────────────────────────────────
 * RATE LIMITERS (AZURE-SAFE)
 * ────────────────────────────────────────────────────────────── */

const skipInTest = () => process.env.NODE_ENV === 'test';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  skip: skipInTest,
  message: {
    error: 'Muitas tentativas de login. Tente novamente em 15 minutos.'
  }
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  skip: skipInTest,
  message: {
    error: 'Muitas solicitações de cadastro. Tente novamente mais tarde.'
  }
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  skip: (req) => req.method === 'OPTIONS' || skipInTest(),
  message: {
    error: 'Limite de requisições excedido. Aguarde um momento.'
  }
});

// Stricter limiter for heavy operations (report generation, export)
export const heavyOpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  skip: skipInTest,
  message: {
    error: 'Muitas operações pesadas. Aguarde alguns minutos.'
  }
});

/* ──────────────────────────────────────────────────────────────
 * GLOBAL ERROR HANDLER (NUNCA QUEBRA CORS)
 * ────────────────────────────────────────────────────────────── */
export function globalErrorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.originalUrl}`, err);

  const origin = req.headers.origin;
  const allowed = FRONTEND_URL
    .split(',')
    .map(u => u.trim())
    .filter(Boolean);

  if (!res.headersSent) {
    if (!origin || allowed.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }

  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }

  res.status(500).json({
    error: err.message,
    stack: err.stack
  });
}