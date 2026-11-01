'use strict';
// Regression tests for the problems reported after the first release.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers');

// The reported scenario: ₹5,000 budget, today is 28 Oct, ₹13 spent on the 27th, ₹250 on the 28th.
async function reportedScenario(t) {
  await t.setBudget(2026, 10, 500000);
  await t.addExpense('2026-10-27', 1300, 'c');
  await t.addExpense('2026-10-28', 25000, 'icecream');
}

test('A: every past open day with a budget is flagged finalizable by the API', async () => {
  const t = await boot({ today: '2026-10-28' });
  try {
    await reportedScenario(t);
    const d = await t.dash();
    const byDate = Object.fromEntries(d.plan.days.map((x) => [x.date, x]));
    assert.equal(byDate['2026-10-27'].canFinalize, true);
    assert.equal(byDate['2026-10-28'].canFinalize, true);
    assert.equal(byDate['2026-10-29'].canFinalize, false); // future
    assert.ok(d.awaiting.some((x) => x.date === '2026-10-27'));
    assert.ok(!d.awaiting.some((x) => x.date === '2026-10-28')); // today is handled by the Today panel
  } finally { await t.close(); }
});

test('B: finalizing the underspent 27 Oct credits the buffer, and the dashboard shows it straight away', async () => {
  const t = await boot({ today: '2026-10-28' });
  try {
    await reportedScenario(t);
    const target = (await t.dash()).plan.days[26].targetPaise;
    const pv = (await t.call('GET', '/days/2026-10-27/preview')).data;
    assert.equal(pv.outcome, 'under');
    assert.equal(pv.rewardPaise, target - 1300);
    assert.equal(pv.blocked, null);
    assert.equal(pv.balanceAfterPaise, target - 1300);

    const f = await t.finalize('2026-10-27');
    assert.equal(f.data.rewardPaise, target - 1300);
    const d = await t.dash(); // first dashboard read after the action
    assert.equal(d.rewards.balancePaise, target - 1300);
    assert.equal(d.rewards.earnedPaise, target - 1300);
    assert.equal(d.rewards.transactions.length, 1);
    assert.equal(d.rewards.transactions[0].date, '2026-10-27');
    assert.equal((await t.call('GET', '/history')).data[0].rewardsEarnedPaise, target - 1300);
  } finally { await t.close(); }
});

test('B: an overspent day earns nothing; preview matches the real result for under / exact / over', async () => {
  const t = await boot({ today: '2026-10-28' });
  try {
    await reportedScenario(t);
    const pv = (await t.call('GET', '/days/2026-10-28/preview')).data;
    const f = (await t.finalize('2026-10-28')).data;
    assert.equal(f.outcome, 'over');
    assert.deepEqual([pv.outcome, pv.overspendPaise, pv.rewardPaise], [f.outcome, f.overspendPaise, 0]);
    assert.equal(t.balance(), 0);

    await t.addExpense('2026-10-26', 100);
    const t26 = (await t.dash()).plan.days[25].targetPaise;
    await t.addExpense('2026-10-25', t26); // exact
    const exact = (await t.call('GET', '/days/2026-10-25/preview')).data;
    assert.deepEqual([exact.outcome, exact.rewardPaise, exact.overspendPaise], ['exact', 0, 0]);
  } finally { await t.close(); }
});

test('B: preview reports why a day is blocked, and never changes data', async () => {
  const t = await boot({ today: '2026-10-15' });
  try {
    assert.equal((await t.call('GET', '/days/2026-10-10/preview')).data.blocked.code, 'NO_BUDGET');
    await t.setBudget(2026, 10, 400000);
    assert.equal((await t.call('GET', '/days/2026-10-20/preview')).data.blocked.code, 'DATE_IN_FUTURE');
    assert.equal((await t.call('GET', '/days/2026-10-10/preview')).data.blocked, null);
    await t.finalize('2026-10-10');
    assert.equal((await t.call('GET', '/days/2026-10-10/preview')).data.blocked.code, 'ALREADY_FINALIZED');
    assert.equal((await t.call('GET', '/days/nope/preview')).status, 400);
    assert.equal(t.count('daily_records'), 1);
  } finally { await t.close(); }
});

