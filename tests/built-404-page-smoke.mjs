import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../dist/404.html', import.meta.url), 'utf8');

// 404 页的主入口必须始终带上仓库 base，避免本地和 GitHub Pages 出现路径不一致。
assert.match(html, /href="\/aprice\/"/);
assert.match(html, /href="\/aprice\/scan\/"/);
assert.match(html, /href="\/aprice\/me\/"/);
assert.match(html, /href="\/aprice\/login\/"/);

console.log('built-404 smoke test passed');
