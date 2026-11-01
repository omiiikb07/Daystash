import { inr, fmtDate, esc, MONTHS } from '../format.js';
import { icon } from '../icons.js';
import { calendarIllustration } from '../illustrations.js';
import { dailyChart, categoryBreakdown } from '../chart.js';
import { panel, pageHead, emptyState, monthSwitch, expenseTable } from './common.js';

const addBtn = '<button class="btn btn-primary" data-action="add-expense">' + icon('plus', 16) + 'Add expense</button>';

function featured(d) {
  const { budget: b, totals: t, plan: p } = d;
  if (!b) {
    return `<section class="panel featured s8"><div><span class="eyebrow">Monthly budget</span><p class="display faint">Not set</p>
      <p class="muted" style="max-width:46ch;margin-bottom:var(--s-4)">Set a budget for ${MONTHS[d.month - 1]} and Daystash turns it into a daily spending target. Then log expenses, finalize each day and build your Rewards Buffer.</p>
      <button class="btn btn-primary" data-action="edit-budget">Set monthly budget</button></div><div class="featured-art">${calendarIllustration()}</div></section>`;
  }
  const cls = t.overspentPaise > 0 ? 'bad' : t.percentUsed >= 85 ? 'warn' : '';
  const pct = Math.min(100, t.percentUsed);
  return `<section class="panel featured s8"><div>
    <span class="eyebrow">Monthly budget · ${MONTHS[d.month - 1]} ${d.year}</span>
    <p class="display">${inr(b.amountPaise)}</p>
    <div class="progress ${cls}" role="progressbar" aria-label="Budget used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
    <div class="util-meta"><span>${t.percentUsed}% of budget used</span><span>${p.startDay > 1 ? `Tracked from day ${p.startDay}` : `${p.daysInMonth} days`} · ${inr(p.initialTargetPaise)} a day to start</span></div>
    <dl class="pair"><div><dt>Spent</dt><dd>${inr(t.spentPaise)}</dd></div><div><dt>${t.overspentPaise > 0 ? 'Over budget by' : 'Remaining'}</dt><dd class="${t.overspentPaise > 0 ? 'neg' : ''}">${inr(t.overspentPaise > 0 ? t.overspentPaise : t.remainingPaise)}</dd></div></dl>
    <button class="btn btn-secondary btn-sm" data-action="edit-budget">${icon('edit', 15)}Edit budget</button></div>
    <div class="featured-art">${calendarIllustration()}</div></section>`;
}

function today(d) {
  if (!d.isCurrentMonth) {
    return panel({ title: `Viewing ${MONTHS[d.month - 1]} ${d.year}`, cls: 's4', body: `<p class="muted">This is not the current month. Finalize days from Daily records, or return to the present.</p>
      <div class="btn-stack"><button class="btn btn-primary" data-action="this-month">Go to current month</button><a class="btn btn-secondary" href="#/days">Open daily records</a></div>` });
  }
  const td = d.todayDay; const title = fmtDate(td.date, { weekday: true });
  if (td.status === 'untracked') {
    return panel({ title: `Today · ${title}`, cls: 's4', body: `<p class="muted">Tracking for this month starts on day ${d.plan.startDay}, so today has no target. Change the start day in Settings if that is wrong.</p>` });
  }
  const fin = td.status === 'finalized';
  const pc = td.percentOfTarget; const cls = pc > 100 ? 'bad' : pc >= 85 ? 'warn' : '';
  const badge = fin ? '<span class="badge badge-success">Finalized</span>' : pc > 100 ? '<span class="badge badge-danger">Over target</span>' : pc >= 85 ? '<span class="badge badge-warning">Close to target</span>' : '<span class="badge badge-violet">On track</span>';
  let outcome; let buttons;
  if (fin) {
    const txt = td.outcome === 'under' ? `Finalized. ${td.rewardPaise > 0 ? `${inr(td.rewardPaise)} was added to your Rewards Buffer.` : 'Under target.'}` : td.outcome === 'exact' ? 'Finalized. Exactly on target.'
      : `Finalized. Over target by ${inr(td.overspendPaise)} (${td.resolution === 'pending' ? 'decision needed above' : td.resolution === 'rewards' ? 'covered by Rewards Buffer' : td.resolution === 'targets' ? 'spread over open days' : 'accepted'}).`;
    outcome = `<div class="outcome ${td.outcome === 'over' ? 'neg' : 'pos'}">${txt}</div>`;
    buttons = `<button class="btn btn-secondary" data-action="reopen" data-date="${td.date}">Reopen day</button><button class="btn btn-ghost" data-action="add-expense" data-date="${td.date}">Add expense</button>`;
  } else {
    const t = td.projectedOutcome;
    const txt = t === 'under' ? (td.projectedRewardPaise > 0 ? `If you finalize now, ${inr(td.projectedRewardPaise)} goes into your Rewards Buffer.` : 'Under target. No reward is earned on a day with no spending.')
      : t === 'exact' ? 'Exactly on target. Finalizing earns no reward and needs no adjustment.' : `Over target by ${inr(td.projectedOverspendPaise)}. After finalizing you choose how to settle it.`;
    outcome = `<div class="outcome ${t === 'over' ? 'neg' : t === 'under' && td.projectedRewardPaise > 0 ? 'pos' : ''}">${txt}</div>`;
    buttons = `<button class="btn btn-primary" data-action="finalize" data-date="${td.date}" ${td.canFinalize ? '' : 'disabled'}>Finalize today</button><button class="btn btn-secondary" data-action="add-expense" data-date="${td.date}">${icon('plus', 16)}Add expense</button>`;
  }
  return panel({ title: `Today · ${title}`, sub: badge, cls: 's4', body: `
    <dl class="today-nums"><div><dt>Spent today</dt><dd>${inr(td.actualPaise)}</dd></div><div><dt>${td.differencePaise >= 0 ? 'Left for today' : 'Over by'}</dt><dd class="${td.differencePaise < 0 ? 'neg' : ''}">${inr(Math.abs(td.differencePaise))}</dd></div></dl>
    <div class="progress ${cls}" role="progressbar" aria-label="Share of today's target spent" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, pc)}"><i style="width:${Math.min(100, pc)}%"></i></div>
    <p class="faint" style="font-size:var(--fs-xs);margin-top:6px">${fin ? 'Target used' : 'Target'} ${inr(td.targetPaise)}</p>
    ${outcome}<div class="btn-stack">${buttons}</div>` });
}

