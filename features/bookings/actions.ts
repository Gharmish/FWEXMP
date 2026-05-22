'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { bookings, guests } from '@/db/schema';
import { bookingRequestSchema } from '@/features/bookings/schemas';

export interface BookingRequestState {
  success: boolean;
  message?: string;
  reference?: string;
  fields?: Partial<Record<'name' | 'phone' | 'preferredDate' | 'partySize', string>>;
  values?: Partial<Record<'name' | 'phone' | 'preferredDate' | 'partySize', string>>;
}

const FIELD_NAMES = ['name', 'phone', 'preferredDate', 'partySize'] as const;

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function currentValues(formData: FormData): BookingRequestState['values'] {
  return Object.fromEntries(FIELD_NAMES.map((key) => [key, formValue(formData, key)]));
}

export async function requestBooking(
  _previousState: BookingRequestState,
  formData: FormData,
): Promise<BookingRequestState> {
  const parsed = bookingRequestSchema.safeParse({
    experienceSlug: formValue(formData, 'experienceSlug'),
    locale: formValue(formData, 'locale'),
    name: formValue(formData, 'name'),
    phone: formValue(formData, 'phone'),
    preferredDate: formValue(formData, 'preferredDate'),
    partySize: formValue(formData, 'partySize'),
  });

  if (!parsed.success) {
    const fields: BookingRequestState['fields'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && FIELD_NAMES.includes(key as (typeof FIELD_NAMES)[number])) {
        fields[key as keyof typeof fields] = issue.message;
      }
    }
    return {
      success: false,
      message: 'validation',
      fields,
      values: currentValues(formData),
    };
  }

  const input = parsed.data;
  const reference = crypto.randomUUID();

  if (!serverEnv.DATABASE_URL) {
    return {
      success: true,
      message: 'preview',
      reference,
      values: {},
    };
  }

  try {
    const experience = await db.query.experiences.findFirst({
      where: (e) => eq(e.slug, input.experienceSlug),
      columns: { id: true, priceSar: true, maxGroupSize: true },
    });

    if (!experience) {
      return { success: false, message: 'notFound', values: currentValues(formData) };
    }

    if (input.partySize > experience.maxGroupSize) {
      return {
        success: false,
        message: 'validation',
        fields: { partySize: 'too_large' },
        values: currentValues(formData),
      };
    }

    let guest = await db.query.guests.findFirst({
      where: (g) => eq(g.phone, input.phone),
      columns: { id: true },
    });

    if (!guest) {
      [guest] = await db
        .insert(guests)
        .values({
          name: input.name,
          phone: input.phone,
          preferredLanguage: input.locale,
        })
        .returning({ id: guests.id });
    }

    await db.insert(bookings).values({
      guestId: guest.id,
      experienceId: experience.id,
      date: input.preferredDate,
      startTime: '09:00',
      partySize: input.partySize,
      totalAmount: experience.priceSar * input.partySize,
      idempotencyKey: reference,
      status: 'pending',
    });

    return { success: true, message: 'stored', reference, values: {} };
  } catch {
    return { success: false, message: 'server', values: currentValues(formData) };
  }
}
