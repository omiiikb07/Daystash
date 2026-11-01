'use strict';
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers');

test('reset clears only the selected month, keeps its budget, and fixes the buffer', async () => {
  const t = await boot({ today: '2026-10-15' });
  try {
    await t.setBudget(2026, 9, 300000);
    await t.setBudget(2026, 10, 400000);
    await t.setBudget(2025, 10, 100000);
    await t.addExpense('2026-09-01', 1000, 'Sep');       // target 10000 -> reward 9000
    await t.addExpense('2026-10-01', 2903, 'Oct');       // reward 10000
    await t.addExpense('2025-10-01', 500, 'Oct 2025');
    await t.finalize('2026-09-01');
    await t.finalize('2026-10-01');
    assert.equal(t.balance(), 19000);

    assert.equal((await t.call('POST', '/months/2026/10/reset', {})).error.code, 'CONFIRMATION_REQUIRED');
    const r = await t.call('POST', '/months/2026/10/reset', { confirm: true });
    assert.equal(r.status, 200);
    assert.equal(r.data.expenses, 1);

    const oct = await t.dash(2026, 10);
    assert.equal(oct.budget.amountPaise, 400000); // budget retained
    assert.equal(oct.expenses.length, 0);
    assert.equal(oct.plan.days[0].status, 'open');
    assert.equal(oct.plan.days[0].targetPaise, 12903);
    assert.equal(t.balance(), 9000); // only September's reward remains
    assert.equal((await t.dash(2026, 9)).totals.spentPaise, 1000);
    assert.equal((await t.dash(2026, 9)).plan.days[0].status, 'finalized');
    assert.equal((await t.dash(2025, 10)).totals.spentPaise, 500);
    assert.equal((await t.dash(2025, 10)).budget.amountPaise, 100000);
  } finally { await t.close(); }
});

test('reset is refused when it would drive the buffer negative', async () => {
  const t = await boot({ today: '2026-11-01' });
  try {
    await t.setBudget(2026, 10, 400000);
    await t.setBudget(2026, 11, 300000);
    await t.addExpense('2026-10-01', 2903);
    await t.finalize('2026-10-01'); // +10000
    await t.addExpense('2026-11-01', 20000); // Nov target 10000 -> over by 10000
    await t.finalize('2026-11-01');
    await t.resolve('2026-11-01', 'rewards'); // balance 0
    const r = await t.call('POST', '/months/2026/10/reset', { confirm: true });
    assert.equal(r.status, 409);
    assert.equal(r.error.code, 'RESET_WOULD_OVERDRAW');
    assert.equal((await t.dash(2026, 10)).expenses.length, 1);
    assert.equal((await t.dash(2026, 10)).plan.days[0].status, 'finalized');
    assert.equal(t.balance(), 0);
  } finally { await t.close(); }
});

test('a database failure during finalization leaves nothing half-applied', async () => {
  const t = await boot({ today: '2026-10-01' });
  try {
    await t.setBudget(2026, 10, 400000);
    await t.addExpense('2026-10-01', 2903);
    t.db.exec("CREATE TRIGGER boom BEFORE INSERT ON reward_transactions BEGIN SELECT RAISE(ABORT, 'disk on fire'); END");
    const r = await t.finalize('2026-10-01');
    assert.equal(r.status, 500);
    assert.equal(r.error.code, 'INTERNAL_ERROR');
    assert.equal(t.count('daily_records'), 0);
    assert.equal(t.count('reward_transactions'), 0);
    assert.equal((await t.dash()).plan.days[0].status, 'open');
    t.db.exec('DROP TRIGGER boom');
    assert.equal((await t.finalize('2026-10-01')).status, 200);
    assert.equal(t.balance(), 10000);
  } finally { await t.close(); }
});

test('a database failure during reset rolls the whole reset back', async () => {
  const t = await boot({ today: '2026-10-15' });
  try {
    await t.setBudget(2026, 10, 400000);
    await t.addExpense('2026-10-01', 2903);
    await t.finalize('2026-10-01');
    t.db.exec("CREATE TRIGGER boom BEFORE DELETE ON expenses BEGIN SELECT RAISE(ABORT, 'nope'); END");
    const r = await t.call('POST', '/months/2026/10/reset', { confirm: true });
    assert.equal(r.status, 500);
    assert.equal(t.count('expenses'), 1);
    assert.equal(t.count('daily_records'), 1);
    assert.equal(t.count('reward_transactions'), 1);
    assert.equal(t.balance(), 10000);
  } finally { await t.close(); }
});

test('data survives a server restart', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daystash-test-'));
  const file = path.join(dir, 'restart.db');
  try {
    let t = await boot({ today: '2026-10-02', file });
    await t.setBudget(2026, 10, 400000);
    await t.addExpense('2026-10-01', 2903, 'Persist me');
    await t.finalize('2026-10-01');
    await t.close();

    t = await boot({ today: '2026-10-02', file });
    const d = await t.dash();
    assert.equal(d.budget.amountPaise, 400000);
    assert.equal(d.expenses[0].description, 'Persist me');
    assert.equal(d.plan.days[0].status, 'finalized');
    assert.equal(d.rewards.balancePaise, 10000);
    await t.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('malformed JSON and unknown methods return clean JSON errors', async () => {
  const t = await boot();
  try {
    assert.equal((await t.call('POST', '/days/2026-10-01/resolve', { method: 'bogus' })).error.code, 'INVALID_METHOD');
    assert.equal((await t.call('POST', '/days/2026-10-01/resolve', { method: 'rewards' })).error.code, 'DAY_NOT_FINALIZED');
    assert.equal((await t.call('GET', '/health')).data.status, 'ok');
  } finally { await t.close(); }
});
