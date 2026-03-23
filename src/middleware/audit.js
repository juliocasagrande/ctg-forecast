import { pool } from '../db/schema.js';

/**
 * Logs authentication events (login success/failure, password changes, etc.)
 * Table: audit_log (created in schema.js migration)
 */
export async function logAuthEvent(event, { email, userId, ip, userAgent, success, detail }) {
  try {
    await pool.query(
      `INSERT INTO audit_log (event, email, user_id, ip_address, user_agent, success, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [event, email || null, userId || null, ip || null, userAgent || null, success, detail || null]
    );
  } catch (err) {
    // Audit logging should never break the main flow
    console.error('[AUDIT] Falha ao registrar evento:', err.message);
  }
}

/**
 * Extract client IP from request (Railway uses x-forwarded-for)
 */
export function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
