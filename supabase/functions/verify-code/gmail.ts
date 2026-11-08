// AIM — send a one-to-one email through the hello@aimsummer.com Google Workspace mailbox (SMTP).
// Why: Gmail files mail that comes from a person's mailbox in "Primary"; mail relayed by an email
// service (Brevo) with a List-Unsubscribe header tends to land in "Promotions". The info pack is the
// email that matters most, so it goes out through Gmail when GMAIL_APP_PASSWORD is set, with Brevo as
// the fallback. Setup: hello@ → 2-Step Verification on → App passwords → "AIM website" → copy the 16
// characters into the Supabase secret GMAIL_APP_PASSWORD.
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

export const GMAIL_USER = Deno.env.get("GMAIL_USER") || "hello@aimsummer.com";

export function gmailConfigured(): boolean {
  return Boolean((Deno.env.get("GMAIL_APP_PASSWORD") || "").replace(/\s+/g, ""));
}

export type GmailMessage = {
  to: { email: string; name?: string };
  fromName: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

/** Sends through smtp.gmail.com (implicit TLS, port 465). Throws on failure. */
export async function sendViaGmail(msg: GmailMessage): Promise<void> {
  const password = (Deno.env.get("GMAIL_APP_PASSWORD") || "").replace(/\s+/g, "");
  if (!password) throw new Error("GMAIL_APP_PASSWORD is not set");
  const client = new SMTPClient({
    connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: GMAIL_USER, password } },
  });
  try {
    await client.send({
      from: `"${msg.fromName.replace(/"/g, "'")}" <${GMAIL_USER}>`,
      to: msg.to.name ? `"${msg.to.name.replace(/"/g, "'")}" <${msg.to.email}>` : msg.to.email,
      replyTo: msg.replyTo || GMAIL_USER,
      subject: msg.subject,
      content: msg.text,
      html: msg.html,
    });
  } finally {
    try { await client.close(); } catch { /* already closed */ }
  }
}
