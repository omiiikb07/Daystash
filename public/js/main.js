import { state, subscribe, load, setMonth, setHistory } from './state.js';
import { MONTHS, CATEGORIES } from './format.js';
import { ROUTE_ICONS } from './icons.js';
import { initDialogs, initTooltips, closeDialog, toast } from './ui.js';
import { dispatch, bindForms } from './actions.js';
import { banners } from './views/banners.js';
import { overview } from './views/overview.js';
import { expenses, expenseResults } from './views/expenses.js';
import { days } from './views/days.js';
import { rewards } from './views/rewards.js';
import { history } from './views/history.js';
import { settings } from './views/settings.js';

const ROUTES = {
  overview: { label: 'Overview', short: 'Overview', icon: 'overview', render: (d) => overview(d) },
  expenses: { label: 'Expenses', short: 'Expenses', icon: 'expenses', render: (d) => expenses(d) },
  days: { label: 'Daily Records', short: 'Daily', icon: 'days', render: (d) => days(d) },
  rewards: { label: 'Rewards Buffer', short: 'Rewards', icon: 'rewards', render: (d) => rewards(d) },
  history: { label: 'History', short: 'History', icon: 'history', render: (d, s) => history(d, s.yearData) },
  settings: { label: 'Settings', short: 'Settings', icon: 'settings', render: (d) => settings(d) },
};
const $ = (s) => document.querySelector(s);
const currentRoute = () => { const r = location.hash.replace(/^#\//, '').split('?')[0]; return ROUTES[r] ? r : 'overview'; };

let lastRoute = null; let hadData = false; let enterTimer;

function renderNav(route) {
  const link = (key, v, text) => `<a href="#/${key}" ${key === route ? 'aria-current="page"' : ''}>${ROUTE_ICONS[v.icon]}<span>${text}</span></a>`;
  $('#nav').innerHTML = Object.entries(ROUTES).map(([k, v]) => link(k, v, v.label)).join('');
  $('#tabbar').innerHTML = Object.entries(ROUTES).map(([k, v]) => link(k, v, v.short)).join('');
}

function render() {
  const { data, error, year, month } = state;
  const route = currentRoute(); const view = $('#view');
  renderNav(route);
  document.title = `${ROUTES[route].label} · ${MONTHS[month - 1]} ${year} · Daystash`;
  $('#banners').innerHTML = banners(data, error);
  if (!data) {
    view.innerHTML = error ? '' : '<div class="skeleton" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i></div>';
    hadData = false; return;
  }
  const entering = route !== lastRoute || !hadData; // animate pages and charts only when arriving, not after every action
  const active = document.activeElement; const keepFocus = active && active.matches && active.matches('[data-filter="q"]');
  view.innerHTML = ROUTES[route].render(data, state);
  if (entering) {
    view.classList.remove('page-in', 'is-entering'); void view.offsetWidth; view.classList.add('page-in', 'is-entering');
    clearTimeout(enterTimer); enterTimer = setTimeout(() => view.classList.remove('page-in', 'is-entering'), 900);
  }
  if (keepFocus) { const q = view.querySelector('[data-filter="q"]'); if (q) q.focus(); }
  lastRoute = route; hadData = true;
  if (state.focusBanner) { state.focusBanner = false; $('#banners').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
}

function init() {
  $('#expCat').innerHTML = CATEGORIES.map((c) => `<option>${c}</option>`).join('');
  initDialogs(); initTooltips(); bindForms();
  document.addEventListener('click', (ev) => {
    const close = ev.target.closest('[data-close]');
    if (close) { closeDialog(close.closest('dialog')); return; }
    const el = ev.target.closest('[data-action]');
    if (el && !el.disabled) dispatch(el);
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target; const role = t.dataset && t.dataset.role;
    if (role === 'month') setMonth(state.year, Number(t.value));
    else if (role === 'year') {
      const y = Number(t.value);
      if (Number.isInteger(y) && y >= 2000 && y <= 2100) setMonth(y, state.month);
      else { t.value = state.year; toast('Year must be between 2000 and 2100.', 'error'); }
    } else if (role === 'hist-year') setHistory(Number(t.value), state.historyMonth);
    else if (role === 'hist-month') setHistory(state.historyYear, t.value ? Number(t.value) : null);
  });
  document.addEventListener('input', (ev) => {
    const f = ev.target.dataset && ev.target.dataset.filter;
    if (!f || !state.data) return;
    state.ui.expense[f] = ev.target.value;
    const box = document.getElementById('expenseResults');
    if (box) box.innerHTML = expenseResults(state.data); // only the results change, so the search box keeps focus
  });
  window.addEventListener('hashchange', () => { render(); $('#view').focus({ preventScroll: true }); window.scrollTo(0, 0); });
  subscribe(render);
  render();
  load();
}
init();
