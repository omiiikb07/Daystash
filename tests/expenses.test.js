'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers');

test('expense CRUD and dashboard totals', async () => {
  const t = await boot({ today: '2026-10-10' });
  try {
    await t.setBudget(2026, 10, 400000);
    const c = await t.addExpense('2026-10-10', 120000, 'Rent share', 'Bills');
    assert.equal(c.status, 201);
    assert.ok(c.data.id && c.data.createdAt && c.data.updatedAt);
    let d = await t.dash();
    assert.equal(d.totals.spentPaise, 120000);
    assert.equal(d.totals.remainingPaise, 280000);
    assert.equal(d.todayDay.actualPaise, 120000);

    const u = await t.call('PUT', `/expenses/${c.data.id}`, { date: '2026-10-10', amountPaise: 100000, description: 'Rent', category: 'Bills' });
    assert.equal(u.status, 200);
    assert.equal(u.data.amountPaise, 100000);
    d = await t.dash();
    assert.equal(d.totals.remainingPaise, 300000);

    assert.equal((await t.call('DELETE', `/expenses/${c.data.id}`)).status, 200);
    d = await t.dash();
    assert.equal(d.totals.spentPaise, 0);
    assert.equal(d.expenses.length, 0);
  } finally { await t.close(); }
});

test('overspending the monthly budget is reported', async () => {
  const t = await boot();
  try {
    await t.setBudget(2026, 10, 10000);
    await t.addExpense('2026-10-02', 12500);
    const d = await t.dash();
    assert.equal(d.totals.remainingPaise, -2500);
    assert.equal(d.totals.overspentPaise, 2500);
  } finally { await t.close(); }
});

test('expense validation, missing ids and unknown routes', async () => {
  const t = await boot();
  try {
    const good = { date: '2026-10-01', amountPaise: 100, description: 'x', category: 'Food' };
    const cases = [
      [{ ...good, amountPaise: 0 }, 'INVALID_AMOUNT'], [{ ...good, amountPaise: -5 }, 'INVALID_AMOUNT'],
      [{ ...good, amountPaise: 12.5 }, 'INVALID_AMOUNT'], [{ ...good, amountPaise: '10' }, 'INVALID_AMOUNT'],
      [{ ...good, amountPaise: null }, 'INVALID_AMOUNT'], [{ ...good, amountPaise: 1e12 }, 'INVALID_AMOUNT'],
      [{ ...good, description: '   ' }, 'INVALID_DESCRIPTION'], [{ ...good, description: 'a'.repeat(201) }, 'INVALID_DESCRIPTION'],
      [{ ...good, category: 'Nope' }, 'INVALID_CATEGORY'], [{ ...good, date: '2026-02-30' }, 'INVALID_DATE'],
      [{ ...good, date: undefined }, 'INVALID_DATE'], [{ ...good, date: '01-10-2026' }, 'INVALID_DATE'],
    ];
    for (const [body, code] of cases) {
      const r = await t.call('POST', '/expenses', body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(r.error.code, code);
    }
    assert.equal(t.count('expenses'), 0);
    assert.equal((await t.call('PUT', '/expenses/999', good)).status, 404);
    assert.equal((await t.call('DELETE', '/expenses/999')).error.code, 'EXPENSE_NOT_FOUND');
    assert.equal((await t.call('DELETE', '/expenses/abc')).error.code, 'INVALID_ID');
    assert.equal((await t.call('GET', '/nope')).status, 404);
  } finally { await t.close(); }
});

test('SQL-looking input is stored as plain text (parameterized queries)', async () => {
  const t = await boot();
  try {
    const r = await t.addExpense('2026-10-01', 100, "x'); DROP TABLE expenses;--");
    assert.equal(r.status, 201);
    assert.equal(t.count('expenses'), 1);
    assert.equal(r.data.description, "x'); DROP TABLE expenses;--");
  } finally { await t.close(); }
});
