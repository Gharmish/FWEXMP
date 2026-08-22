# Host listing create/edit — UX + engineering audit

**Date:** 2026-08-22 · **Scope:** `/host/experiences/new`, `/host/experiences/[id]`, `features/host-experiences/*` · **Lens:** Airbnb Experiences host-onboarding standard (senior eng + product design)

Severity: **P0** integrity/blocker · **P1** hurts conversion or trust, fix before inviting more hosts · **P2** quality · **P3** polish.

---

## Remediation — 2026-08-22 (same day, all fixed unless noted)

| Finding                        | Status                                      | How                                                                                                                                                                                                                                             |
| ------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1 pause from any status     | **Fixed**                                   | `pauseHostExperience` is a conditional `WHERE status='live'`; zero rows → `wrong_state`                                                                                                                                                         |
| P1-1 monolithic create         | **Fixed**                                   | `/new` is name + category only (`newExperienceSchema`); row lands in `draft` with `UNSET_*` sentinels; edit form has a sticky save bar + `beforeunload` guard; draft saves use the relaxed `hostExperienceDraftSchema`, public rows stay strict |
| P1-2 default Abha pin          | **Fixed**                                   | Drafts store `0/0`; picker opens on Abha with no marker; readiness requires a pin inside the Saudi box; public preview hides the map for an unpinned draft                                                                                      |
| P1-3 price set blind           | **Fixed**                                   | Live "You keep ≈ X" under the price input (`splitCommission`, live VAT setting)                                                                                                                                                                 |
| P1-4 no readiness checklist    | **Fixed**                                   | `lib/readiness.ts` is the single predicate behind the `ReadinessCard` and the publish gate; submit is disabled with "Finish '…' to submit"                                                                                                      |
| P1-5 English mandatory         | **Fixed**                                   | Either language creates/saves a draft; admin approval now also gates on English (`needs_english`); `pickLocalized` falls back across languages                                                                                                  |
| P1-6 buried form, silent save  | **Fixed**                                   | Order: status → checklist → actions → details form → hero → gallery → timeline → calendar → share; `?saved=1` / `?saved=review` / `?created=1` banners                                                                                          |
| P1-7 every edit demotes        | **Fixed**                                   | Material-field diff (`MATERIAL_FIELDS`); non-material edits save in place with an `edited` audit event; warning now shown for `paused` too and lists which fields re-review                                                                     |
| P2-1 public link → catalog     | **Fixed**                                   | Links to `/experiences/{slug}` via the i18n `Link`                                                                                                                                                                                              |
| P2-2 duplicate unwired         | **Fixed**                                   | Duplicate button on every non-archived status                                                                                                                                                                                                   |
| P2-3 no delete                 | **Fixed**                                   | `deleteDraftExperience` (draft-only, refuses with `has_bookings`, best-effort storage sweep) behind a `ConfirmSubmit` dialog                                                                                                                    |
| P2-4 editable mid-review       | **Fixed**                                   | `updateHostExperience` returns `locked_review`; the form renders disabled with a notice (consistent with the timeline lock)                                                                                                                     |
| P2-5 no client validation      | **Fixed**                                   | Character counters on title/description; blur validation with the same strict zod fields                                                                                                                                                        |
| P2-6 defaults shipped as-is    | **Fixed**                                   | Placeholders; sentinels render as empty inputs                                                                                                                                                                                                  |
| P2-7 duration in minutes       | **Fixed**                                   | Hours + minutes pair, folded server-side                                                                                                                                                                                                        |
| P2-8 three-tap hero upload     | **Fixed**                                   | Crop-apply submits the form                                                                                                                                                                                                                     |
| P2-9 one start time            | **Not done**                                | Data-model change; roadmap                                                                                                                                                                                                                      |
| P2-10 archived editable        | **Fixed**                                   | `archived` guard + read-only form                                                                                                                                                                                                               |
| P2-11 English-only copy suffix | **Fixed**                                   | `(copy)` / `(نسخة)` per language                                                                                                                                                                                                                |
| P3                             | **Fixed** except min group size (DB column) | Dead policy codes removed, Arabic-Indic digits normalised, slug note, "Logistics" / "What's included", min-age hint, neutral paused tone                                                                                                        |

Not in this pass: in-app client-side navigation guard (Next has no router-level prompt; `beforeunload` covers tab close/reload only), pending-version review (P1-7 "right" variant), minimum group size.

---

## Scorecard (as audited, before remediation)

