'use strict';
// Boots the real Express app on a random port with an isolated database (in-memory by default),
// so tests can never touch database/daystash.db.
const { openDatabase } = require('../database');
const { createApp } = require('../src/app');

async function boot({ today = '2026-10-15', file = ':memory:' } = {}) {
  const db = openDatabase(file);
  const state = { today };
  const app = createApp({ db, clock: () => state.today });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, path, body) {
    const res = await fetch(`${base}/api${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json()) };
  }
  const t = {
    db, state, call,
    setBudget: (y, m, amountPaise) => call('PUT', `/budgets/${y}/${m}`, { amountPaise }),
    addExpense: (date, amountPaise, description = 'Test', category = 'Food') => call('POST', '/expenses', { date, amountPaise, description, category }),
    finalize: (date) => call('POST', `/days/${date}/finalize`),
    resolve: (date, method) => call('POST', `/days/${date}/resolve`, { method }),
    reopen: (date) => call('POST', `/days/${date}/reopen`, { confirm: true }),
    dash: async (y = 2026, m = 10) => (await call('GET', `/dashboard?year=${y}&month=${m}`)).data,
    balance: () => db.prepare("SELECT COALESCE(SUM(CASE type WHEN 'credit' THEN amount_paise ELSE -amount_paise END),0) AS b FROM reward_transactions").get().b,
    count: (table) => db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c,
    close: async () => { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); db.close(); },
  };
  return t;
}
module.exports = { boot };
