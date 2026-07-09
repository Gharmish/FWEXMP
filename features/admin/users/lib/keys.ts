/**
 * A person's identity is fragmented across three tables. The admin
 * "User 360" surface addresses a person by a composite key so it can
 * route to real accounts and to standalone rows alike:
 *
 *   - `auth:<supabaseAuthId>` — a signed-in account; merges the guest,
 *     host and application rows that share that auth id.
 *   - `guest:<guestId>` — a phone-only guest never claimed by an account.
 *   - `host:<hostId>` — a seeded host with no owning account.
 *
 * The prefix removes any ambiguity between a uuid that is a guest id vs
 * a host id, and keeps auth ids (which are not FKs anywhere) routable.
 */
export type PersonKeyKind = 'auth' | 'guest' | 'host';

export interface PersonKey {
  kind: PersonKeyKind;
  id: string;
}

export function authKey(authUserId: string): string {
  return `auth:${authUserId}`;
}

export function guestKey(guestId: string): string {
  return `guest:${guestId}`;
}

export function hostKey(hostId: string): string {
  return `host:${hostId}`;
}

export function parsePersonKey(raw: string): PersonKey | null {
  const sep = raw.indexOf(':');
  if (sep <= 0) return null;
  const kind = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (!id) return null;
  if (kind === 'auth' || kind === 'guest' || kind === 'host') {
    return { kind, id };
  }
  return null;
}