| Area                        | Score | One-liner                                                                                    |
| --------------------------- | ----- | -------------------------------------------------------------------------------------------- |
| Data integrity & auth       | 6/10  | Ownership chokepoint is solid; one unguarded transition lets unreviewed content go live      |
| First-listing creation      | 4/10  | 22 required fields up-front, no save-as-you-go, copy promises the opposite                   |
| Editing an existing listing | 5/10  | The editable form is the 7th section on the page; silent save; every edit triggers re-review |
| Pricing clarity             | 4/10  | Host sets a price with no take-home, VAT, or per-guest context at the moment of deciding     |
| Readiness / publish flow    | 5/10  | One combined error string instead of a checklist; Arabic gate invisible to the host          |
| Validation feedback         | 6/10  | Server echo + error focus are good; zero inline/client feedback, no counters                 |
| Bilingual authoring         | 7/10  | Side-by-side EN/AR is right; required-language choice is backwards for Arabic-first hosts    |
| Place / map                 | 8/10  | Tap/drag/search/paste/manual — excellent. Default pin is the only hole                       |
| Accessibility               | 8/10  | Legends, aria-invalid, alert focus, chip focus ring — well done                              |

---

## What's already good (don't regress)

- Failure states echo `values` so a server error never wipes the longest form in the product ([actions.ts:118](features/host-experiences/actions.ts:118)).
- Error focus: the first `aria-invalid` field scrolls into view and takes focus ([experience-form.tsx:296](<app/[locale]/host/(dashboard)/experiences/[id]/experience-form.tsx:296>)).
- Ownership chokepoint `requireOwnership` returns `not_found` never `forbidden` — no id probing.
- Live-edit demote uses a conditional `WHERE status='live'` with a race fallback, and writes an audit event.
- Weekday chips styled from `:checked`, with a mirrored focus ring on the sr-only input.
- Cancellation tier: short names in the `<select>`, full terms of the current tier rendered below where they can't clip.
- Location picker: four input paths (tap, drag, Nominatim search, paste-a-Maps-link) with a no-JS manual fold.
- Legacy/disabled city preserved as an extra option so editing never silently relocates a listing.

---

## P0 — must fix

### P0-1 · `pauseHostExperience` is callable from any status → unreviewed content can go live

[actions.ts:459](features/host-experiences/actions.ts:459) sets `status = 'paused'` with no `eq(experiences.status, 'live')` guard. The UI only renders the Pause button on `live`, but the server action is a public endpoint for any signed-in host.

**Exploit path (all host-side, no admin):** create draft → POST `pauseHostExperience` → row is `paused` → click **Republish** → [`publishHostExperience` paused branch](features/host-experiences/actions.ts:348) deliberately skips moderation ("already passed review") → listing is `live`. The Arabic-placeholder, moments-Arabic and inclusions-Arabic gates in `approveExperience` are all bypassed. Same path resurrects an **admin-archived** listing.

**Fix:** add `eq(experiences.status, 'live')` to the pause `WHERE`, return `wrong_state` on zero rows. Consider a DB-level trigger or a `hasPassedReview` boolean instead of inferring "passed review" from `paused` — the inference is the root cause.

---

## P1 — fix before onboarding more hosts

### P1-1 · The create form contradicts its own promise

Copy: _"Start with a working title and a paragraph or two. You can save as a draft and refine it."_ Reality: the `Create draft` button requires title (8+), description (60+), category, duration, start time, cutoff, price, group size, min age, place name, city, coordinates, tier — ~22 inputs across five sections — before anything is persisted. Close the tab at field 15 and everything is gone.

Airbnb's pattern: persist a draft on step 1 (title only), then every subsequent section saves independently. Gharmish already has the architecture for this on the edit page (hero, gallery, moments, calendar each save on their own) — only the "basics" form is monolithic.

**Fix (minimum):** make `createDraftExperience` accept title + category only (relax the schema for `status='draft'`; keep strict validation in `publishHostExperience`, which already re-checks description/inclusions/weekdays). Redirect to the edit page immediately. Add a `beforeunload` guard while the form is dirty.

**Fix (Airbnb-grade):** stepper — _Basics → Practicalities → Place → Details → Availability → Photos → Review_ — each step its own action, progress persisted.

### P1-2 · Coordinates silently default to Abha city centre

[experience-form.tsx:652](<app/[locale]/host/(dashboard)/experiences/[id]/experience-form.tsx:652>) seeds `lat/lng` with `18.2164, 42.5053` on create. A host who never touches the map submits a "valid" pin at Abha centre; the public map, the reminder WhatsApp's Google Maps link, and the e-ticket all point to the wrong place. The schema comment on `lat` says this exact bug is why coordinates became host-entered — the default reintroduces it.

**Fix:** on create, render the map centred on Abha but with **no pin** and empty `lat/lng` inputs; block `publishHostExperience` (not draft save) on missing coords with a `needs_location` message. Show a "Pin not set" badge in the readiness checklist (P1-4).

### P1-3 · Price is set blind

