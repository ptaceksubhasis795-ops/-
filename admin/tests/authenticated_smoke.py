import os
import time
import uuid
from datetime import date, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright


API_URL = os.environ.get("API_URL", "http://127.0.0.1:3002")
ADMIN_URL = os.environ.get("ADMIN_URL", "http://127.0.0.1:5176/")


def login(request, username: str, password: str) -> dict:
    response = request.post(f"{API_URL}/api/v1/auth/staff/login", data={"username": username, "password": password})
    assert response.ok, response.text()
    body = response.json()["data"]
    assert body["token"] and body["user"]["role"]
    return body


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 960})
        page = context.new_page()
        errors = []
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        admin = login(page.request, "admin", "admin123")
        context.add_init_script("localStorage.setItem('jz_admin_access_token', %r); localStorage.setItem('jz_admin_staff_user', %r);" % (admin["token"], str(admin["user"]).replace("'", '"')))
        page.goto(ADMIN_URL, wait_until="networkidle")
        assert page.get_by_role("heading", name="业务总览").is_visible()

        # Article: create with category, recommendation, product binding, and shop jump.
        article_title = f"认证文章-{uuid.uuid4().hex[:8]}"
        page.get_by_role("button", name="内容 科普与首页").click()
        page.get_by_role("button", name="新增文章").click()
        page.wait_for_url("**/content/articles/new", timeout=5000)
        editor = page.locator(".article-editor-page")
        editor.locator(".cover-option").first.wait_for(timeout=10000)
        assert editor.locator(".cover-option").count() == 7
        assert editor.locator(".cover-option.selected").count() == 1
        cover_source_url = editor.locator(".cover-option img").first.get_attribute("src")
        assert cover_source_url
        editor.get_by_role("button", name="自定义上传").click()
        cover_drop = editor.locator(".cover-upload-zone")
        cover_drop.dispatch_event("dragover")
        assert "is-dragging" in (cover_drop.get_attribute("class") or "")
        cover_drop.evaluate("""async (element, sourceUrl) => {
          const response = await fetch(sourceUrl);
          const blob = await response.blob();
          const transfer = new DataTransfer();
          transfer.items.add(new File([blob], '文章封面.webp', { type: 'image/webp' }));
          element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
        }""", cover_source_url)
        page.get_by_role("heading", name="调整图片比例").wait_for()
        cover_selection = page.locator(".cropper-selection:visible").first
        cover_selection.wait_for(timeout=10000)
        assert cover_selection.count() == 1
        assert page.locator(".cropper-handle:visible").count() == 4
        assert page.locator(".cropper-mask").count() == 4
        cover_box = cover_selection.bounding_box()
        assert cover_box
        cover_handle = page.locator(".cropper-handle-se")
        cover_handle_box = cover_handle.bounding_box()
        assert cover_handle_box
        page.mouse.move(cover_handle_box["x"] + cover_handle_box["width"] / 2, cover_handle_box["y"] + cover_handle_box["height"] / 2)
        page.mouse.down()
        page.mouse.move(cover_handle_box["x"] - 24, cover_handle_box["y"] - 12)
        page.mouse.up()
        resized_cover_box = cover_selection.bounding_box()
        assert resized_cover_box and resized_cover_box["width"] < cover_box["width"]
        page.mouse.move(resized_cover_box["x"] + resized_cover_box["width"] / 2, resized_cover_box["y"] + resized_cover_box["height"] / 2)
        page.mouse.down()
        page.mouse.move(resized_cover_box["x"] + resized_cover_box["width"] / 2 + 18, resized_cover_box["y"] + resized_cover_box["height"] / 2 + 8)
        page.mouse.up()
        moved_cover_box = cover_selection.bounding_box()
        assert moved_cover_box and moved_cover_box["x"] != resized_cover_box["x"]
        page.get_by_role("button", name="确认裁剪").click()
        page.get_by_text("文章封面已裁剪并上传").wait_for(timeout=10000)
        editor.get_by_label("文章标题").fill(article_title)
        editor.get_by_label("文章分类").select_option(label="日常健康管理")
        editor.get_by_label("文章正文").fill("认证回归正文")
        editor.get_by_label("首页推荐文章").check()
        editor.get_by_placeholder("搜索商品名称或编号").fill("草本轻养茶")
        page.wait_for_timeout(500)
        editor.locator(".product-picker-card").filter(has_text="草本轻养茶").click()
        editor.get_by_role("button", name="保存文章").click()
        page.wait_for_timeout(500)
        page.wait_for_url("**/content/articles", timeout=5000)
        page.get_by_text(article_title, exact=True).wait_for(timeout=5000)
        row = page.locator(".content-row").filter(has_text=article_title).last
        assert row.count() == 1 and row.locator(".recommend-pill").is_visible()

        # Edit recommendation state and delete the same article with the real API.
        row.get_by_role("button", name="编辑").click()
        page.wait_for_url("**/content/articles/*/edit", timeout=5000)
        edit = page.locator(".article-editor-page")
        assert edit.locator(".cover-mode-tabs button.active").inner_text() == "自定义上传"
        edit.get_by_label("首页推荐文章").uncheck()
        edit.get_by_role("button", name="保存文章").click()
        page.wait_for_url("**/content/articles", timeout=5000)
        page.get_by_text(article_title, exact=True).wait_for(timeout=5000)
        row = page.locator(".content-row").filter(has_text=article_title).last
        assert row.count() == 1 and row.locator(".recommend-pill").count() == 0
        page.on("dialog", lambda dialog: dialog.accept())
        row.get_by_role("button", name="删除文章").click()
        page.wait_for_timeout(400)
        assert page.locator(".content-row").filter(has_text=article_title).count() == 0

        # Default banner save and custom banner fixed-ratio crop/upload.
        page.get_by_role("button", name="首页轮播").click()
        page.get_by_role("button", name="新增轮播").click()
        banner = page.locator(".content-dialog").last
        default_banner_title = f"认证默认轮播-{int(time.time())}"
        banner.get_by_label("轮播标题").fill(default_banner_title)
        banner.get_by_role("button", name="保存轮播").click()
        page.wait_for_timeout(400)
        assert page.get_by_text(default_banner_title, exact=False).count() >= 1

        page.get_by_role("button", name="新增轮播").click()
        custom = page.locator(".content-dialog").last
        image_path = str(Path(__file__).resolve().parents[2] / "assets" / "banners" / "daily-care.webp")
        custom.get_by_label("图片来源").select_option("custom")
        custom.locator("input[type=file]").set_input_files(image_path)
        page.get_by_role("heading", name="调整图片比例").wait_for()
        selection = page.locator(".cropper-selection:visible").first
        selection.wait_for(timeout=10000)
        assert selection.count() == 1
        assert page.locator(".cropper-handle").count() == 4
        assert page.locator(".cropper-mask").count() == 4
        before_box = selection.bounding_box()
        assert before_box
        page.mouse.move(before_box["x"] + before_box["width"] / 2, before_box["y"] + before_box["height"] / 2)
        page.mouse.down()
        page.mouse.move(before_box["x"] + before_box["width"] / 2 + 24, before_box["y"] + before_box["height"] / 2 + 12)
        page.mouse.up()
        moved_box = selection.bounding_box()
        assert moved_box and (moved_box["x"] != before_box["x"] or moved_box["y"] != before_box["y"])
        handle = page.locator(".cropper-handle-se")
        handle_box = handle.bounding_box()
        assert handle_box
        page.mouse.move(handle_box["x"] + handle_box["width"] / 2, handle_box["y"] + handle_box["height"] / 2)
        page.mouse.down()
        page.mouse.move(handle_box["x"] - 18, handle_box["y"] - 8)
        page.mouse.up()
        resized_box = selection.bounding_box()
        assert resized_box and resized_box["width"] < moved_box["width"]
        page.get_by_role("button", name="确认裁剪").click()
        page.locator(".cropper-dialog").wait_for(state="hidden", timeout=10000)
        custom_banner_title = f"认证自定义轮播-{int(time.time())}"
        custom.get_by_label("轮播标题").fill(custom_banner_title)
        custom.get_by_role("button", name="保存轮播").click()
        page.wait_for_timeout(500)
        assert page.get_by_text(custom_banner_title, exact=False).count() >= 1

        # Product save persists default SKU and batch, and a failed save keeps the dialog open.
        page.get_by_role("button", name="商品 规格与库存").click()
        page.get_by_role("button", name="新增记录").click()
        product = page.locator(".dialog-card").last
        product_name = f"认证批次商品-{int(time.time())}"
        product.get_by_label("商品名称").fill(product_name)
        product.get_by_label("售价（元）").fill("39.90")
        product.get_by_label("库存数量").fill("12")
        product.get_by_label("规格名称").fill("标准规格")
        product.get_by_label("批次编号").fill("TEST-BATCH")
        product.get_by_label("有效期").fill((date.today() + timedelta(days=90)).isoformat())
        product.get_by_role("button", name="保存商品").click()
        page.wait_for_timeout(600)
        product_row = page.locator(".table-row").filter(has_text=product_name)
        assert product_row.count() >= 1
        page.get_by_role("button", name="刷新").click()
        page.wait_for_timeout(400)
        refreshed_row = page.locator(".table-row").filter(has_text=product_name)
        assert refreshed_row.count() >= 1

        def fail_product(route):
            if route.request.method == "POST":
                route.fulfill(status=500, content_type="application/json", body='{"message":"测试保存失败"}')
            else:
                route.continue_()

        page.route("**/api/v1/admin/products", fail_product)
        page.get_by_role("button", name="新增记录").click()
        failed = page.locator(".dialog-card").last
        failed.get_by_label("商品名称").fill("失败保留商品")
        failed.get_by_label("规格名称").fill("失败规格")
        failed.get_by_role("button", name="保存商品").click()
        page.wait_for_timeout(400)
        assert failed.is_visible() and page.locator(".enterprise-toast").is_visible()
        failed.get_by_role("button", name="取消").click()
        page.unroute("**/api/v1/admin/products", fail_product)

        # Pharmacists see only their permitted modules after a real session login.
        pharmacist_context = browser.new_context(viewport={"width": 1280, "height": 800})
        pharmacist = login(pharmacist_context.request, "pharmacist", "pharmacist123")
        pharmacist_context.add_init_script("localStorage.setItem('jz_admin_access_token', %r); localStorage.setItem('jz_admin_staff_user', %r);" % (pharmacist["token"], str(pharmacist["user"]).replace("'", '"')))
        pharmacist_page = pharmacist_context.new_page()
        pharmacist_page.goto(ADMIN_URL, wait_until="networkidle")
        assert pharmacist_page.locator(".nav-item").count() == 3
        assert pharmacist_page.get_by_role("button", name="处方 审核与支付").is_visible()
        assert pharmacist_page.get_by_role("button", name="客户 档案与授权").is_visible()
        assert pharmacist_page.get_by_role("button", name="商品 规格与库存").count() == 0
        pharmacist_context.close()
        unexpected_errors = [error for error in errors if "500" not in error]
        assert not unexpected_errors, unexpected_errors
        context.close()
        browser.close()


if __name__ == "__main__":
    main()
