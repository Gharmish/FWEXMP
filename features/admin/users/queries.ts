import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { reportError } from '@/lib/log';
import {
  bookings,
  disputes,
  experiences,
  guests,
  hostApplicationDocuments,
  hostApplicationEvents,
  hostApplications,
  hostStatusEvents,
  hosts,
  payoutIbanEvents,
  payouts,
  reviews,
  savedExperiences,
  userProfileEvents,
} from '@/db/schema';
import { isAdminPhone } from '@/features/admin/auth';
import { adminGuard } from '@/features/admin/guard';
import { authKey, guestKey, hostKey, parsePersonKey } from '@/features/admin/users/lib/keys';
import type {
  AdminUserApplicationFacet,
  AdminUserDetail,
  AdminUserGuestFacet,
  AdminUserHostFacet,
  AdminUserProfileEdit,
  AdminUserRow,
  HostApplicationStatus,
  UserRole,
} from '@/features/admin/users/types';

export { isAdminAndDbReady } from '@/features/admin/guard';
export type { AdminGuardFailure } from '@/features/admin/guard';

/**
 * Cap per source. At launch scale (dozens–low hundreds of people) the
 * whole directory fits; when supply grows past this, promote search to
 * SQL-side filters per source. The cap is logged, never silent.
 */
const LIST_LIMIT = 1000;

interface MutableRow {
  key: string;
  name: string;
  phone: string | null;
  email: string | null;
  roles: Set<UserRole>;
  hostStatus: AdminUserRow['hostStatus'];
  guestSuspended: boolean;
  applicationStatus: HostApplicationStatus | null;
  bookings: number;
  spentSar: number;
  publishedExperiences: number;
  createdAt: Date;
}

function getOrCreate(map: Map<string, MutableRow>, key: string, createdAt: Date): MutableRow {
  const existing = map.get(key);
  if (existing) {
    if (createdAt < existing.createdAt) existing.createdAt = createdAt;
    return existing;
  }
  const row: MutableRow = {
    key,
    name: '',
    phone: null,
    email: null,
    roles: new Set(),
    hostStatus: null,
    guestSuspended: false,
    applicationStatus: null,
    bookings: 0,
    spentSar: 0,
    publishedExperiences: 0,
    createdAt,
  };
  map.set(key, row);
  return row;
}

const ROLE_ORDER: readonly UserRole[] = ['admin', 'host', 'applicant', 'guest'];

function orderRoles(roles: Set<UserRole>): UserRole[] {
  return ROLE_ORDER.filter((r) => roles.has(r));
}

/**
 * Unified people directory. Merges `guests`, `hosts` and pending
 * `host_applications` into one row per person, keyed by Supabase auth
 * id where present (so a guest who is also a host collapses to a single
 * row). Standalone rows without an account keep their own key.
 */
