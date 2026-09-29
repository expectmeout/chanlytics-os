/**
 * The playbooks sweep: every hour, every running playbook whose hour it is
 * by the business's clock runs once for the day. The run itself is
 * lib/playbooks.ts, shared with "Run now" on the page.
 *
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps.
 * Same-origin is not a question here; pg_cron calls this from the database.
 */
import { json, refuse } from "../../lib/http.js";
import { authorizeCron } from "../../lib/cron-auth.js";
import { pg } from "../../lib/pg.js";
import { logger, type Logger } from "../../lib/log.js";
import {
  playbooksDue,
  reachOutsDue,
  noteBacklog,
  PLAYBOOKS_PER_TICK,
  type DuePage,
  type DuePlaybook,
} from "../../lib/ops/sweep-rotation.js";
import { loadTenantRunContext, runPlaybook, type PlaybookRow } from "../../lib/playbooks.js";
import { runReachOutStep } from "../../lib/reach-out/run-step.js";
import { stampPlaybooksTried, stampReachOutStep } from "../../lib/packages/db.js";
import { localDate, runDueNow, type PlaybookDto } from "../../lib/packages/contracts.js";

/** When the reach-outs stop for the tick: what is left runs next hour, as a step is due all day from its hour. */
export const REACH_OUT_YIELD_AT_MS = 40_000;

type SweepCounts = Record<"tenants" | "due" | "sent" | "held" | "empty" | "off" | "failed" | "remaining", number>;

/** One tick: its database, its moment, its log, what it has counted so far, and when it began. */
interface Tick {
  db: NonNullable<ReturnType<typeof pg>>;
  now: Date;
  L: Logger;
  out: SweepCounts;
  started: number;
}

/**
 * The moments on the page, a workspace at a time. The page's word is the database's (00245 playbooks_due, which
 * leaves a paused workspace out); the run keeps the same rule (runDueNow) at the moment it runs, as "Run now" does. A
 * due moment that could not run -- its workspace paused since the page was read, its context unreadable -- keeps its
 * day open, so the next hour tries it again, but moves to the back of the page: it never holds a place a moment that
 * can run is waiting for.
 */
async function runMoments({ db, now, L, out }: Tick, page: DuePage<DuePlaybook>) {
  // By workspace, each with the zone the page judged it in: a workspace is read once for all its playbooks.
  const byTenant = new Map<string, { tz: string; rows: PlaybookRow[] }>();
  for (const { playbook, timezone } of page.rows) {
    const t = byTenant.get(playbook.tenant_id) ?? { tz: timezone, rows: [] };
    t.rows.push(playbook as PlaybookRow);
    byTenant.set(playbook.tenant_id, t);
  }
  // A stamp that fails leaves the moment where it was: the next tick tries it first again, and nothing is lost.
  const tried = (tenantId: string, rows: PlaybookRow[]) =>
    stampPlaybooksTried(db, tenantId, { ids: rows.map((p) => p.id), at: now }).catch(() => undefined);
  for (const [tenantId, { tz, rows }] of byTenant) {
    const due = rows.filter((p) => runDueNow(p as unknown as PlaybookDto, tz, now));
    if (due.length === 0) continue;
    out.tenants += 1;
    out.due += due.length;
    const ctx = await loadTenantRunContext(db, tenantId, now);
    if ("error" in ctx) {
      if (ctx.error === "paused") {
        L.info("playbooks_skip_paused", { tenant_id: tenantId, due: due.length });
        out.off += due.length;
      } else {
        L.error("playbooks_context_failed", { tenant_id: tenantId, error: ctx.error });
        out.failed += due.length;
      }
      await tried(tenantId, due);
      continue;
    }
    const runFor = localDate(tz, now);
    for (const p of due) {
      const r = await runPlaybook(ctx, p, { runFor, by: { kind: "system" } });
      if (r.outcome === "failed") L.error("playbook_run_failed", { playbook_id: p.id, error: r.error });
      out[r.outcome] += 1;
    }
  }
}

