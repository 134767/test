# -*- coding: utf-8 -*-
"""Browser gate for the canonical holiday v2 single controller."""
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
        page.locator('[data-tab="calendar"]').click()
        page.wait_for_timeout(300)
        OUT["checks"]["single_dom_controller"] = (
            page.locator('#holiday-modal').count() == 0
            and page.locator('#holiday-modal-v2').count() == 1
            and page.locator('#btn-holiday-setting').count() == 1
        )
        modal = page.locator('#holiday-modal-v2')
        OUT["checks"]["initially_hidden"] = modal.get_attribute('aria-hidden') == 'true' and not modal.is_visible()
        page.click('#btn-holiday-setting')
        OUT["checks"]["only_v2_opens"] = modal.is_visible() and modal.get_attribute('aria-hidden') == 'false'
        OUT["checks"]["features_preserved"] = all(page.locator(selector).count() == 1 for selector in [
            '#holiday-start-v2', '#holiday-end-v2', '#holiday-name-v2', '#holiday-record-list-v2',
            '#holiday-name-list-v2', '#holiday-save-v2', '#holiday-name-save-v2'
        ])
        page.click('#holiday-close-v2')
        OUT["checks"]["close_and_focus_return"] = (
            not modal.is_visible() and modal.get_attribute('aria-hidden') == 'true'
            and page.evaluate("() => document.activeElement?.id") == 'btn-holiday-setting'
        )
        for _ in range(5):
            page.click('#btn-holiday-setting')
            page.click('#holiday-close-v2')
        page.locator('[data-tab="hour"]').click()
        page.locator('[data-tab="calendar"]').click()
        page.evaluate("""() => {
          const marker = document.createElement('span');
          marker.id = 'holiday-observer-marker';
          document.querySelector('#page-calendar').appendChild(marker);
          marker.remove();
        }""")
        page.wait_for_timeout(200)
        OUT["checks"]["repeated_open_and_mutation_safe"] = (
            page.locator('#holiday-modal').count() == 0
            and page.locator('#holiday-modal-v2').count() == 1
            and page.locator('#btn-holiday-setting').count() == 1
        )
        browser.close()

    required = ['single_dom_controller', 'initially_hidden', 'only_v2_opens', 'features_preserved', 'close_and_focus_return', 'repeated_open_and_mutation_safe']
    failed = [name for name in required if not OUT["checks"].get(name)]
    OUT["checks"]["console_errors_zero"] = not OUT["console_errors"]
    OUT["failed_required"] = failed
    OUT["status"] = "PASS" if not failed and not OUT["console_errors"] else "FAIL"
    print(json.dumps(OUT, ensure_ascii=False, indent=2))
    return 0 if OUT["status"] == "PASS" else 1


if __name__ == '__main__':
    sys.exit(main())
