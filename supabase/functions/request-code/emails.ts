// AIM — the three automated emails of the "Learn more" flow (HTML + plain text).
// Brand: sky #3FA9F5 · white · yellow #FFC72C · deep blue #0B2F5B for text. Table layout for email clients.

import { NOTIFY_EMAIL, SENDER_EMAIL, SITE_URL } from "./common.ts";

export const ORG_NAME = "AIM — Academy of Investment & Management";
export const ORG_ADDRESS = Deno.env.get("ORG_ADDRESS") || "Montréal, Québec, Canada";
export const ORG_PHONE = Deno.env.get("ORG_PHONE") ?? "438-978-1687";   // set the secret to "" to hide the phone number
export const ORG_HOURS = Deno.env.get("ORG_HOURS") || "Mon–Thu and weekends, 8 am – 8 pm Montréal time";
const LOGO = Deno.env.get("EMAIL_LOGO_URL") || `${SITE_URL}/assets/logo/email-logo.png`;   // 160×160, badge on a white disc on sky

const C = { sky: "#3FA9F5", skyD: "#2B8FD8", skyT: "#EAF6FE", skyL: "#BFE2FB", yel: "#FFC72C", yelT: "#FFF6DC", amber: "#B07A10", deep: "#0B2F5B", ink: "#1E3A5F", muted: "#5A7089", white: "#FFFFFF" };

export function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function shell(opts: { title: string; preheader: string; body: string; footerNote: string }): string {
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.skyT};">
<div style="display:none;font-size:1px;color:${C.skyT};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(opts.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.skyT};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
    <tr><td style="background:${C.sky};border-radius:16px 16px 0 0;padding:22px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="width:52px;padding-right:14px;"><img src="${LOGO}" width="52" height="52" alt="AIM" style="display:block;border:0;"></td>
        <td style="font-family:Arial,Helvetica,sans-serif;color:${C.white};">
          <div style="font-size:22px;font-weight:bold;letter-spacing:4px;line-height:1;">AIM</div>
          <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${C.yel};font-weight:bold;margin-top:4px;">Academy of Investment &amp; Management</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="height:6px;background:${C.yel};font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td style="background:${C.white};padding:30px 28px 26px;font-family:Arial,Helvetica,sans-serif;color:${C.ink};font-size:16px;line-height:1.55;">
      ${opts.body}
    </td></tr>
    <tr><td style="background:${C.white};border-radius:0 0 16px 16px;padding:18px 28px 24px;border-top:1px solid ${C.skyL};font-family:Arial,Helvetica,sans-serif;color:${C.muted};font-size:12px;line-height:1.5;">
      <strong style="color:${C.deep};">${ORG_NAME}</strong><br>
      ${esc(ORG_ADDRESS)} · <a href="mailto:${SENDER_EMAIL}" style="color:${C.skyD};">${SENDER_EMAIL}</a>${ORG_PHONE ? ` · ${esc(ORG_PHONE)}` : ""}<br>
      <a href="${SITE_URL}" style="color:${C.skyD};">aimsummer.com</a> · <a href="${SITE_URL}/privacy.html" style="color:${C.skyD};">Privacy &amp; consent</a><br><br>
      ${opts.footerNote}<br>
      AIM is an independent program and is not affiliated with McGill University. Classes are taught in English.
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 6px;"><tr>
    <td style="background:${C.yel};border-radius:999px;">
      <a href="${href}" style="display:inline-block;padding:13px 26px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:${C.deep};text-decoration:none;">${label}</a>
    </td></tr></table>`;
}

function h2(text: string): string {
  return `<h2 style="margin:26px 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:1.25;color:${C.deep};">${text}</h2>`;
}

function card(inner: string, bg = C.skyT): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0;"><tr>
    <td style="background:${bg};border-radius:12px;padding:14px 16px;font-size:15px;line-height:1.5;color:${C.ink};">${inner}</td></tr></table>`;
}

/* ============================================================ 1. the code */

