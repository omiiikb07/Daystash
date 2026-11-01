import { api } from './api.js';
import { state, load, shiftMonth, setMonth, emit } from './state.js';
import { inr, fmtDate, parseRupees, pad, MONTHS } from './format.js';
import { toast, confirmDialog, closeDialog } from './ui.js';

const $ = (s) => document.querySelector(s);

// One action at a time: a second click or key press while one is running is ignored (no duplicate requests).
// The screen is always reloaded afterwards, success or failure, so it can never keep showing stale figures.
export async function run(fn) {
  if (state.busy) return;
  state.busy = true; document.body.classList.add('busy');
  try { await fn(); } catch (e) { toast(e.message, 'error'); } finally {
    state.busy = false; document.body.classList.remove('busy');
    await load();
    if (document.activeElement === document.body) $('#view').focus({ preventScroll: true });
  }
}

async function finalizeDay(date) {
  const pv = await api(`/days/${date}/preview`);
  if (pv.blocked) throw new Error(pv.blocked.message);
  const rows = [{ label: 'Day', value: fmtDate(date, { weekday: true }) }, { label: 'Target', value: inr(pv.targetPaise) }, { label: 'Spent', value: inr(pv.actualPaise) }];
  let note;
  if (pv.outcome === 'under') {
    rows.push({ label: 'Reward', value: pv.rewardPaise > 0 ? `+${inr(pv.rewardPaise)}` : 'None' });
    if (pv.rewardPaise > 0) rows.push({ label: 'Rewards Buffer after', value: inr(pv.balanceAfterPaise) });
    note = pv.rewardPaise > 0 ? 'The reward is credited once. You can reopen this day later as long as the reward has not been spent.' : 'No reward: nothing was spent on this day.';
  } else if (pv.outcome === 'exact') {
    rows.push({ label: 'Result', value: 'Exactly on target' }); note = 'No reward and no overspend.';
  } else {
    rows.push({ label: 'Overspend', value: inr(pv.overspendPaise) });
    note = 'After finalizing you will choose how to settle the overspend: use the Rewards Buffer or lower future targets.';
  }
  const ok = await confirmDialog({ title: `Finalize ${fmtDate(date, { weekday: true, year: false })}?`, rows, note, okLabel: 'Finalize day' });
  if (!ok) return;
  const day = await api(`/days/${date}/finalize`, { method: 'POST' });
  if (day.outcome === 'under') toast(day.rewardPaise > 0 ? `Finalized. ${inr(day.rewardPaise)} added to your Rewards Buffer.` : 'Finalized.');
  else if (day.outcome === 'exact') toast('Finalized. Exactly on target.');
  else { toast(`Finalized. Over by ${inr(day.overspendPaise)}: choose how to settle it.`); state.focusBanner = true; }
}

async function resolveDay(date, method) {
  const p = state.data.pendingResolutions.find((x) => x.date === date);
  if (!p) throw new Error('That overspend has already been settled.');
  const base = [{ label: 'Day', value: fmtDate(date, { weekday: true }) }, { label: 'Overspend', value: inr(p.overspendPaise) }];
  const cfg = {
    rewards: { title: 'Use the Rewards Buffer?', rows: [...base, { label: 'Buffer now', value: inr(state.data.rewards.balancePaise) }], note: 'The overspend is deducted from the buffer. Daily targets do not change.', ok: 'Use Rewards Buffer', msg: 'Overspend covered by your Rewards Buffer.' },
    targets: { title: 'Lower future targets?', rows: [...base, { label: 'Open days sharing it', value: String(p.sharedDays) }, { label: 'Each drops by about', value: inr(p.perDayImpactPaise) }], note: 'The Rewards Buffer is not used.', ok: 'Lower targets', msg: 'Future daily targets lowered.' },
    absorb: { title: 'Accept the overspend?', rows: base, note: 'It stays recorded against the month. No targets or rewards change.', ok: 'Accept', msg: 'Overspend accepted.' },
  }[method];
  if (!(await confirmDialog({ title: cfg.title, rows: cfg.rows, note: cfg.note, okLabel: cfg.ok }))) return;
  await api(`/days/${date}/resolve`, { method: 'POST', body: { method } });
  toast(cfg.msg);
}

async function reopenDay(date) {
  const ok = await confirmDialog({
    title: `Reopen ${fmtDate(date, { weekday: true, year: false })}?`,
    intro: 'This undoes the day’s result so you can correct its expenses and finalize again.',
    note: 'A reward it earned is removed from the Rewards Buffer (refused if that reward was already spent). Rewards used for its overspend are returned, and any target adjustment is reversed. The history is kept in the ledger.',
    okLabel: 'Reopen day',
  });
  if (!ok) return false;
  await api(`/days/${date}/reopen`, { method: 'POST', body: { confirm: true } });
  toast(`${fmtDate(date, { year: false })} reopened.`);
  return true;
}

function openExpense(expense, dateHint) {
  const d = state.data;
  state.editingId = expense ? expense.id : null;
  $('#expenseTitle').textContent = expense ? 'Edit expense' : 'Add expense';
  $('#expAmount').value = expense ? (expense.amountPaise / 100).toFixed(2) : '';
  $('#expDesc').value = expense ? expense.description : '';
  $('#expCat').value = expense ? expense.category : 'Food';
  const inMonth = d.today.startsWith(`${state.year}-${pad(state.month)}-`);
  $('#expDate').value = expense ? expense.date : dateHint || (inMonth ? d.today : `${state.year}-${pad(state.month)}-01`);
  $('#expenseError').textContent = '';
  $('#expenseDialog').showModal();
  $('#expAmount').focus();
}

