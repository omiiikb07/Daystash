'use strict';
const { badRequest, conflict } = require('../utils/errors');
const { isValidDate, parseDate, formatDay } = require('../utils/dates');
const { formatINR } = require('../utils/money');
const { evaluate } = require('./planner');

module.exports = function createDays({ db, clock, planner, rewards }) {
  const getRecord = (date) => db.prepare('SELECT * FROM daily_records WHERE record_date = ?').get(date);
  const nowIso = () => new Date().toISOString();

  function requireDate(date) {
    if (!isValidDate(date)) throw badRequest('INVALID_DATE', 'Date must be a real calendar date in YYYY-MM-DD format');
  }
  function dayView(date) {
    const { year, month } = parseDate(date);
    return planner.getPlan(year, month).days.find((d) => d.date === date);
  }

  // Why a day cannot be finalized right now (null = it can). Shared by preview() and finalize().
  function blockReason(plan, day, date) {
    if (date > clock()) return { status: 400, code: 'DATE_IN_FUTURE', message: 'A day cannot be finalized before it has started' };
    if (!plan.hasBudget) return { status: 400, code: 'NO_BUDGET', message: 'Set a budget for this month before finalizing a day' };
    if (day.status === 'finalized') return { status: 409, code: 'ALREADY_FINALIZED', message: `${date} is already finalized` };
    if (day.status === 'untracked') return { status: 400, code: 'DAY_NOT_TRACKED', message: `${date} is before this month's tracking start day, so it has no target` };
    return null;
  }
  const throwReason = (r) => { throw (r.status === 409 ? conflict : badRequest)(r.code, r.message); };

  /** What finalizing a day would do right now, without changing anything. */
  function preview(date) {
    requireDate(date);
    const { year, month } = parseDate(date);
    const plan = planner.getPlan(year, month);
    const day = plan.days.find((d) => d.date === date);
    const ev = day.status === 'finalized'
      ? { outcome: day.outcome, rewardPaise: day.rewardPaise, overspendPaise: day.overspendPaise }
      : evaluate(day.targetPaise, day.actualPaise);
    const balance = rewards.balance();
    return {
      date, status: day.status, targetPaise: day.targetPaise, actualPaise: day.actualPaise, ...ev,
      balanceNowPaise: balance, balanceAfterPaise: balance + ev.rewardPaise, blocked: blockReason(plan, day, date),
    };
  }

  /** Lock in a day: snapshot its target, classify the result, credit a reward if underspent. */
  function finalize(date) {
    requireDate(date);
    return db.transaction(() => {
      const { year, month } = parseDate(date);
      const plan = planner.getPlan(year, month);
      const day = plan.days.find((d) => d.date === date);
      const blocked = blockReason(plan, day, date);
      if (blocked) throwReason(blocked);

      const existing = getRecord(date);
      const target = day.targetPaise;
      const actual = day.actualPaise;
      const { outcome, rewardPaise: reward, overspendPaise: overspend } = evaluate(target, actual);
      const cycle = (existing ? existing.cycle : 0) + 1;

      db.prepare(`INSERT INTO daily_records
          (record_date, year, month, status, cycle, target_paise, actual_paise, outcome, reward_paise, overspend_paise, resolution, charged_paise, finalized_at)
        VALUES (@date, @year, @month, 'finalized', @cycle, @target, @actual, @outcome, @reward, @overspend, @resolution, @target, @at)
        ON CONFLICT (record_date) DO UPDATE SET status = 'finalized', cycle = excluded.cycle, target_paise = excluded.target_paise,
          actual_paise = excluded.actual_paise, outcome = excluded.outcome, reward_paise = excluded.reward_paise,
          overspend_paise = excluded.overspend_paise, resolution = excluded.resolution, charged_paise = excluded.charged_paise,
          finalized_at = excluded.finalized_at, resolved_at = NULL`)
        .run({ date, year, month, cycle, target, actual, outcome, reward, overspend, resolution: outcome === 'over' ? 'pending' : 'none', at: nowIso() });

      if (reward > 0) {
        rewards.add({ date, type: 'credit', kind: 'earn', amountPaise: reward, reason: `${formatDay(date)}: spent ${formatINR(actual)} against a ${formatINR(target)} target`,
          recordId: getRecord(date).id, cycle, year, month });
      }
      return dayView(date);
    })();
  }

  /** Resolve an overspent day exactly once: 'rewards' | 'targets' | 'absorb'. */
  function resolve(date, method) {
    requireDate(date);
    if (!['rewards', 'targets', 'absorb'].includes(method)) {
      throw badRequest('INVALID_METHOD', "method must be 'rewards', 'targets' or 'absorb'");
    }
    return db.transaction(() => {
      const rec = getRecord(date);
      if (!rec || rec.status !== 'finalized') throw conflict('DAY_NOT_FINALIZED', `${date} has not been finalized`);
      if (rec.outcome !== 'over') throw conflict('NOT_OVERSPENT', `${date} was not overspent`);
      if (rec.resolution !== 'pending') throw conflict('ALREADY_RESOLVED', `Overspending on ${date} is already resolved (${rec.resolution})`);

      const { year, month } = parseDate(date);
      const over = rec.overspend_paise;
      const eligible = planner.getPlan(year, month).days.filter((d) => d.status === 'open' && d.date > date);

      if (method === 'rewards') {
        rewards.add({ date, type: 'debit', kind: 'cover', amountPaise: over, reason: `Covered the overspend on ${formatDay(date)}`,
          recordId: rec.id, cycle: rec.cycle, year, month });
        db.prepare("UPDATE daily_records SET resolution = 'rewards', resolved_at = ? WHERE id = ?").run(nowIso(), rec.id);
      } else if (method === 'targets') {
        if (!eligible.length) throw conflict('NO_ELIGIBLE_DAYS', 'No open days remain after this date, so targets cannot be adjusted');
        const before = eligible[0];
        db.prepare("UPDATE daily_records SET resolution = 'targets', charged_paise = actual_paise, resolved_at = ? WHERE id = ?").run(nowIso(), rec.id);
        const planAfter = planner.getPlan(year, month);
        const after = planAfter.days.find((d) => d.date === before.date);
        // eligible_days = number of open days that now share the adjustment (the pool is split across all of them).
        db.prepare(`INSERT INTO target_adjustments (daily_record_id, cycle, year, month, amount_paise, eligible_days, target_before_paise, target_after_paise)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(rec.id, rec.cycle, year, month, over, planAfter.openDays, before.targetPaise, after.targetPaise);
      } else {
        if (eligible.length) throw conflict('ABSORB_NOT_ALLOWED', 'There are still open days left, so choose rewards or adjust future targets');
        db.prepare("UPDATE daily_records SET resolution = 'absorbed', charged_paise = actual_paise, resolved_at = ? WHERE id = ?").run(nowIso(), rec.id);
      }
      return dayView(date);
    })();
  }

  /** Explicit correction path: undo the day's financial effects so its expenses can be edited again. */
  function reopen(date) {
    requireDate(date);
    return db.transaction(() => {
      const rec = getRecord(date);
      if (!rec || rec.status !== 'finalized') throw conflict('DAY_NOT_FINALIZED', `${date} is not finalized`);
      const { year, month } = parseDate(date);
      const find = (kind) => db.prepare('SELECT * FROM reward_transactions WHERE daily_record_id = ? AND cycle = ? AND kind = ?').get(rec.id, rec.cycle, kind);

      const earn = find('earn');
      if (earn) {
        if (rewards.balance() < earn.amount_paise) {
          throw conflict('REOPEN_BLOCKED',
            `Cannot reopen ${date}: it earned ${formatINR(earn.amount_paise)} but only ${formatINR(rewards.balance())} is left in the Rewards Buffer (the rest was already used).`);
        }
        rewards.add({ date, type: 'debit', kind: 'earn_reversal', amountPaise: earn.amount_paise, reason: `Reward reversed: ${formatDay(date)} was reopened`,
          recordId: rec.id, cycle: rec.cycle, year, month });
      }
      const cover = find('cover');
      if (cover) {
        rewards.add({ date, type: 'credit', kind: 'cover_reversal', amountPaise: cover.amount_paise, reason: `Rewards returned: ${formatDay(date)} was reopened`,
          recordId: rec.id, cycle: rec.cycle, year, month });
      }
      db.prepare('UPDATE target_adjustments SET reversed_at = ? WHERE daily_record_id = ? AND cycle = ? AND reversed_at IS NULL').run(nowIso(), rec.id, rec.cycle);
      db.prepare('INSERT INTO correction_log (daily_record_id, action, detail) VALUES (?, ?, ?)').run(rec.id, 'reopen', JSON.stringify({
        cycle: rec.cycle, target: rec.target_paise, actual: rec.actual_paise, outcome: rec.outcome, reward: rec.reward_paise,
        overspend: rec.overspend_paise, resolution: rec.resolution,
      }));
      db.prepare(`UPDATE daily_records SET status = 'open', target_paise = 0, actual_paise = 0, outcome = NULL, reward_paise = 0,
        overspend_paise = 0, resolution = 'none', charged_paise = 0, finalized_at = NULL, resolved_at = NULL WHERE id = ?`).run(rec.id);
      return dayView(date);
    })();
  }

  return { preview, finalize, resolve, reopen };
};
