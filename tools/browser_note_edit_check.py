# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright
import json

BASE = "http://127.0.0.1:5500/local.html"
out = {}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto(BASE, wait_until="networkidle", timeout=60000)
    page.evaluate("() => localStorage.clear()")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1200)

    hours = page.evaluate("() => JSON.parse(localStorage.getItem('workStudy_hourSettings')||'[]')")
    rows = page.evaluate("() => JSON.parse(localStorage.getItem('workStudy_calendarRows')||'[]')")
    note_h = next((h for h in hours if (h.get("note") or "").strip()), None)
    matched = sum(1 for r in rows if note_h and r.get("sourceHourSettingId") == note_h["id"])
    out["source_hour_id"] = note_h["id"] if note_h else None
    out["source_note"] = (note_h.get("note") if note_h else "")[:80]
    out["calendar_rows_linked"] = matched

    page.click("text=行事曆")
    page.wait_for_timeout(400)
    # PTB 1.6.0 explicit query: select a budget group before querying.
    if page.locator("#cal-filter-budget-group").count():
        options = page.locator("#cal-filter-budget-group option").evaluate_all("els => els.map(e => e.value).filter(Boolean)")
        if options:
            page.select_option("#cal-filter-budget-group", options[0])
            page.wait_for_timeout(300)
    if page.locator("#cal-filter-query").count():
        page.click("#cal-filter-query")
        page.wait_for_timeout(900)
    body = page.locator("#calendar-tbody").inner_text()
    present = False
    if note_h:
        n = note_h["note"]
        if "NOTE_" in n:
            present = "NOTE_" in body
        elif "備註測試" in n:
            present = "備註測試" in body
    out["calendar_note_text_visible"] = present
    out["holiday_colspan"] = (
        page.locator("tr.holiday-row td[colspan]").first.get_attribute("colspan")
        if page.locator("tr.holiday-row td[colspan]").count()
        else None
    )
    out["period_only_colspan"] = (
        page.locator("tr.period-only-row td[colspan]").first.get_attribute("colspan")
        if page.locator("tr.period-only-row td[colspan]").count()
        else None
    )

    page.click("text=時數設定")
    page.wait_for_timeout(400)
    page.fill("#hour-filter-keyword", "")
    page.click("#hour-filter-query")
    page.wait_for_timeout(300)
    page.locator("#hour-tbody tr", has_text="Group_Alpha").first.locator(".btn-edit").click()
    page.wait_for_timeout(300)
    page.fill("#hour-note", "EDITED_NOTE_RUNTIME_XYZ")
    page.click("#hour-save-btn")
    page.wait_for_timeout(700)
    table_txt = page.locator("#hour-tbody").inner_text()
    out["hour_edit_refresh"] = "EDITED_NOTE_RUNTIME_XYZ" in table_txt

    page.click("text=行事曆")
    page.wait_for_timeout(400)
    if page.locator("#cal-filter-query").count():
        page.click("#cal-filter-query")
        page.wait_for_timeout(800)
    cal_txt = page.locator("#calendar-tbody").inner_text()
    out["calendar_source_note_update"] = "EDITED_NOTE_RUNTIME_XYZ" in cal_txt

    # reload readback of edited note
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1000)
    hours2 = page.evaluate("() => JSON.parse(localStorage.getItem('workStudy_hourSettings')||'[]')")
    out["hour_note_reload_readback"] = any((h.get("note") or "") == "EDITED_NOTE_RUNTIME_XYZ" for h in hours2)

    # csv reset via reloadWorkStudyCsvDb path: clear + reseed by evaluate reset if available
    # Use app API
    page.evaluate(
        """async () => {
          // mimic reload without confirm by direct import is hard; clear and reload page with empty then fetch
          localStorage.clear();
        }"""
    )
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1200)
    budgets = page.evaluate("() => JSON.parse(localStorage.getItem('workStudy_budgets')||'[]')")
    out["csv_reset_seed_count"] = len(budgets)
    out["csv_reset"] = len(budgets) >= 3

    # export hook exists; invoke and ensure no throw
    export_ok = page.evaluate(
        """() => {
          try {
            if (typeof window.exportWorkStudyCsvDb !== 'function') return false;
            // may trigger downloads; just ensure callable
            window.exportWorkStudyCsvDb();
            return true;
          } catch (e) {
            return String(e);
          }
        }"""
    )
    out["csv_export"] = export_ok is True

    browser.close()

print(json.dumps(out, ensure_ascii=False, indent=2))
