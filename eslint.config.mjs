import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    '.claude/**',
    // Agent-tooling skill templates dropped into the worktree — not app code.
    '.agents/**',
    // `vercel build`/`vercel pull` artifacts — generated, never linted.
    '.vercel/**',
    'out/**',
    'build/**',
    // Vitest coverage HTML report (`pnpm test:coverage`) — generated, never linted.
    'coverage/**',
    'test-results/**',
    'playwright-report/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
