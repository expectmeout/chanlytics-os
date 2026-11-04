import "server-only";

/**
 * Health's read and its doors (decision 0068): what the Console's Health page draws, a subscriber's failed deliveries
 * sent again once its cause is mended, every failed job of one kind run again after an outage, a kind of background work
 * paused or resumed (decision 0089), and the error a member's page hit kept for Health to group.
 *
 * Every part is a side read: Health is opened when something is wrong, so a part that cannot be read says so (null),
 * never nothing, and never takes the page down with it. The view models decide what a null says (contracts
 * console/health.ts).
 *
 * Cross-workspace: Health reads every workspace, on the service role backOffice(ctx) hands out; the beacon keeps no
 * workspace and no person, only a short hash of who, so Health counts people without knowing them.
 */
import { createHash } from "node:crypto";
import {
  failedJobsOfKind,
  healthBacklog,
  healthClientErrors,
  healthClocks,
  healthFailedJobs,
  healthLedgerNow,
  healthPages,
  healthDraftUses,
  healthParts,
  healthSweeps,
  healthWorkspaces,
  keepClientError,
  pauseJobKind,
  recordEvent,
  redriveDeliveries,
  resumeJobKind,
} from "@chanlytics/db";
import { requeueFailedJob } from "@chanlytics/jobs";
import {
  AppError,
  callEndingOf,
  DAY_MS,
  errorIdOf,
  type ClientErrorDto,
  type ClientErrorInputDto,
  type ConsoleWhy,
  type FailedJobDto,
  type HealthClockDto,
  type HealthDto,
  type HealthPartsDto,
  type HealthWindow,
  type HealthWorkspaceDto,
  type JobKind,
  type LedgerNowDto,
  type OperatorPageDto,
} from "@chanlytics/contracts";
import { side } from "./console";
import { platformDays } from "./day-counts";
import { platformSpeed, platformVitals } from "./vitals";
import { takeAct } from "./acts";
import type { BackOffice } from "./platform";
import { serviceDb } from "../service-db";
import { log } from "@/server/log";

/** How many rows each list reads at most: more than a month of a healthy platform's, few enough to send whole. */
const HEALTH_ROWS = { workspaces: 2000, failedJobs: 200, pages: 100, clientErrors: 5000, requeueKind: 200 } as const;

/** A read's rows, or its failure thrown for side() to say. */
const healthRowsOf = <T>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  if (r.data === null) throw new Error("no answer");
  return r.data;
};

/** Every clock beside pg_cron's record of its runs, with sweep_health()'s judgement of it where that could be read. */
async function clocksRead(office: BackOffice, days: number): Promise<HealthClockDto[]> {
  const [clocks, sweeps] = await Promise.all([
    healthClocks(office.db, days).then(healthRowsOf),
    healthSweeps(office.db).then(healthRowsOf, (e: unknown) => {
      log.error("platform_console_read_failed", { read: "sweep_health", error: e });
      return null;
    }),
  ]);
  const judged = new Map((sweeps ?? []).map((s) => [s.sweep, s]));
  return clocks.map((c) => {
    const j = judged.get(c.sweep);
    return {
      sweep: c.sweep,
      jobname: c.jobname,
      schedule: c.schedule,
      judged_by: c.judged_by,
      max_silence: c.max_silence,
      last_run: c.last_run,
      runs: Number(c.runs),
      failed: Number(c.failed),
      last_failure: c.last_failure,
      healthy: sweeps === null ? null : (j?.healthy ?? null),
      detail: j?.detail ?? null,
      last_request_at: j?.last_request_at ?? null,
    };
  });
}

/** Whether platform_health_parts' answer is the shape Health reads: an object whose every list is a list. */
function isHealthParts(v: unknown): v is HealthPartsDto {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const lists = [
    "sends",
    "send_errors",
    "calls",
    "webhooks",
    "billing",
    "model",
    "model_by_workspace",
    "model_failures",
    "deliveries",
    "delivery_failures",
    "ask",
    "ask_traced",
    "ask_tools",
    "ask_by_workspace",
    "ask_failures",
    "ask_threads",
    "lines",
    "channels",
    "google",
    "mailboxes",
  ];
  return lists.every((k) => Array.isArray((v as Record<string, unknown>)[k]));
}

async function partsRead(office: BackOffice, days: number): Promise<HealthPartsDto> {
  const parts = healthRowsOf(await healthParts(office.db, days));
  if (!isHealthParts(parts)) throw new Error("platform_health_parts answered a shape Health does not read");
  // Each ending in the platform's words and what mends it, from the one table (contracts callEndingOf): the page reads
  // them off the rows, and loads no table of every ending the provider names.
  const read: HealthPartsDto = parts;
  // What the drafts came to has its own small read: a read that fails costs the line, never the page.
  const uses = await healthDraftUses(office.db, days).then(
    (r) => (r.error ? [] : (r.data ?? []).map((u) => ({ ours: u.ours, use: u.use, n: Number(u.n) }))),
    () => [],
  );
  return { ...read, draft_uses: uses, calls: read.calls.map((r) => ({ ...r, ...endingSaid(r.reason) })) };
}

