# 任务清单

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

## Review

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

