'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers');

test('dashboard category totals are real sums with percentages', async () => {
  const t = await boot({ today: '2026-10-15' });
  try {
    await t.setBudget(2026, 10, 400000);
    await t.addExpense('2026-10-02', 30000, 'a', 'Food');
    await t.addExpense('2026-10-03', 10000, 'b', 'Food');
    await t.addExpense('2026-10-04', 10000, 'c', 'Transport');
    await t.addExpense('2026-09-04', 99900, 'other month', 'Bills');
    const c = (await t.dash()).categories;
    assert.deepEqual(c.map((x) => [x.category, x.totalPaise, x.percent, x.count]), [['Food', 40000, 80, 2], ['Transport', 10000, 20, 1]]);
    assert.deepEqual((await t.dash(2026, 8)).categories, []);
  } finally { await t.close(); }
});

test('rewards totals: earned - used always equals the balance, across months', async () => {
  const t = await boot({ today: '2026-10-15' });
  try {
    await t.setBudget(2026, 9, 300000); await t.setBudget(2026, 10, 400000);
    await t.addExpense('2026-09-01', 1000); await t.finalize('2026-09-01');           // +9000
    await t.addExpense('2026-10-01', 2903); await t.finalize('2026-10-01');           // +10000
    await t.addExpense('2026-10-02', 16903); await t.finalize('2026-10-02'); await t.resolve('2026-10-02', 'rewards'); // -4000
    await t.reopen('2026-10-01');                                                       // -10000 reversal
    const r = (await t.dash()).rewards;
    assert.equal(r.totalEarnedPaise - r.totalUsedPaise, r.balancePaise);
    assert.equal(r.balancePaise, t.balance());
    assert.equal(r.totalEarnedPaise, 9000);
    assert.equal(r.totalUsedPaise, 4000);
    assert.equal(r.recent.length, 4); // earn, earn, cover, reversal
    assert.ok(r.recent[0].id > r.recent[1].id);
  } finally { await t.close(); }
});

test('year summary: totals, categories, insights and month filter use real data only', async () => {
  const t = await boot({ today: '2026-10-15' });
  try {
    await t.setBudget(2026, 9, 100000); await t.setBudget(2026, 10, 200000);
    await t.addExpense('2026-09-05', 120000, 'big', 'Shopping');   // over budget
    await t.addExpense('2026-10-05', 50000, 'food', 'Food');
    await t.addExpense('2026-11-05', 7000, 'no budget month', 'Food');
    const y = (await t.call('GET', '/history/year?year=2026')).data;
    assert.equal(y.months.length, 12);
    assert.deepEqual([y.totals.budgetPaise, y.totals.spentPaise, y.totals.remainingPaise, y.totals.unbudgetedSpentPaise, y.totals.allSpentPaise],
      [300000, 170000, 130000, 7000, 177000]);
    assert.equal(y.months[8].overBudget, true);
    assert.equal(y.months[10].budgetPaise, null);
    assert.equal(y.categories[0].category, 'Shopping');
    assert.equal(y.categories.reduce((s, c) => s + c.totalPaise, 0), 177000);
    const ins = Object.fromEntries(y.insights.map((i) => [i.key, i]));
    assert.equal(ins.highest.value, 120000); assert.equal(ins.highest.month, 9);
    assert.equal(ins.over.value, 1);
    assert.equal(ins.bestSaving.value, 150000);
    assert.ok(y.years.includes(2026));

    const m = (await t.call('GET', '/history/year?year=2026&month=10')).data;
    assert.deepEqual([m.totals.budgetPaise, m.totals.spentPaise, m.totals.remainingPaise], [200000, 50000, 150000]);
    assert.deepEqual(m.categories.map((c) => c.category), ['Food']);
    assert.equal((await t.call('GET', '/history/year?year=2026&month=all')).data.month, null);
    assert.equal((await t.call('GET', '/history/year?year=1999')).error.code, 'INVALID_MONTH');
    const empty = (await t.call('GET', '/history/year?year=2031')).data;
    assert.deepEqual([empty.totals.allSpentPaise, empty.categories.length, empty.insights.filter((i) => i.key !== 'rewards').length], [0, 0, 0]);
  } finally { await t.close(); }
});
