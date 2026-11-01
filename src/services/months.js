'use strict';
const { monthDates, pad } = require('../utils/dates');
const { conflict } = require('../utils/errors');
const { formatINR } = require('../utils/money');

module.exports = function createMonths({ db, clock, planner, rewards, expenses, analytics }) {
  function dashboard(year, month) {
    const plan = planner.getPlan(year, month);
    const dates = monthDates(year, month);
    const today = clock();
    const spentPaise = db.prepare('SELECT COALESCE(SUM(amount_paise), 0) AS s FROM expenses WHERE expense_date BETWEEN ? AND ?')
      .get(dates[0], dates[dates.length - 1]).s;
    const budget = db.prepare('SELECT * FROM budgets WHERE year = ? AND month = ?').get(year, month);
    const balancePaise = rewards.balance();
    const isCurrentMonth = today.startsWith(`${year}-${pad(month)}-`);
    const todayDay = isCurrentMonth ? plan.days.find((d) => d.date === today) : null;
    const focusDay = todayDay && todayDay.status === 'open'
      ? todayDay
      : plan.days.find((d) => d.status === 'open' && (!isCurrentMonth || d.date > today)) || null;

    const pendingResolutions = plan.days.filter((d) => d.resolution === 'pending').map((d) => ({
      date: d.date, targetPaise: d.targetPaise, actualPaise: d.actualPaise, overspendPaise: d.overspendPaise,
      eligibleDays: plan.days.filter((x) => x.status === 'open' && x.date > d.date).length, // open days AFTER this date (needed to adjust)
      sharedDays: plan.openDays, // every open day shares the adjustment (the pool is split evenly)
      perDayImpactPaise: plan.openDays ? Math.ceil(d.overspendPaise / plan.openDays) : 0,
      canCoverWithRewards: balancePaise >= d.overspendPaise,
    }));

    const awaiting = plan.days.filter((d) => d.status === 'open' && d.canFinalize && d.date < today && d.actualPaise > 0);
    // Only days with spending logged are suggested. Empty days stay finalizable in Daily records, but we don't nag about them.

    const adjustments = db.prepare(`SELECT a.*, r.record_date FROM target_adjustments a JOIN daily_records r ON r.id = a.daily_record_id
      WHERE a.year = ? AND a.month = ? ORDER BY a.id DESC`).all(year, month).map((a) => ({
      id: a.id, date: a.record_date, amountPaise: a.amount_paise, eligibleDays: a.eligible_days,
      targetBeforePaise: a.target_before_paise, targetAfterPaise: a.target_after_paise, reversed: !!a.reversed_at, createdAt: a.created_at,
    }));

    return {
      year, month, today, isCurrentMonth,
      budget: budget ? { amountPaise: budget.amount_paise, updatedAt: budget.updated_at } : null,
      totals: {
        spentPaise,
        remainingPaise: budget ? budget.amount_paise - spentPaise : null,
        overspentPaise: budget ? Math.max(0, spentPaise - budget.amount_paise) : 0,
        percentUsed: budget ? Math.round((spentPaise / budget.amount_paise) * 1000) / 10 : 0,
      },
      plan, todayDay, focusDay, pendingResolutions, awaiting, adjustments,
      rewards: { balancePaise, ...rewards.monthTotals(year, month), ...rewards.allTimeTotals(), recent: rewards.recent(5), transactions: rewards.list(year, month) },
      categories: analytics.categories(dates[0], dates[dates.length - 1]),
      expenses: expenses.list(year, month),
    };
  }

  function history() {
    return db.prepare(`
      WITH ym AS (
        SELECT year, month FROM budgets
        UNION SELECT year, month FROM daily_records
        UNION SELECT CAST(substr(expense_date, 1, 4) AS INTEGER), CAST(substr(expense_date, 6, 2) AS INTEGER) FROM expenses
      )
      SELECT y.year, y.month,
        (SELECT amount_paise FROM budgets b WHERE b.year = y.year AND b.month = y.month) AS budget_paise,
        (SELECT COALESCE(SUM(amount_paise), 0) FROM expenses WHERE substr(expense_date, 1, 7) = printf('%04d-%02d', y.year, y.month)) AS spent_paise,
        (SELECT COUNT(*) FROM daily_records d WHERE d.year = y.year AND d.month = y.month AND d.status = 'finalized') AS finalized_days,
        (SELECT COALESCE(SUM(CASE kind WHEN 'earn' THEN amount_paise WHEN 'earn_reversal' THEN -amount_paise ELSE 0 END), 0)
           FROM reward_transactions t WHERE t.year = y.year AND t.month = y.month) AS earned_paise,
        (SELECT COALESCE(SUM(CASE kind WHEN 'cover' THEN amount_paise WHEN 'cover_reversal' THEN -amount_paise ELSE 0 END), 0)
           FROM reward_transactions t WHERE t.year = y.year AND t.month = y.month) AS used_paise
      FROM ym y ORDER BY y.year DESC, y.month DESC`).all().map((r) => ({
      year: r.year, month: r.month, budgetPaise: r.budget_paise, spentPaise: r.spent_paise,
      finalizedDays: r.finalized_days, rewardsEarnedPaise: r.earned_paise, rewardsUsedPaise: r.used_paise,
    }));
  }

  /**
   * Reset policy: delete the month's expenses, daily records, reward ledger entries and adjustments.
   * The month's budget is kept. Rewards the month earned are removed from the buffer and rewards it used are
   * given back. If removing them would make the buffer negative (they were spent in another month), the reset
   * is refused and nothing changes. Everything runs in one transaction.
   */
  function reset(year, month) {
    const dates = monthDates(year, month);
    return db.transaction(() => {
      const recIds = 'SELECT id FROM daily_records WHERE year = ? AND month = ?';
      const net = db.prepare(`SELECT COALESCE(SUM(CASE type WHEN 'credit' THEN amount_paise ELSE -amount_paise END), 0) AS n
        FROM reward_transactions WHERE daily_record_id IN (${recIds})`).get(year, month).n;
      if (net > 0 && rewards.balance() - net < 0) {
        throw conflict('RESET_WOULD_OVERDRAW',
          `This month earned ${formatINR(net)} in rewards, but only ${formatINR(rewards.balance())} is left in the Rewards Buffer (the rest was used in other months). Reset was cancelled.`);
      }
      const counts = {};
      counts.rewardTransactions = db.prepare(`DELETE FROM reward_transactions WHERE daily_record_id IN (${recIds})`).run(year, month).changes;
      counts.adjustments = db.prepare(`DELETE FROM target_adjustments WHERE daily_record_id IN (${recIds})`).run(year, month).changes;
      db.prepare(`DELETE FROM correction_log WHERE daily_record_id IN (${recIds})`).run(year, month);
      counts.dailyRecords = db.prepare('DELETE FROM daily_records WHERE year = ? AND month = ?').run(year, month).changes;
      counts.expenses = db.prepare('DELETE FROM expenses WHERE expense_date BETWEEN ? AND ?').run(dates[0], dates[dates.length - 1]).changes;
      return { year, month, ...counts, rewardsBalancePaise: rewards.balance() };
    })();
  }

  return { dashboard, history, reset };
};
