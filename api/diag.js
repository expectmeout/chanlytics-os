/** Ops diagnostic — reports store backend + performs a live blob write/read probe.
 *  Protected: requires ?key=<WHATSAPP_VERIFY_TOKEN>. */
import { getThread, saveThread, storeBackend } from "../lib/store.js";

export default async function handler(req, res) {
  if ((req.query || {}).key !== process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(403).json({ ok: false });
  }
  const out = {
    store: storeBackend(),
    env: {
      blobToken: !!process.env.BLOB_READ_WRITE_TOKEN,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      waToken: !!process.env.WHATSAPP_ACCESS_TOKEN,
      resend: !!process.env.RESEND_API_KEY,
    },
  };
  try {
    const probeId = "diag-probe";
    const t = await getThread(probeId);
    t.history.push({ role: "user", content: "probe " + Date.now() });
    await saveThread(probeId, t);
    const back = await getThread(probeId);
    out.probe = {
      wrote: t.history.length,
      readBack: back.history.length,
      roundTrip: back.history.length === t.history.length,
    };
  } catch (e) {
    out.probe = { error: String(e && e.message).slice(0, 200) };
  }
  return res.status(200).json(out);
}
