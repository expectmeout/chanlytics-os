/**
 * The playbooks sweep: every hour, every running playbook whose hour it is
 * by the business's clock runs once for the day.
 *
 * A run is a broadcast for the people who became eligible since the last
 * run — the trigger's list crossed with who said yes, minus anyone who heard
 * from this playbook within its gap, minus anyone who heard from any
 * playbook this week, the longest-unheard first, at most the cap. What the
 * run then does is the class's autonomy mode: auto schedules the send now,
 * veto schedules it half an hour ahead with a Stop, ask leaves it waiting
 * for a person, never does nothing. Every run is recorded as an event, a
 * run that found nobody included, so the page can say so honestly.
 *
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps.
 * Same-origin is not a question here; pg_cron calls this from the database.
 */
import crypto from "node:crypto";
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { notify } from "../../lib/notify.js";
import { loadTenantNotifications } from "../../lib/tenant-runtime.js";
import { logger } from "../../lib/log.js";
import { emitEvent, listPolicies, type Json } from "../../lib/workspace/db.js";
import { scheduleJob } from "../../lib/workspace/jobs.js";
import {
  eligibleForPlaybook,
  localDate,
  numberHealth,
  planRun,
  runDueNow,
  toPersonRowVM,
  type ParamSpec,
  type PersonRowDto,
  type PlaybookDto,
} from "../../lib/workspace/contracts.js";

export const config = { maxDuration: 60 };

function secretsMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

interface PlaybookRow {
  id: string; tenant_id: string; name: string; trigger: string; template_id: string; template_name: string; template_language: string;
  params: unknown; policy_class: string; state: string; run_hour: number; cap_per_run: number; gap_days: number; cadence_days: number;
  created_by: string | null; last_run_for: string | null;
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

