/**
 * The lead finder's sweep: every five minutes (00140's clock `leads`,
 * request_sweep, judged by its request in sweep_health()), what the runs and
 * the rounds need that no job is doing (lib/lead-sweep.ts decides; the sweep
 * reads the rows, applies each action on its own and carries on past a
 * failure, so one bad row never costs the others their tick).
 *
 * The route is api/cron/leads.ts: sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks
 * the sweep key, then hands this its tick, so nothing below runs for a knock without the key.
 *
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps.
 *
 * Cross-workspace: the lead sweep visits every workspace's runs and rounds; each job it schedules carries the row's tenant_id.
 */
import { json, refuse } from "../http.js";
import { errField } from "../log.js";
import { leadWires, type LeadWires } from "./lead-wires.js";
import { markLeadsAgain } from "./lead-marks.js";
import {
  planLeadSweep,
  type CarryAction,
  type SweepRoundJobs,
  type SweepRoundRow,
  type SweepRunRow,
} from "./lead-sweep.js";
import { giveUpRun, reconcileUnknownRuns, runIdFor, type LeadPorts, type LeadRunRow } from "../packages/core.js";
import { scheduleJobOnce } from "../packages/jobs.js";
import { leadDb } from "./lead-db.js";
import type { Json } from "../packages/db.js";
import type { SweepTick } from "../ops/sweep-door.js";

/** Reconciliation calls the provider per unknown run; the rest of a backlog waits for the next tick. */
const RECONCILE_PER_TICK = 10;
/** Run ids in one read of their collects: well under the 8 KiB request line PostgREST's gateway takes (~200 uuids). */
const RUNS_IN_CHUNK = 100;

/** The deadline the sweep hands the lead runner, from its start, inside the function's sixty seconds (vercel.json). */
const SWEEP_DEADLINE_MS = 50_000;

const RUN_COLUMNS =
  "id, tenant_id, round_id, purpose, term, state, apify_run_id, claimed_by, claimed_at, lease_owner, lease_gen, lease_until, created_at";
type RunRead = Omit<SweepRunRow, "part" | "collect_scheduled" | "collects_failed"> & { term: string | null };
/** The kinds of a round's own jobs, read by the round they name. */
const ROUND_JOB_KINDS = ["lead_round_start", "lead_check"];
type JobRead = { kind?: string; payload: unknown; state: string; created_at: string };
type JobRows = { data: JobRead[] | null; error: { message: string } | null };

/** Rows in parts of RUNS_IN_CHUNK ids, one read each: an `.in()` rides the request line. */
async function inChunks<T>(ids: string[], read: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += RUNS_IN_CHUNK) out.push(...(await read(ids.slice(i, i + RUNS_IN_CHUNK))));
  return out;
}

/** A read's rows, or its error thrown: a read that failed is not an answer. */
function rowsOf<T>(r: { data: T[] | null; error: { message: string } | null }): T[] {
  if (r.error) throw new Error(r.error.message);
  return r.data ?? [];
}

/**
 * The rows the planner decides from: the runs live or leased, every run of a round that has not ended (core nextStepOf
 * reads which part of its round each is), the rounds not ended, and the jobs that carry them: each run's collects on
 * their way and the ones that failed, each round's start and checks on their way, and the carry-ons the sweep wrote
 * since the round last moved.
 */
