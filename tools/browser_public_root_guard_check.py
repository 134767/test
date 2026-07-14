"""Playwright check that the public root is a passive static-asset notice."""
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5500/"


def main():
    console_errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.goto(BASE, wait_until="networkidle")

        assert "此網址僅提供系統靜態資產" in page.locator("body").inner_text()
        assert page.locator("#tab-bar").count() == 0
        assert page.get_by_role("button", name="新增").count() == 0
        assert page.get_by_role("button", name="儲存").count() == 0
        assert page.get_by_role("button", name="刪除").count() == 0
        resources = page.evaluate("() => performance.getEntriesByType('resource').map(e => e.name)")
        assert not any("/js/app.js" in resource for resource in resources)
        business_keys = page.evaluate("() => Object.keys(localStorage).filter(k => k.startsWith('workStudy_'))")
        assert business_keys == []
        assert console_errors == []
        browser.close()

    print("PASS public root guard; console_errors=[]")


if __name__ == "__main__":
    main()
