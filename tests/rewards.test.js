'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers');

const OCT1 = '2026-10-01';
const OCT2 = '2026-10-02';

test('underspending earns a reward; finalizing twice or concurrently never duplicates it', async () => {
  const t = await boot({ today: OCT1 });
  try {
    await t.setBudget(2026, 10, 400000);
    await t.addExpense(OCT1, 2903);
    const [a, b] = await Promise.all([t.finalize(OCT1), t.finalize(OCT1)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const loser = a.status === 409 ? a : b;
    assert.equal(loser.error.code, 'ALREADY_FINALIZED');
    const day = (a.status === 200 ? a : b).data;
    assert.equal(day.outcome, 'under');
    assert.equal(day.targetPaise, 12903);
    assert.equal(day.rewardPaise, 10000);
    assert.equal((await t.finalize(OCT1)).status, 409);
    assert.equal(t.count('reward_transactions'), 1);
    assert.equal(t.balance(), 10000);
    const d = await t.dash();
    assert.equal(d.rewards.balancePaise, 10000); // displayed balance == ledger sum
    assert.equal(d.plan.days[1].targetPaise, 12903); // underspending does not inflate future targets (reward is kept separately)
  } finally { await t.close(); }
});

test('spending exactly the target gives no reward and no overspending', async () => {
  const t = await boot({ today: OCT1 });
  try {
    await t.setBudget(2026, 10, 400000);
    await t.addExpense(OCT1, 12903);
    const r = await t.finalize(OCT1);
    assert.equal(r.data.outcome, 'exact');
    assert.equal(r.data.rewardPaise, 0);
    assert.equal(t.count('reward_transactions'), 0);
    assert.equal((await t.dash()).pendingResolutions.length, 0);
  } finally { await t.close(); }
});

test('finalize guards: no budget, future day, invalid date', async () => {
  const t = await boot({ today: '2026-10-15' });
  try {
    assert.equal((await t.finalize(OCT1)).error.code, 'NO_BUDGET');
    await t.setBudget(2026, 10, 400000);
    assert.equal((await t.finalize('2026-10-20')).error.code, 'DATE_IN_FUTURE');
    assert.equal((await t.finalize('2026-13-01')).error.code, 'INVALID_DATE');
    assert.equal(t.count('daily_records'), 0);
  } finally { await t.close(); }
});

test('overspending resolved with rewards debits the ledger exactly once', async () => {
  const t = await boot({ today: OCT1 });
  try {
    await t.setBudget(2026, 10, 400000);
    await t.addExpense(OCT1, 2903);
    await t.finalize(OCT1); // +₹100.00
    t.state.today = OCT2;
    await t.addExpense(OCT2, 16903); // target 12903 -> over by 4000
    const f = await t.finalize(OCT2);
    assert.equal(f.data.outcome, 'over');
    assert.equal(f.data.overspendPaise, 4000);
    assert.equal(f.data.resolution, 'pending');
    assert.equal((await t.dash()).pendingResolutions[0].canCoverWithRewards, true);

    const r = await t.resolve(OCT2, 'rewards');
    assert.equal(r.status, 200);
    assert.equal(r.data.resolution, 'rewards');
    assert.equal(t.balance(), 6000);
    assert.equal((await t.resolve(OCT2, 'rewards')).error.code, 'ALREADY_RESOLVED');
    assert.equal((await t.resolve(OCT2, 'targets')).error.code, 'ALREADY_RESOLVED'); // never both options
    assert.equal(t.balance(), 6000);
    assert.equal(t.count('target_adjustments'), 0);
    const d = await t.dash();
    assert.equal(d.rewards.balancePaise, 6000);
    assert.equal(d.plan.days[2].targetPaise, 12903); // targets untouched when rewards cover it
  } finally { await t.close(); }
});

test('overspending resolved by adjusting future targets (and rewards cannot go negative)', async () => {
  const t = await boot({ today: OCT1 });
  try {
    await t.setBudget(2026, 10, 400000);
    await t.addExpense(OCT1, 16903);
    await t.finalize(OCT1);
    assert.equal((await t.dash()).pendingResolutions[0].canCoverWithRewards, false);
    const bad = await t.resolve(OCT1, 'rewards');
    assert.equal(bad.status, 409);
    assert.equal(bad.error.code, 'INSUFFICIENT_REWARDS');
    assert.equal(t.balance(), 0);
    assert.equal((await t.resolve(OCT1, 'absorb')).error.code, 'ABSORB_NOT_ALLOWED');

    const r = await t.resolve(OCT1, 'targets');
    assert.equal(r.status, 200);
    const d = await t.dash();
    const expected = Math.floor((400000 - 16903) / 30);
    assert.equal(d.plan.days[1].targetPaise, expected); // 12769
    assert.ok(expected < 12903);
    assert.equal(d.adjustments.length, 1);
    assert.deepEqual([d.adjustments[0].targetBeforePaise, d.adjustments[0].targetAfterPaise, d.adjustments[0].eligibleDays], [12903, 12769, 30]);
    assert.equal(d.plan.days[0].targetPaise, 12903); // finalized day keeps its snapshot
    assert.equal(d.plan.days.filter((x) => x.status === 'open').reduce((s, x) => s + x.targetPaise, 0), 400000 - 16903);
    assert.equal((await t.resolve(OCT1, 'targets')).status, 409); // overspend counted once
    assert.equal((await t.dash()).plan.days[1].targetPaise, expected);
  } finally { await t.close(); }
});

test('last day of the month: zero eligible days is handled safely', async () => {
  const t = await boot({ today: '2026-10-31' });
  try {
    await t.setBudget(2026, 10, 400000);
    await t.addExpense('2026-10-31', 30000);
    assert.equal((await t.finalize('2026-10-31')).data.outcome, 'over');
    assert.equal((await t.resolve('2026-10-31', 'targets')).error.code, 'NO_ELIGIBLE_DAYS');
    assert.equal((await t.dash()).pendingResolutions[0].eligibleDays, 0);
    const r = await t.resolve('2026-10-31', 'absorb');
    assert.equal(r.data.resolution, 'absorbed');
  } finally { await t.close(); }
});

test('the database itself refuses a negative Rewards Buffer', async () => {
  const t = await boot({ today: OCT1 });
  try {
    await t.setBudget(2026, 10, 400000);
    await t.addExpense(OCT1, 2903);
    await t.finalize(OCT1);
    const id = t.db.prepare('SELECT id FROM daily_records').get().id;
    const insert = (amt) => t.db.prepare(`INSERT INTO reward_transactions (txn_date,type,kind,amount_paise,reason,daily_record_id,cycle,year,month)
      VALUES ('2026-10-01','debit','cover',?, 'x', ?, 99, 2026, 10)`).run(amt, id);
    assert.throws(() => insert(10001), /NEGATIVE_BALANCE/);
    insert(10000);
    assert.equal(t.balance(), 0);
  } finally { await t.close(); }
});
