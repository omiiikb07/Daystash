import { inr, MONTHS } from '../format.js';
import { icon } from '../icons.js';
import { state } from '../state.js';
import { panel, pageHead, emptyState, monthSwitch, expenseTable } from './common.js';

const SORTS = { newest: 'Newest first', oldest: 'Oldest first', high: 'Amount: high to low', low: 'Amount: low to high' };

export function filterExpenses(list, f) {
  const q = f.q.trim().toLowerCase();
  const out = list.filter((e) => (!q || e.description.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
    && (f.category === 'all' || e.category === f.category) && (f.status === 'all' || (f.status === 'finalized' ? e.locked : !e.locked)));
  const by = { newest: (a, b) => b.date.localeCompare(a.date) || b.id - a.id, oldest: (a, b) => a.date.localeCompare(b.date) || a.id - b.id, high: (a, b) => b.amountPaise - a.amountPaise, low: (a, b) => a.amountPaise - b.amountPaise }[f.sort];
  return out.sort(by);
}

/** The results area only: re-rendered on every keystroke so the search box keeps focus. */
export function expenseResults(d) {
  const f = state.ui.expense; const rows = filterExpenses(d.expenses, f);
  const total = rows.reduce((s, e) => s + e.amountPaise, 0);
  if (!d.expenses.length) return emptyState({ title: 'No expenses this month', text: 'Log an expense and it counts toward the day it is dated. Expenses dated in other months appear under those months.', button: '<button class="btn btn-primary" data-action="add-expense">Add expense</button>' });
  if (!rows.length) return emptyState({ title: 'No expenses match', text: 'Try a different search or clear the filters.', button: '<button class="btn btn-secondary" data-action="clear-filters">Clear filters</button>' });
  return `${expenseTable(rows)}<div class="tbl-foot"><span>${rows.length === d.expenses.length ? `${rows.length} expense${rows.length === 1 ? '' : 's'}` : `${rows.length} of ${d.expenses.length} expenses`}</span><strong>${inr(total)}</strong></div>`;
}

export function expenses(d) {
  const f = state.ui.expense;
  const cats = [...new Set(d.expenses.map((e) => e.category))].sort();
  if (f.category !== 'all' && !cats.includes(f.category)) f.category = 'all';
  const opt = (v, label, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  const toolbar = `<div class="toolbar" role="search">
    <label class="input-affix"><span class="sr-only">Search expenses</span>${icon('search', 16)}<input class="input" type="search" data-filter="q" placeholder="Search description or category" value="${f.q.replace(/"/g, '&quot;')}" autocomplete="off"></label>
    <label><span class="sr-only">Category</span><select class="select" data-filter="category">${opt('all', 'All categories', f.category)}${cats.map((c) => opt(c, c, f.category)).join('')}</select></label>
    <label><span class="sr-only">Day status</span><select class="select" data-filter="status">${opt('all', 'All days', f.status)}${opt('open', 'Open days', f.status)}${opt('finalized', 'Finalized days', f.status)}</select></label>
    <label><span class="sr-only">Sort</span><select class="select" data-filter="sort">${Object.entries(SORTS).map(([k, v]) => opt(k, v, f.sort)).join('')}</select></label></div>`;
  return `${pageHead('Expenses', `Every expense dated in ${MONTHS[d.month - 1]} ${d.year}`, `${monthSwitch()}<button class="btn btn-primary" data-action="add-expense">${icon('plus', 16)}Add expense</button>`)}
    <section class="panel panel-flush">${toolbar}<div class="panel-body" id="expenseResults" aria-live="polite">${expenseResults(d)}</div>
    ${d.expenses.some((e) => e.locked) ? '<div class="panel-foot">Expenses on a finalized day are locked. Editing or deleting one asks you to reopen that day first, which reverses its reward or overspend resolution.</div>' : ''}</section>`;
}
