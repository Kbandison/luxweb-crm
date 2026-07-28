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

Business hours for the slot picker are a constant (Eastern, Mon–Fri 9–5, 30-min) in `src/lib/outreach/availability.ts` — lift into `outreach_settings` if hours differ or you add setters in other time zones.

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