async function sweepRows(
  db: SweepTick["db"],
): Promise<{ runs: SweepRunRow[]; rounds: SweepRoundRow[]; roundJobs: Map<string, SweepRoundJobs> }> {
  const [live, leased, open] = await Promise.all([
    db.from("lead_runs").select(RUN_COLUMNS).in("state", ["claimed", "starting", "running", "unknown"]),
    db.from("lead_runs").select(RUN_COLUMNS).not("lease_owner", "is", null),
    // Every round that has not ended, not only one waiting: a round whose start job died sits in 'queued' with no run,
    // and only the sweep carries it on (00140's trigger_leads_sweep).
    db
      .from("lead_rounds")
      .select("id, tenant_id, state, purpose, ending_pending, waiting_since, state_since, created_at")
      .neq("state", "ended"),
  ]);
  const rounds = rowsOf(open as { data: SweepRoundRow[] | null; error: { message: string } | null });
  const roundIds = rounds.map((r) => r.id);
  const ofRounds = await inChunks(roundIds, async (part) =>
    rowsOf(
      (await db.from("lead_runs").select(RUN_COLUMNS).in("round_id", part)) as {
        data: RunRead[] | null;
        error: { message: string } | null;
      },
    ),
  );
  const byId = new Map<string, RunRead>();
  for (const r of [
    ...rowsOf(live as { data: RunRead[] | null; error: { message: string } | null }),
    ...rowsOf(leased as { data: RunRead[] | null; error: { message: string } | null }),
    ...ofRounds,
  ])
    byId.set(r.id, r);
  // These runs' collects, coming, failed for good (a failed row is kept 90 days, 00215) or the sweep's own carry-ons,
  // read for these runs alone, never the ledger's whole history, a part at a time under the gateway's line.
  const collectsOf = (states: string[], part: string[], carriesOnly: boolean) => {
    const q = db.from("jobs").select("payload, state, created_at").eq("kind", "lead_collect").in("state", states);
    // A run polls every 15 seconds while it runs, so its finished collects are read only where the sweep wrote them.
    return (carriesOnly ? q.like("payload->>seq", "r%") : q).in("payload->>run_id", part);
  };
  const collects = await inChunks([...byId.keys()], async (part) => [
    ...rowsOf((await collectsOf(["scheduled", "fired", "failed"], part, false)) as JobRows),
    ...rowsOf((await collectsOf(["done"], part, true)) as JobRows),
  ]);
  const roundJobsRead = await inChunks(roundIds, async (part) =>
    rowsOf(
      (await db
        .from("jobs")
        .select("kind, payload, state, created_at")
        .in("kind", ROUND_JOB_KINDS)
        .in("state", ["scheduled", "fired", "failed", "done"])
        .in("payload->>round_id", part)) as JobRows,
    ),
  );
  return assemble([...byId.values()], rounds, collects, roundJobsRead);
}

const payloadOf = (j: JobRead): Record<string, unknown> =>
  j.payload !== null && typeof j.payload === "object" ? (j.payload as Record<string, unknown>) : {};
const isOpen = (state: string): boolean => state === "scheduled" || state === "fired";

/** The read rows as the planner takes them: each run's part of its round, its collects, and each round's own jobs. */
async function assemble(
  runRows: RunRead[],
  rounds: SweepRoundRow[],
  collects: JobRead[],
  roundJobsRead: JobRead[],
): Promise<{ runs: SweepRunRow[]; rounds: SweepRoundRow[]; roundJobs: Map<string, SweepRoundJobs> }> {
  const sinceOf = new Map(rounds.map((r) => [r.id, Date.parse(r.state_since)]));
  const roundOfRun = new Map(runRows.map((r) => [r.id, r.round_id]));
  const scheduled = new Set<string>();
  const failed = new Map<string, number>();
  const roundJobs = new Map<string, SweepRoundJobs>(
    rounds.map((r) => [r.id, { start: false, check: false, carriedOn: 0 }]),
  );
  /** A carry-on the sweep wrote that ran since its round last moved. */
  const countCarry = (roundId: string | undefined, createdAt: string) => {
    const jobs = roundId ? roundJobs.get(roundId) : undefined;
    const since = roundId ? sinceOf.get(roundId) : undefined;
    if (jobs && since !== undefined && Date.parse(createdAt) >= since) jobs.carriedOn += 1;
  };
  for (const j of collects) {
    const p = payloadOf(j);
    const runId = String(p.run_id ?? "");
    if (j.state === "failed") failed.set(runId, (failed.get(runId) ?? 0) + 1);
    if (isOpen(j.state)) scheduled.add(runId);
    else if (String(p.seq ?? "").startsWith("r")) countCarry(roundOfRun.get(runId), j.created_at);
  }
  for (const j of roundJobsRead) {
    const p = payloadOf(j);
    const jobs = roundJobs.get(String(p.round_id ?? ""));
    // A Check again is the owner's, under a round that ended: never the round's own checks.
    if (!jobs || p.again) continue;
    if (isOpen(j.state)) {
      if (j.kind === "lead_round_start") jobs.start = true;
      else jobs.check = true;
    } else if (p.carry_on === true) countCarry(String(p.round_id), j.created_at);
  }
  const runs: SweepRunRow[] = [];
  for (const r of runRows) {
    const { term, ...row } = r;
    const part: SweepRunRow["part"] =
      r.purpose === "check" ? "check" : (await runIdFor(r.round_id, "probe", term ?? "")) === r.id ? "probe" : "main";
    runs.push({ ...row, part, collect_scheduled: scheduled.has(r.id), collects_failed: failed.get(r.id) ?? 0 });
  }
  return { runs, rounds, roundJobs };
}

