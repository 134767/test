# -*- coding: utf-8 -*-
"""Regression gate: salary month columns remain stable across repeated queries."""
import json
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5500/local.html"
OUT = {"status": "FAIL", "checks": {}, "console_errors": [], "measurements": {}}


def measure(page):
    return page.evaluate("""() => {
      const table = document.querySelector('#salary-month-table');
      const wrapper = table.closest('.table-wrapper');
      const heads = [...table.querySelectorAll('thead th')];
      const firstBody = table.querySelector('tbody tr td:nth-child(3)');
      const style1 = getComputedStyle(heads[0]);
      const style2 = getComputedStyle(heads[1]);
      return {
        tableCount: document.querySelectorAll('#salary-month-table').length,
        theadRows: table.querySelectorAll('thead tr').length,
        rowCount: table.querySelectorAll('tbody tr').length,
        columnCount: heads.length,
        unitWidth: heads[0].getBoundingClientRect().width,
        itemWidth: heads[1].getBoundingClientRect().width,
        monthWidth: heads[2]?.getBoundingClientRect().width || 0,
        monthBodyWidth: firstBody?.getBoundingClientRect().width || 0,
        tableScrollWidth: table.scrollWidth,
        wrapperClientWidth: wrapper.clientWidth,
        wrapperScrollWidth: wrapper.scrollWidth,
        inlineCol1: table.style.getPropertyValue('--month-detail-col1-width'),
        inlineCol2: table.style.getPropertyValue('--month-detail-col2-width'),
        inlineWidth: table.style.width,
        firstPosition: style1.position,
        firstLeft: parseFloat(style1.left),
        secondPosition: style2.position,
        secondLeft: parseFloat(style2.left),
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    }""")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1024, "height": 900})
        page.on("console", lambda msg: OUT["console_errors"].append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: OUT["console_errors"].append(str(err)))
        page.goto(BASE, wait_until="networkidle", timeout=60000)
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="networkidle", timeout=60000)

        page.evaluate("""() => {
          const units = Array.from({length: 5}, (_, i) => ({
            id: `WIDTH_UNIT_${i+1}`, unitCode: `WIDTH_U${i+1}`,
            unitName: i === 0 ? 'Extremely_Long_Unit_Name_For_Ellipsis_Regression' : `Width Unit ${i+1}`,
            colorKey: 'blue', note: ''
          }));
          const months = [];
          for (let i = 0; i < 12; i++) {
            const base = 7 + i;
            const year = 2025 + Math.floor(base / 12);
            const month = (base % 12) + 1;
            months.push(`${year}-${String(month).padStart(2, '0')}`);
          }
          const rows = [];
          months.forEach((ym, mi) => units.forEach((unit, ui) => rows.push({
            id: `WIDTH_ROW_${mi}_${ui}`, date: `${ym}-15`, academicYear: '114',
            weekday: '星期一', scheduleType: 'Width', unitCode: unit.unitCode,
            unitName: unit.unitName, startTime: '08:00', endTime: '09:00', hours: 1,
            hourlyWage: 196, sourceHourSettingId: `WIDTH_HOUR_${ui}`
          })));
          localStorage.setItem('workStudy_budgets', JSON.stringify([{
            id:'WIDTH_BUDGET', academicYear:'114', budgetName:'Width_Group',
            unitCodes: units.map(u => u.unitCode), budgetAmount:999999, note:''
          }]));
          localStorage.setItem('workStudy_units', JSON.stringify(units));
          localStorage.setItem('workStudy_calendarRows', JSON.stringify(rows));
          localStorage.setItem('workStudy_salaryEntries', '[]');
        }""")
        page.reload(wait_until="networkidle", timeout=60000)
        page.locator('[data-tab="salaryEntry"]').click()
        page.select_option('#salary-budget-name', 'Width_Group')
        page.select_option('#salary-filter-mode', 'dateRange')
        page.fill('#salary-filter-start', '2025-08')
        page.fill('#salary-filter-end', '2026-07')
        page.click('#salary-filter-query')
        first = measure(page)

        page.evaluate("""() => {
          const button = document.querySelector('#salary-filter-query');
          for (let i = 0; i < 20; i++) button.click();
        }""")
        twentieth = measure(page)
        OUT["measurements"]["first"] = first
        OUT["measurements"]["twentieth"] = twentieth

        OUT["checks"]["widths_stable"] = all(abs(first[k] - twentieth[k]) <= 1 for k in ['unitWidth', 'itemWidth', 'monthWidth'])
        OUT["checks"]["dom_idempotent"] = all(first[k] == twentieth[k] for k in ['tableCount', 'theadRows', 'rowCount', 'columnCount'])
        OUT["checks"]["fixed_width_limits"] = twentieth['unitWidth'] <= 200 and twentieth['itemWidth'] <= 180
        OUT["checks"]["expected_fixed_widths"] = abs(twentieth['unitWidth'] - 140) <= 1 and abs(twentieth['itemWidth'] - 128) <= 1
        OUT["checks"]["month_width_stable"] = twentieth['monthWidth'] >= 92 and abs(twentieth['monthWidth'] - twentieth['monthBodyWidth']) <= 1
        OUT["checks"]["inline_widths_absent"] = not twentieth['inlineCol1'] and not twentieth['inlineCol2'] and not twentieth['inlineWidth']
        OUT["checks"]["horizontal_scroll"] = twentieth['wrapperScrollWidth'] > twentieth['wrapperClientWidth']
        OUT["checks"]["sticky_offsets"] = (
            twentieth['firstPosition'] == 'sticky' and twentieth['secondPosition'] == 'sticky'
            and abs(twentieth['firstLeft']) <= 1 and abs(twentieth['secondLeft'] - 140) <= 1
        )

        responsive = {}
        for width in [1440, 1024, 768, 390]:
            page.set_viewport_size({"width": width, "height": 900})
            current = measure(page)
            responsive[str(width)] = {
                "unitWidth": current["unitWidth"], "itemWidth": current["itemWidth"],
                "horizontalScroll": current["wrapperScrollWidth"] > current["wrapperClientWidth"],
                "pageOverflow": current["pageOverflow"]
            }
        OUT["measurements"]["responsive"] = responsive
        OUT["checks"]["responsive_fixed_columns"] = all(
            abs(v["unitWidth"] - 140) <= 1 and abs(v["itemWidth"] - 128) <= 1
            for v in responsive.values()
        )
        OUT["checks"]["narrow_scroll_without_page_overflow"] = all(
            responsive[str(width)]["horizontalScroll"] and responsive[str(width)]["pageOverflow"] <= 1
            for width in [1024, 768, 390]
        )
        browser.close()

    required = [
        "widths_stable", "dom_idempotent", "fixed_width_limits", "expected_fixed_widths",
        "month_width_stable", "inline_widths_absent", "horizontal_scroll", "sticky_offsets",
        "responsive_fixed_columns", "narrow_scroll_without_page_overflow"
    ]
    failed = [name for name in required if not OUT["checks"].get(name)]
    OUT["checks"]["console_errors_zero"] = not OUT["console_errors"]
    OUT["failed_required"] = failed
    OUT["status"] = "PASS" if not failed and not OUT["console_errors"] else "FAIL"
    print(json.dumps(OUT, ensure_ascii=False, indent=2))
    return 0 if OUT["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
