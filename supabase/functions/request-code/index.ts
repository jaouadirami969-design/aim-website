// AIM — "Learn more", step 1: the visitor gives an email → we check it, store the lead,
// create a 6-digit code (hashed) and email the code from hello@aimsummer.com through Brevo.
//
// POST /functions/v1/request-code
// {
//   email, first_name?, role?: "student"|"parent"|"counselor"|"other", interest?: "campus"|"online"|"info",
//   consent_info: true, consent_newsletter?: boolean, consent_text?: string, accept_domain?: boolean,
//   source_page?, referrer?, utm_source?, utm_medium?, utm_campaign?, website?: ""   // ← honeypot, must stay empty
// }
// 200 { ok:true, email, masked, expires_in, resend_in }
// 4xx/5xx { ok:false, error, message, ...extra }

import {
  CODE_TTL_SECONDS, MAX_ATTEMPTS_PER_CODE, MAX_CODES_PER_EMAIL_PER_HOUR, MAX_CODES_PER_IP_PER_HOUR,
  RESEND_COOLDOWN_SECONDS, admin, brevoConfigured, clientIp, corsHeaders, domainAcceptsMail, fail,
  hashCode, hashIp, isDisposable, json, logEvent, maskEmail, normalizeEmail, readJson, sendMail,
  sixDigitCode, str, suggestDomainFix,
} from "./common.ts";
import { codeEmail } from "./emails.ts";

