# LuxWeb CRM — Deploy Runbook

Target: **portal.luxwebstudio.dev** on Vercel (linked to the `luxweb-crm` GitHub repo), shared Supabase, live Stripe, Resend.

Drives the first push to production and the recurring promotion flow afterward.

---

## 0. Pre-flight (verify before touching Vercel)

- [ ] `npm run build` succeeds locally with no errors
- [ ] `npx tsc --noEmit` passes
- [ ] `.env.local` populated with real values (Supabase, Stripe live + webhook, Resend, app URL)
- [ ] Supabase `crm` schema + exposed tables match the repo's migrations (all `crm-master/*.sql` files have been run)
- [ ] Resend domain `luxwebstudio.dev` verified (SPF / DKIM / DMARC in DNS)
- [ ] Stripe live-mode keys ready (`sk_live_…`, `pk_live_…`)

**Upgrade the Vercel CLI first:**
```bash
npm i -g vercel@latest        # current CLI; old 50.x still works but 51.x has agentic features
vercel --version              # should print 51.x
```

---

## 1. Link the repo to Vercel

```bash
vercel login                  # browser-based auth
cd ~/Coding/personal/luxweb-crm
vercel link                   # select team → create new project "luxweb-crm" → confirm dir
```

This creates `.vercel/project.json` (gitignored). It tells future `vercel` commands which project you're in.

---

## 2. Push env vars to Vercel

Every `NEXT_PUBLIC_*` + server-only key in `.env.local` needs to exist in Vercel too. Do this once per environment (`production`, `preview`, `development`).

```bash
# One by one — interactive prompt asks for the value and the environments:
vercel env add NEXT_PUBLIC_SUPABASE_URL           production preview
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY      production preview
vercel env add SUPABASE_SERVICE_ROLE_KEY          production preview
vercel env add STRIPE_SECRET_KEY                  production   # live key (sk_live_…)
vercel env add STRIPE_SECRET_KEY                  preview      # test key (sk_test_…) for preview branches
vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY production   # pk_live_…
vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY preview      # pk_test_…
vercel env add STRIPE_CARE_PLAN_PRICE_ID          production preview
vercel env add STRIPE_WEBHOOK_SECRET              production   # from the prod webhook endpoint (set in §5)
vercel env add RESEND_API_KEY                     production preview
vercel env add RESEND_FROM_EMAIL                  production preview
vercel env add RESEND_REPLY_TO                    production preview
vercel env add NEXT_PUBLIC_APP_URL                production   # https://portal.luxwebstudio.dev
vercel env add NEXT_PUBLIC_APP_URL                preview      # leave blank or set to the preview URL pattern
```

`SENTRY_DSN` can stay unset until the Sentry project exists.

`ADMIN_NOTIFICATIONS_EMAIL` is optional — internal alerts default to `alerts@luxwebstudio.dev`. Set it only to route them somewhere else:
```bash
vercel env add ADMIN_NOTIFICATIONS_EMAIL production
```
⚠️ Whatever address you use must be able to **receive** mail. `alerts@luxwebstudio.dev` is also the *From* for admin-category email, and a verified Resend sending domain does not by itself create an inbox — you need MX records or forwarding on that address, or the alerts go nowhere.

Verify:
```bash
vercel env ls
```

---

## 3. First preview deploy

```bash
vercel                        # builds + deploys to a preview URL
```

Open the preview URL, log in with your seeded admin account. The proxy will redirect to `/admin/dashboard`.

**Expected limitations on preview:**
- OAuth Google sign-in won't work until the preview URL is added to Supabase Auth allowlist (fix below)
- Stripe webhook won't fire on preview unless you register a separate preview webhook endpoint (usually skip)
- Resend domain email works identically

---

## 4. Domain + production deploy

### 4a. Domain
In Vercel dashboard: **Project → Settings → Domains → Add** → `portal.luxwebstudio.dev`.

Vercel shows the DNS records to add at your registrar. Typical: either CNAME `portal → cname.vercel-dns.com` or A/AAAA to Vercel's IPs. Wait for verification (~minutes).

### 4b. Production deploy
```bash
vercel --prod
```

Visit `https://portal.luxwebstudio.dev` — expect proxy redirect to `/login`.

---

## 5. Register the production Stripe webhook

1. **Stripe Dashboard → Developers → Webhooks → Add endpoint**
2. URL: `https://portal.luxwebstudio.dev/api/webhooks/stripe`
3. Events to enable:
   - `invoice.paid`
   - `invoice.payment_failed`
   - `invoice.marked_uncollectible`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Save → copy the **signing secret** (starts with `whsec_`)