export async function listUsersForAdmin(query?: string): Promise<readonly AdminUserRow[]> {
  const block = await adminGuard();
  if (block) return [];
  try {
    const [guestRows, hostRows, appRows] = await Promise.all([
      db
        .select({
          id: guests.id,
          authUserId: guests.authUserId,
          name: guests.name,
          phone: guests.phone,
          email: guests.email,
          suspendedAt: guests.suspendedAt,
          createdAt: guests.createdAt,
          bookings: sql<number>`count(${bookings.id})::int`,
          spent: sql<number>`coalesce(sum(${bookings.totalAmount}) filter (where ${bookings.status} <> 'refunded'), 0)::int`,
        })
        .from(guests)
        .leftJoin(bookings, eq(bookings.guestId, guests.id))
        .groupBy(guests.id)
        .orderBy(desc(guests.createdAt))
        .limit(LIST_LIMIT),
      db
        .select({
          id: hosts.id,
          userId: hosts.userId,
          name: hosts.name,
          contactEmail: hosts.contactEmail,
          verificationStatus: hosts.verificationStatus,
          createdAt: hosts.createdAt,
        })
        .from(hosts)
        .orderBy(desc(hosts.createdAt))
        .limit(LIST_LIMIT),
      db
        .select({
          userId: hostApplications.userId,
          displayName: hostApplications.displayName,
          contactEmail: hostApplications.contactEmail,
          contactPhone: hostApplications.contactPhone,
          status: hostApplications.status,
          createdAt: hostApplications.createdAt,
        })
        .from(hostApplications)
        .orderBy(desc(hostApplications.createdAt))
        .limit(LIST_LIMIT),
    ]);

    const publishedCounts = new Map<string, number>();
    const hostIds = hostRows.map((h) => h.id);
    if (hostIds.length > 0) {
      const counts = await db
        .select({ hostId: experiences.hostId, n: sql<number>`count(*)::int` })
        .from(experiences)
        .where(
          and(
            inArray(experiences.hostId, hostIds),
            inArray(experiences.status, ['live', 'paused']),
          ),
        )
        .groupBy(experiences.hostId);
      for (const c of counts) publishedCounts.set(c.hostId, c.n);
    }

    const map = new Map<string, MutableRow>();

    for (const g of guestRows) {
      const row = getOrCreate(
        map,
        g.authUserId ? authKey(g.authUserId) : guestKey(g.id),
        g.createdAt,
      );
      row.roles.add('guest');
      if (!row.name) row.name = g.name;
      row.phone ??= g.phone;
      row.email ??= g.email;
      row.guestSuspended = g.suspendedAt !== null;
      row.bookings += g.bookings;
      row.spentSar += g.spent;
    }

    for (const h of hostRows) {
      const row = getOrCreate(map, h.userId ? authKey(h.userId) : hostKey(h.id), h.createdAt);
      row.roles.add('host');
      if (!row.name) row.name = h.name;
      row.email ??= h.contactEmail;
      row.hostStatus = h.verificationStatus;
      row.publishedExperiences += publishedCounts.get(h.id) ?? 0;
    }

    for (const a of appRows) {
      const row = getOrCreate(map, authKey(a.userId), a.createdAt);
      row.applicationStatus = a.status;
      // Only a still-open application is an actionable "applicant".
      if (a.status === 'pending') row.roles.add('applicant');
      if (!row.name) row.name = a.displayName;
      row.phone ??= a.contactPhone;
      row.email ??= a.contactEmail;
    }

    const all = [...map.values()];
    for (const row of all) {
      if (row.phone && isAdminPhone(row.phone)) row.roles.add('admin');
    }

    const q = query?.trim().toLowerCase();
    const filtered = q
      ? all.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            (r.phone?.toLowerCase().includes(q) ?? false) ||
            (r.email?.toLowerCase().includes(q) ?? false),
        )
      : all;

    // Attention first (suspended host/guest, pending application), then newest.
    const priority = (r: MutableRow): number => {
      if (r.hostStatus === 'suspended' || r.guestSuspended) return 0;
      if (r.applicationStatus === 'pending') return 1;
      return 2;
    };

    return filtered
      .sort((a, b) => {
        const byPriority = priority(a) - priority(b);
        if (byPriority !== 0) return byPriority;
        return b.createdAt.getTime() - a.createdAt.getTime();
      })
      .map<AdminUserRow>((r) => ({
        key: r.key,
        name: r.name || '—',
        phone: r.phone,
        email: r.email,
        roles: orderRoles(r.roles),
        hostStatus: r.hostStatus,
        guestSuspended: r.guestSuspended,
        applicationStatus: r.applicationStatus,
        bookings: r.bookings,
        spentSar: r.spentSar,
        publishedExperiences: r.publishedExperiences,
        createdAt: r.createdAt.toISOString(),
      }));
  } catch (error) {
    reportError(error, { surface: 'admin:listUsers' });
    return [];
  }
}

type GuestRow = typeof guests.$inferSelect;
type HostRow = typeof hosts.$inferSelect;
type AppRow = typeof hostApplications.$inferSelect;

