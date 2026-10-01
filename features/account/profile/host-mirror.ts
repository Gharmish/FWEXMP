import type { Guest, Host } from '@/db/schema';

/**
 * A host is also a guest of the marketplace: the same sign-in reaches
 * /me/profile and /host/profile. The `guests` row behind the account
 * page is minted lazily with placeholders (the phone as the name, no
 * email, no photo), so a verified host who had never booked opened an
 * account page that knew nothing about them while their host profile
 * carried a name, a photo and a contact address (2026-10-01).
 *
 * Mirror the host's authored details onto the guest row — but only onto
 * the fields that still hold a placeholder. A name, email or photo the
 * guest set on the account page is theirs and always wins; this never
 * overwrites a real value, so it is safe to run on every profile read.
 */
export type HostMirrorPatch = Partial<Pick<Guest, 'name' | 'email' | 'avatarUrl'>>;

export function hostMirrorPatch(
  guest: Pick<Guest, 'name' | 'email' | 'avatarUrl'>,
  host: Pick<Host, 'name' | 'contactEmail' | 'photoUrl'>,
  /** The name the guest row was seeded with — the only name treated as empty. */
  placeholderName: string,
): HostMirrorPatch {
  const patch: HostMirrorPatch = {};

  const guestName = guest.name.trim();
  const hostName = host.name.trim();
  const nameIsPlaceholder = guestName === '' || guestName === placeholderName;
  if (nameIsPlaceholder && hostName !== '' && hostName !== guestName) {
    patch.name = hostName;
  }

  const hostEmail = host.contactEmail?.trim() ?? '';
  if (!guest.email && hostEmail !== '') {
    patch.email = hostEmail;
  }

  if (!guest.avatarUrl && host.photoUrl) {
    patch.avatarUrl = host.photoUrl;
  }

  return patch;
}
