/**
 * A person's identity is fragmented across three tables. The admin
 * "User 360" surface addresses a person by a composite key so it can
 * route to real accounts and to standalone rows alike:
 *
 *   - `auth_<supabaseAuthId>` — a signed-in account; merges the guest,
 *     host and application rows that share that auth id.
 *   - `guest_<guestId>` — a phone-only guest never claimed by an account.
 *   - `host_<hostId>` — a seeded host with no owning account.
 *
 * The prefix removes any ambiguity between a uuid that is a guest id vs
 * a host id, and keeps auth ids (which are not FKs anywhere) routable.
 *
 * The delimiter is `_` (an unreserved URL char), NOT `:`. A colon is a
 * reserved character that the i18n middleware leaves percent-encoded
 * (`%3A`) in the route param, so `parsePersonKey` would never find it
 * and every detail link 404'd. `_` needs no encoding, so the raw key
 * drops straight into the URL and comes back intact. The parser still
 * tolerates a legacy `:`/`%3A` so older links keep working.
 */
export type PersonKeyKind = 'auth' | 'guest' | 'host';

const KINDS: readonly PersonKeyKind[] = ['auth', 'guest', 'host'];

export interface PersonKey {
  kind: PersonKeyKind;
  id: string;
}

export function authKey(authUserId: string): string {
  return `auth_${authUserId}`;
}

export function guestKey(guestId: string): string {
  return `guest_${guestId}`;
}

export function hostKey(hostId: string): string {
  return `host_${hostId}`;
}

export function parsePersonKey(raw: string): PersonKey | null {
  // Defensive: a value that reached us still percent-encoded (e.g. an
  // old `%3A` colon link) decodes back to its delimiter here. Safe on
  // an already-decoded string — it just returns it unchanged.
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    value = raw;
  }

  for (const kind of KINDS) {
    for (const delim of ['_', ':'] as const) {
      const prefix = `${kind}${delim}`;
      if (value.startsWith(prefix)) {
        const id = value.slice(prefix.length);
        if (id) return { kind, id };
      }
    }
  }
  return null;
}
