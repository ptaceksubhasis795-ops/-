# 技术设计

## 边界与组件

- `admin/src/sales/pages/PromotersPage.vue` 负责推广人页面标题、筛选卡片、列表卡片和分页展示；`SalesWorkspace.vue` 继续作为销售工作区协调器，持有分页、筛选、对话框、抽屉和 API 操作状态。
- 不改变 `main.ts` 路由契约，继续使用 `/sales/promoters` 深链；页面状态通过 `SalesPageFrame` 的 `data-visual-state` 暴露。
- 公共销售视觉变量继续使用 `admin/src/style.css` 中的 `--sales-*` 令牌；推广人专用样式集中在销售工作区/页面样式，避免污染商品、内容和客户模块。

## 数据流

1. 页面 mounted/路由切换时，工作区按当前筛选调用 `getPromotersPage`。
2. API 端用现有分页协议返回推广人视图；新增只读展示字段由 `operations.service.ts` 的 `promoterView`/列表映射计算。
3. `promoterView` 从用户表读取用户名/脱敏手机号，从有效 `promoterMemberships`/`customerAttributions` 计算直属邀请，从 `performanceLedger` 和 `commissions`/奖励台账计算 fen 金额；空值保持可判别的 `undefined`。
4. 页面金额统一通过前端格式化器从 fen 转元；服务端内部和接口字段仍保留 fen，兼容旧的 `amount` 字段。
5. 查询、重置和分页只改变查询状态并重新加载，不在前端对列表做第二套过滤；保存/归档成功后刷新当前页，当前页被清空时回退到上一页。

## 交互与状态

- 筛选卡片使用明确的 label 和输入/下拉控件；Enter 等同于查询。
- 行查看打开右侧 `SalesDrawer`；查看不写数据。编辑使用现有 `promoterDialog`；归档和批量归档使用 `actionDialog`，原因必填。
- 表头复选框只选择当前页仍有效的推广人；已归档行不可选。成功、失败、加载、空态沿用 `SalesState`/toast，并保留用户已输入的表单内容。
- 使用 `aria-label`、`data-testid` 和按钮禁用状态覆盖筛选、分页、查看、编辑、归档和新增路径。

## 兼容与风险

- 原有 `promoterClass`、`type`、`level` 字段和编辑接口保持兼容；前端身份展示统一使用 `promoterClassText`。
- 服务端列表统计属于派生只读字段，不新增持久化列，避免迁移和历史数据回填；统计基于有效关系/台账，性能风险限制在当前内存/分页数据规模。
- 销售角色的可见范围和归档权限仍由服务端 `allow`/授权逻辑决定；前端隐藏操作只是体验层保护。
- 视觉调整不改变现有批量归档、历史快照和事务语义；若接口新增字段失败，前端按空值降级显示，不阻断基本列表。

## 回滚

若视觉验收不通过，可回退推广人专用模板和样式；API 派生字段是向后兼容的附加字段，可保留或单独回退，不需要数据库回滚。原有新增、编辑、批量归档和历史接口继续可用。
