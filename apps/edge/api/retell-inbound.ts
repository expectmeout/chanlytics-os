/**
 * Retell inbound-call webhook — fires when a call arrives on the number.
 * Looks up the caller's cross-channel thread (WhatsApp + past calls) in the Blob
 * store and injects a compact summary as a dynamic variable the voice prompt uses.
 * Auth: ?key=<RETELL_FN_SECRET> on the URL.
 */
import { getThread } from "../lib/store.js";
import { json } from "../lib/http.js";

export async function POST(request: Request): Promise<Response> {
  if (new URL(request.url).searchParams.get("key") !== process.env.RETELL_FN_SECRET) {
    return json(401, { ok: false });
  }
  const raw = await request.text();
  let body: { call_inbound?: { from_number?: string } } = {};
  try { body = JSON.parse(raw); } catch { /* fall through with empty body */ }
  const inbound = body.call_inbound || {};
  const from = String(inbound.from_number || "").replace(/^\+/, "");

  let context = "";
  if (from) {
    try {
      const t = await getThread(from);
      const recent = (t.history || []).slice(-6);
      if (recent.length) {
        const lines = recent.map((h) =>
          `${h.role === "user" ? "Customer" : "Salon"}: ${String(h.content).slice(0, 160)}`);
        context =
          "Returning contact. Recent interactions with this phone number (WhatsApp/calls):\n" +
          lines.join("\n");
      }
    } catch (e) {
      console.error("inbound_ctx_failed", e instanceof Error ? e.message : e);
    }
  }
  console.log("retell_inbound", JSON.stringify({ from, hasContext: !!context }));
  return json(200, {
    call_inbound: {
      dynamic_variables: {
        caller_context: context || "New caller - no prior interactions on record.",
      },
    },
  });
}
