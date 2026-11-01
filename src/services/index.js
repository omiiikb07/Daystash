'use strict';
const createPlanner = require('./planner');
const createBudgets = require('./budgets');
const createExpenses = require('./expenses');
const createRewards = require('./rewards');
const createDays = require('./days');
const createMonths = require('./months');
const createAnalytics = require('./analytics');

function createServices({ db, clock }) {
  const planner = createPlanner({ db, clock });
  const budgets = createBudgets({ db });
  const rewards = createRewards({ db });
  const expenses = createExpenses({ db });
  const days = createDays({ db, clock, planner, rewards });
  const analytics = createAnalytics({ db, clock });
  const months = createMonths({ db, clock, planner, rewards, expenses, analytics });
  return { planner, budgets, expenses, rewards, days, months, analytics };
}
module.exports = { createServices };
