'use strict';
// All money is stored and calculated as INTEGER PAISE (1 rupee = 100 paise).
// Integers avoid floating point errors such as 0.1 + 0.2 !== 0.3.
const { badRequest } = require('./errors');

const MAX_PAISE = 1_000_000_000; // ₹1 crore per single amount

function isValidPaise(v) {
  return Number.isSafeInteger(v) && v > 0 && v <= MAX_PAISE;
}

function requirePaise(v, field = 'amountPaise') {
  if (!isValidPaise(v)) {
    throw badRequest('INVALID_AMOUNT', `${field} must be a whole number of paise between 1 and ${MAX_PAISE}`);
  }
  return v;
}

// 1234567 -> "₹12,345.67" (Indian digit grouping)
function formatINR(paise) {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const rupees = String(Math.floor(abs / 100));
  const p = String(abs % 100).padStart(2, '0');
  const last3 = rupees.slice(-3);
  const rest = rupees.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
  return `${neg ? '-' : ''}₹${grouped}.${p}`;
}

module.exports = { MAX_PAISE, isValidPaise, requirePaise, formatINR };