/**
 * The job that carries a quiet round on, written once while one of its kind is live (jobs_dedupe_live): its start (a
 * start job that died, or the main phase never started after its probe passed), a collect of a run that finished and
 * never told its round (its collect decides what that end should have), or its checks. Marked as the sweep's own
 * (`carry_on`, a collect's `r` sequence), so the next tick counts what it has tried since the round last moved.
 */
async function carryOn(db: SweepTick["db"], a: CarryAction): Promise<void> {
  const job =
    a.kind === "carry_start"
      ? {
          kind: "lead_round_start" as const,
          payload: { round_id: a.roundId, ...(a.resume ? { resume: true } : {}), carry_on: true },
        }
      : a.kind === "carry_collect"
        ? { kind: "lead_collect" as const, payload: { run_id: a.runId, seq: a.seq } }
        : { kind: "lead_check" as const, payload: { round_id: a.roundId, batch: 0, carry_on: true } };
  await scheduleJobOnce(db, { tenantId: a.tenantId, dueAt: new Date(), ...job });
}

/** The lead runner's ports for a reconciliation inside this tick: a job it asks for goes to the run's own workspace. */
function sweepPorts(
  db: SweepTick["db"],
  wires: LeadWires,
  ledger: LeadPorts["db"],
  runs: SweepRunRow[],
  deadline: number,
): LeadPorts {
  return {
    db: ledger,
    apify: wires.apify,
    judge: wires.judge,
    now: () => new Date(),
    webhookBase: wires.webhookBase,
    webhookToken: wires.webhookToken,
    schedule: async (kind, payload, runAfterSeconds) => {
      const row = runs.find((r) => r.id === (payload as { run_id?: string }).run_id);
      if (row)
        await scheduleJobOnce(db, {
          tenantId: row.tenant_id,
          kind,
          dueAt: new Date(Date.now() + runAfterSeconds * 1000),
          payload: payload as unknown as Json,
        });
    },
    deadline,
  };
}

/** Last, in what is left of the tick: the marks the collects of the last few minutes had no time to read. */
async function marksAgain(
  { db, L }: Pick<SweepTick, "db" | "L">,
  wires: LeadWires | undefined,
  deadline: number,
): Promise<{ due: number; kept: number; failed: number }> {
  if (!wires) return { due: 0, kept: 0, failed: 0 };
  try {
    return { ...(await markLeadsAgain(db, wires, deadline)), failed: 0 };
  } catch (e) {
    L.error("leads_sweep_action_failed", { kind: "marks", error: errField(e) });
    return { due: 0, kept: 0, failed: 1 };
  }
}

