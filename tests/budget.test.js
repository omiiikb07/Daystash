'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers');

test('budget create/update recalculates targets and never keeps a stale one', async () => {
  const t = await boot({ today: '2026-10-15' });
  try {
    assert.equal((await t.dash()).budget, null);
    const r1 = await t.setBudget(2026, 10, 50000); // ₹500
    assert.equal(r1.status, 200);
    let d = await t.dash();
    assert.equal(d.plan.days[0].targetPaise, 1612);
    assert.equal(d.focusDay.targetPaise, 1613); // today (15th) is among the days that carry the extra paise

    await t.setBudget(2026, 10, 400000); // ₹4,000
    d = await t.dash();
    assert.equal(d.plan.initialTargetPaise, 12903);
    assert.equal(d.plan.days[0].targetPaise, 12903);
    assert.equal(d.focusDay.targetPaise, 12903);
    assert.equal(d.budget.amountPaise, 400000);
    assert.equal(t.count('budgets'), 1);
  } finally { await t.close(); }
});

test('targets always sum exactly to the budget; leap years and month lengths', async () => {
  const t = await boot();
  try {
    for (const [y, m, len] of [[2024, 2, 29], [2025, 2, 28], [2100, 2, 28], [2026, 4, 30], [2026, 10, 31], [2000, 2, 29]]) {
      await t.setBudget(y, m, 333337);
      const d = await t.dash(y, m);
      assert.equal(d.plan.days.length, len, `${y}-${m}`);
      assert.equal(d.plan.days.reduce((s, x) => s + x.targetPaise, 0), 333337);
    }
  } finally { await t.close(); }
});

test('budget validation (backend)', async () => {
  const t = await boot();
  try {
    for (const bad of [0, -100, 12.5, '4000', null, undefined, 1e12]) {
      const r = await t.call('PUT', '/budgets/2026/10', bad === undefined ? {} : { amountPaise: bad });
      assert.equal(r.status, 400, String(bad));
      assert.equal(r.error.code, 'INVALID_AMOUNT');
    }
    assert.equal((await t.call('PUT', '/budgets/2026/13', { amountPaise: 100 })).error.code, 'INVALID_MONTH');
    assert.equal((await t.call('PUT', '/budgets/abc/10', { amountPaise: 100 })).error.code, 'INVALID_MONTH');
    assert.equal(t.count('budgets'), 0);
  } finally { await t.close(); }
});

test('months are independent, including the same month in different years', async () => {
  const t = await boot();
  try {
    await t.setBudget(2025, 10, 100000);
    await t.setBudget(2026, 10, 400000);
    await t.addExpense('2025-10-05', 5000, 'Old');
    await t.addExpense('2026-10-05', 7000, 'New');
    const a = await t.dash(2025, 10);
    const b = await t.dash(2026, 10);
    assert.equal(a.budget.amountPaise, 100000);
    assert.equal(a.totals.spentPaise, 5000);
    assert.equal(b.budget.amountPaise, 400000);
    assert.equal(b.totals.spentPaise, 7000);
    assert.equal(a.expenses.length, 1);
    assert.equal(b.expenses[0].description, 'New');
    assert.equal((await t.call('GET', '/history')).data.length, 2);
  } finally { await t.close(); }
});

test('changing the budget after a day is finalized keeps the finalized snapshot', async () => {
  const t = await boot({ today: '2026-10-03' });
  try {
    await t.setBudget(2026, 10, 400000);
    await t.addExpense('2026-10-01', 2903);
    await t.finalize('2026-10-01');
    await t.setBudget(2026, 10, 600000);
    const d = await t.dash();
    assert.equal(d.plan.days[0].targetPaise, 12903); // snapshot untouched
    assert.equal(d.plan.days[1].targetPaise, Math.floor((600000 - 12903) / 30));
    assert.equal(t.balance(), 10000);
  } finally { await t.close(); }
});
