import { inr, fmtDate, esc, MONTHS } from '../format.js';
import { icon } from '../icons.js';
import { state } from '../state.js';

export const RES_LABEL = { rewards: 'covered by Rewards Buffer', targets: 'spread over open days', absorbed: 'accepted', pending: 'decision needed' };

/** Month selector used in page headers (global month for Overview, Expenses, Daily records, Rewards, Settings). */
export function monthSwitch() {
  const opts = MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === state.month ? 'selected' : ''}>${m}</option>`).join('');
  return `<div class="month-switch" role="group" aria-label="Month">
    <button class="btn btn-secondary btn-icon" data-action="prev-month" aria-label="Previous month">${icon('left')}</button>
    <select class="select" data-role="month" aria-label="Month">${opts}</select>
    <input class="input" type="number" min="2000" max="2100" data-role="year" value="${state.year}" aria-label="Year">
    <button class="btn btn-secondary btn-icon" data-action="next-month" aria-label="Next month">${icon('right')}</button></div>`;
}

export function pageHead(title, desc, tools = '') {
  return `<header class="page-head"><div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div><div class="page-tools">${tools}</div></header>`;
}

export function panel({ title = '', sub = '', body, foot = '', cls = '', flush = false, id = '' }) {
  const head = title ? `<div class="panel-head"><h2>${title}</h2>${sub ? `<span class="sub">${sub}</span>` : ''}</div>` : '';
  return `<section class="panel ${flush ? 'panel-flush' : ''} ${cls}" ${id ? `id="${id}"` : ''}>${head}<div class="panel-body">${body}</div>${foot ? `<div class="panel-foot">${foot}</div>` : ''}</section>`;
}

export const emptyState = ({ title, text, button = '' }) => `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p>${button}</div>`;

/** One place that turns a plan day into a state key + label, used by every page. */
export function dayState(day) {
  if (day.status === 'untracked') return { key: 'untracked', label: 'Not tracked', badge: '' };
  if (day.status === 'finalized') {
    if (day.outcome === 'over') return day.resolution === 'pending' ? { key: 'pending', label: 'Needs decision', badge: 'badge-warning' } : { key: 'over', label: 'Over target', badge: 'badge-danger' };
    if (day.outcome === 'exact') return { key: 'exact', label: 'On target', badge: 'badge-success' };
    return { key: 'under', label: 'Under target', badge: 'badge-success' };
  }
  return day.canFinalize ? { key: 'open', label: 'Open', badge: 'badge-violet' } : { key: 'upcoming', label: 'Upcoming', badge: '' };
}

export function expenseRow(e, { actions = true } = {}) {
  return `<tr><td data-label="Date">${fmtDate(e.date, { year: false })}</td>
    <td data-label="Description"><span class="strong">${esc(e.description)}</span>${e.locked ? '<span class="sub">Finalized day</span>' : ''}</td>
    <td data-label="Category">${esc(e.category)}</td><td class="num" data-label="Amount"><span class="strong">${inr(e.amountPaise)}</span></td>
    ${actions ? `<td class="cell-actions"><button class="btn btn-ghost btn-icon btn-sm" data-action="edit-expense" data-id="${e.id}" aria-label="Edit ${esc(e.description)}">${icon('edit', 16)}</button><button class="btn btn-ghost btn-icon btn-sm" data-action="delete-expense" data-id="${e.id}" aria-label="Delete ${esc(e.description)}">${icon('trash', 16)}</button></td>` : ''}</tr>`;
}

export const expenseTable = (rows, { actions = true } = {}) => `<table class="table stack-rows"><colgroup><col style="width:${actions ? 14 : 16}%"><col style="width:${actions ? 36 : 40}%"><col style="width:${actions ? 18 : 22}%"><col style="width:${actions ? 18 : 22}%">${actions ? '<col style="width:14%">' : ''}</colgroup>
  <thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th>${actions ? '<th><span class="sr-only">Actions</span></th>' : ''}</tr></thead><tbody>${rows.map((e) => expenseRow(e, { actions })).join('')}</tbody></table>`;
