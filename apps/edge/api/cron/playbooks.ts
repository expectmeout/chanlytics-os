/**
 * The playbooks sweep: every hour, every running playbook whose hour it is
 * by the business's clock runs once for the day. The run itself is
 * lib/playbooks.ts, shared with "Run now" on the page.
 *
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps.
 * Same-origin is not a question here; pg_cron calls this from the database.
 */
import crypto from "node:crypto";
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { logger } from "../../lib/log.js";
import { loadTenantRunContext, runPlaybook, type PlaybookRow } from "../../lib/playbooks.js";
import { localDate, runDueNow, type PlaybookDto } from "../../lib/workspace/contracts.js";

export const config = { maxDuration: 60 };

function secretsMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "playbooks" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  const presented = request.headers.get("x-cron-key") || "";
  const { data: expected, error: keyErr } = await db.rpc("get_cron_sweep_key");
  if (keyErr || !expected) return json(503, { ok: false, error: "key_unavailable" });
  if (!presented || !secretsMatch(presented, expected as unknown as string)) return json(401, { ok: false, error: "unauthorized" });

  const now = new Date();
  const { data: playbooks, error } = await db.from("playbooks").select("*").eq("state", "running");
  if (error) {
    L.error("playbooks_read_failed", { error: error.message });
    return json(500, { ok: false });
  }
  const byTenant = new Map<string, PlaybookRow[]>();
  for (const p of (playbooks ?? []) as PlaybookRow[]) byTenant.set(p.tenant_id, [...(byTenant.get(p.tenant_id) ?? []), p]);

  const out = { tenants: 0, due: 0, sent: 0, held: 0, empty: 0, off: 0, failed: 0 };
  for (const [tenantId, rows] of byTenant) {
    const { data: tenant } = await db.from("tenants").select("timezone").eq("id", tenantId).maybeSingle();
    const tz = tenant?.timezone || "America/New_York";
    const due = rows.filter((p) => runDueNow(p as unknown as PlaybookDto, tz, now));
    if (due.length === 0) continue;
    out.tenants += 1;
    out.due += due.length;
    const ctx = await loadTenantRunContext(db, tenantId, now);
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
  L.info("playbooks_swept", out);
  return json(200, { ok: true, ...out });
}
