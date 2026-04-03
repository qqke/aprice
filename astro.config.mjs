import { defineConfig } from 'astro/config';

const repoBase = process.env.ASTRO_BASE_PATH || '/aprice/';

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://example.github.io/aprice',
  base: repoBase,
  trailingSlash: 'always',
  output: 'static',
});
