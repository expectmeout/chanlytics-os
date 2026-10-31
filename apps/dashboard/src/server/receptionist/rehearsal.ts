import "server-only";
import {
  AppError,
  applySettingsChange,
  fixField,
  fixLine,
  parseTenantConfig,
  promptBlocks,
  FIX_BLOCK_OF,
  FIX_WORDS,
  FixChangeSchema,
  MIN_MS,
  REHEARSE_WORDS,
  REVIEW_WORDS,
  TenantConfigWriteSchema,
  withStoredKeysKept,
  type AskSettingsChange,
  type FixChange,
  type ReviewDto,
} from "@chanlytics/contracts";
import { keepRehearsalFix, listPolicies, putTenantConfig, rehearsalById } from "@chanlytics/db";
import { callEdge, edgeConfigured, edgeReasonOf, type EdgeAnswer } from "../edge";
import { log } from "../log";
import { configRowOf } from "../workspace/config-row";
import { recordSettingsChanged } from "../workspace/settings-write";
import { judgeChangedHandoff } from "../workspace/settings-save";
import { knownFacts } from "../readers/settings";
import { composePromptPreview } from "./prompt-preview";
import type { RouteContext } from "../with-route";
import type { Member } from "../route";

/**
 * A rehearsal (decision 0069): Settings › How it answers' Rehearse, and Review this call on a real call. Every door is
 * the edge's, as the member who asked, for their workspace (apps/edge/lib/voice/rehearsal-call.ts,
 * apps/edge/lib/receptionist/review.ts): the provider's key and the model's live there and nowhere else. What is kept
 * here is the one write a member makes, a fix kept: the settings' own write, then the fix on its rehearsal, then what
 * the receptionist now reads where the fix landed.
 */

/** The route keeps a margin of its minute past the edge's answer. */
const ROUTE_MARGIN_MS = 5_000;
/** A call's start reaches the provider twice (the agent when there is none, then the call): under the route's minute. */
const START_TIMEOUT_MS = MIN_MS - ROUTE_MARGIN_MS;
/** A review is one model call over the conversation: under the route's minute. */
const REVIEW_TIMEOUT_MS = MIN_MS - ROUTE_MARGIN_MS;
/** A fix is routed by its words, or one small model call. */
const FIX_TIMEOUT_MS = 25_000;

/** What the browser joins a call with, and what the page says beside it. */
export interface RehearsalStartDto {
  rehearsal_id: string;
  call: {
    call_id: string;
    access_token: string;
    transport: string | null;
    ice_servers: unknown[];
    expires_at: number | null;
  };
  max_ms: number;
  allowance: {
    window: "before_plan" | "thirty_days" | "preview";
    of_ms: number;
    left_ms: number;
    can_call: boolean;
    why: string | null;
  };
  handoff: string | null;
}

/** An edge refusal the page says in its own words, else the words given. */
function edgeRefusal(a: EdgeAnswer, said: { failed: string; noPersona?: string }): AppError {
  const reason = edgeReasonOf(a);
  if (reason === "no_persona" || reason === "config_broken")
    return new AppError(
      "conflict",
      said.noPersona ?? "There is nothing for it to answer from yet: fill in Details first.",
      409,
    );
  if (reason === "payment_required") return new AppError("payment_required", said.failed, 402);
  if (reason === "rehearsal_empty") return new AppError("validation", REVIEW_WORDS.none);
  return new AppError("upstream_retell", said.failed, 502, { reason });
}

/**
 * POST receptionist/rehearsals: a call in the browser, made at the provider, and the token the browser joins it with.
 * `userId` is the member who asked, or null for a lead's own receptionist called from its preview page (decision 0079).
 */
export async function startRehearsal(tenantId: string, userId: string | null): Promise<RehearsalStartDto> {
  if (!edgeConfigured()) throw new AppError("conflict", REHEARSE_WORDS.talk.notLive, 409);
  const a = await callEdge(
    "/api/admin/rehearsal/call",
    { tenant_id: tenantId, ...(userId ? { user_id: userId } : {}) },
    { workspace: tenantId, user: userId, timeoutMs: START_TIMEOUT_MS },
  );
  const b = a.body as Partial<RehearsalStartDto> & { ok?: boolean; allowance?: RehearsalStartDto["allowance"] };
  if (a.status === 200 && b?.ok && b.call && typeof b.rehearsal_id === "string") {
    return {
      rehearsal_id: b.rehearsal_id,
      call: b.call,
      max_ms: typeof b.max_ms === "number" ? b.max_ms : 0,
      allowance: b.allowance as RehearsalStartDto["allowance"],
      handoff: typeof b.handoff === "string" ? b.handoff : null,
    };
  }
  const reason = edgeReasonOf(a);
  log.warn("rehearsal_start_failed", { tenant_id: tenantId, reason, status: a.status });
  if (reason === "rehearsal_minutes_used") {
    const window = b?.allowance?.window ?? "before_plan";
    throw new AppError(
      "conflict",
      b?.allowance?.why === "running" ? REHEARSE_WORDS.running : REHEARSE_WORDS.used(window),
      409,
      { allowance: b?.allowance ?? null },
    );
  }
  throw edgeRefusal(a, { failed: REHEARSE_WORDS.talk.failed });
}

