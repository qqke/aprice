# Aprice

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
ASTRO_BASE_PATH=/
```

如果你要部署到 GitHub Pages 的项目子路径，`ASTRO_BASE_PATH` 仍然要改回仓库名路径；如果是像 `outlets.stbf.online` 这样的自定义域名根路径，就用 `/`。

## Supabase

1. 执行 `supabase/schema.sql`
2. 可选执行 `supabase/seed.sql`
3. 在 Supabase Auth 中启用邮箱登录
4. 把站点地址加入邮件回调允许列表
5. 登录和找回密码邮件会回到登录页，并保留原页面回跳参数
6. 需要后台写权限时，把对应用户的 `profiles.role` 设为 `admin`

## GitHub Pages

工作流位于 `.github/workflows/deploy.yml`，默认把 `main` 分支构建后的 `dist` 发布到 `gh-pages` 分支。

## 备注

`supabase/seed.sql` 只用于初始化测试数据，不参与运行时逻辑。

