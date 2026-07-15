# -*- coding: utf-8 -*-
"""Visible button create/edit/reference guard and shell cleanup checks."""
import json
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5500/local.html"
out = {"status": "FAIL", "checks": {}, "console_errors": []}

empty = {
    "calendarPeriods": [], "calendarRows": [], "calendarHolidays": [],
    "salaryEntries": [], "forecastEvaluations": [], "holidayNames": []
}
units = [
    {"id": "U1", "unitCode": "A", "unitName": "甲"},
    {"id": "U2", "unitCode": "B", "unitName": "乙"},
    {"id": "U3", "unitCode": "C", "unitName": "丙"},
]
budgets = [{"id": "B1", "academicYear": "114", "budgetName": "測試群組", "unitCodes": ["A", "B", "C"], "budgetAmount": 1}]
types = [{"id": "S1", "name": "平日"}, {"id": "S2", "name": "假日"}]


def set_fixture(page, hours=None, calendar=None):
    data = dict(empty)
    data.update({"budgets": budgets, "units": units, "scheduleTypes": types,
                 "hourSettings": hours or [], "calendarRows": calendar or []})
    page.evaluate("""data => {
      localStorage.clear();
      localStorage.setItem('workStudy_seeded','true');
      for (const [name, rows] of Object.entries(data)) localStorage.setItem('workStudy_'+name, JSON.stringify(rows));
    }""", data)
    page.reload(wait_until="networkidle")
    page.click("text=時數設定")