/** The agent is one provider call, or none where it is kept already. */
const AGENT_TIMEOUT_MS = 25_000;

/**
 * POST receptionist/agent (decision 0073, R1): the workspace's receptionist made at the provider before any number, as
 * the first run's Your receptionist goes on to rehearse. Best effort for the page: a deployment with no voice provider,
 * or one that refuses, answers `made: false` and the owner goes on all the same (the call makes it, or says why).
 */
export async function makeAgent(tenantId: string, userId: string): Promise<{ made: boolean }> {
  if (!edgeConfigured()) return { made: false };
  const a = await callEdge(
    "/api/admin/rehearsal/agent",
    { tenant_id: tenantId, user_id: userId },
    { workspace: tenantId, user: userId, timeoutMs: AGENT_TIMEOUT_MS },
  );
  const b = a.body as { ok?: boolean } | null;
  if (a.status === 200 && b?.ok) return { made: true };
  log.warn("rehearsal_start_failed", { tenant_id: tenantId, reason: edgeReasonOf(a), status: a.status });
  return { made: false };
}

/** The conversation a review is of: a rehearsal (spoken, or typed and kept), a real call, or typed turns not yet kept. */
type ReviewOf =
  | { rehearsal_id: string }
  | { call_id: string }
  | { turns: readonly { role: "user" | "assistant"; content: string }[]; config_version: number | null };

/** POST receptionist/review: how it did, judged at the edge, kept on its rehearsal. */
export async function reviewRehearsal(
  tenantId: string,
  userId: string,
  of: ReviewOf,
): Promise<{ rehearsal_id: string; review: ReviewDto }> {
  if (!edgeConfigured()) throw new AppError("conflict", REHEARSE_WORDS.talk.notLive, 409);
  const a = await callEdge(
    "/api/admin/rehearsal/review",
    { tenant_id: tenantId, user_id: userId, ...of },
    { workspace: tenantId, user: userId, timeoutMs: REVIEW_TIMEOUT_MS },
  );
  const b = a.body as { ok?: boolean; rehearsal_id?: unknown; review?: unknown } | null;
  if (a.status === 200 && b?.ok && typeof b.rehearsal_id === "string" && b.review && typeof b.review === "object")
    return { rehearsal_id: b.rehearsal_id, review: b.review as ReviewDto };
  log.warn("rehearsal_review_failed", { tenant_id: tenantId, reason: edgeReasonOf(a), status: a.status });
  if (a.status === 404) throw new AppError("not_found", "Rehearsal not found.");
  throw edgeRefusal(a, { failed: REVIEW_WORDS.failed });
}

/** A correction, as the page sends it: the field the review named, the owner's words, and the exchange it is about. */
interface FixAsked {
  kind: string;
  words: string;
  customer: string;
  answer: string;
  rule: string | null;
}

/** POST receptionist/fix: where the correction goes, said before anything is written; null where it says nothing. */
export async function routeRehearsalFix(
  tenantId: string,
  userId: string,
  asked: FixAsked,
): Promise<{ change: FixChange; field: string; line: string } | { change: null; words: string }> {
  if (!edgeConfigured()) throw new AppError("conflict", REHEARSE_WORDS.talk.notLive, 409);
  const a = await callEdge(
    "/api/admin/rehearsal/fix",
    { tenant_id: tenantId, user_id: userId, ...asked, rule: asked.rule ?? undefined },
    { workspace: tenantId, user: userId, timeoutMs: FIX_TIMEOUT_MS },
  );
  const b = a.body as { ok?: boolean; change?: unknown } | null;
  if (a.status === 200 && b?.ok) {
    // The edge's change, read as Keep takes it (FixChangeSchema): one Keep would refuse says nothing to change.
    const change = b.change ? FixChangeSchema.safeParse(b.change) : null;
    if (!change?.success) return { change: null, words: FIX_WORDS.notRouted };
    return { change: change.data, field: fixField(change.data), line: fixLine(change.data) };
  }
  log.warn("rehearsal_fix_failed", { tenant_id: tenantId, reason: edgeReasonOf(a), status: a.status });
  throw edgeRefusal(a, { failed: "It could not work out where that goes just now. Try again in a moment." });
}

/** The block a change writes, before and after it, as the receptionist reads it: It now reads. */
interface NowReadsDto {
  label: string;
  before: string | null;
  after: string | null;
}

