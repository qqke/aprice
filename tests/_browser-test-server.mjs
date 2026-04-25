import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { extname, normalize, resolve } from 'node:path';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

const staticAssetCache = new Map();

function toFilePath(distRoot, urlPath) {
  const cleanPath = decodeURIComponent(String(urlPath || '/').split('?')[0].split('#')[0]).replace(/^\/+/, '');
  const strippedPath = cleanPath.startsWith('aprice/') ? cleanPath.slice('aprice/'.length) : cleanPath;
  if (strippedPath === 'lib/browser.js') return resolve(distRoot, 'browser.js');
  if (strippedPath === 'lib/browser-auth.js') return resolve(distRoot, 'browser-auth.js');
  if (strippedPath === 'lib/supabase-rest.js') return resolve(distRoot, 'supabase-rest.js');
  const joined = normalize(resolve(distRoot, strippedPath || 'index.html'));
  if (!joined.startsWith(normalize(distRoot))) return null;
  return joined;
}

export async function startStaticServer({ distRoot = resolve(process.cwd(), 'dist', 'client') } = {}) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      let pathname = url.pathname;
      if (pathname === '/' || pathname === '/aprice/') pathname = '/index.html';
      if (pathname.endsWith('/')) pathname += 'index.html';

      const filePath = toFilePath(distRoot, pathname);
      if (!filePath) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      let finalPath = filePath;
      try {
        const fileStat = await stat(finalPath);
        if (fileStat.isDirectory()) finalPath = resolve(finalPath, 'index.html');
      } catch {
        if (pathname === '/index.html' || pathname === '/aprice/index.html') {
          throw new Error('dist not built');
        }
        finalPath = resolve(distRoot, 'index.html');
      }

      let cached = staticAssetCache.get(finalPath);
      if (!cached) {
        cached = {
          body: await readFile(finalPath),
          type: mimeTypes[extname(finalPath)] || 'application/octet-stream',
        };
        staticAssetCache.set(finalPath, cached);
      }

      res.writeHead(200, { 'Content-Type': cached.type });
      res.end(cached.body);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(String(error.message || error));
    }
  });

  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const address = server.address();
  if (!address || typeof address !== 'object') {
    server.close();
    throw new Error('static server did not start');
  }

  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function getFreePort() {
  const server = createNetServer();
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const address = server.address();
  server.close();
  if (!address || typeof address !== 'object') {
    throw new Error('failed to acquire a free port');
  }
  return address.port;
}

export async function startBuiltServer({ distRoot = resolve(process.cwd(), 'dist') } = {}) {
  const entryPath = resolve(distRoot, 'server', 'entry.mjs');
  const port = await getFreePort();
  const child = spawn(process.execPath, [entryPath], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logs = [];
  child.stdout.on('data', (chunk) => logs.push(String(chunk)));
  child.stderr.on('data', (chunk) => logs.push(String(chunk)));

  const baseUrl = `http://127.0.0.1:${port}`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    if (child.exitCode !== null) {
      break;
    }
    try {
      const response = await fetch(baseUrl, { method: 'GET' });
      if (response.ok || response.status === 404) {
        return {
          server: {
            close() {
              child.kill();
            },
          },
          baseUrl,
        };
      }
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }

  child.kill();
  throw new Error(`standalone server did not start: ${logs.join('\n') || 'no logs'}`);
}