function openBudget() {
  const d = state.data; const b = d.budget; const last = d.plan.daysInMonth;
  $('#budgetTitle').textContent = `${b ? 'Edit' : 'Set'} budget · ${MONTHS[state.month - 1]} ${state.year}`;
  $('#budgetAmount').value = b ? (b.amountPaise / 100).toFixed(2) : '';
  $('#budgetStart').max = String(last);
  $('#budgetStart').value = String(b ? d.plan.startDay : d.isCurrentMonth ? Number(d.today.slice(8)) : 1);
  $('#budgetStartHelp').textContent = `1 to ${last}. Days before this day get no target. Use 1 to plan the whole month, or today's date if you are starting mid-month.`;
  $('#budgetError').textContent = '';
  $('#budgetDialog').showModal();
  $('#budgetAmount').focus();
}

export function dispatch(el) {
  const a = el.dataset.action; const d = state.data; const date = el.dataset.date;
  switch (a) {
    case 'prev-month': return shiftMonth(-1);
    case 'next-month': return shiftMonth(1);
    case 'this-month': { const n = new Date(); return setMonth(n.getFullYear(), n.getMonth() + 1); }
    case 'goto': { setMonth(Number(el.dataset.year), Number(el.dataset.month)); location.hash = '#/overview'; return undefined; }
    case 'select-day': state.ui.selectedDate = date; return emit();
    case 'clear-filters': Object.assign(state.ui.expense, { q: '', category: 'all', status: 'all', sort: 'newest' }); return emit();
    case 'retry': return load();
    case 'edit-budget': return d && openBudget();
    case 'add-expense': return d && openExpense(null, date);
    case 'edit-expense': {
      const e = d.expenses.find((x) => x.id === Number(el.dataset.id));
      if (!e) return undefined;
      if (!e.locked) return openExpense(e);
      return run(async () => { if (await reopenDay(e.date)) { await load(); openExpense(state.data.expenses.find((x) => x.id === e.id)); } });
    }
    case 'delete-expense': {
      const e = d.expenses.find((x) => x.id === Number(el.dataset.id));
      if (!e) return undefined;
      return run(async () => {
        if (e.locked && !(await reopenDay(e.date))) return;
        const ok = await confirmDialog({ title: 'Delete this expense?', rows: [{ label: 'Description', value: e.description }, { label: 'Amount', value: inr(e.amountPaise) }, { label: 'Date', value: fmtDate(e.date) }], note: 'This cannot be undone.', okLabel: 'Delete expense', tone: 'danger' });
        if (!ok) return;
        await api(`/expenses/${e.id}`, { method: 'DELETE' });
        toast('Expense deleted.');
      });
    }
    case 'finalize': return run(() => finalizeDay(date));
    case 'resolve': return run(() => resolveDay(date, el.dataset.method));
    case 'reopen': return run(async () => { await reopenDay(date); });
    case 'reset-month': return run(async () => {
      const name = `${MONTHS[state.month - 1]} ${state.year}`;
      const ok = await confirmDialog({ title: `Reset ${name}?`, intro: 'This permanently deletes this month’s expenses, daily records, reward activity and adjustments.',
        note: 'The budget and all other months stay. Rewards this month earned leave the Rewards Buffer; rewards it used are returned. If those earned rewards were already spent elsewhere, the reset is refused.', okLabel: 'Reset month', tone: 'danger' });
      if (!ok) return;
      const r = await api(`/months/${state.year}/${state.month}/reset`, { method: 'POST', body: { confirm: true } });
      toast(`${name} reset: ${r.expenses} expense${r.expenses === 1 ? '' : 's'} and ${r.dailyRecords} daily record${r.dailyRecords === 1 ? '' : 's'} removed.`);
    });
    default: return undefined;
  }
}

/** Dialog forms: validate, send, keep the dialog open with an inline message on failure. */
export function bindForms() {
  async function submit(button, errorEl, fn) {
    if (state.busy) return;
    state.busy = true; button.disabled = true;
    try { await fn(); } catch (e) { errorEl.textContent = e.message; state.busy = false; button.disabled = false; return; }
    state.busy = false; button.disabled = false;
    await load();
  }
  $('#expenseForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const err = $('#expenseError');
    const amountPaise = parseRupees($('#expAmount').value); const description = $('#expDesc').value.trim(); const date = $('#expDate').value;
    if (!amountPaise) { err.textContent = 'Enter an amount above ₹0 with at most two decimals.'; $('#expAmount').focus(); return; }
    if (!description) { err.textContent = 'Add a short description.'; $('#expDesc').focus(); return; }
    if (!date) { err.textContent = 'Choose a date.'; return; }
    const id = state.editingId;
    submit($('#expenseSave'), err, async () => {
      await api(id ? `/expenses/${id}` : '/expenses', { method: id ? 'PUT' : 'POST', body: { amountPaise, description, category: $('#expCat').value, date } });
      closeDialog($('#expenseDialog'));
      toast(id ? 'Expense updated.' : 'Expense added.');
    });
  });
  $('#budgetForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const err = $('#budgetError');
    const amountPaise = parseRupees($('#budgetAmount').value); const startDay = Number($('#budgetStart').value);
    if (!amountPaise) { err.textContent = 'Enter a budget above ₹0 with at most two decimals.'; $('#budgetAmount').focus(); return; }
    if (!Number.isInteger(startDay) || startDay < 1 || startDay > state.data.plan.daysInMonth) { err.textContent = `Start day must be between 1 and ${state.data.plan.daysInMonth}.`; $('#budgetStart').focus(); return; }
    submit($('#budgetSave'), err, async () => {
      const r = await api(`/budgets/${state.year}/${state.month}`, { method: 'PUT', body: { amountPaise, startDay } });
      closeDialog($('#budgetDialog'));
      toast(`Budget saved. The daily target starts at ${inr(r.initialTargetPaise)}.`);
    });
  });
}