export function codeEmail(p: { code: string; firstName?: string | null; purpose?: "info" | "apply" }) {
  const name = p.firstName ? `Hi ${esc(p.firstName)},` : "Hi,";
  const apply = p.purpose === "apply";
  const subject = `Your AIM verification code: ${p.code}`;
  const preheader = apply
    ? `Enter this code on aimsummer.com to continue your application. It expires in 10 minutes.`
    : `Enter this code on aimsummer.com to receive your info pack. It expires in 10 minutes.`;
  const body = `
    <p style="margin:0 0 14px;">${name}</p>
    <p style="margin:0 0 18px;">${apply ? "Here is your single-use code to confirm your email address and continue your AIM application:" : "Here is your single-use code to confirm your email address and receive the AIM info pack:"}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td align="center" style="background:${C.skyT};border:2px dashed ${C.sky};border-radius:14px;padding:22px 10px;">
        <div style="font-family:'Courier New',Courier,monospace;font-size:40px;letter-spacing:12px;font-weight:bold;color:${C.deep};line-height:1;">${p.code}</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${C.muted};margin-top:10px;">Valid for 10 minutes</div>
      </td></tr></table>
    <p style="margin:18px 0 0;">${apply ? "Go back to the page you just left and type the code — your application continues right where you were." : "Go back to the page you just left and type the code — your info pack arrives right after."}</p>
    <p style="margin:14px 0 0;font-size:14px;color:${C.muted};">Didn't ask for this? Someone may have typed your address by mistake. You can safely ignore this email — nothing happens without the code.</p>`;
  const html = shell({ title: subject, preheader, body, footerNote: "You received this email because this address was entered on aimsummer.com a moment ago." });
  const text = `${p.firstName ? `Hi ${p.firstName},` : "Hi,"}

Your AIM verification code: ${p.code}
It is valid for 10 minutes. Go back to aimsummer.com and type it to ${apply ? "continue your application" : "receive your info pack"}.

Didn't ask for this? Ignore this email — nothing happens without the code.

${ORG_NAME} · ${ORG_ADDRESS} · ${SENDER_EMAIL}`;
  return { subject, html, text, params: { CODE: p.code, FIRST_NAME: p.firstName || "" } };
}

/* ============================================================ 2. the info pack
   One personal email, written by Rami, composed from blocks chosen by WHO is asking
   (student / parent / counselor / other) and WHAT they picked (campus / online / just finding out).
   Deliberately plain — paragraphs, a few bold lead-ins, three links, no banner, no buttons, no price
   table — so Gmail files it with personal mail (Primary), not with newsletters (Promotions). */

export type Role = "student" | "parent" | "counselor" | "other" | "";
export type Interest = "campus" | "online" | "info" | "";

export const INFO_SENDER_NAME = Deno.env.get("INFO_SENDER_NAME") || "Rami Jaouadi (AIM)";
const SIGNER = Deno.env.get("INFO_SIGNER") || "Rami Jaouadi";
const SIGNER_ROLE = Deno.env.get("INFO_SIGNER_ROLE") || "Co-founder, AIM — with Ilyas Zakiat, instructor";

const L = {
  program: `${SITE_URL}/program.html`,
  apply: `${SITE_URL}/apply.html`,
  lesson: `${SITE_URL}/learn-finance-basics.html`,
};
const a = (href: string, label: string) => `<a href="${href}" style="color:${C.skyD};">${label}</a>`;
const b = (s: string) => `<b style="color:${C.deep};">${s}</b>`;
const p = (s: string) => `<p style="margin:0 0 14px;">${s}</p>`;
const ul = (items: string[]) => `<ul style="margin:0 0 14px;padding-left:22px;">${items.map((i) => `<li style="margin:0 0 6px;">${i}</li>`).join("")}</ul>`;

/** Very small HTML → plain-text conversion for the text/plain part. */
export function toText(html: string): string {
  return html
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g, "$2 ($1)")
    .replace(/<ul[^>]*>/g, "\n").replace(/<li[^>]*>/g, "• ").replace(/<\/li>/g, "\n")
    .replace(/<\/p>|<\/ul>/g, "\n\n").replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function norm<T extends string>(v: unknown, allowed: readonly T[]): T | "" {
  return allowed.includes(v as T) ? (v as T) : "";
}