/** The one block of the composed instructions a change wrote, in two compositions: the settings before, and after. */
async function nowReads(
  ctx: RouteContext,
  tenantId: string,
  change: AskSettingsChange,
  configs: { before: unknown; after: unknown },
  channel: "whatsapp" | "voice",
): Promise<NowReadsDto | null> {
  const before = parseTenantConfig(configs.before)?.brain;
  const after = parseTenantConfig(configs.after)?.brain;
  if (!before || !after) return null;
  try {
    const [known, policies] = await Promise.all([knownFacts(ctx, tenantId), listPolicies(ctx.supabase, tenantId)]);
    const policy = Object.fromEntries(policies.map((p) => [p.class, { mode: p.mode }]));
    const facts = { tz: known.workspace?.timezone ?? null, policy, known, openings: null };
    const row = FIX_BLOCK_OF[change.op];
    const blockOf = (brain: NonNullable<typeof before>) => {
      const text = composePromptPreview(brain, facts)[channel];
      return promptBlocks(text, channel, { system_prompt: brain.system_prompt, profile: brain.profile }).find(
        (b) => b.row === row,
      );
    };
    const was = blockOf(before);
    const now = blockOf(after);
    return { label: now?.label ?? was?.label ?? fixField(change), before: was?.text ?? null, after: now?.text ?? null };
  } catch (e) {
    log.error("rehearsal_now_reads_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/**
 * POST receptionist/keep: one change kept from a rehearsal or a reviewed call (decision 0069, R4). The settings' own
 * write (the stored config with the change applied, through the write schema, with the version the row was read at, a
 * row that moved refused and never overwritten, the settings history and `settings.changed`), then the fix on its
 * rehearsal, then what the receptionist now reads where it landed. Nothing is sent to anyone.
 */
export async function keepRehearsalChange(
  ctx: RouteContext,
  member: Member,
  k: {
    rehearsal_id: string;
    change: AskSettingsChange;
    via: "rehearsal" | "call_review";
    channel: "whatsapp" | "voice";
  },
): Promise<{ version: number; field: string; line: string; now_reads: NowReadsDto | null; fixes: number }> {
  const r = await rehearsalById(ctx.supabase, member.tenantId, k.rehearsal_id);
  if (!r) throw new AppError("not_found", "Rehearsal not found.");
  const before = await configRowOf(ctx.supabase, member.tenantId);
  if (!before) throw new AppError("conflict", FIX_WORDS.moved, 409);
  const notes = parseTenantConfig(before.config ?? null)?.brain?.profile?.notes ?? [];
  if (k.change.op === "add_note" && notes.length >= 10) throw new AppError("validation", FIX_WORDS.notesFull);
  const changed = applySettingsChange((before.config ?? {}) as Record<string, unknown>, k.change);
  const parsed = TenantConfigWriteSchema.safeParse(changed);
  if (!parsed.success) {
    log.error("rehearsal_keep_failed", {
      tenant_id: member.tenantId,
      step: "schema",
      issues: parsed.error.issues.length,
    });
    throw new AppError("validation", "That change cannot be kept as it is: make it in Settings › How it answers.");
  }
  // A transfer number is judged as the settings PUT judges it: a fix cannot set one that rings the receptionist back.
  await judgeChangedHandoff(ctx, member.tenantId, parsed.data, before.config);
  // What the schema left out of the stored row is put back, as a save on the page does (settings-save.ts).
  const next = withStoredKeysKept(parsed.data, before.config);
  const result = await putTenantConfig(ctx.supabase, member.tenantId, next, before.version, ctx.userId);
  if (!result.ok) throw new AppError("conflict", FIX_WORDS.moved, 409);
  await recordSettingsChanged({ ...ctx, via: k.via }, member.tenantId, before.config, next, result.row.version);
  const field = fixField(k.change);
  const line = fixLine(k.change);
  // Its door's count once kept (two Keeps at once each count the other's); the count read with the rehearsal if not.
  let fixes = (Array.isArray(r.fixes) ? r.fixes.length : 0) + 1;
  try {
    // Through its door, as the member (00481): it asks that they may change the settings, and stamps the moment.
    fixes = await keepRehearsalFix(ctx.supabase, member.tenantId, r.id, {
      op: k.change.op,
      field,
      said: line,
      version: result.row.version,
    });
  } catch (e) {
    // The settings are kept; the count is what is short. Said in the log, never as a refusal of what was written.
    log.error("rehearsal_keep_failed", {
      tenant_id: member.tenantId,
      step: "fix",
      error: e instanceof Error ? e.message : String(e),
    });
  }
  const shown = await nowReads(ctx, member.tenantId, k.change, { before: before.config, after: next }, k.channel);
  return { version: result.row.version, field, line, now_reads: shown, fixes };
}
