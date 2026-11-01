import { inr, fmtDate, esc, MONTHS } from '../format.js';
import { walletIllustration } from '../illustrations.js';
import { panel, pageHead, monthSwitch } from './common.js';

const KIND = { earn: 'Reward earned', earn_reversal: 'Reward reversed', cover: 'Covered an overspend', cover_reversal: 'Rewards returned' };
const sign = (t) => `<b class="${t.type === 'credit' ? 'pos' : 'neg'}">${t.type === 'credit' ? '+' : '−'}${inr(t.amountPaise)}</b>`;

export function rewards(d) {
  const r = d.rewards; const m = MONTHS[d.month - 1];
  const featured = `<section class="panel featured reward s12"><div>
    <span class="eyebrow">Rewards Buffer balance</span><p class="display">${inr(r.balancePaise)}</p>
    <p class="muted" style="max-width:56ch;font-size:var(--fs-sm)">A planning reserve inside Daystash. It is <strong style="color:var(--text)">not cash and not a bank account</strong>: it only lets you cover an overspend without lowering future daily targets.</p>
    <dl class="pair three"><div><dt>Total earned</dt><dd class="pos">+${inr(r.totalEarnedPaise)}</dd></div><div><dt>Total used</dt><dd>−${inr(r.totalUsedPaise)}</dd></div><div><dt>${m}: earned / used</dt><dd>+${inr(r.earnedPaise)} / −${inr(r.spentPaise)}</dd></div></dl></div>
    <div class="featured-art">${walletIllustration()}</div></section>`;
  const recent = r.recent.length ? `<div class="rows">${r.recent.map((t) => `<div><span class="what"><strong>${KIND[t.kind]}</strong><small>${fmtDate(t.date)} · ${esc(t.reason)}</small></span>${sign(t)}</div>`).join('')}</div>`
    : '<div class="empty compact"><p>No reward activity yet. Finish a day under its target and finalize it.</p></div>';
  const rows = r.transactions.map((t) => `<tr><td data-label="Date">${fmtDate(t.date, { year: false })}</td><td data-label="Activity"><span class="strong">${KIND[t.kind]}</span></td><td data-label="Reason">${esc(t.reason)}</td><td class="num" data-label="Amount">${sign(t)}</td></tr>`).join('');
  const ledger = r.transactions.length ? `<table class="table stack-rows"><colgroup><col style="width:14%"><col style="width:24%"><col style="width:40%"><col style="width:22%"></colgroup><thead><tr><th>Date</th><th>Activity</th><th>Reason</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<div class="empty"><h3>No reward activity in this month</h3><p>Credits and debits appear here when you finalize days or cover an overspend.</p><a class="btn btn-secondary" href="#/days">Go to daily records</a></div>';
  return `${pageHead('Rewards Buffer', 'Savings from days you finish under target', monthSwitch())}
    <div class="g12">${featured}${panel({ title: 'Recent activity', sub: 'All months', flush: true, cls: 's5', body: recent })}
    ${panel({ title: 'Transaction ledger', sub: `${m} ${d.year} · every entry is kept and never edited`, flush: true, cls: 's7', body: ledger })}
    ${panel({ title: 'How the Rewards Buffer works', cls: 's12', body: `<ol class="steps"><li>Finalize a day. If you spent less than its target, the difference is credited to the buffer, once.</li>
      <li>If you overspend, you can cover it from the buffer, or lower the targets of the open days instead. Not both.</li>
      <li>The buffer can never go below zero. Reopening a day reverses its entries with new ledger lines instead of deleting history.</li></ol>` })}</div>`;
}
