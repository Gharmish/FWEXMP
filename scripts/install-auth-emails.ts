/**
 * Install Gharmish's auth email templates into Supabase via the Management API.
 *
 * This turns the manual "paste two templates into the dashboard" step into one
 * command. It pushes the branded `docs/auth-emails/*.html` templates (the ones
 * that surface the 6-digit `{{ .Token }}` our sign-in UI requires) plus their
 * subjects into Supabase Auth config.
 *
 * It does NOT touch SMTP credentials, DNS, or OTP length/expiry — email OTP
 * length (6) and expiry (3600s) are already Supabase defaults and match the
 * templates. See `docs/auth-emails/README.md` for the full runbook.
 *
 * Usage:
 *   export SUPABASE_ACCESS_TOKEN=sbp_...        # a personal access token
 *   pnpm tsx scripts/install-auth-emails.ts             # dry run (prints plan)
 *   pnpm tsx scripts/install-auth-emails.ts --apply     # actually writes
 *
 * Get a token: https://supabase.com/dashboard/account/tokens
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'xjgpflzkpydfpuomqhuq'; // gharmish-experiences
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const APPLY = process.argv.includes('--apply');

const here = dirname(fileURLToPath(import.meta.url));
const emailsDir = join(here, '..', 'docs', 'auth-emails');

interface TemplatePatch {
  /** Management API field for the subject line. */
  subjectField: string;
  /** Management API field for the HTML body. */
  contentField: string;
  subject: string;
  file: string;
}

const TEMPLATES: readonly TemplatePatch[] = [
  {
    subjectField: 'mailer_subjects_magic_link',
    contentField: 'mailer_templates_magic_link_content',
    subject: 'Your Gharmish sign-in code',
    file: 'magic-link.html',
  },
  {
    subjectField: 'mailer_subjects_confirmation',
    contentField: 'mailer_templates_confirmation_content',
    subject: 'Confirm your email — your Gharmish code',
    file: 'confirm-signup.html',
  },
] as const;

function buildBody(): Record<string, string | number> {
  const body: Record<string, string | number> = {};
  for (const t of TEMPLATES) {
    const html = readFileSync(join(emailsDir, t.file), 'utf8');
    if (!html.includes('{{ .Token }}')) {
      throw new Error(
        `${t.file} is missing {{ .Token }} — refusing to install a code-less template.`,
      );
    }
    body[t.subjectField] = t.subject;
    body[t.contentField] = html;
  }
  // The sign-in UI hardcodes a 6-digit code (pattern="\d{6}", maxLength={6})
  // and the templates say "6-digit". Pin the email OTP length so a Supabase
  // default of 8 can't silently break verification.
  body.mailer_otp_length = 6;
  return body;
}

/** CLI output — stdout, matching the project's no-console lint rule. */
function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function main(): Promise<void> {
  const body = buildBody();
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;

  out(`Project:   ${PROJECT_REF}`);
  out(`Endpoint:  PATCH ${url}`);
  for (const t of TEMPLATES) {
    out(`  • ${t.contentField}  ←  docs/auth-emails/${t.file}  (subject: "${t.subject}")`);
  }

  if (!APPLY) {
    out('\nDry run — nothing sent. Re-run with --apply to install.');
    return;
  }
  if (!ACCESS_TOKEN) {
    throw new Error(
      'SUPABASE_ACCESS_TOKEN is not set. Create one at https://supabase.com/dashboard/account/tokens',
    );
  }

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Management API responded ${res.status}: ${text}`);
  }

  out('\n✓ Installed. Verify at Authentication → Emails, then send yourself a sign-in code.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