`Price per guest` sits in "Practicalities" with no context. The host doesn't see: whether it's VAT-inclusive (it is — owner decision), what Gharmish keeps, or their per-guest payout. That information exists — the "Partnership share" block on the edit page — but it's a different section, on a different page, in a different request. An Airbnb host sees _"Guests pay 240 · You earn 192"_ the instant they type.

**Fix:** pass `commissionBps` + VAT setting to the form; render a live `You keep ≈ X per guest` line under the price input (client-side math with `splitCommission`). Drop the separate commission `<dl>` or fold it under the price.

### P1-4 · "Submit for review" has no readiness checklist

The host gets one of: a combined string listing three unrelated conditions (`cannotPublish`), or `needsHero` — discovered only after clicking. Meanwhile the **admin** approval gate additionally requires non-placeholder Arabic title/description, Arabic for every moment, and Arabic lists when English lists exist. A host who leaves Arabic blank (as the copy invites) submits, waits, and the reviewer can't approve until someone on the team translates — the host never sees this state.

**Fix:** a readiness card above the lifecycle buttons, computed server-side from the row:

- ☑ Title & description · ☐ Hero photo · ☐ 5+ gallery photos (mosaic threshold) · ☐ Meeting point pinned · ☐ At least one weekday · ☐ What's included · ☐ Arabic copy (you / Gharmish team) · ☐ Timeline (recommended)

Disable/replace the submit button with the first unmet item. Use the same predicate in `publishHostExperience` so UI and server can't drift.

### P1-5 · English is required, Arabic is optional — for Arabic-first hosts

Brief §1: year-1 hosts are local Saudis; market is Arabic-first. Yet `titleEn`/`descriptionEn` are the hard requirement and Arabic is "optional — our team adds it". A host in Rijal Almaa with weak written English is blocked from creating a draft; a host with strong Arabic is told their Arabic is the optional half.

**Fix:** require **at least one** language (either EN or AR pair complete), mark the other "optional — we translate". Slug derivation needs an ASCII fallback when only Arabic exists (`experience-<suffix>` already exists as the fallback in `experienceBaseSlug`). Moderation gate stays as-is: both languages before live.

### P1-6 · Edit page IA: the form is the last of seven sections, and saving is silent

Order today: back link → status → preview → (feedback) → lifecycle buttons → partnership share → hero → gallery → calendar → timeline → **the form**. The `Save changes` button is at the bottom of ~3 screens on desktop, ~8 on mobile. After save, `updateHostExperience` redirects to the same URL — no toast, no "Saved", no diff. The host can't tell whether it worked.

**Fix:**

1. Sticky bottom bar on the form: `Unsaved changes · Save` (appears on dirty), with the live-listing warning inline in the bar.
2. Success feedback: redirect with `?saved=1` and render a dismissible status line, or return `{ success: true }` and toast.
3. Reorder for the "what do I do next" reading: status + readiness → form → photos → timeline → calendar → partnership share. Or adopt Airbnb's left tab rail (Listing details · Photos · Availability · Pricing · Policies) — the admin shell already has the rail pattern.

### P1-7 · Every edit of a live listing pulls it off the catalog

Fixing a typo in "What to bring" → `pending_review` → listing vanishes from `/experiences`, bookings stop, moments lock, until a human approves. The warning exists for `live` but **not for `paused`**, which demotes identically ([actions.ts:245](features/host-experiences/actions.ts:245)).

**Fix (now):** show `liveEditWarning` for `paused` too.
**Fix (right):** field-level re-review. Compare the incoming payload to the row; only _material_ fields (title, description, category, price, place/coords, hero) trigger demotion. Non-material fields (what-to-bring, inclusions wording, cutoff, weekdays, Arabic copy additions) save in place with an audit event. Even better: keep the old version live and review the _pending version_ (a `pending_payload` jsonb column) — zero catalog downtime.

---

## P2 — quality

