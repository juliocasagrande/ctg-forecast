import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Lê origens permitidas dinamicamente do ambiente
const FRONTEND_URL = process.env.FRONTEND_URL || '';
const BACKEND_URL  = process.env.BACKEND_URL  || '';

const allowedOrigins = [
  "'self'",
  ...FRONTEND_URL.split(',').map(u => u.trim()).filter(Boolean),
  ...BACKEND_URL.split(',').map(u => u.trim()).filter(Boolean),
];

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
      connectSrc: [
        ...allowedOrigins,
        "https://fonts.googleapis.com"
      ],
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

// ─── Global error handler ────────────────────────────────────────────────────
// IMPORTANTE: replica o header CORS na resposta de erro para que o browser
// consiga ler o corpo da resposta mesmo quando há falha (500, 403, etc.).
// Sem isso, o proxy do Railway retorna o erro sem Access-Control-Allow-Origin
// e o browser bloqueia com "CORS policy" antes de mostrar o erro real.
export function globalErrorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err);

  // Replica CORS — middlewares de erro perdem os headers setados pelo cors().
  // Valida origem contra a whitelist antes de ecoar (segurança).
  const origin = req.headers.origin;
  const _allowed = (process.env.FRONTEND_URL || '')
    .split(',').map(u => u.trim()).filter(Boolean);
  const _originOk = !origin || _allowed.length === 0 || _allowed.includes(origin);
  if (origin && _originOk) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }

  // Força Content-Type JSON — sem isso o Railway CDN pode devolver text/plain
  // e o browser bloqueia a leitura do corpo de erro via CORS.
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: 'Erro interno do servidor. Tente novamente.' });
  }

  res.status(500).json({ error: err.message, stack: err.stack });
}