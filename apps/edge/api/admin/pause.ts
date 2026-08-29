/**
 * Pre-Gate-1b bridge: the live bot still READS pause state from Blob, so
 * dashboard verbs (take-over / hand-back / reply-implies-pause) mirror their
 * PG pause here or the bot keeps replying under a human's feet (the D10
 * incident). Internal endpoint — x-diag-key auth, retired at the read flip.
 * Body: { phone_digits, paused_until_ms }  (0 clears the pause)
 */
import { getThread, saveThread, threadNamespace } from "../../lib/store.js";
import { json } from "../../lib/http.js";

export async function POST(request: Request): Promise<Response> {
  if (!process.env.DIAG_KEY || request.headers.get("x-diag-key") !== process.env.DIAG_KEY) {
    return json(403, { ok: false });
  }
  let body: { phone_digits?: string; paused_until_ms?: number; tenant_id?: string } = {};
  try { body = JSON.parse(await request.text()); } catch { /* below */ }
  const phone = String(body.phone_digits || "").replace(/[^\d]/g, "");
  if (!/^\d{8,15}$/.test(phone) || typeof body.paused_until_ms !== "number") {
    return json(400, { ok: false, error: "phone_digits + paused_until_ms required" });
  }
  // The dashboard sends the tenant whose conversation this is. Without it we
  // would pause a phone number across every business that has that customer.
  const ns = threadNamespace(body.tenant_id ?? null);
  const t = await getThread(ns, phone);
  t.pausedUntil = body.paused_until_ms;
  // authoritative: this endpoint is the one writer allowed to LOWER the pause
  const saved = await saveThread(ns, phone, t, { authoritativePause: true });
  if (!saved) {
    // The dashboard tells the operator "the receptionist is paused" on the
    // strength of this call, and its own mirror is written to fail LOUD. A 200
    // here would make it report a pause that does not exist, and the bot would
    // keep replying under a human's feet — the exact incident this endpoint
    // was built for.
    console.error("admin_pause_not_persisted", JSON.stringify({ phone, until: body.paused_until_ms }));
    return json(503, { ok: false, error: "pause_not_persisted" });
  }
  console.log("admin_pause", JSON.stringify({ phone, tenant: body.tenant_id ?? null, until: body.paused_until_ms }));
  return json(200, { ok: true });
}
