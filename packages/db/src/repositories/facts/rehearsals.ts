/**
 * Rehearsals (decision 0069, 00476): a conversation the owner rehearsed, spoken in the browser or typed, and a real call
 * reviewed; and the workspace's receptionist at Retell, kept before any number.
 *
 *   - The edge reserves a spoken one before it asks the provider for the call (`reserveRehearsalCall`: one start a
 *     workspace at a time, held by the row's unique call id; `releaseRehearsalCall` where no call was made), names it
 *     once the call is made (`keepRehearsalCall`, before the token is answered, so its tools and its webhooks find it by
 *     the provider's call id), and writes its transcript as the call goes (`writeRehearsalTranscript`)
 *     and its end (`endRehearsal`); a review (`keepRehearsalReview`), a typed one when it is reviewed
 *     (`keepTypedRehearsal`), and a reviewed call (`keepCallReview`).
 *   - The free minutes are read as the window's spoken seconds (`rehearsalSpokenMs`): a call still running counts whole.
 *   - The dashboard reads a rehearsal under the member's own session (RLS), and appends a fix kept from it
 *     (`keepRehearsalFix`) through its door, `rehearsal_fix_keep` (00481), on that session once the settings write has
 *     gone through.
 *   - `voiceAgentOf` / `keepVoiceAgent`: the agent before the number. The service role alone.
 * Every statement on a workspace's table goes through `tenantDb`, so none can reach another workspace's row by an id.
 */
import { MIN_MS } from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types";
import { platformWide, tenantDb } from "../../tenant-db";

type Db = SupabaseClient<Database>;

/** One turn, as the row keeps it: the receptionist's words, the customer's, or a tool it reached for, by its name. */
interface RehearsalTurnRow {
  role: "agent" | "user" | "tool";
  content: string;
}

const ROLES: ReadonlySet<unknown> = new Set(["agent", "user", "tool"]);

/** One change kept from a rehearsal, as its row keeps it: the op, the field it landed in, its line, the version, when. */
interface RehearsalFixRow {
  op: string;
  field: string;
  said: string;
  version: number;
  at: string;
}

/** A rehearsal as the doors read it. */
export interface RehearsalRow {
  id: string;
  tenant_id: string;
  kind: "call" | "typed" | "call_review";
  retell_call_id: string | null;
  call_id: string | null;
  agent_id: string | null;
  config_version: number | null;
  instructions: string | null;
  transcript: RehearsalTurnRow[];
  started_at: string | null;
  ended_at: string | null;
  seconds: number | null;
  end_reason: string | null;
  review: Json | null;
  reviewed_at: string | null;
  fixes: RehearsalFixRow[];
  created_by: string | null;
  created_at: string;
}

const REHEARSAL_COLUMNS =
  "id, tenant_id, kind, retell_call_id, call_id, agent_id, config_version, instructions, transcript, started_at, ended_at, seconds, end_reason, review, reviewed_at, fixes, created_by, created_at";

const rehearsalTurnsOf = (v: unknown): RehearsalTurnRow[] =>
  Array.isArray(v)
    ? v.flatMap((t) =>
        t &&
        typeof t === "object" &&
        ROLES.has((t as { role?: unknown }).role) &&
        typeof (t as { content?: unknown }).content === "string"
          ? [{ role: (t as RehearsalTurnRow).role, content: (t as RehearsalTurnRow).content }]
          : [],
      )
    : [];

/** The fixes a row keeps, each with the five words a fix carries; anything else in the column is left out. */
const rehearsalFixesOf = (v: unknown): RehearsalFixRow[] =>
  Array.isArray(v)
    ? v.flatMap((f: unknown) => {
        if (!f || typeof f !== "object") return [];
        const { op, field, said, version, at } = f as Record<string, unknown>;
        return typeof op === "string" &&
          typeof field === "string" &&
          typeof said === "string" &&
          typeof version === "number" &&
          typeof at === "string"
          ? [{ op, field, said, version, at }]
          : [];
      })
    : [];

/** Turns as the jsonb column takes them: each a plain object of its two words. */
const transcriptJson = (turns: readonly RehearsalTurnRow[]): Json =>
  turns.map((t) => ({ role: t.role, content: t.content }));

/** A row as COLUMNS reads it: every column but when it last changed. */
type ReadRow = Omit<Database["public"]["Tables"]["rehearsals"]["Row"], "updated_at">;

