/**
 * The lines sweep: every quarter hour, a line that has been "setting up" longer
 * than a line can legitimately take is resumed where it stopped.
 *
 * WHY THIS EXISTS. The saga runs inside its own request, and that request is capped
 * at 60 seconds (apps/edge/vercel.json) while the saga makes ten Twilio calls at a
 * 15-second timeout each plus four Retell calls at eight — about 180 seconds worst
 * case, three times the ceiling. So a run is killed not by a crash but by a slow
 * afternoon at the provider, and a killed run never reaches the `catch` that would
 * have written `voice_state: 'failed'`.
 *
 * Everything then refused to touch it. No sweep read `lines` for this; `retry`
 * demanded `failed`; `buy` refused because a line already existed; `number_drift()`
 * deliberately exempts a line still being set up; the Setup row said "usually a
 * minute or two" with no button, for ever. The only exit was a platform admin
 * handing the number back — permanently — so the owner could buy a different one.
 *
 * WHY A SWEEP RATHER THAN A JOB. The jobs ledger would have been the tidier home,
 * and it already takes back a run that died. But `JobContext` is `{ db, waCfg,
 * sms, alert }` — it holds no master carrier account, no line provider and no
 * access to a line's credentials in Vault. Putting the saga there means moving
 * provider credentials out of the edge, which is the one place they deliberately
 * live, on the one path that spends money. The saga is ALREADY resumable —
 * `nextLineStep` derives the whole plan from the row's own receipts — so all that
 * was ever missing was something to call it.
 *
 * THE SECOND HALF: a number whose subscription ended is given back after a grace
 * (lib/lines/line-release.ts, contracts' lineReleaseStep). It only reports until
 * LINE_RELEASE_AFTER_DAYS is set, because a release cannot be undone.
 *
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps;
 * pg_cron calls this from the database (migration 00097).
 */
import { json, refuse } from "../../lib/http.js";
import { authorizeCron } from "../../lib/cron-auth.js";
import { pg } from "../../lib/pg.js";
import { logger } from "../../lib/log.js";
import { lineProviderFromEnv } from "../../lib/lines/lines.js";
import { notify } from "../../lib/ops/notify.js";
import { loadTenantNotifications } from "../../lib/tenant-runtime.js";
import { dashboardOrigin } from "../../lib/dashboard-origin.js";
import { releaseLine, sweepEndedLines, type EndedLinesResult } from "../../lib/lines/line-release.js";
import { lineReleaseAfterDays } from "../../lib/packages/contracts.js";
import { reportLineFailed } from "../../lib/lines/provision.js";
import { scheduleJob } from "../../lib/packages/jobs.js";
import { sweepStuckLines } from "../../lib/lines/line-resume.js";
import { env } from "../../lib/env.js";

/**
 * A bound per tick, and a small one.
 *
 * Each resume is a whole saga — up to fourteen provider calls — so one tick can
 * only honestly carry a couple inside its own 60 seconds. A backlog drains over
 * successive quarter hours rather than being half-run and killed again, which is
 * the failure this sweep exists to clean up and must not reproduce.
 */
const MAX_PER_TICK = 2;

export async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "lines" });
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const denied = await authorizeCron(request, db, L);
  if (denied) return denied;

  // The provider and the receptionist's credentials, exactly as the writing ops
  // check them. A tick that cannot provision must say so rather than reporting a
  // clean sweep over lines it never looked at.
  const choice = lineProviderFromEnv();
  const apiKey = env.RETELL_API_KEY;
  const fnSecret = env.RETELL_FN_SECRET;
  if (!choice) return refuse(503, "no_line_provider");
  if (!apiKey || !fnSecret) return refuse(503, !apiKey ? "no_provider_key" : "no_fn_secret");

  // The decisions -- which lines, whether each is still owed an automatic try, the
  // take that makes a resume exclusive, when the platform hears -- live in
  // lib/line-resume.ts and run against a fake database in the tests. This route only
  // wires the real provider in.
  let result;
  try {
    result = await sweepStuckLines(
      db,
      {
        // The saga runs on the ledger (00109); this sweep only detects and takes.
        resume: async (tenant, row) => {
          await scheduleJob(db, {
            tenantId: tenant.id,
            kind: "line_provision",
            dueAt: new Date(),
            payload: { line_id: row.id, by: "sweep" },
          });
          return { ok: true };
        },
        alert: (subject, body) =>
          notify({ tenantId: null, notifications: null, isEnvDefault: true }, { kind: "alert", subject, body }),
        reportFailed: (tenant, row, error) =>
          reportLineFailed(db, choice.name, tenant, row, row.step ?? "setting up", error, "sweep"),
        now: () => Date.now(),
        log: L,
      },
      MAX_PER_TICK,
    );
  } catch (e) {
    return refuse(503, "query_failed", e instanceof Error ? e.message : String(e));
  }

  // The numbers of workspaces that stopped paying. Its own failure is said beside the stuck lines' result rather than
  // hiding it: the two halves share a tick, not a fate.
  const afterDays = lineReleaseAfterDays(env.LINE_RELEASE_AFTER_DAYS);
  let ended: EndedLinesResult | { error: string };
  try {
    ended = await sweepEndedLines(
      db,
      {
        release: (tenantId, row, endedAt) =>
          releaseLine(db, choice, { apiKey }, tenantId, row, { by: "sweep", ended_at: endedAt }),
        tell: async (tenantId, msg) =>
          notify(
            { tenantId, ...(await loadTenantNotifications(db, tenantId)) },
            { kind: "billing", route: "admin/billing", about: null, ...msg },
          ),
        alert: (subject, body) =>
          notify({ tenantId: null, notifications: null, isEnvDefault: true }, { kind: "alert", subject, body }),
        billingUrl: (slug) => `${dashboardOrigin()}/w/${encodeURIComponent(slug)}#/admin/billing`,
        now: () => Date.now(),
        log: L,
      },
      afterDays,
    );
  } catch (e) {
    ended = { error: e instanceof Error ? e.message : String(e) };
    L.error("line_release_sweep_failed", { error: ended.error });
  }

  L.info("lines_sweep_done", { ...result, release: ended });
  // Every workspace unreadable is a database problem, not a line problem, and the
  // sweep watcher should hear about it -- the same shape cron/registrations uses.
  if (result.unreadable > 0 && result.unreadable === result.stuck) {
    return json(503, { ok: false, error: "no_workspace_readable", stuck: result.stuck });
  }
  return json(200, { ok: true, ...result, release: ended });
}
