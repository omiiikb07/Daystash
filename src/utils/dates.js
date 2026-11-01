'use strict';
// Dates are plain 'YYYY-MM-DD' strings (local calendar dates, no timezone maths).
const { badRequest } = require('./errors');

const pad = (n) => String(n).padStart(2, '0');
const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y, m) => [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
const toDate = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

function parseDate(s) {
  const [year, month, day] = s.split('-').map(Number);
  return { year, month, day };
}

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// '2026-10-31' -> '31 Oct 2026' (for human-readable ledger reasons)
function formatDay(s) { const { year, month, day } = parseDate(s); return `${day} ${MON[month - 1]} ${year}`; }

function monthDates(y, m) {
  return Array.from({ length: daysInMonth(y, m) }, (_, i) => toDate(y, m, i + 1));
}

function localToday() {
  const d = new Date();
  return toDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function parseYearMonth(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || y < 2000 || y > 2100 || !Number.isInteger(m) || m < 1 || m > 12) {
    throw badRequest('INVALID_MONTH', 'Year must be 2000-2100 and month must be 1-12');
  }
  return { year: y, month: m };
}

module.exports = { pad, isLeapYear, daysInMonth, toDate, isValidDate, parseDate, monthDates, formatDay, localToday, parseYearMonth };
