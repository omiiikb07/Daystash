import { inr, inrShort, fmtDate, esc, MONTHS } from '../format.js';
import { state } from '../state.js';
import { icon } from '../icons.js';
import { panel, pageHead, monthSwitch, dayState, RES_LABEL } from './common.js';

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function selected(d) {
  const cur = state.ui.selectedDate;
  if (cur && d.plan.days.some((x) => x.date === cur)) return cur;
  const pick = d.isCurrentMonth ? d.today : (d.plan.days.find((x) => x.actualPaise > 0) || d.plan.days[0]).date;
  state.ui.selectedDate = pick; return pick;
}

function calendar(d, sel) {
  const offset = (new Date(d.year, d.month - 1, 1).getDay() + 6) % 7; // Monday first
  const cells = d.plan.days.map((day) => {
    const s = dayState(day); const spend = day.actualPaise > 0;
    const label = `${fmtDate(day.date, { weekday: true })}: spent ${inr(day.actualPaise)}${day.status === 'untracked' ? ', not tracked' : `, target ${inr(day.targetPaise)}`}, ${s.label.toLowerCase()}`;
    return `<button class="cal-cell ${s.key} ${day.status === 'finalized' ? 'finalized' : ''} ${spend ? 'has-spend' : ''} ${day.date === d.today ? 'today' : ''} ${day.date === sel ? 'selected' : ''}" data-action="select-day" data-date="${day.date}" aria-pressed="${day.date === sel}" aria-label="${esc(label)}">
      <span class="dn">${Number(day.date.slice(8))}</span><span class="cs">${spend ? inrShort(day.actualPaise) : ''}</span><span class="dot"></span></button>`;
  });
  return `<div class="cal-head" aria-hidden="true">${WEEK.map((w) => `<span>${w}</span>`).join('')}</div>
    <div class="cal">${'<span class="cal-blank"></span>'.repeat(offset)}${cells.join('')}</div>
    <div class="cal-legend" aria-hidden="true"><span><i style="background:var(--success)"></i>Finalized, within target</span><span><i style="background:var(--danger)"></i>Finalized, over target</span><span><i style="background:var(--warning)"></i>Needs decision</span><span><i style="border:1.5px solid var(--text-3)"></i>Open with spending</span><span><i style="background:var(--violet-soft);border-radius:1px;height:2px;width:12px"></i>Today</span></div>`;
}

