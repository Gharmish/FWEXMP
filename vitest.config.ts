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
      // `import 'server-only'` is a Next.js build-time guard with no npm
      // package to resolve under Node — stub it so server modules (e.g. the
      // invoice PDF renderer) are unit-testable.
      'server-only': path.join(projectRoot, 'test/server-only-stub.ts'),
    },
  },
  test: {
    environment: 'node',
    // `*.test.ts` picks up root-level test files (proxy.test.ts — the
    // edge auth-gate tests). Before it was added, that file existed on
    // disk but was silently excluded from every `pnpm test` run.
    // `app/**` covers route-handler tests (the release-holds cron).
    // Every co-located test file, wherever it lives (2026-09 engineering
    // audit TEST-08: the previous four-root allowlist silently ignored a
    // test under components/ or db/, and any .test.tsx).
    include: ['**/*.test.{ts,tsx}'],
    exclude: [
      'node_modules/**',
      '.next/**',
      'db/migrations/**',
      '.claude/**',
      'e2e/**',
      'coverage/**',
    ],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['app/**', 'components/**', 'features/**', 'lib/**', 'db/**'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', 'db/migrations/**'],
      // Baseline taken 2026-09-11 (engineering audit TEST-12): 21.8%
      // statements, 16.7% branches, 17.3% functions, 22.1% lines. The
      // thresholds sit just under it so CI fails only on a regression;
      // raise them as the suite grows.
      thresholds: { statements: 20, branches: 15, functions: 15, lines: 20 },
    },
  },
});
