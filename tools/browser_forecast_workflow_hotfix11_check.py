# -*- coding: utf-8 -*-
import json
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5500/local.html"
OUT = {"status": "FAIL", "checks": {}, "console_errors": []}


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.on("console", lambda msg: OUT["console_errors"].append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: OUT["console_errors"].append(str(err)))
        page.goto(BASE, wait_until="networkidle", timeout=60000)
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="networkidle", timeout=60000)
        page.locator('[data-tab="differenceForecast"]').click()

        for _ in range(10):
            page.click("#btn-open-forecast-modal")
            page.click("#fe-modal-exit")
        page.click("#btn-open-forecast-modal")
        OUT["checks"]["default_load_page"] = page.locator("#fe-load-panel").is_visible() and not page.locator("#fe-create-panel").is_visible()
        page.locator("#forecast-eval-modal").click(position={"x": 3, "y": 3})
        OUT["checks"]["background_does_not_close"] = page.locator("#forecast-eval-modal").is_visible()

        page.click("#fe-tab-create")
        initial_rows = page.locator("#fe-interval-tbody tr").count()
        page.click("#fe-add-interval")
        OUT["checks"]["single_add_handler"] = page.locator("#fe-interval-tbody tr").count() == initial_rows + 1
        boxes = page.locator(".fe-interval-select")
        boxes.nth(0).check()
        select_all = page.locator("#fe-interval-select-all")
        OUT["checks"]["interval_indeterminate"] = select_all.evaluate("el => el.indeterminate")
        page.click("#fe-delete-selected-intervals")
        OUT["checks"]["interval_batch_delete"] = page.locator("#fe-interval-tbody tr").count() == initial_rows

        page.fill("#fe-name", "HOTFIX11 Plan")
        page.fill("#fe-budget", "123456")
        page.click("#fe-save-evaluation")
        page.wait_for_timeout(700)
        saved = page.evaluate("() => JSON.parse(localStorage.getItem('workStudy_forecastEvaluations') || '[]')")
        saved_plan = next((row for row in saved if row.get("name") == "HOTFIX11 Plan"), None)
        saved_id = saved_plan["id"] if saved_plan else ""
        OUT["checks"]["save_new"] = bool(saved_plan) and isinstance(saved_plan.get("intervals"), list)
        OUT["checks"]["save_returns_to_load_selected"] = page.locator("#fe-load-panel").is_visible() and page.locator("#fe-load-select").input_value() == saved_id
        OUT["checks"]["save_does_not_start"] = "尚未建立評估" in page.locator("#future-current-eval").inner_text() and page.locator("#forecast-eval-modal").is_visible()
        OUT["checks"]["readonly_intervals"] = page.locator("#fe-load-summary input").count() == 0 and page.locator("#fe-load-summary tbody tr").count() == 1

        page.click("#fe-start-evaluation")
        OUT["checks"]["budget_required"] = page.locator("#forecast-eval-modal").is_visible()
        page.select_option("#forecast-budget-group", index=1)
        page.click("#fe-start-evaluation")
        OUT["checks"]["start_applies_without_write"] = not page.locator("#forecast-eval-modal").is_visible() and "HOTFIX11 Plan" in page.locator("#future-current-eval").inner_text()
        after_start = page.evaluate("() => JSON.parse(localStorage.getItem('workStudy_forecastEvaluations') || '[]')")
        OUT["checks"]["start_preserves_record"] = after_start == saved

        page.click("#btn-open-forecast-modal")
        page.click("#fe-tab-create")
        page.locator(f'#fe-history-tbody tr[data-id="{saved_id}"] .fe-history-edit').click()
        OUT["checks"]["edit_loads_form"] = page.locator("#fe-name").input_value() == "HOTFIX11 Plan"
        page.fill("#fe-budget", "654321")
        page.click("#fe-save-evaluation")
        page.wait_for_timeout(700)
        updated = page.evaluate("() => JSON.parse(localStorage.getItem('workStudy_forecastEvaluations') || '[]')")
        updated_plan = [row for row in updated if row.get("id") == saved_id]
        OUT["checks"]["update_same_id"] = len(updated_plan) == 1 and updated_plan[0]["budget"] == 654321

        page.click("#fe-modal-exit")
        page.reload(wait_until="networkidle", timeout=60000)
        page.locator('[data-tab="differenceForecast"]').click()
        page.click("#btn-open-forecast-modal")
        OUT["checks"]["reload_dropdown"] = page.locator(f'#fe-load-select option[value="{saved_id}"]').count() == 1

        page.evaluate("""id => {
          const rows = JSON.parse(localStorage.getItem('workStudy_forecastEvaluations') || '[]');
          const target = rows.find(row => row.id === id);
          target.intervals = JSON.stringify(target.intervals);
          rows.push({id:'FE_BAD',name:'Broken Plan',budget:1,intervals:'{bad',createdAt:'2020',updatedAt:'2020'});
          localStorage.setItem('workStudy_forecastEvaluations', JSON.stringify(rows));
        }""", saved_id)
        page.click("#fe-modal-exit")
        page.reload(wait_until="networkidle", timeout=60000)
        page.locator('[data-tab="differenceForecast"]').click()
        page.click("#btn-open-forecast-modal")
        page.select_option("#fe-load-select", saved_id)
        OUT["checks"]["json_string_reload"] = page.locator("#fe-load-summary tbody tr").count() == 1
        page.select_option("#forecast-budget-group", index=1)
        page.click("#fe-start-evaluation")
        page.click("#btn-open-forecast-modal")
        page.select_option("#fe-load-select", "FE_BAD")
        OUT["checks"]["malformed_visible"] = "區間資料格式異常" in page.locator("#fe-load-summary").inner_text() and page.locator("#fe-start-evaluation").is_disabled()

        page.click("#fe-tab-create")
        page.on("dialog", lambda dialog: dialog.accept())
        page.locator(f'#fe-history-tbody tr[data-id="{saved_id}"] .fe-history-delete').click()
        page.wait_for_timeout(700)
        OUT["checks"]["delete_refreshes"] = page.locator(f'#fe-history-tbody tr[data-id="{saved_id}"]').count() == 0 and page.locator(f'#fe-load-select option[value="{saved_id}"]').count() == 0
        OUT["checks"]["active_delete_clears"] = "尚未建立評估" in page.locator("#future-current-eval").inner_text()

        page.set_viewport_size({"width": 390, "height": 844})
        OUT["mobile"] = page.evaluate("""() => {
          const modal = document.querySelector('#forecast-eval-modal .modal-content');
          const rect = modal.getBoundingClientRect();
          const offenders = [...document.querySelectorAll('body *')].map(el => {
            const r=el.getBoundingClientRect(); return {tag:el.tagName,id:el.id,cls:el.className,right:r.right,width:r.width,scroll:el.scrollWidth,client:el.clientWidth};
          }).filter(x => x.right > document.documentElement.clientWidth + 1 || x.scroll > x.client + 1).slice(0,12);
          return {left:rect.left,right:rect.right,viewport:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,offenders};
        }""")
        OUT["checks"]["mobile_no_overflow"] = OUT["mobile"]["left"] >= 0 and OUT["mobile"]["right"] <= OUT["mobile"]["viewport"] and OUT["mobile"]["scrollWidth"] <= OUT["mobile"]["viewport"]
        browser.close()

    required = [
        "default_load_page", "background_does_not_close", "single_add_handler", "interval_indeterminate",
        "interval_batch_delete", "save_new", "save_returns_to_load_selected", "save_does_not_start",
        "readonly_intervals", "budget_required", "start_applies_without_write", "start_preserves_record",
        "edit_loads_form", "update_same_id", "reload_dropdown", "json_string_reload", "malformed_visible",
        "delete_refreshes", "active_delete_clears", "mobile_no_overflow"
    ]
    failed = [name for name in required if not OUT["checks"].get(name)]
    OUT["checks"]["console_errors_zero"] = not OUT["console_errors"]
    OUT["failed_required"] = failed
    OUT["status"] = "PASS" if not failed and not OUT["console_errors"] else "FAIL"
    print(json.dumps(OUT, ensure_ascii=False, indent=2))
    return 0 if OUT["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
