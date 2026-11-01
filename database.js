'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.join(__dirname, 'database', 'daystash.db');
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

// Money columns are INTEGER paise. Constraints enforce the business rules at the database level too.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  start_day INTEGER NOT NULL DEFAULT 1 CHECK (start_day BETWEEN 1 AND 31), -- first day of the month the plan covers
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW}),
  UNIQUE (year, month)
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  description TEXT NOT NULL CHECK (length(trim(description)) > 0),
  category TEXT NOT NULL DEFAULT 'Other',
  expense_date TEXT NOT NULL CHECK (expense_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (expense_date);

-- One row per calendar day that has ever been finalized. 'open' rows are days that were reopened.
CREATE TABLE IF NOT EXISTS daily_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_date TEXT NOT NULL UNIQUE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','finalized')),
  cycle INTEGER NOT NULL DEFAULT 0,               -- increments every time the day is finalized
  target_paise INTEGER NOT NULL DEFAULT 0,        -- target snapshot used at finalization
  actual_paise INTEGER NOT NULL DEFAULT 0,
  outcome TEXT CHECK (outcome IN ('under','exact','over')),
  reward_paise INTEGER NOT NULL DEFAULT 0,
  overspend_paise INTEGER NOT NULL DEFAULT 0,
  resolution TEXT NOT NULL DEFAULT 'none' CHECK (resolution IN ('none','pending','rewards','targets','absorbed')),
  charged_paise INTEGER NOT NULL DEFAULT 0,       -- amount this day removes from the month's allocatable pool
  finalized_at TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_daily_month ON daily_records (year, month);

-- Append-only Rewards Buffer ledger. balance = SUM(credits) - SUM(debits).
CREATE TABLE IF NOT EXISTS reward_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  txn_date TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('credit','debit')),
  kind TEXT NOT NULL CHECK (kind IN ('earn','earn_reversal','cover','cover_reversal')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  reason TEXT NOT NULL,
  daily_record_id INTEGER NOT NULL REFERENCES daily_records (id),
  cycle INTEGER NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  UNIQUE (daily_record_id, cycle, kind)           -- a day can never earn / spend the same reward twice
);
CREATE INDEX IF NOT EXISTS idx_reward_month ON reward_transactions (year, month);

CREATE TABLE IF NOT EXISTS target_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  daily_record_id INTEGER NOT NULL REFERENCES daily_records (id),
  cycle INTEGER NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  eligible_days INTEGER NOT NULL,
  target_before_paise INTEGER NOT NULL,
  target_after_paise INTEGER NOT NULL,
  reversed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  UNIQUE (daily_record_id, cycle)
);

CREATE TABLE IF NOT EXISTS correction_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  daily_record_id INTEGER NOT NULL REFERENCES daily_records (id),
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);

-- Last line of defence: the buffer can never go below zero, even if application code has a bug.
CREATE TRIGGER IF NOT EXISTS trg_buffer_never_negative
BEFORE INSERT ON reward_transactions
WHEN NEW.type = 'debit' AND
  (SELECT COALESCE(SUM(CASE type WHEN 'credit' THEN amount_paise ELSE -amount_paise END), 0) FROM reward_transactions) < NEW.amount_paise
BEGIN
  SELECT RAISE(ABORT, 'NEGATIVE_BALANCE');
END;
`;

// Additive, idempotent migrations for databases created by earlier versions. Never drops or rewrites data.
function migrate(db) {
  const cols = db.prepare('PRAGMA table_info(budgets)').all().map((c) => c.name);
  if (!cols.includes('start_day')) {
    db.exec('ALTER TABLE budgets ADD COLUMN start_day INTEGER NOT NULL DEFAULT 1 CHECK (start_day BETWEEN 1 AND 31)');
  }
}

function openDatabase(file = DEFAULT_DB_PATH) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  if (file !== ':memory:') db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

module.exports = { openDatabase, DEFAULT_DB_PATH };
