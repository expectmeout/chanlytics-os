/**
 * How it did, and where a fix goes (decision 0069, R3 and R4), for one workspace, on the edge because the model key
 * lives here and nowhere else.
 *
 * The doors are api/admin/rehearsal/review.ts and api/admin/rehearsal/fix.ts: each checks who may knock (authorizeAdmin,
 * a token the dashboard minted for the member and the workspace) and reads the body; everything after is here.
 *
 * The review (`reviewConversation`) judges a conversation against the instructions it had:
 *   - a spoken rehearsal: its row's words and the instructions it heard; one not yet ended at the provider's word is read
 *     back from the provider first (its end may still be on its way to the webhook);
 *   - a typed one: the turns the page tried, kept as a rehearsal when reviewed, against the instructions composed now
 *     (the version they ran on is the page's word; a version that moved since is judged against now, and says so);
 *   - a real call: its words, and the settings at the version it was composed from (tenant_config_versions), or as they
 *     stand where that is not known, said so.
 * One model call (purpose receptionist_review); the answer checked in code (contracts checkReview); the review kept on
 * its rehearsal, so a second look is free.
 *
 * The fix (`routeCorrection`) routes the owner's correction to one settings change: by its words where they decide it
 * (contracts routeFix), else by the smallest model, its answer checked in code (checkFixRoute). Nothing is written: the
 * change is the dashboard's to keep, through the settings write.
 */
import { json, refuse } from "../shared/http.js";
import { pg } from "../shared/pg.js";
import { workspaceFor, personFor, type Admitted } from "../shared/admin-auth.js";
import { loadTenantRuntime, type TenantRuntime } from "../shared/tenant-runtime.js";
import { askJson, ModelUnavailable, promptHashOf } from "../ai/model.js";
import { env } from "../shared/env.js";
import { logger, errField } from "../shared/log.js";
import { getCall, type RetellCall } from "@chanlytics/channels/voice";
import { callForReview } from "@chanlytics/db/voice";
import {
  callReviewOf,
  findConfigAtVersion,
  endRehearsal,
  keepCallReview,
  keepRehearsalReview,
  keepTypedRehearsal,
  findRehearsalById,
  type RehearsalRow,
} from "@chanlytics/db/facts";
import {
  checkFixRoute,
  checkReview,
  defang,
  exchangesOf,
  fixField,
  fixLine,
  fixRouteSystemPrompt,
  fixRouteUserContent,
  localDate,
  modelRoute,
  parseTenantConfig,
  promptBlocks,
  resolveSystemPrompt,
  reviewSystemPrompt,
  reviewUserContent,
  routeFix,
  turnsOfTranscript,
  FIX_KINDS,
  FIX_ROUTE_SCHEMA,
  REVIEW_SCHEMA,
  UUID,
  type FixAsk,
  type FixKind,
  type ReviewDto,
  type RehearsalTurn,
  ANSWER_JSON_ONLY,
} from "@chanlytics/contracts";
import { rehearsalRouting } from "../voice/rehearsal-call.js";

type Db = NonNullable<ReturnType<typeof pg>>;

/** The most turns a typed rehearsal brings: the typed Try it's own bound, twelve (six exchanges), and a margin. */
const TYPED_TURNS_MAX = 16;
/** The longest a turn the page sends may be. */
const TURN_MAX_CHARS = 2000;

/** The turns a page sent, read as turns: a wrong shape is none. */
function typedTurnsOf(raw: unknown): RehearsalTurn[] | null {
  if (!Array.isArray(raw) || raw.length > TYPED_TURNS_MAX) return null;
  const out: RehearsalTurn[] = [];
  for (const t of raw) {
    const role = (t as { role?: unknown })?.role;
    const content = (t as { content?: unknown })?.content;
    if (typeof content !== "string" || !content.trim() || content.length > TURN_MAX_CHARS) return null;
    if (role === "user") out.push({ role: "user", content: content.trim() });
    else if (role === "assistant" || role === "agent") out.push({ role: "agent", content: content.trim() });
    else return null;
  }
  return out;
}

/** Where in the instructions a quote of them is, read as the model was shown them: the block's own name (prompt-blocks.ts), or null. */
export function blockFinder(instructions: string, channel: "whatsapp" | "voice", brain: TenantRuntime["brain"]) {
  let blocks: ReturnType<typeof promptBlocks> = [];
  try {
    blocks = promptBlocks(
      instructions,
      channel,
      brain ? { system_prompt: brain.system_prompt, profile: brain.profile } : null,
    );
  } catch {
    blocks = [];
  }
  const w = (s: string) => defang(s).toLowerCase().replace(/\s+/g, " ").trim();
  return (quote: string) => blocks.find((b) => w(b.text).includes(w(quote)))?.label ?? null;
}