| #     | Finding                                                                                                                                                                                         | Where                                                                                                                                   | Fix                                                                                                                                |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| P2-1  | **"View public page" goes to the catalog index, not the listing.**                                                                                                                              | [lifecycle-actions.tsx:118](<app/[locale]/host/(dashboard)/experiences/[id]/lifecycle-actions.tsx:118>) `href={/${locale}/experiences}` | Pass `slug`, link to `/experiences/${slug}`; use `@/lib/i18n` `Link` instead of `next/link` + manual locale.                       |
| P2-2  | **`duplicateHostExperience` exists but has no UI.** 90 lines of action, zero call sites.                                                                                                        | [actions.ts:546](features/host-experiences/actions.ts:546)                                                                              | Wire a `Duplicate` secondary action on the edit page (or delete the dead code).                                                    |
| P2-3  | **No way to delete or archive a draft.** A host who creates a test draft carries it forever in the list.                                                                                        | lifecycle UI                                                                                                                            | `Delete draft` (hard delete allowed only while `draft` with zero bookings); `Archive` for paused/live.                             |
| P2-4  | **Edits allowed during `pending_review`; timeline locked.** The reviewer can be reading a moving target while the host is told the timeline is frozen.                                          | `updateHostExperience` has no `pending_review` branch                                                                                   | Either lock the whole listing during review (consistent with moments) or unlock moments too. Pick one.                             |
| P2-5  | **No client-side validation.** `noValidate` + HTML `minLength`/`required` attrs → every error costs a server round trip and a page reflow; no character counters on the 8–120 / 60–4000 fields. | form                                                                                                                                    | Keep server as source of truth; add `onBlur` zod check of the same schema client-side, counters on title/description (`43 / 120`). |
| P2-6  | **Defaults pre-fill real values** (price 200, 120 min, group 8, 09:00, min age 0). Defaults read as suggestions; hosts ship them. Sunset hikes at 09:00 was the original start-time bug.        | [experience-form.tsx:472–576](<app/[locale]/host/(dashboard)/experiences/[id]/experience-form.tsx:472>)                                 | Use `placeholder` for create, `defaultValue` only from the row on edit. Keep min-age 0 and cutoff 2h as genuine defaults.          |
| P2-7  | **Duration in minutes.** Hosts think "3 hours", not "180".                                                                                                                                      | duration input                                                                                                                          | Hours + minutes pair, or preset chips (1h · 1.5h · 2h · 3h · half-day · full-day) with a custom fallback. Store minutes as today.  |
| P2-8  | **Hero upload is three taps**: Choose → Crop → _Upload photo_. The third step is a separate submit that appears after crop; hosts miss it and think the photo is saved.                         | [photo-upload.tsx:189](features/host-experiences/components/photo-upload.tsx:189)                                                       | Submit automatically on crop-apply (`form.requestSubmit()`), show a progress state on the preview.                                 |
| P2-9  | **One start time per experience.** A host who runs 08:00 and 16:00 sessions must create two listings (and get two slugs, two review cycles, two galleries).                                     | schema `startTime`                                                                                                                      | Out of scope for this pass but the #1 structural gap versus Airbnb; note for the roadmap.                                          |
| P2-10 | **Archived listings are fully editable** via the form (no status guard in `updateHostExperience`), while photos are locked with a message that says "archived — can't be changed".              | actions.ts                                                                                                                              | Guard `archived` in `updateHostExperience` with `wrong_state`; render the form read-only.                                          |
| P2-11 | **`(copy)` suffix is English-only** and lands in `titleEn` even for an Arabic-locale host; `titleAr` is copied verbatim so both listings share an Arabic title.                                 | [actions.ts:565](features/host-experiences/actions.ts:565)                                                                              | Suffix both titles (`(نسخة)` for AR). Moot until P2-2 is wired.                                                                    |

---

## P3 — polish

- `policy_short` / `policy_long` error codes and their copy are dead — the free-text policy field was replaced by tiers ([experience-form.tsx:48](<app/[locale]/host/(dashboard)/experiences/[id]/experience-form.tsx:48>)).
- Arabic-Indic digits (`٢٠٠`) in `type="number"` inputs coerce to `NaN` server-side and surface as the generic "Check this field." — normalise digits in `parseForm` before `z.coerce.number`.
- The `/experiences/{slug}` line under the H1 has no label; hosts ask whether they can change it. One line of copy: _"Your listing's address — set from the first title, stays stable."_
- `sectionDetail` is labelled "Practical detail" while the previous section is "Practicalities" — two adjacent sections with near-identical names. Rename to "What's included" / "Logistics".
- `minAge` is required with default 0; a "No minimum" presentation reads better than a numeric 0.
- Group size has a max but no minimum — Type B / private experiences with a 2-guest floor can't express it.
- `Badge` status tones: `paused` and `pending_review` share the same `pending` tone; a paused listing is host-controlled and shouldn't read as "waiting on Gharmish".

---

## Recommended order

1. **P0-1** pause guard — one-line `WHERE`, ship today.
2. **P1-2** no default pin + **P1-7 (now)** paused warning + **P2-1** public link — small, same afternoon.
3. **P1-4** readiness checklist (shared predicate with `publishHostExperience`) — unlocks clear host self-service and removes the reviewer's back-and-forth.
4. **P1-3** live take-home under price — small client-side change, big trust win.
5. **P1-6** sticky save + saved feedback + section reorder.
6. **P1-1 / P1-5** title-only draft creation + either-language requirement — schema change, touches create + publish.
7. **P1-7 (right)** material-field re-review — design decision for the owner first.
8. P2 batch.

Owner decisions needed before building: (a) either-language requirement vs English-mandatory (P1-5); (b) which fields are "material" for re-review, or whether to build pending-version review (P1-7); (c) whether hosts may delete drafts (P2-3).
