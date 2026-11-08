// AIM — "Your answers are saved": a copy of an application in progress, keyed by the verified email.
// The website saves in the browser as you type; once the email is verified it also sends the answers here
// (debounced), so a family can continue on another device and we can send one reminder after 48 hours.
//
// POST /functions/v1/save-draft   { token, draft: { step, data, savedAt } }   → 200 { ok:true, saved_at }
// POST /functions/v1/save-draft   { token, delete: true }                      → 200 { ok:true, deleted:true }
// 401 token_invalid · 400 invalid_draft · 413 too_large

import { admin, corsHeaders, fail, json, normalizeEmail, readJson, verifyToken } from "./common.ts";

const MAX_BYTES = 24_000;                 // a complete application is ~3 KB; this is generous
const MAX_STRING = 2_000;
const STEPS = new Set(["start", "email", "student", "parent", "program", "school", "why", "review"]);
const NEVER = new Set(["code", "aim_hp", "token", "website"]);

/** Keeps only flat, harmless values: strings (capped), booleans, finite numbers. */
export function cleanDraft(data: unknown): Record<string, string | number | boolean> | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(k) || NEVER.has(k)) continue;
    if (typeof v === "string") out[k] = v.length > MAX_STRING ? v.slice(0, MAX_STRING) : v;
    else if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed", "Use POST.");

  const body = await readJson(req);
  const tok = await verifyToken(body.token);
  const email = tok && typeof tok.e === "string" ? normalizeEmail(tok.e) : null;
  if (!email) return fail(req, 401, "token_invalid", "Please verify your email again.");

  const sb = admin();
  if (body.delete === true) {
    await sb.from("application_drafts").delete().eq("email", email);
    return json(req, 200, { ok: true, deleted: true });
  }

  const draft = body.draft && typeof body.draft === "object" ? body.draft as Record<string, unknown> : null;
  const data = draft ? cleanDraft(draft.data) : null;
  if (!draft || !data) return fail(req, 400, "invalid_draft", "Nothing to save.");
  if (JSON.stringify(data).length > MAX_BYTES) return fail(req, 413, "too_large", "This draft is too large to save.");

  const step = typeof draft.step === "string" && STEPS.has(draft.step) ? draft.step : null;
  const savedAtMs = Number(draft.savedAt);
  const savedAt = Number.isFinite(savedAtMs) && savedAtMs > 0 && savedAtMs < Date.now() + 86_400_000 ? new Date(savedAtMs) : new Date();

  const { data: lead } = await sb.from("leads").select("id").eq("email", email).maybeSingle();
  const { error } = await sb.from("application_drafts")
    .upsert({ email, lead_id: lead?.id || null, step, data, saved_at: savedAt.toISOString() }, { onConflict: "email" });
  if (error) {
    console.error("[save-draft] upsert failed:", error);
    return fail(req, 500, "db_error", "We couldn't save the draft right now.", { detail: error.message });
  }
  // No lead_events row here: autosave fires often, and the draft row itself carries updated_at.
  return json(req, 200, { ok: true, saved_at: savedAt.toISOString() });
});
