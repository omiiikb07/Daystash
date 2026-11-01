import { inr, fmtDate, esc, MONTHS } from './format.js';

// Presentation-only charts: every number drawn comes from the API response. Hover or focus a mark for a tooltip.
const W = 720; const L = 52; const R = 8; const T = 12;
const short = (p) => inr(Math.round(p)).replace(/\.00$/, '');
const tip = (s) => `data-tip="${esc(s)}" tabindex="0"`;
const niceMax = (v) => { const p = 10 ** Math.max(2, Math.floor(Math.log10(Math.max(v, 1)))); return Math.ceil(v / (p / 2)) * (p / 2) || 1; };

function axes(max, H, B) {
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const lines = [0, 0.5, 1].map((f) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(max * f)}" y2="${y(max * f)}"/><text x="${L - 8}" y="${y(max * f) + 4}" text-anchor="end">${esc(short(max * f))}</text>`).join('');
  return { y, lines };
}

/** Daily spending (bars) against the target that applied or applies (marker). */
export function dailyChart(days) {
  const H = 290; const B = 26; const n = days.length;
  const tracked = days.filter((d) => d.status !== 'untracked');
  const max = niceMax(Math.max(1, ...tracked.map((d) => Math.max(d.actualPaise, d.targetPaise))));
  const { y, lines } = axes(max, H, B);
  const slot = (W - L - R) / n; const bw = Math.max(4, slot * 0.58);
  const body = days.map((d, i) => {
    const x = L + i * slot + (slot - bw) / 2; const base = H - B;
    const over = d.status === 'finalized' && d.outcome === 'over';
    const fill = over ? '#F16F7C' : '#8B6CFF'; const op = d.status === 'finalized' ? 1 : 0.55;
    const state = d.status === 'finalized' ? (over ? 'finalized, over target' : 'finalized') : d.status === 'untracked' ? 'not tracked' : 'open';
    const t = `${fmtDate(d.date, { weekday: true })}\nSpent ${inr(d.actualPaise)}${d.status === 'untracked' ? '' : `\nTarget ${inr(d.targetPaise)}`}\n${state}`;
    const h = Math.max(d.actualPaise > 0 ? 2 : 0, base - y(d.actualPaise));
    const bar = `<rect class="bar" x="${x}" y="${base - h}" width="${bw}" height="${h}" rx="2" fill="${fill}" opacity="${op}" ${tip(t)} aria-label="${esc(t.replace(/\n/g, ', '))}"/>`;
    const mark = d.status === 'untracked' ? '' : `<line x1="${x - 2}" x2="${x + bw + 2}" y1="${y(d.targetPaise)}" y2="${y(d.targetPaise)}" stroke="#F5F5FA" stroke-opacity=".85" stroke-width="2" stroke-linecap="round"/>`;
    const day = i + 1;
    const lab = day === 1 || day % 5 === 0 || day === n ? `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${day}</text>` : '';
    return bar + mark + lab;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="Daily spending against target, one bar per day. Full figures are in Daily records.">${lines}${body}</svg>
    <div class="legend" aria-hidden="true"><span><i style="background:#8B6CFF"></i>Spent</span><span><i style="background:#F16F7C"></i>Over target (finalized)</span><span><i style="background:#8B6CFF;opacity:.55"></i>Open day</span><span><i style="background:#F5F5FA;height:2px;vertical-align:3px"></i>Target</span></div>`;
}

const PALETTE = ['#8B6CFF', '#B49AFF', '#6A52C9', '#A2A5B7', '#7D8196', '#5C5F75', '#46485C', '#35374A'];
export const catColor = (i) => PALETTE[Math.min(i, PALETTE.length - 1)];

/** Donut + legend. categories: [{category,totalPaise,percent}] from the API. */
export function categoryBreakdown(cats, centerLabel = 'Total') {
  if (!cats.length) return '<div class="empty compact"><p>No spending to break down yet.</p></div>';
  const total = cats.reduce((s, c) => s + c.totalPaise, 0);
  const r = 62; const C = 2 * Math.PI * r; let off = 0;
  const segs = cats.map((c, i) => {
    const len = (c.totalPaise / total) * C; const gap = cats.length > 1 ? 2.5 : 0;
    const t = `${c.category}\n${inr(c.totalPaise)} · ${c.percent}%`;
    const el = `<circle class="seg" cx="85" cy="85" r="${r}" stroke="${catColor(i)}" stroke-width="22" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 85 85)" ${tip(t)} aria-label="${esc(t.replace(/\n/g, ', '))}"/>`;
    off += len; return el;
  }).join('');
  const list = cats.map((c, i) => `<li><span class="sw" style="background:${catColor(i)}"></span><span class="nm">${esc(c.category)}</span><span class="pc">${c.percent}%</span><span class="am">${inr(c.totalPaise)}</span></li>`).join('');
  return `<div class="donut-wrap"><svg class="chart" viewBox="0 0 170 170" width="170" height="170" role="group" aria-label="Spending by category">
    <circle cx="85" cy="85" r="${r}" fill="none" stroke="#202333" stroke-width="22"/>${segs}
    <text class="donut-center" x="85" y="80" text-anchor="middle">${esc(centerLabel)}</text><text class="donut-total" x="85" y="100" text-anchor="middle">${esc(short(total))}</text></svg>
    <ul class="cat-list">${list}</ul></div>`;
}

/** Twelve months of spending against budget (history page). months come from /history/year. */
export function monthlyChart(months, selected) {
  const H = 290; const B = 28; const budgets = months.filter((m) => m.budgetPaise !== null).map((m) => m.budgetPaise);
  const max = niceMax(Math.max(1, ...months.map((m) => m.spentPaise), ...budgets));
  const { y, lines } = axes(max, H, B); const slot = (W - L - R) / 12; const bw = slot * 0.5;
  const body = months.map((m, i) => {
    const x = L + i * slot + (slot - bw) / 2; const base = H - B; const h = Math.max(m.spentPaise > 0 ? 2 : 0, base - y(m.spentPaise));
    const fill = m.overBudget ? '#F16F7C' : m.budgetPaise === null ? '#7D8196' : '#8B6CFF';
    const t = `${MONTHS[i]}\nSpent ${inr(m.spentPaise)}\n${m.budgetPaise === null ? 'No budget set' : `Budget ${inr(m.budgetPaise)} · ${m.utilizationPercent}% used`}`;
    const sel = selected === m.month ? `<rect x="${x - 6}" y="${T}" width="${bw + 12}" height="${H - T - B}" rx="6" fill="#8B6CFF" opacity=".12"/>` : '';
    const mark = m.budgetPaise === null ? '' : `<line x1="${x - 4}" x2="${x + bw + 4}" y1="${y(m.budgetPaise)}" y2="${y(m.budgetPaise)}" stroke="#F5F5FA" stroke-opacity=".85" stroke-width="2" stroke-linecap="round"/>`;
    return `${sel}<rect class="bar" x="${x}" y="${base - h}" width="${bw}" height="${h}" rx="3" fill="${fill}" ${tip(t)} aria-label="${esc(t.replace(/\n/g, ', '))}"/>${mark}<text x="${x + bw / 2}" y="${H - 9}" text-anchor="middle">${MONTHS[i].slice(0, 3)}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="Monthly spending against budget">${lines}${body}</svg>
    <div class="legend" aria-hidden="true"><span><i style="background:#8B6CFF"></i>Spent</span><span><i style="background:#F16F7C"></i>Over budget</span><span><i style="background:#7D8196"></i>No budget set</span><span><i style="background:#F5F5FA;height:2px;vertical-align:3px"></i>Budget</span></div>`;
}
