'use strict';
// The planner is the single place where daily targets and day outcomes are calculated.
// The frontend never repeats this maths; it only displays what these functions return.
const { monthDates } = require('../utils/dates');
const { ZERO_SPEND_DAYS_EARN_REWARDS } = require('../config');

// Split `total` paise over `n` days with no rounding loss.
// Every day gets floor(total / n); the leftover paise go, one each, to the LAST days.
// Example: 400000 paise over 31 days -> first 24 days 12903, last 7 days 12904 (sum is exactly 400000).
function allocate(total, n) {
  if (n <= 0) return [];
  const t = Math.max(0, total);
  const base = Math.floor(t / n);
  const rem = t % n;
  return Array.from({ length: n }, (_, i) => base + (i >= n - rem ? 1 : 0));
}

// Classify a day: under / exact / over, with the reward or overspend it would produce.
// Used for BOTH the finalize preview and the real finalization, so they can never disagree.
function evaluate(targetPaise, actualPaise) {
  const outcome = actualPaise < targetPaise ? 'under' : actualPaise === targetPaise ? 'exact' : 'over';
  const rewardEligible = outcome === 'under' && (actualPaise > 0 || ZERO_SPEND_DAYS_EARN_REWARDS);
  return {
    outcome,
    rewardPaise: rewardEligible ? targetPaise - actualPaise : 0,
    overspendPaise: outcome === 'over' ? actualPaise - targetPaise : 0,
  };
}

const percentOf = (actual, target) => (target > 0 ? Math.round((actual / target) * 100) : actual > 0 ? 100 : 0);

module.exports = function createPlanner({ db, clock }) {
  /**
   * Month plan:
   *   untracked days = days before the budget's start_day that were never finalized (they get no target;
   *                    anything spent on them is deducted from the pool)
   *   pool           = budget - SUM(charged of finalized days) - spending on untracked days
   *   open days      = tracked days that are not finalized
   *   open target    = allocate(pool, number of open days)
   * Finalized days keep their stored snapshot target and never change.
   */
  function getPlan(year, month) {
    const today = clock();
    const budget = db.prepare('SELECT amount_paise, start_day FROM budgets WHERE year = ? AND month = ?').get(year, month);
    const budgetPaise = budget ? budget.amount_paise : 0;
    const startDay = budget ? budget.start_day : 1;
    const dates = monthDates(year, month);

    const rows = db.prepare('SELECT * FROM daily_records WHERE year = ? AND month = ?').all(year, month);
    const finalized = new Map(rows.filter((r) => r.status === 'finalized').map((r) => [r.record_date, r]));
    const recorded = new Set(rows.map((r) => r.record_date));
    const spent = new Map(
      db.prepare('SELECT expense_date AS d, SUM(amount_paise) AS s FROM expenses WHERE expense_date BETWEEN ? AND ? GROUP BY expense_date')
        .all(dates[0], dates[dates.length - 1]).map((r) => [r.d, r.s])
    );
    const isUntracked = (date) => !recorded.has(date) && Number(date.slice(8)) < startDay;

    let charged = 0;
    for (const r of finalized.values()) charged += r.charged_paise;
    let untrackedSpent = 0;
    let untrackedDays = 0;
    for (const date of dates) {
      if (isUntracked(date)) { untrackedDays += 1; untrackedSpent += spent.get(date) || 0; }
    }

    const rawPool = budgetPaise - charged - untrackedSpent;
    const pool = Math.max(0, rawPool);
    const openDates = dates.filter((d) => !finalized.has(d) && !isUntracked(d));
    const targets = allocate(pool, openDates.length);

    let k = 0;
    const days = dates.map((date) => {
      const r = finalized.get(date);
      if (r) {
        return {
          date, status: 'finalized', targetPaise: r.target_paise, actualPaise: r.actual_paise,
          differencePaise: r.target_paise - r.actual_paise, percentOfTarget: percentOf(r.actual_paise, r.target_paise),
          outcome: r.outcome, rewardPaise: r.reward_paise, overspendPaise: r.overspend_paise,
          resolution: r.resolution, cycle: r.cycle, canFinalize: false,
        };
      }
      const actual = spent.get(date) || 0;
      if (isUntracked(date)) {
        return {
          date, status: 'untracked', targetPaise: 0, actualPaise: actual, differencePaise: 0, percentOfTarget: 0,
          outcome: null, rewardPaise: 0, overspendPaise: 0, resolution: 'none', cycle: 0, canFinalize: false,
        };
      }
      const target = targets[k++];
      const proj = evaluate(target, actual);
      return {
        date, status: 'open', targetPaise: target, actualPaise: actual, differencePaise: target - actual,
        percentOfTarget: percentOf(actual, target), outcome: null, rewardPaise: 0, overspendPaise: 0,
        resolution: 'none', cycle: 0,
        canFinalize: !!budget && date <= today,
        projectedOutcome: proj.outcome, projectedRewardPaise: proj.rewardPaise, projectedOverspendPaise: proj.overspendPaise,
      };
    });

    return {
      year, month, hasBudget: !!budget, budgetPaise, startDay, daysInMonth: dates.length,
      initialTargetPaise: Math.floor(budgetPaise / (dates.length - startDay + 1)),
      chargedPaise: charged, untrackedDays, untrackedSpentPaise: untrackedSpent,
      poolPaise: pool, shortfallPaise: Math.max(0, -rawPool), openDays: openDates.length, days,
    };
  }

  return { getPlan };
};
module.exports.allocate = allocate;
module.exports.evaluate = evaluate;
