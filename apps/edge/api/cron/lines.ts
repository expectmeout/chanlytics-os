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
 * and its stale-jobs recovery already exists. But `JobContext` is `{ db, waCfg,
 * sms, alert }` — it holds no master carrier account, no line provider and no
 * access to a line's credentials in Vault. Putting the saga there means moving
 * provider credentials out of the edge, which is the one place they deliberately
 * live, on the one path that spends money. The saga is ALREADY resumable —
 * `nextLineStep` derives the whole plan from the row's own receipts — so all that
 * was ever missing was something to call it.
 *
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps;
 * pg_cron calls this from the database (migration 00097).
 */
import crypto from "node:crypto";
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { logger } from "../../lib/log.js";
import { lineProviderFromEnv, lineForClient, rowToLine } from "../../lib/lines.js";
import { lineStuckProvisioning, PROVISIONING_DEADLINE_MS } from "../../lib/workspace/contracts.js";
import { provisionLine } from "../../lib/provision.js";

export const config = { maxDuration: 60 };

/**
 * A bound per tick, and a small one.
 *
 * Each resume is a whole saga — up to fourteen provider calls — so one tick can
 * only honestly carry a couple inside its own 60 seconds. A backlog drains over
 * successive quarter hours rather than being half-run and killed again, which is
 * the failure this sweep exists to clean up and must not reproduce.
 */
const MAX_PER_TICK = 2;

function secretsMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "lines" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  const presented = request.headers.get("x-cron-key") || "";
  const { data: expected, error: keyErr } = await db.rpc("get_cron_sweep_key");
  if (keyErr || !expected) return json(503, { ok: false, error: "key_unavailable" });
  if (!presented || !secretsMatch(presented, expected as unknown as string)) return json(401, { ok: false, error: "unauthorized" });

  // The provider and the receptionist's credentials, exactly as the writing ops
  // check them. A tick that cannot provision must say so rather than reporting a
  // clean sweep over lines it never looked at.
  const choice = lineProviderFromEnv();
  const apiKey = process.env.RETELL_API_KEY;
  const fnSecret = process.env.RETELL_FN_SECRET;
  if (!choice) return json(503, { ok: false, error: "no_line_provider" });
  if (!apiKey || !fnSecret) return json(503, { ok: false, error: !apiKey ? "no_provider_key" : "no_fn_secret" });

  // Oldest first, so a backlog drains in the order it built up. The deadline is
  // applied in SQL as well as in the predicate below: filtering here keeps the read
  // small, and `lineStuckProvisioning` is what actually decides — one rule, and the
  // page, the button and this all read it.
  const cutoff = new Date(Date.now() - PROVISIONING_DEADLINE_MS).toISOString();
  const { data: rows, error } = await db
    .from("lines")
    .select("*")
    .eq("voice_state", "provisioning")
    .lt("state_since", cutoff)
    .order("state_since", { ascending: true })
    .limit(MAX_PER_TICK);
  if (error) return json(503, { ok: false, error: error.message });

  const stuck = (rows ?? []).filter((r) => lineStuckProvisioning(lineForClient(r), Date.now()));
  if (stuck.length === 0) {
    L.info("lines_sweep_clear", { checked: (rows ?? []).length });
    return json(200, { ok: true, stuck: 0, resumed: 0, failed: 0 });
  }

  let resumed = 0;
  let failed = 0;
  let unreadable = 0;
  for (const row of stuck) {
    // The workspace, per line: this sweep crosses tenants, so there is no one
    // tenant to have read at the top.
    const t = await db.from("tenants").select("id, name").eq("id", row.tenant_id).maybeSingle();
    if (t.error || !t.data) {
      unreadable += 1;
      L.error("lines_sweep_no_workspace", { line_id: row.id, tenant_id: row.tenant_id, error: t.error?.message ?? "not found" });
      continue;
    }
    try {
      // The same function the owner's button and support's button call, so the bell
      // row, the platform email and the ledger event are the same three things a
      // person pressing Retry would have produced. `by: "sweep"` is the only
      // difference, and it is in the email so somebody reading it knows nobody asked.
      const r = await provisionLine(db, choice, { apiKey }, { fnSecret }, t.data, rowToLine(row), "sweep");
      if (r.ok) resumed += 1;
      else failed += 1;
    } catch (e) {
      // A throw here means the saga died outside its own error handling. The row
      // keeps `provisioning` and this sweep will find it again next tick, which is
      // the behaviour that was missing in the first place.
      failed += 1;
      L.error("lines_sweep_threw", { line_id: row.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  L.info("lines_sweep_done", { stuck: stuck.length, resumed, failed, unreadable });
  // Every workspace unreadable is a database problem, not a line problem, and the
  // sweep watcher should hear about it — the same shape cron/registrations uses.
  if (unreadable > 0 && unreadable === stuck.length) {
    return json(503, { ok: false, error: "no_workspace_readable", stuck: stuck.length });
  }
  return json(200, { ok: true, stuck: stuck.length, resumed, failed, unreadable });
}
