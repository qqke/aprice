# 任务清单

- [x] 盘点现有 Supabase Auth 魔法链接调用链和受影响页面
- [x] 将浏览器认证封装改成邮箱密码注册、登录、找回密码和更新密码
- [x] 重写登录页为邮箱密码注册 / 登录 / 忘记密码 / 重置密码流程
- [x] 接通顶部会话状态刷新与登出后的 UI 更新
- [x] 更新浏览器测试和运行时测试，覆盖新 auth 方法和页面文案
- [x] 运行 typecheck / lint / test / build 并修复问题

## Review

- 认证主流程已从 magic link 切换为邮箱密码登录 / 注册 / 找回密码，并且已通过 `npm run check`、`npm test`、`npm run build` 验证。
- 会话感知的顶栏登录入口和登录页已补齐：已登录时显示退出/切换账号，返回登录页时隐藏注册登录表单。
- 登录页、顶栏会话徽章、退出登录和恢复密码回调都已接通，旧的 `signInWithOtp` 调用和 magic link 文案已清理。
- `npm run check` 仍保留了 `tests/admin-page-browser.test.mjs` 的 3 条 TypeScript hint，但没有阻断构建或测试。


- 这轮把全站状态文案再做了一次收尾清理，并同步更新了 	ests/me-page-browser.test.mjs 的断言，已通过 
pm run check、
pm test、
pm run build 验证。

- [ ] 统一全站视觉收尾：焦点态、悬停态、轻量动效和可访问性细节
- [ ] 校对登录 / 首页 / 个人页 / 商品页 / 管理页的交互反馈一致性
- [ ] 跑一轮 check / test / build 并修复问题

## Review


