# -*- coding: utf-8 -*-
"""Local browser runtime checks for PTB 1.6.0 group-scope CSV seed."""
import json
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5500/"
OUT = {
    "status": "FAIL",
    "console_errors": [],
    "console_warnings": [],
    "checks": {},
}


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        def on_console(msg):
            t = msg.type
            text = msg.text
            if t == "error":
                OUT["console_errors"].append(text)
            elif t == "warning":
                OUT["console_warnings"].append(text)

        page.on("console", on_console)
        page.on("pageerror", lambda err: OUT["console_errors"].append(str(err)))

        # Clear storage before first load so CSV seed is used
        page.goto(BASE, wait_until="networkidle", timeout=60000)
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(1500)

        mode = page.evaluate("() => window.localStorage.getItem('workStudy_seeded')")
        budgets = page.evaluate("() => JSON.parse(localStorage.getItem('workStudy_budgets')||'[]')")
        hours = page.evaluate("() => JSON.parse(localStorage.getItem('workStudy_hourSettings')||'[]')")
        keys = page.evaluate("() => Object.keys(localStorage).filter(k => k.startsWith('workStudy_')).sort()")

        OUT["checks"]["csv_seed_load"] = bool(budgets) and len(budgets) >= 3
        OUT["checks"]["localstorage_write"] = bool(mode) or bool(budgets)
        OUT["checks"]["budget_groups"] = sorted({b.get("budgetName") for b in budgets if b.get("budgetName") and b.get("unitCodes")})
        OUT["checks"]["hour_notes_present"] = any((h.get("note") or "").strip() for h in hours)
        OUT["checks"]["localstorage_keys"] = keys

        # Hour page: note column header + escaped note
        page.click("text=時數設定")
        page.wait_for_timeout(500)
        hour_header = page.locator("#hour-table thead").inner_text()
        hour_body = page.locator("#hour-tbody").inner_text()
        OUT["checks"]["hour_note_header"] = "備註" in hour_header
        OUT["checks"]["hour_note_rendered"] = ("NOTE_" in hour_body) or ("備註測試" in hour_body)
        OUT["checks"]["hour_note_escaped"] = "<script>" not in page.locator("#hour-tbody").inner_html() and "備註測試" in hour_body

        # Search note
        page.fill("#hour-search", "NOTE_")
        page.wait_for_timeout(300)
        # trigger input event if needed
        page.dispatch_event("#hour-search", "input")
        page.wait_for_timeout(400)
        filtered_count = page.locator("#hour-tbody tr").count()
        OUT["checks"]["hour_note_search_rows"] = filtered_count

        # Calendar note header
        page.click("text=行事曆")
        page.wait_for_timeout(600)
        # query if needed
        if page.locator("#cal-filter-query").count():
            page.click("#cal-filter-query")
            page.wait_for_timeout(800)
        cal_header = page.locator("#calendar-table thead").inner_text()
        OUT["checks"]["calendar_note_header"] = "備註" in cal_header
        cal_html = page.locator("#calendar-tbody").inner_html()
        OUT["checks"]["calendar_note_escaped"] = "<script>" not in cal_html
        OUT["checks"]["calendar_has_rows"] = page.locator("#calendar-tbody tr").count() > 0

        # Difference forecast group selector
        page.click("text=差額與預估")
        page.wait_for_timeout(600)
        opts = page.eval_on_selector_all(
            "#forecast-budget-group option",
            "els => els.map(e => ({value:e.value, text:e.textContent}))"
        )
        OUT["checks"]["forecast_group_placeholder"] = any(o["value"] == "" and "請選擇預算群組" in o["text"] for o in opts)
        OUT["checks"]["forecast_group_options"] = [o["value"] for o in opts if o["value"]]
        # unselected safe
        summary_empty = page.locator("#current-summary").inner_text()
        OUT["checks"]["unselected_safe"] = "請先選擇預算群組" in summary_empty or summary_empty.strip() == ""

        # select Group_Alpha and query
        page.select_option("#forecast-budget-group", label="Group_Alpha")
        page.wait_for_timeout(500)
        if page.locator("#btn-query-current").count():
            page.click("#btn-query-current")
            page.wait_for_timeout(700)
        current_txt = page.locator("#current-summary").inner_text()
        OUT["checks"]["current_scoped_label"] = "Group_Alpha" in current_txt

        # switch group clears / changes
        page.select_option("#forecast-budget-group", label="Group_Beta")
        page.wait_for_timeout(500)
        if page.locator("#btn-query-current").count():
            page.click("#btn-query-current")
            page.wait_for_timeout(700)
        current_beta = page.locator("#current-summary").inner_text()
        OUT["checks"]["group_switch_works"] = "Group_Beta" in current_beta

        # reload readback
        page.reload(wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(1000)
        budgets2 = page.evaluate("() => JSON.parse(localStorage.getItem('workStudy_budgets')||'[]')")
        OUT["checks"]["reload_readback"] = len(budgets2) == len(budgets) and len(budgets2) > 0

        # export / reset hooks exist
        hooks = page.evaluate(
            "() => ({export: typeof window.exportWorkStudyCsvDb, reload: typeof window.reloadWorkStudyCsvDb, clear: typeof window.clearWorkStudyData})"
        )
        OUT["checks"]["csv_hooks"] = hooks

        browser.close()

    required = [
        "csv_seed_load",
        "localstorage_write",
        "hour_note_header",
        "hour_note_rendered",
        "hour_note_escaped",
        "calendar_note_header",
        "forecast_group_placeholder",
        "unselected_safe",
        "current_scoped_label",
        "group_switch_works",
        "reload_readback",
    ]
    failed = [k for k in required if not OUT["checks"].get(k)]
    OUT["status"] = "PASS" if not failed and not OUT["console_errors"] else ("PARTIAL" if not failed else "FAIL")
    OUT["failed_required"] = failed
    print(json.dumps(OUT, ensure_ascii=False, indent=2))
    return 0 if OUT["status"] in ("PASS", "PARTIAL") and not failed else 1


if __name__ == "__main__":
    sys.exit(main())
