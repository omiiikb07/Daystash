import { api } from './api.js';

const now = new Date();
export const state = {
  year: now.getFullYear(), month: now.getMonth() + 1, data: null,                 // the selected month (dashboard)
  historyYear: now.getFullYear(), historyMonth: null, yearData: null,              // History page filters
  loading: true, error: null, busy: false,
  ui: { selectedDate: null, expense: { q: '', category: 'all', status: 'all', sort: 'newest' } },
};
const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);
export const emit = () => listeners.forEach((fn) => fn(state));

let seq = 0; // only the newest request may update the screen, so a slow older response can never overwrite newer data

export async function load() {
  const mine = ++seq;
  state.loading = true; emit();
  try {
    const hm = state.historyMonth ? `&month=${state.historyMonth}` : '';
    const [data, yearData] = await Promise.all([
      api(`/dashboard?year=${state.year}&month=${state.month}`),
      api(`/history/year?year=${state.historyYear}${hm}`),
    ]);
    if (mine !== seq) return;
    state.data = data; state.yearData = yearData; state.error = null;
  } catch (e) {
    if (mine !== seq) return;
    state.error = e.message;
  }
  state.loading = false; emit();
}

export function setMonth(year, month) {
  if (year < 2000 || year > 2100) return;
  state.year = year; state.month = month;
  state.data = null; state.ui.selectedDate = null; // never show one month's figures under another month's heading
  load();
}
export function shiftMonth(delta) {
  let m = state.month + delta; let y = state.year;
  if (m < 1) { m = 12; y -= 1; } else if (m > 12) { m = 1; y += 1; }
  setMonth(y, m);
}
export function setHistory(year, month) {
  state.historyYear = year; state.historyMonth = month || null; state.yearData = null;
  load();
}