function tiles(d) {
  const { totals: t, plan: p, focusDay: f, rewards: r } = d; const adj = d.adjustments.find((a) => !a.reversed);
  return `<div class="tile s4"><span class="label">${icon('spent', 16)}Total spent</span><span class="value">${inr(t.spentPaise)}</span><span class="note">${d.expenses.length} expense${d.expenses.length === 1 ? '' : 's'} in ${MONTHS[d.month - 1]}</span></div>
    <div class="tile s4"><span class="label">${icon('target', 16)}Daily target</span><span class="value">${f && d.budget ? inr(f.targetPaise) : '—'}</span>
      <span class="note">${f ? `Applies to ${fmtDate(f.date, { weekday: true })}. ` : 'No open days left. '}${inr(p.poolPaise)} left to plan ÷ ${p.openDays} open day${p.openDays === 1 ? '' : 's'}.
      ${adj ? `<br>Includes −${inr(adj.targetBeforePaise - adj.targetAfterPaise)} a day after the ${fmtDate(adj.date, { year: false })} overspend.` : ''}${p.shortfallPaise > 0 ? `<br><span class="neg">Finalized days already exceed the budget by ${inr(p.shortfallPaise)}.</span>` : ''}</span></div>
    <div class="tile accent s4"><span class="label">${icon('rewards', 16)}Rewards Buffer</span><span class="value">${inr(r.balancePaise)}</span><span class="note">Planning reserve, not cash. <a href="#/rewards">View activity</a></span></div>`;
}

function awaiting(d) {
  const list = d.awaiting.slice(-4).reverse(); const more = d.awaiting.length - list.length;
  const rows = list.map((x) => `<div><span class="what"><strong>${fmtDate(x.date, { weekday: true, year: false })}</strong><small>Spent ${inr(x.actualPaise)} of ${inr(x.targetPaise)} · ${x.projectedOutcome === 'under' ? (x.projectedRewardPaise > 0 ? `would earn +${inr(x.projectedRewardPaise)}` : 'under target') : x.projectedOutcome === 'over' ? `over by ${inr(x.projectedOverspendPaise)}` : 'on target'}</small></span>
    <button class="btn btn-secondary btn-sm" data-action="finalize" data-date="${x.date}" aria-label="Finalize ${fmtDate(x.date, { weekday: true })}">Finalize</button></div>`).join('');
  return panel({ title: 'Past days to finalize', sub: d.awaiting.length ? `<span class="badge badge-warning">${d.awaiting.length}</span>` : '', flush: true, cls: 's4',
    body: d.awaiting.length ? `<div class="rows">${rows}</div>` : '<div class="empty compact"><p>Every past day with spending is finalized.</p></div>',
    foot: more > 0 ? `${more} more in <a href="#/days">Daily records</a>` : '' });
}

export function overview(d) {
  const head = pageHead('Overview', `${MONTHS[d.month - 1]} ${d.year} at a glance`, `${monthSwitch()}${addBtn}`);
  const recent = d.expenses.slice(0, 5);
  const recentPanel = panel({ title: 'Recent activity', sub: '<a href="#/expenses">View all expenses</a>', flush: true, cls: 's8',
    body: recent.length ? expenseTable(recent, { actions: false }) : emptyState({ title: 'No expenses yet', text: 'Add what you spend as it happens. Each expense counts toward the day it is dated.', button: '<button class="btn btn-primary" data-action="add-expense">Add expense</button>' }) });
  if (!d.budget) return `${head}<div class="g12">${featured(d)}${today(d).replace('s4', 's4')}${recentPanel}</div>`;
  const chart = panel({ title: 'Daily spending vs target', sub: `${MONTHS[d.month - 1]} ${d.year}`, cls: 's8', body: dailyChart(d.plan.days) });
  const cats = panel({ title: 'Spending by category', sub: MONTHS[d.month - 1], cls: 's4', body: categoryBreakdown(d.categories, 'Spent').replace('donut-wrap', 'donut-wrap stacked') });
  return `${head}<div class="g12">${featured(d)}${today(d)}${tiles(d)}${chart}${cats}${recentPanel}${awaiting(d)}</div>`;
}
