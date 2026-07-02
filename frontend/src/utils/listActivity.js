export const CHECKIN_COOLDOWN_MS = 10 * 60 * 1000;

export function getActivityTimestamp(item) {
  const value = item?.last_activity_at || item?.updated_at;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getCheckinRemainingMs(item, nowMs = Date.now()) {
  const lastActivity = getActivityTimestamp(item);
  if (!lastActivity) return 0;
  return Math.max(0, CHECKIN_COOLDOWN_MS - (nowMs - lastActivity.getTime()));
}

export function formatRemainingTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`;
}

export function formatActivityLine(item) {
  const lastActivity = getActivityTimestamp(item);
  if (!lastActivity) return '';
  const action = item?.last_activity_type === 'checkin' ? 'Check-in' : 'Alteracao';
  const user = item?.last_activity_user_name || 'usuario nao identificado';
  const date = lastActivity.toLocaleDateString('pt-BR');
  const time = lastActivity.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${action} por ${user} em ${date} as ${time}`;
}