def click_choice(page, group, value):
    page.locator(f"{group} button", has_text=value).click()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.on("console", lambda msg: out["console_errors"].append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda error: out["console_errors"].append(str(error)))
    page.goto(BASE, wait_until="networkidle")

    # Create: visible 2 × 3 button selections.
    set_fixture(page)
    page.click("#btn-add-hour")
    page.select_option("#hour-academicYear", "114")
    page.select_option("#hour-budget-group", "B1")
    out["checks"]["native_selects_hidden"] = not page.locator("#hour-scheduleType").is_visible() and not page.locator("#hour-unit").is_visible()
    out["checks"]["visible_schedule_buttons"] = page.locator("#hour-schedule-type-buttons .hour-choice-btn:visible").count() == 2
    out["checks"]["visible_unit_buttons"] = page.locator("#hour-unit-buttons .hour-choice-btn:visible").count() == 3
    for value in ("平日", "假日"):
        click_choice(page, "#hour-schedule-type-buttons", value)
    for value in ("A", "B", "C"):
        click_choice(page, "#hour-unit-buttons", value)
    click_choice(page, "#hour-weekdays", "星期一")
    click_choice(page, "#hour-weekdays", "星期二")
    page.fill("#hour-startTime", "08:00")
    page.fill("#hour-endTime", "17:00")
    page.fill("#hour-hours", "8")
    page.fill("#hour-note", "six rows")
    page.click("#hour-save-btn")
    page.wait_for_function("document.querySelector('#hour-modal').style.display === 'none'")
    created = page.evaluate("JSON.parse(localStorage.getItem('workStudy_hourSettings'))")
    out["checks"]["create_cartesian_six"] = len(created) == 6 and len({row["id"] for row in created}) == 6
    out["checks"]["create_fields"] = all(row["note"] == "six rows" and row["weekdays"] == "星期一|星期二" and row["startTime"] == "08:00" and row["endTime"] == "17:00" and row["hours"] == 8 for row in created)
    page.reload(wait_until="networkidle")
    out["checks"]["create_survives_reload"] = page.evaluate("JSON.parse(localStorage.getItem('workStudy_hourSettings')).length") == 6

    # Edit: preserve original identity while expanding to four combinations.
    original = {"id": "H_ORIGINAL", "academicYear": "114", "scheduleType": "平日", "unitCode": "A", "unitName": "甲", "weekdays": "星期一", "startTime": "08:00", "endTime": "17:00", "hours": 8, "note": "old", "createdAt": "2026-01-01T00:00:00.000Z"}
    set_fixture(page, [original])
    page.click("button.btn-edit[data-id='H_ORIGINAL']")
    active = page.eval_on_selector_all(".hour-choice-btn.active", "els => els.map(el => el.dataset.value)")
    out["checks"]["edit_original_buttons_active"] = "平日" in active and "A" in active
    click_choice(page, "#hour-schedule-type-buttons", "假日")
    click_choice(page, "#hour-unit-buttons", "B")
    page.fill("#hour-note", "expanded")
    page.click("#hour-save-btn")
    page.wait_for_function("document.querySelector('#hour-modal').style.display === 'none'")
    edited = page.evaluate("JSON.parse(localStorage.getItem('workStudy_hourSettings'))")
    keys = {"|".join(str(row.get(k, "")) for k in ("academicYear", "scheduleType", "unitCode", "weekdays", "startTime", "endTime")) for row in edited}
    out["checks"]["edit_expands_four"] = len(edited) == 4 and len(keys) == 4
    out["checks"]["edit_preserves_original_id"] = any(row["id"] == "H_ORIGINAL" and row["scheduleType"] == "平日" and row["unitCode"] == "A" for row in edited)
    out["checks"]["edit_new_ids_unique"] = len({row["id"] for row in edited}) == 4
    page.reload(wait_until="networkidle")
    out["checks"]["edit_survives_reload"] = page.evaluate("JSON.parse(localStorage.getItem('workStudy_hourSettings')).length") == 4

    # Referenced source identity cannot be removed; Calendar data remains byte-for-byte equivalent.
    calendar = [{"id": "C1", "sourceHourSettingId": "H_ORIGINAL", "hourlyWage": 237, "date": "2026-07-01"}]
    set_fixture(page, [original], calendar)
    before = page.evaluate("() => ({h:localStorage.getItem('workStudy_hourSettings'),c:localStorage.getItem('workStudy_calendarRows')})")
    page.click("button.btn-edit[data-id='H_ORIGINAL']")
    click_choice(page, "#hour-schedule-type-buttons", "平日")
    click_choice(page, "#hour-schedule-type-buttons", "假日")
    page.click("#hour-save-btn")
    page.wait_for_timeout(300)
    after = page.evaluate("() => ({h:localStorage.getItem('workStudy_hourSettings'),c:localStorage.getItem('workStudy_calendarRows'),modal:document.querySelector('#hour-modal').style.display,toast:document.querySelector('#toast-container')?.textContent||''})")
    out["checks"]["referenced_guard_message"] = "此時數設定已被行事曆使用，原作息類型與實際單位不可移除；可保留原組合並新增其他組合。" in after["toast"]
    out["checks"]["referenced_data_unchanged"] = before["h"] == after["h"] and before["c"] == after["c"] and after["modal"] == "flex"

    # Re-bootstrap clears an injected GAS loading shell and does not duplicate tabs/pages.
    page.evaluate("""async () => {
      const loading=document.createElement('p');loading.id='gas-loading';loading.textContent='資料載入中…';
      document.querySelector('#main-content').prepend(loading);
      const app=await import('/js/app.js?v=1.6.0-hour-button-shell-hotfix-3');await app.bootstrap();
    }""")
    out["checks"]["gas_loading_removed"] = page.locator("#gas-loading").count() == 0
    out["checks"]["no_duplicate_tabs_pages"] = page.locator("#tab-bar .tab-btn").count() == 6 and page.locator("#main-content .page-container").count() == 6

    failure_page = browser.new_page()
    failure_page.goto(BASE, wait_until="networkidle")
    failure_page.evaluate("""async () => {
      window.WORK_STUDY_CONFIG={DATA_MODE:'gasSheet'};
      let failure;
      const runner={withSuccessHandler(){return runner},withFailureHandler(fn){failure=fn;return runner},runServerFunction(){failure(new Error('forced bootstrap failure'))}};
      window.google={script:{run:runner}};
      const app=await import('/js/app.js?v=1.6.0-hour-button-shell-hotfix-3');
      await app.bootstrap();
    }""")
    out["checks"]["bootstrap_failure_visible"] = failure_page.locator("#main-content [role='alert'] h2", has_text="資料庫載入失敗").count() == 1
    failure_page.close()

    browser.close()

out["status"] = "PASS" if all(out["checks"].values()) and not out["console_errors"] else "FAIL"
print(json.dumps(out, ensure_ascii=False))
sys.exit(0 if out["status"] == "PASS" else 1)