/** The judgement: one model call over the exchanges, its answer checked. Null when the workspace may not pay for it. */
async function judge(options: {
  tenantId: string;
  userId: string | null;
  subjectId: string;
  turns: readonly RehearsalTurn[];
  instructions: string;
  channel: "whatsapp" | "voice";
  brain: TenantRuntime["brain"];
  version: number | null;
  judgedAgainst: "then" | "now";
}): Promise<ReviewDto | null | "empty"> {
  const exchanges = exchangesOf(options.turns);
  if (!exchanges.length) return "empty";
  const system = reviewSystemPrompt();
  const answered = await askJson({
    purpose: "receptionist_review",
    system,
    user: reviewUserContent(options.instructions, exchanges),
    schema: REVIEW_SCHEMA,
    maxTokens: modelRoute("receptionist_review").maxTokens,
    plainJsonHint: ANSWER_JSON_ONLY,
    for: {
      tenantId: options.tenantId,
      subjectId: options.subjectId,
      userId: options.userId,
      promptHash: promptHashOf(system),
    },
  });
  if (!answered) return null;
  const checked = checkReview(
    answered.answer,
    exchanges,
    options.instructions,
    blockFinder(options.instructions, options.channel, options.brain),
  );
  return {
    items: checked.items,
    dropped: checked.dropped,
    version: options.version,
    judged_against: options.judgedAgainst,
  };
}

/** A spoken rehearsal whose end has not reached the webhook: the provider's word for it, written as the webhook would. */
async function endedFromProvider(db: Db, rehearsal: RehearsalRow): Promise<RehearsalRow> {
  if (rehearsal.ended_at || !rehearsal.retell_call_id || !env.RETELL_API_KEY) return rehearsal;
  const read = await getCall({ apiKey: env.RETELL_API_KEY }, rehearsal.retell_call_id).catch(() => null);
  if (read?.kind !== "found") return rehearsal;
  const retellCall: RetellCall = read.call;
  if (retellCall.call_status !== "ended" && retellCall.call_status !== "error") return rehearsal;
  const turns = turnsOfTranscript(retellCall.transcript_with_tool_calls ?? retellCall.transcript_object ?? []);
  await endRehearsal(db, rehearsal.tenant_id, rehearsal.retell_call_id, {
    turns,
    startedAt:
      typeof retellCall.start_timestamp === "number" ? new Date(retellCall.start_timestamp).toISOString() : null,
    endedAt:
      typeof retellCall.end_timestamp === "number"
        ? new Date(retellCall.end_timestamp).toISOString()
        : new Date().toISOString(),
    seconds: Math.max(0, retellCall.duration_ms ?? 0) / 1000,
    reason: retellCall.disconnection_reason ?? null,
  });
  return (await findRehearsalById(db, rehearsal.tenant_id, rehearsal.id)) ?? rehearsal;
}

/** The instructions a real call is judged against: the settings at its version where they are kept, else as they stand. */
async function callInstructions(db: Db, rt: TenantRuntime, version: number | null, at: Date) {
  const kept = version !== null ? await findConfigAtVersion(db, rt.tenantId, version) : null;
  const then = kept ? (parseTenantConfig(kept)?.brain ?? null) : null;
  const brain = then ?? rt.brain;
  if (!brain) return null;
  return {
    brain,
    judgedAgainst: then ? ("then" as const) : ("now" as const),
    instructions: resolveSystemPrompt(brain, "voice", rt.timezone, at, rt.policy, rt.known),
  };
}

/** The answer a review door gives: the rehearsal it is kept on and the review. */
const reviewed = (id: string, review: unknown) => json(200, { ok: true, rehearsal_id: id, review });

