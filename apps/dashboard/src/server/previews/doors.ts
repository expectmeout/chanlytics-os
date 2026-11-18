import "server-only";

/**
 * What a lead's own receptionist's page asks of the server (decision 0079): a message answered, the page drawn, a fact
 * said not to be right. Each is asked by the link's token alone, on the service role, by someone with no session.
 *
 *   previewMessage    Try it's own answer (receptionist/try.ts, the edge's eval door), for the preview's workspace and
 *                     no person, after the turns the row keeps (never the browser's), and kept with it (preview_said):
 *                     nothing is sent, twenty is all a preview answers, and one at a time (the preview_turn pace)
 *   recordPreviewOpenedBy   the page drawn in a browser, counted by its own script
 *   recordPreviewNotRightBy what the business said is not right, kept for the sender; the receptionist is never changed by it
 *   previewCall       a call in the browser to the preview's receptionist: the rehearsal's own (settings/rehearsal.ts,
 *                     the edge's call door), for the preview's workspace and no person, counted against its six minutes
 *   previewHeard      a call's words read back while it runs, and once it has ended what the business would get after a
 *                     real one: the rehearsal's own turns, and the write-up the edge reads from the provider
 *
 * Their routes (app/api/v1/previews/[token]/…) are its own doors: the same-origin check, a bucket per network and the
 * envelope, in public-route.ts.
 */
import {
  AppError,
  LEAD_PREVIEW_WORDS as W,
  PREVIEW_LIMITS,
  PREVIEW_TAUGHT,
  SECOND_MS,
  UUID,
  heldTenantId,
  previewFactOf,
  previewStateOf,
  previewTheirsOf,
  previewTurnsOf,
  withPreviewFix,
  withPreviewTaught,
  type PreviewAfterCallState,
  type PreviewGotVM,
  type PreviewHeardDto,
  type PreviewTurnVM,
  type TenantId,
  causedBy,
} from "@chanlytics/contracts";
import {
  findLeadPreviewByToken,
  recordPreviewNotRight,
  recordPreviewOpened,
  recordPreviewSaid,
  type LeadPreviewRow,
  type PreviewRefusal,
} from "@chanlytics/db/campaigns";
import { findRehearsalById } from "@chanlytics/db/facts";
import { logAndGoOn } from "@chanlytics/log";
import { linkPageDb } from "../public/link-page";
import { changePreviewRecord } from "./theirs";
import { callEdge, edgeConfigured } from "../shared/edge";
import { WRITE_UP_MS, previewGotOf, previewHeardOf } from "./heard";
import { takeRate } from "../shared/rate-limit";
import { startRehearsal, type RehearsalStartDto } from "../settings/rehearsal";
import { tryReceptionist } from "../receptionist/try";
import { log } from "../shared/log";

/** The turns the eval door takes before a case: its own most. */
const HISTORY_MAX = 12;

/** The database the page's doors act through, or a refusal said as the page says a failure. */
function dbOrFail() {
  const db = linkPageDb();
  if (!db) throw new AppError("unavailable", W.failed);
  return db;
}

/**
 * The preview a token names, open to try; or the refusal the page says for one that is not. A call is asked of one that
 * has said its twenty messages too: its minutes are its own (`calls`).
 */
async function openPreview(
  token: string,
  options: { calls: boolean },
): Promise<LeadPreviewRow & { preview_tenant_id: string }> {
  const row = await findLeadPreviewByToken(dbOrFail(), token);
  if (!row) throw new AppError("not_found", W.ended.title, 404);
  const state = previewStateOf(row, new Date());
  if (state === "spent" && !options.calls) throw new AppError("conflict", W.spent, 409);
  if (state === "spent" && options.calls && row.preview_tenant_id)
    return { ...row, preview_tenant_id: row.preview_tenant_id };
  if (state !== "ready" || !row.preview_tenant_id) throw new AppError("conflict", W.ended.title, 409);
  return { ...row, preview_tenant_id: row.preview_tenant_id };
}

/** A door's refusal as the page says it. */
function doorRefused(reason: PreviewRefusal): AppError {
  if (reason === "limit") return new AppError("conflict", W.spent, 409);
  if (reason === "refused") return new AppError("validation", W.failed, 400);
  return new AppError("conflict", W.ended.title, 409);
}

/** What a message comes back as: the answer, what a live chat would do with it, and how many it will still answer. */
interface PreviewAnswer {
  turn: PreviewTurnVM;
  left: number;
}

