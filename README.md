# 九转健康商城

一个面向私域健康零售场景的单租户平台，包含：

- 原生微信小程序：消费者商城、处方、就诊人、订单、会员和销售中心。
- Vue 3 管理后台：商品、库存、订单、处方审核、销售奖励、客户档案、内容和设置。
- NestJS 服务端：订单状态机、库存预占、处方审核、奖励台账、提现和审计日志。
- 定时任务：每分钟自动取消超时未支付订单、自动确认超时未收货订单；管理员仍可手动执行补偿任务。
- Prisma/MySQL 数据模型：敏感字段、批号有效期、支付、物流、售后、发票和推广关系。

## 本地启动

### 1. 服务端

```powershell
cd server
Copy-Item .env.example .env
npm install
npm run dev
```

开发模式默认使用内存数据并写入被忽略的 `server/data/store.json` 快照，访问 `http://localhost:3000/api/v1/health` 可检查服务。Prisma schema/client 和同步 Repository 已接入；正式切换 MySQL 前需要配置 `DATABASE_URL`、执行迁移和 seed，不能只改环境变量。

拿到数据库账号后，可执行 `npm run prisma:migrate` 和 `npm run prisma:seed` 初始化用户、商品、SKU、库存批次和奖励规则。首个迁移位于 `server/prisma/migrations/0001_init`，Docker API 容器会在启动时执行 `prisma migrate deploy`。

上线前执行 `npm run readiness`，它只输出缺少哪些配置项，不会打印密钥内容。

需要恢复演示初始数据时，停止 API 后删除 `server/data/store.json`，再次启动即可重新播种。

### 2. 管理后台

```powershell
cd admin
npm install
npm run dev -- --host 127.0.0.1 --port 5174
```

打开 `http://localhost:5174`。后台在 API 不可用时使用演示数据，连接 API 后自动读取服务端数据。

### 3. 微信开发者工具

直接打开当前目录 `C:\Users\12842\Desktop\微信小程序`，编译入口是根目录的 `app.json`。`project.config.json` 已忽略 `server/`、`admin/`、文档和测试目录，开发者工具只会编译小程序代码。

小程序当前默认是模拟数据模式：支付、微信登录、医院、发票、物流和商家转账不会产生真实外部操作。生产环境需要在配置层切换 API 地址，并完成微信 AppID、商户号、HTTPS 域名及相关主体资质配置。

切换 API 前修改 `config/runtime.js` 的 `demoMode` 和 `apiBaseUrl`，并在微信开发者工具的“详情 -> 本地设置”中允许本地服务请求；生产环境只能使用备案 HTTPS 域名。

微信订阅消息模板 ID 在 `config/runtime.js` 配置；未填写时自动跳过授权请求，不影响模拟模式。

### 4. Docker 部署

```powershell
Copy-Item .env.production.example .env
docker compose config
docker compose up -d --build
```

Compose 会启动 MySQL、Redis、API 和 Nginx 管理后台。正式环境必须先替换 `.env` 中的随机密钥、微信参数和数据库密码，并在迁移窗口执行 Prisma migration/seed。
微信私钥和平台证书放在未提交的 `secrets/` 目录，Compose 以只读方式挂载到 API 容器。

## 目录

```text
pages/                 小程序页面
services/              小程序本地仓库和 API 适配边界
server/src/domain/     订单、处方、推广、审计领域逻辑
server/prisma/         MySQL 数据模型
admin/src/              管理后台工作台
docs/                   实施记录与交付说明
```

## 当前质量门槛

- 小程序：19 个 WXML、19 个 WXSS、23 个 JSON、25 个 JavaScript 文件通过微信编译器和语法检查。
- 服务端：`npm run lint`、`npm run build`、Prisma schema validate 通过。
- 后台：`npm run build` 通过；Playwright 冒烟测试覆盖总览、订单、处方、销售菜单切换和控制台错误检查。
- API：`server/tests/smoke.ps1` 覆盖健康检查、商品、订单、支付、发货、后台汇总和审计。
- 奖励：`server/tests/reward-smoke.ps1` 覆盖直接客户奖励生成和售后扣回。
- 导出：管理员可下载客户档案与销售奖励/提现的 XLSX 文件，导出动作写入审计。
- 安全：`server/tests/security-smoke.ps1` 覆盖后台越权、发货权限、销售处方范围和 XLSX 导出权限。
- CI：`.github/workflows/ci.yml` 自动执行 Prisma validate、服务端 lint/build、后台 build 和小程序清单检查。

## 下一阶段

1. 接入真实微信登录和微信支付 API v3，补回调验签与退款。
2. 将内存仓库切换为 Prisma Repository，接入 MySQL、Redis、COS 和任务队列。
3. 完成医院、电子发票、物流、ERP、短信和健康服务接口的适配器。
4. 根据主体资质和奖励清单完成处方宣传、推广奖励和提现上线审核。

需求追踪和验收：

- `docs/需求追踪矩阵.md`
- `docs/验收用例.md`
- `docs/正式联调清单.md`
