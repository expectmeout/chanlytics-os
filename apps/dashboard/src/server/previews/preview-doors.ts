import "server-only";

/**
 * What a lead's own receptionist's page asks of the server (decision 0079): a message answered, the page drawn, a fact
 * said not to be right. Each is asked by the link's token alone, on the service role, by someone with no session.
 *
 *   previewMessage    Try it's own answer (receptionist/try.ts, the edge's eval door), for the preview's workspace and
 *                     no person, after the turns the row keeps (never the browser's), and kept with it (preview_said):
 *                     nothing is sent, and twenty is all a preview answers
 *   previewOpenedBy   the page drawn in a browser, counted by its own script
 *   previewNotRightBy what the business said is not right, kept for the sender; the receptionist is never changed by it
 *   previewCall       a call in the browser to the preview's receptionist: the rehearsal's own (receptionist/rehearsal.ts,
 *                     the edge's call door), for the preview's workspace and no person, counted against its six minutes
 *
 * Their routes (app/api/v1/previews/[token]/…) are its own doors: the same-origin check, a bucket per network and the
 * envelope, in public-route.ts.
 */
import {
  AppError,
  LEAD_PREVIEW_WORDS as W,
  PREVIEW_LIMITS,
  previewStateOf,
  previewTurnsOf,
  type PreviewTurnVM,
} from "@chanlytics/contracts";
import {
  leadPreviewByToken,
  previewNotRight,
  previewOpened,
  previewSaid,
  type LeadPreviewRow,
  type PreviewRefusal,
} from "@chanlytics/db";
import { linkPageDb } from "../public/link-page";
import { startRehearsal, type RehearsalStartDto } from "../receptionist/rehearsal";
import { tryReceptionist } from "../receptionist/try";
import { log } from "../log";

/** The turns the eval door takes before a case: its own most. */
const HISTORY_MAX = 12;

/** The database the page's doors act through, or a refusal said as the page says a failure. */
function dbOrFail() {
  const db = linkPageDb();
  if (!db) throw new AppError("internal", W.failed, 503);
  return db;
}

/**
 * The preview a token names, open to try; or the refusal the page says for one that is not. A call is asked of one that
 * has said its twenty messages too: its minutes are its own (`calls`).
 */
async function openPreview(
  token: string,
  o: { calls: boolean },
): Promise<LeadPreviewRow & { preview_tenant_id: string }> {
  const row = await leadPreviewByToken(dbOrFail(), token);
  if (!row) throw new AppError("not_found", W.ended.title, 404);
  const state = previewStateOf(row, new Date());
  if (state === "spent" && !o.calls) throw new AppError("conflict", W.spent, 409);
  if (state === "spent" && o.calls && row.preview_tenant_id)
    return { ...row, preview_tenant_id: row.preview_tenant_id };
  if (state !== "ready" || !row.preview_tenant_id) throw new AppError("conflict", W.ended.title, 409);
  return { ...row, preview_tenant_id: row.preview_tenant_id };
}

/** A door's refusal as the page says it. */
function refused(reason: PreviewRefusal): AppError {
  if (reason === "limit") return new AppError("conflict", W.spent, 409);
  if (reason === "refused") return new AppError("validation", W.failed, 400);
  return new AppError("conflict", W.ended.title, 409);
}

/** What a message comes back as: the answer, what a live chat would do with it, and how many it will still answer. */
export interface PreviewAnswer {
  turn: PreviewTurnVM;
  left: number;
}

/** A message to the preview, answered by its receptionist as a live chat would, and kept with its answer. */
export async function previewMessage(token: string, raw: unknown): Promise<PreviewAnswer> {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) throw new AppError("validation", W.textLabel, 400);
  if (text.length > PREVIEW_LIMITS.messageChars) throw new AppError("validation", W.failed, 400);
  const p = await openPreview(token, { calls: false });
  const history = previewTurnsOf(p.turns)
    .slice(-HISTORY_MAX)
    .map((t) => ({ role: t.role, content: t.text }));
  let vm;
  try {
    vm = await tryReceptionist(p.preview_tenant_id, null, text, history);
  } catch (e) {
    // Try it's refusals are said to an owner in Settings; a business trying its preview is told it couldn't answer.
    log.warn("preview_message_failed", { tenant_id: p.preview_tenant_id, error: e });
    throw new AppError("upstream_anthropic", W.failed, 502);
  }
  const kept = await previewSaid(dbOrFail(), p.id, text, { text: vm.said, then: vm.then });
  if (!kept.ok) throw refused(kept.reason);
  return {
    turn: { role: "assistant", text: vm.said, then: vm.then },
    left: Math.max(0, PREVIEW_LIMITS.messages - kept.value),
  };
}

/** The page drawn in a browser: counted once per load, while it is open to try. */
export async function previewOpenedBy(token: string): Promise<{ opened: number | null }> {
  const db = dbOrFail();
  const row = await leadPreviewByToken(db, token);
  if (!row) throw new AppError("not_found", W.ended.title, 404);
  return { opened: await previewOpened(db, row.id) };
}

/** What the business said is not right: the fact it named, and what is right where it said so. */
export async function previewNotRightBy(token: string, fact: unknown, said: unknown): Promise<{ kept: number }> {
  const named = typeof fact === "string" ? fact.trim().slice(0, 80) : "";
  if (!named) throw new AppError("validation", W.notRight, 400);
  const right = typeof said === "string" && said.trim() ? said.trim().slice(0, 300) : null;
  const p = await openPreview(token, { calls: false });
  const kept = await previewNotRight(dbOrFail(), p.id, named, right);
  if (!kept.ok) throw refused(kept.reason);
  return { kept: kept.value };
}

/** What a call comes back as: the call the browser joins, how long it may run, and what is left after it. */
export interface PreviewCall {
  rehearsal_id: string;
  call: RehearsalStartDto["call"];
  max_ms: number;
  left_ms: number;
}

/** A call in the browser to the preview's receptionist, made at the provider, or why not in the page's words. */
export async function previewCall(token: string): Promise<PreviewCall> {
  const p = await openPreview(token, { calls: true });
  try {
    const started = await startRehearsal(p.preview_tenant_id, null);
    return {
      rehearsal_id: started.rehearsal_id,
      call: started.call,
      max_ms: started.max_ms,
      left_ms: started.allowance?.left_ms ?? 0,
    };
  } catch (e) {
    // The rehearsal's refusals are said to an owner in Settings; a business calling its preview hears the page's own.
    const allowance = (e as { details?: { allowance?: { why?: string | null } | null } }).details?.allowance;
    if (allowance?.why === "running") throw new AppError("conflict", W.callRunning, 409);
    if (allowance) throw new AppError("conflict", W.callUsed, 409);
    log.warn("preview_call_failed", { tenant_id: p.preview_tenant_id, error: e });
    throw new AppError("upstream_retell", W.callFailed, 502);
  }
}
