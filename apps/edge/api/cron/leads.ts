/**
 * The lead finder's sweep: every five minutes (00140's clock `leads`,
 * request_sweep, judged by its request in sweep_health()), what the runs and
 * the rounds need that no job is doing (lib/lead-sweep.ts decides; this route
 * reads the rows, applies each action on its own and carries on past a
 * failure, so one bad row never costs the others their tick).
 *
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps.
 */
import { json } from "../../lib/http.js";
import { authorizeCron } from "../../lib/cron-auth.js";
import { pg } from "../../lib/pg.js";
import { logger, errField } from "../../lib/log.js";
import { leadWires } from "../../lib/lead-wires.js";
import { planLeadSweep, type SweepRoundRow, type SweepRunRow } from "../../lib/lead-sweep.js";
import { reconcileUnknownRuns, type LeadPorts, type LeadRunRow } from "../../lib/workspace/core.js";
import { scheduleJobOnce } from "../../lib/workspace/jobs.js";
import { leadDb } from "../../lib/lead-db.js";
import type { Json } from "../../lib/workspace/db.js";

export const config = { maxDuration: 60 };
/** Reconciliation calls the provider per unknown run; the rest of a backlog waits for the next tick. */
const RECONCILE_PER_TICK = 10;

export async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "leads" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  const denied = await authorizeCron(request, db, L);
  if (denied) return denied;
  const now = Date.now();

  let runs: SweepRunRow[];
  let rounds: SweepRoundRow[];
  try {
    const [live, leased, jobs, waiting] = await Promise.all([
      db.from("lead_runs").select("id, tenant_id, round_id, purpose, state, apify_run_id, claimed_by, claimed_at, lease_owner, lease_gen, lease_until, created_at").in("state", ["claimed", "starting", "running", "unknown"]),
      db.from("lead_runs").select("id, tenant_id, round_id, purpose, state, apify_run_id, claimed_by, claimed_at, lease_owner, lease_gen, lease_until, created_at").not("lease_owner", "is", null),
      db.from("jobs").select("payload").eq("kind", "lead_collect").in("state", ["scheduled", "fired"]),
      // Every round that has not ended, not only one waiting: a round whose start job died sits in 'queued' with no run, and only the sweep ends it (00140's trigger_leads_sweep).
      db.from("lead_rounds").select("id, tenant_id, state, waiting_since, created_at").neq("state", "ended"),
    ]);
    for (const r of [live, leased, jobs, waiting]) if (r.error) throw new Error(r.error.message);
    const scheduled = new Set((jobs.data ?? []).map((j) => String((j.payload as { run_id?: unknown } | null)?.run_id ?? "")));
    const byId = new Map<string, SweepRunRow>();
    for (const r of [...(live.data ?? []), ...(leased.data ?? [])]) byId.set(r.id, { ...r, collect_scheduled: scheduled.has(r.id) });
    runs = [...byId.values()];
    rounds = waiting.data ?? [];
  } catch (e) {
    L.error("leads_sweep_read_failed", { error: errField(e) });
    return json(503, { ok: false, error: errField(e) });
  }

  const actions = planLeadSweep({ runs, rounds }, now);
  const wires = leadWires();
  const counts = { collected: 0, aborted: 0, reconciled: 0, marked_unknown: 0, released: 0, questions_ended: 0, rounds_ended: 0, failed: 0, source: wires ? "on" : "off" };
  const ledger = leadDb(db);
  const ports: LeadPorts | null = wires
    ? {
        db: ledger, apify: wires.apify, judge: wires.judge, now: () => new Date(), webhookBase: wires.webhookBase, webhookToken: wires.webhookToken,
        schedule: async (kind, payload, runAfterSeconds) => {
          const row = runs.find((r) => r.id === (payload as { run_id?: string }).run_id);
          if (row) await scheduleJobOnce(db, { tenantId: row.tenant_id, kind, dueAt: new Date(Date.now() + runAfterSeconds * 1000), payload: payload as unknown as Json });
        },
        deadline: now + 50_000,
      }
    : null;
  const unknown: LeadRunRow[] = [];

  for (const a of actions) {
    try {
      switch (a.kind) {
        case "collect":
          await scheduleJobOnce(db, { tenantId: a.tenantId, kind: "lead_collect", dueAt: new Date(), payload: { run_id: a.runId, seq: a.seq } });
          counts.collected += 1;
          break;
        case "abort":
          if (wires) await wires.apify.abortRun(a.apifyRunId);
          await scheduleJobOnce(db, { tenantId: a.tenantId, kind: "lead_collect", dueAt: new Date(), payload: { run_id: a.runId, seq: a.seq } });
          counts.aborted += 1;
          break;
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
