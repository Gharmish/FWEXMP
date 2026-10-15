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
 * the fields that still hold a placeholder, and only while the account
 * page has never been personalised: the placeholder NAME is the marker.
 * Once the name is real (set by the guest, or filled by this very mirror)
 * nothing more is copied, so an email or photo the guest later REMOVES
 * stays removed — the per-field version put them back on the next page
 * load, because an emptied field is indistinguishable from a never-set
 * one (nightly bug hunt 2026-10-09). A name, email or photo the guest set
 * themselves always wins; this never overwrites a real value.
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
  if (!nameIsPlaceholder) return patch;
  if (hostName !== '' && hostName !== guestName) {
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
