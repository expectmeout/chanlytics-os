/**
 * Pre-Gate-1b bridge: the live bot still READS pause state from Blob, so
 * dashboard verbs (take-over / hand-back / reply-implies-pause) mirror their
 * PG pause here or the bot keeps replying under a human's feet (the D10
 * incident). Internal endpoint — x-diag-key auth, retired at the read flip.
 * Body: { phone_digits, paused_until_ms }  (0 clears the pause)
 */
import { getThread, saveThread } from "../../lib/store.js";
import { json } from "../../lib/http.js";

export async function POST(request: Request): Promise<Response> {
  if (!process.env.DIAG_KEY || request.headers.get("x-diag-key") !== process.env.DIAG_KEY) {
    return json(403, { ok: false });
  }
  let body: { phone_digits?: string; paused_until_ms?: number } = {};
  try { body = JSON.parse(await request.text()); } catch { /* below */ }
  const phone = String(body.phone_digits || "").replace(/[^\d]/g, "");
  if (!/^\d{8,15}$/.test(phone) || typeof body.paused_until_ms !== "number") {
    return json(400, { ok: false, error: "phone_digits + paused_until_ms required" });
  }
  const t = await getThread(phone);
  t.pausedUntil = body.paused_until_ms;
  await saveThread(phone, t);
  console.log("admin_pause", JSON.stringify({ phone, until: body.paused_until_ms }));
  return json(200, { ok: true });
}
