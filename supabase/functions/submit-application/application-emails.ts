// AIM — the emails of the application flow (Mission 05).
//   1. applicationReceivedEmail  → the person who applied (and a short copy to the other party)
//   2. parentNoticeEmail         → the parent/guardian, with the one-click confirmation link
//   3. teamApplicationEmail      → hello@aimsummer.com, every answer on one screen
// Same plain, personal style as the info pack: paragraphs, a few bold lead-ins, very few links.

import { SENDER_EMAIL, SITE_URL } from "./common.ts";

export const ORG_NAME = "AIM — Academy of Investment & Management";
export const ORG_ADDRESS = Deno.env.get("ORG_ADDRESS") || "Montréal, Québec, Canada";
export const ORG_PHONE = Deno.env.get("ORG_PHONE") ?? "438-978-1687";
export const ORG_HOURS = Deno.env.get("ORG_HOURS") || "Mon–Thu and weekends, 8 am – 8 pm Montréal time";
export const INFO_SENDER_NAME = Deno.env.get("INFO_SENDER_NAME") || "Rami Jaouadi (AIM)";
const SIGNER = Deno.env.get("INFO_SIGNER") || "Rami Jaouadi";
const SIGNER_ROLE = Deno.env.get("INFO_SIGNER_ROLE") || "Co-founder, AIM — with Ilyas Zakiat, instructor";
const DECISION_DAYS = Deno.env.get("DECISION_DAYS") || "3";

const C = { sky: "#3FA9F5", skyD: "#2B8FD8", skyT: "#EAF6FE", skyL: "#BFE2FB", yel: "#FFC72C", yelT: "#FFF6DC", amber: "#B07A10", deep: "#0B2F5B", ink: "#1E3A5F", muted: "#5A7089", white: "#FFFFFF" };

export function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const b = (s: string) => `<b style="color:${C.deep};">${s}</b>`;
const p = (s: string) => `<p style="margin:0 0 14px;">${s}</p>`;
const a = (href: string, label: string) => `<a href="${href}" style="color:${C.skyD};">${label}</a>`;
const ul = (items: string[]) => `<ul style="margin:0 0 14px;padding-left:22px;">${items.map((i) => `<li style="margin:0 0 6px;">${i}</li>`).join("")}</ul>`;

