/**
 * What the platform's health reads and marks (decision 0111): each sweep's last run against its clock, the job
 * ledger's backlog, the numbers drifted from their rows, the day's answers gone quiet, and the sweeps an alert went out
 * for. Platform doors, of no workspace. Each answer is the database's as it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";
import { platformWide } from "../../shared/tenant-db";

type Db = SupabaseClient<Database>;
/** The door calls alone: what the health judgement takes, so a test can hand it a fake that answers them. */
type Doors = Pick<Db, "rpc">;

/** Each sweep's last run against its clock (sweep_health). */
export const readSweepHealth = async (db: Doors) => db.rpc("sweep_health");

/** The job ledger's backlog (jobs_backlog). */
export const readJobsBacklog = async (db: Doors) => db.rpc("jobs_backlog");

/** The numbers whose rows and provider disagree (number_drift). */
export const readNumberDrift = async (db: Db) => db.rpc("number_drift");

/** The workspaces whose receptionist went quiet on `day` (platform_answer_silence). */
export const readAnswerSilence = async (db: Db, day: string) => db.rpc("platform_answer_silence", { p_day: day });

/** The sweeps an alert went out for, and the ones healthy again, marked (sweep_mark_alerted). */
export const markSweepsAlerted = async (db: Db, alerted: string[], healthy: string[]) =>
  db.rpc("sweep_mark_alerted", { p_alerted: alerted, p_healthy: healthy });

/** The newest knocks on the voice webhook, signed or not, `limit` of them, whichever workspace's. */
export const listWebhookAuths = async (db: Db, limit: number) =>
  platformWide(db)
    .from("events")
    .select("created_at, data")
    .eq("kind", "webhook.auth")
    .order("created_at", { ascending: false })
    .limit(limit);

/** The newest deliveries on the voice webhook and what each did, `limit` of them, whichever workspace's. */
export const listWebhookDeliveries = async (db: Db, limit: number) =>
  platformWide(db)
    .from("events")
    .select("created_at, subject_id, data")
    .eq("kind", "webhook.delivery")
    .order("created_at", { ascending: false })
    .limit(limit);
