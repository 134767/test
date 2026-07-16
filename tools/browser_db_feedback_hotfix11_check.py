# -*- coding: utf-8 -*-
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
        state = page.evaluate("""async () => {
          const feedback = await import('/js/dbFeedback.js?hotfix11-browser');
          const token = feedback.beginDbOperation('測試更新', {blocking:true});
          const overlay = document.querySelector('#db-feedback-overlay');
          const title = document.querySelector('#db-feedback-overlay-title')?.textContent;
          const locked = document.querySelectorAll('button[data-db-locked-by-feedback="true"]').length;
          const shown = !overlay.classList.contains('is-hidden');
          feedback.endDbOperation(token, {silent:true});
          return {
            title,
            oldTitleAbsent: !document.body.textContent.includes('資料載入中'),
            shown,
            locked,
            hiddenAfter: overlay.classList.contains('is-hidden'),
            lockedAfter: document.querySelectorAll('button[data-db-locked-by-feedback="true"]').length
          };
        }""")
        OUT["checks"]["updating_title"] = state["title"] == "資料更新中" and state["oldTitleAbsent"]
        OUT["checks"]["blocking_overlay"] = state["shown"] and state["locked"] > 0
        OUT["checks"]["completion_unlocks"] = state["hiddenAfter"] and state["lockedAfter"] == 0
        browser.close()

    failed = [name for name, passed in OUT["checks"].items() if not passed]
    OUT["checks"]["console_errors_zero"] = not OUT["console_errors"]
    OUT["failed_required"] = failed
    OUT["status"] = "PASS" if not failed and not OUT["console_errors"] else "FAIL"
    print(json.dumps(OUT, ensure_ascii=False, indent=2))
    return 0 if OUT["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
