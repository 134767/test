# -*- coding: utf-8 -*-
"""Browser gate for Calendar interval warning and dated wage snapshots."""
import json
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5500/local.html"
OUT = {"status": "FAIL", "console_errors": [], "checks": {}}


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("console", lambda msg: OUT["console_errors"].append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: OUT["console_errors"].append(str(err)))
        page.on("dialog", lambda dialog: dialog.accept())
        page.goto(BASE, wait_until="networkidle", timeout=60000)
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="networkidle", timeout=60000)

        fixture = page.evaluate(
            """() => {
              const budgets=JSON.parse(localStorage.getItem('workStudy_budgets')||'[]');
              const hours=JSON.parse(localStorage.getItem('workStudy_hourSettings')||'[]');
              let selected=null;
              for(const h of hours){
                const budget=budgets.find(b=>String(b.academicYear)===String(h.academicYear)&&(Array.isArray(b.unitCodes)?b.unitCodes:[]).includes(h.unitCode)&&b.budgetName);
                if(budget){selected={h,budget};break;}
              }
              if(!selected) throw new Error('calendar wage browser fixture unavailable');
              const {h,budget}=selected;
              const units=JSON.parse(localStorage.getItem('workStudy_units')||'[]');
              const unit=units.find(u=>u.unitCode===h.unitCode);
              const weekdays=String(h.weekdays||'').split('|');
              const names=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
              const findDate=(start,end)=>{
                let date=new Date(start+'T00:00:00Z'),last=new Date(end+'T00:00:00Z');
                while(date<=last){
                  if(weekdays.includes(names[date.getUTCDay()]))return date.toISOString().slice(0,10);
                  date.setUTCDate(date.getUTCDate()+1);
                }
                throw new Error(`no matching weekday in ${start}..${end}`);
              };
              const startYear=Number(h.academicYear)+1911;
              const oldDate=findDate(`${startYear}-08-01`,`${startYear}-12-31`);
              const newDate=findDate(`${startYear+1}-01-01`,`${startYear+1}-07-31`);
              hours.forEach(row=>delete row.hourlyWage);
              const targetDates=new Set([oldDate,newDate]);
              const rows=JSON.parse(localStorage.getItem('workStudy_calendarRows')||'[]').filter(r=>!(targetDates.has(r.date)&&r.sourceHourSettingId===h.id));
              const holidays=JSON.parse(localStorage.getItem('workStudy_calendarHolidays')||'[]').filter(r=>!targetDates.has(r.date));
              localStorage.setItem('workStudy_hourSettings',JSON.stringify(hours));
              localStorage.setItem('workStudy_calendarRows',JSON.stringify(rows));
              localStorage.setItem('workStudy_calendarHolidays',JSON.stringify(holidays));
              return {budgetName:budget.budgetName,academicYear:String(h.academicYear),scheduleType:h.scheduleType,unitCode:h.unitCode,oldUnitName:unit?.unitName||h.unitName,newUnitName:(unit?.unitName||h.unitName)+' HOTFIX11',oldDate,newDate,sourceId:h.id,rangeStart:`${startYear}-08-01`,rangeEnd:`${startYear+1}-07-31`};
            }"""
        )
        page.reload(wait_until="networkidle", timeout=60000)

        page.click('[data-tab="hour"]')
        OUT["checks"]["hour_setting_wage_ui_absent"] = page.locator("#hour-wage").count() == 0 and "時薪" not in page.locator("#hour-table thead").inner_text()

        page.click('[data-tab="calendar"]')
        page.select_option("#cal-filter-budget-group", label=fixture["budgetName"])
        page.select_option("#cal-filter-mode", value="academicYear")
        page.select_option("#cal-filter-year", value=fixture["academicYear"])
        page.click("#cal-filter-query")

        def open_interval(date, wage):
            page.click("#btn-add-interval")
            page.fill("#int-start", date.replace("-", "/"))
            page.fill("#int-end", date.replace("-", "/"))
            page.locator(f'#int-scheduleType-buttons [data-value="{fixture["scheduleType"]}"]').click()
            page.locator(f'#int-unit-buttons [data-value="{fixture["unitCode"]}"]').click()
            page.fill("#int-hourly-wage", str(wage))

        page.click("#btn-add-interval")
        warning = page.locator("#int-wage-year-warning").inner_text()
        hint = page.locator("#int-academic-year-range-hint").inner_text()
        preview_before = page.locator("#int-preview-wage").inner_text()
        OUT["checks"]["fixed_warning_exact"] = warning.startswith("跨年度要考慮政府薪資調漲問題") and "1/1～12/31" in warning and warning.endswith("。")
        OUT["checks"]["academic_year_hint_separate"] = fixture["rangeStart"] in hint and fixture["rangeEnd"] in hint and hint != warning
        OUT["checks"]["preview_before_wage"] = preview_before == "本次套用時薪：尚未輸入有效時薪"
        OUT["checks"]["required_wage_input"] = page.locator("#int-hourly-wage").is_visible() and page.locator("#int-hourly-wage").get_attribute("min") == "1"
        OUT["checks"]["exit_label"] = page.locator("#int-cancel-btn").inner_text() == "退出"
        page.locator("#interval-modal").click(position={"x": 3, "y": 3})
        OUT["checks"]["background_does_not_close"] = page.locator("#interval-modal").is_visible()
        page.click("#int-schedule-select-all")
        OUT["checks"]["schedule_select_all"] = page.locator("#int-scheduleType-buttons .weekday-btn").count() > 0 and page.locator("#int-scheduleType-buttons .weekday-btn:not(.active)").count() == 0
        page.click("#int-schedule-clear-all")
        OUT["checks"]["schedule_clear"] = page.locator("#int-scheduleType-buttons .weekday-btn.active").count() == 0
        page.click("#int-cancel-btn")

        open_interval(fixture["oldDate"], 190)
        OUT["checks"]["preview_after_190"] = page.locator("#int-preview-wage").inner_text() == "本次套用時薪：190"
        page.click("#int-confirm-btn")
        page.wait_for_timeout(300)
        OUT["checks"]["add_keeps_modal_open"] = page.locator("#interval-modal").is_visible()
        before_repeat = page.evaluate("fixture => JSON.parse(localStorage.getItem('workStudy_calendarRows')||'[]').filter(r=>r.date===fixture.oldDate&&r.sourceHourSettingId===fixture.sourceId).length", fixture)
        page.click("#int-confirm-btn")
        page.wait_for_timeout(300)
        after_repeat = page.evaluate("fixture => JSON.parse(localStorage.getItem('workStudy_calendarRows')||'[]').filter(r=>r.date===fixture.oldDate&&r.sourceHourSettingId===fixture.sourceId).length", fixture)
        OUT["checks"]["duplicate_add_safe"] = before_repeat == after_repeat == 1 and "新增 0 筆" in page.locator("#interval-operation-result").inner_text()
        page.click("#int-cancel-btn")

        page.evaluate("""fixture => {
          const units=JSON.parse(localStorage.getItem('workStudy_units')||'[]');
          const unit=units.find(u=>u.unitCode===fixture.unitCode);
          unit.unitName=fixture.newUnitName;
          localStorage.setItem('workStudy_units',JSON.stringify(units));
        }""", fixture)
        page.reload(wait_until="networkidle", timeout=60000)
        page.click('[data-tab="calendar"]')
        page.select_option("#cal-filter-budget-group", label=fixture["budgetName"])
        page.select_option("#cal-filter-mode", value="academicYear")
        page.select_option("#cal-filter-year", value=fixture["academicYear"])
        page.click("#cal-filter-query")

        open_interval(fixture["newDate"], 200)
        page.click("#int-unit-clear-all")
        page.click("#int-unit-select-all")
        OUT["checks"]["unit_select_all_scoped"] = page.locator("#int-unit-buttons .weekday-btn").count() > 0 and page.locator("#int-unit-buttons .weekday-btn:not(.active)").count() == 0
        OUT["checks"]["preview_after_200"] = page.locator("#int-preview-wage").inner_text() == "本次套用時薪：200"
        page.click("#int-confirm-btn")
        page.wait_for_timeout(300)
        page.click("#int-cancel-btn")

        rows = page.evaluate(
            """fixture => JSON.parse(localStorage.getItem('workStudy_calendarRows')||'[]').filter(r=>r.sourceHourSettingId===fixture.sourceId&&(r.date===fixture.oldDate||r.date===fixture.newDate))""",
            fixture,
        )
        old_row = next((row for row in rows if row.get("date") == fixture["oldDate"]), None)
        new_row = next((row for row in rows if row.get("date") == fixture["newDate"]), None)
        OUT["checks"]["same_source_two_intervals"] = bool(old_row and new_row) and old_row.get("sourceHourSettingId") == new_row.get("sourceHourSettingId") == fixture["sourceId"]
        OUT["checks"]["old_wage_190"] = bool(old_row) and old_row.get("hourlyWage") == 190
        OUT["checks"]["new_wage_200"] = bool(new_row) and new_row.get("hourlyWage") == 200
        OUT["checks"]["old_unit_name_snapshot"] = bool(old_row) and old_row.get("unitName") == fixture["oldUnitName"]
        OUT["checks"]["new_unit_name_snapshot"] = bool(new_row) and new_row.get("unitName") == fixture["newUnitName"]

        page.click("#btn-del-interval")
        OUT["checks"]["delete_mode_wage_hidden"] = not page.locator("#int-hourly-wage").is_visible()
        OUT["checks"]["delete_mode_warning_hidden"] = not page.locator("#int-wage-year-warning").is_visible()
        OUT["checks"]["delete_mode_range_hidden"] = not page.locator("#int-academic-year-range-hint").is_visible()
        OUT["checks"]["delete_mode_preview_wage_absent"] = page.locator("#int-preview-wage").count() == 0
        page.fill("#int-start", fixture["oldDate"].replace("-", "/"))
        page.fill("#int-end", fixture["oldDate"].replace("-", "/"))
        page.locator(f'#int-scheduleType-buttons [data-value="{fixture["scheduleType"]}"]').click()
        page.locator(f'#int-unit-buttons [data-value="{fixture["unitCode"]}"]').click()
        OUT["checks"]["delete_ui_latest_name"] = fixture["newUnitName"] in page.locator("#int-unit-buttons").inner_text()
        page.click("#int-delete-preview-select-all")
        OUT["checks"]["delete_preview_select_all"] = page.locator("#int-delete-preview-all-check").is_checked()
        page.click("#int-delete-preview-clear-all")
        OUT["checks"]["delete_preview_clear"] = not page.locator("#int-delete-preview-all-check").is_checked()
        page.locator("#int-preview .del-source-cb").first.check()
        OUT["checks"]["delete_preview_indeterminate"] = page.locator("#int-delete-preview-all-check").evaluate("el => el.indeterminate") or page.locator("#int-preview .del-source-cb").count() == 1
        page.click("#int-delete-preview-select-all")
        page.click("#int-confirm-btn")
        page.wait_for_timeout(300)
        OUT["checks"]["delete_keeps_modal_open"] = page.locator("#interval-modal").is_visible()
        deleted_state = page.evaluate("fixture => { const rows=JSON.parse(localStorage.getItem('workStudy_calendarRows')||'[]'); return {old:rows.some(r=>r.date===fixture.oldDate&&r.sourceHourSettingId===fixture.sourceId),new:rows.some(r=>r.date===fixture.newDate&&r.sourceHourSettingId===fixture.sourceId)}; }", fixture)
        OUT["checks"]["delete_uses_stable_keys"] = not deleted_state["old"] and deleted_state["new"]
        page.click("#int-cancel-btn")

        page.reload(wait_until="networkidle", timeout=60000)
        persisted = page.evaluate(
            """fixture => {
              const rows=JSON.parse(localStorage.getItem('workStudy_calendarRows')||'[]');
              const hour=JSON.parse(localStorage.getItem('workStudy_hourSettings')||'[]').find(h=>h.id===fixture.sourceId);
              return {old:rows.find(r=>r.date===fixture.oldDate&&r.sourceHourSettingId===fixture.sourceId),new:rows.find(r=>r.date===fixture.newDate&&r.sourceHourSettingId===fixture.sourceId),hour};
            }""",
            fixture,
        )
        OUT["checks"]["reload_persistence"] = not persisted["old"] and bool(persisted["new"]) and persisted["new"].get("hourlyWage") == 200 and persisted["new"].get("unitName") == fixture["newUnitName"]
        OUT["checks"]["hour_setting_hourly_wage_absent"] = bool(persisted["hour"]) and "hourlyWage" not in persisted["hour"]
        browser.close()

    OUT["checks"]["console_errors_zero"] = len(OUT["console_errors"]) == 0
    OUT["status"] = "PASS" if all(OUT["checks"].values()) else "FAIL"
    print(json.dumps(OUT, ensure_ascii=False, indent=2))
    return 0 if OUT["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
