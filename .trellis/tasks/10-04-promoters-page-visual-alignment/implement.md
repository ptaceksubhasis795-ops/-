# 实施计划

## 1. 规划与契约

- [ ] 读取 admin frontend contracts 和跨层思考指南，确认金额、权限、状态约定。
- [ ] 记录设计稿到页面/字段/交互映射，保持本 PRD 与实现一致。

## 2. 服务端列表视图

- [ ] 扩展推广人列表视图的只读字段：用户名、脱敏手机号、直属邀请、累计销售额、累计奖励、加入时间。
- [ ] 验证销售角色范围、归档状态过滤和 fen 金额格式不变。
- [ ] 补充/更新推广人回归场景，确认缺失用户/台账时安全返回空值。

## 3. 后台页面

- [ ] 将 `PromotersPage.vue` 从壳层升级为设计稿对应的页面结构，或抽取等价的推广人专用展示组件。
- [ ] 重做标题、筛选卡、表格卡和分页视觉层级；补齐查看抽屉入口、手机号/统计/加入时间列、行级归档。
- [ ] 调整工作区状态、筛选、分页、批量选择和失败反馈，保持真实 API 写入。
- [ ] 新增 data-testid/aria 标签，覆盖深链、刷新、空态和错误态。

## 4. 验证

- [ ] `npm run api:lint`
- [ ] `npm run api:build`
- [ ] `npm run admin:build`
- [ ] `python admin/tests/nested_smoke.py`
- [ ] 运行推广人/销售域回归脚本。
- [ ] 用 Playwright 打开 `/sales/promoters`，验证筛选、重置、分页、查看、编辑、归档确认和失败态。
- [ ] 检查截图对齐：标题、筛选卡、表头、按钮、分页、留白、响应式横向滚动。

## 5. 质量门

- [ ] Trellis check 审查跨层字段、权限、空态、金额和复用。
- [ ] 保留失败保存时的表单数据；未发现问题后再进入提交/归档流程。

## 风险文件

- `admin/src/SalesWorkspace.vue`
- `admin/src/sales/pages/PromotersPage.vue`
- `admin/src/style.css`
- `server/src/domain/operations.service.ts`
- `server/tests/sales-domain-regression.ts`
