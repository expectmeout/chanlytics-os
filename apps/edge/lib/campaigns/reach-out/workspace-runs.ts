/**
 * One workspace's campaigns, run as one job (decision 0115): the sweep found them due and handed the workspace a job
 * (campaign_moments or reach_out_steps), and the ledger gave it its turn. A workspace's moments are read and run together,
 * so a second moment in the same hour keeps the week's breath with the first one's people in it, and its reach-out steps
 * run in the order a mailbox's day needs.
 *
 * What is due is asked again here, of the workspace alone, when the job runs: a moment run by "Run now" since the sweep, or
 * one a paused workspace may not start, is not run. What a job does not reach before its deadline stays due, and the next
 * hour's sweep hands the workspace another job.
 */
import { localDate, runDueNow, type TenantId } from "@chanlytics/contracts";
import { stampReachOutStep } from "@chanlytics/db/campaigns";
import { stampPlaybooksTried } from "@chanlytics/db/jobs";
import { logAndGoOn } from "@chanlytics/log";
import type { pg } from "../../shared/pg.js";
import { logger, type Logger } from "../../shared/log.js";
import { listPlaybooksDue, listReachOutsDue, type DueStep } from "../../shared/sweep-rotation.js";
import { CONTEXT_PAUSED, loadTenantRunContext, runPlaybook, type PlaybookRow } from "../playbooks/playbooks.js";
import { tellPlaybookFailed } from "./playbook-failed.js";
import { runReachOutStep } from "./run-step.js";

type Db = NonNullable<ReturnType<typeof pg>>;

/** The most of a workspace's moments, or of its steps, one job takes up: what is beyond them runs the next hour. */
const CAMPAIGNS_A_JOB = 100;

/** What a job came to, for its log line. */
type RunCounts = Record<"due" | "sent" | "held" | "empty" | "off" | "failed" | "remaining", number>;

const noCounts = (): RunCounts => ({ due: 0, sent: 0, held: 0, empty: 0, off: 0, failed: 0, remaining: 0 });

/** One workspace's job: its database, its moment, its log, and when it stops starting anything. */
interface WorkspaceTurn {
  db: Db;
  tenantId: TenantId;
  now: Date;
  until: number;
  log: Logger;
}

/**
 * A workspace's due moments. The page's word is the database's (sequence_steps_due); the run keeps the same rule (runDueNow)
 * at the moment it runs, as "Run now" does. A due moment that could not run (its workspace paused since the page was read,
 * its context unreadable, its run failed) keeps its day open, so the next hour tries it again, but moves to the back of the
 * page: it never holds a place a moment that can run is waiting for. So does one the page called due and the edge's clock
 * does not (a zone the two read apart). A context that could not be read and a run that failed are told
 * (playbooks/failed.ts). They run against one read of the workspace, and each run adds its people to that read's touches
 * (core runPlaybook).
 */
