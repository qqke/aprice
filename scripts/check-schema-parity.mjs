import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const schemaPath = resolve(root, 'supabase/schema.sql');
const migrationsDir = resolve(root, 'supabase/migrations');

function normalizeSql(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/--.*$/gm, '');
}

function collectRegexMatches(source, pattern, groupIndex = 1) {
  const matches = new Set();
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const value = (match[groupIndex] || '').trim().toLowerCase();
    if (value) matches.add(value);
  }
  return matches;
}

function collectRegexMatchesRaw(source, pattern, groupIndex = 1) {
  const matches = [];
  let match;
  while ((match = pattern.exec(source)) !== null) {
    matches.push(match[groupIndex] || '');
  }
  return matches;
}

function parseRequiredArtifacts(sql) {
  const userPriceLogColumns = new Set();
  const alterBlocks = collectRegexMatchesRaw(
    sql,
    /alter\s+table\s+public\.user_price_logs([\s\S]*?);/g,
    1,
  );
  for (const alterBlock of alterBlocks) {
    const columns = collectRegexMatches(
      alterBlock,
      /add\s+column\s+if\s+not\s+exists\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
    );
    columns.forEach((name) => userPriceLogColumns.add(name));
  }

  return {
    tables: collectRegexMatches(
      sql,
      /create\s+table\s+if\s+not\s+exists\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
    ),
    functions: collectRegexMatches(
      sql,
      /create\s+or\s+replace\s+function\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
    ),
    userPriceLogColumns,
  };
}

function parseSchemaArtifacts(sql) {
  return {
    tables: collectRegexMatches(
      sql,
      /create\s+table\s+if\s+not\s+exists\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
    ),
    functions: collectRegexMatches(
      sql,
      /create\s+or\s+replace\s+function\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
    ),
    userPriceLogColumns: collectRegexMatches(
      sql,
      /create\s+table\s+if\s+not\s+exists\s+user_price_logs\s*\(([\s\S]*?)\)\s*;/g,
      1,
    ),
  };
}

function extractColumnNamesFromTableBody(tableBodySql) {
  const columns = new Set();
  const lines = String(tableBodySql || '').split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('primary key')) continue;
    if (line.startsWith('unique')) continue;
    if (line.startsWith('constraint')) continue;
    if (line.startsWith('check')) continue;
    if (line.startsWith('references')) continue;
    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+/);
    if (match?.[1]) columns.add(match[1].toLowerCase());
  }
  return columns;
}

function setDiff(requiredSet, actualSet) {
  const missing = [];
  for (const item of requiredSet) {
    if (!actualSet.has(item)) missing.push(item);
  }
  return missing.sort();
}

async function main() {
  const schemaSql = normalizeSql(await readFile(schemaPath, 'utf8'));
  const migrationFiles = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const required = {
    tables: new Set(),
    functions: new Set(),
    userPriceLogColumns: new Set(),
  };

  for (const migrationFile of migrationFiles) {
    const migrationSql = normalizeSql(await readFile(resolve(migrationsDir, migrationFile), 'utf8'));
    const parsed = parseRequiredArtifacts(migrationSql);
    parsed.tables.forEach((name) => required.tables.add(name));
    parsed.functions.forEach((name) => required.functions.add(name));
    parsed.userPriceLogColumns.forEach((name) => required.userPriceLogColumns.add(name));
  }

  const schemaParsed = parseSchemaArtifacts(schemaSql);
  const schemaUserPriceLogColumns = extractColumnNamesFromTableBody(
    [...schemaParsed.userPriceLogColumns][0] || '',
  );

  const missingTables = setDiff(required.tables, schemaParsed.tables);
  const missingFunctions = setDiff(required.functions, schemaParsed.functions);
  const missingUserPriceLogColumns = setDiff(required.userPriceLogColumns, schemaUserPriceLogColumns);

  const failures = [];
  if (missingTables.length) {
    failures.push(`missing tables in schema.sql: ${missingTables.join(', ')}`);
  }
  if (missingFunctions.length) {
    failures.push(`missing functions in schema.sql: ${missingFunctions.join(', ')}`);
  }
  if (missingUserPriceLogColumns.length) {
    failures.push(`missing user_price_logs columns in schema.sql: ${missingUserPriceLogColumns.join(', ')}`);
  }

  if (failures.length) {
    console.error('[schema-parity] failed');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `[schema-parity] ok: ${required.tables.size} tables, ${required.functions.size} functions, ${required.userPriceLogColumns.size} user_price_logs migration columns`,
  );
}

main().catch((error) => {
  console.error('[schema-parity] unexpected error');
  console.error(error);
  process.exitCode = 1;
});
