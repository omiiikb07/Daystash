'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { allocate } = require('../src/services/planner');
const { formatINR, isValidPaise } = require('../src/utils/money');
const { daysInMonth, isLeapYear, isValidDate } = require('../src/utils/dates');

test('allocate splits exactly with no rounding loss, remainder to the last days', () => {
  assert.deepEqual(allocate(100, 3), [33, 33, 34]);
  assert.deepEqual(allocate(0, 4), [0, 0, 0, 0]);
  assert.deepEqual(allocate(10, 0), []);
  assert.deepEqual(allocate(-50, 2), [0, 0]);
  for (const [total, n] of [[400000, 31], [50000, 31], [333333, 28], [1, 30], [999999, 29]]) {
    const a = allocate(total, n);
    assert.equal(a.length, n);
    assert.equal(a.reduce((x, y) => x + y, 0), total);
    assert.ok(Math.max(...a) - Math.min(...a) <= 1);
  }
  assert.equal(allocate(400000, 31)[0], 12903); // ₹129.03
});

test('formatINR uses paise and Indian grouping', () => {
  assert.equal(formatINR(12903), '₹129.03');
  assert.equal(formatINR(1234567), '₹12,345.67');
  assert.equal(formatINR(12345678900), '₹12,34,56,789.00');
  assert.equal(formatINR(-5), '-₹0.05');
  assert.equal(formatINR(0), '₹0.00');
});

test('amount validation accepts only positive whole paise', () => {
  for (const bad of [0, -1, 1.5, '10', null, undefined, NaN, Infinity, 1e12]) assert.equal(isValidPaise(bad), false, String(bad));
  assert.equal(isValidPaise(1), true);
});

test('calendar helpers: leap years and month lengths', () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2025), false);
  assert.equal(isLeapYear(2000), true);
  assert.equal(isLeapYear(2100), false);
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2025, 2), 28);
  assert.equal(daysInMonth(2026, 4), 30);
  assert.equal(daysInMonth(2026, 10), 31);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('2026/10/01'), false);
});