function rehearsalOf(r: ReadRow): RehearsalRow {
  return {
    id: r.id,
    tenant_id: r.tenant_id,
    kind: r.kind as RehearsalRow["kind"],
    retell_call_id: r.retell_call_id,
    call_id: r.call_id,
    agent_id: r.agent_id,
    config_version: r.config_version,
    instructions: r.instructions,
    transcript: rehearsalTurnsOf(r.transcript),
    started_at: r.started_at,
    ended_at: r.ended_at,
    seconds: r.seconds,
    end_reason: r.end_reason,
    review: r.review,
    reviewed_at: r.reviewed_at,
    fixes: rehearsalFixesOf(r.fixes),
    created_by: r.created_by,
    created_at: r.created_at,
  };
}

/** One rehearsal of the workspace, by its id; null when it has none by that id. A read that fails throws. */
export async function rehearsalById(db: Db, tenantId: string, id: string): Promise<RehearsalRow | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("rehearsals")
    .select(REHEARSAL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`cannot read the rehearsal: ${error.message}`);
  return data ? rehearsalOf(data) : null;
}

/**
 * The rehearsal a call at the provider is, by its call id, across workspaces: what a webhook and a tool find a test
 * call's workspace by. The id is the provider's, minted per call, and written by the edge before the call can connect.
 */
export async function rehearsalByCall(db: Db, retellCallId: string): Promise<RehearsalRow | null> {
  const { data, error } = await db
    .from("rehearsals")
    .select(REHEARSAL_COLUMNS)
    .eq("retell_call_id", retellCallId)
    .maybeSingle();
  if (error) throw new Error(`cannot read the rehearsal of a call: ${error.message}`);
  return data ? rehearsalOf(data) : null;
}

/** The review of a real call, where it has one. */
export async function callReviewOf(db: Db, tenantId: string, callId: string): Promise<RehearsalRow | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("rehearsals")
    .select(REHEARSAL_COLUMNS)
    .eq("kind", "call_review")
    .eq("call_id", callId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`cannot read the call's review: ${error.message}`);
  return data ? rehearsalOf(data) : null;
}

/**
 * The window's spoken rehearsals: each by its provider's seconds once it ended, a running one by `runningMs` (the whole
 * of a call's length), and whether one is still running (made within `runningMs` and not ended). `since` is the window's
 * start, or null for every one the workspace ever made (before its plan). `except` is the start asking, whose own
 * reservation is no other call. A read that fails throws.
 */
export async function rehearsalSpokenMs(
  db: Db,
  tenantId: string,
  o: { since: string | null; now: Date; runningMs: number; callMs: number; except: string | null },
): Promise<{ spentMs: number; running: boolean }> {
  let q = tenantDb(db, tenantId).from("rehearsals").select("created_at, ended_at, seconds").eq("kind", "call");
  if (o.since) q = q.gte("created_at", o.since);
  if (o.except) q = q.neq("id", o.except);
  const { data, error } = await q;
  if (error) throw new Error(`cannot read the rehearsals' minutes: ${error.message}`);
  let spentMs = 0;
  let running = false;
  for (const r of data ?? []) {
    if (r.ended_at || r.seconds !== null) spentMs += Math.max(0, r.seconds ?? 0) * 1000;
    else if (o.now.getTime() - Date.parse(r.created_at) < o.runningMs) {
      running = true;
      spentMs += o.callMs;
    }
  }
  return { spentMs, running };
}

/**
 * The rehearsals reviewed and the changes kept from them, and when the newest was made (decision 0073: the first run's
 * Rehearse is done at the first review, and "Trained: n things" counts the keeps). Read under the member's session.
 */
export async function rehearsalTally(
  db: Db,
  tenantId: string,
): Promise<{ reviewed: number; kept: number; last_at: string | null }> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("rehearsals")
    .select("created_at, reviewed_at, fixes")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`cannot read the rehearsals: ${error.message}`);
  const rows = data ?? [];
  return {
    reviewed: rows.filter((r) => r.reviewed_at !== null).length,
    kept: rows.reduce((n, r) => n + (Array.isArray(r.fixes) ? r.fixes.length : 0), 0),
    last_at: rows[0]?.created_at ?? null,
  };
}

/** A spoken rehearsal, as its call is made: before the token is answered, so its tools and its webhooks find it. */
/**
 * The call id a workspace's start holds while it asks the provider: one a workspace, so a second start at the same
 * moment is the row's unique key (`rehearsals_retell_call_id_key`), never a second call beside the first.
 */
const startingCallId = (tenantId: string) => `starting:${tenantId}`;

/** How long a start may hold its reservation: the call door's own most (vercel.json, 60 s) and a margin. */
const START_HELD_MS = 2 * MIN_MS;