export async function reviewConversation(
  auth: Admitted,
  body: Partial<{
    tenant_id: string;
    user_id: string;
    rehearsal_id: string;
    call_id: string;
    turns: unknown;
    config_version: number | null;
  }>,
): Promise<Response> {
  const log = logger();
  if (!env.ANTHROPIC_API_KEY) return refuse(503, "no_model_key");
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  if (!UUID.test(tenantId)) return refuse(400, "bad_tenant", "tenant_id (a workspace id) is required");
  const userId = personFor(auth, body.user_id);
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const rt = await loadTenantRuntime(db, rehearsalRouting(tenantId));
  if (rt.loadFailed) return refuse(503, "read_failed", "the workspace could not be read");
  if (!rt.brain) return refuse(409, rt.configBroken ? "config_broken" : "no_persona");

  try {
    const reviewWorld: ReviewWorld = { db, tenantId, userId, rt, brain: rt.brain };
    const judged =
      typeof body.rehearsal_id === "string" && UUID.test(body.rehearsal_id)
        ? await judgeRehearsal(reviewWorld, body.rehearsal_id)
        : typeof body.call_id === "string" && UUID.test(body.call_id)
          ? await judgeCall(reviewWorld, body.call_id)
          : await judgeTyped(reviewWorld, body.turns, body.config_version);
    if (judged instanceof Response) return judged;
    const { id, review } = judged;
    if (review === "empty")
      return refuse(422, "rehearsal_empty", "nothing to judge: a question and an answer are needed");
    if (!review) return refuse(402, "payment_required", "the workspace may not use the model now");
    await keepRehearsalReview(db, tenantId, id, review);
    log.info("rehearsal_reviewed", {
      tenant_id: tenantId,
      rehearsal_id: id,
      items: review.items.length,
      dropped: review.dropped,
      against: review.judged_against,
    });
    return reviewed(id, review);
  } catch (e) {
    log.error("rehearsal_review_failed", { tenant_id: tenantId, error: errField(e) });
    if (e instanceof ModelUnavailable) return refuse(503, "model_unavailable");
    return refuse(503, "review_write_failed");
  }
}

/** What a review is asked inside: the database, the workspace, who asked, its runtime, and the brain it read. */
interface ReviewWorld {
  db: Db;
  tenantId: string;
  userId: string | null;
  rt: TenantRuntime;
  brain: NonNullable<TenantRuntime["brain"]>;
}

/** A conversation judged: its rehearsal and the review (null: the workspace may not pay; "empty": nothing to judge). */
type Judged = { id: string; review: ReviewDto | null | "empty" } | Response;

/** A spoken rehearsal, or a typed one already kept: its own words and what it heard. */
async function judgeRehearsal(reviewWorld: ReviewWorld, rehearsalId: string): Promise<Judged> {
  const found = await findRehearsalById(reviewWorld.db, reviewWorld.tenantId, rehearsalId);
  if (!found) return refuse(404, "not_found");
  if (found.review) return reviewed(found.id, found.review);
  const item = found.kind === "call" ? await endedFromProvider(reviewWorld.db, found) : found;
  const review = await judge({
    tenantId: reviewWorld.tenantId,
    userId: reviewWorld.userId,
    subjectId: item.id,
    turns: item.transcript,
    instructions: item.instructions ?? "",
    channel: item.kind === "typed" ? "whatsapp" : "voice",
    brain: reviewWorld.brain,
    version: item.config_version,
    judgedAgainst: "then",
  });
  return { id: item.id, review };
}

/** A real call: kept as reviewed once, then its review read back. */
async function judgeCall(reviewWorld: ReviewWorld, callId: string): Promise<Judged> {
  const before = await callReviewOf(reviewWorld.db, reviewWorld.tenantId, callId);
  if (before?.review) return reviewed(before.id, before.review);
  const call = await callForReview(reviewWorld.db, reviewWorld.tenantId, callId);
  if (!call) return refuse(404, "not_found");
  const turns = turnsOfTranscript(call.transcript_object ?? []);
  const notice = await callInstructions(reviewWorld.db, reviewWorld.rt, call.config_version, new Date(call.created_at));
  if (!notice) return refuse(409, "no_persona");
  const id =
    before?.id ??
    (await keepCallReview(reviewWorld.db, {
      tenantId: reviewWorld.tenantId,
      callId: call.id,
      agentId: call.agent_id,
      configVersion: call.config_version,
      instructions: notice.instructions,
      turns,
      createdBy: reviewWorld.userId,
    }));
  const review = await judge({
    tenantId: reviewWorld.tenantId,
    userId: reviewWorld.userId,
    subjectId: id,
    turns,
    instructions: notice.instructions,
    channel: "voice",
    brain: notice.brain,
    version: call.config_version,
    judgedAgainst: notice.judgedAgainst,
  });
  return { id, review };
}

