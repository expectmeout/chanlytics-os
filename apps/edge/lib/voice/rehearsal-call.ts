/**
 * A rehearsal in the browser (decision 0069, R2): the owner talks to the receptionist as a customer would, before any
 * number is bought and whenever after.
 *
 * The door is api/admin/rehearsal/call.ts: it checks who may knock (authorizeAdmin, a token the dashboard minted for the
 * member and the workspace) and reads the body; everything after is here. In order: the provider's key and the tools'
 * secret, the workspace and its runtime (a paused one, one with nothing to answer from, and a lead's preview while
 * previews are switched off are refused), the rehearsal's row reserved (one start a workspace at a time, so two presses
 * at once are one call), the free minutes (contracts rehearsalAllowance, read over the window's spoken rehearsals after
 * the reservation), the workspace's agent (made when there is none, and kept before any number: voice-agent.ts
 * ensureVoiceAgent), the plan a real call gets (call-start.ts planRehearsalStart: no memory, no line to put a caller
 * through to), the web call at the provider with the call's own voice, its length and its metadata, and the row named
 * for the call before the token is answered, so its webhooks and its tools find it; a way out that made no call gives
 * the reservation back. The answer is what the browser joins with, and what the page says beside it.
 *
 * Its deliveries and its tools are told apart from a call on the line by the call's type (`web_call`): every web call on
 * the account is one of ours or the provider's own test, and neither is a customer.
 *   - The call webhook hands each delivery here (settleRehearsalEvent): the words so far on every transcript_updated, the
 *     whole and the seconds at its end. Nothing reaches the call pipeline.
 *   - The booking-link tool sends nothing and says the link is on the owner's screen (rehearsalToolCall).
 */
import { json, refuse } from "../http.js";
import { pg } from "../pg.js";
import { workspaceFor, personFor, type Admitted } from "../admin-auth.js";
import { loadTenantRuntime } from "../tenant-runtime.js";
import { env } from "../env.js";
import { logger, errField } from "../log.js";
import { createWebCall, webCallBody, webCallMadeOf, type RetellCall } from "../packages/channels.js";
import {
  endRehearsal,
  keepRehearsalCall,
  leadPreviewOfWorkspace,
  previewCalled,
  rehearsalByCall,
  rehearsalSpokenMs,
  releaseRehearsalCall,
  reserveRehearsalCall,
  workspaceMaySpend,
  writeRehearsalTranscript,
  type RehearsalRow,
  type RoutedChannel,
} from "../packages/db.js";
import {
  rehearsalAllowance,
  rehearsalCallMs,
  turnsOfTranscript,
  REHEARSAL_LIMITS,
  SECOND_MS,
  UUID,
} from "../packages/contracts.js";
import { ensureVoiceAgent } from "./voice-agent.js";
import { planRehearsalStart } from "./call-start.js";

type Db = NonNullable<ReturnType<typeof pg>>;

/** The runtime of a workspace that may have no line yet: read by the workspace, as the eval door reads a chat's. */
export function rehearsalRouting(tenantId: string): RoutedChannel {
  return {
    kind: "voice",
    channelId: tenantId,
    tenantId,
    externalId: "",
    numberE164: null,
    credentialsRef: null,
    config: {},
  };
}

/** Whether a call at the provider is a rehearsal: a web call, which no customer ever makes. */
export function isRehearsalCall(call: Pick<RetellCall, "call_type"> | null | undefined): boolean {
  return call?.call_type === "web_call";
}

/**
 * The workspace's agent, made at the provider before any number (decision 0073, R1): the first run's Your receptionist
 * asks for it as the owner goes on to rehearse, so the first call starts at once. `ensureVoiceAgent` keeps it on the
 * workspace (voice_agents), and a number bought later answers in the same agent. Nothing is dialed and nothing is
 * spent beyond the provider's own agent; a second ask finds the one kept.
 */
