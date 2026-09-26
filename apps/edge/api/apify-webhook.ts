/**
 * POST /api/apify-webhook?run=<lead_runs.id>&token=<the run row's token>: the
 * lead finder's provider says a run ended.
 *
 * THIS FILE IS THE WIRE, NOT THE JUDGEMENT. What a delivery means is decided
 * by planApifyIngress (lib/apify-ingress.ts), which runs over a fake in a
 * test; what is left here is reading the row, proving the token, the one
 * write (a final collect, once, however often the provider delivers: 00140's
 * index on lead_collect's run and seq) and what the provider wants back: 200
 * once the work is written, 503 when the ledger cannot take it so the
 * delivery comes back (up to 11 times over about 32 hours). The provider is
 * called for nothing but aborting a run the row does not hold.
 */
import { json } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import { logger, errField } from "../lib/log.js";
import {
  planApifyIngress,
  tokenMatches,
  RUN_ROW_ID,
  WEBHOOK_TOKEN,
  type IngressRunRow,
} from "../lib/leads/apify-ingress.js";
import { leadDb } from "../lib/leads/lead-db.js";
import { leadWires } from "../lib/leads/lead-wires.js";
import { scheduleJobOnce } from "../lib/packages/jobs.js";

/** The delivery is a pointer: ids and a status. Anything larger is not one. */
const MAX_BODY = 64_000;

export async function POST(request: Request): Promise<Response> {
  const L = logger({ door: "apify_webhook" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  const u = new URL(request.url);
  const runRowId = u.searchParams.get("run") ?? "";
  const token = u.searchParams.get("token") ?? "";
  if (!RUN_ROW_ID.test(runRowId) || !WEBHOOK_TOKEN.test(token)) {
    L.warn("apify_webhook_no_token", {});
    return json(401, { ok: false });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, { ok: false });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }

  let runRow: IngressRunRow | null;
  try {
    const { data, error } = await db
      .from("lead_runs")
      .select("id, tenant_id, apify_run_id, state, webhook_token_hash")
      .eq("id", runRowId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    runRow = (data as IngressRunRow | null) ?? null;
  } catch (e) {
    L.error("apify_webhook_read_failed", { error: errField(e) });
    return json(503, { ok: false });
  }
  const verdict = planApifyIngress({
    runRow,
    tokenOk: !!runRow && tokenMatches(token, runRow.webhook_token_hash),
    body,
  });

  switch (verdict.action) {
    case "refuse":
      L.warn(verdict.log, { run: runRowId });
      return json(verdict.status, { ok: false });
    case "ignore":
      L.info(verdict.log, { run: runRowId });
      return json(200, { ok: true, ignored: true });
    case "abort_foreign": {
      // A run started with our token by something that is not our runner: aborted, and the delivery answered so it stops coming.
      const wires = leadWires();
      if (wires)
        await wires.apify
          .abortRun(verdict.apifyRunId)
          .catch((e: unknown) => L.error("apify_webhook_abort_failed", { error: errField(e) }));
      L.warn(verdict.log, { run: runRowId, aborted: verdict.apifyRunId, source: wires ? "on" : "off" });
      return json(200, { ok: true, aborted: !!wires });
    }
    case "schedule_final": {
      try {
        // Only a row still 'unknown' takes it; anything else is left for the sweep. The
        // dataset the delivery named may be nothing, and the RPC takes four arguments
        // whatever it is: an omitted one is a function PostgREST cannot find.
        if (verdict.fill) {
          const filled = await leadDb(db).runReconcile(
            verdict.runRowId,
            verdict.apifyRunId,
            verdict.fill.datasetId,
            "running",
          );
          L.info("apify_webhook_filled", { run: verdict.runRowId, filled });
        }
        const outcome = await scheduleJobOnce(db, {
          tenantId: verdict.tenantId,
          kind: "lead_collect",
          dueAt: new Date(),
          payload: { run_id: verdict.runRowId, seq: "final" },
        });
        L.info("apify_webhook_scheduled", { run: verdict.runRowId, outcome });
        return json(200, { ok: true });
      } catch (e) {
        L.error("apify_webhook_write_failed", { error: errField(e) });
        return json(503, { ok: false });
      }
    }
  }
}
