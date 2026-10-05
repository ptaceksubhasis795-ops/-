# 技术设计

## 2026-10-04 页面实现更新

本轮以 v2 为只读参考，不重绘 82 张图。将业务页面按职责拆为独立 Vue 页面，在销售域导出统一 SalesSubpage/异步状态/输入类型。共享 UI 通过 sales.css 约束，不改非销售模块样式。App.vue 仅补销售菜单与销售路由壳层样式。小程序样式限定 pages/sales，订单确认复用既有地址选择/订单详情。

数据仍经 admin/src/api.ts 与 services/api.js；服务器负责 fen、rateBps、fixedFen、审计和状态转换。仅对验收证明的契约缺口补充 operations 服务，保持已有响应字段兼容。前端详情读取真实接口或列表快照，不生成假支付、假二维码或假统计。

交付目录 output/sales-center-assets-redesign-v3：reference-state-map.json、流程说明、verification 结果和 runtime-screenshots；generation/records.jsonl 只列新装饰资产（无新图时为空）。v2 ZIP 的 SHA-256 在开始和结束校验相同。

## 设计输入

1. `output/sales-center-assets-redesign-v2/ai-screens/`：本轮独立生成的页面状态，作为视觉验收和功能结构回溯材料。
2. `output/sales-center-assets-redesign-v2/master/sales-design-system.png`：AI 生成的统一设计母版，作为色彩、栅格、排版和空间层级参考。
3. `admin/src/SalesWorkspace.vue`、`admin/src/api.ts`、`server/src/domain/operations.service.ts`、`server/src/operations.controller.ts`：页面、API 和服务端真实边界。

## AI 生成链路

- 先用 Image API `gpt-image-2.5-sunburst` 生成母版。
- 每个最终状态单独调用 Image API `generation`，使用路由、状态机和母版约束提示词；不把旧图作为最终图，不复制、裁切或拼接旧图。
- 每个 prompt 明确页面目标、状态、必须存在的控件、状态含义和禁止出现的装饰。
- 生成结果放入 `output/sales-center-assets-redesign-v2/ai-screens/`，manifest 和逐图 records 保存状态、提示词和输出哈希。

## 运行时边界

- `SalesWorkspace.vue` 负责销售页面状态、路由切换、弹窗和数据展示。
- `admin/src/api.ts` 只负责请求封装和分页对象解码。
- `operations.service.ts` 负责代客订单草稿分页、提现审核原因和状态转换。
- `operations.controller.ts` 暴露管理员代客订单草稿查询，不改变客户确认接口。
- AI 视觉稿不进入数据库、不覆盖运行时业务字段。

## 交互衔接

| 入口 | 下一状态 | 数据来源 |
| --- | --- | --- |
| 销售概览待办 | 会员申请/提现审核/关系树 | 各分页接口 |
| 会员申请通过 | 选择销售人员后写入关系 | `POST /admin/members/:id/review` |
| 关系树绑定/解除 | 原因弹窗 → 刷新当前销售树 | batch-assign / unbind |
| 奖励规则编辑 | 商品选择 → 三档保存 | reward rule set |
| 周结算 | 确认弹窗 → 幂等批次 | `POST /admin/rewards/settle` |
| 提现审核 | 通过/驳回原因 → 待打款或已驳回 | `POST /admin/withdrawals/:id/review` |
| 代客订单 | 草稿列表 → 客户确认页 → 正式订单 | admin draft query + existing mini-program flow |
| 推广素材 | 路径/二维码/轮播详情 | promo-assets + banners |

## 风险控制

- 视觉稿中的金额、状态和身份仅作为示例，运行时仍按 fen、服务端状态和角色权限展示。
- 任何需要理由的写操作都在 UI 和服务端双重校验。
- 构建和浏览器验证使用本地开发服务；不改变生产配置和真实支付状态。
