import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Vitest config for unit tests against pure helpers (search/filter,
 * aggregate, slug derivation, formatters). Node env — no jsdom, no
 * React. When we add component tests later we'll split into project
 * configs ('node' for helpers, 'jsdom' for components).
 *
 * The `@/` alias mirrors tsconfig.json so test imports resolve the
 * same way the app does. Kept inline rather than pulling in
 * vite-tsconfig-paths — one fewer dep to keep current.
 */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': projectRoot,
    },
  },
  test: {
    environment: 'node',
    // `*.test.ts` picks up root-level test files (proxy.test.ts — the
    // edge auth-gate tests). Before it was added, that file existed on
    // disk but was silently excluded from every `pnpm test` run.
    // `app/**` covers route-handler tests (the release-holds cron).
    include: ['*.test.ts', 'app/**/*.test.ts', 'features/**/*.test.ts', 'lib/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**', 'db/migrations/**', '.claude/**'],
    reporters: ['default'],
  },
});
