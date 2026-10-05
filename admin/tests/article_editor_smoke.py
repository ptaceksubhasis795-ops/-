import time

from playwright.sync_api import sync_playwright


def main() -> None:
    title = f"独立编辑回归-{int(time.time())}"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 960})
        page = context.new_page()
        login = page.request.post("http://127.0.0.1:3002/api/v1/auth/staff/login", data={"username": "admin", "password": "admin123"})
        assert login.ok, login.text()
        context.add_init_script("localStorage.setItem('jz_admin_access_token', %r)" % login.json()["data"]["token"])
        page.goto("http://127.0.0.1:5176/", wait_until="networkidle")
        page.get_by_role("button", name="内容 科普与首页").click()
        page_size = page.locator(".page-size-control input")
        page_size.fill("3")
        page_size.press("Enter")
        assert page_size.input_value() == "3"
        page.get_by_role("button", name="新增文章").click()
        assert page.url.endswith("/content/articles/new")
        page.get_by_label("文章标题").fill(title)
        page.get_by_label("文章正文").fill("这是独立文章编辑页的回归正文。")
        search = page.get_by_placeholder("搜索商品名称或编号")
        search.fill("草本轻养茶")
        page.wait_for_timeout(500)
        page.locator(".product-picker-card").filter(has_text="草本轻养茶").click()
        assert page.get_by_text("已选商品", exact=False).count() >= 1
        page.get_by_role("button", name="保存文章").click()
        page.wait_for_url("**/content/articles", timeout=5000)
        page.get_by_text(title, exact=True).wait_for(timeout=5000)
        assert page.get_by_text(title, exact=True).is_visible()
        page.get_by_text(title, exact=True).locator("..")
        row = page.locator(".content-row").filter(has_text=title).last
        row.get_by_role("button", name="编辑").click()
        page.wait_for_url("**/content/articles/*/edit", timeout=5000)
        page.get_by_text("草本轻养茶", exact=True).first.wait_for(timeout=5000)
        assert page.get_by_text("草本轻养茶", exact=True).count() >= 1
        page.get_by_role("button", name="保存文章").click()
        page.wait_for_url("**/content/articles", timeout=5000)
        row = page.locator(".content-row").filter(has_text=title).last
        page.once("dialog", lambda dialog: dialog.accept())
        row.get_by_role("button", name="删除文章").click()
        page.wait_for_timeout(400)
        assert page.locator(".content-row").filter(has_text=title).count() == 0
        browser.close()


if __name__ == "__main__":
    main()
