# -*- coding: utf-8 -*-
"""Browser gate for draft/applied advanced hour filters."""
import json
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5500/local.html"
OUT = {"status": "FAIL", "checks": {}, "console_errors": []}


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("console", lambda msg: OUT["console_errors"].append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: OUT["console_errors"].append(str(err)))
        page.goto(BASE, wait_until="networkidle", timeout=60000)
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="networkidle", timeout=60000)
        page.evaluate("""() => {
          localStorage.setItem('workStudy_budgets', JSON.stringify([
            {id:'FB1',academicYear:'114',budgetName:'Filter_Alpha',unitCodes:['FU1','FU2'],budgetAmount:1},
            {id:'FB2',academicYear:'114',budgetName:'Filter_Beta',unitCodes:['FU3'],budgetAmount:1},
            {id:'FB3',academicYear:'115',budgetName:'Filter_Alpha',unitCodes:['FU4'],budgetAmount:1}
          ]));
          localStorage.setItem('workStudy_units', JSON.stringify([
            {id:'U1',unitCode:'FU1',unitName:'Filter Unit 1'}, {id:'U2',unitCode:'FU2',unitName:'Filter Unit 2'},
            {id:'U3',unitCode:'FU3',unitName:'Filter Unit 3'}, {id:'U4',unitCode:'FU4',unitName:'Filter Unit 4'}
          ]));
          localStorage.setItem('workStudy_hourSettings', JSON.stringify([
            {id:'FH1',academicYear:'114',scheduleType:'Morning',unitCode:'FU1',unitName:'Filter Unit 1',weekdays:'星期一',startTime:'08:00',endTime:'12:00',hours:4,note:'needle-one'},
            {id:'FH2',academicYear:'114',scheduleType:'Evening',unitCode:'FU2',unitName:'Filter Unit 2',weekdays:'星期二',startTime:'13:00',endTime:'17:00',hours:4,note:'other'},
            {id:'FH3',academicYear:'114',scheduleType:'Morning',unitCode:'FU3',unitName:'Filter Unit 3',weekdays:'星期三',startTime:'09:00',endTime:'11:00',hours:2,note:'beta'},
            {id:'FH4',academicYear:'115',scheduleType:'Morning',unitCode:'FU4',unitName:'Filter Unit 4',weekdays:'星期四',startTime:'10:00',endTime:'12:00',hours:2,note:'future'}
          ]));
        }""")
        page.reload(wait_until="networkidle", timeout=60000)
        page.locator('[data-tab="hour"]').click()
        OUT["checks"]["filter_controls"] = all(page.locator(selector).count() == 1 for selector in [
            '#hour-filter-year', '#hour-filter-budget', '#hour-filter-schedule-type',
            '#hour-filter-unit', '#hour-filter-keyword', '#hour-filter-query'
        ])
        initial = page.locator('#hour-tbody tr').count()
        page.select_option('#hour-filter-year', '114')
        OUT["checks"]["draft_not_applied"] = page.locator('#hour-tbody tr').count() == initial == 4
        budget_options = page.locator('#hour-filter-budget option').all_text_contents()
        OUT["checks"]["year_cascades_budget"] = 'Filter_Alpha' in budget_options and 'Filter_Beta' in budget_options
        page.select_option('#hour-filter-budget', 'Filter_Alpha')
        page.select_option('#hour-filter-schedule-type', 'Morning')
        unit_options = page.locator('#hour-filter-unit option').all_text_contents()
        OUT["checks"]["cascade_units_by_code"] = any('FU1 - Filter Unit 1' in text for text in unit_options) and not any('FU3' in text for text in unit_options)
        page.select_option('#hour-filter-unit', 'FU1')
        page.fill('#hour-filter-keyword', 'NEEDLE')
        page.click('#hour-filter-query')
        OUT["checks"]["combined_and"] = page.locator('#hour-tbody .row-check').count() == 1 and 'needle-one' in page.locator('#hour-tbody').inner_text()

        page.fill('#hour-filter-keyword', 'no-match')
        OUT["checks"]["keyword_draft_only"] = page.locator('#hour-tbody .row-check').count() == 1
        page.press('#hour-filter-keyword', 'Enter')
        zero = page.locator('#hour-tbody td[colspan="10"]')
        OUT["checks"]["enter_and_zero_result"] = zero.count() == 1 and '查無符合條件的時數設定' in zero.inner_text()

        for selector in ['#hour-filter-year', '#hour-filter-budget', '#hour-filter-schedule-type', '#hour-filter-unit']:
            page.select_option(selector, '')
        page.fill('#hour-filter-keyword', '')
        page.click('#hour-filter-query')
        OUT["checks"]["all_optional_shows_all"] = page.locator('#hour-tbody .row-check').count() == 4
        browser.close()

    required = ['filter_controls', 'draft_not_applied', 'year_cascades_budget', 'cascade_units_by_code', 'combined_and', 'keyword_draft_only', 'enter_and_zero_result', 'all_optional_shows_all']
    failed = [name for name in required if not OUT["checks"].get(name)]
    OUT["checks"]["console_errors_zero"] = not OUT["console_errors"]
    OUT["failed_required"] = failed
    OUT["status"] = "PASS" if not failed and not OUT["console_errors"] else "FAIL"
    print(json.dumps(OUT, ensure_ascii=False, indent=2))
    return 0 if OUT["status"] == "PASS" else 1


if __name__ == '__main__':
    sys.exit(main())
