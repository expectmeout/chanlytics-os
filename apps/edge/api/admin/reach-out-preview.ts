/**
 * POST /api/admin/reach-out-preview — one business's email as a reach-out would write it, for the sheet (Reach out,
 * Part 4; F12, R11, R13). The dashboard proved who is asking and may spend; this door is who may knock, which
 * workspace, and what the body names. The preview itself is lib/reach-out/preview.ts: the check's own writer and
 * reader, and the sender's own assembly. Nothing is stored.
 *
 * Body { tenant_id, user_id, search_id, index, include_unconfirmed, words: { subject, body }, signed_by, language };
 * index is 0 to 199 (a run's cap), and any other is a 400. A search that is not the workspace's reads as no business
 * (the audience is keyed by both).
 *
 * It spends the model, so it counts in Ask's daily budget as the lead drafts do (R12): a workspace past the day's
 * tokens is a 429 before anything is asked, and what a preview cost is recorded against the member who asked.
 */
import { json } from "../../lib/http.js";
import { readBody } from "../../lib/admin-door.js";
import { authorizeAdmin, workspaceFor } from "../../lib/admin-auth.js";
import { pg } from "../../lib/pg.js";
import { logger } from "../../lib/log.js";
import { askTokensLast24h, recordAskUsage } from "../../lib/ask-gateway.js";
import {
  ASK_TOKENS_DAY,
  REACH_OUT_BODY_MAX,
  REACH_OUT_MODEL,
  REACH_OUT_SUBJECT_MAX,
  SIGNED_BY_MAX,
} from "../../lib/packages/contracts.js";
import { PREVIEW_INDEX_MAX, previewOne, type PreviewInput } from "../../lib/reach-out/preview.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LANGUAGE = /^[a-z]{2,3}(_[A-Z]{2})?$/;

interface Body {
  tenant_id?: unknown;
  user_id?: unknown;
  search_id?: unknown;
  index?: unknown;
  include_unconfirmed?: unknown;
  words?: { subject?: unknown; body?: unknown } | null;
  signed_by?: unknown;
  language?: unknown;
}

const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const okIndex = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= PREVIEW_INDEX_MAX;
const okBody = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= REACH_OUT_BODY_MAX * 2;
const okSubject = (v: unknown): v is string | null =>
  v === null || (typeof v === "string" && v.length <= REACH_OUT_SUBJECT_MAX * 2);
const okSignedBy = (v: unknown): v is string | null | undefined =>
  v === null || v === undefined || (typeof v === "string" && v.length <= SIGNED_BY_MAX);

/** The body as the preview reads it, or null when it is not one: every field checked here, once. */
function previewInputOf(body: Body, tenantId: string): (PreviewInput & { userId: string }) | null {
  const w = body.words;
  const language = body.language ?? "en";
  if (
    !isUuid(tenantId) ||
    !isUuid(body.user_id) ||
    !isUuid(body.search_id) ||
    !okIndex(body.index) ||
    typeof body.include_unconfirmed !== "boolean" ||
    !okBody(w?.body) ||
    !okSubject(w?.subject) ||
    !okSignedBy(body.signed_by) ||
    typeof language !== "string" ||
    !LANGUAGE.test(language)
  )
    return null;
  return {
    userId: body.user_id,
    tenantId,
    searchId: body.search_id,
    index: body.index,
    includeUnconfirmed: body.include_unconfirmed,
    words: { subject: w.subject, body: w.body },
    signedBy: body.signed_by ?? null,
    language,
  };
}

/** What a preview cost, counted in Ask's daily budget against the member who asked (R12). */
async function recordPreviewSpend(
  db: NonNullable<ReturnType<typeof pg>>,
  i: { tenantId: string; userId: string },
  tokens: { input: number; output: number },
  t0: number,
): Promise<void> {
  if (tokens.input + tokens.output <= 0) return;
  await recordAskUsage(db, i.tenantId, i.userId, {
    input_tokens: tokens.input,
    output_tokens: tokens.output,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    model: REACH_OUT_MODEL,
    latency_ms: Date.now() - t0,
    stop_reason: null,
    stream: false,
    purpose: "reach_out_preview",
  });
}

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeAdmin(request, "/api/admin/reach-out-preview");
  if (!auth.ok) return auth.response;
  const body = await readBody<Body>(request);
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  const input = previewInputOf(body, tenantId);
  if (!input) return json(400, { ok: false, error: "bad_request" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  const used = await askTokensLast24h(db, tenantId);
  // A day that could not be counted holds the preview: a failed count is not a day with nothing spent.
  if (used === null) return json(503, { ok: false, error: "read_failed", detail: "Ask's day could not be counted." });
  if (used >= ASK_TOKENS_DAY) {
    logger({ tenant_id: tenantId }).warn("ask_budget_spent", { used, cap: ASK_TOKENS_DAY });
    return json(429, { ok: false, error: "ask_budget", used, cap: ASK_TOKENS_DAY });
  }
  try {
    const t0 = Date.now();
    const { userId, ...ask } = input;
    const { tokens, ...preview } = await previewOne(db, ask);
    await recordPreviewSpend(db, { tenantId, userId }, tokens, t0);
    return json(200, { ok: true, preview });
  } catch (e) {
    logger({ tenant_id: tenantId }).error("reach_out_preview_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return json(500, { ok: false, error: "preview_failed" });
  }
}
