from playwright.sync_api import sync_playwright
import json, sys
BASE='http://127.0.0.1:5500/local.html'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True);page=browser.new_page();page.goto(BASE,wait_until='networkidle')
    source=page.locator('body').evaluate("async () => (await (await fetch('/js/salaryEntryPage.js')).text())")
    store=page.locator('body').evaluate("async () => (await (await fetch('/js/dataStore.js')).text())")
    browser.close()
checks={'existing_id_payload':'id: item.existingEntry ? item.existingEntry.id : null' in source,'single_batch':'saveSalaryEntriesBatch(payloads)' in source,'no_promise_all':'Promise.all(payloads.map(saveSalaryEntry))' not in source,'composite_diagnostic':'inspectSalaryEntryDuplicates' in store}
ok=all(checks.values());print(json.dumps({'status':'PASS' if ok else 'FAIL','checks':checks},ensure_ascii=False));sys.exit(0 if ok else 1)