  const out = { tenants: 0, due: 0, ran: 0, held: 0, empty: 0, off: 0, failed: 0 };
  for (const [tenantId, rows] of byTenant) {
    const { data: tenant } = await db.from("tenants").select("name, timezone").eq("id", tenantId).maybeSingle();
    const tz = tenant?.timezone || "America/New_York";
    const due = rows.filter((p) => runDueNow(p as unknown as PlaybookDto, tz, now));
    if (due.length === 0) continue;
    out.tenants += 1;
    out.due += due.length;
    const today = localDate(tz, now);

    // Read once per tenant: the people, the touches, the modes, the number.
    const [{ data: people, error: pErr }, policies, { data: ch }] = await Promise.all([
      db.rpc("people_list", { p_tenant_id: tenantId }),
      listPolicies(db, tenantId).catch(() => []),
      db.from("tenant_channels").select("config").eq("tenant_id", tenantId).eq("kind", "whatsapp").eq("status", "active").limit(1).maybeSingle(),
    ]);
    if (pErr) {
      L.error("playbooks_people_failed", { tenant_id: tenantId, error: pErr.message });
      out.failed += due.length;
      continue;
    }
    const vms = ((people ?? []) as unknown as PersonRowDto[]).map((r) => toPersonRowVM(r, now));
    const cfg = (ch?.config && typeof ch.config === "object" && !Array.isArray(ch.config) ? ch.config : {}) as Record<string, unknown>;
    const s = (k: string) => (typeof cfg[k] === "string" ? (cfg[k] as string) : null);
    const health = numberHealth({ quality: s("quality_rating"), event: s("quality_event"), limit: s("messaging_limit") });

    const { data: pastRuns } = await db.from("broadcasts").select("id, playbook_id").eq("tenant_id", tenantId).not("playbook_id", "is", null);
    const runIds = (pastRuns ?? []).map((b) => b.id);
    const ofRun = new Map((pastRuns ?? []).map((b) => [b.id, b.playbook_id as string]));
    const byThisAll = new Map<string, Map<string, number>>();
    const byAny = new Map<string, number>();
    if (runIds.length) {
      const { data: sent } = await db.from("broadcast_recipients").select("broadcast_id, contact_id, sent_at").in("broadcast_id", runIds).eq("state", "sent");
      for (const r of sent ?? []) {
        const at = r.sent_at ? Date.parse(r.sent_at) : 0;
        const pid = ofRun.get(r.broadcast_id);
        if (pid) {
          const m = byThisAll.get(pid) ?? new Map<string, number>();
          m.set(r.contact_id, Math.max(m.get(r.contact_id) ?? 0, at));
          byThisAll.set(pid, m);
        }
        byAny.set(r.contact_id, Math.max(byAny.get(r.contact_id) ?? 0, at));
      }
    }

    for (const p of due) {
      const record = async (data: Record<string, unknown>) => {
        await emitEvent(db, tenantId, "playbook.run", "message", "playbook", p.id, { run_for: today, ...data } as Json).catch(() => {});
        await db.from("playbooks").update({ last_run_for: today, last_run_at: now.toISOString() }).eq("id", p.id);
      };
      const mode = policies.find((r) => r.class === p.policy_class)?.mode ?? "ask";
      const plan = planRun(mode, now);
      if (plan.kind === "off") { await record({ mode, skipped: "never" }); out.off += 1; continue; }

      const { data: tpl } = await db.from("templates").select("meta_status").eq("tenant_id", tenantId).eq("channel", "whatsapp").eq("name", p.template_name).eq("language", p.template_language).maybeSingle();
      if (!tpl || tpl.meta_status !== "approved") { await record({ mode, skipped: "template_not_approved" }); out.off += 1; continue; }
      if (!health.canSend) { await record({ mode, skipped: "number_flagged" }); out.off += 1; continue; }

      const dto = p as unknown as PlaybookDto;
      let eligible = eligibleForPlaybook(vms, dto, { byThis: byThisAll.get(p.id) ?? new Map(), byAny }, now.getTime());
      if (health.limitPerDay !== null && eligible.length > health.limitPerDay) eligible = eligible.slice(0, Math.max(0, Math.floor(health.limitPerDay)));
      if (eligible.length === 0) { await record({ mode, eligible: 0 }); out.empty += 1; continue; }

      const specs: ParamSpec[] = Array.isArray(p.params) ? (p.params as ParamSpec[]) : [];
      const { data: made, error: bErr } = await db
        .from("broadcasts")
        .insert({
          tenant_id: tenantId,
          name: `${p.name} · ${today}`,
          template_id: p.template_id,
          template_name: p.template_name,
          template_language: p.template_language,
          params: specs as unknown as Json,
          audience: { kind: "playbook", id: p.id, label: p.name } as unknown as Json,
          state: plan.state,
          scheduled_for: plan.kind === "send" ? plan.at.toISOString() : now.toISOString(),
          recipient_count: eligible.length,
          created_by: p.created_by,
          playbook_id: p.id,
          run_for: today,
        })
        .select("id")
        .single();
      if (bErr || !made) {
        L.error("playbook_run_write_failed", { playbook_id: p.id, error: bErr?.message });
        out.failed += 1;
        continue;
      }
      const { error: rErr } = await db.from("broadcast_recipients").insert(eligible.map((r) => ({ broadcast_id: made.id, contact_id: r.id, tenant_id: tenantId })));
      if (rErr) {
        await db.from("broadcasts").update({ state: "failed", failure: "recipients_write_failed" }).eq("id", made.id);
        L.error("playbook_recipients_write_failed", { playbook_id: p.id, error: rErr.message });
        out.failed += 1;
        continue;
      }

      if (plan.kind === "send") {
        try {
          await scheduleJob(db, { tenantId, kind: "broadcast_send", dueAt: plan.at, payload: { broadcast_id: made.id }, qstashToken: process.env.QSTASH_TOKEN! });
        } catch (e) {
          await db.from("broadcasts").update({ state: "failed", failure: "schedule_failed" }).eq("id", made.id);
          L.error("playbook_schedule_failed", { playbook_id: p.id, error: e instanceof Error ? e.message : String(e) });
          out.failed += 1;
          continue;
        }
        // The ledger: a run that sends on its own is the system's decision, under the mode the owner chose.
        await db.from("decisions").insert({
          tenant_id: tenantId, subject_type: "broadcast", subject_id: made.id, verb: "send_broadcast", actor_type: "system",
          payload: { playbook_id: p.id, playbook: p.name, mode, recipients: eligible.length, scheduled_for: plan.at.toISOString() } as unknown as Json,
        });
        await record({ mode, eligible: eligible.length, broadcast_id: made.id, state: plan.state });
        out.ran += 1;
      } else {
        const target = await loadTenantNotifications(db, tenantId);
        await notify(
          { tenantId, notifications: target.notifications, isEnvDefault: target.isEnvDefault },
          { subject: `Playbook “${p.name}” is ready: ${eligible.length} ${eligible.length === 1 ? "person" : "people"}`, body: `${eligible.length} ${eligible.length === 1 ? "person has" : "people have"} become eligible for “${p.name}”. Approve or skip the run on Today or in Campaigns › Playbooks. Nothing is sent until you do.` },
        );
        await record({ mode, eligible: eligible.length, broadcast_id: made.id, state: plan.state });
        out.held += 1;
      }
    }
  }
  L.info("playbooks_swept", out);
  return json(200, { ok: true, ...out });
}
