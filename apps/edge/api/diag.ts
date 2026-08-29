/** Ops diagnostic — store backend + live write/read probe + env presence
 *  + Meta access-token permanence check (debug_token expires_at).
 *  Auth: x-diag-key header (DIAG_KEY). Legacy ?key=<WHATSAPP_VERIFY_TOKEN>
 *  accepted during the transition. Internal endpoint — not part of the frozen surface. */
import { getThread, saveThread, storeBackend, threadNamespace } from "../lib/store.js";
import { json } from "../lib/http.js";

const META_APP_ID = process.env.META_APP_ID || "1823820738182125";

export async function GET(request: Request): Promise<Response> {
  const headerOk = !!process.env.DIAG_KEY && request.headers.get("x-diag-key") === process.env.DIAG_KEY;
  const legacyOk = new URL(request.url).searchParams.get("key") === process.env.WHATSAPP_VERIFY_TOKEN;
  if (!headerOk && !legacyOk) {
    return json(403, { ok: false });
  }

  const out: Record<string, unknown> = {
    store: storeBackend(),
    // Which store the bot's MEMORY comes from. The single most important
    // operational fact about this service after Gate 1b — and the flag to flip
    // back first if the receptionist starts behaving oddly.
    memory: process.env.PG_READS === "on" ? "postgres" : "blob",
    env: {
      pgReads: process.env.PG_READS === "on",
      pgWrites: process.env.PG_WRITES === "on",
      blobToken: !!process.env.BLOB_READ_WRITE_TOKEN,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      waToken: !!process.env.WHATSAPP_ACCESS_TOKEN,
      resend: !!process.env.RESEND_API_KEY,
      metaSecret: !!process.env.META_APP_SECRET,
      retellKey: !!process.env.RETELL_API_KEY,
      diagKey: !!process.env.DIAG_KEY,
      // Whether the receptionist can HOLD its own reply. Without this the
      // edge cannot schedule, and a workspace on 'veto' silently gets the
      // immediate replies it asked not to have — so this is the first thing
      // to check when a configured veto window does not appear.
      qstashToken: !!process.env.QSTASH_TOKEN,
    },
  };

  try {
    const probeId = "diag-probe";
    // The diagnostic probe writes to its own namespace so it can never touch
    // a real tenant's stored conversation.
    const probeNs = threadNamespace("diag-probe");
    const t = await getThread(probeNs, probeId);
    t.history.push({ role: "user", content: "probe " + Date.now() });
    await saveThread(probeNs, probeId, t);
    const back = await getThread(probeNs, probeId);
    out.probe = {
      wrote: t.history.length,
      readBack: back.history.length,
      roundTrip: back.history.length === t.history.length,
    };
  } catch (e) {
    out.probe = { error: String(e instanceof Error ? e.message : e).slice(0, 200) };
  }

  // Token permanence: a temp WHATSAPP_ACCESS_TOKEN expiring mid-App-Review would
  // take the pilot dark with no code change to blame. expires_at=0 = permanent.
  if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.META_APP_SECRET) {
    try {
      const q = new URLSearchParams({
        input_token: process.env.WHATSAPP_ACCESS_TOKEN,
        access_token: `${META_APP_ID}|${process.env.META_APP_SECRET}`,
      });
      const r = await fetch(`https://graph.facebook.com/v25.0/debug_token?${q}`);
      const d = ((await r.json()) as { data?: { is_valid?: boolean; expires_at?: number; type?: string } }).data || {};
      out.waTokenCheck = {
        valid: !!d.is_valid,
        expiresAt: d.expires_at,
        type: d.type,
        permanent: !!d.is_valid && d.expires_at === 0,
      };
    } catch (e) {
      out.waTokenCheck = { error: String(e instanceof Error ? e.message : e).slice(0, 120) };
    }
  } else {
    out.waTokenCheck = null;
  }

  return json(200, out);
}