/** An ending as Health says it: its words in a sentence, and what mends it where it is ours. */
function endingSaid(reason: string | null): { words: string; mend: string | null } {
  const ending = callEndingOf(reason);
  return { words: ending?.platform ?? "no reason given", mend: ending?.mend ?? null };
}

async function workspacesRead(office: BackOffice): Promise<HealthWorkspaceDto[]> {
  const rows = healthRowsOf(await healthWorkspaces(office.db, HEALTH_ROWS.workspaces));
  return rows.map((w) => ({ id: w.id, slug: w.slug, name: w.name, ours: w.ours }));
}

async function failedJobsRead(office: BackOffice, sinceIso: string): Promise<FailedJobDto[]> {
  return healthRowsOf(await healthFailedJobs(office.db, { sinceIso, limit: HEALTH_ROWS.failedJobs }));
}

async function pagesRead(office: BackOffice): Promise<OperatorPageDto[]> {
  return healthRowsOf(await healthPages(office.db, HEALTH_ROWS.pages));
}

/** The ledger now (jobs_ledger_now, 00526): by lane, by kind, and the canary's last finish. */
async function ledgerRead(office: BackOffice): Promise<LedgerNowDto> {
  const raw = healthRowsOf(await healthLedgerNow(office.db));
  const j: Record<string, unknown> = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const rows = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? v.filter((r): r is Record<string, unknown> => !!r && typeof r === "object") : [];
  const text = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return {
    lanes: rows(j.lanes).map((l) => ({
      lane: Number(l.lane),
      running: Number(l.running) || 0,
      due: Number(l.due) || 0,
      waiting: Number(l.waiting) || 0,
      expired: Number(l.expired) || 0,
      oldest_due_s: Number(l.oldest_due_s) || 0,
    })),
    kinds: rows(j.kinds).map((k) => ({
      kind: String(k.kind),
      lane: Number(k.lane),
      paused_at: text(k.paused_at),
      paused_why: text(k.paused_why),
      failed_day: Number(k.failed_day) || 0,
      done_day: Number(k.done_day) || 0,
    })),
    canary_done_at: text(j.canary_done_at),
    read_at: text(j.read_at) ?? new Date().toISOString(),
  };
}

async function backlogRead(office: BackOffice): Promise<number> {
  const due = healthRowsOf(await healthBacklog(office.db));
  return Number(due);
}

async function clientErrorsRead(office: BackOffice, sinceIso: string): Promise<ClientErrorDto[]> {
  const rows = healthRowsOf(await healthClientErrors(office.db, { sinceIso, limit: HEALTH_ROWS.clientErrors }));
  // A month of errors past the cap is itself the news; the groups count what was read, and the log says it was cut.
  if (rows.length >= HEALTH_ROWS.clientErrors)
    log.error("platform_console_read_failed", { read: "client_errors_capped" });
  return rows;
}

/**
 * GET platform/health: every part over the window, each read on its own, a failed one said as null. The nightly
 * roll-up's days, the clocks and the parts are the window's; the speed cards keep their own window (PAGE_VITALS_READ).
 */
export async function consoleHealth(office: BackOffice, days: HealthWindow, now = Date.now()): Promise<HealthDto> {
  const sinceIso = new Date(now - days * DAY_MS).toISOString();
  const [workspaces, clocks, backlog, failedJobs, ledger, pages, dayRows, parts, clientErrors, vitals, speed] =
    await Promise.all([
      side("health_workspaces", () => workspacesRead(office)),
      side("health_clocks", () => clocksRead(office, days)),
      side("health_backlog", () => backlogRead(office)),
      side("health_failed_jobs", () => failedJobsRead(office, sinceIso)),
      side("health_ledger", () => ledgerRead(office)),
      side("health_pages", () => pagesRead(office)),
      platformDays(office, days),
      side("health_parts", () => partsRead(office, days)),
      side("health_client_errors", () => clientErrorsRead(office, sinceIso)),
      platformVitals(office),
      platformSpeed(office),
    ]);
  return {
    days,
    checked_at: new Date(now).toISOString(),
    workspaces,
    clocks,
    backlog,
    failed_jobs: failedJobs,
    ledger,
    pages,
    day_rows: dayRows,
    parts,
    client_errors: clientErrors,
    vitals,
    speed,
  };
}

/**
 * Deliver again: every failed or paused delivery of one subscriber scheduled again, each once (00334). Taken once its
 * cause is mended; the Admin log has who, why and how many went.
 */
