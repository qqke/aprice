import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../dist/login/index.html', import.meta.url), 'utf8');

// 登录页的“返回首页继续搜索”必须始终指向应用 base，避免子路径部署跳回站点根目录。
assert.match(html, /<a class="button button--ghost" href="\/aprice\/">返回首页继续搜索<\/a>/);

console.log('built-login smoke test passed');