export async function sweepLeads({ db, L }: SweepTick): Promise<Response> {
  const now = Date.now();
  let runs: SweepRunRow[];
  let rounds: SweepRoundRow[];
  let roundJobs: Map<string, SweepRoundJobs>;
  try {
    ({ runs, rounds, roundJobs } = await sweepRows(db));
  } catch (e) {
    L.error("leads_sweep_read_failed", { error: errField(e) });
    return refuse(503, "read_failed", errField(e));
  }

  const actions = planLeadSweep({ runs, rounds, roundJobs }, now);
  const wires = leadWires();
  const counts = {
    collected: 0,
    aborted: 0,
    reconciled: 0,
    marked_unknown: 0,
    released: 0,
    questions_ended: 0,
    rounds_ended: 0,
    carried_on: 0,
    given_up: 0,
    marks_due: 0,
    marks_kept: 0,
    failed: 0,
    source: wires ? "on" : "off",
  };
  const ledger = leadDb(db);
  const ports = wires ? sweepPorts(db, wires, ledger, runs, now + SWEEP_DEADLINE_MS) : null;
  const unknown: LeadRunRow[] = [];

  for (const a of actions) {
    try {
      switch (a.kind) {
        case "collect":
          await scheduleJobOnce(db, {
            tenantId: a.tenantId,
            kind: "lead_collect",
            dueAt: new Date(),
            payload: { run_id: a.runId, seq: a.seq },
          });
          counts.collected += 1;
          break;
        case "abort":
          if (wires) await wires.apify.abortRun(a.apifyRunId);
          await scheduleJobOnce(db, {
            tenantId: a.tenantId,
            kind: "lead_collect",
            dueAt: new Date(),
            payload: { run_id: a.runId, seq: a.seq },
          });
          counts.aborted += 1;
          break;
        case "give_up": {
          // Stopped at the provider first, since nothing reads it again once it is failed in our books; a provider
          // that cannot be reached does not keep it alive, as each run ends there by its own timeout.
          if (wires) await wires.apify.abortRun(a.apifyRunId).catch(() => undefined);
          const out = await giveUpRun({ db: ledger }, a.runId, a.owner);
          if (out.kind === "given_up") counts.given_up += 1;
          break;
        }
        case "mark_unknown": {
          const { error } = await db.rpc("lead_run_mark_unknown", { p_run_id: a.runId, p_owner: a.owner });
          if (error) throw new Error(error.message);
          counts.marked_unknown += 1;
          break;
        }
        case "release_lease": {
          const { error } = await db.rpc("lead_run_release", { p_run_id: a.runId, p_owner: a.owner, p_gen: a.gen });
          if (error) throw new Error(error.message);
          counts.released += 1;
          break;
        }
        case "end_question": {
          const { error } = await db.rpc("lead_round_end", { p_round_id: a.roundId, p_ending: "question_unanswered" });
          if (error) throw new Error(error.message);
          counts.questions_ended += 1;
          break;
        }
        case "carry_start":
        case "carry_collect":
        case "carry_check":
          await carryOn(db, a);
          counts.carried_on += 1;
          break;
        case "end_stuck": {
          // Nothing can carry it on: the door looks again under its own lock and ends it with the ending it had pending,
          // giving back its allowance and its share of the day's cap (00140's lead_round_end).
          const { error } = await db.rpc("lead_round_end_stuck", {
            p_round_id: a.roundId,
            p_since: a.since,
            p_ending: a.ending,
          });
          if (error) throw new Error(error.message);
          counts.rounds_ended += 1;
          break;
        }
        case "orphan": {
          // A row nobody claimed in an hour: the sweep claims it and marks it unknown, and the next tick reconciles it.
          const claimed = await db.rpc("lead_run_claim", { p_run_id: a.runId, p_owner: a.owner });
          if (claimed.error) throw new Error(claimed.error.message);
          const marked = await db.rpc("lead_run_mark_unknown", { p_run_id: a.runId, p_owner: a.owner });
          if (marked.error) throw new Error(marked.error.message);
          counts.marked_unknown += 1;
          break;
        }
        case "reconcile": {
          if (unknown.length >= RECONCILE_PER_TICK) break;
          const row = await ledger.run(a.runId);
          if (row) unknown.push(row);
          break;
        }
      }
    } catch (e) {
      counts.failed += 1;
      L.error("leads_sweep_action_failed", { kind: a.kind, error: errField(e) });
    }
  }
  if (unknown.length && ports) {
    try {
      const done = await reconcileUnknownRuns(ports, unknown);
      counts.reconciled = done.filter((d) => d.kind !== "waiting").length;
    } catch (e) {
      counts.failed += 1;
      L.error("leads_sweep_reconcile_failed", { error: errField(e) });
    }
  }
  const marks = await marksAgain({ db, L }, wires, now + SWEEP_DEADLINE_MS);
  counts.marks_due = marks.due;
  counts.marks_kept = marks.kept;
  counts.failed += marks.failed;
  L.info("leads_sweep_done", { ...counts, actions: actions.length });
  return json(200, { ok: true, ...counts });
}