export function toText(html: string): string {
  return html
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g, "$2 ($1)")
    .replace(/<ul[^>]*>/g, "\n").replace(/<li[^>]*>/g, "• ").replace(/<\/li>/g, "\n")
    .replace(/<\/p>|<\/ul>|<\/tr>/g, "\n\n").replace(/<br\s*\/?>/g, "\n").replace(/<\/td>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function plainShell(subject: string, inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#FFFFFF;">
<div style="max-width:640px;margin:0;padding:18px 16px;font-family:Arial,Helvetica,sans-serif;font-size:15.5px;line-height:1.6;color:${C.ink};">
${inner}
</div>
</body></html>`;
}

function signoff(closing = "Warm regards,"): string {
  return `<p style="margin:22px 0 0;">${closing}<br>${b(SIGNER)}<br><span style="color:${C.muted};">${esc(SIGNER_ROLE)}</span><br><span style="color:${C.muted};">${SENDER_EMAIL}${ORG_PHONE ? ` · ${esc(ORG_PHONE)} (${esc(ORG_HOURS)})` : ""}</span></p>`;
}
function footer(note: string): string {
  return `<p style="margin:26px 0 0;font-size:12px;line-height:1.5;color:${C.muted};">${ORG_NAME} · ${esc(ORG_ADDRESS)}. AIM is an independent program and is not affiliated with McGill University. ${note}</p>`;
}

/* ---------------- labels ---------------- */

export const LABELS = {
  program: { "finance-investment": "Finance & Investment Summer Program", "fintech-digital-investing": "FinTech & Digital Investing (new for 2027)" } as Record<string, string>,
  level: { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" } as Record<string, string>,
  format: { campus: "McGill campus (9 am – 3 pm)", online: "Live online (1 – 3 pm)", either: "Campus or online — no preference" } as Record<string, string>,
  session: { s1: "Session 1 — late June to early July 2027", s2: "Session 2 — July 2027, before the construction holiday", s3: "Session 3 — August 2027 (waitlist)", flexible: "Flexible — any session", none: "No second choice" } as Record<string, string>,
  relationship: { mother: "Mother", father: "Father", guardian: "Legal guardian", other: "Other" } as Record<string, string>,
  level_school: { sec1: "Secondary 1", sec2: "Secondary 2", sec3: "Secondary 3", sec4: "Secondary 4", sec5: "Secondary 5", cegep1: "CEGEP — 1st year", grade7: "Grade 7", grade8: "Grade 8", grade9: "Grade 9", grade10: "Grade 10", grade11: "Grade 11", grade12: "Grade 12", other: "Other" } as Record<string, string>,
  filledBy: { student: "the student", parent: "a parent or guardian" } as Record<string, string>,
};
const label = (map: Record<string, string>, v: unknown) => map[String(v ?? "")] || String(v ?? "—");

/** The application as it is stored (subset used by the emails). */
export type AppRow = {
  reference: string; filled_by: string | null; applicant_email: string;
  student_first_name: string; student_last_name: string; student_dob: string; student_age_at_program: number;
  student_email: string | null; student_phone: string | null; country: string | null; province: string | null; city: string | null; postal_code: string | null;
  parent_first_name: string; parent_last_name: string; parent_email: string; parent_phone: string; parent_relationship: string | null; parent_consent_required: boolean;
  program: string; level: string; previous_aim_year: number | null; format: string; session_first: string; session_second: string | null; heard_about: string | null;
  school_name: string; school_level: string; school_city: string; school_province: string; english_ok: boolean;
  motivation: string | null; notes: string | null; consent_newsletter: boolean; created_at?: string;
  source_page?: string | null; referrer?: string | null; utm_source?: string | null; utm_campaign?: string | null; user_agent?: string | null;
};

function summaryItems(app: AppRow): string[] {
  const items = [
    `${b("Student:")} ${esc(app.student_first_name)} ${esc(app.student_last_name)}, ${app.student_age_at_program} in summer 2027 — ${esc(label(LABELS.level_school, app.school_level))}, ${esc(app.school_name)} (${esc(app.school_city)})`,
    `${b("Program:")} ${esc(label(LABELS.program, app.program))} · ${esc(label(LABELS.level, app.level))} class`,
    `${b("Format:")} ${esc(label(LABELS.format, app.format))}`,
    `${b("Session:")} ${esc(label(LABELS.session, app.session_first))}${app.session_second && app.session_second !== "none" ? ` · second choice: ${esc(label(LABELS.session, app.session_second))}` : ""}`,
    `${b("Parent or guardian:")} ${esc(app.parent_first_name)} ${esc(app.parent_last_name)} (${esc(label(LABELS.relationship, app.parent_relationship))}) — ${esc(app.parent_email)}`,
  ];
  return items;
}

/* ============================================================ 1. "Application received" */

export function applicationReceivedEmail(app: AppRow, opts: { to: "applicant" | "student_copy"; parentNotified: boolean }) {
  const applicantIsParent = app.filled_by === "parent";
  const toStudent = opts.to === "student_copy" || !applicantIsParent;
  const first = toStudent ? app.student_first_name : app.parent_first_name;
  const subject = `Application received — ${app.reference} · ${app.student_first_name} ${app.student_last_name}`;
  const whose = toStudent ? "your" : `${esc(app.student_first_name)}'s`;

  const next = ul([
    `${b("We read it.")} Ilyas or Rami reads every application personally — no algorithm. You'll receive our answer by email within ${esc(DECISION_DAYS)} business days.`,
    `${b("If it's a yes,")} the email explains how to reserve the seat. Registration and payment open in December 2026 — nothing is due before that, and the dates will be confirmed first.`,
    `${b("Questions in the meantime?")} Just reply to this email (keep the reference in the subject). We answer in English or in French.`,
  ]);
  const parentLine = !applicantIsParent && opts.parentNotified
    ? p(`We also sent a short email to ${esc(app.parent_first_name)} ${esc(app.parent_last_name)} at ${esc(app.parent_email)} asking them to confirm the application with one click — every AIM registration is confirmed by a parent or guardian.`)
    : (applicantIsParent && app.student_email && opts.to === "applicant" ? p(`A short copy went to ${esc(app.student_first_name)} at ${esc(app.student_email)}.`) : "");

  const inner =
    p(`Hi ${esc(first)},`) +
    p(`Thank you — we received ${whose} application to AIM's Finance &amp; Investment Summer Program. Your reference is ${b(app.reference)}; keep it in your replies.`) +
    p(`${b("What you told us:")}`) + ul(summaryItems(app)) +
    p(`${b("What happens next:")}`) + next +
    parentLine +
    p(`Until then, the full program page is here: ${a(`${SITE_URL}/program.html`, "aimsummer.com/program")}.`) +
    signoff(toStudent ? "Talk soon," : "Warm regards,") +
    footer(`You received this email because an application was submitted on aimsummer.com with this address (${esc(opts.to === "student_copy" ? (app.student_email || "") : app.applicant_email)}). If that wasn't you, reply and we'll delete it.`);
  const html = plainShell(subject, inner);
  return { subject, html, text: toText(inner) };
}

/* ============================================================ 2. the parent's one-click confirmation */

export function parentNoticeEmail(app: AppRow, confirmUrl: string) {
  const s = esc(app.student_first_name);
  const subject = `${app.student_first_name} applied to AIM — please confirm (one click)`;
  const lawLine = app.parent_consent_required
    ? p(`Because ${s} is under 14, Québec's privacy law (Law 25) requires a parent's consent before we can process the application — your click below is that consent.`)
    : p(`Every AIM registration is confirmed by a parent or guardian, so we'd like you to confirm that you know about this application and agree with it.`);
  const inner =
    p(`Hello ${esc(app.parent_first_name)},`) +
    p(`${s} ${esc(app.student_last_name)} just applied to AIM's ${b("Finance &amp; Investment Summer Program")} — two weeks in summer 2027 for students aged 13 to 18, on the McGill University campus in Montréal or live online, taught by Ilyas Zakiat (CEO of BIASafe AI and finance lecturer at McGill) — and named you as parent or guardian.`) +
    lawLine +
    p(`${b("Confirm with one click:")} ${a(confirmUrl, "Yes, I confirm this application")}<br><span style="font-size:13px;color:${C.muted};">(or copy this link into your browser: ${esc(confirmUrl)})</span>`) +
    p(`${b(`What ${s} told us:`)}`) + ul(summaryItems(app)) +
    p(`${b("What happens next.")} We read every application personally and reply within ${esc(DECISION_DAYS)} business days. If it's a yes, the email explains how to reserve the seat; registration and payment open in December 2026 — nothing is due before that. The campus class is $1,895 plus taxes, the online class $1,495 plus taxes.`) +
    p(`Questions? Just reply to this email — we answer in English or in French. Didn't expect this email? Reply and we'll delete the application.`) +
    signoff() +
    footer(`You received this email because ${s} named you as parent or guardian in an application on aimsummer.com (reference ${esc(app.reference)}).`);
  const html = plainShell(subject, inner);
  return { subject, html, text: toText(inner) };
}

/* ============================================================ 3. the alert to hello@ */

export function teamApplicationEmail(app: AppRow, extra: { parentEmailSent: boolean; studentCopySent: boolean }) {
  const subject = `New application — ${app.student_first_name} ${app.student_last_name} (${label(LABELS.level, app.level)} · ${app.format} · ${app.session_first}) · ${app.reference}`;
  const row = (k: string, v: string) => `<tr><td style="padding:6px 10px;border-bottom:1px solid ${C.skyL};color:${C.deep};font-weight:bold;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:6px 10px;border-bottom:1px solid ${C.skyL};">${v}</td></tr>`;
  const section = (title: string) => `<tr><td colspan="2" style="padding:12px 10px 4px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${C.amber};font-weight:bold;">${title}</td></tr>`;
  const when = new Date().toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" });
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14.5px;border:1px solid ${C.skyL};border-radius:10px;border-collapse:separate;overflow:hidden;">
    ${section("Student")}
    ${row("Name", `${esc(app.student_first_name)} ${esc(app.student_last_name)}`)}
    ${row("Date of birth", `${esc(app.student_dob)} — ${app.student_age_at_program} in summer 2027${app.parent_consent_required ? ` · <b style="color:${C.amber};">under 14: parent consent required (Law 25)</b>` : ""}`)}
    ${row("Email / phone", `${esc(app.student_email || "—")} · ${esc(app.student_phone || "—")}`)}
    ${row("Address", `${esc(app.city || "—")}, ${esc(app.province || "—")} ${esc(app.postal_code || "")}, ${esc(app.country || "")}`)}
    ${section("Parent or guardian")}
    ${row("Name", `${esc(app.parent_first_name)} ${esc(app.parent_last_name)} (${esc(label(LABELS.relationship, app.parent_relationship))})`)}
    ${row("Email / phone", `<a href="mailto:${esc(app.parent_email)}" style="color:${C.skyD};">${esc(app.parent_email)}</a> · ${esc(app.parent_phone)}`)}
    ${row("Confirmation", extra.parentEmailSent ? "Confirmation email sent — waiting for the parent's click" : (app.filled_by === "parent" ? "The parent filled in the application (confirmed)" : "No email sent"))}
    ${section("Program")}
    ${row("Program", esc(label(LABELS.program, app.program)))}
    ${row("Level", `${esc(label(LABELS.level, app.level))}${app.previous_aim_year ? ` (previous AIM class: ${app.previous_aim_year})` : ""}`)}
    ${row("Format", esc(label(LABELS.format, app.format)))}
    ${row("Sessions", `${esc(label(LABELS.session, app.session_first))}${app.session_second && app.session_second !== "none" ? `<br>2nd: ${esc(label(LABELS.session, app.session_second))}` : ""}`)}
    ${row("Heard about AIM", esc(app.heard_about || "—"))}
    ${section("School")}
    ${row("School", `${esc(app.school_name)} — ${esc(app.school_city)}, ${esc(app.school_province)}`)}
    ${row("Level 2026–27", esc(label(LABELS.level_school, app.school_level)))}
    ${row("English", app.english_ok ? "Comfortable following a class in English" : "<b>Not confirmed</b>")}
    ${section("Why AIM")}
    ${row("Motivation", app.motivation ? esc(app.motivation).replace(/\n/g, "<br>") : "<i>(not provided)</i>")}
    ${row("Anything else", app.notes ? esc(app.notes).replace(/\n/g, "<br>") : "—")}
    ${section("Meta")}
    ${row("Filled by", esc(label(LABELS.filledBy, app.filled_by)))}
    ${row("Verified email", esc(app.applicant_email))}
    ${row("Newsletter", app.consent_newsletter ? "Yes" : "No")}
    ${row("Submitted", `${esc(when)} (Montréal)`)}
    ${row("Page / source", `${esc(app.source_page || "—")}${app.utm_source ? ` · ${esc(app.utm_source)}` : ""}${app.utm_campaign ? ` · ${esc(app.utm_campaign)}` : ""}`)}
    ${row("Emails", `applicant ✓${extra.parentEmailSent ? " · parent ✓" : ""}${extra.studentCopySent ? " · student copy ✓" : ""}`)}
  </table>`;
  const inner =
    `<p style="margin:0 0 6px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${C.amber};font-weight:bold;">aimsummer.com · Apply now</p>
     <h1 style="margin:0 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.2;color:${C.deep};">${esc(app.student_first_name)} ${esc(app.student_last_name)} applied — ${esc(app.reference)}</h1>
     <p style="margin:0 0 14px;">Status: <b>submitted</b>. Promise on the site: a decision by email within ${esc(DECISION_DAYS)} business days. "Reply" answers the person who filled in the form.</p>
     ${table}
     <p style="margin:14px 0 0;font-size:13px;color:${C.muted};">To change the status, open Supabase → Table editor → applications → ${esc(app.reference)} (an admin page comes with Mission 03).</p>`;
  const html = plainShell(subject, inner);
  return { subject, html, text: toText(inner) };
}
