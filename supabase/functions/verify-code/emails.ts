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

export function codeEmail(p: { code: string; firstName?: string | null }) {
  const name = p.firstName ? `Hi ${esc(p.firstName)},` : "Hi,";
  const subject = `Your AIM verification code: ${p.code}`;
  const preheader = `Enter this code on aimsummer.com to receive your info pack. It expires in 10 minutes.`;
  const body = `
    <p style="margin:0 0 14px;">${name}</p>
    <p style="margin:0 0 18px;">Here is your single-use code to confirm your email address and receive the AIM info pack:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td align="center" style="background:${C.skyT};border:2px dashed ${C.sky};border-radius:14px;padding:22px 10px;">
        <div style="font-family:'Courier New',Courier,monospace;font-size:40px;letter-spacing:12px;font-weight:bold;color:${C.deep};line-height:1;">${p.code}</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${C.muted};margin-top:10px;">Valid for 10 minutes</div>
      </td></tr></table>
    <p style="margin:18px 0 0;">Go back to the page you just left and type the code — your info pack arrives right after.</p>
    <p style="margin:14px 0 0;font-size:14px;color:${C.muted};">Didn't ask for this? Someone may have typed your address by mistake. You can safely ignore this email — nothing happens without the code.</p>`;
  const html = shell({ title: subject, preheader, body, footerNote: "You received this email because this address was entered on aimsummer.com a moment ago." });
  const text = `${p.firstName ? `Hi ${p.firstName},` : "Hi,"}

Your AIM verification code: ${p.code}
It is valid for 10 minutes. Go back to aimsummer.com and type it to receive your info pack.

Didn't ask for this? Ignore this email — nothing happens without the code.

${ORG_NAME} · ${ORG_ADDRESS} · ${SENDER_EMAIL}`;
  return { subject, html, text, params: { CODE: p.code, FIRST_NAME: p.firstName || "" } };
}

/* ============================================================ 2. the info pack */