export async function healthRedrive(
  office: BackOffice,
  subscriber: string,
  why: ConsoleWhy,
): Promise<{ subscriber: string; scheduled: number }> {
  return takeAct(
    office,
    { act: "delivery_redrive", why, tenantId: null, target: "platform", targetId: subscriber },
    async () => {
      const { data, error } = await redriveDeliveries(office.db, subscriber);
      if (error)
        throw new AppError("internal", "Those deliveries could not be scheduled again. Try again in a moment.", 503);
      return { subscriber, scheduled: typeof data === "number" ? data : 0 };
    },
    (out) => ({
      outcome: "done",
      note: out.scheduled ? `${out.scheduled} scheduled again.` : "None was failed or paused.",
    }),
  );
}

/**
 * Run again, a whole kind: every job of `kind` that failed for good since `sinceIso`, after an outage mended, each once,
 * through the one press's own door (requeueFailedJob: a send, or a job that spoke, is never run again; a job already
 * run again is left; each run again is on its workspace's ledger as the staff member's act). The Admin log has who, why
 * and how many went; at most HEALTH_ROWS.requeueKind a press, oldest first.
 */
export async function healthRequeueKind(
  office: BackOffice,
  kind: JobKind,
  sinceIso: string,
  why: ConsoleWhy,
): Promise<{ kind: JobKind; requeued: number; refused: number }> {
  return takeAct(
    office,
    { act: "job_requeue_kind", why, tenantId: null, target: "platform", targetId: kind },
    async () => {
      let rows: { id: string; tenant_id: string }[];
      try {
        rows = await failedJobsOfKind(office.db, { kind, sinceIso, limit: HEALTH_ROWS.requeueKind });
      } catch {
        throw new AppError("internal", "The failed jobs could not be read. Try again in a moment.", 503);
      }
      let requeued = 0;
      let refused = 0;
      for (const row of rows) {
        const r = await requeueFailedJob(office.db, row.tenant_id, row.id, async (k) => {
          const { error } = await recordEvent(office.db, row.tenant_id, "platform.acted", "job", row.id, {
            action: `requeue:${k}`,
            by: office.userId,
            by_email: office.email,
          });
          if (error) throw new Error(error);
        }).catch(() => null);
        if (r?.outcome === "requeued") requeued += 1;
        else refused += 1;
      }
      return { kind, requeued, refused };
    },
    (out) => ({
      outcome: "done",
      note: `${out.requeued} run again${out.refused ? `, ${out.refused} left as they are` : ""}.`,
    }),
  );
}

/**
 * Pause or resume a kind of background work (00526 job_kind_pause, job_kind_resume): paused, no claim takes its rows and
 * they wait where they are; resumed, what waited is due at once. The incident lever: a provider answering garbage, a run
 * that should not go on, a handler a deploy broke. The reason is said on Health and in the Admin log.
 */
export async function healthPauseKind(
  office: BackOffice,
  kind: JobKind,
  paused: boolean,
  why: ConsoleWhy,
): Promise<{ kind: JobKind; paused: boolean }> {
  return takeAct(
    office,
    { act: "job_kind_pause", why, tenantId: null, target: "platform", targetId: kind },
    async () => {
      const { data, error } = paused
        ? await pauseJobKind(office.db, kind, [why.kind, why.ticket, why.note].filter(Boolean).join(": ").slice(0, 500))
        : await resumeJobKind(office.db, kind);
      const answered = data && typeof data === "object" && !Array.isArray(data) ? data : null;
      if (error || !answered || typeof answered.error === "string")
        throw new AppError("internal", "That kind could not be changed just now. Try again in a moment.", 503);
      return { kind, paused };
    },
    (out) => ({ outcome: "done", note: out.paused ? "Paused." : "Resumed." }),
  );
}

/** Who, as Health counts people: the first 16 hex of the sha256 of the member's id, never the id itself. */
const memberKeyOf = (userId: string) => createHash("sha256").update(userId).digest("hex").slice(0, 16);

/**
 * Keeps one error a member's page hit (client_errors, 00469): its fingerprint (the id Get help sends), the boundary,
 * the page, the first line of its words, the build and the device, and a short hash of who. Never fails the report: a
 * row that could not be kept is a line in the log, which the route writes either way.
 */
export async function keepClientErrorRow(userId: string, input: ClientErrorInputDto): Promise<boolean> {
  const { error } = await keepClientError(serviceDb(), {
    fingerprint: errorIdOf(input.page, input.name, input.message),
    boundary: input.boundary,
    page: input.page,
    name: input.name.slice(0, 120),
    message: (input.message.split(/\r?\n/)[0] ?? "").slice(0, 300),
    build: input.build ?? null,
    device: input.device ?? null,
    member_key: memberKeyOf(userId),
  });
  if (error) {
    log.warn("client_error_not_kept", { code: error.code ?? null, message: String(error.message).slice(0, 200) });
    return false;
  }
  return true;
}
