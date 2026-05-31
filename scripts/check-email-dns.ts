/**
 * Email-DNS doctor for gharmish.com — checks that Resend's sending DNS is
 * correct and (critically) that there is exactly ONE SPF record.
 *
 * Turns the manual `dig` checks in docs/auth-emails/README.md into one
 * command. Run it before and after the SPF fix, and as part of the go-live
 * verification.
 *
 *   pnpm auth:emails:doctor
 *
 * Exits non-zero if any check fails, so it's CI-friendly.
 */

import { resolveTxt, resolveNs, resolve4 } from 'node:dns/promises';
import { setServers } from 'node:dns';

const DOMAIN = 'gharmish.com';
const SEND_HOST = `send.${DOMAIN}`; // Resend return-path / SPF subdomain
const DKIM_HOST = `resend._domainkey.${DOMAIN}`;
const DMARC_HOST = `_dmarc.${DOMAIN}`;

/**
 * Point the resolver at the domain's AUTHORITATIVE nameservers, so results
 * reflect what's actually published — immune to local/ISP/anycast resolver
 * caches that can lag a fresh record change by up to its TTL. Falls back to
 * public resolvers if the NS lookup fails.
 */
async function pointAtAuthoritativeNs(): Promise<void> {
  try {
    const ns = await resolveNs(DOMAIN);
    const ips = (await Promise.all(ns.map((h) => resolve4(h).catch(() => [])))).flat();
    setServers(ips.length ? ips : ['1.1.1.1', '8.8.8.8']);
  } catch {
    setServers(['1.1.1.1', '8.8.8.8']);
  }
}

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

/** Flatten dns.resolveTxt's string[][] into one string per record. */
async function txt(host: string): Promise<string[]> {
  try {
    return (await resolveTxt(host)).map((chunks) => chunks.join(''));
  } catch {
    return [];
  }
}

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function main(): Promise<void> {
  await pointAtAuthoritativeNs();
  const sendTxt = await txt(SEND_HOST);
  const spf = sendTxt.filter((r) => r.startsWith('v=spf1'));
  const dkim = await txt(DKIM_HOST);
  const dmarc = (await txt(DMARC_HOST)).filter((r) => r.startsWith('v=DMARC1'));

  const checks: Check[] = [
    {
      name: `SPF on ${SEND_HOST}`,
      pass: spf.length === 1,
      detail:
        spf.length === 0
          ? 'no SPF record found'
          : spf.length === 1
            ? `exactly one — ${spf[0]}`
            : `DUPLICATE (${spf.length}) — RFC 7208 permerror; delete all but one:\n      ${spf.join('\n      ')}`,
    },
    {
      name: 'DKIM (resend._domainkey)',
      pass: dkim.some((r) => r.includes('p=')),
      detail: dkim.length ? 'public key present' : 'missing',
    },
    {
      name: 'DMARC (_dmarc)',
      pass: dmarc.length === 1,
      detail: dmarc.length === 1 ? dmarc[0] : dmarc.length === 0 ? 'missing' : 'duplicate',
    },
  ];

  out('Email-DNS doctor — gharmish.com\n');
  let allPass = true;
  for (const c of checks) {
    out(`${c.pass ? '✅' : '❌'}  ${c.name}\n      ${c.detail}\n`);
    allPass = allPass && c.pass;
  }
  out(allPass ? '✓ All checks passed.' : '✗ Fix the ❌ items (see docs/auth-emails/README.md §2).');

  if (!allPass) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
