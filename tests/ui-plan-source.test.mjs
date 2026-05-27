import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const globalCss = await readFile('src/styles/global.css', 'utf8');

const tooSmallFontSizes = [];
globalCss.split(/\r?\n/).forEach((line, index) => {
  for (const match of line.matchAll(/font-size:\s*(0?\.\d+)rem\b/g)) {
    const value = Number.parseFloat(match[1]);
    if (value < 0.75) {
      tooSmallFontSizes.push(`${index + 1}: ${match[0]}`);
    }
  }
});

assert.equal(
  tooSmallFontSizes.length,
  0,
  `Plan.md requires a 0.75rem minimum font size. Found:\n${tooSmallFontSizes.join('\n')}`,
);

console.log('ui plan source test passed');