function detail(d, sel) {
  const day = d.plan.days.find((x) => x.date === sel); const s = dayState(day); const fin = day.status === 'finalized';
  const exp = d.expenses.filter((e) => e.date === sel);
  const pc = day.percentOfTarget; const cls = pc > 100 ? 'bad' : pc >= 85 ? 'warn' : '';
  let note = ''; let actions = '';
  if (fin) {
    note = day.outcome === 'under' ? `<div class="outcome pos">${day.rewardPaise > 0 ? `${inr(day.rewardPaise)} was added to your Rewards Buffer.` : 'Finalized under target.'}</div>`
      : day.outcome === 'exact' ? '<div class="outcome pos">Finalized exactly on target.</div>' : `<div class="outcome neg">Over target by ${inr(day.overspendPaise)} · ${RES_LABEL[day.resolution]}.</div>`;
    actions = `<button class="btn btn-secondary" data-action="reopen" data-date="${sel}">Reopen day</button>`;
  } else if (day.status === 'untracked') {
    note = `<div class="outcome">Before this month's tracking start day (${d.plan.startDay}), so this day has no target and cannot be finalized.</div>`;
  } else if (day.canFinalize) {
    const t = day.projectedOutcome;
    note = `<div class="outcome ${t === 'over' ? 'neg' : t === 'under' && day.projectedRewardPaise > 0 ? 'pos' : ''}">${t === 'under' ? (day.projectedRewardPaise > 0 ? `Finalizing would add ${inr(day.projectedRewardPaise)} to your Rewards Buffer.` : 'Under target. No reward without spending.') : t === 'exact' ? 'Exactly on target. Finalizing earns no reward.' : `Over target by ${inr(day.projectedOverspendPaise)}. You would choose how to settle it.`}</div>`;
    actions = `<button class="btn btn-primary" data-action="finalize" data-date="${sel}">Finalize day</button>`;
  } else {
    note = `<div class="outcome">${d.plan.hasBudget ? 'This day has not started yet, so it cannot be finalized.' : 'Set a budget for this month to get daily targets.'}</div>`;
  }
  const list = exp.length ? `<div class="rows">${exp.map((e) => `<div><span class="what"><strong>${esc(e.description)}</strong><small>${esc(e.category)}</small></span><span style="display:flex;align-items:center;gap:4px"><b>${inr(e.amountPaise)}</b>
      <button class="btn btn-ghost btn-icon btn-sm" data-action="edit-expense" data-id="${e.id}" aria-label="Edit ${esc(e.description)}">${icon('edit', 16)}</button><button class="btn btn-ghost btn-icon btn-sm" data-action="delete-expense" data-id="${e.id}" aria-label="Delete ${esc(e.description)}">${icon('trash', 16)}</button></span></div>`).join('')}</div>`
    : '<p class="muted" style="font-size:var(--fs-sm)">No expenses on this day.</p>';
  return panel({ title: `<span class="day-title">${fmtDate(sel, { weekday: true })}</span>`, sub: `<span class="badge ${s.badge}">${s.label}</span>`, cls: 'day-detail', body: `
    <dl class="today-nums" style="grid-template-columns:repeat(3,1fr)"><div><dt>${fin ? 'Target used' : 'Target'}</dt><dd>${day.status === 'untracked' ? '—' : inr(day.targetPaise)}</dd></div><div><dt>Spent</dt><dd>${inr(day.actualPaise)}</dd></div>
      <div><dt>${day.differencePaise >= 0 ? 'Remaining' : 'Over by'}</dt><dd class="${day.differencePaise < 0 ? 'neg' : ''}">${day.status === 'untracked' ? '—' : inr(Math.abs(day.differencePaise))}</dd></div></dl>
    ${day.status === 'untracked' ? '' : `<div class="progress ${cls}" role="progressbar" aria-label="Share of target spent" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, pc)}"><i style="width:${Math.min(100, pc)}%"></i></div>`}
    ${note}<div class="btn-stack">${actions}<button class="btn btn-secondary" data-action="add-expense" data-date="${sel}" ${fin ? 'disabled title="Reopen this day to add expenses"' : ''}>${icon('plus', 16)}Add expense for this day</button></div>
    <div class="day-exp"><h3 class="eyebrow" style="margin-bottom:var(--s-2)">Expenses</h3>${list}</div>` });
}

export function days(d) {
  const sel = selected(d); const p = d.plan;
  const adj = d.adjustments.filter((a) => !a.reversed);
  const rules = `${inr(p.poolPaise)} left to plan ÷ ${p.openDays} open day${p.openDays === 1 ? '' : 's'}${p.untrackedDays ? ` · ${p.untrackedDays} earlier day${p.untrackedDays === 1 ? ' is' : 's are'} not tracked` : ''}`;
  const adjPanel = d.adjustments.length ? panel({ title: 'Target adjustments', sub: 'Created when you lower future targets to absorb an overspend', flush: true, cls: 's12', body: `<table class="table stack-rows"><thead><tr><th>Overspend on</th><th class="num">Amount</th><th class="num">Open days sharing it</th><th class="num">Target before</th><th class="num">Target after</th></tr></thead><tbody>
    ${d.adjustments.map((a) => `<tr><td data-label="Overspend on"><span class="strong">${fmtDate(a.date, { weekday: true, year: false })}</span>${a.reversed ? '<span class="sub">Reversed</span>' : ''}</td><td class="num" data-label="Amount">${inr(a.amountPaise)}</td><td class="num" data-label="Open days sharing it">${a.eligibleDays}</td><td class="num" data-label="Target before">${inr(a.targetBeforePaise)}</td><td class="num" data-label="Target after">${inr(a.targetAfterPaise)}</td></tr>`).join('')}</tbody></table>` }) : '';
  return `${pageHead('Daily records', `${MONTHS[d.month - 1]} ${d.year} · ${rules}`, monthSwitch())}
    <div class="g12">${panel({ title: 'Calendar', sub: adj.length ? 'Open-day targets include an overspend adjustment' : 'Select a day to see its details', cls: 's7', body: calendar(d, sel) })}
    <div class="s5" style="display:grid">${detail(d, sel)}</div>${adjPanel}</div>`;
}
