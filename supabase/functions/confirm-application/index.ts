// AIM — the parent's one-click confirmation of an application.
// The link in the parent's email opens aimsummer.com/application-confirmed.html?ref=AIM-27-1001&t=<token>,
// and that page calls this function.
//
// POST /functions/v1/confirm-application   { ref, t }
// 200 { ok:true, reference, student_first_name, already_confirmed }
// 4xx { ok:false, error: not_found | token_invalid, message }

import { admin, corsHeaders, fail, hashToken, json, logEvent, readJson, str, timingSafeEqual } from "./common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed", "Use POST.");

  const body = await readJson(req);
  const ref = (str(body.ref, 40) || "").toUpperCase();
  const t = str(body.t, 200);
  if (!/^AIM-\d{2}-\d{3,8}$/.test(ref) || !t) return fail(req, 400, "token_invalid", "This confirmation link is incomplete. Please open the link from the email again.");

  const sb = admin();
  const { data: app } = await sb.from("applications")
    .select("id, reference, student_first_name, parent_first_name, parent_confirm_token_hash, parent_confirmed_at, lead_id, applicant_email")
    .eq("reference", ref).maybeSingle();
  if (!app) return fail(req, 404, "not_found", "We can't find this application. Please check the link in the email, or write to hello@aimsummer.com.");

  const expected = app.parent_confirm_token_hash as string | null;
  const given = await hashToken(t);
  if (!expected || !timingSafeEqual(expected, given)) {
    await logEvent(sb, app.lead_id as string | null, app.applicant_email as string, "parent_confirm_rejected", { reference: ref });
    return fail(req, 400, "token_invalid", "This confirmation link isn't valid. Please open the link from the email again, or write to hello@aimsummer.com.");
  }

  const already = Boolean(app.parent_confirmed_at);
  if (!already) {
    await sb.from("applications").update({ parent_confirmed_at: new Date().toISOString() }).eq("id", app.id);
    await logEvent(sb, app.lead_id as string | null, app.applicant_email as string, "parent_confirmed", { reference: ref });
  }
  return json(req, 200, { ok: true, reference: app.reference, student_first_name: app.student_first_name, parent_first_name: app.parent_first_name, already_confirmed: already });
});