export function infoPackEmail(p: { firstName?: string | null; email: string; role?: string | null; interest?: string | null }) {
  const first = p.firstName ? esc(p.firstName) : "there";
  const subject = "Your AIM info pack — Finance & Investment Summer Program 2027";
  const preheader = "Two weeks at McGill or live online, ages 13–18, taught by a CEO. Dates, prices, what's included and how to apply.";
  const youAre = p.role === "parent" ? "your child" : "you";
  const body = `
    <p style="margin:0 0 6px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${C.amber};font-weight:bold;">Your info pack</p>
    <h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:27px;line-height:1.2;color:${C.deep};">Hi ${first} — here is everything in one email.</h1>
    <p style="margin:0 0 10px;">Thank you for your interest in AIM. Below: what the program is, the three classes, campus vs. online, the 2027 dates and prices, what's included, and how to apply. Reply to this email with any question — a real person answers within two business days.</p>

    ${h2("The program in 30 seconds")}
    ${card(`
      <strong style="color:${C.deep};">Finance &amp; Investment Summer Program</strong> — a two-week program for students aged <strong>13 to 18</strong>, on the <strong>McGill University downtown campus</strong> in Montréal or <strong>live online</strong>.<br><br>
      Every lesson is taught live by <strong>Ilyas Zakiat</strong> — CEO and founder of BIASafe AI and finance lecturer at McGill University. Students learn how money, companies and markets really work, manage a <strong>simulated $1,000,000 portfolio</strong>, defend their strategy on pitch day, and leave with a <strong>certificate of completion</strong>. All classes are taught in <strong>English</strong>.`)}

    ${h2("Three classes — you join one")}
    ${card(`<strong style="color:${C.deep};">Class 1 · Beginner — Introduction to Finance &amp; Investment</strong><br>No finance background needed. How money works, how the stock market moves, how to read a company, how to build a first portfolio. <em>Capstone: you'll manage a million dollars.</em>`)}
    ${card(`<strong style="color:${C.deep};">Class 2 · Intermediate</strong><br>The economy and the markets, bonds, ETFs, measuring risk, valuation, market history. <em>Capstone: the Fund Manager Challenge.</em> Requires Class 1 with AIM.`, C.white)}
    ${card(`<strong style="color:${C.deep};">Class 3 · Advanced</strong><br>How Wall Street works, options and futures, quantitative investing, hedge funds, risk management and AI. <em>Capstone: the Investment Committee Pitch.</em> Requires Classes 1 and 2 with AIM.`)}

    ${h2("On campus or online")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="50%" valign="top" style="padding:0 6px 0 0;">
        <div style="background:${C.skyT};border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.5;height:100%;">
          <strong style="color:${C.deep};font-size:15px;">McGill campus</strong><br>
          10 days, Monday to Friday, <strong>9 am – 3 pm</strong><br>
          9–12: the lesson with Ilyas Zakiat<br>
          12–1: supervised lunch break<br>
          1–3: practice, exercises, the virtual exchange<br>
          <strong>60 hours</strong> · max. 32 students
        </div>
      </td>
      <td width="50%" valign="top" style="padding:0 0 0 6px;">
        <div style="background:${C.yelT};border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.5;height:100%;">
          <strong style="color:${C.deep};font-size:15px;">Live online</strong><br>
          Same dates, same instructor<br>
          Monday to Friday, <strong>1 – 3 pm</strong> (Montréal time)<br>
          Fully taught live by Ilyas Zakiat<br>
          Recordings in the student portal<br>
          <strong>20 hours</strong> · same certificate
        </div>
      </td>
    </tr></table>

    ${h2("Summer 2027 — dates and prices")}
    ${card(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:15px;">
        <tr><td style="padding:4px 0;color:${C.deep};"><strong>Session 1</strong></td><td style="padding:4px 0;">Late June – early July 2027</td></tr>
        <tr><td style="padding:4px 0;color:${C.deep};"><strong>Session 2</strong></td><td style="padding:4px 0;">July 2027, before the construction holiday</td></tr>
        <tr><td style="padding:4px 0;color:${C.deep};"><strong>Session 3</strong></td><td style="padding:4px 0;">August 2027 — waitlist</td></tr>
        <tr><td style="padding:10px 0 4px;color:${C.deep};"><strong>Campus</strong></td><td style="padding:10px 0 4px;"><strong>$1,895</strong> + taxes</td></tr>
        <tr><td style="padding:4px 0;color:${C.deep};"><strong>Online</strong></td><td style="padding:4px 0;"><strong>$1,495</strong> + taxes</td></tr>
      </table>
      <div style="margin-top:10px;font-size:14px;color:${C.muted};">Each session runs on campus and online. Exact dates and registration open in <strong style="color:${C.deep};">December 2026</strong> on aimsummer.com — payment options are confirmed at registration. Prices in Canadian dollars.</div>`)}

    ${h2("What's included · what to bring")}
    ${card(`
      <strong style="color:${C.deep};">Included:</strong> all lessons and practice sessions, the virtual stock exchange with real market data, the student portal (lessons, exercises, recordings), all materials and readings, the capstone project and the certificate of completion. All software is free — nothing to buy, nothing to install.<br><br>
      <strong style="color:${C.deep};">To bring:</strong> a laptop (or a tablet with a keyboard) and its charger, a notebook and pen — and, on campus, a packed lunch and a water bottle.`)}

    ${h2("Next steps")}
    <p style="margin:0 0 4px;">Applying takes about 10 minutes — no transcripts, no recommendation letters. A parent or guardian confirms every registration.</p>
    ${button(`${SITE_URL}/apply.html`, "Apply on aimsummer.com")}
    <p style="margin:14px 0 0;font-size:15px;">Not sure yet? Start with our three free lessons: <a href="${SITE_URL}/learn-finance-basics.html" style="color:${C.skyD};">Finance basics</a> · <a href="${SITE_URL}/learn-stock-market-basics.html" style="color:${C.skyD};">Stock market basics</a> · <a href="${SITE_URL}/learn-start-investing-in-canada.html" style="color:${C.skyD};">How to start investing in Canada</a>.</p>

    ${h2("Questions?")}
    <p style="margin:0;">Just reply to this email or write to <a href="mailto:${SENDER_EMAIL}" style="color:${C.skyD};">${SENDER_EMAIL}</a>${ORG_PHONE ? ` — or call <strong>${esc(ORG_PHONE)}</strong> (${esc(ORG_HOURS)})` : ""}. We're happy to talk to parents and students alike.</p>
    <p style="margin:18px 0 0;">Looking forward to meeting ${youAre} this summer,<br><strong style="color:${C.deep};">Ilyas Zakiat &amp; Rami Jaouadi</strong><br><span style="color:${C.muted};font-size:14px;">AIM — Academy of Investment &amp; Management</span></p>`;
  const html = shell({
    title: subject, preheader, body,
    footerNote: `You received this email because you asked for the AIM info pack on aimsummer.com (${esc(p.email)}). Prefer not to hear from us again? Reply with "unsubscribe" and we'll remove your address.`,
  });
  const text = `Hi ${p.firstName || "there"} — here is everything in one email.

THE PROGRAM IN 30 SECONDS
Finance & Investment Summer Program: two weeks for students aged 13 to 18, on the McGill University downtown campus in Montréal or live online. Every lesson is taught live by Ilyas Zakiat, CEO and founder of BIASafe AI and finance lecturer at McGill. Students manage a simulated $1,000,000 portfolio and leave with a certificate of completion. All classes in English.

THREE CLASSES — YOU JOIN ONE
Class 1 · Beginner — Introduction to Finance & Investment (no background needed)
Class 2 · Intermediate (requires Class 1 with AIM)
Class 3 · Advanced (requires Classes 1 and 2 with AIM)

ON CAMPUS OR ONLINE
Campus: 10 days, Mon–Fri, 9 am – 3 pm (lesson 9–12 with Ilyas, supervised lunch 12–1, practice 1–3). 60 hours, max. 32 students.
Online: same dates, Mon–Fri 1 – 3 pm (Montréal time), fully taught live by Ilyas Zakiat, recordings in the student portal. 20 hours, same certificate.

SUMMER 2027 — DATES AND PRICES
Session 1: late June – early July 2027 · Session 2: July 2027, before the construction holiday · Session 3: August 2027 (waitlist)
Campus $1,895 + taxes · Online $1,495 + taxes (CAD). Exact dates and registration open in December 2026 on aimsummer.com; payment options are confirmed at registration.

INCLUDED / TO BRING
Included: all lessons and practice, the virtual stock exchange, the student portal, materials, the capstone and the certificate. All software is free.
To bring: a laptop (or tablet with keyboard) and charger, a notebook and pen, and on campus a packed lunch and a water bottle.

NEXT STEPS
Apply: ${SITE_URL}/apply.html (about 10 minutes; a parent or guardian confirms every registration)
Free lessons: ${SITE_URL}/learn-finance-basics.html · ${SITE_URL}/learn-stock-market-basics.html · ${SITE_URL}/learn-start-investing-in-canada.html

QUESTIONS?
Reply to this email or write to ${SENDER_EMAIL}${ORG_PHONE ? ` — or call ${ORG_PHONE} (${ORG_HOURS})` : ""}.

Ilyas Zakiat & Rami Jaouadi — ${ORG_NAME}
${ORG_ADDRESS} · ${SENDER_EMAIL}
You received this email because you asked for the AIM info pack on aimsummer.com (${p.email}). Reply "unsubscribe" to be removed.
AIM is an independent program and is not affiliated with McGill University.`;
  return { subject, html, text, params: { FIRST_NAME: p.firstName || "", EMAIL: p.email, ROLE: p.role || "", INTEREST: p.interest || "" } };
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
