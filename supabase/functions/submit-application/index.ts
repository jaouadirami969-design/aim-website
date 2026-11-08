// AIM — "Apply now", final step: the guided application is submitted.
// The email was verified a moment ago with the 6-digit code (verify-code returned a signed token).
//
// POST /functions/v1/submit-application
// { token, application: { …fields below… }, website?: "" }
// 200 { ok:true, reference, parent_email_sent, student_copy_sent }
// 4xx { ok:false, error, message, field? }

import {
  admin, brevoConfigured, clientIp, corsHeaders, fail, hashIp, hashToken, json, logEvent, normalizeEmail,
  randomToken, readJson, sendMail, str, verifyToken, SITE_URL,
} from "./common.ts";
import { gmailConfigured, sendViaGmail } from "./gmail.ts";
import { INFO_SENDER_NAME, applicationReceivedEmail, parentNoticeEmail, teamApplicationEmail, type AppRow } from "./application-emails.ts";

const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL") || "hello@aimsummer.com";
const PROGRAM_START = Deno.env.get("PROGRAM_START") || "2027-06-28";   // used for "age during the program"
const MIN_AGE = 13, MAX_AGE = 18;

const ENUM = {
  filled_by: ["student", "parent"],
  program: ["finance-investment", "fintech-digital-investing"],
  level: ["beginner", "intermediate", "advanced"],
  format: ["campus", "online", "either"],
  session: ["s1", "s2", "s3", "flexible"],
  session2: ["s1", "s2", "s3", "flexible", "none"],
  relationship: ["mother", "father", "guardian", "other"],
  school_level: ["sec1", "sec2", "sec3", "sec4", "sec5", "cegep1", "grade7", "grade8", "grade9", "grade10", "grade11", "grade12", "other"],
};

