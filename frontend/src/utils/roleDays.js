// Espelha a lógica de backend/src/routes/lists.js (roleDaysResolver) para que o
// frontend calcule o mesmo prazo por cargo usado na escalada dos alarmes do sino
// (AlertBell) — usado para sincronizar a bolinha piscante das tabelas com o
// prazo configurado por cargo em Configurações.

// Cargo "efetivo" para fins de alerta: se um gestor está usando o modo de
// acesso (visualizando como outro cargo), o alerta segue o cargo real do
// usuário logado, não o cargo do modo de visualização.
export function getAlertRole(user) {
  if (!user) return undefined;
  return user._managerAccessOverride ? user.role : (user._originalRole || user.role);
}

// Lê um mapa JSON {cargo: dias} de settings (chave `jsonKey`), com fallback
// para o valor numérico global (`globalKey`) e por fim para `defaultDays`.
export function resolveRoleDays(settings, jsonKey, globalKey, defaultDays, role) {
  let map = {};
  try { map = JSON.parse((settings || {})[jsonKey] || '{}'); } catch { map = {}; }
  const globalDays = parseInt((settings || {})[globalKey]);
  const fallback = !isNaN(globalDays) && globalDays > 0 ? globalDays : defaultDays;
  const v = parseInt(map[role]);
  return !isNaN(v) && v > 0 ? v : fallback;
}