test('C: the adjustment reports the days that really share it, and the numbers agree everywhere', async () => {
  const t = await boot({ today: '2026-10-28' });
  try {
    await reportedScenario(t);
    await t.finalize('2026-10-28');
    const pending = (await t.dash()).pendingResolutions[0];
    assert.equal(pending.eligibleDays, 3);   // days after the 28th (needed to allow the option)
    assert.equal(pending.sharedDays, 30);    // days that actually absorb it
    await t.resolve('2026-10-28', 'targets');

    const d = await t.dash();
    const a = d.adjustments[0];
    assert.equal(a.eligibleDays, 30);                    // no longer says "3"
    assert.equal(a.eligibleDays, d.plan.openDays);
    const open = d.plan.days.filter((x) => x.status === 'open');
    assert.equal(open.reduce((s, x) => s + x.targetPaise, 0), d.plan.poolPaise);
    assert.equal(d.plan.poolPaise, 500000 - d.plan.days[27].actualPaise - 0);
    const next = d.plan.days.find((x) => x.date === '2026-10-29');
    assert.equal(next.targetPaise, a.targetAfterPaise);  // the stated "after" is the target the table shows
    assert.equal(d.focusDay.date, '2026-10-29');
    assert.equal(d.focusDay.targetPaise, a.targetAfterPaise);
    assert.equal(d.plan.days[27].targetPaise, 16129);    // finalized snapshot untouched
    assert.ok(Math.abs((a.targetBeforePaise - a.targetAfterPaise) - Math.round(a.amountPaise / 30)) <= 1);
  } finally { await t.close(); }
});

test('C: tracking start day keeps never-tracked days out of the plan', async () => {
  const t = await boot({ today: '2026-10-28' });
  try {
    const r = await t.call('PUT', '/budgets/2026/10', { amountPaise: 500000, startDay: 28 });
    assert.equal(r.data.budget.startDay, 28);
    assert.equal(r.data.initialTargetPaise, 125000);
    await t.addExpense('2026-10-20', 4000, 'before tracking');
    const d = await t.dash();
    assert.equal(d.plan.days[0].status, 'untracked');
    assert.equal(d.plan.untrackedDays, 27);
    assert.equal(d.plan.openDays, 4);
    assert.equal(d.plan.poolPaise, 496000);                 // untracked spending is deducted from the pool
    assert.equal(d.plan.days[27].targetPaise, 124000);
    assert.equal(d.totals.remainingPaise, 496000);
    assert.equal((await t.finalize('2026-10-20')).error.code, 'DAY_NOT_TRACKED');
    assert.equal((await t.finalize('2026-10-28')).status, 200);
    // omitting startDay keeps the stored value
    assert.equal((await t.call('PUT', '/budgets/2026/10', { amountPaise: 600000 })).data.budget.startDay, 28);
    for (const bad of [0, 32, 1.5, '3']) assert.equal((await t.call('PUT', '/budgets/2026/10', { amountPaise: 1000, startDay: bad })).error.code, 'INVALID_START_DAY');
    assert.equal((await t.call('PUT', '/budgets/2026/02', { amountPaise: 1000, startDay: 30 })).error.code, 'INVALID_START_DAY');
  } finally { await t.close(); }
});

test('D: duplicate / concurrent actions cannot double-apply', async () => {
  const t = await boot({ today: '2026-10-28' });
  try {
    await reportedScenario(t);
    const res = await Promise.all([t.finalize('2026-10-27'), t.finalize('2026-10-27'), t.finalize('2026-10-27')]);
    assert.deepEqual(res.map((r) => r.status).sort(), [200, 409, 409]);
    assert.equal(t.count('reward_transactions'), 1);
    await t.finalize('2026-10-28');
    const rs = await Promise.all([t.resolve('2026-10-28', 'targets'), t.resolve('2026-10-28', 'targets')]);
    assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
    assert.equal(t.count('target_adjustments'), 1);
  } finally { await t.close(); }
});

test('migration: an older database is upgraded in place without losing data', async () => {
  const { openDatabase } = require('../database');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daystash-mig-'));
  const file = path.join(dir, 'old.db');
  try {
    let db = openDatabase(file);
    db.exec('ALTER TABLE budgets DROP COLUMN start_day'); // simulate the first release's schema
    db.prepare('INSERT INTO budgets (year, month, amount_paise) VALUES (2026, 10, 500000)').run();
    db.prepare("INSERT INTO expenses (amount_paise, description, category, expense_date) VALUES (1300, 'keep me', 'Food', '2026-10-27')").run();
    db.close();

    db = openDatabase(file);
    assert.ok(db.prepare('PRAGMA table_info(budgets)').all().some((c) => c.name === 'start_day'));
    assert.deepEqual(db.prepare('SELECT amount_paise, start_day FROM budgets').get(), { amount_paise: 500000, start_day: 1 });
    assert.equal(db.prepare('SELECT description FROM expenses').get().description, 'keep me');
    db.close();
    openDatabase(file).close(); // running it again is harmless
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