export function infoPackEmail(input: { firstName?: string | null; email: string; role?: string | null; interest?: string | null }) {
  const role = norm<Role>(input.role, ["student", "parent", "counselor", "other"]);
  const interest = norm<Interest>(input.interest, ["campus", "online", "info"]);
  const first = input.firstName ? esc(input.firstName) : "";
  const your = role === "student" ? "your" : role === "parent" ? "your child's" : "the student's";
  const rather = role === "student" ? "you'd rather be in the room" : role === "parent" ? "your child would rather be in the room" : "the student would rather be in the room";

  /* ---- subject ---- */
  const subjects: Record<string, string> = {
    "student|campus": "Your two weeks at McGill with AIM — the honest version",
    "student|online": "Your two weeks with AIM, live online — how it really works",
    "student|info": "AIM in 3 minutes — campus or online?",
    "parent|campus": "AIM at McGill — the details parents ask for",
    "parent|online": "AIM live online — the details parents ask for",
    "parent|info": "AIM for parents — the program, the two formats, the cost",
    "counselor|campus": "AIM at McGill — information for your students",
    "counselor|online": "AIM live online — information for your students",
    "counselor|info": "AIM — information for your students (campus and online)",
    "other|campus": "AIM at McGill — dates, days and cost",
    "other|online": "AIM live online — dates, hours and cost",
    "other|info": "AIM in 3 minutes — the program, campus or online",
  };
  const subject = subjects[`${role || "other"}|${interest || "info"}`] || "Your AIM info pack — Finance & Investment Summer Program 2027";

  /* ---- greeting + intro ---- */
  const hi = role === "student" ? `Hi${first ? ` ${first}` : ""},` : `Hello${first ? ` ${first}` : ""},`;
  const intros: Record<string, string> = {
    "student|campus": `Thanks for asking about AIM. You picked the ${b("McGill campus class")}, so here is what your two weeks would actually look like — written for you, not for your parents (show it to them anyway: a parent or guardian confirms every registration).`,
    "student|online": `Thanks for asking about AIM. You picked the ${b("live online class")}, so here is how it really works from your side of the screen — written for you (show it to a parent too: a parent or guardian confirms every registration).`,
    "student|info": `Thanks for asking about AIM. You said you're ${b("just finding out more")}, so here is the short, honest version: what it is, what you'd actually do all day, and how to choose between the campus class and the online class.`,
    "parent|campus": `Thank you for asking about AIM for your child. You asked about the ${b("McGill campus class")}, so here is what I would want to know as a parent: who teaches, how the days are organized and supervised, what it costs, and how registration works.`,
    "parent|online": `Thank you for asking about AIM for your child. You asked about the ${b("live online class")}, so here is what matters most from a parent's point of view: who teaches, how a live online day works, what your child needs at home, what it costs, and how registration works.`,
    "parent|info": `Thank you for your interest in AIM. You said you're ${b("just finding out more")}, so here is the short version for parents: what the program is, the two ways to attend, what it costs, and how to decide — with no commitment at this stage.`,
    "counselor|campus": `Thank you for your interest in AIM on behalf of your students. Here is what you need to present the ${b("McGill campus class")}, and how we work with schools and counselors.`,
    "counselor|online": `Thank you for your interest in AIM on behalf of your students. Here is what you need to present the ${b("live online class")}, and how we work with schools and counselors.`,
    "counselor|info": `Thank you for your interest in AIM on behalf of your students. Here is the program in short — ${b("both formats")} — and how we work with schools and counselors.`,
    "other|campus": `Thank you for asking about AIM. Here is everything about the ${b("McGill campus class")} in one email: what the program is, what a day looks like, what it costs, and how to join.`,
    "other|online": `Thank you for asking about AIM. Here is everything about the ${b("live online class")} in one email: what the program is, how the live sessions work, what it costs, and how to join.`,
    "other|info": `Thank you for asking about AIM. Here is everything in one email: what the program is, the two ways to attend, what it costs, and how to join.`,
  };
  const intro = intros[`${role || "other"}|${interest || "info"}`];

  /* ---- the program, in one paragraph (voice adapts to the reader) ---- */
  const program = role === "student"
    ? `${b("The program in one paragraph.")} AIM's Finance &amp; Investment Summer Program is two weeks, Monday to Friday, for students aged 13 to 18. Every lesson is taught live by ${b("Ilyas Zakiat")} — CEO and founder of BIASafe AI, and finance lecturer at McGill University. You'll learn how money, companies and markets really work, you'll manage a simulated ${b("$1,000,000 portfolio")} on a virtual exchange, you'll defend your strategy on pitch day, and you'll leave with a ${b("certificate of completion")}. There are three levels; everyone starts with the Beginner class. Classes are in English.`
    : `${b("The program in one paragraph.")} AIM's Finance &amp; Investment Summer Program is two weeks, Monday to Friday, for students aged 13 to 18. Every lesson is taught live by ${b("Ilyas Zakiat")} — CEO and founder of BIASafe AI, and finance lecturer at McGill University. Students learn how money, companies and markets really work, manage a simulated ${b("$1,000,000 portfolio")} on a virtual exchange, defend their strategy on pitch day, and leave with a ${b("certificate of completion")}. There are three levels; everyone starts with the Beginner class. Classes are in English${role === "parent" || role === "counselor" ? " (our team is bilingual, so you're welcome to write to us in French)" : ""}.`;

  /* ---- the format blocks ---- */
  const campusDay = `${b("A typical day on the McGill campus (9 am – 3 pm).")} 9 to 12: the lesson with Ilyas. 12 to 1: supervised lunch break. 1 to 3: practice — exercises, the virtual exchange, ${your} portfolio. Ten days, 60 hours on campus, ${b("32 students maximum")}, on McGill University's downtown Montréal campus; the exact building and room are emailed before the session starts.${role === "parent" ? " Students are with the instructor and the AIM team from 9 to 3, including the lunch break." : ""}`;
  const campusBring = `${b("What to bring.")} A laptop (or a tablet with a keyboard) and its charger, a notebook and a pen, a packed lunch and a water bottle. All the software we use is free — nothing to buy.`;
  const campusCost = `${b("Dates and cost.")} Summer 2027: Session 1 late June to early July, Session 2 in July before the construction holiday, Session 3 in August (waitlist). The campus class is ${b("$1,895 plus taxes")}. Exact dates and registration open in ${b("December 2026")} on aimsummer.com, and payment options are confirmed at registration. If getting downtown every day is a problem, the same class runs live online (1 – 3 pm) at $1,495 plus taxes.`;

  const onlineDay = `${b("How the live online class works (1 – 3 pm, Montréal time).")} Monday to Friday, two hours a day live with Ilyas — the same lessons, the same $1,000,000 portfolio and the same pitch day as the campus class. Recordings are posted in the student portal the same day, so a missed afternoon isn't lost. Twenty hours over two weeks, same certificate.${role === "parent" ? " It works from anywhere — a cottage, a trip, another province — as long as there is a quiet two-hour window." : ""}`;
  const onlineNeed = `${b(role === "student" ? "What you need." : "What the student needs at home.")} A laptop or desktop with a camera and a microphone, a stable internet connection, and a quiet spot for two hours. All the software we use is free.`;
  const onlineCost = `${b("Dates and cost.")} Summer 2027: Session 1 late June to early July, Session 2 in July before the construction holiday, Session 3 in August (waitlist). The online class is ${b("$1,495 plus taxes")}. Exact dates and registration open in ${b("December 2026")} on aimsummer.com, and payment options are confirmed at registration. If ${rather}, the same class runs on the McGill campus (9 am – 3 pm) at $1,895 plus taxes.`;

  const infoFormats = `${b("Two ways to attend.")} On the ${b("McGill campus")} in downtown Montréal, Monday to Friday 9 am – 3 pm (lesson in the morning, supervised lunch, practice in the afternoon), 32 students maximum, $1,895 plus taxes. Or ${b("live online")}, Monday to Friday 1 – 3 pm Montréal time, with recordings in the student portal, $1,495 plus taxes. Same instructor, same lessons, same certificate.`;
  const infoChoose = role === "student"
    ? `${b("How to choose.")} Pick the campus if you can get downtown every day and want the full-day experience — and a real taste of university life. Pick online if you're outside Montréal, away in July, or want to keep your mornings free.`
    : `${b("How to choose.")} The campus suits a student who can get downtown every day and wants the full-day experience (and a taste of university life). Online suits a family outside Montréal, travelling in July, or a student who wants the mornings free. Many parents decide once the exact dates are out in December.`;
  const infoDates = `${b("Dates.")} Summer 2027: Session 1 late June to early July, Session 2 in July before the construction holiday, Session 3 in August (waitlist). Exact dates and registration open in ${b("December 2026")} on aimsummer.com; payment options are confirmed at registration.`;

  const formatBlocks = interest === "campus" ? [campusDay, campusBring, campusCost]
    : interest === "online" ? [onlineDay, onlineNeed, onlineCost]
    : [infoFormats, infoChoose, infoDates];

  /* ---- next steps, by reader ---- */
  const nextByRole: Record<string, string> = {
    student: `${b("What to do now.")}` + ul([
      `Try a free lesson today — ${a(L.lesson, "Finance basics")} takes about 12 minutes, no account needed.`,
      `Show this email to a parent. Registration opens in December 2026, and a parent or guardian confirms it.`,
      `Questions? Just reply — a real person answers within two business days.`,
    ]),
    parent: `${b("Next steps.")} Registration for Summer 2027 opens in ${b("December 2026")} on aimsummer.com — you'll receive the exact dates by email first. Applying takes about 10 minutes, with no transcripts or recommendation letters, and nothing is due until you register. In the meantime, the full program page is here: ${a(L.program, "aimsummer.com/program")}, and your child can try a free lesson today: ${a(L.lesson, "Finance basics")}. Any question — about the content, the schedule or the payment options — just reply to this email. We answer within two business days, in English or in French.`,
    counselor: `${b("Working with your school.")} If several of your students are interested, reply with a rough number and the name of your school: we'll set up a short call, send you a one-page summary you can share, and we're glad to present the program to your students. Registration opens in December 2026; a parent or guardian confirms each student's registration. The full details are on ${a(L.program, "aimsummer.com/program")}, and the three free lessons (${a(L.lesson, "starting with Finance basics")}) are a good first taste for a class.`,
    other: `${b("Next steps.")} The full program page is here: ${a(L.program, "aimsummer.com/program")}. Registration for Summer 2027 opens in December 2026 on aimsummer.com, and ${a(L.apply, "applying")} takes about 10 minutes. Questions? Reply to this email — we answer within two business days.`,
  };
  const next = nextByRole[role || "other"];

  /* ---- assemble ---- */
  const blocks = [hi, intro, program, ...formatBlocks, next].map(p).join("");
  const closing = role === "student" ? "Talk soon," : "Warm regards,";
  const signerRole = role === "student" ? SIGNER_ROLE.replace(", instructor", ", your instructor") : SIGNER_ROLE;
  const signoff = `<p style="margin:22px 0 0;">${closing}<br>${b(SIGNER)}<br><span style="color:${C.muted};">${esc(signerRole)}</span><br><span style="color:${C.muted};">${SENDER_EMAIL}${ORG_PHONE ? ` · ${esc(ORG_PHONE)} (${esc(ORG_HOURS)})` : ""}</span></p>`;
  const footer = `<p style="margin:26px 0 0;font-size:12px;line-height:1.5;color:${C.muted};">${ORG_NAME} · ${esc(ORG_ADDRESS)}. AIM is an independent program and is not affiliated with McGill University. You received this email because you asked for the AIM info pack on aimsummer.com (${esc(input.email)}). If that wasn't you, just reply and we'll delete your address.</p>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#FFFFFF;">
<div style="max-width:640px;margin:0;padding:18px 16px;font-family:Arial,Helvetica,sans-serif;font-size:15.5px;line-height:1.6;color:${C.ink};">
${blocks}${signoff}${footer}
</div>
</body></html>`;
  const text = toText(blocks + signoff + footer);
  return { subject, html, text, variant: `${role || "other"}|${interest || "info"}`, params: { FIRST_NAME: input.firstName || "", EMAIL: input.email, ROLE: role, INTEREST: interest } };
}

