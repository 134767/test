# -*- coding: utf-8 -*-
"""Playwright runtime checks for hour-setting batch copy."""
import json
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5500/local.html"
OUT = {
    "status": "FAIL",
    "console_errors": [],
    "console_warnings": [],
    "checks": {},
    "batch_test": {},
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
        page.on("pageerror", lambda err: OUT["console_errors"].append(str(err)))

        page.goto(BASE, wait_until="networkidle", timeout=60000)
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(1200)

        page.click("text=時數設定")
        page.wait_for_timeout(600)

        # button disabled without selection
        batch_btn = page.locator("#btn-batch-add-hour")
        OUT["checks"]["button_disabled_without_selection"] = batch_btn.is_disabled()

        # Determine 4 selectable rows that can copy to 115 by budget scope
        meta = page.evaluate(
            """() => {
              const hours = JSON.parse(localStorage.getItem('workStudy_hourSettings')||'[]');
              const budgets = JSON.parse(localStorage.getItem('workStudy_budgets')||'[]');
              const units115 = new Set();
              budgets.forEach(b => {
                if (String(b.academicYear) !== '115') return;
                if (!String(b.budgetName||'').trim()) return;
                let codes = b.unitCodes;
                if (typeof codes === 'string') {
                  try { codes = JSON.parse(codes); } catch(e) { codes = []; }
                }
                (codes||[]).forEach(c => units115.add(c));
              });
              const candidates = hours.filter(h =>
                String(h.academicYear) === '114' &&
                units115.has(h.unitCode)
              );
              // prefer 開學(平日) first
              candidates.sort((a,b) => {
                const ap = a.scheduleType.includes('開學(平日)') ? 0 : 1;
                const bp = b.scheduleType.includes('開學(平日)') ? 0 : 1;
                if (ap !== bp) return ap - bp;
                return String(a.unitCode).localeCompare(String(b.unitCode));
              });
              const pick = candidates.slice(0, 4);
              return {
                units115: [...units115],
                candidateCount: candidates.length,
                pickIds: pick.map(h => h.id),
                pickSummary: pick.map(h => ({
                  id: h.id,
                  unitCode: h.unitCode,
                  scheduleType: h.scheduleType,
                  note: h.note||'',
                  startTime: h.startTime,
                  endTime: h.endTime,
                  hours: h.hours,
                  weekdays: h.weekdays
                })),
                beforeCount: hours.length,
                beforeIds: hours.map(h => h.id)
              };
            }"""
        )
        OUT["checks"]["seed_meta"] = {
            "units115": meta["units115"],
            "candidateCount": meta["candidateCount"],
            "pickCount": len(meta["pickIds"]),
        }

        if len(meta["pickIds"]) < 4:
            OUT["checks"]["enough_candidates"] = False
            OUT["status"] = "FAIL"
            print(json.dumps(OUT, ensure_ascii=False, indent=2))
            browser.close()
            return 1
        OUT["checks"]["enough_candidates"] = True

        # Check rows by data-id
        for hid in meta["pickIds"]:
            page.locator(f'#hour-tbody .row-check[data-id="{hid}"]').check()
        page.wait_for_timeout(200)

        OUT["checks"]["button_enabled_with_selection"] = not batch_btn.is_disabled()

        # open modal
        batch_btn.click()
        page.wait_for_timeout(400)
        modal = page.locator("#hour-batch-add-modal")
        OUT["checks"]["modal_visible"] = modal.is_visible()
        count_text = page.locator("#hour-batch-selected-count").inner_text()
        OUT["checks"]["selected_count_text"] = count_text
        OUT["checks"]["selected_count_is_4"] = "4 筆" in count_text

        # target year options unique
        year_opts = page.eval_on_selector_all(
            "#hour-batch-target-year option",
            "els => els.map(e => ({value:e.value, text:e.textContent}))",
        )
        year_values = [o["value"] for o in year_opts if o["value"]]
        OUT["checks"]["target_years"] = year_values
        OUT["checks"]["target_years_unique"] = len(year_values) == len(set(year_values))
        OUT["checks"]["target_years_include_115"] = "115" in year_values

        # preview rows
        preview_rows = page.locator("#hour-batch-preview-tbody tr").count()
        OUT["checks"]["preview_row_count"] = preview_rows

        # note html not executed in preview
        preview_html = page.locator("#hour-batch-preview-tbody").inner_html()
        OUT["checks"]["note_html_escaped"] = "<script>" not in preview_html

        page.select_option("#hour-batch-target-year", value="115")
        page.click("#hour-batch-confirm-btn")
        page.wait_for_timeout(900)

        after = page.evaluate(
            """(pickIds) => {
              const hours = JSON.parse(localStorage.getItem('workStudy_hourSettings')||'[]');
              const sources = hours.filter(h => pickIds.includes(h.id));
              const added = hours.filter(h => String(h.academicYear)==='115');
              return {
                total: hours.length,
                sourceCount: sources.length,
                sourceIds: sources.map(h => h.id),
                added115: added.map(h => ({
                  id: h.id,
                  academicYear: h.academicYear,
                  scheduleType: h.scheduleType,
                  unitCode: h.unitCode,
                  unitName: h.unitName,
                  weekdays: h.weekdays,
                  startTime: h.startTime,
                  endTime: h.endTime,
                  hours: h.hours,
                  note: h.note||''
                }))
              };
            }""",
            meta["pickIds"],
        )

        OUT["batch_test"] = {
            "selected": 4,
            "target_academic_year": "115",
            "added": len(after["added115"]),
            "source_rows_unchanged": after["sourceCount"] == 4,
            "before_count": meta["beforeCount"],
            "after_count": after["total"],
        }

        OUT["checks"]["copy_four_rows_to_new_year"] = (
            after["total"] == meta["beforeCount"] + 4 and len(after["added115"]) >= 4
        )
        # more precise: count of 115 that match pick signature should be 4
        pick_keys = {
            (
                s["scheduleType"],
                s["unitCode"],
                s["weekdays"],
                s["startTime"],
                s["endTime"],
            )
            for s in meta["pickSummary"]
        }
        matched = [
            a
            for a in after["added115"]
            if (
                a["scheduleType"],
                a["unitCode"],
                a["weekdays"],
                a["startTime"],
                a["endTime"],
            )
            in pick_keys
        ]
        OUT["checks"]["matched_copied"] = len(matched)
        OUT["checks"]["copy_four_exact"] = len(matched) == 4

        # source ids still present and fields match snapshot
        source_ok = True
        for s in meta["pickSummary"]:
            cur = page.evaluate(
                """(id) => {
                  const hours = JSON.parse(localStorage.getItem('workStudy_hourSettings')||'[]');
                  return hours.find(h => h.id === id) || null;
                }""",
                s["id"],
            )
            if not cur or cur.get("academicYear") != "114":
                source_ok = False
                break
            for field in (
                "scheduleType",
                "unitCode",
                "weekdays",
                "startTime",
                "endTime",
                "hours",
                "note",
            ):
                if str(cur.get(field) if cur.get(field) is not None else "") != str(
                    s.get(field) if s.get(field) is not None else ""
                ):
                    source_ok = False
                    break
        OUT["checks"]["source_rows_unchanged"] = source_ok

        new_ids = [m["id"] for m in matched]
        OUT["checks"]["new_ids_generated"] = (
            len(new_ids) == 4
            and len(set(new_ids)) == 4
            and all(nid not in meta["beforeIds"] for nid in new_ids)
        )

        # fields preserved (against source by key)
        fields_ok = True
        for s in meta["pickSummary"]:
            m = next(
                (
                    a
                    for a in matched
                    if a["unitCode"] == s["unitCode"]
                    and a["startTime"] == s["startTime"]
                    and a["endTime"] == s["endTime"]
                    and a["scheduleType"] == s["scheduleType"]
                ),
                None,
            )
            if not m:
                fields_ok = False
                break
            for field in (
                "scheduleType",
                "unitCode",
                "weekdays",
                "startTime",
                "endTime",
                "hours",
                "note",
            ):
                if str(m.get(field) if m.get(field) is not None else "") != str(
                    s.get(field) if s.get(field) is not None else ""
                ):
                    fields_ok = False
                    break
        OUT["checks"]["copied_fields_preserved"] = fields_ok

        # modal closed after success
        OUT["checks"]["modal_closed_after_success"] = not page.locator(
            "#hour-batch-add-modal"
        ).is_visible()
        OUT["checks"]["batch_btn_disabled_after_success"] = page.locator(
            "#btn-batch-add-hour"
        ).is_disabled()

        # reload readback
        page.reload(wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(1000)
        after_reload = page.evaluate(
            """(ids) => {
              const hours = JSON.parse(localStorage.getItem('workStudy_hourSettings')||'[]');
              return {
                total: hours.length,
                hasNew: ids.every(id => hours.some(h => h.id === id)),
                hasSource: true
              };
            }""",
            new_ids,
        )
        OUT["checks"]["reload_readback"] = after_reload["hasNew"] and after_reload[
            "total"
        ] == after["total"]
        OUT["batch_test"]["reload_readback"] = (
            "PASS" if OUT["checks"]["reload_readback"] else "FAIL"
        )

        # second batch on same sources -> all duplicate, modal stays open
        page.click("text=時數設定")
        page.wait_for_timeout(500)
        for hid in meta["pickIds"]:
            page.locator(f'#hour-tbody .row-check[data-id="{hid}"]').check()
        page.locator("#btn-batch-add-hour").click()
        page.wait_for_timeout(300)
        page.select_option("#hour-batch-target-year", value="115")
        page.click("#hour-batch-confirm-btn")
        page.wait_for_timeout(800)

        total_after_dup = page.evaluate(
            "() => JSON.parse(localStorage.getItem('workStudy_hourSettings')||'[]').length"
        )
        OUT["checks"]["duplicate_target_rows_skipped"] = total_after_dup == after["total"]
        OUT["checks"]["all_failed_modal_stays_open"] = page.locator(
            "#hour-batch-add-modal"
        ).is_visible()
        result_txt = page.locator("#hour-batch-result").inner_text()
        OUT["checks"]["duplicate_result_visible"] = "重複略過" in result_txt or "略過" in result_txt

        # partial success: mix valid + out-of-scope unit by adding fake hour then selecting with valid
        page.locator("#hour-batch-cancel-btn").click()
        page.wait_for_timeout(200)

        # inject one invalid unit row and one already-copied signature via evaluate then re-render
        page.evaluate(
            """() => {
              const hours = JSON.parse(localStorage.getItem('workStudy_hourSettings')||'[]');
              hours.push({
                id: 'HOUR_TEST_INVALID_UNIT',
                academicYear: '114',
                scheduleType: '測試作息',
                unitCode: 'NO_SUCH_UNIT',
                unitName: '不存在',
                weekdays: '星期一',
                startTime: '01:00',
                endTime: '02:00',
                hours: 1,
                note: 'invalid',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
              localStorage.setItem('workStudy_hourSettings', JSON.stringify(hours));
            }"""
        )
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(800)
        page.click("text=時數設定")
        page.wait_for_timeout(500)

        # select invalid + one valid 114 source that can go to 115 and is not yet duplicated wait - all originals already copied
        # create a brand new unique valid row for partial success
        page.evaluate(
            """() => {
              const hours = JSON.parse(localStorage.getItem('workStudy_hourSettings')||'[]');
              hours.push({
                id: 'HOUR_TEST_VALID_UNIQUE',
                academicYear: '114',
                scheduleType: '測試作息Unique',
                unitCode: 'U_A1',
                unitName: 'Unit_A1',
                weekdays: '星期二',
                startTime: '10:00',
                endTime: '11:00',
                hours: 1,
                note: 'partial-ok',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
              localStorage.setItem('workStudy_hourSettings', JSON.stringify(hours));
            }"""
        )
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(800)
        page.click("text=時數設定")
        page.wait_for_timeout(500)

        before_partial = page.evaluate(
            "() => JSON.parse(localStorage.getItem('workStudy_hourSettings')||'[]').length"
        )
        page.locator('#hour-tbody .row-check[data-id="HOUR_TEST_INVALID_UNIT"]').check()
        page.locator('#hour-tbody .row-check[data-id="HOUR_TEST_VALID_UNIQUE"]').check()
        page.locator("#btn-batch-add-hour").click()
        page.wait_for_timeout(300)
        page.select_option("#hour-batch-target-year", value="115")
        page.click("#hour-batch-confirm-btn")
        page.wait_for_timeout(900)

        after_partial = page.evaluate(
            """() => {
              const hours = JSON.parse(localStorage.getItem('workStudy_hourSettings')||'[]');
              return {
                total: hours.length,
                hasPartial: hours.some(h => h.academicYear==='115' && h.scheduleType==='測試作息Unique' && h.unitCode==='U_A1' && h.startTime==='10:00')
              };
            }"""
        )
        OUT["checks"]["partial_success_summary"] = (
            after_partial["hasPartial"] and after_partial["total"] == before_partial + 1
        )
        OUT["checks"]["invalid_unit_skipped_runtime"] = after_partial["hasPartial"]

        browser.close()

    required = [
        "button_disabled_without_selection",
        "button_enabled_with_selection",
        "target_years_unique",
        "copy_four_exact",
        "source_rows_unchanged",
        "copied_fields_preserved",
        "new_ids_generated",
        "duplicate_target_rows_skipped",
        "note_html_escaped",
        "reload_readback",
        "all_failed_modal_stays_open",
        "partial_success_summary",
    ]
    failed = [k for k in required if not OUT["checks"].get(k)]
    OUT["failed_required"] = failed
    OUT["status"] = "PASS" if not failed and not OUT["console_errors"] else "FAIL"
    print(json.dumps(OUT, ensure_ascii=False, indent=2))
    return 0 if OUT["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