/**
 * A spoken rehearsal reserved before its call is asked for: the row, holding its workspace's one start, which a start
 * that died left behind gives up once it is older than START_HELD_MS. False where another start holds it now: a call is
 * being made already.
 */
export async function reserveRehearsalCall(
  db: Db,
  r: { id: string; tenantId: string; createdBy: string | null; now: Date },
): Promise<boolean> {
  const held = startingCallId(r.tenantId);
  const t = tenantDb(db, r.tenantId);
  const stale = await t
    .from("rehearsals")
    .delete()
    .eq("retell_call_id", held)
    .lt("created_at", new Date(r.now.getTime() - START_HELD_MS).toISOString());
  if (stale.error) throw new Error(`cannot clear a start left behind: ${stale.error.message}`);
  const { error } = await t.from("rehearsals").insert({
    id: r.id,
    tenant_id: r.tenantId,
    kind: "call",
    retell_call_id: held,
    created_by: r.createdBy,
  });
  if (error?.code === "23505") return false;
  if (error) throw new Error(`cannot reserve the rehearsal: ${error.message}`);
  return true;
}

/** A reservation no call came of, given back: the minutes refused it, or the provider made no call. */
export async function releaseRehearsalCall(db: Db, tenantId: string, id: string): Promise<void> {
  const { error } = await tenantDb(db, tenantId)
    .from("rehearsals")
    .delete()
    .eq("id", id)
    .eq("retell_call_id", startingCallId(tenantId));
  if (error) throw new Error(`cannot give the rehearsal back: ${error.message}`);
}

/** The reserved rehearsal, named for the call the provider made: its call id, the agent, and what it was told. */
export async function keepRehearsalCall(
  db: Db,
  r: {
    id: string;
    tenantId: string;
    retellCallId: string;
    agentId: string;
    configVersion: number | null;
    instructions: string;
  },
): Promise<void> {
  const { data, error } = await tenantDb(db, r.tenantId)
    .from("rehearsals")
    .update({
      retell_call_id: r.retellCallId,
      agent_id: r.agentId,
      config_version: r.configVersion,
      instructions: r.instructions,
    })
    .eq("id", r.id)
    .eq("retell_call_id", startingCallId(r.tenantId))
    .select("id");
  if (error) throw new Error(`cannot keep the rehearsal: ${error.message}`);
  if (!data?.length) throw new Error("cannot keep the rehearsal: its reservation is gone");
}

/**
 * A spoken rehearsal's words so far, as the provider's latest delivery says them (each `transcript_updated` is the
 * whole of it), and when it began. Forward-only: an ended rehearsal's transcript is its end's. Answers whether it wrote.
 */
export async function writeRehearsalTranscript(
  db: Db,
  tenantId: string,
  retellCallId: string,
  turns: readonly RehearsalTurnRow[],
  startedAt: string | null,
): Promise<boolean> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("rehearsals")
    .update({ transcript: transcriptJson(turns), ...(startedAt ? { started_at: startedAt } : {}) })
    .eq("retell_call_id", retellCallId)
    .is("ended_at", null)
    .select("id");
  if (error) throw new Error(`cannot write the rehearsal's words: ${error.message}`);
  return (data ?? []).length > 0;
}

/** A spoken rehearsal ended: its whole transcript, its seconds (what the free minutes count), and why it ended. */
export async function endRehearsal(
  db: Db,
  tenantId: string,
  retellCallId: string,
  e: {
    turns: readonly RehearsalTurnRow[];
    startedAt: string | null;
    endedAt: string;
    seconds: number;
    reason: string | null;
  },
): Promise<boolean> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("rehearsals")
    .update({
      ...(e.turns.length ? { transcript: transcriptJson(e.turns) } : {}),
      ...(e.startedAt ? { started_at: e.startedAt } : {}),
      ended_at: e.endedAt,
      seconds: Math.max(0, Math.round(e.seconds)),
      end_reason: e.reason ? e.reason.slice(0, 64) : null,
    })
    .eq("retell_call_id", retellCallId)
    .select("id");
  if (error) throw new Error(`cannot end the rehearsal: ${error.message}`);
  return (data ?? []).length > 0;
}

/** A typed rehearsal, kept when it is reviewed: its turns, the version it ran on and the instructions composed for it. */
export async function keepTypedRehearsal(
  db: Db,
  r: {
    tenantId: string;
    turns: readonly RehearsalTurnRow[];
    configVersion: number | null;
    instructions: string;
    createdBy: string | null;
  },
): Promise<string> {
  const { data, error } = await tenantDb(db, r.tenantId)
    .from("rehearsals")
    .insert({
      tenant_id: r.tenantId,
      kind: "typed",
      transcript: transcriptJson(r.turns),
      config_version: r.configVersion,
      instructions: r.instructions,
      created_by: r.createdBy,
    })
    .select("id")
    .single();
  if (error) throw new Error(`cannot keep the typed rehearsal: ${error.message}`);
  return data.id;
}

