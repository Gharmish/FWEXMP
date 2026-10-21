import { describe, expect, it } from 'vitest';
import { liveGateBlocker, type LiveGateCandidate } from './live-gate';

const ready = (over: Partial<LiveGateCandidate> = {}): LiveGateCandidate => ({
  hostVerificationStatus: 'verified',
  heroImage: 'https://cdn.example/hero.webp',
  titleEn: 'Sunrise coffee walk',
  descriptionEn: 'Walk the old town at dawn.',
  titleAr: 'جولة قهوة الفجر',
  descriptionAr: 'نمشي في البلد القديمة.',
  inclusions: ['Coffee'],
  inclusionsAr: ['قهوة'],
  whatToBring: ['Hat'],
  whatToBringAr: ['قبعة'],
  moments: [{ titleAr: 'الانطلاق', descriptionAr: 'نلتقي عند الساحة.' }],
  ...over,
});

describe('liveGateBlocker', () => {
  it('passes a complete listing under a verified host', () => {
    expect(liveGateBlocker(ready())).toBeNull();
  });

  it.each<[Partial<LiveGateCandidate>, string]>([
    [{ hostVerificationStatus: 'suspended' }, 'host_suspended'],
    [{ heroImage: null }, 'needs_hero'],
    [{ titleAr: 'TODO(ar): pending translation' }, 'needs_arabic'],
    [{ descriptionAr: 'TODO(ar)' }, 'needs_arabic'],
    [{ titleEn: '   ' }, 'needs_english'],
    [{ inclusions: [], inclusionsAr: ['قهوة'] }, 'needs_english'],
    [{ moments: [{ titleAr: 'TODO(ar): x', descriptionAr: 'y' }] }, 'needs_arabic_moments'],
    [{ inclusionsAr: [] }, 'needs_arabic_lists'],
    [{ whatToBringAr: [] }, 'needs_arabic_lists'],
    [{ hostVerificationStatus: 'pending' }, 'host_unverified'],
  ])('%o → %s', (over, blocker) => {
    expect(liveGateBlocker(ready(over))).toBe(blocker);
  });

  it('reports the host block before any content block, and the content before verification', () => {
    expect(liveGateBlocker(ready({ hostVerificationStatus: 'suspended', heroImage: null }))).toBe(
      'host_suspended',
    );
    expect(liveGateBlocker(ready({ hostVerificationStatus: 'pending', heroImage: null }))).toBe(
      'needs_hero',
    );
  });

  it('allows empty lists on both sides', () => {
    expect(
      liveGateBlocker(
        ready({ inclusions: [], inclusionsAr: [], whatToBring: [], whatToBringAr: [] }),
      ),
    ).toBeNull();
  });
});
