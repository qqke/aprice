import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
assert.ok(html.includes('window.__APriceConfig = { baseUrl, supabaseUrl, supabaseAnonKey };'), 'config injection missing from dist/index.html');

const startMarker = html.indexOf('fetchNearbyPrices');
assert.ok(startMarker >= 0, 'home module script not found in dist/index.html');
const scriptStart = html.lastIndexOf('<script type="module">', startMarker);
assert.ok(scriptStart >= 0, 'home module script start not found');
const scriptEnd = html.indexOf('</script>', startMarker);
assert.ok(scriptEnd >= 0, 'home module script end not found');

let script = html.slice(scriptStart + '<script type="module">'.length, scriptEnd).trim();
script = script.split("await import(window.__APriceConfig?.browserJsUrl || (window.__APriceConfig?.baseUrl || '/') + 'browser.js');").join("await import('../public/browser.js');");

function makeElement(initial = {}) {
  return {
    textContent: initial.textContent || '',
    innerHTML: initial.innerHTML || '',
    value: initial.value || '',
    disabled: false,
    className: initial.className || '',
    href: initial.href || '',
    dataset: initial.dataset || {},
    listeners: {},
    addEventListener(event, handler) {
      this.listeners[event] ??= [];
      this.listeners[event].push(handler);
    },
    querySelector() { return null; },
  };
}

const nodes = {
  '#home-search-form': makeElement(),
  '#home-search': makeElement({ value: '' }),
  '#home-search-button': makeElement(),
  '#search-results': makeElement(),
  '#search-status': makeElement(),
  '#geolocate-home': makeElement(),
  '#nearby-status': makeElement({ textContent: '先搜索商品，再查看附近价格。' }),
  '#nearby-results': makeElement(),
  '#recently-viewed': makeElement(),
  '#recent-status': makeElement(),
  '#load-recent-prices': makeElement(),
};

const fetchLog = [];
globalThis.__APriceConfig = {
  baseUrl: '/aprice/',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key',
};

globalThis.fetch = async (input) => {
  const url = String(input);
  fetchLog.push(url);
  if (url.includes('/rest/v1/products')) {
    return new Response(
      JSON.stringify([
        {
          id: 'loxonin-s',
          name: 'Loxonin S',
          brand: 'Santen',
          pack: '12 tabs',
          barcode: '4987188161027',
        },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (url.includes('/rest/v1/prices')) {
    return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
};

Object.defineProperty(globalThis, 'navigator', { value: { geolocation: null }, configurable: true });

globalThis.window = {
  location: { origin: 'http://127.0.0.1:4321' },
  addEventListener() {},
  localStorage: {
    getItem() { return null; },
    setItem() {},
  },
};

globalThis.document = {
  querySelector(selector) {
    return nodes[selector] || null;
  },
};

await eval(`(async () => { ${script} })()`);

assert.equal(fetchLog.length, 0);

nodes['#home-search'].value = 'ロキソ';
for (const handler of nodes['#home-search-form'].listeners.submit || []) {
  await handler({ preventDefault() {} });
}

await new Promise((resolve) => setTimeout(resolve, 0));
await new Promise((resolve) => setTimeout(resolve, 0));
await new Promise((resolve) => setTimeout(resolve, 0));

assert.match(nodes['#search-status'].textContent, /找到 1 条匹配结果/);
assert.match(nodes['#search-results'].innerHTML, /Loxonin S/);
assert.match(nodes['#nearby-status'].textContent, /暂无价格记录/);
assert.match(nodes['#nearby-results'].innerHTML, /当前还没有价格记录/);
assert.match(fetchLog.join('\n'), /\/rest\/v1\/products/);
assert.match(fetchLog.join('\n'), /\/rest\/v1\/prices/);

for (const handler of nodes['#load-recent-prices'].listeners.click || []) {
  await handler();
}

await new Promise((resolve) => setTimeout(resolve, 0));
await new Promise((resolve) => setTimeout(resolve, 0));

assert.match(nodes['#recent-status'].textContent, /暂无最近价格采样/);
assert.match(nodes['#recently-viewed'].innerHTML, /暂无采样/);

console.log('built-home smoke test passed');