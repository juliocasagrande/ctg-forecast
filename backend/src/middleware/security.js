import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// ─── Helmet: security headers (CSP, HSTS, X-Frame-Options, etc.) ────────────
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // allows loading external fonts/scripts
  hsts: {
    maxAge: 31536000,       // 1 year
    includeSubDomains: true,
    preload: true,
  },
});

// ─── HTTPS redirect (Railway sets x-forwarded-proto) ─────────────────────────
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

// Login: max 5 attempts per 15 minutes per IP
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  keyGenerator: (req) => req.ip,
});

// Register: max 5 per hour per IP
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas solicitações de cadastro. Tente novamente mais tarde.' },
});

// General API: 200 requests per minute
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de requisições excedido. Aguarde um momento.' },
});

// ─── Global error handler (sanitizes errors in production) ───────────────────
export function globalErrorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err);

  // Known operational errors
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  // In production, never leak error details
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: 'Erro interno do servidor. Tente novamente.' });
  }

  // In dev, show details for debugging
  res.status(500).json({ error: err.message, stack: err.stack });
}
