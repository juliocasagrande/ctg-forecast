export function dateYear(dateValue) {
  if (!dateValue) return null;

  if (typeof dateValue === 'string') {
    const match = dateValue.match(/^(\d{4})-\d{2}-\d{2}/);
    if (match) return Number(match[1]);
  }

  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? null : date.getFullYear();
}

export function isIacOpenedInYear(iac, year) {
  return dateYear(iac?.opening_date) === year;
}

export function parseDateValue(dateValue) {
  if (!dateValue) return null;

  if (typeof dateValue === 'string') {
    const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }

  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function iacElapsedMonths(iac, now = new Date()) {
  const opened = parseDateValue(iac?.opening_date);
  if (!opened) return null;

  const signed = parseDateValue(iac?.acceptance_letter_signed);
  const end = signed || parseDateValue(now);
  if (!end) return null;

  return Math.max(0, (end.getTime() - opened.getTime()) / (1000 * 60 * 60 * 24 * 30));
}

const IAC_PROJECTED_OPEN_DAYS = 144;

// Used only for the home page average time metric: when the acceptance
// letter hasn't been signed yet, projects the open time to opening_date +
// 144 days instead of today, unless today has already passed that mark.
export function iacElapsedMonthsProjected(iac, now = new Date()) {
  const opened = parseDateValue(iac?.opening_date);
  if (!opened) return null;

  const signed = parseDateValue(iac?.acceptance_letter_signed);
  const today = parseDateValue(now);
  if (!today) return null;

  let end;
  if (signed) {
    end = signed;
  } else {
    const projected = new Date(opened.getTime() + IAC_PROJECTED_OPEN_DAYS * 24 * 60 * 60 * 1000);
    end = today.getTime() > projected.getTime() ? today : projected;
  }

  return Math.max(0, (end.getTime() - opened.getTime()) / (1000 * 60 * 60 * 24 * 30));
}
