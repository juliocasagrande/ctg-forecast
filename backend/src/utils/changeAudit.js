const NUMERIC_FIELDS = /(^|_)(value|percent|weight|year|month|number|quantity|count|progress|revision|order)$/;

function auditValue(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 2000);
  if (NUMERIC_FIELDS.test(field) && String(value).trim() !== '' && Number.isFinite(Number(value))) {
    return String(Number(value));
  }
  return String(value).slice(0, 2000);
}

export function buildChangeDetails(fields, before, after) {
  return fields.map(([field, label]) => ({
    field,
    label,
    old_value: auditValue(before?.[field], field),
    new_value: auditValue(after?.[field], field),
  })).filter(item => item.old_value !== item.new_value);
}

export function setTelemetryChange(res, { fields, before = null, after = null, recordLabel }) {
  res.locals.telemetryChange = {
    recordLabel: String(recordLabel || `Registro #${after?.id || before?.id || 'não identificado'}`).slice(0, 240),
    changes: buildChangeDetails(fields, before, after),
  };
}
