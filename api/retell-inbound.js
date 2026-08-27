/**
 * Retell inbound-call webhook — fires when a call arrives on the number.
 * Looks up the caller's cross-channel thread (WhatsApp + past calls) in the Blob
 * store and injects a compact summary as a dynamic variable the voice prompt uses.
 * Auth: ?key=<RETELL_FN_SECRET> on the URL.
 */
import { readRaw } from "../lib/retell.js";
import { getThread } from "../lib/store.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if ((req.query || {}).key !== process.env.RETELL_FN_SECRET) {
    return res.status(401).json({ ok: false });
  }
  const raw = await readRaw(req);
  let body = {};
  try { body = JSON.parse(raw); } catch {}
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
      console.error("inbound_ctx_failed", e && e.message);
    }
  }
  console.log("retell_inbound", JSON.stringify({ from, hasContext: !!context }));
  return res.status(200).json({
    call_inbound: {
      dynamic_variables: {
        caller_context: context || "New caller - no prior interactions on record.",
      },
    },
  });
}