export async function makeRehearsalAgent(
  auth: Admitted,
  body: Partial<{ tenant_id: string; user_id: string }>,
): Promise<Response> {
  const L = logger();
  const apiKey = env.RETELL_API_KEY;
  const fnSecret = env.RETELL_FN_SECRET;
  if (!apiKey || !fnSecret) return refuse(503, !apiKey ? "no_provider_key" : "no_fn_secret");
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  if (!UUID.test(tenantId)) return refuse(400, "bad_tenant", "tenant_id (a workspace id) is required");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const rt = await loadTenantRuntime(db, rehearsalRouting(tenantId));
  if (rt.loadFailed) return refuse(503, "read_failed", "the workspace could not be read");
  if (!rt.brain) return refuse(409, rt.configBroken ? "config_broken" : "no_persona");
  try {
    await ensureVoiceAgent(db, { apiKey }, { fnSecret }, { id: tenantId, name: rt.brain.business_name || "" });
    return json(200, { ok: true });
  } catch (e) {
    L.error("rehearsal_call_failed", { tenant_id: tenantId, step: "agent", error: errField(e) });
    return refuse(502, "provider_refused", "the receptionist could not be made at the provider");
  }
}

/**
 * The free minutes as they stand for a workspace: its plan, and what its window's spoken rehearsals spent. A lead's own
 * receptionist that nobody has made theirs (decision 0079) has its preview's six minutes in all, plan or none.
 */
async function allowanceOf(db: Db, tenantId: string, now: Date, except: string | null) {
  const preview = await leadPreviewOfWorkspace(db, tenantId);
  const isPreview = !!preview && preview.state !== "claimed";
  const hasPlan = isPreview ? false : await workspaceMaySpend(db, tenantId);
  const since = hasPlan ? new Date(now.getTime() - REHEARSAL_LIMITS.withPlanWindowMs).toISOString() : null;
  const spoken = await rehearsalSpokenMs(db, tenantId, {
    since,
    now,
    runningMs: REHEARSAL_LIMITS.runningMs,
    callMs: REHEARSAL_LIMITS.callMs,
    except,
  });
  return rehearsalAllowance({ hasPlan, preview: isPreview, spentMs: spoken.spentMs, running: spoken.running });
}

type Allowance = Awaited<ReturnType<typeof allowanceOf>>;

/** The door's refusal for minutes it may not spend now: used up, or a call of the workspace already running. */
const minutesUsed = (allowance: Allowance) =>
  json(409, { ok: false, error: "rehearsal_minutes_used", detail: allowance.why ?? undefined, allowance });

/**
 * The start's own rehearsal, reserved before anything is asked of the provider, and the minutes it may spend: read
 * after the reservation and without it, so two starts at one moment are one call and a refusal (the second finds the
 * first's reservation, or the first's row once named), never two calls each sure the minutes were there.
 */
async function reserveStart(
  db: Db,
  tenantId: string,
  userId: string | null,
  now: Date,
): Promise<{ ok: true; id: string; allowance: Allowance } | { ok: false; response: Response }> {
  const L = logger();
  const id = crypto.randomUUID();
  try {
    if (!(await reserveRehearsalCall(db, { id, tenantId, createdBy: userId, now }))) {
      const allowance = await allowanceOf(db, tenantId, now, null);
      return { ok: false, response: minutesUsed({ ...allowance, can_call: false, why: "running" }) };
    }
    const allowance = await allowanceOf(db, tenantId, now, id);
    if (allowance.can_call) return { ok: true, id, allowance };
    await releaseRehearsalCall(db, tenantId, id);
    return { ok: false, response: minutesUsed(allowance) };
  } catch (e) {
    L.error("rehearsal_call_failed", { tenant_id: tenantId, step: "minutes", error: errField(e) });
    await releaseRehearsalCall(db, tenantId, id).catch(() => undefined);
    return { ok: false, response: refuse(503, "read_failed") };
  }
}

