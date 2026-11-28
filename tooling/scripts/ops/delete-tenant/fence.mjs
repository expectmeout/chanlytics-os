/**
 * A workspace's work stopped before its rows are deleted (tooling/scripts/ops/delete-tenant.mjs).
 *
 * The fence is Stop everything (tenants.sending_stopped_at, written through its own door, workspace_sending_stop): from
 * then nothing goes out by itself, no post goes up and no ad is turned on. Stop does not reach the job ledger's claim,
 * so a queued job of any other kind (a video's copy put on the shelf, a lead round, an email's intake) would still
 * start. So the workspace's queued jobs are withdrawn here, scheduled to canceled, the move the ledger's own guard
 * allows and the cascade is about to make anyway, and the delete waits until none is running.
 *
 * What this does not close: a job handed out and claimed in the seconds between the last look at the ledger and the
 * delete itself. Closing that takes a refusal at the claim (claim_due_jobs), which is a migration and is not here.
 *
 * Plain Node, as the script is: it imports nothing of the app's.
 */
import { setTimeout as sleep } from "node:timers/promises";

/** How often the ledger is looked at while a job of the workspace is still running. */
const LEDGER_LOOK_MS = 5_000;
/** The looks a wait is cut into at the least, so a short wait still looks more than once. */
const LOOKS_IN_A_WAIT = 10;
/** The jobs a refusal names, of however many are left. */
const NAMED = 10;

/** Stop everything on the workspace's own row, unless it stands already. Answers `{ error }`, or `{ already }`. */
export async function stop(db, tenant, nowMs = Date.now()) {
  if (tenant.sending_stopped_at) return { already: tenant.sending_stopped_at, error: null };
  const { data, error } = await db.rpc("workspace_sending_stop", {
    p_tenant_id: tenant.id,
    p_at: new Date(nowMs).toISOString(),
  });
  if (error) return { error: error.message };
  return data === true ? { already: null, error: null } : { error: "the stop's door found no such workspace" };
}

/** The workspace's queued jobs withdrawn: scheduled to canceled. Answers how many. */
async function withdraw(db, tenantId) {
  const { count, error } = await db
    .from("jobs")
    .update({ state: "canceled" }, { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("state", "scheduled");
  return error ? { withdrawn: 0, error: error.message } : { withdrawn: count ?? 0, error: null };
}

/** The workspace's jobs that wait or run: how many, and the first few by name. */
export async function ledgerOf(db, tenantId) {
  const { data, count, error } = await db
    .from("jobs")
    .select("id, kind, state, due_at, fired_at, lease_until", { count: "exact" })
    .eq("tenant_id", tenantId)
    .in("state", ["scheduled", "fired"])
    .order("due_at", { ascending: true })
    .limit(NAMED);
  if (error) return { live: 0, jobs: [], error: error.message };
  return { live: count ?? (data ?? []).length, jobs: data ?? [], error: null };
}

/** A job as a refusal names it. */
export const jobWords = (job) =>
  job.state === "fired"
    ? `${job.kind}, running since ${job.fired_at ?? "a time not kept"} (its hold ends ${job.lease_until ?? "at no time kept"})`
    : `${job.kind}, queued for ${job.due_at}`;

/**
 * The workspace's queued jobs withdrawn and its running ones waited for, a look at a time, until its ledger holds
 * neither or `waitMs` is past. Answers `{ withdrawn, live, jobs, error }`: `live` is what was still there at the end.
 */
export async function drain(db, tenantId, waitMs) {
  const pause = Math.max(Math.min(LEDGER_LOOK_MS, waitMs / LOOKS_IN_A_WAIT), 1);
  const until = Date.now() + waitMs;
  let withdrawn = 0;
  for (;;) {
    // Every look withdraws again: a run that threw puts its job back to wait, and a clock may hand out another.
    const took = await withdraw(db, tenantId);
    if (took.error) return { withdrawn, live: 0, jobs: [], error: took.error };
    withdrawn += took.withdrawn;
    const look = await ledgerOf(db, tenantId);
    if (look.error || !look.live || Date.now() >= until) return { withdrawn, ...look };
    await sleep(pause);
  }
}
