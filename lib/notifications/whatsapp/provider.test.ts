import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Twilio WhatsApp adapter tests. The adapter is the app's only writer
 * to the Twilio REST API, so these pin the three contracts the
 * dispatcher relies on: address normalization (a bad phone means "skip
 * the channel", never a malformed API call), Content-SID resolution
 * from the env JSON (locale-specific key first, shared key as
 * fallback, unparseable JSON degrades to "no templates"), and the
 * never-throws posture of the send itself.
 */

const env = vi.hoisted(() => ({
  TWILIO_ACCOUNT_SID: 'AC-test',
  TWILIO_AUTH_TOKEN: 'token-test',
  TWILIO_WHATSAPP_FROM: '+14155238886',
  TWILIO_WHATSAPP_CONTENT_SIDS: '',
}));
vi.mock('@/lib/env', () => ({ serverEnv: env }));

vi.mock('@/lib/site', () => ({ SITE_URL: 'https://gharmish.com' }));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

/**
 * The Content-SID map is memoized per process, so every test that
 * changes `TWILIO_WHATSAPP_CONTENT_SIDS` re-imports a fresh module.
 */
async function load(contentSids: string) {
  env.TWILIO_WHATSAPP_CONTENT_SIDS = contentSids;
  vi.resetModules();
  return await import('./provider');
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('whatsappAddress', () => {
  it('normalizes a formatted phone to whatsapp:+E164', async () => {
    const { whatsappAddress } = await load('');
    expect(whatsappAddress('+966 54 110 4000')).toBe('whatsapp:+966541104000');
    expect(whatsappAddress('966541104000')).toBe('whatsapp:+966541104000');
  });

  it('rejects non-dialable values', async () => {
    const { whatsappAddress } = await load('');
    expect(whatsappAddress(null)).toBeNull();
    expect(whatsappAddress(undefined)).toBeNull();
    expect(whatsappAddress('')).toBeNull();
    expect(whatsappAddress('+123')).toBeNull();
    expect(whatsappAddress('1234567890123456')).toBeNull();
  });
});

describe('whatsappContentSid', () => {
  it('prefers the locale-specific key over the shared key', async () => {
    const { whatsappContentSid } = await load(
      JSON.stringify({ 'booking_confirmed.en': 'HX-en', booking_confirmed: 'HX-shared' }),
    );
    expect(whatsappContentSid('booking_confirmed', 'en')).toBe('HX-en');
    expect(whatsappContentSid('booking_confirmed', 'ar')).toBe('HX-shared');
  });

  it('returns null for a template with no approved SID', async () => {
    const { whatsappContentSid } = await load(JSON.stringify({ 'booking_confirmed.en': 'HX-en' }));
    expect(whatsappContentSid('booking_declined', 'en')).toBeNull();
  });

  it('returns null when the env var is unset', async () => {
    const { whatsappContentSid } = await load('');
    expect(whatsappContentSid('booking_confirmed', 'en')).toBeNull();
  });

  it('degrades to null on unparseable JSON and reports it', async () => {
    const { whatsappContentSid } = await load('{not json');
    expect(whatsappContentSid('booking_confirmed', 'en')).toBeNull();
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('returns null when the JSON is not an object', async () => {
    const { whatsappContentSid } = await load('["HX-1"]');
    expect(whatsappContentSid('booking_confirmed', 'en')).toBeNull();
  });

  it('drops non-string values instead of returning them', async () => {
    const { whatsappContentSid } = await load(
      JSON.stringify({ 'booking_confirmed.en': 42, 'booking_approved.en': 'HX-ok' }),
    );
    expect(whatsappContentSid('booking_confirmed', 'en')).toBeNull();
    expect(whatsappContentSid('booking_approved', 'en')).toBe('HX-ok');
  });
});

describe('sendWhatsAppTemplate', () => {
  const input = {
    to: 'whatsapp:+966541104000',
    contentSid: 'HX-en',
    variables: { '1': 'GH-7K3M9X', '2': 'Sunrise hike' },
  };

  it('POSTs the Content template to Twilio and returns the message SID', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ sid: 'SM-1' }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { sendWhatsAppTemplate } = await load('');

    const result = await sendWhatsAppTemplate(input);

    expect(result).toEqual({ ok: true, sid: 'SM-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC-test/Messages.json');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('AC-test:token-test').toString('base64')}`,
    );
    const body = new URLSearchParams(init.body as string);
    expect(body.get('To')).toBe('whatsapp:+966541104000');
    expect(body.get('From')).toBe('whatsapp:+14155238886');
    expect(body.get('ContentSid')).toBe('HX-en');
    expect(body.get('ContentVariables')).toBe(JSON.stringify(input.variables));
    expect(body.get('StatusCallback')).toBe('https://gharmish.com/api/webhooks/twilio');
  });

  it('does not double-prefix a From already in whatsapp: form', async () => {
    env.TWILIO_WHATSAPP_FROM = 'whatsapp:+14155238886';
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ sid: 'SM-1' }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { sendWhatsAppTemplate } = await load('');

    await sendWhatsAppTemplate(input);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URLSearchParams(init.body as string).get('From')).toBe('whatsapp:+14155238886');
    env.TWILIO_WHATSAPP_FROM = '+14155238886';
  });

  it('returns a failed result (not a throw) on an HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"message":"template not approved"}', { status: 400 })),
    );
    const { sendWhatsAppTemplate } = await load('');

    const result = await sendWhatsAppTemplate(input);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('HTTP 400');
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('returns a failed result (not a throw) when the network call rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('socket hang up');
      }),
    );
    const { sendWhatsAppTemplate } = await load('');

    const result = await sendWhatsAppTemplate(input);

    expect(result).toEqual({ ok: false, error: 'socket hang up' });
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});

describe('unmappedWhatsAppTemplates', () => {
  const served = async (map: Record<string, string> | null) => {
    const mod = await load('{}');
    return mod.unmappedWhatsAppTemplates(map, ['ar']);
  };

  it('reports nothing when WhatsApp is not configured at all', async () => {
    expect(await served(null)).toEqual([]);
  });

  it('names the registry templates the map cannot serve, by locale key', async () => {
    const { WHATSAPP_TEMPLATES, providerKey } = await import('./registry');
    const full = Object.fromEntries(
      WHATSAPP_TEMPLATES.map((t) => [`${providerKey(t.id)}.ar`, 'HX1']),
    );
    expect(await served(full)).toEqual([]);
    // The 2026-10-09 production gap: the Arabic hold message had an
    // approved SID on Twilio that never reached the env map.
    delete full['v3/guest_payment_pending.ar'];
    expect(await served(full)).toEqual(['v3/guest_payment_pending.ar']);
  });

  it('accepts a shared locale-less key or a legacy key as served', async () => {
    const { WHATSAPP_TEMPLATES, providerKey } = await import('./registry');
    const full = Object.fromEntries(WHATSAPP_TEMPLATES.map((t) => [providerKey(t.id), 'HX1']));
    expect(await served(full)).toEqual([]);
    const legacy = WHATSAPP_TEMPLATES.find((t) => t.legacy);
    if (!legacy?.legacy) throw new Error('expected a template with a legacy fallback');
    delete full[providerKey(legacy.id)];
    expect(await served(full)).toEqual([`${providerKey(legacy.id)}.ar`]);
    full[`${legacy.legacy.key}.ar`] = 'HXlegacy';
    expect(await served(full)).toEqual([]);
  });
});
