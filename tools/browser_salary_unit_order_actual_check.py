# -*- coding: utf-8 -*-
"""Browser gate for salary unit order and monthly actual totals."""
import json
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5500/local.html"
OUT = {"status": "FAIL", "checks": {}, "console_errors": []}


def table_state(page):
    return page.evaluate("""() => ({
      summary: [...document.querySelectorAll('#salary-unit-summary-tbody tr:not(.summary-total-row) td:first-child')].map(td => td.textContent.trim()),
      summaryLast: document.querySelector('#salary-unit-summary-tbody tr:last-child td:first-child')?.textContent.trim(),
      detail: [...document.querySelectorAll('#salary-month-tbody td.month-detail-unit-name')].map(td => td.textContent.trim()),
      fixedLabels: [...document.querySelectorAll('#salary-month-tbody tr')].slice(0, 5).map(tr => tr.cells[1]?.textContent.trim()),
      fixedValues: [...document.querySelectorAll('#salary-month-tbody tr')].slice(0, 5).map(tr => [...tr.cells].slice(2).map(td => td.textContent.trim()))
    })""")


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
          const units = [
            {id:'OU3',unitCode:'U3',unitName:'濟時典藏'},
            {id:'OU1',unitCode:'U1',unitName:'國璽流通'},
            {id:'OU2',unitCode:'U2',unitName:'公博流通'},
            {id:'OU4',unitCode:'U4',unitName:'濟時流通'},
            {id:'O_OUT',unitCode:'OUT',unitName:'其他預算'}
          ];
          const months = ['2025-08','2025-09','2025-10'];
          const rows = months.flatMap((ym, mi) => units.slice(0, 4).map((u, ui) => ({
            id:`OR_${mi}_${ui}`,date:`${ym}-15`,academicYear:'114',weekday:'星期一',scheduleType:'Order',
            unitCode:u.unitCode,unitName:u.unitName,startTime:'08:00',endTime:'09:00',hours:1,hourlyWage:190,sourceHourSettingId:`OH_${ui}`
          })));
          const entries = [
            {id:'E1',academicYear:'114',year:2025,month:8,unitCode:'U1',actualAmount:100,hourlyWage:191,note:'note-U1'},
            {id:'E2',academicYear:'114',year:2025,month:8,unitCode:'U2',actualAmount:200,hourlyWage:192,note:'note-U2'},
            {id:'E3',academicYear:'114',year:2025,month:8,unitCode:'U3',actualAmount:300,hourlyWage:193,note:'note-U3'},
            {id:'E4',academicYear:'114',year:2025,month:9,unitCode:'U1',actualAmount:50,note:''},
            {id:'E5',academicYear:'114',year:2025,month:9,unitCode:'U3',actualAmount:25,note:''},
            {id:'E6',academicYear:'114',year:2025,month:8,unitCode:'OUT',actualAmount:999,note:''}
          ];
          localStorage.setItem('workStudy_units', JSON.stringify(units));
          localStorage.setItem('workStudy_budgets', JSON.stringify([
            {id:'OB1',academicYear:'114',budgetName:'Order_Group',unitCodes:['U2','U4','U1','U3'],budgetAmount:1000,note:''},
            {id:'OB2',academicYear:'114',budgetName:'Other_Group',unitCodes:['OUT'],budgetAmount:1000,note:''}
          ]));
          localStorage.setItem('workStudy_calendarRows', JSON.stringify(rows));
          localStorage.setItem('workStudy_salaryEntries', JSON.stringify(entries));
        }""")
        page.reload(wait_until="networkidle", timeout=60000)
        page.locator('[data-tab="salaryEntry"]').click()
        page.select_option('#salary-budget-name', 'Order_Group')
        page.select_option('#salary-filter-mode', 'dateRange')
        page.fill('#salary-filter-start', '2025-08')
        page.fill('#salary-filter-end', '2025-10')
        page.click('#salary-filter-query')
        before = table_state(page)
        expected = ['濟時典藏', '國璽流通', '公博流通', '濟時流通']
        OUT["checks"]["summary_unit_order"] = before['summary'] == expected
        OUT["checks"]["detail_unit_order"] = before['detail'] == expected
        OUT["checks"]["summary_total_last"] = before['summaryLast'] == '合計'
        OUT["checks"]["actual_row_position"] = before['fixedLabels'] == ['學年度', '月份', '時薪', '核銷統計', '剩餘預算']
        OUT["checks"]["monthly_actual_totals"] = before['fixedValues'][3] == ['600', '75', '0']
        OUT["checks"]["remaining_no_double_subtract"] = before['fixedValues'][4] == ['400', '325', '325']

        page.click('#btn-open-salary-modal')
        page.select_option('#sal-modal-ay', '114')
        page.select_option('#sal-modal-year', '2025')
        page.select_option('#sal-modal-month', '8')
        modal_before = page.evaluate("""() => [...document.querySelectorAll('#sal-unit-tbody tr')].map(tr => ({
          unit: tr.cells[0].textContent.trim(), amount: tr.querySelector('input[type="number"]').value,
          note: tr.querySelector('input[type="text"]').value
        }))""")
        OUT["checks"]["modal_unit_order"] = [row['unit'].split('時薪：')[0] for row in modal_before] == expected
        OUT["checks"]["modal_input_index_safe"] = [row['amount'] for row in modal_before] == ['300', '100', '200', '0'] and [row['note'] for row in modal_before] == ['note-U3', 'note-U1', 'note-U2', '']
        page.click('#sal-modal-cancel')

        page.locator('[data-tab="unit"]').click()
        page.locator('.btn-unit-move[data-id="OU3"][data-direction="down"]').click()
        page.wait_for_timeout(300)
        page.locator('[data-tab="salaryEntry"]').click()
        page.click('#salary-filter-query')
        after = table_state(page)
        moved = ['國璽流通', '濟時典藏', '公博流通', '濟時流通']
        OUT["checks"]["move_order_reflected"] = after['summary'] == moved and after['detail'] == moved
        page.click('#btn-open-salary-modal')
        page.select_option('#sal-modal-ay', '114')
        page.select_option('#sal-modal-year', '2025')
        page.select_option('#sal-modal-month', '8')
        modal_after = page.evaluate("() => [...document.querySelectorAll('#sal-unit-tbody tr td:first-child')].map(td => td.textContent.trim().split('時薪：')[0])")
        OUT["checks"]["modal_move_order_reflected"] = modal_after == moved
        browser.close()

    required = ['summary_unit_order', 'detail_unit_order', 'summary_total_last', 'actual_row_position', 'monthly_actual_totals', 'remaining_no_double_subtract', 'modal_unit_order', 'modal_input_index_safe', 'move_order_reflected', 'modal_move_order_reflected']
    failed = [name for name in required if not OUT["checks"].get(name)]
    OUT["checks"]["console_errors_zero"] = not OUT["console_errors"]
    OUT["failed_required"] = failed
    OUT["status"] = "PASS" if not failed and not OUT["console_errors"] else "FAIL"
    print(json.dumps(OUT, ensure_ascii=False, indent=2))
    return 0 if OUT["status"] == "PASS" else 1


if __name__ == '__main__':
    sys.exit(main())
