#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';

/**
 * `pnpm scan` — the full health scan, in order:
 *
 *   1. lint        ESLint
 *   2. typecheck   tsc --noEmit (strict)
 *   3. audit       pnpm audit, prod deps, fails on high/critical only
 *   4. test        Vitest unit suite
 *   5. build       production `next build`
 *
 * Every step runs even when an earlier one fails, so one run yields the
 * complete picture; the summary at the end lists per-step results and
 * the process exits non-zero if anything failed.
 *
 * `pnpm scan --e2e` appends the Playwright smoke suite (needs the
 * chromium browser installed: `pnpm exec playwright install chromium`).
 */

interface ScanStep {
  name: string;
  command: string;
  args: string[];
}

const steps: ScanStep[] = [
  { name: 'lint', command: 'pnpm', args: ['lint'] },
  { name: 'typecheck', command: 'pnpm', args: ['typecheck'] },
  { name: 'audit', command: 'pnpm', args: ['audit', '--prod', '--audit-level=high'] },
  { name: 'test', command: 'pnpm', args: ['test'] },
  { name: 'build', command: 'pnpm', args: ['build'] },
];

if (process.argv.includes('--e2e')) {
  steps.push({ name: 'e2e', command: 'pnpm', args: ['test:e2e'] });
}

interface StepResult {
  name: string;
  ok: boolean;
  seconds: number;
}

const results: StepResult[] = [];

for (const step of steps) {
  process.stdout.write(`\n━━━ scan: ${step.name} ━━━\n`);
  const startedAt = Date.now();
  const { status } = spawnSync(step.command, step.args, { stdio: 'inherit' });
  results.push({
    name: step.name,
    ok: status === 0,
    seconds: Math.round((Date.now() - startedAt) / 1000),
  });
}

process.stdout.write('\n━━━ scan summary ━━━\n');
for (const result of results) {
  const mark = result.ok ? '✅' : '❌';
  process.stdout.write(`${mark}  ${result.name.padEnd(10)} ${result.seconds}s\n`);
}

const failed = results.filter((result) => !result.ok);
if (failed.length > 0) {
  process.stdout.write(
    `\n${failed.length} step(s) failed: ${failed.map((f) => f.name).join(', ')}\n`,
  );
  process.exit(1);
}
process.stdout.write('\nAll steps passed.\n');
