// AIM — the one reminder we send when an application was started but not sent (48 h later).
// Same plain, personal style as the info pack: paragraphs, one link, signed by Rami.

import { SENDER_EMAIL, SITE_URL } from "./common.ts";

const ORG_NAME = "AIM — Academy of Investment & Management";
const ORG_ADDRESS = Deno.env.get("ORG_ADDRESS") || "Montréal, Québec, Canada";
const ORG_PHONE = Deno.env.get("ORG_PHONE") ?? "438-978-1687";
const ORG_HOURS = Deno.env.get("ORG_HOURS") || "Mon–Thu and weekends, 8 am – 8 pm Montréal time";
export const INFO_SENDER_NAME = Deno.env.get("INFO_SENDER_NAME") || "Rami Jaouadi (AIM)";
const SIGNER = Deno.env.get("INFO_SIGNER") || "Rami Jaouadi";
const SIGNER_ROLE = Deno.env.get("INFO_SIGNER_ROLE") || "Co-founder, AIM — with Ilyas Zakiat, instructor";
const PURGE_DAYS = Number(Deno.env.get("DRAFT_PURGE_DAYS") || "60");

const C = { skyD: "#2B8FD8", deep: "#0B2F5B", ink: "#1E3A5F", muted: "#5A7089" };

export function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const b = (s: string) => `<b style="color:${C.deep};">${s}</b>`;
const p = (s: string) => `<p style="margin:0 0 14px;">${s}</p>`;
const a = (href: string, label: string) => `<a href="${href}" style="color:${C.skyD};">${label}</a>`;

export function toText(html: string): string {
  return html
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g, "$2 ($1)")
    .replace(/<\/p>/g, "\n\n").replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const STEP_NAME: Record<string, string> = { start: "the first step", email: "step 1 (your email)", student: "step 2 (the student)", parent: "step 3 (parent or guardian)", program: "step 4 (your program)", school: "step 5 (your school)", why: "step 6 (why AIM)", review: "the last look before sending" };
const MINUTES_LEFT: Record<string, number> = { start: 10, email: 10, student: 8, parent: 6, program: 5, school: 3, why: 2, review: 1 };

export type DraftRow = { email: string; step: string | null; data: Record<string, unknown>; updated_at: string };

export function reminderEmail(d: DraftRow) {
  const data = d.data || {};
  const student = typeof data.student_first_name === "string" ? data.student_first_name.trim() : "";
  const parent = typeof data.parent_first_name === "string" ? data.parent_first_name.trim() : "";
  const byParent = data.filled_by === "parent";
  const first = byParent ? (parent || "") : (student || "");
  const step = d.step && STEP_NAME[d.step] ? d.step : "student";
  const when = new Date(d.updated_at).toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "long", day: "numeric" });
  const minutes = MINUTES_LEFT[step] ?? 5;
  const link = `${SITE_URL}/apply.html?resume=1`;

  const subject = student && byParent ? `${student}'s AIM application is saved — finish it in ${minutes} minute${minutes === 1 ? "" : "s"}`
    : `Your AIM application is saved — finish it in ${minutes} minute${minutes === 1 ? "" : "s"}`;

  const blocks = [
    `Hi${first ? ` ${esc(first)}` : ""},`,
    `On ${when} you started an application to AIM's summer program${student && byParent ? ` for ${esc(student)}` : ""} and got as far as ${b(STEP_NAME[step])}. ${b("Everything you typed is saved")} — finishing takes about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    `${b("Continue here:")} ${a(link, link)}<br>On the same device, press <i>Continue where I left off</i>. On another device, confirm your email with a new 6-digit code and we bring your answers back.`,
    `${b("Why finish now?")} Seats are limited (32 per campus session) and earlier applications have more choice of session and format. There is no fee, nothing to pay before registration opens in December 2026, and we email our decision within 3 business days.`,
    `If you've changed your mind, there is nothing to do — unfinished applications are deleted after ${PURGE_DAYS} days, and this is the only reminder we send. Questions? Just reply to this email.`,
  ].map(p).join("");
  const signoff = `<p style="margin:22px 0 0;">Warm regards,<br>${b(SIGNER)}<br><span style="color:${C.muted};">${esc(SIGNER_ROLE)}</span><br><span style="color:${C.muted};">${SENDER_EMAIL}${ORG_PHONE ? ` · ${esc(ORG_PHONE)} (${esc(ORG_HOURS)})` : ""}</span></p>`;
  const footer = `<p style="margin:26px 0 0;font-size:12px;line-height:1.5;color:${C.muted};">${ORG_NAME} · ${esc(ORG_ADDRESS)}. AIM is an independent program and is not affiliated with McGill University. You received this email because an application was started on aimsummer.com with this address (${esc(d.email)}). If that wasn't you, just reply and we'll delete it.</p>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#FFFFFF;">
<div style="max-width:640px;margin:0;padding:18px 16px;font-family:Arial,Helvetica,sans-serif;font-size:15.5px;line-height:1.6;color:${C.ink};">
${blocks}${signoff}${footer}
</div>
</body></html>`;
  return { subject, html, text: toText(blocks + signoff + footer), minutes, step };
}