/** A typed rehearsal: the turns tried, against the instructions composed now for a chat. */
async function judgeTyped(reviewWorld: ReviewWorld, rawTurns: unknown, configVersion: unknown): Promise<Judged> {
  const turns = typedTurnsOf(rawTurns);
  if (!turns) return refuse(400, "bad_request", "turns: up to sixteen of { role, content }");
  const { rt } = reviewWorld;
  const instructions = resolveSystemPrompt(reviewWorld.brain, "whatsapp", rt.timezone, new Date(), rt.policy, rt.known);
  const request = typeof configVersion === "number" ? configVersion : null;
  const version = rt.configVersion ?? null;
  const id = await keepTypedRehearsal(reviewWorld.db, {
    tenantId: reviewWorld.tenantId,
    turns,
    configVersion: request ?? version,
    instructions,
    createdBy: reviewWorld.userId,
  });
  const review = await judge({
    tenantId: reviewWorld.tenantId,
    userId: reviewWorld.userId,
    subjectId: id,
    turns,
    instructions,
    channel: "whatsapp",
    brain: reviewWorld.brain,
    version: request ?? version,
    judgedAgainst: request === null || request === version ? "then" : "now",
  });
  return { id, review };
}

const isFixKind = (v: unknown): v is FixKind => (FIX_KINDS as readonly unknown[]).includes(v);

/** The settings a correction is routed against: today, the services, the hours, the languages. */
function fixAskOf(rt: TenantRuntime, kind: FixKind, words: string, rule: string | null): FixAsk {
  const profile = rt.brain?.profile;
  return {
    kind,
    words,
    today: localDate(rt.timezone ?? "UTC", new Date()),
    services: (profile?.services ?? []).map((s) => ({ name: s.name })),
    hours: profile?.hours ?? {},
    languages: profile?.languages ?? [],
    rule,
  };
}

export async function routeCorrection(
  auth: Admitted,
  body: Partial<{
    tenant_id: string;
    user_id: string;
    kind: string;
    words: string;
    customer: string;
    answer: string;
    rule: string;
  }>,
): Promise<Response> {
  const log = logger();
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  if (!UUID.test(tenantId)) return refuse(400, "bad_tenant", "tenant_id (a workspace id) is required");
  if (!isFixKind(body.kind)) return refuse(400, "bad_request", "kind: one of the review's fix kinds");
  const words = typeof body.words === "string" ? body.words.trim().slice(0, TURN_MAX_CHARS) : "";
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const rt = await loadTenantRuntime(db, rehearsalRouting(tenantId));
  if (rt.loadFailed) return refuse(503, "read_failed", "the workspace could not be read");
  if (!rt.brain) return refuse(409, rt.configBroken ? "config_broken" : "no_persona");
  const ask = fixAskOf(rt, body.kind, words, typeof body.rule === "string" ? body.rule : null);

  let routed = routeFix(ask);
  let by: "words" | "model" = "words";
  if (!routed.ok && routed.why === "needs_model") {
    if (!env.ANTHROPIC_API_KEY) return refuse(503, "no_model_key");
    by = "model";
    try {
      const system = fixRouteSystemPrompt();
      const answered = await askJson({
        purpose: "fix_route",
        system,
        user: fixRouteUserContent(ask, {
          customer: typeof body.customer === "string" ? body.customer : "",
          answer: typeof body.answer === "string" ? body.answer : "",
          tone: rt.brain.profile?.tone ?? null,
        }),
        schema: FIX_ROUTE_SCHEMA,
        maxTokens: modelRoute("fix_route").maxTokens,
        plainJsonHint: ANSWER_JSON_ONLY,
        for: { tenantId, userId: personFor(auth, body.user_id), promptHash: promptHashOf(system) },
      });
      if (!answered) return refuse(402, "payment_required", "the workspace may not use the model now");
      routed = checkFixRoute(answered.answer, ask);
    } catch (e) {
      log.error("rehearsal_fix_failed", { tenant_id: tenantId, error: errField(e) });
      return refuse(503, e instanceof ModelUnavailable ? "model_unavailable" : "model_failed");
    }
  }
  log.info("rehearsal_fix_routed", {
    tenant_id: tenantId,
    kind: ask.kind,
    by,
    op: routed.ok ? routed.change.op : null,
  });
  if (!routed.ok) return json(200, { ok: true, change: null });
  return json(200, { ok: true, change: routed.change, field: fixField(routed.change), line: fixLine(routed.change) });
}
