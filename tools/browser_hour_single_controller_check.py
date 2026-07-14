from playwright.sync_api import sync_playwright
import json, sys
BASE='http://127.0.0.1:5500/local.html'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True);page=browser.new_page();page.goto(BASE,wait_until='networkidle');page.click('text=時數設定');page.click('#btn-add-hour');page.wait_for_timeout(100)
    checks=page.evaluate("""() => ({saveButtons:document.querySelectorAll('#hour-save-btn').length,scheduleMultiple:document.querySelector('#hour-scheduleType').multiple,unitMultiple:document.querySelector('#hour-unit').multiple,patchLoaded:!!document.querySelector('[data-ptb156-hour-form-patched]')})""")
    source=page.locator('body').evaluate("async () => (await (await fetch('/js/hourSettingPage.js')).text())");enh=page.locator('body').evaluate("async () => (await (await fetch('/js/ptb156Enhancements.js')).text())");browser.close()
checks.update({'oneEditingOwner':source.count('let currentEditingId')==1,'noCloneReplace':all(x not in source+enh for x in ('cloneNode(true)','replaceWith(')),'batchCreate':'saveHourSettingsBatch(records)' in source})
ok=checks['saveButtons']==1 and checks['scheduleMultiple'] and checks['unitMultiple'] and not checks['patchLoaded'] and all(checks[k] for k in ('oneEditingOwner','noCloneReplace','batchCreate'));print(json.dumps({'status':'PASS' if ok else 'FAIL','checks':checks},ensure_ascii=False));sys.exit(0 if ok else 1)
