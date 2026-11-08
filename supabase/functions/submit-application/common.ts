// AIM — shared helpers for the "Learn more" Edge Functions (request-code, verify-code).
// Deno / Supabase Edge Runtime. No secrets in this file: everything comes from env vars.
//
// Required secret (Supabase → Edge Functions → Secrets):  BREVO_API_KEY
// Optional secrets: BREVO_LIST_ID, NOTIFY_EMAIL, SENDER_EMAIL, SENDER_NAME, SITE_URL,
//                   BREVO_TEMPLATE_CODE_ID, BREVO_TEMPLATE_INFO_ID, BREVO_TEMPLATE_NOTIFY_ID

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const SITE_URL = (Deno.env.get("SITE_URL") || "https://aimsummer.com").replace(/\/$/, "");
export const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL") || "hello@aimsummer.com";
export const SENDER_NAME = Deno.env.get("SENDER_NAME") || "AIM — Academy of Investment & Management";
export const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL") || "hello@aimsummer.com";
export const CODE_TTL_SECONDS = 10 * 60;      // a code is valid for 10 minutes
export const RESEND_COOLDOWN_SECONDS = 60;    // one code per minute per email
export const MAX_CODES_PER_EMAIL_PER_HOUR = 5;
export const MAX_CODES_PER_IP_PER_HOUR = 20;
export const MAX_ATTEMPTS_PER_CODE = 5;

const ALLOWED_ORIGINS = new Set([
  "https://aimsummer.com",
  "https://www.aimsummer.com",
  "https://jaouadirami969-design.github.io",
  "http://localhost:4000",
  "http://127.0.0.1:4000",
]);

/* ---------------- HTTP helpers ---------------- */

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://aimsummer.com";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function json(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function fail(req: Request, status: number, error: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json(req, status, { ok: false, error, message, ...extra });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const text = await req.text();
    if (!text) return {};
    const data = JSON.parse(text);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return (fwd.split(",")[0] || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "").trim();
}

export function str(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/* ---------------- email validation ---------------- */

const EMAIL_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (e.length < 6 || e.length > 254 || !EMAIL_RE.test(e)) return null;
  const [local, domain] = e.split("@");
  if (local.length > 64 || domain.includes("..")) return null;
  return e;
}

// Common throw-away mailboxes: a parent who wants the info pack never uses these.
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "10minutemail.com", "10minutemail.net",
  "yopmail.com", "yopmail.fr", "temp-mail.org", "tempmail.com", "tempmail.net", "tempmailo.com", "trashmail.com",
  "trashmail.me", "getnada.com", "nada.email", "dispostable.com", "maildrop.cc", "fakeinbox.com", "mohmal.com",
  "throwawaymail.com", "mailnesia.com", "mintemail.com", "mytemp.email", "emailondeck.com", "tempr.email",
  "discard.email", "spamgourmet.com", "burnermail.io", "inboxkitten.com", "tmpmail.org", "tmpmail.net", "mail.tm",
  "1secmail.com", "1secmail.org", "1secmail.net", "mailsac.com", "guerrillamailblock.com", "grr.la", "example.com",
  "example.org", "example.net", "test.com", "email.com",
]);

export function isDisposable(email: string): boolean {
  const domain = email.split("@")[1];
  return DISPOSABLE.has(domain);
}

// Common typos of the big providers → a friendly suggestion.
const TYPO_FIX: Record<string, string> = {
  "gmail.co": "gmail.com", "gmail.cm": "gmail.com", "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gamil.com": "gmail.com",
  "gmail.con": "gmail.com", "gnail.com": "gmail.com", "gmaill.com": "gmail.com", "googlemail.co": "googlemail.com",
  "hotmail.co": "hotmail.com", "hotmai.com": "hotmail.com", "hotmial.com": "hotmail.com", "hotmail.con": "hotmail.com",
  "outlook.co": "outlook.com", "outlok.com": "outlook.com", "outloook.com": "outlook.com", "yahoo.co": "yahoo.com",
  "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "icloud.co": "icloud.com", "iclould.com": "icloud.com",
  "videotron.c": "videotron.ca", "sympatico.c": "sympatico.ca", "bell.ne": "bell.net",
};

export function suggestDomainFix(email: string): string | null {
  const [local, domain] = email.split("@");
  const fix = TYPO_FIX[domain];
  return fix ? `${local}@${fix}` : null;
}

type DnsAnswer = { Status?: number; Answer?: Array<{ type: number; data: string }> };

async function doh(name: string, type: "MX" | "A" | "AAAA"): Promise<DnsAnswer | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as DnsAnswer;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Does this domain have a mail server? "ok" | "no-mail" | "unknown" (lookup failed → fail open). */
export async function domainAcceptsMail(domain: string): Promise<"ok" | "no-mail" | "unknown"> {
  const mx = await doh(domain, "MX");
  if (mx) {
    if (mx.Status === 3) return "no-mail";                      // NXDOMAIN: the domain does not exist
    if (mx.Status === 0 && mx.Answer?.some((a) => a.type === 15)) return "ok";
    if (mx.Status === 0) {
      // No MX: a few domains still accept mail on their A record. Accept if an A/AAAA exists.
      const a = await doh(domain, "A");
      if (a?.Answer?.some((r) => r.type === 1)) return "ok";
      const aaaa = await doh(domain, "AAAA");
      if (aaaa?.Answer?.some((r) => r.type === 28)) return "ok";
      return "no-mail";
    }
  }
  // DoH unavailable → try the runtime resolver, then fail open (never block a real family on a DNS hiccup).
  try {
    const records = await Deno.resolveDns(domain, "MX");
    return records.length ? "ok" : "no-mail";
  } catch (err) {
    const name = (err as { name?: string })?.name || "";
    if (name === "NotFound") return "no-mail";
    return "unknown";
  }
}

