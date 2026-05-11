# 搜比价

日本本地药店比价应用，基于 Astro + Supabase，适合部署到 GitHub Pages。

## 功能

- 扫码查价：JAN 条码识别后直接打开商品页
- 附近比价：按当前位置查看附近门店价格
- 模糊查询：支持商品名、品牌、条码号搜索
- 用户登录：Supabase 邮箱密码登录、注册和重置密码
- 个人价格记录：保存购买价、门店、备注和历史
- 收藏：支持收藏商品和门店

## 本地开发

```bash
npm install
npm run dev
```

## 环境变量

在 Supabase 和 GitHub Actions 中提供：

```env
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
PUBLIC_SITE_URL=https://outlets.stbf.online
PUBLIC_TURNSTILE_SITE_KEY=your-turnstile-site-key
ASTRO_BASE_PATH=/
PUBLIC_USE_SERVER_PRICE_RPC=0
PUBLIC_ENABLE_TELEMETRY_RPC=0
```

如果你要部署到 GitHub Pages 的项目子路径，`ASTRO_BASE_PATH` 仍然要改回仓库名路径；如果是像 `outlets.stbf.online` 这样的自定义域名根路径，就用 `/`。

## Supabase

1. 执行 `supabase/schema.sql`
2. 可选执行 `supabase/seed.sql`
3. 在 Supabase Auth 中启用邮箱登录
4. 把站点地址加入邮件回调允许列表
5. 在 Supabase Auth Bot and Abuse Protection 中启用 Turnstile，并填入 Cloudflare Turnstile Secret key
6. 设置 `PUBLIC_TURNSTILE_SITE_KEY`，注册页会把 Turnstile token 传给 Supabase Auth
7. 在 Supabase Auth Password Security 中启用要求当前密码改密
8. 登录和找回密码邮件会回到登录页，并保留原页面回跳参数
9. 需要后台写权限时，把对应用户的 `profiles.role` 设为 `admin`
10. 建议优先执行 `supabase/migrations`（包含社区价审核、遥测入库、价格查询 RPC），`supabase/schema.sql` 作为新环境基线快照
11. 普通用户扫码未命中的商品会写入 `product_submissions`，管理员审核通过后才进入 `products`

## Feature Flags & Rollback

- `PUBLIC_USE_SERVER_PRICE_RPC=1`
  - 启用后：`fetchPricesForProduct` 优先走 `fetch_product_prices` RPC（失败自动回退到 `rest/v1/prices`）。
  - 回滚：改回 `0` 并重新部署。
- `PUBLIC_ENABLE_TELEMETRY_RPC=1`
  - 启用后：前端事件队列会在页面隐藏时尝试批量提交到 `submit_telemetry_events` RPC。
  - 回滚：改回 `0` 并重新部署。

## Schema Parity Check

- `npm run check:schema`
  - 校验 `supabase/migrations` 中新增的关键表/函数/`user_price_logs` 列是否已纳入 `supabase/schema.sql`。
  - 建议在 CI 中加入该命令，防止基线 schema 漂移。

## Price Path Benchmark

- `npm run benchmark:price`
  - 对比 REST 查询与 `fetch_product_prices` RPC 的耗时、返回字节数、行数。
  - 需要环境变量：`PUBLIC_SUPABASE_URL`、`PUBLIC_SUPABASE_ANON_KEY`、`BENCH_PRODUCT_ID`。
  - 可选环境变量：`BENCH_LAT`、`BENCH_LNG`、`BENCH_LIMIT`、`BENCH_SINCE_DAYS`、`BENCH_RADIUS_KM`。
- `workflow_dispatch` 可勾选 `run_benchmark`，并通过 `bench_product_id` 指定商品。

## Price Pagination RPC

- 新增 `fetch_product_prices_page(payload)`，返回：
  - `items`: 本页价格数组
  - `next_cursor`: 下一页游标（`{ collected_at, id }`）或 `null`
- 前端封装：`fetchProductPricesPage(productId, { limit, sinceDays, cursor, lat, lng, radiusKm })`
- 当 `PUBLIC_USE_SERVER_PRICE_RPC=0` 时，自动回退到现有 `fetchPricesForProduct` 行为。

## 上线检查

- Supabase migrations 已全部执行，尤其是 `product_submissions`、价格审核和 telemetry RPC。
- 至少一个维护账号在 `profiles.role` 中设置为 `admin`。
- GitHub Secrets 已配置 `PUBLIC_SUPABASE_URL`、`PUBLIC_SUPABASE_ANON_KEY`、`PUBLIC_SITE_URL`、`PUBLIC_TURNSTILE_SITE_KEY`。
- GitHub Variables 或 Secrets 已确认 `PUBLIC_USE_SERVER_PRICE_RPC`、`PUBLIC_ENABLE_TELEMETRY_RPC` 的开关值。
- 发布前本地运行 `npm run check`、`npm test`、`npm run build`；线上冒烟可运行 `npm run verify:live:suite` 或 `npm run verify:live:add-product`。
- 如果价格流为空，先确认 `prices` 有当前商品记录，再看管理页“运行配置”里的 RPC/遥测状态。

## GitHub Pages

工作流位于 `.github/workflows/deploy.yml`，默认把 `main` 分支构建后的 `dist/client` 作为 GitHub Pages artifact 发布。
如果需要自定义域名，使用 GitHub Secret `PUBLIC_SITE_URL`（例如 `https://outlets.stbf.online`）；工作流会在构建阶段自动生成 `dist/client/CNAME`，无需在仓库提交 `public/CNAME`。
功能开关建议使用 GitHub Variables：`PUBLIC_USE_SERVER_PRICE_RPC`、`PUBLIC_ENABLE_TELEMETRY_RPC`（值用 `0/1`）。

## 备注

`supabase/seed.sql` 只用于初始化测试数据，不参与运行时逻辑。