async function resolvePerson(
  key: string,
): Promise<{ guest?: GuestRow; host?: HostRow; application?: AppRow } | null> {
  const parsed = parsePersonKey(key);
  if (!parsed) return null;

  if (parsed.kind === 'auth') {
    const [guest, host, application] = await Promise.all([
      db.query.guests.findFirst({ where: (g) => eq(g.authUserId, parsed.id) }),
      db.query.hosts.findFirst({ where: (h) => eq(h.userId, parsed.id) }),
      db.query.hostApplications.findFirst({ where: (a) => eq(a.userId, parsed.id) }),
    ]);
    return { guest, host, application };
  }

  if (parsed.kind === 'guest') {
    const guest = await db.query.guests.findFirst({ where: (g) => eq(g.id, parsed.id) });
    if (guest?.authUserId) {
      const [host, application] = await Promise.all([
        db.query.hosts.findFirst({ where: (h) => eq(h.userId, guest.authUserId as string) }),
        db.query.hostApplications.findFirst({
          where: (a) => eq(a.userId, guest.authUserId as string),
        }),
      ]);
      return { guest, host, application };
    }
    return { guest };
  }

  // host
  const host = await db.query.hosts.findFirst({ where: (h) => eq(h.id, parsed.id) });
  if (host?.userId) {
    const [guest, application] = await Promise.all([
      db.query.guests.findFirst({ where: (g) => eq(g.authUserId, host.userId as string) }),
      db.query.hostApplications.findFirst({ where: (a) => eq(a.userId, host.userId as string) }),
    ]);
    return { guest, host, application };
  }
  return { host };
}

async function buildGuestFacet(guest: GuestRow): Promise<AdminUserGuestFacet> {
  const [bookingRows, reviewRows, disputeRows, savedRows] = await Promise.all([
    db
      .select({
        id: bookings.id,
        reference: bookings.referenceCode,
        status: bookings.status,
        paymentStatus: bookings.paymentStatus,
        date: bookings.date,
        totalAmount: bookings.totalAmount,
        discountSar: bookings.discountSar,
        promoCode: bookings.promoCode,
        titleEn: experiences.titleEn,
        slug: experiences.slug,
      })
      .from(bookings)
      .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
      .where(eq(bookings.guestId, guest.id))
      .orderBy(desc(bookings.createdAt)),
    db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        textEn: reviews.textEn,
        hiddenAt: reviews.hiddenAt,
        createdAt: reviews.createdAt,
        titleEn: experiences.titleEn,
        slug: experiences.slug,
      })
      .from(reviews)
      .innerJoin(experiences, eq(experiences.id, reviews.experienceId))
      .where(eq(reviews.guestId, guest.id))
      .orderBy(desc(reviews.createdAt)),
    db
      .select({
        id: disputes.id,
        message: disputes.message,
        status: disputes.status,
        createdAt: disputes.createdAt,
        reference: bookings.referenceCode,
      })
      .from(disputes)
      .innerJoin(bookings, eq(bookings.id, disputes.bookingId))
      .where(eq(disputes.guestId, guest.id))
      .orderBy(desc(disputes.createdAt)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(savedExperiences)
      .where(eq(savedExperiences.guestId, guest.id)),
  ]);

  const spentSar = bookingRows
    .filter((b) => b.status !== 'refunded')
    .reduce((sum, b) => sum + b.totalAmount, 0);

  return {
    id: guest.id,
    name: guest.name,
    phone: guest.phone,
    email: guest.email,
    preferredLanguage: guest.preferredLanguage,
    suspendedAt: guest.suspendedAt ? guest.suspendedAt.toISOString() : null,
    billing: {
      street1: guest.billingStreet1,
      city: guest.billingCity,
      state: guest.billingState,
      postcode: guest.billingPostcode,
      country: guest.billingCountry,
    },
    bookingsCount: bookingRows.length,
    spentSar,
    savedCount: savedRows[0]?.n ?? 0,
    bookings: bookingRows.map((b) => ({
      id: b.id,
      reference: b.reference,
      status: b.status,
      paymentStatus: b.paymentStatus,
      date: b.date,
      experienceTitleEn: b.titleEn,
      experienceSlug: b.slug,
      totalAmountSar: b.totalAmount,
      discountSar: b.discountSar ?? 0,
      promoCode: b.promoCode,
    })),
    reviews: reviewRows.map((r) => ({
      id: r.id,
      rating: r.rating,
      textEn: r.textEn,
      experienceTitleEn: r.titleEn,
      experienceSlug: r.slug,
      hidden: r.hiddenAt !== null,
      createdAt: r.createdAt.toISOString(),
    })),
    disputes: disputeRows.map((d) => ({
      id: d.id,
      bookingReference: d.reference,
      message: d.message,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
    })),
  };
}

