import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const schemaSql = await readFile(resolve(root, 'supabase/schema.sql'), 'utf8');
const migrationsSql = [
  await readFile(resolve(root, 'supabase/migrations/20260515120000_credit_commercialization.sql'), 'utf8'),
].join('\n');
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

console.log('supabase commercial security test passed');
