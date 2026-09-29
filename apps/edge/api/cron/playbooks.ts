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
import { logger } from "../../lib/log.js";
import { playbooksDue, reachOutsDue, noteBacklog, PLAYBOOKS_PER_TICK } from "../../lib/ops/sweep-rotation.js";
import { loadTenantRunContext, runPlaybook, type PlaybookRow } from "../../lib/playbooks.js";
import type { ReachOutRow } from "../../lib/reach-out/run-context.js";
import { runReachOutStep } from "../../lib/reach-out/run-step.js";
import { tellReachOutDays } from "../../lib/reach-out/day-numbers.js";
import { stampReachOutStep, tenantZoneOf } from "../../lib/packages/db.js";
import { localDate, runDueNow, type PlaybookDto } from "../../lib/packages/contracts.js";

/** When the reach-outs stop for the tick: what is left runs next hour, as a step is due all day from its hour. */
export const REACH_OUT_YIELD_AT_MS = 40_000;
/** When the day's reach-out lines at 6 PM stop being written for the tick: inside the function's sixty seconds. */
const REACH_OUT_DAY_UNTIL_MS = 50_000;

export async function POST(request: Request): Promise<Response> {
  const started = Date.now();
  const L = logger({ sweep: "playbooks" });
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const denied = await authorizeCron(request, db, L);
  if (denied) return denied;

  const now = new Date();
  // A BOUNDED, ROTATING page, least-recently-run first. This read every running
  // playbook and iterated, serially, inside a sixty-second function -- and it
  // SENDS, so running out of tick past a few hundred workspaces meant the ones
  // at the end of an unchanging order never ran at all. last_run_at has been on
  // this table since 00048; it simply was not used to order anything.
  let page;
  try {
    page = await playbooksDue(db, PLAYBOOKS_PER_TICK);
  } catch (e) {
    L.error("playbooks_read_failed", { error: e instanceof Error ? e.message : String(e) });
    return json(500, { ok: false });
  }
  const byTenant = new Map<string, PlaybookRow[]>();
  for (const p of page.rows as PlaybookRow[]) byTenant.set(p.tenant_id, [...(byTenant.get(p.tenant_id) ?? []), p]);

  const out = { tenants: 0, due: 0, sent: 0, held: 0, empty: 0, off: 0, failed: 0, remaining: page.remaining, told: 0 };
  for (const [tenantId, rows] of byTenant) {
    const { data: tenant } = await db.from("tenants").select("timezone").eq("id", tenantId).maybeSingle();
    const tz = tenant?.timezone || "America/New_York";
    const due = rows.filter((p) => runDueNow(p as unknown as PlaybookDto, tz, now));
    if (due.length === 0) continue;
    out.tenants += 1;
    out.due += due.length;
    const ctx = await loadTenantRunContext(db, tenantId, now);
    if ("error" in ctx && ctx.error === "paused") {
      L.info("playbooks_skip_paused", { tenant_id: tenantId, due: due.length });
      out.off += due.length;
      continue;
    }
    if ("error" in ctx) {
      L.error("playbooks_context_failed", { tenant_id: tenantId, error: ctx.error });
      out.failed += due.length;
      continue;
    }
    const runFor = localDate(tz, now);
    for (const p of due) {
      const r = await runPlaybook(ctx, p, { runFor, by: { kind: "system" } });
      if (r.outcome === "failed") L.error("playbook_run_failed", { playbook_id: p.id, error: r.error });
      out[r.outcome] += 1;
    }
  }
  // Reach-outs (Part 3): each step on its day and hour, as a moment is, through its own verb. A step that ran is stamped
  // for the day. One that could not (its workspace paused, its chain broken, a read or a write that failed) keeps its
  // day open, so the next hour tries it again, but moves to the back of the page: it never holds a place a step that
  // can run is waiting for.
  const reach = await reachOutsDue(db, PLAYBOOKS_PER_TICK).catch((e: unknown) => {
    L.error("reach_outs_read_failed", { error: e instanceof Error ? e.message : String(e) });
    return { rows: [], remaining: 0 };
  });
  out.remaining += reach.remaining;
  const zones = new Map<string, string>();
  const steps: ReachOutRow[] = reach.rows;
  for (const [i, row] of steps.entries()) {
    if (Date.now() - started > REACH_OUT_YIELD_AT_MS) {
      L.info("reach_outs_yielded", { left: steps.length - i });
      break;
    }
    if (!zones.has(row.tenant_id)) {
      zones.set(row.tenant_id, (await tenantZoneOf(db, row.tenant_id)) || "America/New_York");
    }
    const tz = zones.get(row.tenant_id) ?? "America/New_York";
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
  // The day's reach-out numbers at 6 PM in each business's zone (Reach out Part 6, H12): a line in the bell, once.
  out.told = await tellReachOutDays(db, now, L, started + REACH_OUT_DAY_UNTIL_MS);
  // `remaining` counts RUNNING playbooks past the page, and due-ness is judged
  // here, in the tenant's own zone, AFTER paging — so this over-reports: a
  // deployment with twenty-six daily playbooks says five were left behind
  // every hour, including the twenty-three hours when none of them was due,
  // and from the third tick calls itself broken.
  //
  // A NOISY ALARM IS KEPT OVER A SILENT ONE. Gating it on the page being all
  // due (`out.due >= PLAYBOOKS_PER_TICK`) was tried and is worse: a playbook
  // whose hour has not arrived still carries yesterday's `last_run_at`, so it
  // sorts to the front and holds a slot while never being due, one such row
  // makes the page not-all-due, and `note_sweep_backlog` then RESETS the
  // counter — which makes the alarm unreachable in any deployment with mixed
  // run hours, exactly where starvation is real. The fix is a due-aware page:
  // `playbooksDue` can exclude what already ran today (`last_run_for`), but
  // "not yet at its hour" is per-tenant-timezone and needs the query to know
  // the zone. Until then the sweep is loud rather than deaf.
  const backlog = await noteBacklog(db, "playbooks", page.remaining + reach.remaining);
  L.info("playbooks_swept", { ...out, backlog_ticks: backlog.ticks });
  // Three consecutive ticks with playbooks left unread is a campaign nobody
  // sent. sweep_health turns that red and mails the platform.
  if (backlog.alarm) {
    return json(503, { ok: false, error: "playbooks_backlog", backlog_ticks: backlog.ticks, ...out });
  }
  return json(200, { ok: true, ...out });
}