/** A message to the preview, answered by its receptionist as a live chat would, and kept with its answer. */
export async function previewMessage(token: string, raw: unknown): Promise<PreviewAnswer> {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) throw new AppError("validation", W.textLabel, 400);
  if (text.length > PREVIEW_LIMITS.messageChars) throw new AppError("validation", W.failed, 400);
  const result = await openPreview(token, { calls: false });
  // One answer at a time a preview, from wherever it is asked: the row counts the twenty only once each is kept.
  await takeRate(`preview:${result.id}`, "preview_turn", undefined, true);
  const history = previewTurnsOf(result.turns)
    .slice(-HISTORY_MAX)
    .map((t) => ({ role: t.role, content: t.text }));
  let vm;
  try {
    vm = await tryReceptionist(result.preview_tenant_id, null, text, history);
  } catch (e) {
    // Try it's refusals are said to an owner in Settings; a business trying its preview is told it couldn't answer.
    log.warn("preview_message_failed", { tenant_id: result.preview_tenant_id, error: e });
    throw causedBy(new AppError("upstream_anthropic", W.failed, 502), e);
  }
  const kept = await recordPreviewSaid(dbOrFail(), result.id, text, { text: vm.said, then: vm.then });
  if (!kept.ok) throw doorRefused(kept.reason);
  return {
    turn: { role: "assistant", text: vm.said, then: vm.then },
    left: Math.max(0, PREVIEW_LIMITS.messages - kept.value),
  };
}

/** The page drawn in a browser: counted once per load, while it is open to try. */
export async function recordPreviewOpenedBy(token: string): Promise<{ opened: number | null }> {
  const db = dbOrFail();
  const row = await findLeadPreviewByToken(db, token);
  if (!row) throw new AppError("not_found", W.ended.title, 404);
  return { opened: await recordPreviewOpened(db, row.id) };
}

/**
 * A thing the business tells its preview (the canvas's call P4): in its record at once, so the next answer and the next
 * call use it, and a line for the sender as what they said is not right is. Three at most; the rule is contracts'.
 */
export async function tellPreviewBy(token: string, raw: unknown): Promise<{ taught: number; left: number }> {
  const text = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!text || text.length > PREVIEW_TAUGHT.chars) throw new AppError("validation", W.teachLabel, 400);
  // Its door's bucket a network and its three at most are its limits: it asks no model, so it takes no turn of the chat's.
  const preview = await openPreview(token, { calls: true });
  const db = dbOrFail();
  let taught = 0;
  const outcome = await changePreviewRecord(db, heldTenantId(preview.preview_tenant_id), (profile) => {
    const next = withPreviewTaught(profile, text);
    if (next !== "full" && next !== null) taught = previewTheirsOf(next).taught.length;
    return next;
  });
  if (outcome === "full") throw new AppError("conflict", W.taughtFull, 409);
  if (outcome !== "changed") throw new AppError("unavailable", W.failed);
  // The sender's line. One that could not be kept (its ten lines are said) costs the sender the line, never the
  // business what it just told its preview.
  await recordPreviewNotRight(db, preview.id, PREVIEW_TAUGHT.fact, text).catch(
    logAndGoOn("keeping what a business told its preview for its sender", null),
  );
  return { taught, left: Math.max(0, PREVIEW_TAUGHT.most - taught) };
}

/**
 * What the business said is not right: the fact it named, and what is right where it said so. Kept for the sender, and
 * where it said what is right for a fact of the page, put right in the preview's record (the canvas's call P5). A record
 * that would not take it costs the fix, never the sender's line.
 */
export async function recordPreviewNotRightBy(
  token: string,
  fact: unknown,
  sentence: unknown,
): Promise<{ kept: number; fixed: boolean }> {
  const named = typeof fact === "string" ? fact.trim().slice(0, 80) : "";
  if (!named) throw new AppError("validation", W.notRight, 400);
  const right = typeof sentence === "string" && sentence.trim() ? sentence.trim().slice(0, 300) : null;
  const preview = await openPreview(token, { calls: false });
  const db = dbOrFail();
  const kept = await recordPreviewNotRight(db, preview.id, named, right);
  if (!kept.ok) throw doorRefused(kept.reason);
  const which = previewFactOf(named);
  const fixed =
    right && which
      ? await changePreviewRecord(db, heldTenantId(preview.preview_tenant_id), (profile) =>
          withPreviewFix(profile, which, right),
        ).catch(logAndGoOn("putting a preview's fact right", "unwritten" as const))
      : "nothing";
  return { kept: kept.value, fixed: fixed === "changed" };
}

