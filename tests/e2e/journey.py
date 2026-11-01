"""Optional end-to-end browser test (not part of `npm test`).
Needs:  pip install playwright && playwright install chromium
Run:    python tests/e2e/journey.py          (set SHOTS=folder to save screenshots)
It starts its own server on port 3199 with a temporary database, so your real data is never touched.
"""
import datetime, os, shutil, subprocess, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright, expect

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = 3199; URL = f'http://127.0.0.1:{PORT}'
tmp = tempfile.mkdtemp(prefix='daystash-e2e-')
env = dict(os.environ, PORT=str(PORT), DAYSTASH_DB=os.path.join(tmp, 'e2e.db'))
server = subprocess.Popen(['node', 'server.js'], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(50):
    try: urllib.request.urlopen(URL + '/api/health'); break
    except Exception: time.sleep(0.1)

today = datetime.date.today(); yesterday = today - datetime.timedelta(days=1)
errors = []; passed = []
def ok(name): passed.append(name); print('PASS', name)
def money(page, sel):
    return round(float(page.locator(sel).first.inner_text().replace('₹', '').replace(',', '').replace('−', '-').replace('+', '').strip()) * 100)

try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1440, 'height': 900})
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(URL); expect(pg.get_by_role('heading', name='Overview')).to_be_visible()
        assert pg.evaluate("document.fonts.check('14px Inter')"); ok('Inter font loads from the app itself')
        expect(pg.locator('#nav a')).to_have_count(6); ok('sidebar has the six sections')
        expect(pg.get_by_text('Not set')).to_be_visible(); ok('empty state shown with no budget')

        pg.get_by_role('button', name='Set monthly budget').click()
        pg.fill('#budgetAmount', '5000'); pg.fill('#budgetStart', '1'); pg.click('#budgetSave')
        expect(pg.locator('.featured .display')).to_have_text('₹5,000.00'); ok('budget saved; featured section refreshed')

        def add(amount, desc, date, cat='Food'):
            pg.get_by_role('button', name='Add expense').first.click()
            pg.fill('#expAmount', amount); pg.fill('#expDesc', desc); pg.select_option('#expCat', cat); pg.fill('#expDate', date); pg.click('#expenseSave')
            expect(pg.locator('#expenseDialog')).not_to_be_visible()

        bal = 0
        if today.day > 1:
            add('13', 'yesterday snack', yesterday.isoformat(), 'Transport')
            row = pg.locator('.rows > div', has_text='Spent ₹13.00'); expect(row).to_contain_text('would earn'); ok('past underspent day offered with projected reward')
            row.get_by_role('button', name='Finalize').click()
            expect(pg.locator('#confirmDialog')).to_be_visible(); expect(pg.locator('#confirmRows')).to_contain_text('Reward'); pg.click('#confirmOk')
            expect(pg.locator('.tile.accent .value')).not_to_have_text('₹0.00'); bal = money(pg, '.tile.accent .value'); ok('finalizing credits the Rewards Buffer immediately')
        add('50', 'lunch today', today.isoformat(), 'Food')
        pg.get_by_role('button', name='Finalize today').click(); expect(pg.locator('#confirmRows')).to_contain_text('Rewards Buffer after'); pg.click('#confirmOk')
        expect(pg.locator('.outcome').first).to_contain_text('Finalized'); assert money(pg, '.tile.accent .value') > bal; ok('finalizing today credits the buffer without a refresh')
        # charts use real data
        assert pg.locator('.chart .bar').count() >= 28; assert pg.locator('.chart .seg').count() == (2 if today.day > 1 else 1); ok('daily chart and category donut draw from real data')
        pg.locator('.chart .bar').nth(today.day - 1).hover(); expect(pg.locator('#tooltip')).to_have_class('show'); expect(pg.locator('#tooltip')).to_contain_text('Target'); ok('chart tooltip appears on hover')
        expect(pg.locator('.cat-list')).to_contain_text('Food'); ok('category legend lists real categories')

        # Expenses page: search, filter, sort, no logos/icons per row
        pg.click('#nav >> text=Expenses'); expect(pg.locator('#expenseResults tbody tr')).to_have_count(2 if today.day > 1 else 1)
        assert pg.locator('#expenseResults img, #expenseResults svg').count() == pg.locator('#expenseResults [data-action]').count()  # only the edit/delete icons
        pg.fill('[data-filter=q]', 'lunch'); expect(pg.locator('#expenseResults tbody tr')).to_have_count(1); expect(pg.locator('[data-filter=q]')).to_be_focused(); ok('search filters rows and keeps focus')
        pg.fill('[data-filter=q]', 'zzz'); expect(pg.get_by_text('No expenses match')).to_be_visible(); pg.get_by_role('button', name='Clear filters').click()
        if today.day > 1:
            pg.select_option('[data-filter=category]', 'Transport'); expect(pg.locator('#expenseResults tbody tr')).to_have_count(1)
            pg.select_option('[data-filter=category]', 'all'); pg.select_option('[data-filter=sort]', 'low')
            assert 'yesterday' in pg.locator('#expenseResults tbody tr').first.inner_text(); ok('category filter and sorting work')
        pg.locator('#expenseResults tr', has_text='lunch today').get_by_role('button', name='Edit').click()
        pg.locator('#confirmOk').click(); expect(pg.locator('#expenseDialog')).to_be_visible(); ok('editing a finalized-day expense offers to reopen first')
        pg.fill('#expAmount', '60'); pg.click('#expenseSave'); expect(pg.locator('#expenseDialog')).not_to_be_visible()
        expect(pg.locator('#expenseResults')).to_contain_text('₹60.00'); ok('edited expense saved')

        # Daily records calendar
        pg.click('#nav >> text=Daily Records'); expect(pg.locator('.cal-cell')).to_have_count(__import__('calendar').monthrange(today.year, today.month)[1])
        cell = pg.locator('.cal-cell.today'); expect(cell).to_have_class(__import__('re').compile('selected')); ok('calendar renders every day; today selected')
        pg.locator('.cal-cell').first.click(); expect(pg.locator('.day-detail')).to_contain_text('1 ' + today.strftime('%b')); ok('selecting a day updates the detail panel')
        pg.locator('.cal-cell.today').click()
        expect(pg.locator('.day-detail').get_by_role('button', name='Finalize day')).to_be_visible(); pg.locator('.day-detail').get_by_role('button', name='Finalize day').click(); pg.click('#confirmOk')
        expect(pg.locator('.day-detail').get_by_role('button', name='Reopen day')).to_be_visible(); expect(pg.locator('.cal-cell.today')).to_have_class(__import__('re').compile('finalized')); ok('finalize from the calendar detail panel')
        pg.locator('.day-detail').get_by_role('button', name='Reopen day').click(); pg.click('#confirmOk'); expect(pg.locator('.day-detail').get_by_role('button', name='Finalize day')).to_be_visible()

        # overspend resolution
        pg.click('#nav >> text=Overview'); add('3000', 'big purchase', today.isoformat(), 'Shopping')
        pg.get_by_role('button', name='Finalize today').click(); pg.click('#confirmOk')
        expect(pg.locator('#banners .banner')).to_contain_text('Decision needed'); ok('overspend raises a decision banner')
        pg.locator('#banners [data-method="targets"], #banners [data-method="absorb"]').first.click(); pg.click('#confirmOk')
        expect(pg.locator('#banners .banner')).to_have_count(0); ok('overspend resolved')
        pg.click('#nav >> text=Daily Records'); pg.locator('.day-detail').get_by_role('button', name='Reopen day').click(); pg.click('#confirmOk')
        expect(pg.locator('.day-detail').get_by_role('button', name='Finalize day')).to_be_visible(); ok('reopen after an overspend works')

        # Rewards page
        pg.click('#nav >> text=Rewards Buffer'); expect(pg.locator('.featured.reward svg.illus')).to_have_count(1); expect(pg.locator('.featured.reward')).to_contain_text('not cash')
        if today.day > 1: expect(pg.locator('.table tbody tr').first).to_be_visible()
        assert money(pg, '.featured.reward .display') == money(pg, '.featured.reward .pair.three dd.pos') - round(float(pg.locator('.featured.reward .pair.three dd').nth(1).inner_text().replace('₹','').replace('−','').replace(',',''))*100); ok('Rewards page: balance = total earned − total used')

        # History
        pg.click('#nav >> text=History'); expect(pg.locator('.chart .bar')).to_have_count(12); expect(pg.locator('.tile').first).to_contain_text('₹5,000.00'); ok('History shows real totals and a 12-month chart')
        pg.select_option('[data-role=hist-month]', str(today.month)); expect(pg.get_by_text('Finalized days in')).to_be_visible(); ok('month filter narrows history')
        pg.select_option('[data-role=hist-year]', str(today.year - 1)) if pg.locator('[data-role=hist-year] option').count() > 1 else None

        # Settings + reset
        pg.click('#nav >> text=Settings'); expect(pg.get_by_role('heading', name='Settings')).to_be_visible()
        pg.get_by_role('button', name='Reset ').first.click(); pg.click('#confirmOk')
        pg.click('#nav >> text=Expenses'); expect(pg.get_by_text('No expenses this month')).to_be_visible(); ok('reset month clears activity and keeps the budget')
        pg.click('#nav >> text=Overview'); expect(pg.locator('.featured .display')).to_have_text('₹5,000.00')

        # keyboard + reduced motion
        add('20', 'kb test', today.isoformat())
        btn = pg.get_by_role('button', name='Finalize today'); btn.focus(); pg.keyboard.press('Enter'); expect(pg.locator('#confirmDialog')).to_be_visible(); pg.keyboard.press('Escape'); expect(pg.locator('#confirmDialog')).not_to_be_visible(); ok('keyboard: Finalize opens, Escape cancels')
        ctx = b.new_context(reduced_motion='reduce', viewport={'width': 1200, 'height': 800}); rp = ctx.new_page(); rp.goto(URL + '/#/overview'); rp.wait_for_selector('.featured')
        dur = rp.evaluate("getComputedStyle(document.querySelector('#view > *')).animationDuration"); assert dur in ('0.001s', '1ms', '0s'), dur; ok('prefers-reduced-motion disables animations'); ctx.close()

        # responsive: all six pages, four widths
        for w in (1440, 1024, 820, 390):
            pg.set_viewport_size({'width': w, 'height': 900})
            for r in ('overview', 'expenses', 'days', 'rewards', 'history', 'settings'):
                pg.goto(URL + f'/#/{r}'); pg.wait_for_selector('#view > *:not(.skeleton)'); pg.wait_for_timeout(120)
                assert not pg.evaluate('document.documentElement.scrollWidth > innerWidth + 1'), (r, w)
                assert not pg.evaluate("[...document.querySelectorAll('.panel')].some(p => p.scrollWidth > p.clientWidth + 1)"), (r, w, 'panel overflow')
            pg.goto(URL + '/#/days'); pg.wait_for_selector('.day-detail')
            fb = pg.locator('.day-detail').get_by_role('button', name='Finalize day').bounding_box(); assert fb and fb['x'] >= 0 and fb['x'] + fb['width'] <= w, (w, fb)
        ok('all pages fit 1440 / 1024 / 820 / 390 px with no horizontal overflow; Finalize stays on screen')
        shots = os.environ.get('SHOTS')
        if shots:
            os.makedirs(shots, exist_ok=True)
            pg.goto(URL + '/#/expenses'); add('450', 'groceries', today.isoformat(), 'Food'); add('120', 'metro card', (yesterday if today.day > 1 else today).isoformat(), 'Transport'); add('900', 'gym fee', today.isoformat(), 'Health')
            for w in (1440, 390):
                pg.set_viewport_size({'width': w, 'height': 1000})
                for r in ('overview', 'expenses', 'days', 'rewards', 'history', 'settings'):
                    pg.goto(URL + f'/#/{r}'); pg.wait_for_timeout(900); pg.screenshot(path=os.path.join(shots, f'{r}_{w}.png'), full_page=True)
        b.close()
    assert not errors, errors; ok('no console errors')
    print(f'\n{len(passed)} checks passed')
finally:
    server.terminate(); shutil.rmtree(tmp, ignore_errors=True)
