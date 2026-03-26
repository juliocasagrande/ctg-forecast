import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// ─── Helmet: security headers (CSP, HSTS, X-Frame-Options, etc.) ────────────
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'",
                   "https://cdn.jsdelivr.net",
                   "https://cdnjs.cloudflare.com"],
      styleSrc:   ["'self'", "'unsafe-inline'",
                   "https://fonts.googleapis.com",
                   "https://cdnjs.cloudflare.com"],
      fontSrc:    ["'self'",
                   "https://fonts.gstatic.com",
                   "https://cdnjs.cloudflare.com"],
      imgSrc:     ["'self'", "data:", "blob:"],
      connectSrc: ["'self'",
                   "https://backend-forecast.up.railway.app",
                   "https://ctg-forecast-forecast.up.railway.app"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
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

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  keyGenerator: (req) => req.ip,
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas solicitações de cadastro. Tente novamente mais tarde.' },
});

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