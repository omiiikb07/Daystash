import { inr, fmtDate, esc, MONTHS } from '../format.js';
import { monthlyChart, categoryBreakdown } from '../chart.js';
import { panel, pageHead, dayState, RES_LABEL } from './common.js';

const fmtInsight = (i) => ({ paise: inr(i.value), percent: `${i.value}%`, count: String(i.value), text: esc(i.value) }[i.format]);

export function history(d, y) {
  if (!y) return '<div class="skeleton"><i></i><i></i></div>';
  const yearOpts = y.years.map((v) => `<option value="${v}" ${v === y.year ? 'selected' : ''}>${v}</option>`).join('');
  const monthOpts = `<option value="" ${!y.month ? 'selected' : ''}>All months</option>` + MONTHS.map((m, i) => `<option value="${i + 1}" ${y.month === i + 1 ? 'selected' : ''}>${m}</option>`).join('');
  const tools = `<label class="field"><span class="sr-only">Year</span><select class="select" data-role="hist-year" style="width:110px">${yearOpts}</select></label>
    <label class="field"><span class="sr-only">Month filter</span><select class="select" data-role="hist-month" style="width:150px">${monthOpts}</select></label>`;
  const scope = y.month ? `${MONTHS[y.month - 1]} ${y.year}` : `${y.year}`;
  const t = y.totals;

  const tiles = `<div class="tile s4"><span class="label">Total budget</span><span class="value">${inr(t.budgetPaise)}</span><span class="note">${t.budgetedMonths} budgeted month${t.budgetedMonths === 1 ? '' : 's'} in ${scope}</span></div>
    <div class="tile s4"><span class="label">Total spent</span><span class="value">${inr(t.spentPaise)}</span><span class="note">${t.budgetedMonths ? 'In budgeted months.' : 'No budgeted months.'}${t.unbudgetedSpentPaise > 0 ? ` A further ${inr(t.unbudgetedSpentPaise)} was spent in months without a budget.` : ''}</span></div>
    <div class="tile accent s4"><span class="label">Total remaining</span><span class="value ${t.remainingPaise < 0 ? 'neg' : ''}">${inr(t.remainingPaise)}</span><span class="note">${t.remainingPaise < 0 ? 'Spending exceeded the budget.' : 'Budget minus spending in budgeted months.'}</span></div>`;

  const chart = panel({ title: 'Monthly spending', sub: `${y.year}${y.month ? ` · ${MONTHS[y.month - 1]} highlighted` : ''}`, cls: 's8', body: monthlyChart(y.months, y.month) });
  const cats = panel({ title: 'Spending by category', sub: scope, cls: 's4', body: categoryBreakdown(y.categories, 'Spent').replace('donut-wrap', 'donut-wrap stacked') });

  const insights = panel({ title: 'Insights', sub: scope, cls: 's4', body: y.insights.length ? `<div class="insights">${y.insights.map((i) => `<div><span>${esc(i.label)}<small>${esc(i.detail)}${i.month ? ` (${MONTHS[i.month - 1]})` : ''}</small></span><b>${fmtInsight(i)}</b></div>`).join('')}</div>`
    : '<div class="empty compact"><p>Insights appear once there is spending to analyse.</p></div>' });

  const rows = y.months.filter((m) => m.budgetPaise !== null || m.spentPaise > 0 || m.finalizedDays > 0).filter((m) => !y.month || m.month === y.month).map((m) => {
    const active = d.year === y.year && d.month === m.month;
    return `<tr class="history-row ${active ? 'is-active' : ''}"><td data-label="Month"><span class="strong">${MONTHS[m.month - 1]}</span></td>
      <td class="num" data-label="Budget">${inr(m.budgetPaise)}</td><td class="num" data-label="Spent">${inr(m.spentPaise)}</td>
      <td class="num ${m.remainingPaise !== null && m.remainingPaise < 0 ? 'neg' : ''}" data-label="Remaining">${inr(m.remainingPaise)}</td>
      <td class="num" data-label="Used">${m.utilizationPercent === null ? '—' : `${m.utilizationPercent}%`}</td>
      <td class="num" data-label="Rewards">+${inr(m.rewardsEarnedPaise)} / −${inr(m.rewardsUsedPaise)}</td>
      <td class="cell-actions"><button class="btn btn-secondary btn-sm" data-action="goto" data-year="${y.year}" data-month="${m.month}" aria-label="Open ${MONTHS[m.month - 1]} ${y.year}">Open</button></td></tr>`;
  }).join('');
  const table = panel({ title: 'Monthly records', sub: scope, flush: true, cls: 's12', body: rows
    ? `<table class="table stack-rows"><colgroup><col style="width:17%"><col style="width:14%"><col style="width:14%"><col style="width:14%"><col style="width:8%"><col style="width:20%"><col style="width:13%"></colgroup>
       <thead><tr><th>Month</th><th class="num">Budget</th><th class="num">Spent</th><th class="num">Remaining</th><th class="num">Used</th><th class="num">Rewards earned / used</th><th><span class="sr-only">Open</span></th></tr></thead><tbody>${rows}</tbody></table>`
    : '<div class="empty"><h3>No records for this period</h3><p>Months appear here once you set a budget or add an expense.</p></div>' });

  let daily = '';
  if (y.month) {
    const dr = y.records.map((r) => { const s = dayState({ status: 'finalized', outcome: r.outcome, resolution: r.resolution });
      return `<tr><td data-label="Date"><span class="strong">${fmtDate(r.date, { weekday: true, year: false })}</span></td><td class="num" data-label="Target">${inr(r.targetPaise)}</td><td class="num" data-label="Spent">${inr(r.actualPaise)}</td>
        <td data-label="Result"><span class="badge ${s.badge}">${s.label}</span> <span class="faint" style="font-size:var(--fs-xs)">${r.outcome === 'under' && r.rewardPaise ? `+${inr(r.rewardPaise)} reward` : r.outcome === 'over' ? `over ${inr(r.overspendPaise)} · ${RES_LABEL[r.resolution]}` : ''}</span></td></tr>`; }).join('');
    daily = panel({ title: `Finalized days in ${MONTHS[y.month - 1]}`, flush: true, cls: 's12', body: dr
      ? `<table class="table stack-rows"><colgroup><col style="width:24%"><col style="width:18%"><col style="width:18%"><col style="width:40%"></colgroup><thead><tr><th>Date</th><th class="num">Target</th><th class="num">Spent</th><th>Result</th></tr></thead><tbody>${dr}</tbody></table>`
      : '<div class="empty compact"><p>No days were finalized in this month.</p></div>' });
  }
  return `${pageHead('History', `Spending and budgets across ${scope}`, tools)}<div class="g12">${tiles}${chart}${cats}${insights}${table.replace('s12', 's8')}${daily}</div>`;
}