const ROLES = new Set(["student", "parent", "counselor", "other"]);
const INTERESTS = new Set(["campus", "online", "info"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed", "Use POST.");

  const body = await readJson(req);
  const ip = clientIp(req);
  const sb = admin();

  // 1. Honeypot — a signal, not a wall. Chrome's address autofill was seen filling the hidden field for real
  //    parents, so a filled trap is only logged; the limits below and the 6-digit code are the real protection.
  const trapped = Boolean(str(body.website));
  if (trapped) await logEvent(sb, null, null, "honeypot", { ip_hash: await hashIp(ip) });

  // 2. The consent box is the whole point of the page (Law 25 / CASL): no box, no email.
  if (body.consent_info !== true) {
    return fail(req, 400, "consent_required", "Please tick the box so we're allowed to email you the info pack.");
  }

  // 3. The address itself: format, disposable domains, obvious typos, then "does this domain receive mail?"
  const email = normalizeEmail(body.email);
  if (!email) return fail(req, 400, "invalid_email", "That doesn't look like a valid email address. Check it and try again.");
  if (isDisposable(email)) {
    return fail(req, 400, "disposable_email", "Temporary or disposable addresses can't receive the info pack. Please use your usual email address.");
  }
  const suggestion = suggestDomainFix(email);
  if (suggestion && body.accept_domain !== true) {
    return fail(req, 400, "typo_suspected", `Did you mean ${suggestion}?`, { suggestion });
  }
  const domain = email.split("@")[1];
  const mx = await domainAcceptsMail(domain);
  if (mx === "no-mail") {
    await logEvent(sb, null, email, "rejected", { reason: "domain_no_mail", domain });
    return fail(req, 400, "domain_no_mail", `The domain "${domain}" doesn't receive email. Check the address and try again.`);
  }

  // 4. Limits: one code per minute per address, 5 per hour per address, 20 per hour per network.
  const ipHash = await hashIp(ip);
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { data: recent } = await sb.from("email_codes").select("created_at")
    .eq("email", email).gte("created_at", hourAgo).order("created_at", { ascending: false });
  if (recent && recent.length) {
    const lastAt = new Date(recent[0].created_at as string).getTime();
    const wait = Math.ceil((lastAt + RESEND_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000);
    if (wait > 0) {
      return fail(req, 429, "cooldown", `We just sent you a code. You can ask for a new one in ${wait} s — check your inbox and your spam folder meanwhile.`, { retry_after: wait });
    }
    if (recent.length >= MAX_CODES_PER_EMAIL_PER_HOUR) {
      await logEvent(sb, null, email, "rejected", { reason: "too_many_codes_email" });
      return fail(req, 429, "too_many_requests", "Too many codes were requested for this address. Please try again in an hour, or write to hello@aimsummer.com.");
    }
  }
  const { count: ipCount } = await sb.from("email_codes").select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash).gte("created_at", hourAgo);
  if ((ipCount || 0) >= MAX_CODES_PER_IP_PER_HOUR) {
    await logEvent(sb, null, email, "rejected", { reason: "too_many_codes_ip" });
    return fail(req, 429, "too_many_requests", "Too many requests from your network. Please try again later, or write to hello@aimsummer.com.");
  }

  // 5. Create or update the lead (one row per email address).
  const firstName = str(body.first_name, 60);
  const role = ROLES.has(String(body.role)) ? String(body.role) : null;
  const interest = INTERESTS.has(String(body.interest)) ? String(body.interest) : null;
  const consentNewsletter = body.consent_newsletter === true;
  const nowIso = new Date().toISOString();
  const meta = {
    source_page: str(body.source_page, 300), referrer: str(body.referrer, 300),
    utm_source: str(body.utm_source, 100), utm_medium: str(body.utm_medium, 100), utm_campaign: str(body.utm_campaign, 150),
    user_agent: str(req.headers.get("user-agent"), 300), ip_hash: ipHash,
  };

  const { data: existing } = await sb.from("leads").select("id, request_count").eq("email", email).maybeSingle();
  let leadId: string;
  if (existing) {
    leadId = existing.id as string;
    const { error } = await sb.from("leads").update({
      first_name: firstName ?? undefined, role: role ?? undefined, interest: interest ?? undefined,
      consent_info: true, consent_newsletter: consentNewsletter, consent_text: str(body.consent_text, 600) ?? undefined, consent_at: nowIso,
      request_count: ((existing.request_count as number) || 0) + 1, ...meta,
    }).eq("id", leadId);
    if (error) return fail(req, 500, "db_error", "Something went wrong on our side. Please try again in a minute.", { detail: error.message });
  } else {
    const { data: inserted, error } = await sb.from("leads").insert({
      email, first_name: firstName, role, interest,
      consent_info: true, consent_newsletter: consentNewsletter, consent_text: str(body.consent_text, 600), consent_at: nowIso,
      status: "pending", request_count: 1, ...meta,
    }).select("id").single();
    if (error || !inserted) return fail(req, 500, "db_error", "Something went wrong on our side. Please try again in a minute.", { detail: error?.message });
    leadId = inserted.id as string;
  }

  // 6. Only one live code per address: retire the previous ones, create the new one (stored hashed, never in clear).
  await sb.from("email_codes").update({ consumed_at: nowIso }).eq("lead_id", leadId).is("consumed_at", null);
  const code = sixDigitCode();
  const codeHash = await hashCode(email, code);
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString();
  const { data: codeRow, error: codeErr } = await sb.from("email_codes")
    .insert({ lead_id: leadId, email, code_hash: codeHash, expires_at: expiresAt, ip_hash: ipHash })
    .select("id").single();
  if (codeErr || !codeRow) return fail(req, 500, "db_error", "Something went wrong on our side. Please try again in a minute.", { detail: codeErr?.message });

  // Housekeeping (about 1 request in 20): forget codes older than 30 days — useless, and the privacy page promises it.
  if (Math.random() < 0.05) {
    await sb.from("email_codes").delete().lt("created_at", new Date(Date.now() - 30 * 86400_000).toISOString());
  }

  // 7. Email the code from hello@aimsummer.com.
  if (!brevoConfigured()) {
    // Not wired yet: keep the code usable for the team (visible in the function logs only) and tell the visitor.
    console.log(`[request-code] BREVO_API_KEY missing — code for ${maskEmail(email)} (lead ${leadId}): ${code}`);
    await logEvent(sb, leadId, email, "email_not_configured", {});
    return fail(req, 503, "email_not_configured", "Our email service isn't connected yet. Please write to hello@aimsummer.com and we'll send you the info pack by hand.");
  }
  try {
    const mail = codeEmail({ code, firstName });
    const messageId = await sendMail({
      to: [{ email, name: firstName || undefined }],
      subject: mail.subject, html: mail.html, text: mail.text, tags: ["aim-code"],
    });
    await logEvent(sb, leadId, email, "code_sent", { message_id: messageId, mx, role, interest, newsletter: consentNewsletter });
  } catch (err) {
    console.error("[request-code] Brevo error:", err);
    await sb.from("email_codes").update({ consumed_at: nowIso }).eq("id", codeRow.id);
    await logEvent(sb, leadId, email, "email_failed", { stage: "code", error: String(err).slice(0, 300) });
    return fail(req, 502, "email_failed", "We couldn't send the email right now. Please try again in a minute, or write to hello@aimsummer.com.");
  }

  return json(req, 200, {
    ok: true, email, masked: maskEmail(email),
    expires_in: CODE_TTL_SECONDS, resend_in: RESEND_COOLDOWN_SECONDS, max_attempts: MAX_ATTEMPTS_PER_CODE,
  });
});
