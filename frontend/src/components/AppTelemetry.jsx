import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../utils/api.js';
import { startTelemetrySession } from '../utils/telemetry.js';

const HEARTBEAT_MS = 30_000;
const IDLE_AFTER_MS = 2 * 60_000;

export default function AppTelemetry({ user }) {
  const location = useLocation();
  const sessionIdRef = useRef(null);
  const activeSecondsRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const startPromiseRef = useRef(Promise.resolve());

  useEffect(() => {
    const sessionId = startTelemetrySession(user.id);
    sessionIdRef.current = sessionId;
    activeSecondsRef.current = 0;
    lastActivityRef.current = Date.now();

    startPromiseRef.current = api.post('/telemetry/sessions/start', {
      session_id: sessionId,
      page_path: window.location.pathname,
    }).catch(() => {});

    const markActive = () => { lastActivityRef.current = Date.now(); };
    const activityEvents = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach(name => window.addEventListener(name, markActive, { passive: true }));

    const heartbeat = () => {
      if (!sessionIdRef.current) return;
      if (document.visibilityState === 'visible' && Date.now() - lastActivityRef.current < IDLE_AFTER_MS) {
        activeSecondsRef.current += HEARTBEAT_MS / 1000;
      }
      api.post('/telemetry/sessions/heartbeat', {
        session_id: sessionIdRef.current,
        active_seconds: activeSecondsRef.current,
        page_path: window.location.pathname,
      }).catch(() => {});
    };

    const reportWindowError = event => {
      const message = event?.error?.message || event?.message || 'Erro JavaScript sem detalhes';
      api.post('/telemetry/client-errors', {
        session_id: sessionIdRef.current,
        page_path: window.location.pathname,
        source: 'javascript',
        message,
      }).catch(() => {});
    };
    const reportPromiseError = event => {
      const reason = event?.reason;
      // Erros HTTP já são mensurados no servidor e não devem ser duplicados aqui.
      if (reason?.isAxiosError) return;
      api.post('/telemetry/client-errors', {
        session_id: sessionIdRef.current,
        page_path: window.location.pathname,
        source: 'promise',
        message: reason?.message || String(reason || 'Promise rejeitada sem detalhes'),
      }).catch(() => {});
    };

    const timer = setInterval(heartbeat, HEARTBEAT_MS);
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') heartbeat(); };
    window.addEventListener('error', reportWindowError);
    window.addEventListener('unhandledrejection', reportPromiseError);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(timer);
      heartbeat();
      activityEvents.forEach(name => window.removeEventListener(name, markActive));
      window.removeEventListener('error', reportWindowError);
      window.removeEventListener('unhandledrejection', reportPromiseError);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [user.id]);

  useEffect(() => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    startPromiseRef.current.then(() => api.post('/telemetry/page-views', {
      session_id: sessionId,
      page_path: location.pathname,
    }).catch(() => {}));
  }, [location.pathname]);

  return null;
}

