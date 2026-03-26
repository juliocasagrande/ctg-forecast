import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// URLs permitidas — lidas do ambiente para não hardcodar domínios
const FRONTEND_URL  = process.env.FRONTEND_URL  || '';
const BACKEND_URL   = process.env.BACKEND_URL   || '';

// Monta a lista de origens permitidas no connectSrc (filtra strings vazias)
const connectSrc = ["'self'", FRONTEND_URL, BACKEND_URL].filter(Boolean);

// ─── Helmet: security headers (CSP, HSTS, X-Frame-Options, etc.) ────────────
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'",
                   "https://cdn.jsdelivr.net",
                   "https://cdnjs.cloudflare.com"],   // Font Awesome usado no monthly-report
      styleSrc:   ["'self'", "'unsafe-inline'",
                   "https://fonts.googleapis.com",
                   "https://cdnjs.cloudflare.com"],   // Font Awesome CSS
      fontSrc:    ["'self'",
                   "https://fonts.gstatic.com",
                   "https://cdnjs.cloudflare.com"],   // Font Awesome woff2
      imgSrc:     ["'self'", "data:", "blob:"],
      connectSrc,                                      // 'self' + frontend + backend
    },
  },
  crossOriginEmbedderPolicy: false, // permite carregar fontes/scripts externos
  hsts: {
    maxAge: 31536000,       // 1 ano
    includeSubDomains: true,
    preload: true,
  },
});

// ─── HTTPS redirect (Railway seta x-forwarded-proto) ─────────────────────────
export function requireHTTPS(req, res, next) {
  if (
    process.env.NODE_ENV === 'production' &&
    req.headers['x-forwarded-proto'] !== 'https'
  ) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
}

// ─── Rate limiters ───────────────────────────────────────────────────────────

// Login: máx 10 tentativas por 15 minutos por IP
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  keyGenerator: (req) => req.ip,
});

// Cadastro: máx 5 por hora por IP
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas solicitações de cadastro. Tente novamente mais tarde.' },
});

// API geral: 200 requisições por minuto
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de requisições excedido. Aguarde um momento.' },
});

// ─── Global error handler (sanitiza erros em produção) ───────────────────────
export function globalErrorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err);

  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: 'Erro interno do servidor. Tente novamente.' });
  }

  res.status(500).json({ error: err.message, stack: err.stack });
}