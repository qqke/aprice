import { spawn } from 'node:child_process';
import os from 'node:os';

const tests = [
  'tests/auth/browser/admin-page-browser.test.mjs',
  'tests/scan-page-browser.test.mjs',
  'tests/auth/browser/product-runtime-entry-browser.test.mjs',
  'tests/auth/browser/product-page-browser.test.mjs',
  'tests/home-page-browser.test.mjs',
  'tests/me-page-browser.test.mjs',
  'tests/auth/browser/login-page-browser.test.mjs',
  'tests/shell-auth-browser.test.mjs',
  'tests/auth/pure/auth-redirect-sync.test.cjs',
  'tests/auth/pure/login-page-state-sync.test.cjs',
  'tests/auth/pure/private-page-auth-sync.test.cjs',
  'tests/auth/pure/auth-redirect.test.mjs',
  'tests/auth/pure/login-page-state.test.mjs',
  'tests/auth/pure/private-page-auth.test.mjs',
  'tests/supabase-rest.test.mjs',
  'tests/browser-auth.test.mjs',
  'tests/middleware.test.mjs',
  'tests/browser-runtime.test.mjs',
  'tests/browser-price-rpc.test.mjs',
  'tests/no-relative-browser-imports.test.mjs',
  'tests/built-home-page-smoke.mjs',
  'tests/built-login-page-smoke.mjs',
  'tests/built-404-page-smoke.mjs',
];

const parsedConcurrency = Number.parseInt(process.env.TEST_CONCURRENCY || '', 10);
const maxConcurrency = Number.isFinite(parsedConcurrency) && parsedConcurrency > 0
  ? parsedConcurrency
  : Math.min(4, Math.max(2, os.availableParallelism?.() || os.cpus().length || 2));

function runTest(testPath) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [testPath], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = [];

    child.stdout.on('data', (chunk) => output.push(chunk));
    child.stderr.on('data', (chunk) => output.push(chunk));
    child.on('error', (error) => {
      output.push(Buffer.from(`${error.stack || error.message || error}\n`));
    });
    child.on('close', (code, signal) => {
      resolve({
        testPath,
        code,
        signal,
        output: Buffer.concat(output).toString('utf8').trim(),
        seconds: (Date.now() - startedAt) / 1000,
      });
    });
  });
}

async function runAll() {
  console.log(`Running ${tests.length} test files with concurrency ${maxConcurrency}`);

  const queue = [...tests];
  const results = [];
  let failed = false;

  async function worker() {
    while (queue.length > 0) {
      const testPath = queue.shift();
      const result = await runTest(testPath);
      results.push(result);

      const status = result.code === 0 ? 'PASS' : 'FAIL';
      console.log(`${status} ${testPath} ${result.seconds.toFixed(2)}s`);
      if (result.output) {
        console.log(result.output);
      }
      if (result.code !== 0) {
        failed = true;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(maxConcurrency, tests.length) }, () => worker()));

  const slowest = [...results].sort((a, b) => b.seconds - a.seconds).slice(0, 8);
  console.log('\nSlowest test files:');
  for (const result of slowest) {
    console.log(`${result.seconds.toFixed(2).padStart(6)}s  ${result.testPath}`);
  }

  if (failed) {
    process.exitCode = 1;
  }
}

runAll().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
