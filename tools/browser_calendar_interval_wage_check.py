# -*- coding: utf-8 -*-
"""Browser gate for calendar interval wage source-of-truth."""
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
              hours.forEach(row=>delete row.hourlyWage);
              const startYear=Number(h.academicYear)+1911;
              let date=new Date(Date.UTC(startYear,7,1));
              const weekdays=String(h.weekdays||'').split('|');
              const names=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
              while(!weekdays.includes(names[date.getUTCDay()]))date.setUTCDate(date.getUTCDate()+1);
              const iso=date.toISOString().slice(0,10);
              const rows=JSON.parse(localStorage.getItem('workStudy_calendarRows')||'[]').filter(r=>!(r.date===iso&&r.sourceHourSettingId===h.id));
              localStorage.setItem('workStudy_hourSettings',JSON.stringify(hours));
              localStorage.setItem('workStudy_calendarRows',JSON.stringify(rows));
              return {budgetName:budget.budgetName,academicYear:String(h.academicYear),scheduleType:h.scheduleType,unitCode:h.unitCode,date:iso,sourceId:h.id};
            }"""
        )
        page.reload(wait_until="networkidle", timeout=60000)

        page.click('[data-tab="hour"]')
        OUT["checks"]["hour_setting_wage_absent"] = page.locator("#hour-wage").count() == 0 and "時薪" not in page.locator("#hour-table thead").inner_text()

        page.click('[data-tab="calendar"]')
        page.select_option("#cal-filter-budget-group", label=fixture["budgetName"])
        page.select_option("#cal-filter-mode", value="academicYear")
        page.select_option("#cal-filter-year", value=fixture["academicYear"])
        page.click("#cal-filter-query")
        page.click("#btn-add-interval")

        OUT["checks"]["required_wage_input"] = page.locator("#int-hourly-wage").is_visible() and page.locator("#int-hourly-wage").get_attribute("min") == "1"
        warning = page.locator("#int-wage-year-warning").inner_text()
        OUT["checks"]["red_year_warning"] = bool(warning) and "～" in warning
        page.fill("#int-start", fixture["date"].replace("-", "/").replace("-", "/"))
        page.fill("#int-end", fixture["date"].replace("-", "/").replace("-", "/"))
        page.locator(f'#int-scheduleType-buttons [data-value="{fixture["scheduleType"]}"]').click()
        page.locator(f'#int-unit-buttons [data-value="{fixture["unitCode"]}"]').click()

        page.fill("#int-hourly-wage", "0")
        page.click("#int-confirm-btn")
        OUT["checks"]["zero_wage_rejected"] = page.locator("#interval-modal").is_visible()
        page.fill("#int-hourly-wage", "190")
        page.click("#int-confirm-btn")
        page.wait_for_timeout(500)
        saved = page.evaluate(
            """fixture => JSON.parse(localStorage.getItem('workStudy_calendarRows')||'[]').find(r=>r.date===fixture.date&&r.sourceHourSettingId===fixture.sourceId)""",
            fixture,
        )
        OUT["checks"]["row_wage_from_interval"] = bool(saved) and saved.get("hourlyWage") == 190
        OUT["checks"]["source_id_preserved"] = bool(saved) and saved.get("sourceHourSettingId") == fixture["sourceId"]
        browser.close()

    OUT["checks"]["console_errors_zero"] = len(OUT["console_errors"]) == 0
    OUT["status"] = "PASS" if all(OUT["checks"].values()) else "FAIL"
    print(json.dumps(OUT, ensure_ascii=False, indent=2))
    return 0 if OUT["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
