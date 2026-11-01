# Daystash

A daily expense tracker and adaptive monthly budget app. Set a monthly budget, log expenses, get a daily
spending target, bank the difference on days you spend less (the **Rewards Buffer**), and settle days you
overspend. Runs locally: Node.js + Express + SQLite (better-sqlite3) + vanilla HTML/CSS/JS. No external APIs.

## Install and run

Requires **Node.js 22 or newer** (the current better-sqlite3 needs it). Check with `node -v`. No Python or Visual Studio build tools are needed: better-sqlite3 ships a ready-made Windows binary, and the bundled `.npmrc` stops npm from trying to compile it.

```bash
npm install
npm start          # http://localhost:3000
npm test           # runs the automated tests (uses in-memory/temporary databases only)
```

Optional environment variables: `PORT` (default 3000), `HOST` (default 127.0.0.1), `DAYSTASH_DB` (database file path).
The database is created automatically at `database/daystash.db` on first start. Delete that file to start fresh.

## Using the app

Six sections in the left sidebar (a bottom tab bar on phones): **Overview**, **Expenses**, **Daily Records**, **Rewards Buffer**, **History**, **Settings**.

- **Overview:** budget progress, today's summary (Finalize Today / Add Expense), spent, daily target, Rewards Buffer, daily spending vs target, spending by category, recent activity, past days to finalize.
- **Expenses:** search, filter by category or day status, sort, add / edit / delete. Categories are plain text.
- **Daily Records:** a month calendar. Select a day to see its target, spending, remaining amount and expenses, and to finalize or reopen it.
- **Rewards Buffer:** balance, total earned and used, recent activity and the full ledger. It is a planning reserve, not cash.
- **History:** pick a year and optionally a month; totals, monthly chart, category breakdown, insights and records, all from your real data.
- **Settings:** the month's budget and tracking start day, reset month, and a summary of the rules.

Typical flow: set a budget, log expenses, **Finalize** a day (a confirmation shows the exact reward or overspend first), settle an overspend if there is one, and
**Reopen** a day to correct it. The month selector sits at the top of each page.

## Financial rules (the exact formulas)

Money is stored as **integer paise** everywhere (₹129.03 = 12903). No floating point is used for money.
`₹` formatting uses Indian digit grouping.

| Concept | Rule |
|---|---|
| Remaining budget | `monthly budget − total expenses in the month` (can go negative; shown as "Over budget by") |
| Allocatable pool | `monthly budget − Σ charged amount of finalized days` |
| Open (eligible) days | days of the month that are not finalized (includes today, future days and any past days not yet finalized) |
| Tracking start day | Optional per-month setting (default 1). Unfinalized days before it get no target; money already spent on them is deducted from the pool |
| Target of an open day | `pool ÷ open days`, split in whole paise: every day gets the rounded-down share and the leftover paise go one each to the **last** days, so targets sum to the pool exactly |
| Initial target | with nothing finalized: `budget ÷ days in month` (₹4,000 ÷ 31 → ₹129.03 for early days, ₹129.04 for the last 7) |
| Today's target vs today's spending | spending on an open day never changes its own target; targets only change when a day is finalized and charged, the budget changes, an overspend is spread, or a day is reopened |
| Finalized day | stores a **snapshot** of its target and actual spend; never recalculated silently |
| Reward | `target − actual` when `actual < target` (credited once; a zero-spend day earns the full target, switchable in `src/config.js`) |
| Overspend | `actual − target` when `actual > target` |
| Charged amount | what a finalized day removes from the pool: its target (under / exact / overspend covered by rewards) or its actual spend (overspend spread over future targets, or accepted) |

Because an underspent day is charged its **full target** and the saving goes to the Rewards Buffer, the saved
money is never counted twice (it is not also added to future targets).

