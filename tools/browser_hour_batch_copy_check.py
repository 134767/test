# -*- coding: utf-8 -*-
"""Browser gate for PTB 1.6.0 hotfix-8 budget option deduplication."""
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

        page.click("text=時數設定")
        page.wait_for_timeout(300)

        header = page.locator("#hour-table thead").inner_text()
        OUT["checks"]["main_budget_unit_column"] = "預算單位" in header
        table_text = page.locator("#hour-tbody").inner_text()
        OUT["checks"]["main_budget_unit_value"] = "Group_Alpha" in table_text

        page.fill("#hour-search", "Group_Alpha")
        page.dispatch_event("#hour-search", "input")
        page.wait_for_timeout(200)
        filtered_rows = page.locator("#hour-tbody tr")
        OUT["checks"]["search_budget_unit"] = filtered_rows.count() > 0 and all(
            "Group_Alpha" in filtered_rows.nth(i).inner_text() for i in range(filtered_rows.count())
        )
        page.fill("#hour-search", "")
        page.dispatch_event("#hour-search", "input")

        batch = page.locator("#btn-batch-add-hour")
        OUT["checks"]["button_enabled_without_selection"] = not batch.is_disabled()
        batch.click()
        OUT["checks"]["direct_mode_opens"] = page.locator("#hour-batch-add-modal").is_visible()

        source_years = page.locator("#hour-batch-source-year option").evaluate_all("els => els.map(e => e.value).filter(Boolean)")
        OUT["checks"]["source_year_select"] = "114" in source_years
        page.select_option("#hour-batch-source-year", "114")
        page.fill("#hour-batch-source-budget-search", "Beta")
        beta_options = page.locator("#hour-batch-source-budget option").all_text_contents()
        OUT["checks"]["source_budget_search"] = any("Group_Beta" in text for text in beta_options) and not any("Group_Alpha" in text for text in beta_options)
        page.fill("#hour-batch-source-budget-search", "")
        page.select_option("#hour-batch-source-budget", "BUD_ANON_114_ALPHA")
        alpha_preview = page.locator("#hour-batch-preview-tbody tr")
        alpha_text = page.locator("#hour-batch-preview-tbody").inner_text()
        alpha_count = alpha_preview.count()
        OUT["checks"]["source_budget_preview"] = alpha_count > 0 and "Group_Alpha" in alpha_text and "Unit_B1" not in alpha_text
        OUT["checks"]["preview_budget_unit_column"] = "來源預算單位" in page.locator("#hour-batch-preview-table thead").inner_text()

        page.select_option("#hour-batch-source-budget", "BUD_ANON_114_BETA")
        beta_text = page.locator("#hour-batch-preview-tbody").inner_text()
        OUT["checks"]["source_switch_updates_preview"] = "Group_Beta" in beta_text and beta_text != alpha_text
        page.select_option("#hour-batch-source-budget", "BUD_ANON_114_ALPHA")

        page.select_option("#hour-batch-target-year", "115")
        OUT["checks"]["same_name_auto_select"] = page.locator("#hour-batch-target-budget").input_value() == "BUD_ANON_115_ALPHA"
        target_options = page.locator("#hour-batch-target-budget option").all_text_contents()
        OUT["checks"]["target_year_updates_budgets"] = any("Group_Alpha" in text for text in target_options)

        page.select_option("#hour-batch-target-budget", "")
        OUT["checks"]["target_budget_required"] = page.locator("#hour-batch-confirm-btn").is_disabled()
        page.select_option("#hour-batch-target-budget", "BUD_ANON_115_ALPHA")
        summary = page.locator("#hour-batch-plan-summary").inner_text()
        OUT["checks"]["exact_target_scope_summary"] = "預計略過" in summary and "Group_Alpha" in summary

        before_sources = page.evaluate("() => JSON.parse(localStorage.getItem('workStudy_hourSettings')||'[]').filter(x => x.academicYear === '114')")
        page.click("#hour-batch-confirm-btn")
        page.wait_for_timeout(700)
        after = page.evaluate("() => JSON.parse(localStorage.getItem('workStudy_hourSettings')||'[]')")
        added = [row for row in after if row.get("academicYear") == "115"]
        after_sources = [row for row in after if row.get("academicYear") == "114"]
        OUT["checks"]["cross_budget_copy_blocked"] = bool(added) and all(row.get("unitCode") == "U_A1" for row in added)
        OUT["checks"]["source_rows_unchanged"] = before_sources == after_sources

        # Checkbox entry mode: reset the fixture so the first Alpha row is still a 114 source.
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="networkidle", timeout=60000)
        page.click("text=時數設定")
        page.wait_for_timeout(250)
        page.fill("#hour-search", "Group_Alpha")
        page.dispatch_event("#hour-search", "input")
        row_check = page.locator("#hour-tbody .row-check").first
        row_check.check()
        page.click("#btn-batch-add-hour")
        OUT["checks"]["checkbox_mode"] = (
            page.locator("#hour-batch-source-year").is_disabled()
            and page.locator("#hour-batch-source-budget").is_disabled()
            and page.locator("#hour-batch-source-budget").input_value() == "BUD_ANON_114_ALPHA"
        )
        page.click("#hour-batch-cancel-btn")

        # Same persisted id repeated at runtime must collapse to one normal option.
        page.evaluate("""() => {
          const budgets = JSON.parse(localStorage.getItem('workStudy_budgets') || '[]');
          const source = budgets.find(b => b.id === 'BUD_ANON_114_ALPHA');
          const target = budgets.find(b => b.id === 'BUD_ANON_115_ALPHA');
          budgets.push(structuredClone(source), structuredClone(source), structuredClone(target));
          localStorage.setItem('workStudy_budgets', JSON.stringify(budgets));
        }""")
        page.reload(wait_until="networkidle", timeout=60000)
        page.locator('[data-tab="hour"]').click()
        page.click("#btn-batch-add-hour")
        page.select_option("#hour-batch-source-year", "114")
        source_alpha = page.locator("#hour-batch-source-budget option", has_text="Group_Alpha")
        OUT["checks"]["same_id_source_collapsed"] = source_alpha.count() == 1 and not source_alpha.first.is_disabled()
        page.select_option("#hour-batch-source-budget", "BUD_ANON_114_ALPHA")
        page.select_option("#hour-batch-target-year", "115")
        target_alpha = page.locator("#hour-batch-target-budget option", has_text="Group_Alpha")
        OUT["checks"]["same_id_target_collapsed"] = target_alpha.count() == 1 and not target_alpha.first.is_disabled()
        page.click("#hour-batch-cancel-btn")

        # Distinct ids with the same year/name must render one disabled conflict option.
        diagnosis = page.evaluate("""() => {
          const budgets = JSON.parse(localStorage.getItem('workStudy_budgets') || '[]');
          const conflicts = [
            { id:'READ_114_A', academicYear:'114', budgetName:'讀服組', unitCodes:['U_A1'], budgetAmount:10, note:'a' },
            { id:'READ_114_B', academicYear:'114', budgetName:'讀服組', unitCodes:['U_A2'], budgetAmount:20, note:'b' },
            { id:'READ_114_C', academicYear:'114', budgetName:'讀服組', unitCodes:['U_B1'], budgetAmount:30, note:'c' },
            { id:'READ_115_A', academicYear:'115', budgetName:'讀服組', unitCodes:['U_A1'], budgetAmount:10, note:'a' },
            { id:'READ_115_B', academicYear:'115', budgetName:'讀服組', unitCodes:['U_B1'], budgetAmount:20, note:'b' }
          ];
          budgets.push(...conflicts);
          localStorage.setItem('workStudy_budgets', JSON.stringify(budgets));
          const rows = conflicts.filter(b => b.academicYear === '114');
          return {
            academic_year: '114', budget_name: '讀服組', raw_record_count: rows.length,
            unique_identity_count: new Set(rows.map(b => b.id)).size,
            record_ids: rows.map(b => b.id), unit_code_sets: rows.map(b => b.unitCodes),
            category: 'PERSISTED_DUPLICATE_DIFFERENT_IDS'
          };
        }""")
        OUT["diagnosis"] = diagnosis
        page.reload(wait_until="networkidle", timeout=60000)
        page.locator('[data-tab="hour"]').click()
        page.click("#btn-batch-add-hour")
        page.select_option("#hour-batch-source-year", "114")
        source_conflict = page.locator("#hour-batch-source-budget option", has_text="讀服組")
        OUT["checks"]["source_duplicate_single_warning"] = source_conflict.count() == 1 and "重複 3 筆" in source_conflict.first.inner_text()
        OUT["checks"]["source_duplicate_disabled"] = source_conflict.first.is_disabled() and source_conflict.first.get_attribute("value") == ""
        OUT["checks"]["duplicate_confirm_disabled"] = page.locator("#hour-batch-confirm-btn").is_disabled()
        page.select_option("#hour-batch-target-year", "115")
        target_conflict = page.locator("#hour-batch-target-budget option", has_text="讀服組")
        OUT["checks"]["target_duplicate_single_warning"] = target_conflict.count() == 1 and "重複 2 筆" in target_conflict.first.inner_text()
        OUT["checks"]["target_duplicate_disabled"] = target_conflict.first.is_disabled() and target_conflict.first.get_attribute("value") == ""
        page.click("#hour-batch-cancel-btn")
        page.locator('[data-tab="budget"]').click()
        OUT["checks"]["budget_page_duplicate_warning"] = (
            page.locator("#budget-duplicate-warning").is_visible()
            and "資料重複（共 3 筆）" in page.locator("#budget-tbody").inner_text()
        )

        browser.close()

    required = [
        "main_budget_unit_column", "main_budget_unit_value", "search_budget_unit",
        "button_enabled_without_selection", "direct_mode_opens", "source_year_select",
        "source_budget_search", "source_budget_preview", "preview_budget_unit_column",
        "source_switch_updates_preview", "same_name_auto_select", "target_year_updates_budgets",
        "target_budget_required", "exact_target_scope_summary", "cross_budget_copy_blocked",
        "source_rows_unchanged", "checkbox_mode", "same_id_source_collapsed",
        "same_id_target_collapsed", "source_duplicate_single_warning",
        "source_duplicate_disabled", "duplicate_confirm_disabled",
        "target_duplicate_single_warning", "target_duplicate_disabled",
        "budget_page_duplicate_warning"
    ]
    failed = [name for name in required if not OUT["checks"].get(name)]
    OUT["checks"]["console_errors_zero"] = not OUT["console_errors"]
    OUT["failed_required"] = failed
    OUT["status"] = "PASS" if not failed and not OUT["console_errors"] else "FAIL"
    print(json.dumps(OUT, ensure_ascii=False, indent=2))
    return 0 if OUT["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
