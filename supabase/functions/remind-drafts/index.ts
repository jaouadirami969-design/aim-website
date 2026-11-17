// AIM — housekeeping for applications in progress, meant to run once an hour (pg_cron → pg_net → here).
//   1. deletes drafts untouched for DRAFT_PURGE_DAYS (60) — the privacy page promises it;
//   2. sends ONE reminder email for drafts untouched for DRAFT_REMIND_HOURS (48), never twice.
//
// POST /functions/v1/remind-drafts   header x-cron-secret: <CRON_SECRET>   (or { "secret": … } in the body)
// 200 { ok:true, due, sent, failed, purged }
// CRON_SECRET is required: without it the function refuses to run (503). The pg_cron job reads the same
// value from Supabase Vault (secret "cron_secret") and sends it in the x-cron-secret header.
//   3. deletes Learn-more leads (and their events) older than LEAD_PURGE_MONTHS (24).

import { admin, brevoConfigured, corsHeaders, envInt, fail, json, logEvent, sendMail, timingSafeEqual } from "./common.ts";
import { INFO_SENDER_NAME, reminderEmail, type DraftRow } from "./reminder-email.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const REMIND_HOURS = envInt("DRAFT_REMIND_HOURS") ?? 48;
const PURGE_DAYS = envInt("DRAFT_PURGE_DAYS") ?? 60;
const LEAD_PURGE_MONTHS = envInt("LEAD_PURGE_MONTHS") ?? 24;
const BATCH = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed", "Use POST.");

  let bodySecret = "";
  try { bodySecret = String(((await req.clone().json()) as { secret?: unknown })?.secret ?? ""); } catch { /* no body */ }
  const given = req.headers.get("x-cron-secret") || bodySecret;
  if (CRON_SECRET) {
    if (!given || !timingSafeEqual(given, CRON_SECRET)) return fail(req, 401, "unauthorized", "Missing or wrong x-cron-secret.");
  } else {
    // Fail closed: without the secret, anyone on the internet could trigger this job.
    console.error("[remind-drafts] CRON_SECRET is not set — refusing to run.");
    return fail(req, 503, "not_configured", "CRON_SECRET is not set.");
  }

  const sb = admin();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const remindBefore = new Date(now - REMIND_HOURS * 3600_000).toISOString();
  const purgeBefore = new Date(now - PURGE_DAYS * 86_400_000).toISOString();

  // 1. forget old drafts
  const { count: purged } = await sb.from("application_drafts").delete({ count: "exact" }).lt("updated_at", purgeBefore);

  // 1b. forget Learn-more requests older than LEAD_PURGE_MONTHS (24) — the privacy page promises it.
  //     Leads that became an application are kept with the application (applications.lead_id is set null).
  const leadsBefore = new Date(now - LEAD_PURGE_MONTHS * 30.44 * 86_400_000).toISOString();
  const { count: leadsPurged } = await sb.from("leads").delete({ count: "exact" }).lt("updated_at", leadsBefore);
  await sb.from("lead_events").delete().lt("created_at", leadsBefore);

  // 2. one reminder per draft, 48 h after the last edit
  const { data: due, error } = await sb.from("application_drafts")
    .select("email, lead_id, step, data, updated_at")
    .is("reminded_at", null).lt("updated_at", remindBefore)
    .order("updated_at", { ascending: true }).limit(BATCH);
  if (error) return fail(req, 500, "db_error", "Could not read the drafts.", { detail: error.message });

  let sent = 0, failed = 0;
  if (!brevoConfigured()) {
    console.log("[remind-drafts] BREVO_API_KEY missing — nothing sent");
    return json(req, 200, { ok: true, due: due?.length || 0, sent, failed, purged: purged || 0, leads_purged: leadsPurged || 0, note: "BREVO_API_KEY missing" });
  }
  for (const row of due || []) {
    const d = row as unknown as DraftRow & { lead_id: string | null };
    try {
      const m = reminderEmail(d);
      const name = typeof d.data?.filled_by === "string" && d.data.filled_by === "parent" ? d.data.parent_first_name : d.data?.student_first_name;
      const id = await sendMail({ to: [{ email: d.email, name: typeof name === "string" && name ? name : undefined }], fromName: INFO_SENDER_NAME, subject: m.subject, html: m.html, text: m.text, tags: ["aim-apply-reminder"] });
      await sb.from("application_drafts").update({ reminded_at: nowIso }).eq("email", d.email);
      await logEvent(sb, d.lead_id, d.email, "draft_reminder_sent", { step: m.step, minutes_left: m.minutes, message_id: id });
      sent++;
    } catch (err) {
      failed++;
      console.error("[remind-drafts] reminder failed:", d.email, err);
      // one attempt only — never retry an address every hour
      await sb.from("application_drafts").update({ reminded_at: nowIso }).eq("email", d.email);
      await logEvent(sb, d.lead_id, d.email, "email_failed", { stage: "draft_reminder", error: String(err).slice(0, 300) });
    }
  }
  return json(req, 200, { ok: true, due: due?.length || 0, sent, failed, purged: purged || 0, leads_purged: leadsPurged || 0 });
});
