# 技术设计

## 1. 目标架构

保留当前“原生微信小程序 + Vue 3 后台 + NestJS 模块化单体 + Prisma/MySQL”的技术栈，但把演示仓库和生产仓库的职责分开：

```text
小程序页面 / 后台工作台
        ↓ 统一 API DTO
NestJS Controller → Domain Service → Repository/事务
                                      ↓
                            MySQL + Redis/任务队列 + COS
```

外部医院、微信支付、发票、物流、短信、健康服务继续通过适配器接入；适配器失败进入人工任务，不直接修改订单/处方主状态。

## 2. 模块边界

- `identity`：微信登录、后台登录、角色、用户、地址、就诊人、健康授权。
- `catalog`：商品、分类、SKU、商品内容、上下架、处方标记、奖励标记。
- `inventory`：批次、有效期、库存流水、预占、扣减、回滚和盘点。
- `order`：购物车、结算、运费、订单状态、订单项、地址快照和幂等。
- `payment`：JSAPI 下单、通知验签/解密、支付流水、退款、商家转账。
- `prescription`：处方来源、文件、就诊人、审核、有效期、一次使用。
- `promotion`：推广人、会员申请、层级归属、奖励规则、台账、结算、提现。
- `customer`：客户档案、标签、健康授权、购买/处方记录和导出。
- `content`：文章分类、文章、推荐、商品绑定、轮播、裁剪后的图片资源。
- `reporting`：按时间/板块/商品/推广人的统计和 XLSX 导出。
- `operations`：售后、发票、物流、人工任务、审计和设置。

## 3. 数据契约

### Article

`id, category, title, tag, summary, body, productIds, jumpToShop, jumpTarget, published, recommended, updatedAt`。

文章分类使用 `config/article-categories.json` 的稳定 key；旧 `tag` 只作为兼容展示字段。公共接口只返回已发布文章，并按推荐和更新时间排序。

### Banner

`id, title, mode(default/custom), imageKey, target, sort, active`。

自定义图片先由后台浏览器裁成 `1280x560` 的 `16:7` 图片，再保存资源地址或开发模式数据。公共接口只返回启用轮播，并按 `sort` 排序。

### API 行为

- 列表 API 必须支持搜索、状态、时间范围和分页参数。
- 写入 API 返回保存后的完整资源；错误使用统一的 HTTP 状态和中文 message。
- 所有后台写操作都记录 actor、资源、动作、前后值或关键参数。
- 小程序公共内容接口和后台管理接口分离，避免草稿数据泄露。

## 4. 迁移和兼容

- 文章/轮播新字段使用独立 Prisma migration；内存快照启动时把旧文章和旧轮播归一化到新字段。
- 旧文章标签按兼容映射转到七个分类 key。
- 小程序保留本地回退数据，但只在 API 不可用时使用；成功连接 API 后不再使用本地内容覆盖服务端内容。
- 图片资源优先使用 COS 私有地址；本地联调允许项目内资源和裁剪后的 data URL，生产环境由上传适配器替换。

## 5. 风险和回滚

- 先在内存模式完成 UI/API 契约验收，再执行 MySQL migration 和数据回填。
- 文章和轮播字段向后兼容旧记录，删除动作需要后台确认并写审计。
- 支付、库存、处方和奖励改造采用状态机和幂等键；任何外部接口失败只能进入可重试/人工队列。
- 发布前必须通过生产 readiness、真实数据库迁移演练和小程序合法域名检查。