/** What a call comes back as: the call the browser joins, how long it may run, and what is left after it. */
interface PreviewCall {
  rehearsal_id: string;
  call: RehearsalStartDto["call"];
  max_ms: number;
  left_ms: number;
}

/** A call in the browser to the preview's receptionist, made at the provider, or why not in the page's words. */
export async function previewCall(token: string): Promise<PreviewCall> {
  const result = await openPreview(token, { calls: true });
  try {
    const started = await startRehearsal(result.preview_tenant_id, null);
    return {
      rehearsal_id: started.rehearsal_id,
      call: started.call,
      max_ms: started.max_ms,
      left_ms: started.allowance?.left_ms ?? 0,
    };
  } catch (e) {
    // The rehearsal's refusals are said to an owner in Settings; a business calling its preview hears the page's own.
    const allowance = (e as { details?: { allowance?: { why?: string | null } | null } }).details?.allowance;
    if (allowance?.why === "running") throw causedBy(new AppError("conflict", W.callRunning, 409), e);
    if (allowance) throw causedBy(new AppError("conflict", W.callUsed, 409), e);
    log.warn("preview_call_failed", { tenant_id: result.preview_tenant_id, error: e });
    throw causedBy(new AppError("upstream_retell", W.callFailed, 502), e);
  }
}

/** The edge is asked for a write-up briefly: the page asks again in seconds. */
const AFTER_CALL_TIMEOUT_MS = 8 * SECOND_MS;

/**
 * A call's write-up as the edge reads it from the provider, as the card the page draws. None where there is no edge, or
 * one deployed before this door (a 404): the page then shows the call's words alone, and nothing is said to have failed.
 * An edge that could not be reached in time may yet answer, so that one is still being written.
 */
async function afterCallOf(
  tenantId: TenantId,
  rehearsalId: string,
): Promise<{ state: PreviewAfterCallState; got: PreviewGotVM | null }> {
  if (!edgeConfigured()) return { state: "none", got: null };
  const answer = await callEdge(
    "/api/admin/previews/after-call",
    { tenant_id: tenantId, rehearsal_id: rehearsalId },
    { workspace: tenantId, user: null, timeoutMs: AFTER_CALL_TIMEOUT_MS },
  );
  const body = answer.body;
  if (answer.status !== 200 || !body?.ok || !body.state)
    return { state: answer.status === 503 ? "writing" : "none", got: null };
  if (body.state !== "ready") return { state: body.state, got: null };
  const card = previewGotOf({
    outcome: body.outcome ?? null,
    wanted: body.wanted ?? null,
    summary: body.summary ?? null,
    follow_up: body.follow_up ?? null,
    caller_name: body.caller_name ?? null,
    caller_email: body.caller_email ?? null,
  });
  return card ? { state: "ready", got: card } : { state: "none", got: null };
}

/**
 * A preview call's words read back, and what the business would get after it (the redesign of 17 November 2026): the
 * rehearsal's own turns, kept by the call's webhook as it goes, and once it has ended the write-up of it. The rehearsal
 * is found in the preview's own workspace, so a link reads its own calls and no other's. The page asks every two
 * seconds while a call runs and a few times after it. A write-up is waited for two minutes past the end, and the
 * provider is asked for one only inside them: the page has stopped asking by then, and a call's name, kept by whoever
 * holds the link, is no way to ask the provider for ever.
 */
export async function previewHeard(token: string, raw: unknown): Promise<PreviewHeardDto> {
  const id = typeof raw === "string" && UUID.test(raw) ? raw : null;
  if (!id) throw new AppError("validation", W.failed, 400);
  const preview = await openPreview(token, { calls: true });
  const tenantId = heldTenantId(preview.preview_tenant_id);
  const row = await findRehearsalById(dbOrFail(), tenantId, id);
  if (!row || row.kind !== "call") throw new AppError("not_found", W.failed, 404);
  const lines = previewHeardOf(row.transcript);
  if (row.ended_at === null) return { lines, ended: false, got: null, writing: true };
  if (Date.now() - Date.parse(row.ended_at) >= WRITE_UP_MS) return { lines, ended: true, got: null, writing: false };
  const after = await afterCallOf(tenantId, id);
  return { lines, ended: true, got: after.got, writing: after.state === "writing" };
}
