'use strict';
const express = require('express');
const { badRequest } = require('../utils/errors');
const { requirePaise } = require('../utils/money');
const { parseYearMonth, parseDate } = require('../utils/dates');

module.exports = function buildRouter(s, clock) {
  const r = express.Router();
  const send = (fn, status = 200) => (req, res, next) => {
    try { res.status(status).json({ ok: true, data: fn(req) }); } catch (e) { next(e); }
  };
  // Year/month come from the URL path, the query string, or default to the current month.
  const ym = (req) => {
    const src = req.params.year !== undefined ? req.params : req.query;
    const cur = parseDate(clock());
    return parseYearMonth(src.year ?? cur.year, src.month ?? cur.month);
  };
  const needConfirm = (req) => {
    if (!req.body || req.body.confirm !== true) throw badRequest('CONFIRMATION_REQUIRED', 'This action must be confirmed with { "confirm": true }');
  };

  r.get('/health', send(() => ({ status: 'ok', today: clock() })));

  r.get('/dashboard', send((req) => { const { year, month } = ym(req); return s.months.dashboard(year, month); }));
  r.get('/history', send(() => s.months.history()));
  r.get('/history/year', send((req) => {
    const m = req.query.month;
    const { year, month } = parseYearMonth(req.query.year ?? parseDate(clock()).year, m === undefined || m === '' || m === 'all' ? 1 : m);
    return s.analytics.yearSummary(year, m === undefined || m === '' || m === 'all' ? null : month);
  }));

  r.get('/budgets/:year/:month', send((req) => { const { year, month } = ym(req); return { budget: s.budgets.get(year, month) || null }; }));
  r.put('/budgets/:year/:month', send((req) => {
    const { year, month } = ym(req);
    const body = req.body || {};
    const amountPaise = requirePaise(body.amountPaise);
    const budget = s.budgets.set(year, month, amountPaise, body.startDay);
    const plan = s.planner.getPlan(year, month);
    return { budget, initialTargetPaise: plan.initialTargetPaise, shortfallPaise: plan.shortfallPaise };
  }));

  r.get('/expenses', send((req) => { const { year, month } = ym(req); return s.expenses.list(year, month); }));
  r.post('/expenses', send((req) => s.expenses.create(req.body), 201));
  r.put('/expenses/:id', send((req) => s.expenses.update(req.params.id, req.body)));
  r.delete('/expenses/:id', send((req) => s.expenses.remove(req.params.id)));

  r.get('/days', send((req) => { const { year, month } = ym(req); return s.planner.getPlan(year, month); }));
  r.get('/days/:date/preview', send((req) => s.days.preview(req.params.date)));
  r.post('/days/:date/finalize', send((req) => s.days.finalize(req.params.date)));
  r.post('/days/:date/resolve', send((req) => s.days.resolve(req.params.date, (req.body || {}).method)));
  r.post('/days/:date/reopen', send((req) => { needConfirm(req); return s.days.reopen(req.params.date); }));

  r.get('/rewards', send((req) => {
    const { year, month } = ym(req);
    return { balancePaise: s.rewards.balance(), ...s.rewards.monthTotals(year, month), ...s.rewards.allTimeTotals(), transactions: s.rewards.list(year, month) };
  }));
  r.get('/adjustments', send((req) => { const { year, month } = ym(req); return s.months.dashboard(year, month).adjustments; }));

  r.post('/months/:year/:month/reset', send((req) => { needConfirm(req); const { year, month } = ym(req); return s.months.reset(year, month); }));

  return r;
};