**Overspend resolution** (all-or-nothing, exactly one per overspent day):
- *Use Rewards Buffer*: needs a balance ≥ the overspend. Debits the ledger; targets stay the same.
- *Lower future targets*: the day is charged its full actual spend, so the extra comes out of the pool and every open day's target drops. The adjustment (amount, days affected, target before → after) is recorded and shown. Not available when no open day follows; then you may *accept* the overspend.
- A pending overspend does not change targets until you choose.
- Lowering targets spreads the overspend over **every open day**, not only later ones, because the pool is split evenly. The banner, the confirmation and the *Target adjustments* table all state that same number of days.

**Rewards Buffer**: an append-only ledger (`reward_transactions`). Balance = credits − debits, always computed from
the ledger. It is a planning reserve, not bank money, and is shown separately from the monthly budget.
It can never go negative (checked in code and by a database trigger). A unique constraint
`(day, finalization cycle, kind)` makes duplicate rewards/debits impossible.

**Corrections**: expenses on a finalized day are locked (add/edit/delete/move-in all return `DAY_FINALIZED`). **Reopen day** (explicit
confirmation) appends reversal ledger entries (nothing is deleted), marks any adjustment reversed, writes a `correction_log` row, and
returns the day to *open*. Reopening is refused (`REOPEN_BLOCKED`) if the reward that day earned has already been spent.
A reopened day gets a freshly calculated target from the current pool.

**Reset a month**: in one transaction deletes that month's expenses, daily records, ledger entries and adjustments; keeps the budget; never
touches other months. The rewards that month earned leave the buffer and rewards it used are returned. If those earned rewards were already spent
in another month the reset is refused (`RESET_WOULD_OVERDRAW`) and nothing changes.

## Project structure

```
server.js            starts the HTTP server
database.js          schema, constraints, trigger, openDatabase()
src/app.js           Express app + JSON error handling
src/routes/index.js  all /api routes
src/services/        planner (target maths), budgets, expenses, rewards, days (finalize/resolve/reopen), months (dashboard/history/reset), analytics (category and yearly summaries)
src/utils/           money, dates, errors
src/config.js        categories and the zero-spend reward switch
public/              index.html, css/ (tokens, base, layout, components, views), js/ (modules + views/), fonts/
tests/               node:test suites (run with npm test)
```

## API

All responses: `{ "ok": true, "data": ... }` or `{ "ok": false, "error": { "code", "message" } }`. Money fields are integer paise
(request `amountPaise`, response `...Paise`). Dates are `YYYY-MM-DD`.

| Method & path | Purpose |
|---|---|
| GET `/api/dashboard?year&month` | Everything for a month (budget, totals, plan, expenses, rewards, adjustments) |
| GET `/api/history` | Months that have data |
| GET `/api/history/year?year&month?` | Year summary: 12 months, totals, categories, insights, finalized days (month filter optional) |
| GET / PUT `/api/budgets/:year/:month` | Read / set budget `{amountPaise, startDay?}` |
| GET `/api/expenses?year&month` · POST `/api/expenses` · PUT / DELETE `/api/expenses/:id` | Expense CRUD (`{amountPaise, description, category, date}`) |
| GET `/api/days?year&month` | Month plan: every day's target, spend, status, `canFinalize`, projected outcome |
| GET `/api/days/:date/preview` | What finalizing would do (target, spent, reward/overspend, why it is blocked); changes nothing |
| POST `/api/days/:date/finalize` | Finalize a day (409 `ALREADY_FINALIZED` if repeated) |
| POST `/api/days/:date/resolve` `{method: rewards\|targets\|absorb}` | Settle an overspent day once |
| POST `/api/days/:date/reopen` `{confirm:true}` | Undo a finalization |
| GET `/api/rewards?year&month` | Balance and ledger |
| GET `/api/adjustments?year&month` | Target adjustments |
| POST `/api/months/:year/:month/reset` `{confirm:true}` | Reset a month's activity |

