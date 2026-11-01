'use strict';
const { badRequest } = require('../utils/errors');
const { daysInMonth } = require('../utils/dates');

const serialize = (r) => (!r ? null : {
  year: r.year, month: r.month, amountPaise: r.amount_paise, startDay: r.start_day, createdAt: r.created_at, updatedAt: r.updated_at,
});

module.exports = function createBudgets({ db }) {
  const raw = (year, month) => db.prepare('SELECT * FROM budgets WHERE year = ? AND month = ?').get(year, month);
  const get = (year, month) => serialize(raw(year, month));

  // startDay is optional: omitted keeps the existing value (or 1 for a new budget).
  function set(year, month, amountPaise, startDay) {
    const existing = raw(year, month);
    const sd = startDay === undefined || startDay === null ? (existing ? existing.start_day : 1) : startDay;
    if (!Number.isInteger(sd) || sd < 1 || sd > daysInMonth(year, month)) {
      throw badRequest('INVALID_START_DAY', `Start day must be a whole number from 1 to ${daysInMonth(year, month)}`);
    }
    db.prepare(`INSERT INTO budgets (year, month, amount_paise, start_day) VALUES (?, ?, ?, ?)
      ON CONFLICT (year, month) DO UPDATE SET amount_paise = excluded.amount_paise, start_day = excluded.start_day,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`).run(year, month, amountPaise, sd);
    return get(year, month);
  }
  return { get, set };
};