/* ---------------- crypto ---------------- */

const enc = new TextEncoder();

async function hmacHex(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function secretKey(): string {
  // The service-role key is private to the project and always present in Edge Functions.
  return Deno.env.get("CODE_PEPPER") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "aim-fallback-pepper";
}

export function hashCode(email: string, code: string): Promise<string> {
  return hmacHex(secretKey(), `code:${email}:${code}`);
}

export function hashIp(ip: string): Promise<string> {
  return hmacHex(secretKey(), `ip:${ip || "unknown"}`);
}

export function sixDigitCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------------- short-lived signed tokens (the application continues after the code) ---------------- */

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
  const str = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(str, (c) => c.charCodeAt(0));
}

/** Signs a small payload (plus an expiry) with the project secret. Nothing is stored server-side. */
export async function signToken(payload: Record<string, unknown>, ttlSeconds: number): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ ...payload, x: Math.floor(Date.now() / 1000) + ttlSeconds })));
  const sig = await hmacHex(secretKey(), `tok:${body}`);
  return `${body}.${sig}`;
}

/** Returns the payload if the signature is valid and the token has not expired, else null. */
export async function verifyToken(token: unknown): Promise<Record<string, unknown> | null> {
  if (typeof token !== "string" || token.length > 2000) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await hmacHex(secretKey(), `tok:${body}`);
  if (!timingSafeEqual(expected, sig)) return null;
  try {
    const json = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (!json || typeof json.x !== "number" || json.x * 1000 < Date.now()) return null;
    return json;
  } catch {
    return null;
  }
}

/** Random URL-safe token (for one-click links) and its stored hash. */
export function randomToken(bytes = 24): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return b64url(b);
}
export function hashToken(t: string): Promise<string> {
  return hmacHex(secretKey(), `ptok:${t}`);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  const shown = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${shown}${"•".repeat(Math.max(2, Math.min(6, local.length - shown.length)))}@${domain}`;
}

/* ---------------- Supabase ---------------- */

export function admin(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function logEvent(sb: SupabaseClient, leadId: string | null, email: string | null, type: string, detail: Record<string, unknown> = {}) {
  try {
    await sb.from("lead_events").insert({ lead_id: leadId, email, type, detail });
  } catch {
    // never let logging break the flow
  }
}

/* ---------------- Brevo ---------------- */

export type Mail = {
  to: { email: string; name?: string }[];
  fromName?: string;            // defaults to SENDER_NAME
  subject: string;
  html: string;
  text: string;
  tags?: string[];
  templateId?: number;
  params?: Record<string, unknown>;
  replyTo?: { email: string; name?: string };
};

export function brevoConfigured(): boolean {
  return Boolean(Deno.env.get("BREVO_API_KEY"));
}

/** Sends one transactional email through Brevo. Returns the Brevo messageId. Throws on failure. */
export async function sendMail(mail: Mail): Promise<string> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) throw new Error("BREVO_API_KEY is not set (Supabase → Edge Functions → Secrets)");

  const payload: Record<string, unknown> = {
    sender: { name: mail.fromName || SENDER_NAME, email: SENDER_EMAIL },
    to: mail.to,
    replyTo: mail.replyTo || { email: SENDER_EMAIL, name: "AIM" },
    tags: mail.tags || [],
  };
  if (mail.templateId) {
    payload.templateId = mail.templateId;
    payload.params = mail.params || {};
  } else {
    payload.subject = mail.subject;
    payload.htmlContent = mail.html;
    payload.textContent = mail.text;
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${body.slice(0, 300)}`);
  try {
    return (JSON.parse(body) as { messageId?: string }).messageId || "";
  } catch {
    return "";
  }
}

/** Creates or updates the contact in Brevo and adds it to the newsletter list (if BREVO_LIST_ID is set). */
export async function upsertBrevoContact(email: string, attributes: Record<string, unknown>): Promise<void> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) throw new Error("BREVO_API_KEY is not set");
  const listId = Number(Deno.env.get("BREVO_LIST_ID") || "");
  const payload: Record<string, unknown> = { email, attributes, updateEnabled: true };
  if (listId) payload.listIds = [listId];
  const res = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok && res.status !== 204 && res.status !== 201) {
    const body = await res.text();
    throw new Error(`Brevo contacts ${res.status}: ${body.slice(0, 300)}`);
  }
}

export function envInt(name: string): number | undefined {
  const v = Number(Deno.env.get(name) || "");
  return Number.isFinite(v) && v > 0 ? v : undefined;
}
