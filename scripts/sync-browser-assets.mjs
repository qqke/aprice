import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();

function normalize(source) {
  return source.replace(/\r\n/g, '\n');
}

function ensureNoImportMetaEnv(source, label) {
  if (source.includes('import.meta.env')) {
    throw new Error(`${label} still contains import.meta.env`);
  }
}

function makeBrowserRestJs(source) {
  let output = normalize(source);
  output = output.replace(
    "const runtimeConfig = globalThis.__APriceConfig || {};\nconst SUPABASE_URL = String(import.meta.env?.PUBLIC_SUPABASE_URL || runtimeConfig.supabaseUrl || '').trim();\nconst SUPABASE_ANON_KEY = String(import.meta.env?.PUBLIC_SUPABASE_ANON_KEY || runtimeConfig.supabaseAnonKey || '').trim();\n",
    "const CONFIG = globalThis.__APriceConfig || {};\nconst SUPABASE_URL = String(CONFIG.supabaseUrl || '').trim();\nconst SUPABASE_ANON_KEY = String(CONFIG.supabaseAnonKey || '').trim();\n",
  );
  ensureNoImportMetaEnv(output, 'supabase-rest.js');
  return output;
}

const browserSource = await readFile(resolve(root, 'src/lib/browser.js'), 'utf8');
const authRedirectSource = await readFile(resolve(root, 'src/lib/auth-redirect.js'), 'utf8');
const authSource = await readFile(resolve(root, 'src/lib/browser-auth.js'), 'utf8');
const loginPageStateSource = await readFile(resolve(root, 'src/lib/login-page-state.js'), 'utf8');
const privatePageAuthSource = await readFile(resolve(root, 'src/lib/private-page-auth.js'), 'utf8');
const restSource = await readFile(resolve(root, 'src/lib/supabase-rest.js'), 'utf8');

ensureNoImportMetaEnv(browserSource, 'browser.js source');
ensureNoImportMetaEnv(authSource, 'browser-auth.js source');

await writeFile(resolve(root, 'public/browser.js'), normalize(browserSource));
await writeFile(resolve(root, 'public/auth-redirect.js'), normalize(authRedirectSource));
await writeFile(resolve(root, 'public/browser-auth.js'), normalize(authSource));
await writeFile(resolve(root, 'public/login-page-state.js'), normalize(loginPageStateSource));
await writeFile(resolve(root, 'public/private-page-auth.js'), normalize(privatePageAuthSource));
await writeFile(resolve(root, 'public/supabase-rest.js'), makeBrowserRestJs(restSource));