/* ============================================================ 3. the alert to hello@ */

export function notifyEmail(lead: {
  first_name?: string | null; email: string; role?: string | null; interest?: string | null;
  consent_newsletter?: boolean | null; source_page?: string | null; referrer?: string | null;
  utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null;
  user_agent?: string | null; created_at?: string | null; request_count?: number | null;
  info_pack_sent?: boolean;
}) {
  const roleLabel: Record<string, string> = { student: "Student", parent: "Parent / guardian", counselor: "Counselor / teacher", other: "Other" };
  const interestLabel: Record<string, string> = { campus: "Beginner class — McGill campus", online: "Beginner class — online", info: "Just finding out more" };
  const who = lead.first_name || "Someone";
  const role = roleLabel[lead.role || ""] || lead.role || "—";
  const interest = interestLabel[lead.interest || ""] || lead.interest || "—";
  const when = new Date().toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" });
  const subject = `New info request — ${who} (${role}) · ${interest}`;
  const row = (k: string, v: string) => `<tr><td style="padding:7px 10px;border-bottom:1px solid ${C.skyL};color:${C.deep};font-weight:bold;white-space:nowrap;">${k}</td><td style="padding:7px 10px;border-bottom:1px solid ${C.skyL};">${v}</td></tr>`;
  const body = `
    <p style="margin:0 0 6px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${C.amber};font-weight:bold;">aimsummer.com · Learn more</p>
    <h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.2;color:${C.deep};">${esc(who)} asked for the info pack</h1>
    <p style="margin:0 0 14px;">The email address is <strong>verified</strong> (the 6-digit code was entered)${lead.info_pack_sent === false ? "" : " and the info pack has been sent automatically"}. ${lead.request_count && lead.request_count > 1 ? `This is request #${lead.request_count} from this address.` : ""}</p>
    ${lead.info_pack_sent === false ? `<p style="margin:0 0 14px;padding:12px 14px;background:${C.yelT};border-left:4px solid ${C.yel};border-radius:8px;"><strong style="color:${C.deep};">The info pack could NOT be sent automatically.</strong> Please reply to this person by hand with the program information.</p>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:15px;border:1px solid ${C.skyL};border-radius:10px;border-collapse:separate;overflow:hidden;">
      ${row("Name", esc(lead.first_name || "—"))}
      ${row("Email", `<a href="mailto:${esc(lead.email)}" style="color:${C.skyD};">${esc(lead.email)}</a>`)}
      ${row("Who", esc(role))}
      ${row("Interested in", esc(interest))}
      ${row("Newsletter", lead.consent_newsletter ? "Yes — added to the Brevo list" : "No")}
      ${row("Page", esc(lead.source_page || "—"))}
      ${row("Came from", esc(lead.referrer || lead.utm_source || "—") + (lead.utm_campaign ? ` · ${esc(lead.utm_campaign)}` : ""))}
      ${row("When", esc(when) + " (Montréal)")}
      ${row("Device", esc((lead.user_agent || "—").slice(0, 120)))}
    </table>
    ${button(`mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent("Your questions about AIM")}`, `Reply to ${esc(lead.first_name || "them")}`)}
    <p style="margin:12px 0 0;font-size:14px;color:${C.muted};">Our promise on the site: a human reply within two business days.</p>`;
  const html = shell({ title: subject, preheader: `${who} · ${role} · ${interest}`, body, footerNote: "Internal notification from the aimsummer.com website." });
  const text = `${who} asked for the AIM info pack (email verified${lead.info_pack_sent === false ? " — INFO PACK NOT SENT, please reply by hand" : ", info pack sent"}).

Name: ${lead.first_name || "—"}
Email: ${lead.email}
Who: ${role}
Interested in: ${interest}
Newsletter: ${lead.consent_newsletter ? "yes" : "no"}
Page: ${lead.source_page || "—"}
When: ${when} (Montréal)

Reply within two business days.`;
  return { subject, html, text, to: NOTIFY_EMAIL };
}