async function buildHostFacet(host: HostRow): Promise<AdminUserHostFacet> {
  const [expRows, revenueRows, payoutRows, ibanRows, statusRows] = await Promise.all([
    db.query.experiences.findMany({
      where: (e) => eq(e.hostId, host.id),
      orderBy: (e) => desc(e.createdAt),
      columns: { id: true, slug: true, titleEn: true, status: true },
    }),
    db
      .select({
        n: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${bookings.totalAmount}), 0)::int`,
      })
      .from(bookings)
      .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
      .where(
        and(eq(experiences.hostId, host.id), inArray(bookings.status, ['confirmed', 'completed'])),
      ),
    db
      .select({
        id: payouts.id,
        amountSar: payouts.amountSar,
        bookingCount: payouts.bookingCount,
        bankReference: payouts.bankReference,
        createdAt: payouts.createdAt,
      })
      .from(payouts)
      .where(eq(payouts.hostId, host.id))
      .orderBy(desc(payouts.createdAt)),
    db
      .select()
      .from(payoutIbanEvents)
      .where(eq(payoutIbanEvents.hostId, host.id))
      .orderBy(desc(payoutIbanEvents.createdAt)),
    db
      .select()
      .from(hostStatusEvents)
      .where(eq(hostStatusEvents.hostId, host.id))
      .orderBy(desc(hostStatusEvents.createdAt)),
  ]);

  return {
    id: host.id,
    name: host.name,
    slug: host.slug,
    verificationStatus: host.verificationStatus,
    bioEn: host.bioEn,
    bioAr: host.bioAr,
    contactEmail: host.contactEmail,
    city: host.city,
    region: host.region,
    languages: host.languages,
    nationalId: host.nationalId,
    crNumber: host.crNumber,
    payoutIban: host.payoutIban,
    liveBookings: revenueRows[0]?.n ?? 0,
    revenueSar: revenueRows[0]?.revenue ?? 0,
    experiences: expRows.map((e) => ({
      id: e.id,
      slug: e.slug,
      titleEn: e.titleEn,
      status: e.status,
    })),
    payouts: payoutRows.map((p) => ({
      id: p.id,
      amountSar: p.amountSar,
      bookingCount: p.bookingCount,
      bankReference: p.bankReference,
      createdAt: p.createdAt.toISOString(),
    })),
    ibanEvents: ibanRows.map((e) => ({
      id: e.id,
      previousIbanMasked: e.previousIbanMasked,
      newIbanMasked: e.newIbanMasked,
      createdAt: e.createdAt.toISOString(),
    })),
    statusEvents: statusRows.map((e) => ({
      id: e.id,
      event: e.event,
      reviewerNotes: e.reviewerNotes,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

async function buildApplicationFacet(application: AppRow): Promise<AdminUserApplicationFacet> {
  const [docRows, eventRows] = await Promise.all([
    db
      .select({ type: hostApplicationDocuments.type, status: hostApplicationDocuments.status })
      .from(hostApplicationDocuments)
      .where(eq(hostApplicationDocuments.applicationId, application.id)),
    db
      .select()
      .from(hostApplicationEvents)
      .where(eq(hostApplicationEvents.applicationId, application.id))
      .orderBy(desc(hostApplicationEvents.createdAt)),
  ]);

  return {
    id: application.id,
    status: application.status,
    identityType: application.identityType,
    legalName: application.legalName,
    iban: application.iban,
    vatNumber: application.vatNumber,
    reviewerNotes: application.reviewerNotes,
    documents: docRows.map((d) => ({ type: d.type, status: d.status })),
    events: eventRows.map((e) => ({
      id: e.id,
      event: e.event,
      reviewerNotes: e.reviewerNotes,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

async function buildProfileEdits(
  guestId: string | undefined,
  hostId: string | undefined,
  authUserId: string | null,
): Promise<AdminUserProfileEdit[]> {
  const conditions = [];
  if (guestId) conditions.push(eq(userProfileEvents.subjectGuestId, guestId));
  if (hostId) conditions.push(eq(userProfileEvents.subjectHostId, hostId));
  if (authUserId) conditions.push(eq(userProfileEvents.subjectAuthUserId, authUserId));
  if (conditions.length === 0) return [];

  const rows = await db
    .select()
    .from(userProfileEvents)
    .where(conditions.length === 1 ? conditions[0] : or(...conditions))
    .orderBy(desc(userProfileEvents.createdAt))
    .limit(200);

  return rows.map((r) => ({
    id: r.id,
    field: r.field,
    previousValue: r.previousValue,
    newValue: r.newValue,
    actorUserId: r.actorUserId,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Full "User 360" for one person. Masks the host's national ID / CR on
 * the way out (operational surface — the raw values live only on the
 * KYC review page); the payout IBAN travels full so the page can offer
 * copy-to-clipboard, and masks it for display.
 */
export async function getUserDetailForAdmin(key: string): Promise<AdminUserDetail | undefined> {
  const block = await adminGuard();
  if (block) return undefined;
  try {
    const resolved = await resolvePerson(key);
    if (!resolved || (!resolved.guest && !resolved.host && !resolved.application)) {
      return undefined;
    }
    const { guest, host, application } = resolved;

    const authUserId = guest?.authUserId ?? host?.userId ?? application?.userId ?? null;

    const [guestFacet, hostFacet, applicationFacet, profileEdits] = await Promise.all([
      guest ? buildGuestFacet(guest) : Promise.resolve(null),
      host ? buildHostFacet(host) : Promise.resolve(null),
      application ? buildApplicationFacet(application) : Promise.resolve(null),
      buildProfileEdits(guest?.id, host?.id, authUserId),
    ]);

    const roles = new Set<UserRole>();
    if (guest) roles.add('guest');
    if (host) roles.add('host');
    if (application?.status === 'pending') roles.add('applicant');
    const phone = guest?.phone ?? application?.contactPhone ?? null;
    if (phone && isAdminPhone(phone)) roles.add('admin');

    const createdCandidates = [guest?.createdAt, host?.createdAt, application?.createdAt].filter(
      (d): d is Date => d instanceof Date,
    );
    const createdAt =
      createdCandidates.length > 0
        ? new Date(Math.min(...createdCandidates.map((d) => d.getTime())))
        : new Date();

    // Identity numbers / IBAN travel RAW here so the edit form can
    // prefill them (a no-op save must preserve them, not wipe them). The
    // detail page masks them at render for the operational view — same
    // posture as /admin/hosts/[id].
    return {
      key,
      name: guest?.name ?? host?.name ?? application?.displayName ?? '—',
      roles: ROLE_ORDER.filter((r) => roles.has(r)),
      authUserId,
      createdAt: createdAt.toISOString(),
      guest: guestFacet,
      host: hostFacet,
      application: applicationFacet,
      profileEdits,
    };
  } catch (error) {
    reportError(error, { surface: 'admin:getUserDetail', key });
    return undefined;
  }
}

/** Resolve the concrete guest/host ids behind a person key — for the edit actions. */
export async function resolveEditTargets(
  key: string,
): Promise<{ guestId: string | null; hostId: string | null; authUserId: string | null } | null> {
  const block = await adminGuard();
  if (block) return null;
  const resolved = await resolvePerson(key);
  if (!resolved) return null;
  return {
    guestId: resolved.guest?.id ?? null,
    hostId: resolved.host?.id ?? null,
    authUserId:
      resolved.guest?.authUserId ?? resolved.host?.userId ?? resolved.application?.userId ?? null,
  };
}
