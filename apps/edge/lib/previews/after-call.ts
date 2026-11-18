/**
 * What a call to a lead's preview left (decision 0079; the redesign of 17 November 2026): the write-up a real call's
 * card is made of, read back to the preview's page so the business sees what it would get after one.
 *
 * The door is api/admin/previews/after-call.ts: it checks who may knock (authorizeAdmin, a token the dashboard minted
 * for the preview's workspace and no person) and reads the body; everything after is here. In order: the provider's
 * key, the workspace, the rehearsal by its id (the workspace's own, so no id reaches another's call), then the call at
 * the provider (channels getCall), whose analysis is the write-up.
 *
 * The answer says where the write-up stands, and nothing is kept: a rehearsal's webhook keeps its words and its end
 * (voice/rehearsal-call.ts settleRehearsalEvent) and takes its analysis for an end only, since a preview's call is
 * nobody's customer and no card of it is anyone's work.
 *   writing   the call has not ended, the provider has not written it up yet, or it could not be asked just now
 *   ready     its analysis, in the fields a real call's card reads (channels CALL_ANALYSIS_FIELDS)
 *   none      nothing to come: a rehearsal that was typed, a call the provider has no record of, a key it refuses
 */
import { json, refuse } from "../shared/http.js";
import { pg } from "../shared/pg.js";
import { workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { env } from "../shared/env.js";
import { logger, errField } from "../shared/log.js";
import { getCall, normalizeCall } from "@chanlytics/channels/voice";
import { findRehearsalById } from "@chanlytics/db/facts";
import {
  UUID,
  isTenantId,
  type DoorRead,
  type PREVIEW_AFTER_CALL_DOOR,
  type PreviewAfterCallState,
  type PreviewCallAnalysis,
} from "@chanlytics/contracts";

/** The provider is asked once, briefly: the page asks again in seconds. */
const READ_TIMEOUT_MS = 6_000;

/** A field of the analysis as words, or null where it said none. */
const said = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

const NOTHING: PreviewCallAnalysis = {
  outcome: null,
  wanted: null,
  summary: null,
  follow_up: null,
  caller_name: null,
  caller_email: null,
};

/** The door's answer: where the write-up stands, and its fields where it is ready. */
const answer = (state: PreviewAfterCallState, analysis: PreviewCallAnalysis = NOTHING): Response =>
  json(200, { ok: true, state, ...analysis });

export async function previewAfterCall(
  auth: Admitted,
  body: DoorRead<typeof PREVIEW_AFTER_CALL_DOOR>,
): Promise<Response> {
  const log = logger();
  const apiKey = env.RETELL_API_KEY;
  if (!apiKey) return refuse(503, "no_provider_key");
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  if (!isTenantId(tenantId)) return refuse(400, "bad_tenant", "tenant_id (a workspace id) is required");
  const rehearsalId = typeof body.rehearsal_id === "string" ? body.rehearsal_id.trim() : "";
  if (!UUID.test(rehearsalId)) return refuse(400, "bad_request", "rehearsal_id (a rehearsal's id) is required");
  const db = pg();
  if (!db) return refuse(503, "no_database");

  let rehearsal;
  try {
    rehearsal = await findRehearsalById(db, tenantId, rehearsalId);
  } catch (e) {
    log.error("preview_after_call_failed", { tenant_id: tenantId, step: "rehearsal", error: errField(e) });
    return refuse(503, "read_failed");
  }
  if (!rehearsal) return refuse(404, "not_found", "no such rehearsal in this workspace");
  if (rehearsal.kind !== "call" || !rehearsal.retell_call_id) return answer("none");
  if (rehearsal.ended_at === null) return answer("writing");

  const read = await getCall({ apiKey }, rehearsal.retell_call_id, { timeoutMs: READ_TIMEOUT_MS });
  if (read.kind === "unavailable") return answer("writing");
  if (read.kind !== "found") {
    // A key the provider refuses is ours to mend, and a call it has no record of was never written up.
    if (read.kind === "auth")
      log.error("preview_after_call_failed", { tenant_id: tenantId, step: "provider", status: read.status });
    return answer("none");
  }
  // The analysis arrives a few seconds after the end (the provider's call_analyzed): until then the call has none.
  if (!read.call.call_analysis) return answer("writing");
  const call = normalizeCall(read.call);
  return answer("ready", {
    outcome: said(call.analysis?.outcome),
    wanted: said(call.analysis?.caller_wanted),
    summary: said(call.summary),
    follow_up: said(call.analysis?.follow_up),
    caller_name: said(call.analysis?.caller_name),
    caller_email: said(call.analysis?.caller_email),
  });
}
