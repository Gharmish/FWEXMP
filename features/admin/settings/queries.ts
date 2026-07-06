/**
 * Admin surface for platform settings. The READ model moved to
 * `@/lib/platform-settings` (2026-07 audit M8 — it is core domain
 * config consumed far beyond admin); it is re-exported here so the
 * admin pages keep one import for settings + guard. The WRITE side
 * (the upsert) lives in the companion `actions.ts`.
 */
export {
  DEFAULT_SETTINGS,
  getEnabledCategories,
  getPlatformSettings,
  type PlatformSettings,
} from '@/lib/platform-settings';

export { isAdminAndDbReady } from '@/features/admin/guard';
export type { AdminGuardFailure } from '@/features/admin/guard';
