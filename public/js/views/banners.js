import { inr, fmtDate, esc } from '../format.js';

/** Things that need attention on every page: load errors and overspends waiting for a decision. */
export function banners(d, error) {
  let html = '';
  if (error) html += `<div class="banner error" role="alert"><h2>Could not load your data</h2><p>${esc(error)}</p><div><button class="btn btn-secondary btn-sm" data-action="retry">Try again</button></div></div>`;
  if (!d) return html;
  for (const p of d.pendingResolutions) {
    const date = fmtDate(p.date, { weekday: true });
    const rewards = p.canCoverWithRewards
      ? `<span>Takes ${inr(p.overspendPaise)} from the Rewards Buffer (${inr(d.rewards.balancePaise)} available). Daily targets stay the same.</span>`
      : `<span>Not enough in the Rewards Buffer: ${inr(d.rewards.balancePaise)} available.</span>`;
    const adjust = p.eligibleDays > 0
      ? `<strong>Lower future targets</strong><span>Spreads it over the ${p.sharedDays} open day${p.sharedDays === 1 ? '' : 's'}: each target drops by about ${inr(p.perDayImpactPaise)}. The Rewards Buffer is untouched.</span>
         <button class="btn btn-secondary btn-sm" data-action="resolve" data-date="${p.date}" data-method="targets">Lower future targets</button>`
      : `<strong>Accept the overspend</strong><span>No open days follow ${fmtDate(p.date, { year: false })}, so targets cannot be adjusted.</span>
         <button class="btn btn-secondary btn-sm" data-action="resolve" data-date="${p.date}" data-method="absorb">Accept overspend</button>`;
    html += `<section class="banner" aria-label="Overspend on ${esc(date)}"><div><h2>Decision needed: you went over on ${esc(date)}</h2>
      <p>Target ${inr(p.targetPaise)}, spent ${inr(p.actualPaise)}: over by <strong style="color:var(--text)">${inr(p.overspendPaise)}</strong>. Choose one way to settle it. The options cannot be combined.</p></div>
      <div class="options"><div class="option"><strong>Use Rewards Buffer</strong>${rewards}
        <button class="btn btn-primary btn-sm" data-action="resolve" data-date="${p.date}" data-method="rewards" ${p.canCoverWithRewards ? '' : 'disabled'}>Use Rewards Buffer</button></div>
        <div class="option">${adjust}</div></div></section>`;
  }
  return html;
}
