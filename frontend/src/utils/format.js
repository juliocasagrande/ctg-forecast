export const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
export const MONTHS_FULL_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
export const CATEGORIES = ['Viagens','Contratos','POs'];
export const CATEGORY_ICONS = { Viagens:'VGS', Contratos:'CTR', POs:'POs' };

export function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', minimumFractionDigits:2 }).format(parseFloat(value)||0);
}
export function formatBRLShort(value) {
  const v = parseFloat(value)||0;
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v/1_000_000).toFixed(2).replace('.',',')}M`;
  if (Math.abs(v) >= 1_000)     return `R$ ${(v/1_000).toFixed(1).replace('.',',')}k`;
  return formatBRL(v);
}
export function getYearsFromEntries(entries) {
  const yrs = [...new Set((entries||[]).map(e => parseInt(e.year)))].sort();
  return yrs.length ? yrs : [new Date().getFullYear()];
}
export function sumEntries(entries, type, year) {
  return (entries||[]).filter(e => e.type===type && parseInt(e.year)===parseInt(year)).reduce((s,e)=>s+parseFloat(e.value||0),0);
}
