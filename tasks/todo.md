# 任务清单

- [x] 盘点现有 Supabase Auth 魔法链接调用链和受影响页面
- [x] 将浏览器认证封装改成邮箱密码注册、登录、找回密码和更新密码
- [x] 重写登录页为邮箱密码注册 / 登录 / 忘记密码 / 重置密码流程
- [x] 接通顶部会话状态刷新与登出后的 UI 更新
- [x] 更新浏览器测试和运行时测试，覆盖新 auth 方法和页面文案
- [x] 运行 typecheck / lint / test / build 并修复问题

## Review

- 认证主流程已从 magic link 切换为邮箱密码登录 / 注册 / 找回密码，并且已通过 `npm run check`、`npm test`、`npm run build` 验证。
- 登录页、顶栏会话徽章、退出登录和恢复密码回调都已接通，旧的 `signInWithOtp` 调用和 magic link 文案已清理。
- `npm run check` 仍保留了 `tests/admin-page-browser.test.mjs` 的 3 条 TypeScript hint，但没有阻断构建或测试。
