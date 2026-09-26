/**
 * One step of a reach-out, on its day (Reach out §4.1, §4.5): who it writes to, a run for them, and when each email
 * goes. The first run of a chain waits for its owner (the class outreach asks, §4.8); a later run gives thirty minutes
 * to be stopped, or waits too when its owner asked for every run to (E7). A lead the door would refuse is never
 * planned (outreachRefusalOf, the door's own mapping), nor one whose email from the chain bounced (C4). What the
 * timetable cannot place within its horizon waits for the next day's run. Nothing here sends: the reach-out clock
 * claims what is due (Part 3, PR 5 and 6).
 */
import { PLAYBOOK_VETO_DELAY_MS, outreachRefusalOf, timetable, weekHoursOf, zoneOfRegion } from "@chanlytics/contracts";
import { sendIdFor } from "./reach-out-ids";
import type { PlannedSend, ReachOutLead, ReachOutRunOutcome, ReachOutRunPorts, ReachOutStep } from "./reach-out-ports";

export async function runReachOut(
  ports: ReachOutRunPorts,
  step: ReachOutStep,
  cmd: { runFor: string },
): Promise<ReachOutRunOutcome> {
  if (step.state !== "running") return { outcome: "off", reason: "paused", planned: 0 };
  if (ports.mode === "never") return { outcome: "off", reason: "never", planned: 0 };
  if (!ports.maySpend) return { outcome: "held", reason: "billing", planned: 0 };
  if (await ports.alreadyRan(step.id, cmd.runFor)) return { outcome: "empty", reason: "already_ran", planned: 0 };
  const chain = await ports.chainState(step.root_id);
  // The chain's first run waits for its owner: nothing more is assembled until they have said yes to it.
  if (chain === "waiting") return { outcome: "held", reason: "waiting_for_you", planned: 0 };
  const asks = chain === "none" || ports.mode === "ask";

  let leads: ReachOutLead[];
  if (step.trigger === "lead_first") leads = await ports.audience(step);
  else
    leads = (await ports.followers(step)).filter(
      (f) =>
        !f.bounced &&
        outreachRefusalOf({
          leadStage: f.facts.lead_stage,
          suppressed: f.facts.suppressed,
          wroteBack: f.facts.wrote_back,
        }) === null,
    );
  leads = leads.slice(0, step.cap_per_run);
  if (leads.length === 0) return { outcome: "empty", reason: "nobody", planned: 0 };

  const domains = (await ports.domains(step)).filter((d) => d.cap > 0);
  if (domains.length === 0) return { outcome: "held", reason: "no_domain", planned: 0 };

  // A run its owner approves goes from the moment they do (the clock plans a stale send again); one that is not asked
  // gives its owner thirty minutes to stop it first.
  const now = ports.now();
  const plan = timetable({
    sends: leads.map((l) => ({
      id: l.lead_id,
      zone: zoneOfRegion(l.region) ?? ports.workspaceZone,
      week: weekHoursOf(l.hours).week,
    })),
    domains,
    gapMinutes: step.gap_minutes,
    nowMs: asks ? now : now + PLAYBOOK_VETO_DELAY_MS,
  });
  if (plan.placed.length === 0) return { outcome: "held", reason: "no_room", planned: 0 };

  const firstAt = Math.min(...plan.placed.map((p) => p.sendAtMs));
  const run = await ports.createRun({
    tenant_id: step.tenant_id,
    playbook_id: step.id,
    run_for: cmd.runFor,
    name: step.name,
    template_id: step.template_id,
    template_name: step.template_name,
    template_language: step.template_language,
    state: asks ? "pending_approval" : "scheduled",
    scheduled_for: new Date(firstAt).toISOString(),
    recipient_count: plan.placed.length,
    audience: { kind: "reach_out", root_id: step.root_id, step_id: step.id, search_id: step.lead_search_id },
  });
  if (run === "exists") return { outcome: "empty", reason: "already_ran", planned: 0 };

  const contactOf = new Map(leads.map((l) => [l.lead_id, l.contact_id ?? null]));
  const sends: PlannedSend[] = await Promise.all(
    plan.placed.map(async (p) => ({
      id: await sendIdFor(run.id, p.id),
      tenant_id: step.tenant_id,
      broadcast_id: run.id,
      playbook_id: step.id,
      root_id: step.root_id,
      lead_id: p.id,
      contact_id: contactOf.get(p.id) ?? null,
      domain_id: p.domainId,
      send_at: new Date(p.sendAtMs).toISOString(),
      state: "planned" as const,
    })),
  );
  await ports.planSends(sends);
  if (asks) {
    await ports.notifyWaiting(run.id, sends.length, firstAt);
    return { outcome: "held", reason: "waiting_for_you", planned: sends.length };
  }
  return { outcome: "sent", planned: sends.length };
}
