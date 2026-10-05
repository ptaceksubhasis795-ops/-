import os

from playwright.sync_api import sync_playwright


def main() -> None:
    api_url = os.environ.get("API_URL", "http://127.0.0.1:3002")
    admin_url = os.environ.get("ADMIN_URL", "http://127.0.0.1:5176")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 960})
        page = context.new_page()
        login = page.request.post(f"{api_url}/api/v1/auth/staff/login", data={"username": "admin", "password": "admin123"})
        assert login.ok, login.text()
        context.add_init_script("localStorage.setItem('jz_admin_access_token', %r); localStorage.setItem('jz_admin_staff_user', %r);" % (login.json()["data"]["token"], '{"role":"admin"}'))
        sales_paths = ["/sales/overview", "/sales/rewards"]
        other_paths = ["/customers/list", "/data/sales", "/settings/promotion", "/products/catalog"]
        for path in sales_paths:
            page.goto(f"{admin_url}{path}", wait_until="networkidle")
            assert page.locator(".nested-header h1").count() == 1, path
            assert page.locator(".nested-tabs").count() == 0, path
            assert page.locator('[data-testid="sales-secondary-nav"] button').count() >= 3, path
        for path in other_paths:
            page.goto(f"{admin_url}{path}", wait_until="networkidle")
            assert page.locator(".nested-header h1").count() == 1, path
            assert page.locator(".nested-tabs button").count() >= 3, path
        browser.close()


if __name__ == "__main__":
    main()
