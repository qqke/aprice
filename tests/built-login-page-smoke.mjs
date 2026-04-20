import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../dist/client/login/index.html', import.meta.url), 'utf8');

// 登录页的“返回首页继续搜索”应该能回到站点首页，子路径部署下允许两种已知输出。
assert.match(html, /<a class="button button--ghost" href="(?:\/aprice\/|\/)">返回首页继续搜索<\/a>/);

console.log('built-login smoke test passed');