5. Push it:
   ```bash
   vercel env rm STRIPE_WEBHOOK_SECRET production
   vercel env add STRIPE_WEBHOOK_SECRET production   # paste the new whsec_
   vercel --prod                                      # redeploy so the function picks it up
   ```

---

## 6. Supabase Auth — production URLs

In Supabase Dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://portal.luxwebstudio.dev`
- **Redirect URLs** (add all — comma-separated):
  - `https://portal.luxwebstudio.dev/auth/callback`
  - `https://portal.luxwebstudio.dev/accept-invite`
  - `https://portal.luxwebstudio.dev/reset-password`
  - `http://localhost:3000/auth/callback` (keep for local dev)
  - `http://localhost:3000/accept-invite`
  - `http://localhost:3000/reset-password`

Google OAuth client in Google Cloud Console: make sure its redirect URI = the Supabase callback already configured; no changes needed here.

> This "Sign in with Google" client uses only **basic scopes** (email/profile) — non-sensitive, so it needs **no verification** and shows **no warning**. Keep it **External + In production**. It is a *separate* OAuth client from the Calendar one below (§6b) — do not merge them.

---

## 6b. Google Calendar — outreach appointment sync

Powers the outreach module: the **owner connects their Google Calendar once**, then booked appointments create events on that calendar (prospect invited) and free/busy drives the slot picker. This is **owner-only** — clients and setters never touch this OAuth flow.

**This is a DIFFERENT Google OAuth client than the Supabase "Sign in with Google" one (§6).** The `calendar.events` scope is *sensitive*, and the OAuth consent screen's **User type (Internal/External)** and **Publishing status (Testing/In production)** are **per Google Cloud project** — they apply to *every* OAuth client in that project. So how you set them up matters:

1. **Prereq:** apply `crm-master/crm_outreach.sql` (two parts — enum first, then tables). Tokens are encrypted with the already-set `CREDS_ENCRYPTION_KEY`.

2. **In the Calendar OAuth client** (Google Cloud Console → Credentials):
   - Authorized **redirect URI**: `https://portal.luxwebstudio.dev/api/admin/google/callback`
   - Scopes requested by the app: `https://www.googleapis.com/auth/calendar.events` and `https://www.googleapis.com/auth/calendar.freebusy`