export async function startRehearsalCall(
  auth: Admitted,
  body: Partial<{ tenant_id: string; user_id: string }>,
): Promise<Response> {
  const L = logger();
  const apiKey = env.RETELL_API_KEY;
  const fnSecret = env.RETELL_FN_SECRET;
  if (!apiKey || !fnSecret) return refuse(503, !apiKey ? "no_provider_key" : "no_fn_secret");
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  if (!UUID.test(tenantId)) return refuse(400, "bad_tenant", "tenant_id (a workspace id) is required");
  const userId = personFor(auth, body.user_id);
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const now = new Date();

  const rt = await loadTenantRuntime(db, rehearsalRouting(tenantId));
  if (rt.loadFailed) return refuse(503, "read_failed", "the workspace could not be read");
  if (rt.paused) return refuse(402, "payment_required", "the workspace is paused");
  if (!rt.brain) return refuse(409, rt.configBroken ? "config_broken" : "no_persona");
  // A lead's own receptionist nobody has made theirs calls only while previews are switched on (decision 0079): the
  // switch is the one that stops what they spend, whatever pages are open.
  if (rt.preview && env.LEAD_PREVIEWS !== "on") return refuse(409, "preview_failed", "previews are switched off");

  const start = await reserveStart(db, tenantId, userId, now);
  if (!start.ok) return start.response;
  const { id, allowance } = start;
  // Every way out below that makes no call gives the reservation back, so the next start is not held for it.
  const giveBack = () =>
    releaseRehearsalCall(db, tenantId, id).catch((e: unknown) =>
      L.error("rehearsal_call_failed", { tenant_id: tenantId, step: "release", error: errField(e) }),
    );

  const plan = await planRehearsalStart(rt, now);
  if (!plan) {
    await giveBack();
    return refuse(409, "no_persona");
  }

  let agent: Awaited<ReturnType<typeof ensureVoiceAgent>>;
  try {
    agent = await ensureVoiceAgent(db, { apiKey }, { fnSecret }, { id: tenantId, name: rt.brain.business_name || "" });
  } catch (e) {
    L.error("rehearsal_call_failed", { tenant_id: tenantId, step: "agent", error: errField(e) });
    await giveBack();
    return refuse(502, "provider_refused", "the receptionist could not be made at the provider");
  }

  const maxMs = rehearsalCallMs(allowance);
  const made = await createWebCall(
    { apiKey },
    {
      ...webCallBody({
        agentId: agent.agentId,
        variables: { ...plan.variables },
        voiceId: plan.voiceId,
        voiceSpeed: plan.voiceSpeed,
        maxMs,
        metadata: {
          rehearsal_id: id,
          tenant_id: tenantId,
          ...(plan.configVersion !== null ? { config_version: plan.configVersion } : {}),
        },
      }),
      // A number pinned to the published version follows it; so does a rehearsal, so the owner hears what callers do.
      ...(agent.pinned ? { agent_version: "latest_published" } : {}),
    },
  ).catch((e: unknown) => ({ ok: false as const, status: 0, body: { error: errField(e) } }));
  const call = made.ok ? webCallMadeOf(made.body) : null;
  if (!call) {
    L.error("rehearsal_call_failed", { tenant_id: tenantId, step: "call", status: made.status });
    await giveBack();
    return refuse(502, "provider_refused", "the provider did not make the call");
  }

  try {
    await keepRehearsalCall(db, {
      id,
      tenantId,
      retellCallId: call.call_id,
      agentId: agent.agentId,
      configVersion: plan.configVersion,
      instructions: plan.variables.business_facts,
    });
  } catch (e) {
    // The call was made and nobody will join it: its token lapses unused, and it is never counted.
    L.error("rehearsal_call_failed", { tenant_id: tenantId, step: "row", error: errField(e) });
    await giveBack();
    return refuse(503, "write_failed");
  }

  L.info("rehearsal_call_started", {
    tenant_id: tenantId,
    rehearsal_id: id,
    call_id: call.call_id,
    agent_id: agent.agentId,
    max_ms: maxMs,
    config_version: plan.configVersion,
  });
  return json(200, {
    ok: true,
    rehearsal_id: id,
    call,
    max_ms: maxMs,
    allowance: { ...allowance, left_ms: Math.max(0, allowance.left_ms - maxMs) },
    handoff: plan.handoff,
  });
}

