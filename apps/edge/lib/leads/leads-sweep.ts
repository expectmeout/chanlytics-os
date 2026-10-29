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
import { leadWires } from "./lead-wires.js";
import { planLeadSweep, type SweepRoundRow, type SweepRunRow } from "./lead-sweep.js";
import { giveUpRun, reconcileUnknownRuns, type LeadPorts, type LeadRunRow } from "../packages/core.js";
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

/** The rows the planner decides from: the runs live or leased, with their collects, and the rounds not ended. */
async function sweepRows(db: SweepTick["db"]): Promise<{ runs: SweepRunRow[]; rounds: SweepRoundRow[] }> {
  const [live, leased, waiting] = await Promise.all([
    db
      .from("lead_runs")
      .select(
        "id, tenant_id, round_id, purpose, state, apify_run_id, claimed_by, claimed_at, lease_owner, lease_gen, lease_until, created_at",
      )
      .in("state", ["claimed", "starting", "running", "unknown"]),
    db
      .from("lead_runs")
      .select(
        "id, tenant_id, round_id, purpose, state, apify_run_id, claimed_by, claimed_at, lease_owner, lease_gen, lease_until, created_at",
      )
      .not("lease_owner", "is", null),
    // Every round that has not ended, not only one waiting: a round whose start job died sits in 'queued' with no run, and only the sweep ends it (00140's trigger_leads_sweep).
    db.from("lead_rounds").select("id, tenant_id, state, waiting_since, created_at").neq("state", "ended"),
  ]);
  for (const r of [live, leased, waiting]) if (r.error) throw new Error(r.error.message);
  const rows = [...(live.data ?? []), ...(leased.data ?? [])];
  const ids = [...new Set(rows.map((r) => r.id))];
  // These runs' collects, the ones coming and the ones that failed for good: a failed row is kept 90 days (00215),
  // so it is read for these runs alone, never the ledger's whole history, a part at a time under the gateway's line.
  const scheduled = new Set<string>();
  const failed = new Map<string, number>();
  for (let i = 0; i < ids.length; i += RUNS_IN_CHUNK) {
    const jobs = await db
      .from("jobs")
      .select("payload, state")
      .eq("kind", "lead_collect")
      .in("state", ["scheduled", "fired", "failed"])
      .in("payload->>run_id", ids.slice(i, i + RUNS_IN_CHUNK));
    if (jobs.error) throw new Error(jobs.error.message);
    for (const j of jobs.data ?? []) {
      const runId = String((j.payload as { run_id?: unknown } | null)?.run_id ?? "");
      if (j.state === "failed") failed.set(runId, (failed.get(runId) ?? 0) + 1);
      else scheduled.add(runId);
    }
  }
  const byId = new Map<string, SweepRunRow>();
  for (const r of rows)
    byId.set(r.id, { ...r, collect_scheduled: scheduled.has(r.id), collects_failed: failed.get(r.id) ?? 0 });
  return { runs: [...byId.values()], rounds: waiting.data ?? [] };
}

export async function sweepLeads({ db, L }: SweepTick): Promise<Response> {
  const now = Date.now();

  let runs: SweepRunRow[];
  let rounds: SweepRoundRow[];
  try {
    ({ runs, rounds } = await sweepRows(db));
  } catch (e) {
    L.error("leads_sweep_read_failed", { error: errField(e) });
    return refuse(503, "read_failed", errField(e));
  }

  const actions = planLeadSweep({ runs, rounds }, now);
  const wires = leadWires();
  const counts = {
    collected: 0,
    aborted: 0,
    reconciled: 0,
    marked_unknown: 0,
    released: 0,
    questions_ended: 0,
    rounds_ended: 0,
    given_up: 0,
    failed: 0,
    source: wires ? "on" : "off",
  };
  const ledger = leadDb(db);
  const ports: LeadPorts | null = wires
    ? {
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
        deadline: now + SWEEP_DEADLINE_MS,
      }
    : null;
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
        case "end_stuck": {
          // Nothing live and an hour gone: the round ends, and its allowance and its share of the day's cap come back (00140's lead_round_end).
          const { error } = await db.rpc("lead_round_end", { p_round_id: a.roundId, p_ending: "source_failed" });
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
  L.info("leads_sweep_done", { ...counts, actions: actions.length });
  return json(200, { ok: true, ...counts });
}
