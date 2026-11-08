// AIM — "Learn more", step 2: the visitor types the 6-digit code → we check it, mark the email as
// verified, send the info pack, alert hello@aimsummer.com and (if they ticked the box) add the
// contact to the Brevo newsletter list.
//
// POST /functions/v1/verify-code   { email, code, website?: "" /* honeypot */ }
// 200 { ok:true, email, first_name, info_pack_sent }
// 4xx { ok:false, error: no_code | code_expired | wrong_code | too_many_attempts | invalid_email | invalid_code, message, attempts_left? }

import {
  MAX_ATTEMPTS_PER_CODE, admin, brevoConfigured, clientIp, corsHeaders, fail, hashCode, hashIp, json,
  logEvent, normalizeEmail, readJson, sendMail, str, timingSafeEqual, upsertBrevoContact,
} from "./common.ts";
import { INFO_SENDER_NAME, infoPackEmail, notifyEmail } from "./emails.ts";
import { gmailConfigured, sendViaGmail } from "./gmail.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed", "Use POST.");

  const body = await readJson(req);
  const sb = admin();

  // Honeypot: logged only (browser autofill fills hidden fields for real people), never blocking.
  if (str(body.website)) await logEvent(sb, null, null, "honeypot", { stage: "verify", ip_hash: await hashIp(clientIp(req)) });

  const email = normalizeEmail(body.email);
  if (!email) return fail(req, 400, "invalid_email", "That doesn't look like a valid email address.");
  const code = String(body.code ?? "").replace(/\D/g, "");
  if (code.length !== 6) return fail(req, 400, "invalid_code", "The code is 6 digits — check the email we sent you.");

  // The lead and its live code.
  const { data: lead } = await sb.from("leads").select("*").eq("email", email).maybeSingle();
  if (!lead) return fail(req, 400, "no_code", "We have no code for this address. Please request a new one.");
  const { data: row } = await sb.from("email_codes").select("*")
    .eq("lead_id", lead.id).is("consumed_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row) return fail(req, 400, "no_code", "This code was already used or cancelled. Please request a new one.");

  const nowIso = new Date().toISOString();
  if (new Date(row.expires_at as string).getTime() < Date.now()) {
    await sb.from("email_codes").update({ consumed_at: nowIso }).eq("id", row.id);
    await logEvent(sb, lead.id, email, "code_expired", {});
    return fail(req, 400, "code_expired", "This code has expired (codes last 10 minutes). Please request a new one.");
  }
  if ((row.attempts as number) >= MAX_ATTEMPTS_PER_CODE) {
    await sb.from("email_codes").update({ consumed_at: nowIso }).eq("id", row.id);
    await logEvent(sb, lead.id, email, "too_many_attempts", {});
    return fail(req, 400, "too_many_attempts", "Too many wrong attempts — this code is now cancelled. Please request a new one.");
  }

  const expected = row.code_hash as string;
  const given = await hashCode(email, code);
  if (!timingSafeEqual(expected, given)) {
    const attempts = (row.attempts as number) + 1;
    const left = MAX_ATTEMPTS_PER_CODE - attempts;
    await sb.from("email_codes").update({ attempts, ...(left <= 0 ? { consumed_at: nowIso } : {}) }).eq("id", row.id);
    await logEvent(sb, lead.id, email, "wrong_code", { attempts });
    if (left <= 0) return fail(req, 400, "too_many_attempts", "Too many wrong attempts — this code is now cancelled. Please request a new one.");
    return fail(req, 400, "wrong_code", `That code isn't right. ${left} attempt${left === 1 ? "" : "s"} left.`, { attempts_left: left });
  }

  // Correct code: consume it, mark the address verified.
  await sb.from("email_codes").update({ consumed_at: nowIso }).eq("id", row.id);
  await sb.from("leads").update({ status: "verified", verified_at: nowIso }).eq("id", lead.id);
  await logEvent(sb, lead.id, email, "verified", {});

  const firstName = (lead.first_name as string | null) || null;
  let infoPackSent = false;

  if (brevoConfigured()) {
    // 1. The info pack, to the visitor — through the hello@ Gmail mailbox when configured (lands in "Primary"),
    //    otherwise (or if Gmail fails) through Brevo.
    const m = infoPackEmail({ firstName, email, role: lead.role as string | null, interest: lead.interest as string | null });
    let gmailError: string | null = null;
    if (gmailConfigured()) {
      try {
        await sendViaGmail({ to: { email, name: firstName || undefined }, fromName: INFO_SENDER_NAME, subject: m.subject, html: m.html, text: m.text });
        infoPackSent = true;
        await sb.from("leads").update({ info_pack_sent_at: nowIso }).eq("id", lead.id);
        await logEvent(sb, lead.id, email, "info_pack_sent", { transport: "gmail", variant: m.variant });
      } catch (err) {
        gmailError = String(err).slice(0, 300);
        console.error("[verify-code] Gmail send failed, falling back to Brevo:", err);
      }
    }
    if (!infoPackSent) {
      try {
        const id = await sendMail({ to: [{ email, name: firstName || undefined }], fromName: INFO_SENDER_NAME, subject: m.subject, html: m.html, text: m.text, tags: ["aim-info-pack"] });
        infoPackSent = true;
        await sb.from("leads").update({ info_pack_sent_at: nowIso }).eq("id", lead.id);
        await logEvent(sb, lead.id, email, "info_pack_sent", { transport: "brevo", variant: m.variant, message_id: id, gmail_error: gmailError });
      } catch (err) {
        console.error("[verify-code] info pack failed:", err);
        await logEvent(sb, lead.id, email, "email_failed", { stage: "info_pack", error: String(err).slice(0, 300), gmail_error: gmailError });
      }
    }

    // 2. The alert, to hello@aimsummer.com — "reply" in Gmail answers the visitor directly.
    try {
      const n = notifyEmail({ ...lead, email, info_pack_sent: infoPackSent } as Parameters<typeof notifyEmail>[0]);
      const id = await sendMail({
        to: [{ email: n.to, name: "AIM" }], subject: n.subject, html: n.html, text: n.text, tags: ["aim-notify"],
        replyTo: { email, name: firstName || undefined },
      });
      await sb.from("leads").update({ notified_at: nowIso }).eq("id", lead.id);
      await logEvent(sb, lead.id, email, "team_notified", { message_id: id });
    } catch (err) {
      console.error("[verify-code] notification failed:", err);
      await logEvent(sb, lead.id, email, "email_failed", { stage: "notify", error: String(err).slice(0, 300) });
    }

    // 3. Newsletter — only if the second box was ticked.
    if (lead.consent_newsletter === true) {
      try {
        await upsertBrevoContact(email, {
          FIRSTNAME: firstName || "", AIM_ROLE: lead.role || "", AIM_INTEREST: lead.interest || "",
          AIM_SOURCE: lead.source_page || "", AIM_VERIFIED_AT: nowIso.slice(0, 10),
        });
        await sb.from("leads").update({ brevo_contact_synced_at: nowIso }).eq("id", lead.id);
        await logEvent(sb, lead.id, email, "newsletter_added", {});
      } catch (err) {
        console.error("[verify-code] Brevo contact failed:", err);
        await logEvent(sb, lead.id, email, "newsletter_failed", { error: String(err).slice(0, 300) });
      }
    }
  } else {
    console.log(`[verify-code] BREVO_API_KEY missing — ${email} verified, no emails sent`);
    await logEvent(sb, lead.id, email, "email_not_configured", { stage: "verify" });
  }

  return json(req, 200, { ok: true, email, first_name: firstName || "", info_pack_sent: infoPackSent });
});