/**
 * A rehearsal's delivery from the call webhook: the words so far on each turn, and on its end the whole, its seconds
 * (what the free minutes count) and why it ended. A web call no rehearsal is (the provider's own test) is answered and
 * left; a read that fails is the provider's to deliver again.
 */
export async function settleRehearsalEvent(
  db: Db,
  event: string | null,
  call: RetellCall,
): Promise<"written" | "ended" | "unknown" | "unreadable"> {
  const L = logger({ call_id: call.call_id });
  let r: RehearsalRow | null;
  try {
    r = await rehearsalByCall(db, call.call_id);
  } catch (e) {
    L.error("rehearsal_event_failed", { retell_event: event, error: errField(e) });
    return "unreadable";
  }
  if (!r) {
    L.info("rehearsal_event_unknown", { retell_event: event });
    return "unknown";
  }
  // The words with the tools between them where the provider sent them (each turn's delivery), else the words alone.
  const turns = turnsOfTranscript(call.transcript_with_tool_calls ?? call.transcript_object ?? []);
  const startedAt = typeof call.start_timestamp === "number" ? new Date(call.start_timestamp).toISOString() : null;
  const over =
    event === "call_ended" || event === "call_analyzed" || call.call_status === "ended" || call.call_status === "error";
  try {
    if (!over) {
      await writeRehearsalTranscript(db, r.tenant_id, call.call_id, turns, startedAt);
      return "written";
    }
    const ms =
      typeof call.duration_ms === "number"
        ? call.duration_ms
        : typeof call.end_timestamp === "number" && typeof call.start_timestamp === "number"
          ? call.end_timestamp - call.start_timestamp
          : 0;
    await endRehearsal(db, r.tenant_id, call.call_id, {
      turns,
      startedAt,
      endedAt:
        typeof call.end_timestamp === "number" ? new Date(call.end_timestamp).toISOString() : new Date().toISOString(),
      seconds: Math.max(0, ms) / 1000,
      reason: call.disconnection_reason ?? null,
    });
    L.info("rehearsal_call_ended", {
      tenant_id: r.tenant_id,
      rehearsal_id: r.id,
      ms,
      reason: call.disconnection_reason ?? null,
    });
    // A lead's own receptionist counts its calls on its row (decision 0079), once a call: on its first end, since the
    // provider tells an end twice (call_ended, then call_analyzed). Any other workspace is none, and nothing moves.
    if (r.ended_at === null)
      await previewCalled(db, r.tenant_id, Math.max(0, ms) / SECOND_MS).catch((e: unknown) =>
        L.warn("preview_called_failed", { tenant_id: r.tenant_id, rehearsal_id: r.id, error: errField(e) }),
      );
    return "ended";
  } catch (e) {
    L.error("rehearsal_event_failed", { tenant_id: r.tenant_id, retell_event: event, error: errField(e) });
    return "unreadable";
  }
}

/**
 * The rehearsal a tool call belongs to, when the call is a rehearsal: its workspace, found by the provider's call id
 * the edge wrote before the call could connect. Null for a call on the line, and for a web call no rehearsal is.
 */
export async function rehearsalOfToolCall(
  db: Db,
  call: { call_id?: string; call_type?: string } | null | undefined,
): Promise<RehearsalRow | null> {
  if (!call?.call_id || !isRehearsalCall(call)) return null;
  return rehearsalByCall(db, call.call_id).catch(() => null);
}