Error codes include `INVALID_AMOUNT`, `INVALID_DATE`, `INVALID_MONTH`, `NO_BUDGET`, `DATE_IN_FUTURE`, `ALREADY_FINALIZED`, `DAY_FINALIZED`,
`ALREADY_RESOLVED`, `INSUFFICIENT_REWARDS`, `NO_ELIGIBLE_DAYS`, `REOPEN_BLOCKED`, `RESET_WOULD_OVERDRAW`, `CONFIRMATION_REQUIRED`.

## Design and architecture notes

The visual redesign follows the approved dark palette (see `docs/DESIGN.md` for tokens, components, motion and the contrast note). It is plain CSS and native ES modules: no framework, no build step,
no new runtime dependency (Inter is vendored in `public/fonts`). All financial rules stay in `src/services/*`; the browser only formats and displays what the API returns.

Backend additions for the new pages (read-only, no schema change, no change to any existing rule): category totals and all-time rewards totals in `GET /api/dashboard`, and `GET /api/history/year?year=&month=`.

## Changes in this version

**Visual redesign (this release):** new dark fintech interface across all pages, calendar-based Daily Records, Settings page, History dashboard with charts and insights, two 3D illustrations,
search/filter/sort on Expenses, tooltips, animated dialogs and pages (reduced-motion aware). No business rule, API contract or database schema changed; the backend only gained read-only reporting endpoints.

**Previous release (bug fixes):**

| Problem | Root cause | Fix |
|---|---|---|
| Finalize button not visible | The daily table was 740px wide inside a ~500px panel; the 6th (action) column sat outside the scroll area | Redesigned the table to five columns that fit, with the action always visible; rows stack on phones; no horizontal scrolling anywhere |
| Rewards Buffer stayed ₹0.00 | Not a ledger defect: the only finalized day was overspent (correctly no reward) and the underspent day could not be finalized because its button was hidden | Finalize is always reachable, past underspent days are listed with the reward they would earn, a confirmation previews the reward, and every figure refreshes after the action |
| "Spread over 3 later days" but targets fell by ₹2.95 | The pool is split across **all** open days (30), but the label counted only days after the overspend; past never-tracked days also soaked up budget | One consistent definition (all open days share it) shown in the banner, confirmation and adjustments table; new *tracking start day* keeps never-tracked days out of the plan |
| Stale or doubled requests | Old responses could overwrite newer ones; no single-flight guard | Latest-request-wins loading, month data cleared on switch, one action at a time, backend idempotency unchanged |
| Errors | Failures only appeared as brief toasts | Errors stay visible longer, dialogs show inline errors, load failures show a retry banner |

Data safety: the new `budgets.start_day` column is added automatically to an existing database (default 1, so behaviour for existing months is unchanged).
Copy your old `database/daystash.db` into the new folder to keep your data.

## Tests

- `npm test` runs 41 automated tests (backend rules, API, regressions, migration, analytics).
- Optional browser journey (needs Python + Playwright): `pip install playwright && playwright install chromium`, then `python tests/e2e/journey.py`.
  It uses its own temporary database and runs 25 checks: the full flow on all six pages, calendar, search/filter/sort, charts and tooltips, keyboard use, reduced motion, layouts at 1440/1024/820/390px and console errors.

## Known limitations

- Single user, no login; it binds to 127.0.0.1 by default. Do not expose it to a network as-is.
- Single currency (₹). Overspend resolution is all-or-nothing (no partial reward use).
- A finalized day with no spending earns its full target as a reward (`ZERO_SPEND_DAYS_EARN_REWARDS` in `src/config.js`). Because days can be finalized retroactively,
  set that to `false` if you do not want empty past days to earn rewards. The Overview only suggests past days that have spending logged.
- Past tracked days you never finalize stay open and keep a share of the pool; finalize days in order for the cleanest numbers.
- "Today" uses the server's local date.
- The browser journey test is not part of `npm test`, and the Windows commands below have not been run on a real Windows machine by me.
