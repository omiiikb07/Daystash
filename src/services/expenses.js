'use strict';
const { badRequest, notFound, conflict } = require('../utils/errors');
const { requirePaise } = require('../utils/money');
const { isValidDate, monthDates } = require('../utils/dates');
const { CATEGORIES } = require('../config');

const serialize = (r) => ({
  id: r.id, amountPaise: r.amount_paise, description: r.description, category: r.category,
  date: r.expense_date, createdAt: r.created_at, updatedAt: r.updated_at, locked: !!r.locked,
});
const SELECT = `SELECT e.*, EXISTS (SELECT 1 FROM daily_records d WHERE d.record_date = e.expense_date AND d.status = 'finalized') AS locked FROM expenses e`;

function validate(body) {
  if (!body || typeof body !== 'object') throw badRequest('INVALID_BODY', 'Request body must be a JSON object');
  const amountPaise = requirePaise(body.amountPaise);
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!description) throw badRequest('INVALID_DESCRIPTION', 'Description is required');
  if (description.length > 200) throw badRequest('INVALID_DESCRIPTION', 'Description must be 200 characters or fewer');
  const category = body.category === undefined ? 'Other' : body.category;
  if (!CATEGORIES.includes(category)) throw badRequest('INVALID_CATEGORY', `Category must be one of: ${CATEGORIES.join(', ')}`);
  if (!isValidDate(body.date)) throw badRequest('INVALID_DATE', 'Date must be a real calendar date in YYYY-MM-DD format');
  return { amountPaise, description, category, date: body.date };
}

function parseId(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw badRequest('INVALID_ID', 'Expense id must be a positive whole number');
  return n;
}

module.exports = function createExpenses({ db }) {
  const row = (id) => db.prepare(`${SELECT} WHERE e.id = ?`).get(id);
  const isFinalized = (date) => !!db.prepare("SELECT 1 FROM daily_records WHERE record_date = ? AND status = 'finalized'").get(date);
  const lock = (date) => {
    if (isFinalized(date)) {
      throw conflict('DAY_FINALIZED', `${date} is finalized. Reopen the day before adding, changing or deleting its expenses.`, { date });
    }
  };

  function list(year, month) {
    const dates = monthDates(year, month);
    return db.prepare(`${SELECT} WHERE e.expense_date BETWEEN ? AND ? ORDER BY e.expense_date DESC, e.id DESC`)
      .all(dates[0], dates[dates.length - 1]).map(serialize);
  }

  function create(body) {
    const v = validate(body);
    lock(v.date);
    const info = db.prepare('INSERT INTO expenses (amount_paise, description, category, expense_date) VALUES (?, ?, ?, ?)')
      .run(v.amountPaise, v.description, v.category, v.date);
    return serialize(row(info.lastInsertRowid));
  }

  function update(id, body) {
    id = parseId(id);
    const existing = row(id);
    if (!existing) throw notFound('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`);
    const v = validate(body);
    lock(existing.expense_date);
    lock(v.date);
    db.prepare(`UPDATE expenses SET amount_paise = ?, description = ?, category = ?, expense_date = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(v.amountPaise, v.description, v.category, v.date, id);
    return serialize(row(id));
  }

  function remove(id) {
    id = parseId(id);
    const existing = row(id);
    if (!existing) throw notFound('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`);
    lock(existing.expense_date);
    db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
    return { id, deleted: true };
  }

  return { list, create, update, remove };
};
