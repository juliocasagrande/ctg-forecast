/**
 * testApp.js — Singleton do Express para testes.
 * Rate-limiting desativado; HTTPS redirect não dispara (NODE_ENV=test).
 */
import { createApp } from '../../src/app.js';

let _app;

export function getTestApp() {
  if (!_app) {
    _app = createApp({ disableRateLimit: true });
  }
  return _app;
}
