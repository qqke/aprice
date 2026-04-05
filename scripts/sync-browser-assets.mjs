import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();

function normalize(source) {
  return source.replace(/\r\n/g, '\n');
}

function replaceOrThrow(source, search, replacement, label) {
  const next = source.replace(search, replacement);
  if (next === source) {
    throw new Error(`Failed to replace ${label}`);
  }
  return next;
}

function makeBrowserBrowserJs(source) {
  let output = normalize(source);
  output = replaceOrThrow(output, "\nimport { createClient } from '@supabase/supabase-js';\n", '\n', 'createClient import');
  output = replaceOrThrow(
    output,
    "const runtimeConfig = globalThis.__APriceConfig || {};\n// 这些默认值只覆盖公共 anon 配置，优先级仍然是环境变量 > 运行时注入 > 仓库默认值。\nconst DEFAULT_SUPABASE_URL = 'https://tplkpguxlvrhxassyjfm.supabase.co';\nconst DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_LVrlFNcZCGnBoji9Hw9gcQ_ELbcv1BT';\nconst SUPABASE_URL = String(import.meta.env?.PUBLIC_SUPABASE_URL || runtimeConfig.supabaseUrl || DEFAULT_SUPABASE_URL).trim();\nconst SUPABASE_ANON_KEY = String(import.meta.env?.PUBLIC_SUPABASE_ANON_KEY || runtimeConfig.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY).trim();\nconst BASE_URL = String(import.meta.env?.BASE_URL || runtimeConfig.baseUrl || '/').trim() || '/';\n",
    "const CONFIG = globalThis.__APriceConfig || {};\nconst DEFAULT_SUPABASE_URL = 'https://tplkpguxlvrhxassyjfm.supabase.co';\nconst DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_LVrlFNcZCGnBoji9Hw9gcQ_ELbcv1BT';\nconst SUPABASE_URL = String(CONFIG.supabaseUrl || DEFAULT_SUPABASE_URL).trim();\nconst SUPABASE_ANON_KEY = String(CONFIG.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY).trim();\nconst BASE_URL = String(CONFIG.baseUrl || '/').trim() || '/';\n",
    'browser env config block',
  );
  output = replaceOrThrow(
    output,
    "  if (!supabaseClientPromise) {\n    supabaseClientPromise = Promise.resolve(\n      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {\n        auth: {\n          persistSession: true,\n          autoRefreshToken: true,\n          detectSessionInUrl: true,\n        },\n      }),\n    );\n  }\n",
    "  if (!supabaseClientPromise) {\n    supabaseClientPromise = import('https://esm.sh/@supabase/supabase-js@2.49.1').then(({ createClient }) =>\n      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {\n        auth: {\n          persistSession: true,\n          autoRefreshToken: true,\n          detectSessionInUrl: true,\n        },\n      }),\n    );\n  }\n",
    'browser client bootstrap',
  );
  if (output.includes('import.meta.env')) {
    throw new Error('browser.js still contains import.meta.env');
  }
  return output;
}

function makeBrowserRestJs(source) {
  let output = normalize(source);
  output = replaceOrThrow(
    output,
    "const runtimeConfig = globalThis.__APriceConfig || {};\n// 这些默认值只覆盖公共 anon 配置，优先级仍然是环境变量 > 运行时注入 > 仓库默认值。\nconst DEFAULT_SUPABASE_URL = 'https://tplkpguxlvrhxassyjfm.supabase.co';\nconst DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_LVrlFNcZCGnBoji9Hw9gcQ_ELbcv1BT';\nconst SUPABASE_URL = String(import.meta.env?.PUBLIC_SUPABASE_URL || runtimeConfig.supabaseUrl || DEFAULT_SUPABASE_URL).trim();\nconst SUPABASE_ANON_KEY = String(import.meta.env?.PUBLIC_SUPABASE_ANON_KEY || runtimeConfig.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY).trim();\n",
    "const CONFIG = globalThis.__APriceConfig || {};\nconst DEFAULT_SUPABASE_URL = 'https://tplkpguxlvrhxassyjfm.supabase.co';\nconst DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_LVrlFNcZCGnBoji9Hw9gcQ_ELbcv1BT';\nconst SUPABASE_URL = String(CONFIG.supabaseUrl || DEFAULT_SUPABASE_URL).trim();\nconst SUPABASE_ANON_KEY = String(CONFIG.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY).trim();\n",
    'rest env config block',
  );
  if (output.includes('import.meta.env')) {
    throw new Error('supabase-rest.js still contains import.meta.env');
  }
  return output;
}

const browserSource = await readFile(resolve(root, 'src/lib/browser.js'), 'utf8');
const restSource = await readFile(resolve(root, 'src/lib/supabase-rest.js'), 'utf8');

await writeFile(resolve(root, 'public/browser.js'), makeBrowserBrowserJs(browserSource));
await writeFile(resolve(root, 'public/supabase-rest.js'), makeBrowserRestJs(restSource));
