import type { HostProfile } from '@/features/hosts/types';
import { hostSlug } from '@/features/hosts/lib/slug';

/**
 * In-repo host directory. The display names here match the host
 * objects embedded in features/experiences/lib/sample-data.ts — the
 * two are linked by `hostSlug(host.name)` on both sides.
 *
 * Languages are sample data; in the live system they come from
 * db/schema.ts `hosts.languages text[]`.
 *
 * Arabic bios are kept here verbatim (not authored by Claude) so the
 * profile page can show real Arabic copy. If we ever lose confidence
 * in these strings, swap them for TODO(ar): placeholders per BRIEF §4.
 */
const PHOTOS_BASE = 'https://xjgpflzkpydfpuomqhuq.supabase.co/storage/v1/object/public/photos';

const HOSTS: readonly HostProfile[] = [
  {
    slug: hostSlug('Abdulaziz Alasmari'),
    name: 'Abdulaziz Alasmari',
    bioEn:
      'A third-generation farmer from Habala who grew up among the juniper terraces. Abdulaziz hosts small groups to share Aseeri food, music, and the slow rhythm of mountain life.',
    bioAr:
      'مزارع من الجيل الثالث من الحبلة، نشأ بين مدرجات العرعر. يستضيف عبدالعزيز مجموعات صغيرة ليشاركهم طعام عسير وموسيقاها وإيقاع الحياة الجبلية الهادئ.',
    verified: true,
    languages: ['ar', 'en'],
    photoUrl: `${PHOTOS_BASE}/hosts/abdulaziz-alasmari/avatar.jpg`,
    joinedAt: '2025-08-01T00:00:00.000Z',
  },
  {
    slug: hostSlug('Asir Adventures Co.'),
    name: 'Asir Adventures Co.',
    bioEn:
      'A licensed Abha tourism operator specialising in guided mountain activities, with certified guides and full safety equipment.',
    bioAr:
      'شركة سياحية مرخصة في أبها متخصصة في الأنشطة الجبلية الموجهة، مع مرشدين معتمدين وتجهيزات سلامة كاملة.',
    verified: true,
    languages: ['ar', 'en'],
    photoUrl: `${PHOTOS_BASE}/hosts/asir-adventures-co/avatar.jpg`,
    joinedAt: '2025-09-15T00:00:00.000Z',
  },
];

export function getHostBySlug(slug: string): HostProfile | undefined {
  return HOSTS.find((h) => h.slug === slug);
}

export function getAllHostSlugs(): readonly string[] {
  return HOSTS.map((h) => h.slug);
}

export function getAllHosts(): readonly HostProfile[] {
  return HOSTS;
}
