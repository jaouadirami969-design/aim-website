# "Learn more" — how it works and how to run it

```
visitor on aimsummer.com                 Supabase (project "AIM", Montréal region)              Brevo (hello@aimsummer.com)
────────────────────────                 ────────────────────────────────────────              ───────────────────────────
1. email + consent box  ── POST ──▶  request-code
                                      · syntax, disposable domains, typo hints, MX lookup
                                      · 1 code / min / email · 5 / h / email · 20 / h / IP
                                      · upsert `leads` · hash the 6-digit code → `email_codes`
                                      · ───────────────────────────────────────────────────▶  email 1 · "Your AIM verification code: 482913"
2. the 6 digits          ── POST ──▶  verify-code
                                      · 10-minute expiry · 5 attempts · single use
                                      · `leads.status = verified`
                                      · ───────────────────────────────────────────────────▶  email 2 · the info pack (to the visitor)
                                      · ───────────────────────────────────────────────────▶  email 3 · "New info request — Sophie" (to hello@)
                                      · newsletter box ticked? → Brevo contact + list
3. thank-you.html  ◀── redirect ──    { ok: true, first_name }
```

Everything a visitor types is stored in Postgres (`public.leads`), every step is logged in `public.lead_events`,
and the website never talks to the database directly — only the two functions do (Row Level Security is on, no policies).

## Files

| Path | What |
| --- | --- |
| `functions/request-code/index.ts` | Step 1 — checks the address, stores the lead, emails the code |
| `functions/verify-code/index.ts` | Step 2 — checks the code, sends the info pack + the alert, syncs Brevo |
| `functions/*/common.ts` | Shared helpers (validation, DNS, HMAC, Brevo API). **Edit `request-code/common.ts`, then run `npm run functions:sync`** — `verify-code/` gets an identical copy (Edge Functions can't share files across folders when deployed from the dashboard/MCP). |
| `functions/*/emails.ts` | The three emails (HTML + plain text). Same rule: edit in `request-code/`, then sync. |
| `migrations/20261108120000_learn_more_leads.sql` | The three tables, indexes, trigger, RLS |
| `tests/` | A local test harness: fakes Supabase + Brevo and drives both functions end to end (`npm run test:functions`) |

## Secrets (Supabase → Project → Edge Functions → Secrets)

| Secret | Required | Value |
| --- | --- | --- |
| `BREVO_API_KEY` | **yes** | Brevo → profile menu → *SMTP & API* → *API Keys* → *Generate a new API key* (name it "aimsummer website"). Without it the functions still verify emails but answer `email_not_configured` and log the code server-side. |
| `BREVO_LIST_ID` | no | The numeric id of the newsletter list in Brevo (Contacts → Lists). Set it and ticked-box contacts are added to that list. |
| `ORG_ADDRESS` | recommended | The mailing address printed in every email footer (Canada's anti-spam law asks for one). Default: "Montréal, Québec, Canada". |
| `ORG_PHONE` | no | Phone number shown in the emails. Default `438-978-1687`; set it to an empty value to hide the phone. |
| `ORG_HOURS` | no | When the phone is answered. Default "Mon–Thu and weekends, 8 am – 8 pm Montréal time". |
| `NOTIFY_EMAIL` | no | Where the alerts go. Default `hello@aimsummer.com`. |
| `SENDER_EMAIL`, `SENDER_NAME` | no | Defaults `hello@aimsummer.com` / "AIM — Academy of Investment & Management". The sender must be verified in Brevo (it is). |
| `SITE_URL` | no | Default `https://aimsummer.com` — used for links and the logo in the emails. |
| `EMAIL_LOGO_URL` | no | Default `https://aimsummer.com/assets/logo/email-logo.png`. |
| `CODE_PEPPER` | no | Extra secret mixed into the code hashes. Defaults to the project's service-role key. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by Supabase.

## Deliverability checklist (do once)

1. **Brevo → Senders, Domains & Dedicated IPs → Domains → Add a domain → `aimsummer.com`** and copy the DNS records it gives you
   (a `brevo-code` TXT, two DKIM CNAMEs/TXT, and a DMARC suggestion) into GoDaddy → DNS. Then click *Authenticate*.
   Until this is done, Gmail/Outlook may show "via sendinblue" or send the emails to spam.
2. GoDaddy SPF record must contain both Google and Brevo:
   `v=spf1 include:_spf.google.com include:spf.brevo.com ~all` (Brevo shows the exact include to use).
3. Keep DMARC at `p=none` with `rua=mailto:hello@aimsummer.com` for the first weeks, then move to `p=quarantine`.
4. Send yourself a test from the website and check the three emails in Gmail: open *Show original* → SPF, DKIM and DMARC should all say **PASS**.

## Deploying changes

The functions are deployed with `verify_jwt = false` (the website calls them without a Supabase key; the functions do
their own checks, limits and CORS allow-list). To redeploy after editing:

* from Claude / the Supabase MCP: `deploy_edge_function` with the three files of the function, `verify_jwt: false`;
* or with the Supabase CLI: `supabase functions deploy request-code --no-verify-jwt` (same for `verify-code`), using `supabase/config.toml`.

Database changes go through `migrations/` (`apply_migration` or `supabase db push`).

## Testing

* `npm run test:functions` — 30+ checks in a few seconds, no network: consent required, invalid / disposable / typo /
  non-existent domains, honeypot, cooldown, hourly caps, hashed storage, wrong code, 5 attempts, expiry, single use,
  the three emails, Brevo contact sync, CORS allow-list.
* Live: open https://aimsummer.com/learn-more.html, use a real address you own, then look at
  Supabase → Table editor → `leads` / `lead_events`, Supabase → Edge Functions → Logs, and Brevo → Transactional → Logs.

## Reading the data

```sql
-- the last 50 requests
select created_at, email, first_name, role, interest, status, consent_newsletter, source_page
from public.leads order by created_at desc limit 50;

-- what happened for one address
select created_at, type, detail from public.lead_events where email = 'someone@example.com' order by created_at;

-- how many verified leads per day
select date_trunc('day', verified_at) as day, count(*) from public.leads where status = 'verified' group by 1 order by 1 desc;
```

## Privacy (Law 25 / CASL)

The consent wording, its timestamp and the two boxes are stored with each lead (`consent_text`, `consent_at`,
`consent_info`, `consent_newsletter`). IP addresses are only stored hashed (`ip_hash`). Codes are hashed and expire after
10 minutes; rows older than 30 days are purged by `request-code`. Leads are kept up to 24 months — delete a person on
request with `delete from public.leads where email = '…'` (cascades to codes and detaches events).
