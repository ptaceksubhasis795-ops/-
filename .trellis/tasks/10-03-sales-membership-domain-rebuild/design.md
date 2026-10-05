# 技术设计

## 数据边界

- 保留现有 `Promoter`、`MemberApplication`、`PromoterMembership`、`CustomerAttribution`、`PerformanceLedger` 和旧 `RewardRule` 作为兼容来源。
- 新增 `PromoterArchive` 与 `PromoterArchiveItem` 保存删除快照；归档项目包含 promoter、relation、order、reward、withdrawal 四类记录。
- 新增 `PromotionApplication` 保存晋升申请和业绩快照。
- 新增 `RewardRuleSet`（商品唯一）与 `RewardRuleTier`（SALES/MEMBER/COMPANY 唯一）承载聚合规则；旧规则迁移为三档并继续向内存奖励计算投影兼容字段。
- 扩展 `MemberApplication.sourceType`、审核归属、审核原因和审核时间，增加查询索引。

## 服务端契约

- 管理员接口统一使用分页对象 `{ items, total, page, pageSize }`。
- 推广人：`GET /admin/promoters`、`POST /admin/promoters`、`POST /admin/promoters/:id`、`POST /admin/promoters/batch-delete`、`GET /admin/promoters/:id/history`。
- 会员申请：`GET /admin/member-applications`、`GET /admin/member-applications/:id`、`POST /admin/members/:id/review`；通过请求必须携带 `salesPromoterId`，驳回可携带 `reason`。
- 晋升：`GET/POST /members/promotion-application`、`GET /admin/promotion-applications`、`GET /admin/promotion-applications/:id`、`POST /admin/promotion-applications/:id/review`、`GET /sales/eligibility`。
- 关系树：销售人员分页、单销售树、批量绑定、解绑、已绑定/未绑定客户查询；所有写操作记录 actor、reason、source。
- 奖励：商品搜索、规则集合详情、规则集合 upsert；旧单条接口保留兼容适配。
- 小程序：`GET /sales/network` 返回按身份裁剪的上级、下属和客户列表。

## 状态与安全

- 会员申请状态：`pending → approved/rejected`；同一用户只能有一个 pending。
- 晋升状态：`pending → approved/rejected`；提交时保存三个月指标快照。
- 归档删除使用数据库事务/同步服务先写快照，再解除关系并停用推广人；失败时不改变当前关系。
- 关系写入检查重复、循环、目标状态和操作者权限。
- 绑定用户不随推广人删除，订单/奖励历史只读访问。

## 客户端结构

- 后台销售工作区增加会员晋升申请页，推广人页增加分页、选择、批量删除和历史抽屉。
- 关系树页拆分销售人员列表、树详情、绑定面板；同时支持 HTML 拖放和勾选批量操作。
- 奖励规则改为商品搜索 + 规则集合编辑页，三档使用模式单选。
- 小程序新增 `pages/member/promotion`、`pages/sales/network`，从会员申请页、销售中心和个人中心进入。
