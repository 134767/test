# -*- coding: utf-8 -*-
"""Playwright checks: hour budget group modal + calendar scoped query."""
import json
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5500/local.html"
OUT = {
    "status": "FAIL",
    "console_errors": [],
    "console_warnings": [],
    "checks": {},
}


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        def on_console(msg):
            if msg.type == "error":
                OUT["console_errors"].append(msg.text)
            elif msg.type == "warning":
                OUT["console_warnings"].append(msg.text)

        page.on("console", on_console)
        page.on("pageerror", lambda e: OUT["console_errors"].append(str(e)))

        page.goto(BASE, wait_until="networkidle", timeout=60000)
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1200)

        # ===== Calendar initial: no auto load =====
        page.click("text=行事曆")
        page.wait_for_timeout(500)
        wrap_hidden = page.locator("#calendar-table-wrap").get_attribute("data-cal-table-hidden")
        wrap_display = page.locator("#calendar-table-wrap").evaluate("el => getComputedStyle(el).display")
        tbody_count = page.locator("#calendar-tbody tr").count()
        secondary = page.locator("#cal-secondary-filters").evaluate("el => getComputedStyle(el).display")
        OUT["checks"]["calendar_initial_table_hidden"] = wrap_hidden == "true" or wrap_display == "none"
        OUT["checks"]["calendar_initial_no_rows"] = tbody_count == 0
        OUT["checks"]["calendar_secondary_hidden"] = secondary == "none"
        OUT["checks"]["calendar_interval_hidden"] = not page.locator("#btn-add-interval").is_visible()

        # select budget group
        budget_opts = page.eval_on_selector_all(
            "#cal-filter-budget-group option",
            "els => els.map(e => e.value).filter(Boolean)",
        )
        OUT["checks"]["calendar_budget_options"] = budget_opts
        OUT["checks"]["calendar_unique_names"] = len(budget_opts) == len(set(budget_opts))
        assert "Group_Alpha" in budget_opts
        page.select_option("#cal-filter-budget-group", label="Group_Alpha")
        page.wait_for_timeout(300)
        OUT["checks"]["calendar_secondary_visible_after_budget"] = (
            page.locator("#cal-secondary-filters").evaluate("el => getComputedStyle(el).display") != "none"
        )
        # still no auto query
        OUT["checks"]["calendar_no_auto_query"] = (
            page.locator("#calendar-table-wrap").evaluate("el => getComputedStyle(el).display") == "none"
        )

        # academic year query
        page.select_option("#cal-filter-mode", value="academicYear")
        years = page.eval_on_selector_all(
            "#cal-filter-year option", "els => els.map(e => e.value).filter(Boolean)"
        )
        OUT["checks"]["calendar_years_for_alpha"] = years
        OUT["checks"]["calendar_years_include_114"] = "114" in years
        # must explicitly select year (not auto)
        page.select_option("#cal-filter-year", value="114")
        page.click("#cal-filter-query")
        page.wait_for_timeout(800)

        OUT["checks"]["calendar_table_shown"] = (
            page.locator("#calendar-table-wrap").evaluate("el => getComputedStyle(el).display") != "none"
        )
        rows_after = page.locator("#calendar-tbody tr").count()
        OUT["checks"]["calendar_has_rows"] = rows_after > 0
        summary = page.locator("#cal-query-summary").inner_text()
        OUT["checks"]["calendar_summary"] = summary
        OUT["checks"]["calendar_summary_has_alpha"] = "Group_Alpha" in summary and "114" in summary

        # unit codes on page should not include Beta-only units if any visible unit cells
        # (soft check via localStorage scoped count)
        scope_check = page.evaluate(
            """() => {
              const budgets = JSON.parse(localStorage.getItem('workStudy_budgets')||'[]');
              const rows = JSON.parse(localStorage.getItem('workStudy_calendarRows')||'[]');
              const alpha114 = budgets.find(b => String(b.academicYear)==='114' && b.budgetName==='Group_Alpha');
              let codes = alpha114 && alpha114.unitCodes;
              if (typeof codes === 'string') codes = JSON.parse(codes);
              const set = new Set(codes||[]);
              const all114 = rows.filter(r => String(r.academicYear)==='114');
              const scoped = all114.filter(r => set.has(r.unitCode));
              return { all: all114.length, scoped: scoped.length, codes: [...set] };
            }"""
        )
        OUT["checks"]["scope_meta"] = scope_check
        OUT["checks"]["academic_year_scoped"] = scope_check["scoped"] < scope_check["all"] or scope_check["scoped"] > 0

        # interval buttons enabled after query
        OUT["checks"]["interval_enabled_after_query"] = page.locator("#btn-add-interval").is_visible() and not page.locator("#btn-add-interval").is_disabled()

        # group switch clears
        page.select_option("#cal-filter-budget-group", label="Group_Beta")
        page.wait_for_timeout(300)
        OUT["checks"]["group_switch_hides_table"] = (
            page.locator("#calendar-table-wrap").evaluate("el => getComputedStyle(el).display") == "none"
        )
        OUT["checks"]["group_switch_interval_hidden"] = not page.locator("#btn-add-interval").is_visible()

        # re-query beta 114
        page.select_option("#cal-filter-year", value="114")
        page.click("#cal-filter-query")
        page.wait_for_timeout(600)
        beta_summary = page.locator("#cal-query-summary").inner_text()
        OUT["checks"]["group_switch_query_beta"] = "Group_Beta" in beta_summary

        # date range flow (cross year if possible)
        page.select_option("#cal-filter-mode", value="dateRange")
        page.wait_for_timeout(200)
        page.fill("#cal-filter-start", "2025/09/01")
        page.fill("#cal-filter-end", "2026/09/15")
        page.click("#cal-filter-query")
        page.wait_for_timeout(700)
        OUT["checks"]["date_range_table_shown"] = (
            page.locator("#calendar-table-wrap").evaluate("el => getComputedStyle(el).display") != "none"
        )
        date_summary = page.locator("#cal-query-summary").inner_text()
        OUT["checks"]["date_range_summary"] = "Group_Beta" in date_summary

        # note colspan still works if holiday rows exist
        holiday_col = page.locator("tr.holiday-row td[colspan]").count()
        OUT["checks"]["note_colspan_present_or_none"] = True  # soft
        if holiday_col:
            c = page.locator("tr.holiday-row td[colspan]").first.get_attribute("colspan")
            OUT["checks"]["holiday_colspan"] = c
            OUT["checks"]["colspan_regression"] = c == "6"
        else:
            OUT["checks"]["colspan_regression"] = True  # no holiday in range

        # ===== Hour setting new flow =====
        page.click("text=時數設定")
        page.wait_for_timeout(500)
        page.click("#btn-add-hour")
        page.wait_for_timeout(300)
        OUT["checks"]["hour_budget_group_exists"] = page.locator("#hour-budget-group").count() == 1
        budget_label = page.locator("label", has_text="單位").first.inner_text()
        actual_label = page.locator("label", has_text="實際單位").first.inner_text()
        OUT["checks"]["hour_labels"] = {"budget": budget_label, "actual": actual_label}
        OUT["checks"]["hour_new_budget_disabled_before_year"] = page.locator("#hour-budget-group").is_disabled() or page.locator("#hour-budget-group").input_value() == ""

        page.select_option("#hour-academicYear", value="114")
        page.wait_for_timeout(250)
        bg_opts = page.eval_on_selector_all(
            "#hour-budget-group option", "els => els.map(e => ({v:e.value,t:e.textContent}))"
        )
        OUT["checks"]["hour_budget_opts_114"] = [o["t"] for o in bg_opts if o["v"]]
        OUT["checks"]["hour_budget_enabled"] = not page.locator("#hour-budget-group").is_disabled()
        # select first real budget
        real = next(o for o in bg_opts if o["v"])
        page.select_option("#hour-budget-group", value=real["v"])
        page.wait_for_timeout(350)
        # 實際單位可能被 1.5.6 增強為按鈕列（#hour-unit 隱藏）
        unit_btns = page.locator("#hour-unit-buttons-v2 .weekday-btn")
        unit_btn_count = unit_btns.count()
        unit_opts = page.eval_on_selector_all(
            "#hour-unit option", "els => els.map(e => e.value).filter(Boolean)"
        )
        OUT["checks"]["hour_actual_units_filtered"] = unit_btn_count > 0 or len(unit_opts) > 0
        if unit_btn_count > 0:
            unit_btns.first.click()
        elif unit_opts:
            page.locator("#hour-unit").evaluate(
                "(el, v) => { el.value = v; el.dispatchEvent(new Event('change', {bubbles:true})); }",
                unit_opts[0],
            )
        # 作息類型可能是按鈕
        st_btns = page.locator("#hour-schedule-type-buttons-v2 .weekday-btn")
        if st_btns.count() > 0:
            st_btns.first.click()
        else:
            page.select_option("#hour-scheduleType", index=1)
        # weekdays
        page.locator("#hour-weekdays .weekday-btn").first.click()
        page.fill("#hour-hours", "1")
        page.fill("#hour-wage", "196")
        page.fill("#hour-note", "scope-new-test")
        page.click("#hour-save-btn")
        page.wait_for_timeout(700)
        # modal closed means save ok
        OUT["checks"]["hour_new_flow"] = not page.locator("#hour-modal").is_visible()
        has_new = page.evaluate(
            "() => JSON.parse(localStorage.getItem('workStudy_hourSettings')||'[]').some(h => h.note==='scope-new-test')"
        )
        OUT["checks"]["hour_new_saved"] = has_new

        # edit flow: open first edit that has unique match
        page.locator("#hour-tbody .btn-edit").first.click()
        page.wait_for_timeout(500)
        bg_val = page.locator("#hour-budget-group").input_value()
        unit_val = page.locator("#hour-unit").input_value()
        unit_active = page.locator("#hour-unit-buttons-v2 .weekday-btn.active").count()
        OUT["checks"]["hour_edit_budget_prefilled"] = bool(bg_val)
        OUT["checks"]["hour_edit_unit_prefilled"] = bool(unit_val) or unit_active > 0
        page.click("#hour-cancel-btn")
        page.wait_for_timeout(200)

        # batch regression: button disabled then enable
        OUT["checks"]["batch_btn_disabled"] = page.locator("#btn-batch-add-hour").is_disabled()
        page.locator("#hour-tbody .row-check").first.check()
        page.wait_for_timeout(100)
        OUT["checks"]["batch_btn_enabled"] = not page.locator("#btn-batch-add-hour").is_disabled()
        page.click("#btn-batch-add-hour")
        page.wait_for_timeout(300)
        OUT["checks"]["batch_modal_open"] = page.locator("#hour-batch-add-modal").is_visible()
        page.click("#hour-batch-cancel-btn")

        browser.close()

    required = [
        "calendar_initial_table_hidden",
        "calendar_initial_no_rows",
        "calendar_secondary_hidden",
        "calendar_no_auto_query",
        "calendar_unique_names",
        "calendar_table_shown",
        "calendar_summary_has_alpha",
        "group_switch_hides_table",
        "group_switch_query_beta",
        "date_range_table_shown",
        "hour_budget_group_exists",
        "hour_budget_enabled",
        "hour_actual_units_filtered",
        "hour_new_flow",
        "hour_new_saved",
        "hour_edit_budget_prefilled",
        "batch_btn_enabled",
        "batch_modal_open",
        "colspan_regression",
    ]
    failed = [k for k in required if not OUT["checks"].get(k)]
    OUT["failed_required"] = failed
    OUT["status"] = "PASS" if not failed and not OUT["console_errors"] else "FAIL"
    print(json.dumps(OUT, ensure_ascii=False, indent=2))
    return 0 if OUT["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
