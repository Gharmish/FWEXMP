import { describe, expect, it } from 'vitest';

import { hostMirrorPatch } from './host-mirror';

/**
 * The account page of a host must show the same details as their host
 * profile — but only where the guest row still holds a placeholder.
 */
const PHONE = '+966551595950';

const host = {
  name: 'AURA| أورا',
  contactEmail: 'host@example.com',
  photoUrl: 'https://x.supabase.co/storage/v1/object/public/photos/h1/face.webp',
};

describe('hostMirrorPatch', () => {
  it('fills every placeholder from the host profile', () => {
    expect(hostMirrorPatch({ name: PHONE, email: null, avatarUrl: null }, host, PHONE)).toEqual({
      name: host.name,
      email: host.contactEmail,
      avatarUrl: host.photoUrl,
    });
  });

  it('never overwrites a name, email or photo the guest set themselves', () => {
    expect(
      hostMirrorPatch(
        { name: 'Abdulaziz', email: 'me@example.com', avatarUrl: 'https://cdn/avatar.jpg' },
        host,
        PHONE,
      ),
    ).toEqual({});
  });

  it('treats an empty name like the placeholder', () => {
    expect(
      hostMirrorPatch({ name: '  ', email: 'me@example.com', avatarUrl: 'x' }, host, PHONE),
    ).toEqual({ name: host.name });
  });

  it('leaves the placeholder alone when the host has nothing better', () => {
    expect(
      hostMirrorPatch(
        { name: PHONE, email: null, avatarUrl: null },
        { name: '  ', contactEmail: null, photoUrl: null },
        PHONE,
      ),
    ).toEqual({});
  });

  it('never puts back an email or photo the guest removed after the first fill', () => {
    // The first read mirrored all three; the guest then cleared the email
    // and deleted the photo on the account page.
    expect(hostMirrorPatch({ name: host.name, email: null, avatarUrl: null }, host, PHONE)).toEqual(
      {},
    );
    // Same for a guest who named themselves and keeps the rest empty.
    expect(
      hostMirrorPatch({ name: 'Abdulaziz', email: null, avatarUrl: null }, host, PHONE),
    ).toEqual({});
  });

  it('is idempotent once the guest row already mirrors the host', () => {
    expect(
      hostMirrorPatch(
        { name: host.name, email: host.contactEmail, avatarUrl: host.photoUrl },
        host,
        PHONE,
      ),
    ).toEqual({});
  });
});
