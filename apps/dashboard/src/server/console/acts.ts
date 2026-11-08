import "server-only";

/**
 * The Admin log (decision 0066): every act the Console's staff take is written down, with who, their role, the act,
 * where and why, BEFORE it runs, and what came of it after.
 *
 * The order is the point, as it was for the line actions' `platform.acted` event: an act on somebody else's business
 * that nobody can be held to is worse than one that did not happen, so a row that cannot be written stops the act. The
 * outcome is written after; one that cannot be written is logged, not thrown, since the act has happened and the row
 * already says it was begun.
 *
 * Cross-workspace: the Console's own log; written and read through the service role backOffice(ctx) hands out.
 */
import { finishAct, listActs, startAct } from "@chanlytics/db/console";
import {
  ACT_LOG_PAGE,
  ACT_OUTCOMES,
  ACT_TARGETS,
  AppError,
  CONSOLE_ACT_KEYS,
  REASON_KINDS,
  STAFF_ROLES,
  staffCannotWords,
  staffMay,
  type ActOutcome,
  type ActTarget,
  type ConsoleAct,
  type ConsoleWhy,
  type PlatformActDto,
} from "@chanlytics/contracts";
import type { BackOffice } from "../shared/back-office";
import { log } from "@/server/shared/log";
import { NOT_RECORDED } from "@/server/console/words";
import type { TenantId } from "@chanlytics/contracts";

/** What an act is taken on, and why. */
interface ActOn {
  act: ConsoleAct;
  why: ConsoleWhy;
  tenantId: TenantId | null;
  target: ActTarget;
  targetId: string | null;
}

/** What came of an act that ran to its end: done, or refused with the reason a door gave in its answer. */
interface ActVerdict {
  outcome: Exclude<ActOutcome, "running">;
  note: string | null;
}

/**
 * A role may take this act, or the route refuses before anything is written (decision 0066). The Console draws only
 * what a role may take; this is the door behind the drawing.
 */
function requireStaff(office: BackOffice, act: ConsoleAct): void {
  if (!staffMay(office.role, act)) throw new AppError("forbidden", staffCannotWords(office.role, act), 403);
}

/**
 * What the log keeps of a throw: our own words when it is ours (an AppError), else a line that points to the server's
 * log, where the route writes the error itself. The log outlives the workspace (00467), so a database's words, which can
 * quote a row's values, are not copied into it.
 */
const thrownWords = (e: unknown): string =>
  e instanceof AppError ? e.message : "It broke on our side. The server's log has what happened, at this time.";

/**
 * Take an act: the role is asked, the row written, then `run`; its answer is judged (done, unless `judge` says the door
 * refused it in its answer), and a throw is refused when it is the person's to mend (a 4xx) and failed otherwise.
 */
export async function takeAct<T>(
  office: BackOffice,
  on: ActOn,
  run: () => Promise<T>,
  judge?: (out: T) => ActVerdict,
): Promise<T> {
  requireStaff(office, on.act);
  const started = await startAct(office.db, {
    actor_id: office.userId,
    actor_email: office.email,
    actor_role: office.role,
    act: on.act,
    tenant_id: on.tenantId,
    target_kind: on.target,
    target_id: on.targetId,
    reason_kind: on.why.kind,
    ticket: on.why.ticket,
    note: on.why.note,
    outcome: "running",
  });
  if (started.error || !started.data) throw new AppError("internal", NOT_RECORDED, 503);
  const id = started.data.id;
  const finish = (verdict: ActVerdict) =>
    finishAct(office.db, id, verdict.outcome, verdict.note, new Date().toISOString()).then(
      (r) => {
        if (r.error)
          log.error("platform_act_unfinished", { tenant_id: on.tenantId, act: on.act, error: r.error.message });
      },
      (e: unknown) => log.error("platform_act_unfinished", { tenant_id: on.tenantId, act: on.act, error: e }),
    );
  let out: T;
  try {
    out = await run();
  } catch (e) {
    const refused = e instanceof AppError && e.status < 500;
    await finish({ outcome: refused ? "refused" : "failed", note: thrownWords(e) });
    throw e;
  }
  await finish(judge ? judge(out) : { outcome: "done", note: null });
  return out;
}

/** How many rows the CSV holds: more than a page, for the record. */
const LOG_CSV = 2000;

export const inSet = <T extends string>(set: readonly T[], v: unknown, fallback: T): T =>
  (set as readonly unknown[]).includes(v) ? (v as T) : fallback;

/** A page of the log, as the contracts read it: one person's or everyone's, one workspace's or all, older than `before`. */
export async function listConsoleActs(
  office: BackOffice,
  input: { who?: string; tenantId?: TenantId; before?: string; csv?: boolean },
): Promise<PlatformActDto[]> {
  const { data, error } = await listActs(office.db, {
    ...(input.who ? { who: input.who } : {}),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    ...(input.before ? { before: input.before } : {}),
    limit: input.csv ? LOG_CSV : ACT_LOG_PAGE,
  });
  if (error) throw new AppError("internal", "The log could not be read just now. Try again in a moment.", 503);
  return (data ?? []).map((items) => ({
    id: items.id,
    at: items.at,
    actor_id: items.actor_id,
    actor_email: items.actor_email,
    actor_role: inSet(STAFF_ROLES, items.actor_role, "support"),
    act: inSet(CONSOLE_ACT_KEYS, items.act, items.act as ConsoleAct),
    tenant_id: items.tenant_id,
    slug: items.tenant?.slug ?? null,
    name: items.tenant?.name ?? null,
    target_kind: inSet(ACT_TARGETS, items.target_kind, "platform"),
    target_id: items.target_id,
    reason_kind: inSet(REASON_KINDS, items.reason_kind, "found"),
    ticket: items.ticket,
    note: items.note,
    outcome: inSet(ACT_OUTCOMES, items.outcome, "failed"),
    outcome_note: items.outcome_note,
    finished_at: items.finished_at,
  }));
}
