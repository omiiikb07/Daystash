// Display formatting only. No financial rules live in the frontend.
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Health', 'Entertainment', 'Education', 'Other'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const pad = (n) => String(n).padStart(2, '0');

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Integer paise -> "₹12,34,567.89" (Indian grouping)
export function inr(paise) {
  if (paise === null || paise === undefined) return '—';
  const neg = paise < 0; const a = Math.abs(paise);
  const r = String(Math.floor(a / 100)); const last3 = r.slice(-3); const rest = r.slice(0, -3);
  const g = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
  return `${neg ? '-' : ''}₹${g}.${pad(a % 100)}`;
}

// User text -> integer paise, or null if it is not a valid positive amount with at most 2 decimals.
export function parseRupees(text) {
  const s = String(text).trim().replace(/,/g, '').replace(/^₹/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [r, p = ''] = s.split('.');
  const paise = Number(r) * 100 + Number((p + '00').slice(0, 2));
  return paise > 0 && paise <= 1_000_000_000 ? paise : null;
}

const parts = (d) => d.split('-').map(Number);
export function fmtDate(d, { weekday = false, year = true } = {}) {
  const [y, m, day] = parts(d);
  const base = `${day} ${MONTHS[m - 1].slice(0, 3)}${year ? ' ' + y : ''}`;
  return weekday ? `${WEEKDAYS[new Date(y, m - 1, day).getDay()]}, ${base}` : base;
}

export const inrShort = (paise) => inr(paise).replace(/\.00$/, '');
