'use strict';
// Read-only reporting queries (category totals, yearly summaries). No business rules live here:
// everything is a sum or count over existing records.
const { monthDates } = require('../utils/dates');
const { formatINR } = require('../utils/money');

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

module.exports = function createAnalytics({ db, clock }) {
  function categories(from, to) {
    const rows = db.prepare(`SELECT category, SUM(amount_paise) AS total, COUNT(*) AS n FROM expenses
      WHERE expense_date BETWEEN ? AND ? GROUP BY category ORDER BY total DESC, category`).all(from, to);
    const sum = rows.reduce((s, r) => s + r.total, 0);
    return rows.map((r) => ({ category: r.category, totalPaise: r.total, count: r.n, percent: pct(r.total, sum) }));
  }

  function yearSummary(year, month) {
    const y = String(year);
    const budgets = new Map(db.prepare('SELECT month, amount_paise AS a FROM budgets WHERE year = ?').all(year).map((r) => [r.month, r.a]));
    const spent = new Map(db.prepare(`SELECT CAST(substr(expense_date, 6, 2) AS INTEGER) AS m, SUM(amount_paise) AS s, COUNT(*) AS c
      FROM expenses WHERE expense_date BETWEEN ? AND ? GROUP BY m`).all(`${y}-01-01`, `${y}-12-31`).map((r) => [r.m, r]));
    const fin = new Map(db.prepare(`SELECT month AS m, COUNT(*) AS c, SUM(outcome = 'under') AS u, SUM(outcome = 'over') AS o
      FROM daily_records WHERE year = ? AND status = 'finalized' GROUP BY month`).all(year).map((r) => [r.m, r]));
    const rw = new Map(db.prepare(`SELECT month AS m,
      SUM(CASE kind WHEN 'earn' THEN amount_paise WHEN 'earn_reversal' THEN -amount_paise ELSE 0 END) AS e,
      SUM(CASE kind WHEN 'cover' THEN amount_paise WHEN 'cover_reversal' THEN -amount_paise ELSE 0 END) AS u
      FROM reward_transactions WHERE year = ? GROUP BY month`).all(year).map((r) => [r.m, r]));

    const months = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1; const b = budgets.has(m) ? budgets.get(m) : null; const s = (spent.get(m) || {}).s || 0;
      return {
        month: m, budgetPaise: b, spentPaise: s, expenseCount: (spent.get(m) || {}).c || 0,
        remainingPaise: b === null ? null : b - s, utilizationPercent: b === null ? null : pct(s, b), overBudget: b !== null && s > b,
        finalizedDays: (fin.get(m) || {}).c || 0, underDays: (fin.get(m) || {}).u || 0, overDays: (fin.get(m) || {}).o || 0,
        rewardsEarnedPaise: (rw.get(m) || {}).e || 0, rewardsUsedPaise: (rw.get(m) || {}).u || 0,
      };
    });

    const scope = month ? [months[month - 1]] : months;
    const budgeted = scope.filter((m) => m.budgetPaise !== null);
    const budgetPaise = budgeted.reduce((s, m) => s + m.budgetPaise, 0);
    const spentBudgeted = budgeted.reduce((s, m) => s + m.spentPaise, 0);
    const spentAll = scope.reduce((s, m) => s + m.spentPaise, 0);
    const totals = {
      budgetPaise, spentPaise: spentBudgeted, remainingPaise: budgetPaise - spentBudgeted, budgetedMonths: budgeted.length,
      unbudgetedSpentPaise: spentAll - spentBudgeted, allSpentPaise: spentAll, expenseCount: scope.reduce((s, m) => s + m.expenseCount, 0),
    };

    const range = month ? monthDates(year, month) : [`${y}-01-01`, `${y}-12-31`];
    const cats = categories(range[0], range[range.length - 1]);

    const insights = [];
    const top = cats[0];
    if (month) {
      const m = months[month - 1];
      if (m.budgetPaise !== null) insights.push({ key: 'util', label: 'Budget used', value: m.utilizationPercent, format: 'percent', detail: m.overBudget ? 'Spending is over the monthly budget.' : 'Spending is within the monthly budget.' });
      if (top) insights.push({ key: 'top', label: 'Top category', value: top.category, format: 'text', detail: `${top.percent}% of this month's spending` });
      insights.push({ key: 'days', label: 'Finalized days', value: m.finalizedDays, format: 'count', detail: `${m.underDays} under target, ${m.overDays} over target` });
      insights.push({ key: 'rewards', label: 'Rewards earned', value: m.rewardsEarnedPaise, format: 'paise', detail: `${formatINR(m.rewardsUsedPaise)} used this month` });
    } else {
      const withSpend = months.filter((m) => m.spentPaise > 0);
      if (withSpend.length) {
        const hi = withSpend.reduce((a, b) => (b.spentPaise > a.spentPaise ? b : a));
        insights.push({ key: 'highest', label: 'Highest spending month', value: hi.spentPaise, format: 'paise', month: hi.month, detail: 'Total spent in that month' });
        insights.push({ key: 'average', label: 'Average per active month', value: Math.round(spentAll / withSpend.length), format: 'paise', detail: `Across ${withSpend.length} month${withSpend.length === 1 ? '' : 's'} with spending` });
      }
      if (budgeted.length) {
        insights.push({ key: 'over', label: 'Months over budget', value: budgeted.filter((m) => m.overBudget).length, format: 'count', detail: `Out of ${budgeted.length} budgeted month${budgeted.length === 1 ? '' : 's'}` });
        const saved = budgeted.filter((m) => m.remainingPaise > 0);
        if (saved.length) {
          const best = saved.reduce((a, b) => (b.remainingPaise > a.remainingPaise ? b : a));
          insights.push({ key: 'bestSaving', label: 'Most under budget', value: best.remainingPaise, format: 'paise', month: best.month, detail: 'Budget left over in that month' });
        }
      }
      if (top) insights.push({ key: 'top', label: 'Top category', value: top.category, format: 'text', detail: `${top.percent}% of the year's spending` });
      insights.push({ key: 'rewards', label: 'Rewards earned', value: months.reduce((s, m) => s + m.rewardsEarnedPaise, 0), format: 'paise', detail: 'Net of reversals, all months' });
    }

    const records = month ? db.prepare("SELECT * FROM daily_records WHERE year = ? AND month = ? AND status = 'finalized' ORDER BY record_date").all(year, month).map((r) => ({
      date: r.record_date, targetPaise: r.target_paise, actualPaise: r.actual_paise, outcome: r.outcome, rewardPaise: r.reward_paise,
      overspendPaise: r.overspend_paise, resolution: r.resolution,
    })) : [];

    const years = new Set([year, Number(clock().slice(0, 4))]);
    for (const r of db.prepare(`SELECT year AS y FROM budgets UNION SELECT year FROM daily_records
      UNION SELECT CAST(substr(expense_date, 1, 4) AS INTEGER) FROM expenses`).all()) years.add(r.y);

    return { year, month: month || null, years: [...years].sort((a, b) => b - a), months, totals, categories: cats, insights, records };
  }

  return { categories, yearSummary };
};
