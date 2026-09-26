/**
 * A send planned again (Reach out, Part 3; C5: a wait defers, never cancels). A send that went stale (its run approved
 * late, its chain resumed, its domain's day full so the claim left it), one whose domain was removed, one the door
 * sent back with a wait (the domain's day full, the domain not ready), and one claimed and never written: each takes
 * a new moment from the timetable, in its lead's own hours, on the step's verified domains, from now. The domains'
 * times are read afresh with these sends' own old times taken out, so a send never waits for itself. A send that finds
 * no moment within the horizon tries again tomorrow. One that has waited two weeks, or that the door sent back ten
 * times, is skipped, `kept_waiting`, and its run says so.
 *
 * `attempts` counts the emails written for a send (its next email's id is its send and that number, core sendMessageId):
 * only a send the door sent back, whose email row exists, moves it on. A send planned again without an email row
 * keeps its number, so its next email is the one it never wrote.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { domainCapacityOf, moveSend, type Database, type ReachOutSendRow } from "../packages/db.js";
import { domainDailyCap, timetable, weekHoursOf, zoneOfRegion, type TimetableDomain } from "../packages/contracts.js";
import type { Logger } from "../log.js";

type Db = SupabaseClient<Database>;

/** Emails written for a send before it is given up on: the door sent it back this often, it is not going. */
export const REPLAN_MAX_ATTEMPTS = 10;
/** How long a send may wait for room before it is given up on: a reach-out two weeks late is not the one approved. */
export const REPLAN_GIVE_UP_MS = 14 * 86_400_000;
const DAY_MS = 86_400_000;

/** A send to plan again, and whether an email row was written for it (a door's wait), which moves its number on. */
export interface Replan {
  send: ReachOutSendRow;
  wrote: boolean;
}

export interface ReplanCounts {
  replanned: number;
  waiting: number;
  gave_up: number;
}

export async function replanSends(db: Db, items: Replan[], now: Date, log: Logger): Promise<ReplanCounts> {
  const out: ReplanCounts = { replanned: 0, waiting: 0, gave_up: 0 };
  if (items.length === 0) return out;
  const wrote = new Set(items.filter((i) => i.wrote).map((i) => i.send.id));
  const sends = items.map((i) => i.send);
  // A send moves from wherever it stands (planned, claimed, queued), and only as it was read.
  const move = (s: ReachOutSendRow, patch: Partial<ReachOutSendRow>): Promise<boolean> =>
    moveSend(db, { tenantId: s.tenant_id, id: s.id, from: s.state, patch });
  // By step: its pace and its domains are the step's.
  const byStep = new Map<string, ReachOutSendRow[]>();
  for (const s of sends) {
    const key = s.playbook_id ?? "";
    byStep.set(key, [...(byStep.get(key) ?? []), s]);
  }
  const zones = new Map<string, string>();
  for (const [stepId, group] of byStep) {
    const tenantId = group[0].tenant_id;
    // A step removed since (its sends' playbook_id set null): nothing to pace or place them by, so they go no further.
    if (!stepId) {
      for (const s of group) if (await move(s, { state: "skipped", reason: "step_removed" })) out.gave_up += 1;
      continue;
    }
    try {
      const { data: step, error: se } = await db
        .from("playbooks")
        .select("gap_minutes, domain_ids")
        .eq("tenant_id", tenantId)
        .eq("id", stepId)
        .maybeSingle();
      if (se) throw new Error(`the step: ${se.message}`);
      // A hundred at a time: an id list rides in the request's address, and a step's group can hold five hundred.
      const leads: Array<{ id: string; region: string | null; hours: unknown }> = [];
      const ids = [...new Set(group.map((s) => s.lead_id))];
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error: le } = await db
          .from("leads")
          .select("id, region, hours")
          .eq("tenant_id", tenantId)
          .in("id", ids.slice(i, i + 100));
        if (le) throw new Error(`the leads: ${le.message}`);
        leads.push(...(data ?? []));
      }
      if (!zones.has(tenantId)) {
        const { data: t } = await db.from("tenants").select("timezone").eq("id", tenantId).maybeSingle();
        zones.set(tenantId, t?.timezone || "America/New_York");
      }
      let dq = db.from("sending_domains").select("id").eq("tenant_id", tenantId).eq("state", "verified");
      const named = step?.domain_ids ?? [];
      if (named.length > 0) dq = dq.in("id", named);
      const { data: doms, error: de } = await dq;
      if (de) throw new Error(`the domains: ${de.message}`);
      // Each domain's times, less these sends' own: a send planned again never waits for the time it held.
      const own = new Map<string, number[]>();
      for (const s of group) {
        // What it holds in its domain's times (00184): a planned send its time, a claim the moment it was claimed.
        const held = s.state === "planned" ? s.send_at : s.state === "claimed" ? s.claimed_at : null;
        if (s.domain_id && held) own.set(s.domain_id, [...(own.get(s.domain_id) ?? []), Date.parse(held)]);
      }
      const domains: TimetableDomain[] = [];
      for (const d of doms ?? []) {
        const c = await domainCapacityOf(db, d.id, now);
        const recent = [...c.recent];
        for (const t of own.get(d.id) ?? []) {
          const i = recent.indexOf(t);
          if (i >= 0) recent.splice(i, 1);
        }
        domains.push({ id: d.id, cap: c.clean_since ? domainDailyCap(c.sent_days) : 0, recent });
      }
      const leadOf = new Map(leads.map((l) => [l.id, l]));
      const plan = timetable({
        sends: group.map((s) => ({
          id: s.id,
          zone: zoneOfRegion(leadOf.get(s.lead_id)?.region ?? null) ?? zones.get(tenantId)!,
          week: weekHoursOf(leadOf.get(s.lead_id)?.hours).week,
        })),
        domains: domains.filter((d) => d.cap > 0),
        gapMinutes: step?.gap_minutes || 12,
        nowMs: now.getTime(),
      });
      const placed = new Map(plan.placed.map((p) => [p.id, p]));
      for (const s of group) {
        const p = placed.get(s.id);
        const attempts = (s.attempts ?? 0) + (wrote.has(s.id) ? 1 : 0);
        const tooLong = now.getTime() - Date.parse(s.created_at) > REPLAN_GIVE_UP_MS;
        // Two weeks is the end whether or not a moment was found: a send that fails every time it is written (its
        // claim left, planned again, claimed again) would otherwise circle for good, holding its domain's day.
        if (attempts >= REPLAN_MAX_ATTEMPTS || tooLong) {
          if (await move(s, { state: "skipped", reason: "kept_waiting", attempts: Math.min(attempts, 20) }))
            out.gave_up += 1;
        } else if (p) {
          if (
            await move(s, {
              state: "planned",
              send_at: new Date(p.sendAtMs).toISOString(),
              domain_id: p.domainId,
              attempts,
              message_id: null,
              claimed_at: null,
            })
          )
            out.replanned += 1;
        } else if (
          // No domain: only the timetable places it, in its lead's hours, when it is planned again tomorrow (a claim
          // would otherwise take it at this clock time, whatever the hour where the lead is).
          await move(s, {
            state: "planned",
            send_at: new Date(now.getTime() + DAY_MS).toISOString(),
            domain_id: null,
            attempts,
            message_id: null,
            claimed_at: null,
          })
        )
          out.waiting += 1;
      }
    } catch (e) {
      // One step's sends that could not be planned again keep as they are, for the next tick.
      log.error("reach_out_replan_failed", { playbook_id: stepId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
