'use strict';
const { conflict } = require('../utils/errors');
const { formatINR } = require('../utils/money');

const serialize = (r) => ({
  id: r.id, date: r.txn_date, type: r.type, kind: r.kind, amountPaise: r.amount_paise, reason: r.reason,
  dailyRecordId: r.daily_record_id, createdAt: r.created_at,
});

module.exports = function createRewards({ db }) {
  // Balance is ALWAYS derived from the ledger, never stored separately.
  const balance = () => db.prepare(
    "SELECT COALESCE(SUM(CASE type WHEN 'credit' THEN amount_paise ELSE -amount_paise END), 0) AS b FROM reward_transactions"
  ).get().b;

  function add({ date, type, kind, amountPaise, reason, recordId, cycle, year, month }) {
    if (type === 'debit' && balance() < amountPaise) {
      throw conflict('INSUFFICIENT_REWARDS',
        `Rewards Buffer has ${formatINR(balance())} but ${formatINR(amountPaise)} is needed`);
    }
    db.prepare(`INSERT INTO reward_transactions (txn_date, type, kind, amount_paise, reason, daily_record_id, cycle, year, month)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(date, type, kind, amountPaise, reason, recordId, cycle, year, month);
  }

  const list = (year, month) => db.prepare('SELECT * FROM reward_transactions WHERE year = ? AND month = ? ORDER BY id DESC')
    .all(year, month).map(serialize);

  // Net rewards earned / spent in a month (reversals subtract from the original entry).
  function monthTotals(year, month) {
    const r = db.prepare(`SELECT
      COALESCE(SUM(CASE kind WHEN 'earn' THEN amount_paise WHEN 'earn_reversal' THEN -amount_paise ELSE 0 END), 0) AS earned,
      COALESCE(SUM(CASE kind WHEN 'cover' THEN amount_paise WHEN 'cover_reversal' THEN -amount_paise ELSE 0 END), 0) AS spent
      FROM reward_transactions WHERE year = ? AND month = ?`).get(year, month);
    return { earnedPaise: r.earned, spentPaise: r.spent };
  }

  // All-time totals, net of reversals. balance = earned - used always holds.
  function allTimeTotals() {
    const r = db.prepare(`SELECT
      COALESCE(SUM(CASE kind WHEN 'earn' THEN amount_paise WHEN 'earn_reversal' THEN -amount_paise ELSE 0 END), 0) AS earned,
      COALESCE(SUM(CASE kind WHEN 'cover' THEN amount_paise WHEN 'cover_reversal' THEN -amount_paise ELSE 0 END), 0) AS used
      FROM reward_transactions`).get();
    return { totalEarnedPaise: r.earned, totalUsedPaise: r.used };
  }
  const recent = (limit = 5) => db.prepare('SELECT * FROM reward_transactions ORDER BY id DESC LIMIT ?').all(limit).map(serialize);

  return { balance, add, list, monthTotals, allTimeTotals, recent };
};