3. **Consent screen** — leave it **External + "In production."**
   - The owner sees a one-time **"Google hasn't verified this app"** screen (sensitive scope) → **Advanced → Continue**. That's fine — only the owner ever sees it.
   - **Clients are never affected**: the connect flow is `requireAdmin`, and clients have no path to it. Their "Continue with Google" login (§6) is untouched.
   - ⚠️ **Do NOT set this consent screen to "Internal" or "Testing" if the Calendar client shares a project with the login client (§6)** — both would block external clients from "Continue with Google." If you ever want Internal (to drop the owner's warning), first move the Calendar client into its **own dedicated project**, then set that project Internal.
   - ⚠️ **Avoid "Testing" publishing status** regardless — it expires the refresh token every **7 days** (weekly re-auth). "In production" keeps the connection alive.

4. **Env vars** (production; degrade gracefully — without them, booking still saves locally, just no calendar sync):
   ```bash
   vercel env add GOOGLE_CLIENT_ID      production
   vercel env add GOOGLE_CLIENT_SECRET  production
   vercel --prod                        # redeploy so functions pick them up
   ```

5. **Connect:** `/admin/outreach` → **Connect** → choose the owner's Google account → approve. The widget shows "Connected as …".

Booking availability (time zone + per-day hours), targets, and commission rate are owner-editable in **Settings** on `/admin/outreach`.

---

## 6c. Outreach — setter quality-of-life migration

`crm-master/crm_outreach_qol.sql` adds the call script, objection notes, and the auto-retire threshold. **Two parts** — the new `unreachable` enum value must be committed before the columns that use it:

1. Run **PART 1** alone (`alter type crm.prospect_status add value …`).
2. Run **PART 2** (the `outreach_settings` columns).

Everything degrades gracefully until it's applied: `getOutreachSettings` reads with `select('*')`, so missing columns fall back to defaults (auto-retire `0` = off, empty script), and `unreachable` is filtered in JS rather than SQL so the call list can't blank out. Saving the script from the Settings drawer is what fails first if you skip it.

The daily callback reminder (`/api/cron/outreach-callbacks`, 12:00 UTC) reuses the existing `CRON_SECRET` — no new env var. Emails go to each setter with callbacks due or overdue.

---

## 6d. ByteBoundless → CRM lead push

ByteBoundless (the lead-finding tool) pushes businesses straight onto a setter's call list — no CSV round trip. **The CRM is the system of record for calls**: ByteBoundless finds and qualifies, the CRM logs every dial.

1. **Migration:** apply `crm-master/crm_prospects_external.sql` (single step). Adds `website`, `external_source`, `external_id` to `crm.prospects` plus a partial unique index so re-sending the same business is a no-op.

2. **Shared key** — generate one and set it on *both* apps:
   ```bash
   openssl rand -base64 32
   vercel env add OUTREACH_INGEST_KEY production   # this repo
   ```
   In ByteBoundless set the same value as `LUXWEB_CRM_INGEST_KEY`, plus `LUXWEB_CRM_URL=https://portal.luxwebstudio.dev`.

3. **Endpoint:** `POST /api/outreach/ingest`, `Authorization: Bearer <key>` (or `x-api-key`). Body:
   ```json
   {
     "source": "byteboundless",
     "assign_to": "setter@example.com",
     "leads": [{
       "external_id": "<byteboundless business id>",
       "business_name": "Apex Auto Repair",
       "phone": "(770) 555-0142",
       "email": "rob@apexauto.com",
       "website": "https://apexauto.com",
       "industry": "Auto repair",
       "angle": "7s load, no phone above the fold",
       "notes": "Wix · score 82 · 3.9★ (41 reviews)"
     }]
   }
   ```
   `assign_to` must be a CRM user with `manage_outreach`; omit it and the leads go to the studio owner. Returns `{ imported, skipped, conflicts }` — the same duplicate check as the CSV importer, so a business another setter is already calling is skipped, not handed out twice.

4. **Verify:** `curl -s -o /dev/null -w '%{http_code}' -X POST https://portal.luxwebstudio.dev/api/outreach/ingest` → `401` (key required, endpoint live).

---

## 6d-2. The LuxWeb assistant → CRM (`/api/agent/*`)

The assistant (Kevin's Claude project) emails prospects and leads from Gmail and records it here, books discovery calls, and keeps prospects and deals current — through the same logic the setter and admin screens use, never raw database writes. It acts as the studio owner: its rows are attributed to Kevin, and every audit row it writes carries `via: 'agent'`.

1. **Migration:** apply `crm-master/crm_prospect_calls_channel.sql`. Adds `channel` (`call` | `email`, default `call`) to `crm.prospect_calls`, so emails show as emails in a prospect's history and stay out of the setter scorecard. Apply it **before** deploying this code: the scorecard and history queries select the column.

2. **Key:**
   ```bash
   openssl rand -base64 32
   vercel env add AGENT_API_KEY production
   ```
   In the Claude project, add it under the environment's **Network secrets**: website `portal.luxwebstudio.dev`, header `Authorization`, prefix `Bearer`, the key as the value. The ingest route accepts this key too, so the assistant can add prospects with it.

3. **Routes** (all take `Authorization: Bearer <key>`; times must carry an offset):

   | Route | Does |
   |---|---|
   | `POST /api/agent/prospects/{id}/log` | Record a touch: `{channel: "email"\|"call", disposition, note, occurred_at, next_action, next_action_at}`. Dispositions: contacted, no_answer, callback, interested, not_interested, bad_number, dnc. An email never downgrades a prospect further along; do-not-contact prospects are refused (409). |
   | `PATCH /api/agent/prospects/{id}` | Status (not booked/converted), next follow-up, contact details, `append_note`. |
   | `GET /api/agent/availability?duration=30&days=10` | Open slots, the same ones a setter's booking drawer offers. |
   | `POST /api/agent/appointments` | Book: calendar event + invite, appointment, `booked` history row, promotion to contact + deal. Refuses a busy slot (409); a retry returns the existing booking. |
   | `PATCH /api/agent/appointments/{id}` | Move (`scheduled_at`, `duration_min`), cancel (`status: "canceled"`), or `notes`. A move that can't reach the calendar isn't recorded (502). |
   | `POST /api/agent/notes` | Private note on a contact or deal; with `activity: "email_sent"\|"email_received"` and `subject`, also on the contact's Activity tab. |
   | `PATCH /api/agent/deals/{id}/stage` | `lead` / `discovery` / `proposal` only, and only from those stages. |

   Not exposed: agreements, invoices, payments, portal invites, milestones, revisions, deletes.

4. **Verify:** `curl -s -o /dev/null -w '%{http_code}' https://portal.luxwebstudio.dev/api/agent/availability` → `401`. With the key → `200` and a `slots` list.

---

## 6d-3. Google reviews (`crm.google_reviews`)

Clients review the studio on Google, never in the CRM. Once a day the assistant reads the studio's Google reviews (through Metricool, which has the Google Business Profile connected) and copies them here. Each one lands on the Reviews page; a reviewer whose name matches exactly one contact gets the review as a private note and a `google_review` line on their Activity tab. The rest wait on the Reviews page for Kevin to link. Nothing is ever written to Google.

1. **Migration** (applied 2026-10-22 as `crm_google_reviews`):
   ```sql
   create table crm.google_reviews (
     id uuid primary key default gen_random_uuid(),
     google_review_id text not null unique,
     reviewer_name text not null,
     reviewer_photo_url text,
     rating smallint not null check (rating between 1 and 5),
     body text,
     reviewed_at timestamptz not null,
     replied boolean not null default false,
     contact_id uuid references crm.contacts(id) on delete set null,
     show_on_site boolean,   -- Kevin's switch; null = 4-5 stars with text
     removed_at timestamptz, -- gone from Google; never shown
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   );
   create index google_reviews_contact_idx on crm.google_reviews (contact_id);
   alter table crm.google_reviews enable row level security;
   revoke all on crm.google_reviews from anon, authenticated;
   grant select, insert, update, delete on crm.google_reviews to service_role;
   create trigger google_reviews_touch before update on crm.google_reviews
     for each row execute function crm.touch_updated_at();
   ```

2. **Routes:**

   | Route | Does |
   |---|---|
   | `POST /api/agent/google-reviews` | `{reviews: [{google_review_id, reviewer_name, reviewer_photo_url?, rating, body?, reviewed_at, replied?}], complete?: boolean}`. Stores new reviews (matching the reviewer to a contact), updates what changed on Google, and with `complete` marks stored reviews missing from the list as removed (skipped for an empty list). Never touches Kevin's site switch or client links. Returns each review as `new` / `updated` / `unchanged` with `contact_id` and `on_site`, plus `removed`. Agent key. |
   | `PATCH /api/admin/google-reviews/{id}` | Kevin's controls from the Reviews page: `show_on_site` (true, false, or null for the default rule) and `contact_id` (linking adds the note on that client). `manage_reviews`. |
   | `GET /api/public/reviews` | The site's feed: reviews on the site with written text, newest first, named "Jane S.", plus `summary: {count, average}` over every review still on Google and `reviewUrl`. No key. |

3. **Portal:** a completed project shows every client the same "Leave a Google review" button (sending only happy clients to Google is review gating, which Google forbids), or a thank-you once their review is in. The old in-portal review form is gone; Kevin's private rating and notes on a project stay.

---

## 6e. Mercury — banking & finances

The finance pages mirror your Mercury accounts and transactions into `crm.bank_accounts` / `crm.bank_transactions` so they can report history without hitting the API on every render.

1. **Migration:** apply `crm-master/crm_banking.sql` (single step, no enums).

2. **Token — use READ ONLY.** Mercury dashboard → Settings → Tokens → Create an API Token → **Read Only**.
   ```bash
   vercel env add MERCURY_API_TOKEN production
   vercel --prod        # redeploy so functions pick it up
   ```
   Read-only is a deliberate ceiling, not an oversight. Mercury's read-write tokens **require IP allowlisting**, and Vercel only offers static egress IPs via Static IPs ($100/mo per project, Pro+) or Secure Compute (Enterprise). It also keeps a money-moving credential out of an app that contractors and setters sign into. Payments stay in Mercury's dashboard.

3. **First sync:** open `/admin/finances` → **Backfill 365d**. After that the nightly cron (`/api/cron/sync-mercury`, 08:00 UTC, reuses `CRON_SECRET`) keeps a rolling 45-day window current — wide enough that pending transactions are re-synced once they settle.

**What's mirrored:** balances, amounts (converted to integer cents — Mercury returns floats, which are unsafe for money), status, kind, counterparty, memos, category, timestamps. **Not mirrored:** full account and routing numbers. Only the last four are stored, since staff roles can read these tables and the CRM never needs the rest.

Syncs are upserts and safe to re-run. The CRM-owned columns (`category`, `invoice_id`, `team_member_id`, `reconciled_at`, `crm_note`) are left out of the sync payload, so a re-sync can never wipe a categorization or a reconciliation.

Access is gated on `view_finance` — the same capability as Earnings, so owner / admin / finance / accountant.

---

## 6e-2. Invoice reconciliation

Matches bank deposits to the invoices they paid. **Prereq:** apply `crm-master/crm_invoice_reconciliation.sql` (single step).

That migration also **drops `bank_transactions.invoice_id`** from §6e. Stripe settles in batches, so one deposit routinely covers several invoices — a single foreign key can't express that. Nothing ever wrote to the column, so the drop is safe; `crm.invoice_reconciliations` is now the only source of truth.

**How matching works.** Rather than assuming Stripe's 2.9% + 30¢, the matcher computes the *implied* fee (invoice gross − deposit) and accepts a combination when that lands in a plausible range (≤4.5% + $1 per invoice). That survives rate changes, international cards, and direct client wires where a hardcoded rate would silently mis-match.

Two rules it will not break: a deposit can never exceed the gross it came from, and an invoice can only ever belong to one deposit (enforced by a unique constraint, not just UI).

Suggestions are proposals, never decisions — when several invoices share an amount, more than one match is arithmetically valid and only you know which is right. Matches are reversible via **Unmatch**.

---

## 6f. Mercury payouts (off by default)

The CRM can queue a payout that **you approve in Mercury** before any money moves. It is hidden until you switch it on.

```bash
vercel env add MERCURY_PAYMENTS_ENABLED production   # value: true
vercel --prod
```

Until that's set: no Payouts section on `/admin/finances`, and `/api/admin/finances/payments` and `/recipients` both return **404** — the same answer as an unknown route, so a probe learns nothing.

**No write token or static IP needed.** This uses Mercury's `request-send-money`, which per [their token policy](https://docs.mercury.com/docs/api-token-security-policies) works **without an IP allowlist** on a read-only token. Your existing `MERCURY_API_TOKEN` is sufficient. `createTransaction` (send immediately, no approval) is deliberately never called — that one *does* require a write token and an allowlist.

If you later add a dedicated write-scoped token, set `MERCURY_WRITE_TOKEN` and it's preferred automatically; nothing else changes.

**Safety properties, by design:**
- Every payout waits for human approval in Mercury's dashboard, and the approver must be someone other than the token's creator.
- The `payment_requests` row is written *before* Mercury is called, and its id is the idempotency key — a double-click, retry, or timeout-that-actually-succeeded can't produce two payouts.
- A Mercury rejection leaves the row as `failed` with the reason. A payment that might have been sent never vanishes from the record.
- $50,000 ceiling per request (`MAX_PAYOUT_CENTS`); anything larger goes through Mercury directly.
- Requires `manage_billing` — owner / admin / finance. An accountant can read the books but cannot queue money.
- Recipients are read live, never mirrored: they carry account and routing numbers the CRM has no reason to store.

**Prereq:** apply `crm-master/crm_payment_requests.sql` (single step).

---

## 7. Smoke test in production

Sign in as admin (`kbandison@gmail.com`) and walk these in order:

- [ ] `/admin/dashboard` — pipeline, active projects, unpaid invoices all render
- [ ] Create a test lead → appears on Leads
- [ ] Create a deal, drag through Lead → Active in Pipeline → contact moves to Clients
- [ ] Create a test project for the client
- [ ] Upload a small file → preview opens inline, download works
- [ ] Draft + send a proposal → shows in pending
- [ ] Create a $1 test invoice against the contact — Stripe finalizes + sends the email
- [ ] Pay that invoice from the Stripe hosted link using a real card
- [ ] Watch the Stripe webhook fire → invoice flips to Paid, you get the in-app notification + Resend receipt
- [ ] Invite the test contact to the portal → accept email arrives → they can log in and see their data
- [ ] On the client portal: proposal visible, accept flow captures IP + signed name, admin gets notified

If all 11 pass, the deploy is real.

---

## 8. Rollback if needed

Vercel keeps every deploy addressable. To rollback:

```bash
vercel ls                     # list recent deploys
vercel promote <deployment-url> --scope <team>
# or via dashboard: Deployments → ... → Promote to production
```

Or, for a quick rollback to the previous prod deploy: **Dashboard → Deployments → Find last known-good → Promote to Production**.

---

## Recurring promotion flow (after first deploy)

Once the repo is linked + domain configured, every push to `main` triggers an auto-deploy to production. PRs get preview URLs automatically. That's the ongoing pattern — no more manual `vercel --prod` unless you're deploying from an unlinked machine.

- Branch work → PR → Vercel posts preview URL
- Merge to `main` → auto-deploy to production
- Schema migrations: apply to Supabase first, then merge the code that expects them (since `notify pgrst, 'reload schema'` still has a propagation window)

---

## Deferred (future polish)

- Sentry DSN + error instrumentation on route handlers (Task #12 polish left this as a nice-to-have since `writeAudit()` already captures admin mutations)
- Stripe embedded `<PaymentElement />` in the client portal (currently uses `hosted_invoice_url`, which works fine)
- Supabase Realtime subscriptions for notifications / messages (polling-on-focus works today)
