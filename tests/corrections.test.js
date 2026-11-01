'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers');

const OCT1 = '2026-10-01';
const OCT2 = '2026-10-02';

test('finalized-day expenses are locked until the day is explicitly reopened', async () => {
  const t = await boot({ today: OCT1 });
  try {
    await t.setBudget(2026, 10, 400000);
    const e = (await t.addExpense(OCT1, 2903)).data;
    await t.addExpense('2026-10-05', 500, 'Future');
    await t.finalize(OCT1);
    assert.equal((await t.dash()).expenses.find((x) => x.id === e.id).locked, true);

    const body = { date: OCT1, amountPaise: 5000, description: 'Edited', category: 'Food' };
    assert.equal((await t.call('PUT', `/expenses/${e.id}`, body)).error.code, 'DAY_FINALIZED');
    assert.equal((await t.call('DELETE', `/expenses/${e.id}`)).error.code, 'DAY_FINALIZED');
    assert.equal((await t.addExpense(OCT1, 100)).error.code, 'DAY_FINALIZED');
    const other = (await t.call('GET', '/expenses?year=2026&month=10')).data.find((x) => x.description === 'Future');
    assert.equal((await t.call('PUT', `/expenses/${other.id}`, { ...body, date: OCT1 })).error.code, 'DAY_FINALIZED'); // cannot move into a finalized day
    assert.equal((await t.call('POST', `/days/${OCT1}/reopen`, {})).error.code, 'CONFIRMATION_REQUIRED');
    assert.equal(t.balance(), 10000);
  } finally { await t.close(); }
});

test('reopen reverses the reward, keeps an audit trail, and re-finalizing recomputes cleanly', async () => {
  const t = await boot({ today: OCT1 });
  try {
    await t.setBudget(2026, 10, 400000);
    const e = (await t.addExpense(OCT1, 2903)).data;
    await t.finalize(OCT1);
    assert.equal(t.balance(), 10000);
    assert.equal((await t.reopen(OCT1)).data.status, 'open');
    assert.equal(t.balance(), 0);
    assert.equal(t.count('correction_log'), 1);
    assert.equal((await t.reopen(OCT1)).error.code, 'DAY_NOT_FINALIZED');

    assert.equal((await t.call('PUT', `/expenses/${e.id}`, { date: OCT1, amountPaise: 5000, description: 'Fixed', category: 'Food' })).status, 200);
    const f = await t.finalize(OCT1);
    assert.equal(f.data.rewardPaise, 12903 - 5000);
    assert.equal(t.balance(), 7903);
    const kinds = t.db.prepare('SELECT kind FROM reward_transactions ORDER BY id').all().map((r) => r.kind);
    assert.deepEqual(kinds, ['earn', 'earn_reversal', 'earn']);
    const d = await t.dash();
    assert.equal(d.rewards.balancePaise, 7903);
    assert.equal(d.rewards.earnedPaise, 7903); // net of the reversal
  } finally { await t.close(); }
});

test('reopening an overspent day returns rewards and removes its target adjustment', async () => {
  const t = await boot({ today: OCT1 });
  try {
    await t.setBudget(2026, 10, 400000);
    await t.addExpense(OCT1, 2903);
    await t.finalize(OCT1); // +10000
    t.state.today = OCT2;
    await t.addExpense(OCT2, 16903);
    await t.finalize(OCT2);
    await t.resolve(OCT2, 'rewards'); // -4000 -> 6000
    await t.reopen(OCT2);
    assert.equal(t.balance(), 10000);

    await t.finalize(OCT2);
    await t.resolve(OCT2, 'targets');
    assert.equal((await t.dash()).adjustments.length, 1);
    await t.reopen(OCT2);
    const d = await t.dash();
    assert.equal(d.adjustments[0].reversed, true);
    assert.equal(d.plan.days[1].status, 'open');
    assert.equal(d.plan.days[1].targetPaise, d.plan.days[2].targetPaise - (d.plan.days[2].targetPaise - d.plan.days[1].targetPaise));
    assert.equal(t.balance(), 10000);
  } finally { await t.close(); }
});

test('reopen is blocked when the reward it earned has already been spent', async () => {
  const t = await boot({ today: OCT1 });
  try {
    await t.setBudget(2026, 10, 400000);
    await t.addExpense(OCT1, 2903);
    await t.finalize(OCT1); // +10000
    t.state.today = OCT2;
    await t.addExpense(OCT2, 22903); // over by 10000
    await t.finalize(OCT2);
    await t.resolve(OCT2, 'rewards'); // balance 0
    const r = await t.reopen(OCT1);
    assert.equal(r.status, 409);
    assert.equal(r.error.code, 'REOPEN_BLOCKED');
    assert.equal((await t.dash()).plan.days[0].status, 'finalized');
    assert.equal(t.balance(), 0);
  } finally { await t.close(); }
});
