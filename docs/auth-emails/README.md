# Auth email — Resend + Supabase (runbook)

How Gharmish sends **transactional auth email** (sign-in codes), and the
exact steps to make it production-perfect.

> **✅ Status (2026-05-31): LIVE & verified.** Templates installed (both carry
> `{{ .Token }}`), Custom SMTP confirmed pointing at `smtp.resend.com`
> (`hello@gharmish.com`), email OTP length pinned to 6, the duplicate SPF
> record removed (single record live at authoritative NS + Cloudflare), and a
> real OTP send returned HTTP 200 with no SMTP errors. Run
> `pnpm auth:emails:doctor` to re-check DNS anytime. The steps below are kept
> for reproducibility (e.g. a fresh project) and reference.

> **Why this matters:** the app already ships a fully-built **email OTP**
> sign-in path (`features/auth/actions.ts`, email branch). That means
> Gharmish can unlock guest + host **self-service sign-in today using email
> codes — no SMS provider required** (GO-LIVE §2 lists SMS as the blocker;
> email is the cheaper unlock). Resend → Supabase SMTP is what delivers
> those emails.

Project: Supabase `gharmish-experiences` (`xjgpflzkpydfpuomqhuq`,
eu-central-1) · sender `hello@gharmish.com` · domain `gharmish.com`.

---

## 0. The one thing that will silently break it ⚠️

Our sign-in UI asks the user to **type a 6-digit code** (`signInWithOtp` →
`verifyOtp({ type: 'email' })`, see `features/auth/actions.ts`; the copy in
`messages/*.json` literally says "Enter the 6-digit code we just emailed
you"). **Supabase's default email templates only contain a magic _link_
(`{{ .ConfirmationURL }}`) — not the code (`{{ .Token }}`).** If you leave
the defaults, users get an email with no code to type, and email sign-in is
broken even though SMTP "works."

**Fix:** install the two templates in this folder (next section). They make
the 6-digit code the hero and keep the link as a fallback.

---

## 1. Install the email templates

**Fastest path — one command** (pushes both templates + subjects via the
Supabase Management API; no manual pasting):

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...        # https://supabase.com/dashboard/account/tokens
pnpm auth:emails:install                    # dry run — prints the plan
pnpm auth:emails:install --apply            # installs
```

The script (`scripts/install-auth-emails.ts`) refuses to install a template
that's missing `{{ .Token }}`, and never touches SMTP creds or DNS.

**Or do it by hand** — Supabase Dashboard → **Authentication → Emails**. For
each template below, paste the HTML file's contents into the body and set the
subject:

| Supabase template  | File                  | Fires when                         | Subject                                   |
| ------------------ | --------------------- | ---------------------------------- | ----------------------------------------- |
| **Magic Link**     | `magic-link.html`     | Email OTP for an **existing** user | `Your Gharmish sign-in code`              |
| **Confirm signup** | `confirm-signup.html` | Email OTP for a **new** user       | `Confirm your email — your Gharmish code` |

Both must keep `{{ .Token }}`. Leave the other templates (Invite, Reset
password, Change email, Reauthentication) as-is for now — our flows don't
trigger them. When they're needed, mirror this design.

Then in **Authentication → Providers → Email** / **Auth settings**:

- **Email OTP length = 6** — the UI hardcodes `pattern="\d{6}"` / `maxLength={6}`.
- **Email OTP expiry = 3600s (60 min)** — matches the "valid for 60 minutes"
  copy in the templates. If you change one, change the other.
- Keep **Confirm email** ON (OTP confirms the address inline).

> **Arabic:** Supabase auth emails are single-language — they can't switch on
> the user's locale. True bilingual auth email needs a **Send Email Auth
> Hook** (an edge function that renders per-locale and sends via Resend's
> API). That's a separate feature; until then these ship in **English only**.
> Per BRIEF §4 we do not machine-translate — flag for human `TODO(ar)`.

---

## 2. Fix the DNS — duplicate SPF record 🔴

`send.gharmish.com` currently publishes **two** `v=spf1` TXT records:

```
v=spf1 include:amazonses.com ~all                            ← Resend "classic"
v=spf1 include:dc-fd741b8612._spfm.send.gharmish.com ~all    ← Resend "managed/flattened"
```

Both authorize the same Amazon SES IPs (the second expands to the first), so
this is a leftover from setting the domain up twice. **Two SPF records on one
name is an RFC 7208 `permerror`** — strict receivers (notably Outlook/Hotmail)
penalize it in spam scoring. Mail still lands today only because DKIM carries
DMARC on its own; fix it before relying on this at volume.

**Done (2026-05-31):** removed the `_spfm` duplicate via the GoDaddy API,
keeping the canonical Resend record **`v=spf1 include:amazonses.com ~all`**.
Both authenticated identically, so this is safe; if Resend ever shows the
domain unverified, re-check which SPF row it lists and keep that one instead.

For reference, the manual fix is: delete **one** of the two TXT records so
exactly one `v=spf1` remains.

Your nameservers are **GoDaddy** (`ns05/ns06.domaincontrol.com`), so:

1. GoDaddy → **Domains → `gharmish.com` → DNS → Manage Zones / DNS Records**.
2. Filter to **Type = TXT, Name = `send`**. You'll see two values both
   starting `v=spf1`.
3. **Delete one** of them (keep the one Resend lists). Save.
4. Resend → Domains → `gharmish.com` → **Check domain** to re-verify.

Don't add a SPF record on the **root** `gharmish.com` — Resend signs from the
`send` subdomain, and a root SPF isn't needed (and would be a second place to
keep in sync).

Verify in one command — checks SPF (must be exactly one), DKIM, and DMARC,
and exits non-zero if anything's wrong:

```bash
pnpm auth:emails:doctor
```

## 2b. DMARC reporting (optional, recommended)

`_dmarc.gharmish.com` is `p=reject` (good) but `rua` points to
`dmarc_rua@onsecureserver.net` — your registrar's mailbox, which you don't
read. Point it at a monitored address so you'd catch auth failures:

```
v=DMARC1; p=reject; adkim=r; aspf=r; rua=mailto:dmarc@gharmish.com;
```

---

## 3. Verify the Supabase ↔ Resend SMTP wiring

Supabase Dashboard → **Project Settings → Authentication → SMTP Settings**.
Confirm **Enable Custom SMTP** is ON and:

| Field        | Value                           |
| ------------ | ------------------------------- |
| Sender email | `hello@gharmish.com`            |
| Sender name  | `Gharmish`                      |
| Host         | `smtp.resend.com`               |
| Port         | `465` (SSL) or `587` (STARTTLS) |
| Username     | `resend`                        |
| Password     | your Resend API key (`re_…`)    |

- **Rate limit:** already raised from the default `2/hr` to **`25/hr`**
  (confirmed in auth logs). Fine for soft launch; revisit before a big push
  (Authentication → Rate Limits → "Emails sent").
- **Site URL** = `https://gharmish.com`, and add it to **Redirect URLs** —
  so the fallback magic link in the email resolves correctly.

---

## 4. End-to-end test (do this last)

1. Go to `/en/sign-in`, choose **Email**, enter a real inbox.
2. **Resend → Emails/Logs**: confirm the message was accepted/delivered.
3. In the inbox: the email shows a **6-digit code** (not just a link), and
   lands in the **inbox, not spam**.
4. Type the code → you're signed in and land on `/me`.
5. Check the header: in Gmail, "show original" → **SPF / DKIM / DMARC = PASS**.

When all five pass, email auth is production-perfect.
