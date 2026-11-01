import { inr, MONTHS } from '../format.js';
import { panel, pageHead, monthSwitch } from './common.js';

export function settings(d) {
  const b = d.budget; const p = d.plan; const name = `${MONTHS[d.month - 1]} ${d.year}`;
  return `${pageHead('Settings', `Budget and data for ${name}`, monthSwitch())}<div class="g12">
    ${panel({ title: `Monthly budget · ${name}`, cls: 's7', body: `
      <div class="setting"><div><strong>Budget</strong><p>${b ? `${inr(b.amountPaise)} for ${p.daysInMonth} days.` : 'No budget has been set for this month yet.'}</p></div><button class="btn btn-primary" data-action="edit-budget">${b ? 'Edit budget' : 'Set budget'}</button></div>
      <div class="setting"><div><strong>Tracking start day</strong><p>${b ? `Day ${p.startDay}. ${p.startDay > 1 ? `${p.untrackedDays} earlier day${p.untrackedDays === 1 ? ' gets' : 's get'} no target; money spent on them is deducted from the budget.` : 'The whole month is planned.'}` : 'Chosen when you set the budget.'}</p></div><button class="btn btn-secondary" data-action="edit-budget" ${b ? '' : 'disabled'}>Change</button></div>
      <div class="setting"><div><strong>Initial daily target</strong><p>${b ? `${inr(p.initialTargetPaise)} a day before any day is finalized. Currently ${inr(p.poolPaise)} is left to plan across ${p.openDays} open day${p.openDays === 1 ? '' : 's'}.` : '—'}</p></div></div>` })}
    ${panel({ title: 'Month data', cls: 's5', body: `<div class="setting"><div><strong>Reset ${name}</strong><p>Deletes this month's expenses, daily records, reward activity and adjustments. The budget and every other month stay. Rewards this month earned leave the buffer and rewards it used are returned. If the earned rewards were already spent in another month, the reset is refused.</p></div></div>
      <button class="btn btn-danger" data-action="reset-month">Reset ${name}</button>` })}
    ${panel({ title: 'How Daystash calculates', cls: 's12', body: `<ol class="steps">
      <li><strong>Daily target</strong> = money left to plan ÷ open days. Money left to plan is the budget minus what finalized days used.</li>
      <li><strong>Finalizing</strong> a day locks the target it had. Under target, the difference is credited to the Rewards Buffer once. Over target, you choose how to settle it.</li>
      <li><strong>Settling an overspend</strong>: use the Rewards Buffer, or lower the targets of all open days. Never both, never twice.</li>
      <li><strong>Reopening</strong> a finalized day reverses its ledger entries (history is kept). It is refused if the reward it earned was already spent.</li>
      <li>Amounts are stored as whole paise, so there is no rounding drift. Currency is Indian rupees (₹).</li></ol>` })}</div>`;
}
