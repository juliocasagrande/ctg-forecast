import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// ─── Origens permitidas ───────────────────────────────────────────────
const FRONTEND_URL = process.env.FRONTEND_URL || '';
const BACKEND_URL  = process.env.BACKEND_URL  || '';

const allowedOrigins = [
  ...FRONTEND_URL.split(',').map(u => u.trim()).filter(Boolean),
  ...BACKEND_URL.split(',').map(u => u.trim()).filter(Boolean),
];

// ─── Helmet (CSP corrigido) ───────────────────────────────────────────
export const securityHeaders = helmet({
  contentSecurityPolicy: {
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
        ...allowedOrigins,
        "https://fonts.googleapis.com",
        "https://fonts.gstatic.com"
      ]
    },
  },

  crossOriginEmbedderPolicy: false,

  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// ─── HTTPS redirect ───────────────────────────────────────────────────
export function requireHTTPS(req, res, next) {
  if (
    process.env.NODE_ENV === 'production' &&
    req.headers['x-forwarded-proto'] !== 'https'
  ) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
}

// ─── Função segura de IP (corrige Azure proxy bug) ─────────────────────
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  if (req.ip) {
    return req.ip.replace(/^.*:/, ''); // remove ::ffff:
  }

  return 'unknown';
}

// ─── Rate limiters (CORRIGIDO) ────────────────────────────────────────

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  keyGenerator: (req) => getClientIp(req),
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas solicitações de cadastro. Tente novamente mais tarde.' },
  keyGenerator: (req) => getClientIp(req),
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de requisições excedido. Aguarde um momento.' },
  keyGenerator: (req) => getClientIp(req),
});

// ─── Global error handler ─────────────────────────────────────────────
export function globalErrorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err);

  const origin = req.headers.origin;
  const allowed = (process.env.FRONTEND_URL || '')
    .split(',')
    .map(u => u.trim())
    .filter(Boolean);

  const originOk =
    !origin ||
    allowed.length === 0 ||
    allowed.includes(origin);

  if (origin && originOk) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }

  res.status(500).json({ error: err.message, stack: err.stack });
}