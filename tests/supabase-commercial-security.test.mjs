import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const schemaSql = await readFile(resolve(root, 'supabase/schema.sql'), 'utf8');
const migrationFiles = (await readdir(resolve(root, 'supabase/migrations')))
  .filter((file) => file.endsWith('.sql'))
  .sort();
const migrationsSql = (await Promise.all(
  migrationFiles.map((file) => readFile(resolve(root, 'supabase/migrations', file), 'utf8')),
)).join('\n');
const combinedSql = `${schemaSql}\n${migrationsSql}`.replace(/\s+/g, ' ').toLowerCase();

function assertContainsSql(fragment, message) {
  assert.ok(
    combinedSql.includes(fragment.replace(/\s+/g, ' ').toLowerCase()),
    message,
  );
}

for (const signature of [
  'public.create_product(jsonb)',
  'public.credit_balance(uuid)',
  'public.consume_credit(uuid, integer, text, text, uuid, text)',
  'public.consume_price_reference(text)',
  'public.app_setting_int(text, integer)',
  'public.try_promote_consensus_price(text, text, integer)',
]) {
  assertContainsSql(
    `revoke execute on function ${signature} from public, anon, authenticated;`,
    `${signature} should not be executable through public API roles`,
  );
}

for (const signature of [
  'public.fetch_credit_summary()',
  'public.record_product_search(jsonb)',
  'public.claim_random_price_task(jsonb)',
  'public.skip_price_task(jsonb)',
  'public.admin_update_app_setting(jsonb)',
  'public.admin_adjust_credits(jsonb)',
  'public.submit_store_price(jsonb)',
  'public.fetch_product_prices(jsonb)',
  'public.fetch_product_prices_page(jsonb)',
]) {
  assertContainsSql(
    `grant execute on function ${signature} to authenticated;`,
    `${signature} should be explicitly granted only to authenticated callers`,
  );
}

assertContainsSql(
  'grant execute on function public.fetch_app_settings() to anon, authenticated;',
  'public app settings read RPC should remain explicitly callable',
);

assertContainsSql(
  'create policy "prices admin read" on prices for select using (is_admin_user());',
  'direct prices table reads should be limited to admins so price access goes through metered RPC',
);
assert.doesNotMatch(
  combinedSql,
  /create policy "prices authenticated read" on (?:public\.)?prices for select using \(auth\.uid\(\) is not null/i,
  'prices table should not be directly readable by every authenticated user',
);

for (const functionName of ['consume_credit', 'consume_price_reference', 'record_product_search']) {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${functionName}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
    'i',
  );
  const match = schemaSql.match(pattern);
  assert.ok(match, `${functionName} should exist in schema.sql`);
  assert.match(
    match[1],
    /pg_advisory_xact_lock\s*\(\s*hashtextextended\s*\(\s*target_user_id::text\s*,\s*0\s*\)\s*\)/i,
    `${functionName} should serialize credit usage by user`,
  );
}

function lastFunctionBody(sql, name) {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${name}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
    'gi',
  );
  const matches = Array.from(sql.matchAll(pattern));
  return matches.at(-1)?.[1] || '';
}

for (const source of [
  ['schema.sql', schemaSql],
  ['migrations', migrationsSql],
]) {
  const [label, sql] = source;
  const body = lastFunctionBody(sql, 'submit_store_price');
  assert.ok(body, `${label} should define submit_store_price`);
  assert.match(
    body,
    /submitter_is_admin\s*:=\s*should_share\s+and\s+public\.is_admin_user\(\)/i,
    `${label} submit_store_price should detect admin public submissions`,
  );
  assert.match(
    body,
    /case\s+when\s+submitter_is_admin\s+then\s+'approved'\s+when\s+should_share\s+then\s+'pending'\s+else\s+'private'\s+end/i,
    `${label} submit_store_price should auto-approve admin public submissions and keep member submissions pending`,
  );
  assert.doesNotMatch(
    body,
    /try_promote_consensus_price/i,
    `${label} submit_store_price should leave public submissions pending for admin review`,
  );
  assert.match(
    body,
    /insert\s+into\s+public\.prices/i,
    `${label} submit_store_price should promote admin-approved submissions into public prices`,
  );
}

for (const source of [
  ['schema.sql', schemaSql],
  ['migrations', migrationsSql],
]) {
  const [label, sql] = source;
  const body = lastFunctionBody(sql, 'consume_price_reference');
  assert.ok(body, `${label} should define consume_price_reference`);
  assert.match(
    body,
    /if\s+public\.is_admin_user\(\)\s+then[\s\S]*'admin_exempt'\s*,\s*true[\s\S]*return\s+jsonb_build_object/i,
    `${label} consume_price_reference should return an admin_exempt credit payload for admins`,
  );
  const adminBranch = body.match(/if\s+public\.is_admin_user\(\)\s+then([\s\S]*?)end\s+if;/i)?.[1] || '';
  assert.doesNotMatch(
    adminBranch,
    /insert\s+into\s+public\.price_reference_logs|consume_credit/i,
    `${label} admin price references should not write usage logs or consume credits`,
  );
}

console.log('supabase commercial security test passed');