async function runWorkspaceMoments({ db, tenantId, now, until, log }: WorkspaceTurn): Promise<RunCounts> {
  const out = noCounts();
  const page = await listPlaybooksDue(db, now, CAMPAIGNS_A_JOB, tenantId);
  out.remaining = page.remaining;
  const tz = page.rows.at(0)?.timezone;
  if (tz === undefined) return out;
  const rows = page.rows.map(({ step }) => step as PlaybookRow);
  // A stamp that fails leaves the moment where it was: the next hour tries it first again, and the log says so.
  const tried = async (ran: PlaybookRow[]) => {
    await stampPlaybooksTried(db, tenantId, { ids: ran.map((p) => p.id), at: now }).catch((e: unknown) =>
      log.error("playbooks_stamp_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) }),
    );
  };
  const due = rows.filter((p) => runDueNow(p, tz, now));
  const disputed = rows.filter((p) => !due.includes(p));
  if (disputed.length > 0) {
    log.warn("playbooks_page_not_due", { tenant_id: tenantId, tz, kind: "moment", count: disputed.length });
    await tried(disputed);
  }
  if (due.length === 0) return out;
  out.due = due.length;
  const runFor = localDate(tz, now);
  const told = (playbooks: readonly PlaybookRow[], error: string) =>
    tellPlaybookFailed({ db, L: log, tenantId, tz, now, runFor, playbooks, error });
  const ctx = await loadTenantRunContext(db, tenantId, now);
  if ("error" in ctx) {
    if (ctx.error === CONTEXT_PAUSED) {
      log.info("playbooks_skip_paused", { tenant_id: tenantId, due: due.length });
      out.off = due.length;
    } else {
      log.error("playbooks_context_failed", { tenant_id: tenantId, error: ctx.error });
      out.failed = due.length;
      await told(due, ctx.error);
    }
    await tried(due);
    return out;
  }
  for (const [i, p] of due.entries()) {
    if (Date.now() > until) {
      log.info("playbooks_yielded", { tenant_id: tenantId, left: due.length - i });
      out.remaining += due.length - i;
      return out;
    }
    const result = await runPlaybook(ctx, p, { runFor, by: { kind: "system" } });
    if (result.outcome === "failed") {
      // A failed run records nothing on the row, so untouched it would stand first again next hour.
      log.error("playbook_run_failed", { playbook_id: p.id, error: result.error });
      await tried([p]);
      await told([p], result.error);
    }
    out[result.outcome] += 1;
  }
  return out;
}

/**
 * A workspace's due reach-out steps, each on its day and hour through its own verb, in the zone the page judged it in. A step
 * that ran is stamped for the day. One that could not (its workspace paused, its chain broken, a read or a write that failed,
 * a zone the page and the edge read apart) keeps its day open, so the next hour tries it again, but moves to the back of the
 * page. A chain's steps after the first run before first emails (the lead workbench's call 10: follow-ups first), so a nudge
 * takes its place in a mailbox's day, and in its owner's day's share (00429), before new leads fill it.
 */
async function runWorkspaceSteps({ db, tenantId, now, until, log }: WorkspaceTurn): Promise<RunCounts> {
  const out = noCounts();
  const page = await listReachOutsDue(db, now, CAMPAIGNS_A_JOB, tenantId);
  out.remaining = page.remaining;
  const rows: DueStep[] = [...page.rows].sort(
    (a, b) => Number(a.step.after_step_id === null) - Number(b.step.after_step_id === null),
  );
  for (const [i, { step: row, timezone: tz }] of rows.entries()) {
    if (Date.now() > until) {
      log.info("reach_outs_yielded", { tenant_id: tenantId, left: rows.length - i });
      out.remaining += rows.length - i;
      return out;
    }
    if (!runDueNow(row, tz, now)) {
      log.warn("playbooks_page_not_due", { tenant_id: tenantId, tz, kind: "reach_out", count: 1 });
      await stampReachOutStep(db, row.id, { at: now }).catch(logAndGoOn("stampReachOutStep"));
      continue;
    }
    out.due += 1;
    try {
      const r = await runReachOutStep(db, row, now, tz, log);
      if (r.outcome === "failed") log.error("reach_out_context_failed", { playbook_id: row.id, error: r.reason });
      out[r.outcome] += 1;
    } catch (e) {
      log.error("reach_out_run_failed", { playbook_id: row.id, error: e instanceof Error ? e.message : String(e) });
      out.failed += 1;
      await stampReachOutStep(db, row.id, { at: now }).catch(logAndGoOn("stampReachOutStep"));
    }
  }
  return out;
}

/** The two kinds as the job runner takes them: each says what it came to in one line. */
export function campaignRuns(db: Db) {
  const turnOf = (tenantId: TenantId, deadline: number): WorkspaceTurn => ({
    db,
    tenantId,
    now: new Date(),
    until: deadline,
    log: logger({ tenant_id: tenantId, sweep: "playbooks" }),
  });
  return {
    moments: async (job: { tenant_id: TenantId }, deadline: number): Promise<RunCounts> => {
      const turn = turnOf(job.tenant_id, deadline);
      const counts = await runWorkspaceMoments(turn);
      turn.log.info("campaign_moments_ran", counts);
      return counts;
    },
    steps: async (job: { tenant_id: TenantId }, deadline: number): Promise<RunCounts> => {
      const turn = turnOf(job.tenant_id, deadline);
      const counts = await runWorkspaceSteps(turn);
      turn.log.info("reach_out_steps_ran", counts);
      return counts;
    },
  };
}