/**
 * Reach-outs (Part 3): each step on its day and hour, as a moment is, through its own verb, in the zone the page judged
 * it in. A step that ran is stamped for the day. One that could not (its workspace paused, its chain broken, a read or
 * a write that failed) keeps its day open, so the next hour tries it again, but moves to the back of the page: it never
 * holds a place a step that can run is waiting for.
 */
async function runReachOuts({ db, now, L, out, started }: Tick, reach: DuePage<DuePlaybook>) {
  for (const [i, { playbook: row, timezone: tz }] of reach.rows.entries()) {
    if (Date.now() - started > REACH_OUT_YIELD_AT_MS) {
      L.info("reach_outs_yielded", { left: reach.rows.length - i });
      break;
    }
    if (!runDueNow(row as unknown as PlaybookDto, tz, now)) continue;
    out.due += 1;
    try {
      const r = await runReachOutStep(db, row, now, tz, L);
      if (r.outcome === "failed") L.error("reach_out_context_failed", { playbook_id: row.id, error: r.reason });
      out[r.outcome] += 1;
    } catch (e) {
      L.error("reach_out_run_failed", { playbook_id: row.id, error: e instanceof Error ? e.message : String(e) });
      out.failed += 1;
      await stampReachOutStep(db, row.id, { at: now }).catch(() => undefined);
    }
  }
}

export async function POST(request: Request): Promise<Response> {
  const started = Date.now();
  const L = logger({ sweep: "playbooks" });
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const denied = await authorizeCron(request, db, L);
  if (denied) return denied;

  const now = new Date();
  // A BOUNDED, ROTATING page OF WHAT IS DUE, least-recently-run first, judged
  // in the database by each workspace's own clock (00245 playbooks_due). This
  // once read every running playbook and iterated, serially, inside a
  // sixty-second function -- and it SENDS, so running out of tick past a few
  // hundred workspaces meant the ones at the end of an unchanging order never
  // ran at all. Then it read a page of running playbooks and judged due-ness
  // after, so a due one waited behind a page of ones that had run today, were
  // hours from their hour or belonged to a paused workspace -- twenty-five of
  // a paused workspace's held the page for every workspace on the platform --
  // and what it said it could not reach counted those too. Now the page holds
  // only what is due, and `remaining` only what is due beyond it.
  let page: DuePage<DuePlaybook>;
  try {
    page = await playbooksDue(db, now, PLAYBOOKS_PER_TICK);
  } catch (e) {
    L.error("playbooks_read_failed", { error: e instanceof Error ? e.message : String(e) });
    return json(500, { ok: false });
  }
  const out: SweepCounts = {
    tenants: 0,
    due: 0,
    sent: 0,
    held: 0,
    empty: 0,
    off: 0,
    failed: 0,
    remaining: page.remaining,
  };
  const tick: Tick = { db, now, L, out, started };
  await runMoments(tick, page);

  const reach = await reachOutsDue(db, now, PLAYBOOKS_PER_TICK).catch((e: unknown): DuePage<DuePlaybook> => {
    L.error("reach_outs_read_failed", { error: e instanceof Error ? e.message : String(e) });
    return { rows: [], remaining: 0 };
  });
  out.remaining += reach.remaining;
  await runReachOuts(tick, reach);

  // `remaining` counts what was DUE and beyond the two pages, judged in the
  // database in each workspace's own zone (00245): a playbook that ran today,
  // one whose hour has not come and a paused workspace's are not in it. So
  // three ticks in a row with a remainder is a queue of due work the sweep is
  // not draining, and nothing else -- the alarm it raises can be believed.
  const backlog = await noteBacklog(db, "playbooks", page.remaining + reach.remaining);
  L.info("playbooks_swept", { ...out, backlog_ticks: backlog.ticks });
  // Three consecutive ticks with playbooks left unread is a campaign nobody
  // sent. sweep_health turns that red and mails the platform.
  if (backlog.alarm) {
    return json(503, { ok: false, error: "playbooks_backlog", backlog_ticks: backlog.ticks, ...out });
  }
  return json(200, { ok: true, ...out });
}
