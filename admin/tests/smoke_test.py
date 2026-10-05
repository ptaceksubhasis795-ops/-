import os
from pathlib import Path

from playwright.sync_api import sync_playwright


def main() -> None:
    base_url = os.environ.get("ADMIN_URL", "http://127.0.0.1:5176")
    screenshot = Path(__file__).resolve().parent / "admin-dashboard.png"
    console_errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960}, device_scale_factor=1)
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.goto(base_url, wait_until="domcontentloaded")

        assert page.locator(".nav-item").count() == 9
        assert page.locator("h1").inner_text() == "业务总览"
        page.screenshot(path=str(screenshot), full_page=True)

        page.get_by_role("button", name="商品 规格与库存").click()
        assert page.get_by_role("heading", name="商品与库存").is_visible()
        page.get_by_role("button", name="新增记录").click()
        dialog = page.locator(".dialog-card").last
        assert dialog.is_visible()
        dialog.get_by_label("商品名称").fill("验收商品")
        dialog.get_by_label("规格名称").fill("标准规格")
        dialog.get_by_role("button", name="保存商品").click()
        page.wait_for_timeout(300)
        if dialog.is_visible():
            assert page.locator(".enterprise-toast").is_visible()  # API failure keeps entered data.
            dialog.get_by_role("button", name="取消").click()
        else:
            assert page.get_by_text("验收商品").count() > 0

        page.get_by_role("button", name="内容 科普与首页").click()
        page.get_by_role("button", name="新增文章").click()
        article = page.locator(".content-dialog").last
        assert article.get_by_role("combobox", name="文章分类").locator("option").count() == 7
        article.get_by_label("文章标题").fill("验收文章")
        article.get_by_label("文章正文").fill("验收正文")
        article.get_by_role("button", name="保存文章").click()
        page.wait_for_timeout(300)
        if article.is_visible():
            assert page.locator(".content-toast").is_visible()
            article.get_by_role("button", name="取消").click()
        else:
            assert page.get_by_text("验收文章").count() > 0

        page.get_by_role("button", name="首页轮播").click()
        page.get_by_role("button", name="新增轮播").click()
        banner = page.locator(".content-dialog").last
        assert banner.get_by_text("16:7").is_visible()
        banner.get_by_role("button", name="取消").click()

        page.get_by_role("button", name="设置 规则与权限").click()
        page.get_by_role("button", name="业务规则").click()
        assert page.locator(".dialog-card").last.is_visible()
        page.locator(".dialog-card").last.get_by_role("button", name="取消").click()
        assert not console_errors, console_errors
        browser.close()


if __name__ == "__main__":
    main()
