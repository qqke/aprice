# 任务清单

- [x] 拆分公共浏览器模块和 auth 模块，移除首页首屏对 Supabase SDK 的静态依赖
- [x] 更新 BaseLayout、登录页、个人页、管理页、商品页和扫码页的导入路径
- [x] 更新浏览器资产同步脚本和相关测试映射
- [x] 重新构建并跑 check / test / build
- [x] 采集优化前后性能数据并整理报告
- [x] 盘点现有 Supabase Auth 魔法链接调用链和受影响页面
- [x] 将浏览器认证封装改成邮箱密码注册、登录、找回密码和更新密码
- [x] 重写登录页为邮箱密码注册 / 登录 / 忘记密码 / 重置密码流程
- [x] 接通顶部会话状态刷新与登出后的 UI 更新
- [x] 更新浏览器测试和运行时测试，覆盖新 auth 方法和页面文案
- [x] 运行 typecheck / lint / test / build 并修复问题
- [x] 统一全站状态文案收尾，并同步修正相关测试断言
- [x] 统一全站视觉收尾：焦点态、悬停态、轻量动效和可访问性细节
- [x] 校对登录 / 首页 / 个人页 / 商品页 / 管理页的交互反馈一致性
- [x] 跑一轮 check / test / build 并修复问题

- [x] 进一步移除首页/登录页首屏对 `browser.js` 的依赖，把登录页首屏 JS 请求压到 0

- [x] 统一 login 测试等待 helper，并修复商品页测试的 DOM 等待时机

- [x] 继续统一浏览器测试等待写法，并把 me / admin / scan 改成更早挂载后再断言

## Review

- 这轮把 home / me / admin / scan 的浏览器测试等待写法进一步收敛，并把部分页面从 networkidle 改成更早的 DOM 挂载等待，整体更贴合当前首屏策略。

- 登录页浏览器测试已收敛为 3 个等待 helper，商品页浏览器测试改成先等 DOM 挂载再取文本，`npm run check`、`npm test`、`npm run build` 已全部通过。

- 认证主流程已从 magic link 切换为邮箱密码登录 / 注册 / 找回密码，并且已通过 `npm run check`、`npm test`、`npm run build` 验证。
- 会话感知的顶栏登录入口和登录页已补齐：已登录时显示退出/切换账号，返回登录页时隐藏注册登录表单。
- 登录页、顶栏会话徽章、退出登录和恢复密码回调都已接通，旧的 `signInWithOtp` 调用和 magic link 文案已清理。
- 全站用户可见文案已进一步收短，页面里残留的说明书语气、技术暴露和动作词不一致问题已压平。
- 全局样式已补上搜索栏布局、焦点可见性、悬停反馈、轻量入场动效和 reduced-motion 兼容。
- `npm run check` 仍保留了 `tests/admin-page-browser.test.mjs` 的 3 条 TypeScript hint，但没有阻断构建或测试。
- 这轮视觉收尾已完成：全局样式补了焦点态、悬停态、轻量动效、搜索栏布局和 reduced-motion 兼容，并通过 `npm run check`、`npm test`、`npm run build` 验证。

- [x] 移除 Supabase 公共密钥明文默认值，改为只从 GitHub Secrets / 环境变量注入

- 已完成：源码、public 产物和同步脚本都不再包含明文默认值。
- 验证：
pm run build、
pm test 通过；GitHub Actions 继续从 PUBLIC_SUPABASE_URL 和 PUBLIC_SUPABASE_ANON_KEY 读取 Secrets。

- 公共浏览器模块已拆成 `browser.js` 和 `browser-auth.js`，首页首屏不再静态加载 Supabase SDK。
- `BaseLayout` 顶栏会话状态改成页面加载后再懒加载 auth 模块，登录页 / 个人页 / 管理页 / 商品页也都改为按需导入。
- 验证已通过：`npm run build`、`npm run check`、`npm test`。
- 本地 headless 测速对比：`dist/browser.js` 从 13,801 bytes 降到 6,206 bytes；首页初始 JS 请求保持 1 个，`domContentLoaded` 约 72ms -> 70ms，`first-contentful-paint` 约 84ms；登录页额外加载 `browser-auth.js`，`domContentLoaded` 约 14ms -> 32ms。

- 登录页也改成了按需加载 auth 模块，首屏初始 JS 请求从 2 个降到 1 个，`browser-auth.js` 不再进入 login 页的首屏关键路径。
- 最新本地 headless 测速：登录页 `domContentLoaded` 约 30ms，`first-contentful-paint` 约 40ms；首页仍保持 1 个初始 JS 请求，性能波动主要在几毫秒级。

