const CURRENT_SESSION_KEY = 'ctg_telemetry_session';

function fallbackUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getTelemetrySessionId() {
  try { return sessionStorage.getItem(CURRENT_SESSION_KEY); }
  catch { return null; }
}

export function startTelemetrySession(userId) {
  try {
    const userKey = `${CURRENT_SESSION_KEY}_${userId}`;
    let id = sessionStorage.getItem(userKey);
    if (!id) {
      id = globalThis.crypto?.randomUUID?.() || fallbackUuid();
      sessionStorage.setItem(userKey, id);
    }
    sessionStorage.setItem(CURRENT_SESSION_KEY, id);
    return id;
  } catch {
    return globalThis.crypto?.randomUUID?.() || fallbackUuid();
  }
}

