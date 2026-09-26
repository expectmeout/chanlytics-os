/**
 * POST /api/admin/reach-out-preview — one business's email as a reach-out would write it, for the sheet (Reach out,
 * Part 4; F12, R11, R13). The dashboard proved who is asking and may spend; this door is who may knock, which
 * workspace, and what the body names. The preview itself is lib/reach-out/preview.ts: the check's own writer and
 * reader, and the sender's own assembly. Nothing is stored.
 *
 * Body { tenant_id, search_id, index, include_unconfirmed, words: { subject, body }, signed_by, language }; index is
 * 0 to 199 (a run's cap), and any other is a 400. A search that is not the workspace's reads as no business (the
 * audience is keyed by both).
 */
import { json } from "../../lib/http.js";
import { authorizeAdmin, workspaceFor } from "../../lib/admin-auth.js";
import { pg } from "../../lib/pg.js";
import { logger } from "../../lib/log.js";
import { REACH_OUT_BODY_MAX, REACH_OUT_SUBJECT_MAX, SIGNED_BY_MAX } from "../../lib/packages/contracts.js";
import { PREVIEW_INDEX_MAX, previewOne } from "../../lib/reach-out/preview.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LANGUAGE = /^[a-z]{2,3}(_[A-Z]{2})?$/;

interface Body {
  tenant_id?: unknown;
  search_id?: unknown;
  index?: unknown;
  include_unconfirmed?: unknown;
  words?: { subject?: unknown; body?: unknown } | null;
  signed_by?: unknown;
  language?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeAdmin(request, "/api/admin/reach-out-preview");
  if (!auth.ok) return auth.response;
  let body: Body = {};
  try {
    body = (JSON.parse(await request.text()) as Body) ?? {};
  } catch {
    /* validated below */
  }
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  const searchId = typeof body.search_id === "string" ? body.search_id : "";
  const subject = body.words?.subject;
  const words = body.words?.body;
  const signedBy = body.signed_by;
  const language = body.language === undefined || body.language === null ? "en" : body.language;
  if (
    !UUID.test(tenantId) ||
    !UUID.test(searchId) ||
    typeof body.index !== "number" ||
    !Number.isInteger(body.index) ||
    body.index < 0 ||
    body.index > PREVIEW_INDEX_MAX ||
    typeof body.include_unconfirmed !== "boolean" ||
    typeof words !== "string" ||
    !words.trim() ||
    words.length > REACH_OUT_BODY_MAX * 2 ||
    !(subject === null || (typeof subject === "string" && subject.length <= REACH_OUT_SUBJECT_MAX * 2)) ||
    !(
      signedBy === null ||
      signedBy === undefined ||
      (typeof signedBy === "string" && signedBy.length <= SIGNED_BY_MAX)
    ) ||
    typeof language !== "string" ||
    !LANGUAGE.test(language)
  )
    return json(400, { ok: false, error: "bad_request" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_db" });
  try {
    const preview = await previewOne(db, {
      tenantId,
      searchId,
      index: body.index,
      includeUnconfirmed: body.include_unconfirmed,
      words: { subject: typeof subject === "string" ? subject : null, body: words },
      signedBy: typeof signedBy === "string" ? signedBy : null,
      language,
    });
    return json(200, { ok: true, preview });
  } catch (e) {
    logger({ tenant_id: tenantId }).error("reach_out_preview_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return json(500, { ok: false, error: "preview_failed" });
  }
}