/** A real call, kept as reviewed: the call, the version it ran on, and the instructions it is judged against. */
export async function keepCallReview(
  db: Db,
  r: {
    tenantId: string;
    callId: string;
    agentId: string | null;
    configVersion: number | null;
    instructions: string;
    turns: readonly RehearsalTurnRow[];
    createdBy: string | null;
  },
): Promise<string> {
  const { data, error } = await tenantDb(db, r.tenantId)
    .from("rehearsals")
    .insert({
      tenant_id: r.tenantId,
      kind: "call_review",
      call_id: r.callId,
      agent_id: r.agentId,
      config_version: r.configVersion,
      instructions: r.instructions,
      transcript: transcriptJson(r.turns),
      created_by: r.createdBy,
    })
    .select("id")
    .single();
  if (error) throw new Error(`cannot keep the call's review: ${error.message}`);
  return data.id;
}

/** The review, kept on its rehearsal, so a second look costs nothing. */
export async function keepRehearsalReview(db: Db, tenantId: string, id: string, review: Json): Promise<void> {
  const { error } = await tenantDb(db, tenantId)
    .from("rehearsals")
    .update({ review, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`cannot keep the review: ${error.message}`);
}

/**
 * A change kept from a rehearsal, appended to its fixes (the count "Trained: 3 things" reads) through its door,
 * `rehearsal_fix_keep` (00481), on the member's session: the door asks that they may change the workspace's settings,
 * locks the row so two Keeps at once each append theirs, stamps the moment and writes `settings.fix_kept`. Answers how
 * many fixes the rehearsal now keeps. A refusal throws.
 */
export async function keepRehearsalFix(
  db: Db,
  tenantId: string,
  id: string,
  fix: Omit<RehearsalFixRow, "at">,
): Promise<number> {
  const { data, error } = await db.rpc("rehearsal_fix_keep", {
    p_tenant_id: tenantId,
    p_rehearsal_id: id,
    p_fix: { op: fix.op, field: fix.field, said: fix.said, version: fix.version },
  });
  if (error) throw new Error(`cannot keep the fix: ${error.message}`);
  return data;
}

/* ------------------------------------------------------------------------ the agent before the number -- */

/** The workspace's receptionist at Retell, made before any number: null where none was. A read that fails throws. */
export async function voiceAgentOf(
  db: Db,
  tenantId: string,
): Promise<{ agentId: string; llmId: string | null } | null> {
  const { data, error } = await tenantDb(db, tenantId).from("voice_agents").select("agent_id, llm_id").maybeSingle();
  if (error) throw new Error(`cannot read the workspace's voice agent: ${error.message}`);
  return data ? { agentId: data.agent_id, llmId: data.llm_id } : null;
}

/** The agent kept on the workspace: once, the first made (a second made at once loses, and is the caller's to adopt). */
export async function keepVoiceAgent(
  db: Db,
  a: { tenantId: string; agentId: string; llmId: string | null },
): Promise<{ agentId: string; llmId: string | null }> {
  const t = tenantDb(db, a.tenantId);
  const { error } = await t
    .from("voice_agents")
    .upsert(
      { tenant_id: a.tenantId, agent_id: a.agentId, llm_id: a.llmId },
      { onConflict: "tenant_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(`cannot keep the workspace's voice agent: ${error.message}`);
  const kept = await voiceAgentOf(db, a.tenantId);
  if (!kept) throw new Error("the workspace's voice agent was not kept");
  return kept;
}

/**
 * Every agent made before its number, across workspaces: the platform's converger keeps them on the shell beside the
 * voice rows' (voice-converge.ts), so a number bought later answers in an agent that is the product's own.
 */
export async function voiceAgentsBeforeANumber(db: Db): Promise<string[]> {
  const { data, error } = await platformWide(db).from("voice_agents").select("agent_id");
  if (error) throw new Error(`cannot read the voice agents: ${error.message}`);
  return (data ?? []).map((r) => r.agent_id);
}

/** A workspace's settings as they stood at one version (tenant_config_versions, 00402); null when that version is not kept. */
export async function configAtVersion(db: Db, tenantId: string, version: number): Promise<Json | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("tenant_config_versions")
    .select("config")
    .eq("version", version)
    .maybeSingle();
  if (error) throw new Error(`cannot read the settings at version ${version}: ${error.message}`);
  return data?.config ?? null;
}
