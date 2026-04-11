import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const scanRoots = ['src/pages', 'src/layouts'];
const scriptPattern = /<script\b[^>]*type=["']module["'][^>]*is:inline[^>]*>([\s\S]*?)<\/script>/g;
const badPattern = /from\s+['"](?:\.\.\/)+lib\/browser\.js['"]/g;

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else if (entry.isFile() && /\.(astro|m?js|ts)$/.test(entry.name)) {
      yield fullPath;
    }
  }
}

const failures = [];

for (const scanRoot of scanRoots) {
  for await (const filePath of walk(join(root, scanRoot))) {
    const source = await readFile(filePath, 'utf8');
    for (const scriptMatch of source.matchAll(scriptPattern)) {
      const scriptSource = scriptMatch[1] || '';
      const matches = scriptSource.match(badPattern);
      if (matches) {
        failures.push(`${filePath}: ${matches.join(', ')}`);
      }
    }
  }
}

if (failures.length) {
  throw new Error(`Found relative browser imports in inline module scripts:\n${failures.join('\n')}`);
}

console.log('no-relative-browser-imports test passed');
