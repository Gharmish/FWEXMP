# OTP auto-fill — one-tap sign-in codes (runbook)

Goal: the user never leaves the sign-in tab. The phone suggests the
6-digit code (above the keyboard or in a one-tap sheet), the form fills
and submits itself.

## What the app already does (shipped in code)

- The code input (`app/[locale]/(auth)/sign-in/sign-in-form.tsx`) has
  `autocomplete="one-time-code"` + `inputmode="numeric"` — this alone
  makes **iOS Safari** offer codes from **Messages (SMS)** and **Apple
  Mail** as a keyboard suggestion.
- **Android Chrome/Edge/Samsung Internet** get the **WebOTP API**
  (`features/auth/lib/use-web-otp.ts`): on the code step the browser
  shows a one-tap sheet when a correctly-formatted SMS arrives.
- The form **auto-submits** the moment a full 6-digit code lands
  (tap-to-fill, paste, or typed) — one tap completes sign-in.

## The SMS template requirement ⚠️ (do this when the SMS provider goes live)

Both Android WebOTP and iOS "domain-bound codes" key off the **last line
of the SMS**, which must be exactly:

```
@<domain> #<code>
```

So in Supabase Dashboard → **Authentication → Providers → Phone → SMS
template**, set:

```
Your Gharmish sign-in code is {{ .Code }}.

@gharmish.com #{{ .Code }}
```

Rules:

- The `@domain` must match the origin the sign-in page is served from,
  scheme-less, no `www`. One domain per message — if users still sign in
  on `gharmish-weld.vercel.app`, WebOTP will only fire for whichever
  domain is in the SMS. Use the canonical production domain.
- The `@domain #code` line must be the **final line** of the message.
- Without this line, iOS still suggests the code (heuristic since
  iOS 12), but Android shows nothing — the WebOTP sheet simply never
  appears. Nothing breaks; autofill just degrades.

## Email codes

iOS Mail / macOS Safari detect the code heuristically from the message
body — our Resend templates already make `{{ .Token }}` the visual hero
(see `docs/auth-emails/README.md`), which is what the detector needs.
Gmail-app-on-Android has no path into Chrome's autofill; those users
copy the code manually (auto-submit still saves them the button tap).

## WhatsApp

Browsers cannot autofill codes out of WhatsApp — WhatsApp's "one-tap
autofill" works only for **native Android apps** (it calls back into the
app via a signed intent). If we ever send sign-in codes over WhatsApp,
use a template with a **copy-code button**; the web form's paste +
auto-submit keeps that at two taps. (Today WhatsApp is used for booking
notifications only, not OTP.)

## Manual test matrix

| Platform       | Channel                       | Expected                                      |
| -------------- | ----------------------------- | --------------------------------------------- |
| iPhone Safari  | SMS                           | Code appears above keyboard → tap → signed in |
| iPhone Safari  | Email (Apple Mail)            | Same keyboard suggestion                      |
| Android Chrome | SMS with `@domain #code` line | Bottom sheet → tap → signed in                |
| Android Chrome | Email                         | No suggestion (expected) — paste auto-submits |
