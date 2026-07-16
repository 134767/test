# -*- coding: utf-8 -*-
"""Browser regression gate for HOTFIX12 salary query summary cards."""
import json
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5500/local.html"
OUT = {"status": "FAIL", "checks": {}, "console_errors": []}


def install_fixture(page, budget=5744800, estimate=5625914, actual=5241739):
    page.evaluate("""([budget, estimate, actual]) => {
      localStorage.setItem('workStudy_units', JSON.stringify([
        {id:'U1',unitCode:'R01',unitName:'讀服組一'}
      ]));
      localStorage.setItem('workStudy_budgets', JSON.stringify([
        {id:'B1',academicYear:'114',budgetName:'讀服組',unitCodes:['R01'],budgetAmount:budget,note:''}
      ]));
      localStorage.setItem('workStudy_calendarRows', JSON.stringify([
        {id:'C1',date:'2025-08-15',academicYear:'114',weekday:'五',scheduleType:'平日',
         unitCode:'R01',unitName:'讀服組一',startTime:'08:00',endTime:'09:00',hours:estimate,
         hourlyWage:1,sourceHourSettingId:'H1'}
      ]));
      localStorage.setItem('workStudy_salaryEntries', JSON.stringify([
        {id:'S1',academicYear:'114',year:2025,month:8,unitCode:'R01',actualAmount:actual,note:''}
      ]));
    }""", [budget, estimate, actual])
    page.reload(wait_until="networkidle", timeout=60000)
    page.locator('[data-tab="salaryEntry"]').click()
    page.select_option('#salary-budget-name', '讀服組')


def query_academic_year(page):
    page.select_option('#salary-filter-mode', 'academicYear')
    page.select_option('#salary-filter-year', '114')
    page.click('#salary-filter-query')


def summary_state(page):
    return page.evaluate("""() => {
      const queryItems = [...document.querySelectorAll('.salary-summary-query-item')];
      const cards = [...document.querySelectorAll('.salary-summary-item')];
      return {
        query: queryItems.map(el => el.textContent.replace(/\\s+/g, ' ').trim()),
        labels: cards.map(el => el.querySelector('.salary-summary-label')?.textContent.trim()),
        values: cards.map(el => el.querySelector('.salary-summary-value')?.textContent.trim()),
        classes: cards.map(el => el.className),
        titleBeforeValue: cards.every(el => {
          const label = el.querySelector('.salary-summary-label');
          const value = el.querySelector('.salary-summary-value');
          return label && value && Boolean(label.compareDocumentPosition(value) & Node.DOCUMENT_POSITION_FOLLOWING);
        })
      };
    }""")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("console", lambda msg: OUT["console_errors"].append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: OUT["console_errors"].append(str(err)))
        page.goto(BASE, wait_until="networkidle", timeout=60000)
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="networkidle", timeout=60000)

        install_fixture(page)
        query_academic_year(page)
        academic = summary_state(page)
        OUT["checks"]["academic_query_two_items"] = academic["query"] == ['群組 讀服組', '目前學年度 114']
        OUT["checks"]["five_cards"] = len(academic["labels"]) == 5
        OUT["checks"]["title_before_value"] = academic["titleBeforeValue"]
        OUT["checks"]["formatted_values"] = academic["values"] == ['5,744,800', '5,625,914', '5,241,739', '384,175', '503,061']
        OUT["checks"]["primary_total"] = 'salary-summary-item--primary' in academic["classes"][0]
        OUT["checks"]["positive_difference"] = 'salary-summary-item--positive' in academic["classes"][3]
        OUT["checks"]["positive_remaining"] = 'salary-summary-item--positive' in academic["classes"][4]
        OUT["checks"]["unit_summary_unchanged"] = page.locator('#salary-unit-summary-tbody tr').count() == 2
        OUT["checks"]["month_detail_unchanged"] = page.locator('#salary-month-tbody tr').count() > 0
        page.click('#btn-open-salary-modal')
        OUT["checks"]["salary_modal_unchanged"] = page.locator('#salary-modal').evaluate("el => getComputedStyle(el).display === 'flex'")
        page.click('#sal-modal-cancel')

        page.select_option('#salary-filter-mode', 'dateRange')
        page.fill('#salary-filter-start', '2025-08')
        page.fill('#salary-filter-end', '2026-02')
        page.click('#salary-filter-query')
        date_range = summary_state(page)
        OUT["checks"]["date_range_rebuild"] = date_range["query"] == ['群組 讀服組', '日期區間 2025-08 ～ 2026-02']
        OUT["checks"]["date_range_excludes_year"] = all('目前學年度' not in item for item in date_range["query"])
        OUT["checks"]["date_range_five_cards"] = len(date_range["labels"]) == 5

        install_fixture(page, budget=100, estimate=100, actual=200)
        query_academic_year(page)
        negative = summary_state(page)
        OUT["checks"]["negative_classes"] = all('salary-summary-item--negative' in negative["classes"][i] for i in (3, 4))
        OUT["checks"]["negative_signs"] = negative["values"][3:] == ['-100', '-100']

        install_fixture(page, budget=200, estimate=200, actual=200)
        query_academic_year(page)
        zero = summary_state(page)
        OUT["checks"]["zero_non_negative"] = all('salary-summary-item--positive' in zero["classes"][i] for i in (3, 4))

        expected_columns = {1440: 5, 900: 3, 600: 2, 390: 1}
        responsive_ok = True
        overflow_ok = True
        for width, columns in expected_columns.items():
            page.set_viewport_size({"width": width, "height": 1000})
            measured = page.evaluate("""() => ({
              columns: getComputedStyle(document.querySelector('.salary-summary-grid')).gridTemplateColumns.split(' ').filter(Boolean).length,
              overflow: document.documentElement.scrollWidth > window.innerWidth,
              overlap: [...document.querySelectorAll('.salary-summary-item')].some((card, index, cards) =>
                cards.slice(index + 1).some(other => {
                  const a = card.getBoundingClientRect(); const b = other.getBoundingClientRect();
                  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
                }))
            })""")
            responsive_ok = responsive_ok and measured["columns"] == columns and not measured["overlap"]
            overflow_ok = overflow_ok and not measured["overflow"]
        OUT["checks"]["responsive_columns"] = responsive_ok
        OUT["checks"]["horizontal_overflow_false"] = overflow_ok
        browser.close()

    OUT["checks"]["console_errors_zero"] = not OUT["console_errors"]
    failed = [name for name, value in OUT["checks"].items() if not value]
    OUT["failed_required"] = failed
    OUT["status"] = "PASS" if not failed else "FAIL"
    print(json.dumps(OUT, ensure_ascii=False, indent=2))
    return 0 if OUT["status"] == "PASS" else 1


if __name__ == '__main__':
    sys.exit(main())