function ageOn(dob: Date, on: Date): number {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}
function parseDob(v: unknown): Date | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : d;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return allowed.includes(v as T) ? (v as T) : null;
}
function phone(v: unknown): string | null {
  const s = str(v, 40);
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  return digits.length >= 10 ? s : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed", "Use POST.");

  const body = await readJson(req);
  const sb = admin();
  const ip = clientIp(req);
  if (str(body.website)) await logEvent(sb, null, null, "honeypot", { stage: "apply", ip_hash: await hashIp(ip) });

  // 1. The verified email (signed by verify-code less than 2 hours ago).
  const tok = await verifyToken(body.token);
  if (!tok || typeof tok.e !== "string") {
    return fail(req, 401, "token_invalid", "Your email verification has expired. Please verify your email again (step 1) — your answers are saved on this device.");
  }
  const applicantEmail = normalizeEmail(tok.e);
  if (!applicantEmail) return fail(req, 401, "token_invalid", "Please verify your email again (step 1).");

  const a = (body.application && typeof body.application === "object" ? body.application : {}) as Record<string, unknown>;
  const bad = (field: string, message: string) => fail(req, 400, "invalid_field", message, { field });

  // 2. The student.
  const filledBy = oneOf(a.filled_by, ENUM.filled_by);
  const studentFirst = str(a.student_first_name, 60), studentLast = str(a.student_last_name, 60);
  if (!studentFirst) return bad("student_first_name", "Please enter the student's first name.");
  if (!studentLast) return bad("student_last_name", "Please enter the student's last name.");
  const dob = parseDob(a.student_dob);
  if (!dob) return bad("student_dob", "Please enter the student's date of birth (YYYY-MM-DD).");
  const ageAtProgram = ageOn(dob, new Date(`${PROGRAM_START}T00:00:00Z`));
  if (ageAtProgram < MIN_AGE || ageAtProgram > MAX_AGE) {
    return fail(req, 400, "age_out_of_range", `AIM is for students aged ${MIN_AGE} to ${MAX_AGE} during the program (summer 2027). ${studentFirst} would be ${ageAtProgram}. If you're close to the range, write to us at ${NOTIFY_EMAIL} — we look at every case.`, { field: "student_dob", age: ageAtProgram });
  }
  const ageToday = ageOn(dob, new Date());
  const parentConsentRequired = ageToday < 14;
  const studentEmail = a.student_email ? normalizeEmail(a.student_email) : null;
  if (a.student_email && !studentEmail) return bad("student_email", "The student's email address doesn't look valid.");
  const studentPhone = a.student_phone ? phone(a.student_phone) : null;
  const country = str(a.country, 60), province = str(a.province, 60), city = str(a.city, 80), postal = str(a.postal_code, 16);
  if (!country) return bad("country", "Please choose the country.");
  if (!province) return bad("province", "Please enter the province or state.");
  if (!city) return bad("city", "Please enter the city.");
  if (!postal) return bad("postal_code", "Please enter the postal code.");

  // 3. The parent or guardian.
  const parentFirst = str(a.parent_first_name, 60), parentLast = str(a.parent_last_name, 60);
  if (!parentFirst) return bad("parent_first_name", "Please enter the parent or guardian's first name.");
  if (!parentLast) return bad("parent_last_name", "Please enter the parent or guardian's last name.");
  const parentEmail = normalizeEmail(a.parent_email);
  if (!parentEmail) return bad("parent_email", "Please enter a valid email address for the parent or guardian.");
  const parentPhone = phone(a.parent_phone);
  if (!parentPhone) return bad("parent_phone", "Please enter the parent or guardian's phone number (10 digits).");
  const relationship = oneOf(a.parent_relationship, ENUM.relationship);
  if (!relationship) return bad("parent_relationship", "Please tell us how this person is related to the student.");
  if (studentEmail && studentEmail === parentEmail) return bad("parent_email", "The parent or guardian's email must be different from the student's email.");
  if (filledBy === "student" && parentEmail === applicantEmail) return bad("parent_email", "The parent or guardian's email must be different from the email you verified.");

  // 4. The program.
  const program = oneOf(a.program, ENUM.program);
  if (!program) return bad("program", "Please choose a program.");
  const level = oneOf(a.level, ENUM.level);
  if (!level) return bad("level", "Please choose a class.");
  const prevYear = level === "beginner" ? null : Number(a.previous_aim_year);
  if (level !== "beginner" && !(prevYear && prevYear >= 2027 && prevYear <= 2035)) return bad("previous_aim_year", "Intermediate and Advanced are for students who finished the previous AIM class — please tell us the year.");
  const format = oneOf(a.format, ENUM.format);
  if (!format) return bad("format", "Please choose campus, online, or no preference.");
  const session1 = oneOf(a.session_first, ENUM.session);
  if (!session1) return bad("session_first", "Please choose a first-choice session.");
  const session2 = oneOf(a.session_second, ENUM.session2) || "none";
  const heard = str(a.heard_about, 200);

  // 5. The school.
  const schoolName = str(a.school_name, 120), schoolLevel = oneOf(a.school_level, ENUM.school_level), schoolCity = str(a.school_city, 80), schoolProvince = str(a.school_province, 60);
  if (!schoolName) return bad("school_name", "Please enter the name of the school.");
  if (!schoolLevel) return bad("school_level", "Please choose the student's level for 2026–27.");
  if (!schoolCity) return bad("school_city", "Please enter the school's city.");
  if (!schoolProvince) return bad("school_province", "Please enter the school's province or state.");
  if (a.english_ok !== true) return bad("english_ok", "Classes are taught in English — please tick the box to confirm the student is comfortable following a class in English.");

  // 6. Why AIM + consents.
  const motivation = str(a.motivation, 1500), notes = str(a.notes, 1000);
  if (a.consent_accuracy !== true) return bad("consent_accuracy", "Please confirm that the information is accurate.");
  if (a.consent_privacy !== true) return bad("consent_privacy", "Please accept the privacy and consent terms.");
  if (a.consent_parent !== true) return bad("consent_parent", filledBy === "parent" ? "Please confirm that you are the student's parent or guardian." : "Please confirm that a parent or guardian knows about this application.");

  // 7. Store it.
  const { data: lead } = await sb.from("leads").select("id").eq("email", applicantEmail).maybeSingle();
  const nowIso = new Date().toISOString();
  const parentIsApplicant = parentEmail === applicantEmail;
  const confirmToken = parentIsApplicant ? null : randomToken();
  const row = {
    lead_id: lead?.id || null, status: "submitted", filled_by: filledBy, applicant_email: applicantEmail,
    student_first_name: studentFirst, student_last_name: studentLast, student_dob: dob.toISOString().slice(0, 10), student_age_at_program: ageAtProgram,
    student_email: studentEmail, student_phone: studentPhone, country, province, city, postal_code: postal,
    parent_first_name: parentFirst, parent_last_name: parentLast, parent_email: parentEmail, parent_phone: parentPhone, parent_relationship: relationship,
    parent_consent_required: parentConsentRequired, parent_confirm_token_hash: confirmToken ? await hashToken(confirmToken) : null,
    parent_confirmed_at: parentIsApplicant ? nowIso : null,
    program, level, previous_aim_year: prevYear, format, session_first: session1, session_second: session2, heard_about: heard,
    school_name: schoolName, school_level: schoolLevel, school_city: schoolCity, school_province: schoolProvince, english_ok: true,
    motivation, notes,
    consent_accuracy: true, consent_privacy: true, consent_parent: true, consent_newsletter: a.consent_newsletter === true,
    consent_text: str(a.consent_text, 1200), consent_at: nowIso,
    source_page: str(a.source_page, 300), referrer: str(a.referrer, 300), utm_source: str(a.utm_source, 100), utm_medium: str(a.utm_medium, 100), utm_campaign: str(a.utm_campaign, 150),
    user_agent: str(req.headers.get("user-agent"), 300), ip_hash: await hashIp(ip),
  };
  const { data: inserted, error } = await sb.from("applications").insert(row).select("*").single();
  if (error || !inserted) {
    console.error("[submit-application] insert failed:", error);
    return fail(req, 500, "db_error", "We couldn't save the application. Please try again in a minute — your answers are still on this page.", { detail: error?.message });
  }
  const app = inserted as unknown as AppRow;
  await logEvent(sb, lead?.id || null, applicantEmail, "application_submitted", { reference: app.reference, program, level, format, session: session1, age: ageAtProgram, parent_consent_required: parentConsentRequired });
  await sb.from("application_drafts").delete().eq("email", applicantEmail);   // the saved-in-progress copy is no longer needed

  // 8. The emails: applicant, the other party, the team.
  const emails: Record<string, unknown> = {};
  const sendPersonal = async (to: { email: string; name?: string }, m: { subject: string; html: string; text: string }, tag: string) => {
    if (gmailConfigured()) {
      try {
        await sendViaGmail({ to, fromName: INFO_SENDER_NAME, subject: m.subject, html: m.html, text: m.text });
        return { transport: "gmail" };
      } catch (err) {
        console.error(`[submit-application] Gmail failed for ${tag}:`, err);
      }
    }
    const id = await sendMail({ to: [to], fromName: INFO_SENDER_NAME, subject: m.subject, html: m.html, text: m.text, tags: [tag] });
    return { transport: "brevo", message_id: id };
  };

  let parentEmailSent = false, studentCopySent = false;
  if (brevoConfigured()) {
    // parent first: the applicant's email mentions it
    if (confirmToken) {
      try {
        const url = `${SITE_URL}/application-confirmed.html?ref=${encodeURIComponent(app.reference)}&t=${encodeURIComponent(confirmToken)}`;
        emails.parent = await sendPersonal({ email: parentEmail, name: `${parentFirst} ${parentLast}` }, parentNoticeEmail(app, url), "aim-apply-parent");
        parentEmailSent = true;
      } catch (err) {
        emails.parent = { error: String(err).slice(0, 300) };
        console.error("[submit-application] parent email failed:", err);
      }
    }
    try {
      const applicantName = filledBy === "parent" ? `${parentFirst} ${parentLast}` : `${studentFirst} ${studentLast}`;
      emails.applicant = await sendPersonal({ email: applicantEmail, name: applicantName }, applicationReceivedEmail(app, { to: "applicant", parentNotified: parentEmailSent }), "aim-apply-received");
    } catch (err) {
      emails.applicant = { error: String(err).slice(0, 300) };
      console.error("[submit-application] applicant email failed:", err);
    }
    if (filledBy === "parent" && studentEmail && studentEmail !== applicantEmail) {
      try {
        emails.student_copy = await sendPersonal({ email: studentEmail, name: `${studentFirst} ${studentLast}` }, applicationReceivedEmail(app, { to: "student_copy", parentNotified: false }), "aim-apply-received");
        studentCopySent = true;
      } catch (err) {
        emails.student_copy = { error: String(err).slice(0, 300) };
      }
    }
    try {
      const t = teamApplicationEmail(app, { parentEmailSent, studentCopySent });
      const id = await sendMail({ to: [{ email: NOTIFY_EMAIL, name: "AIM" }], subject: t.subject, html: t.html, text: t.text, tags: ["aim-apply-notify"], replyTo: { email: applicantEmail } });
      emails.team = { transport: "brevo", message_id: id };
    } catch (err) {
      emails.team = { error: String(err).slice(0, 300) };
      console.error("[submit-application] team email failed:", err);
    }
  } else {
    emails.note = "BREVO_API_KEY missing — no emails sent";
  }
  await sb.from("applications").update({ emails }).eq("id", (inserted as { id: string }).id);
  await logEvent(sb, lead?.id || null, applicantEmail, "application_emails", { reference: app.reference, ...emails });

  return json(req, 200, {
    ok: true, reference: app.reference, student_first_name: studentFirst,
    parent_email_sent: parentEmailSent, student_copy_sent: studentCopySent, parent_consent_required: parentConsentRequired,
  });
});
