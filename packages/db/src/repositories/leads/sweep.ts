/**
 * What the lead sweep reads and moves (decision 0111): the runs live, leased or of a round not ended, the rounds not
 * ended, the jobs that carry them, and the run and round doors it calls (00140). Every read is across workspaces on
 * purpose: the sweep is the platform's. Each answer is the database's as it came; the sweep says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";
import { platformWide } from "../../shared/tenant-db";

type Db = SupabaseClient<Database>;

/** What the sweep reads of a run. */
const SWEEP_RUN_COLUMNS =
  "id, tenant_id, round_id, purpose, term, state, apify_run_id, claimed_by, claimed_at, lease_owner, lease_gen, lease_until, created_at";

/** Runs in any of `states`. */
export const listRunsInStates = async (db: Db, states: string[]) =>
  platformWide(db).from("lead_runs").select(SWEEP_RUN_COLUMNS).in("state", states);

/** Runs a runner holds the lease of. */
export const listLeasedRuns = async (db: Db) =>
  platformWide(db).from("lead_runs").select(SWEEP_RUN_COLUMNS).not("lease_owner", "is", null);

/** The runs of these rounds. */
export const listRunsOfRounds = async (db: Db, roundIds: string[]) =>
  platformWide(db).from("lead_runs").select(SWEEP_RUN_COLUMNS).in("round_id", roundIds);

/** Every round that has not ended. */
export const listOpenRounds = async (db: Db) =>
  platformWide(db)
    .from("lead_rounds")
    .select("id, tenant_id, state, purpose, ending_pending, waiting_since, state_since, created_at")
    .neq("state", "ended");

/** These runs' collect jobs in any of `states`; with `carriesOnly`, only the ones the sweep wrote (seq `r…`). */
export const listCollectJobs = async (db: Db, runIds: string[], states: string[], carriesOnly: boolean) => {
  const q = db.from("jobs").select("payload, state, created_at").eq("kind", "lead_collect").in("state", states);
  return (carriesOnly ? q.like("payload->>seq", "r%") : q).in("payload->>run_id", runIds);
};

/** These rounds' own jobs of `kinds`, in any of `states`. */
export const listRoundJobs = async (db: Db, roundIds: string[], kinds: string[], states: string[]) =>
  db
    .from("jobs")
    .select("kind, payload, state, created_at")
    .in("kind", kinds)
    .in("state", states)
    .in("payload->>round_id", roundIds);

/** A run marked unknown by the runner that holds it (lead_run_mark_unknown). */
export const markLeadRunUnknown = async (db: Db, runId: string, owner: string) =>
  db.rpc("lead_run_mark_unknown", { p_run_id: runId, p_owner: owner });

/** A run's lease given back, only by its holder at its generation (lead_run_release). */
export const releaseLeadRun = async (db: Db, runId: string, owner: string, gen: number) =>
  db.rpc("lead_run_release", { p_run_id: runId, p_owner: owner, p_gen: gen });

/** A run claimed for `owner` (lead_run_claim). */
export const claimLeadRun = async (db: Db, runId: string, owner: string) =>
  db.rpc("lead_run_claim", { p_run_id: runId, p_owner: owner });

/** A round ended, for `ending` (lead_round_end). */
export const endLeadRound = async (db: Db, roundId: string, ending: string) =>
  db.rpc("lead_round_end", { p_round_id: roundId, p_ending: ending });

/** A round stuck since `since` ended, for `ending`, only if it has not moved since (lead_round_end_stuck). */
export const endStuckLeadRound = async (db: Db, roundId: string, since: string, ending: string) =>
  db.rpc("lead_round_end_stuck", { p_round_id: roundId, p_since: since, p_ending: ending });
