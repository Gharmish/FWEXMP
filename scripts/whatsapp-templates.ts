/**
 * WhatsApp template operations against Twilio's Content API, driven by
 * the registry in lib/notifications/whatsapp (one source of truth).
 *
 *   pnpm whatsapp:templates status            # registry vs account vs env map
 *   pnpm whatsapp:templates create [id…]      # create missing v3 templates (both locales)
 *   pnpm whatsapp:templates submit [id…]      # submit created-but-unsubmitted ones to Meta
 *   pnpm whatsapp:templates sids              # print the SID-map JSON (approved v3 + existing keys)
 *
 * Credentials come from .env / .env.local (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN).
 * Never writes to Vercel — print, review, then set the env var deliberately.
 */
import { readFileSync, existsSync } from 'node:fs';
import { WHATSAPP_TEMPLATES, providerFriendlyName, providerKey } from '../lib/notifications/whatsapp/registry';
import { providerContentPayload } from '../lib/notifications/whatsapp/render';

type Locale = 'ar' | 'en';
const LOCALES: Locale[] = ['ar', 'en'];

function loadEnv(): void {
  for (const file of ['.env', '.env.local']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (!m || process.env[m[1]]) continue;
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}
loadEnv();

const SID = process.env.TWILIO_ACCOUNT_SID ?? '';
const TOKEN = process.env.TWILIO_AUTH_TOKEN ?? '';
if (!SID || !TOKEN) {
  console.error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN missing');
  process.exit(1);
}
/** CLI output — stdout, matching the project's no-console lint rule. */
function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

const auth = `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString('base64')}`;

interface ContentRow {
  sid: string;
  friendly_name: string;
  language: string;
  approval_requests?: { status?: string; rejection_reason?: string } | null;
}

async function listAll(): Promise<ContentRow[]> {
  const out: ContentRow[] = [];
  let url: string | null = 'https://content.twilio.com/v1/ContentAndApprovals?PageSize=100';
  while (url) {
    const res = await fetch(url, { headers: { Authorization: auth } });
    const json = (await res.json()) as { contents?: ContentRow[]; meta?: { next_page_url?: string | null } };
    out.push(...(json.contents ?? []));
    url = json.meta?.next_page_url ?? null;
  }
  return out;
}

async function create(id: string, locale: Locale): Promise<string> {
  const template = WHATSAPP_TEMPLATES.find((t) => t.id === id);
  if (!template) throw new Error(`unknown template ${id}`);
  const payload = providerContentPayload(template, locale, providerFriendlyName(id, locale));
  const res = await fetch('https://content.twilio.com/v1/Content', {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as { sid?: string; message?: string };
  if (!json.sid) throw new Error(`create ${id}.${locale}: ${json.message ?? res.status}`);
  return json.sid;
}

async function submit(contentSid: string, name: string, category: string): Promise<string> {
  const res = await fetch(`https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests/whatsapp`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, category }),
  });
  const json = (await res.json()) as { status?: string; message?: string };
  return json.status ?? json.message ?? String(res.status);
}

function currentSidMap(): Record<string, string> {
  try {
    return JSON.parse(process.env.TWILIO_WHATSAPP_CONTENT_SIDS ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

async function main(): Promise<void> {
  const [command = 'status', ...ids] = process.argv.slice(2);
  const wanted = ids.length ? WHATSAPP_TEMPLATES.filter((t) => ids.includes(t.id)) : WHATSAPP_TEMPLATES;
  const rows = await listAll();
  const byName = new Map(rows.map((r) => [r.friendly_name, r]));
  const sidMap = currentSidMap();

  if (command === 'status') {
    for (const t of wanted) {
      for (const locale of LOCALES) {
        const row = byName.get(providerFriendlyName(t.id, locale));
        const status = row ? (row.approval_requests?.status ?? 'created') : '—';
        const mapped = sidMap[`${providerKey(t.id)}.${locale}`] ? 'mapped' : t.legacy && sidMap[`${t.legacy.key}.${locale}`] ? `legacy:${t.legacy.key}` : 'unmapped';
        out(`${`${t.id}.${locale}`.padEnd(40)} ${status.padEnd(12)} ${mapped} ${row?.sid ?? ''}`);
      }
    }
    return;
  }

  if (command === 'create') {
    for (const t of wanted) {
      for (const locale of LOCALES) {
        const name = providerFriendlyName(t.id, locale);
        if (byName.has(name)) {
          out(`skip ${name} (exists ${byName.get(name)?.sid})`);
          continue;
        }
        const sid = await create(t.id, locale);
        out(`created ${name} ${sid}`);
      }
    }
    return;
  }

  if (command === 'submit') {
    for (const t of wanted) {
      for (const locale of LOCALES) {
        const row = byName.get(providerFriendlyName(t.id, locale));
        if (!row) {
          out(`missing ${t.id}.${locale} — run create first`);
          continue;
        }
        if (row.approval_requests?.status && row.approval_requests.status !== 'unsubmitted') {
          out(`skip ${row.friendly_name} (${row.approval_requests.status})`);
          continue;
        }
        const status = await submit(row.sid, row.friendly_name, t.category);
        out(`submitted ${row.friendly_name} → ${status}`);
      }
    }
    return;
  }

  if (command === 'sids') {
    const next: Record<string, string> = { ...sidMap };
    for (const t of wanted) {
      for (const locale of LOCALES) {
        const row = byName.get(providerFriendlyName(t.id, locale));
        if (row?.approval_requests?.status === 'approved') next[`${providerKey(t.id)}.${locale}`] = row.sid;
      }
    }
    out(JSON.stringify(next));
    return;
  }

  console.error(`unknown command ${command}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
