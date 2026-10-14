/**
 * One step of a reach-out, on its day (Reach out §4.1, §4.5): who it writes to, a run for them, and when each email
 * goes. The first run of a chain waits for its owner (the class outreach asks, §4.8), and so does every first-email run
 * of a chain fed by a list (00426: each of its leads was added by hand, so each run is a new say); a later run gives
 * thirty minutes to be stopped, or waits too when its owner asked for every run to (E7), and while any run of the chain
 * waits nothing more is made. A lead the door would refuse (outreachRefusalOf, the door's own mapping), one whose email from the
 * chain bounced (C4), and one that keeps no open hour all week are skipped with why, so none of them heads the step's
 * page every day. What the timetable cannot place within its horizon waits for the next day's run. A reach-out its owner
 * sends (00429) plans no mailbox and no timetable: its day's share (REACH_OUT_DRAFTS_PER_DAY, less what the chain's runs
 * of the day already hold, so the steps after the first, planned first, are never crowded out), never past the pile its
 * owner can keep up with (REACH_OUT_DRAFTS_OPEN_MAX, less what waits for them already), each due as the run goes ahead,
 * to be handed to the owner once checked. The run and its sends are written whole. Nothing here sends: the
 * reach-out clock claims what is due (Part 3, PR 5 and 6).
 */
import {
  PLAYBOOK_VETO_DELAY_MS,
  REACH_OUT_DRAFTS_OPEN_MAX,
  REACH_OUT_DRAFTS_PER_DAY,
  outreachRefusalOf,
  sendWindowsOf,
  timetable,
  weekHoursOf,
  zoneOfRegion,
  type WeekHours,
} from "@chanlytics/contracts";
import { reachOutRunIdFor, sendIdFor } from "./reach-out-ids";
import type { PlannedSend, ReachOutLead, ReachOutRunOutcome, ReachOutRunPorts, ReachOutStep } from "./reach-out-ports";

/** A week with no hour a cold email may arrive in (closed every day): never placeable, whatever the mailboxes' room. */
const neverOpen = (week: WeekHours): boolean => Object.values(sendWindowsOf(week)).every((w) => w.length === 0);

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
  // A run of the chain waits for its owner: nothing more is assembled until they have answered it.
  if (chain === "waiting") return { outcome: "held", reason: "waiting_for_you", planned: 0 };
  const asks = chain === "none" || ports.mode === "ask" || (step.trigger === "lead_first" && step.fed_by === "list");

  // Who it may write to, and who it skips with why: a later step's leads the door would refuse, or whose email from the
  // chain bounced; any lead that keeps no open hour all week.
  const skips: Array<{ lead: ReachOutLead; reason: string }> = [];
  let leads: ReachOutLead[] = [];
  // A later step's lead keeps the mailbox its chain wrote from (decision 0056, 3): the nudge goes in the same thread.
  const keeps = new Map<string, string>();
  if (step.trigger === "lead_first") leads = await ports.audience(step);
  else
    for (const f of await ports.followers(step)) {
      if (f.mailbox_id) keeps.set(f.lead_id, f.mailbox_id);
      const refused = f.bounced
        ? "outreach_bounced"
        : outreachRefusalOf({
            leadStage: f.facts.lead_stage,
            suppressed: f.facts.suppressed,
            wroteBack: f.facts.wrote_back,
            away: f.facts.away === true,
            stopped: f.facts.stopped === true,
          });
      if (refused) skips.push({ lead: f, reason: refused });
      else leads.push(f);
    }
  const weeks = new Map(leads.map((l) => [l.lead_id, weekHoursOf(l.hours).week]));
  for (const l of leads) if (neverOpen(weeks.get(l.lead_id)!)) skips.push({ lead: l, reason: "closed_every_day" });
  const skipped = new Set(skips.map((s) => s.lead.lead_id));
  leads = leads.filter((l) => !skipped.has(l.lead_id)).slice(0, step.cap_per_run);
  if (leads.length === 0) return { outcome: "empty", reason: "nobody", planned: 0 };

  // A run its owner approves goes from the moment they do (the clock plans a stale send again); one that is not asked
  // gives its owner thirty minutes to stop it first.
  const now = ports.now();
  const startMs = asks ? now : now + PLAYBOOK_VETO_DELAY_MS;
  let placed: Array<{ id: string; senderId: string | null; sendAtMs: number }>;
  if (step.owner_sends) {
    // Its owner sends (00429): the day's share left, and no more than their pile has room for, every email due as the
    // run goes ahead; the owner is the pace, and one who falls behind is handed nothing new until they catch up.
    const load = await ports.draftLoad(step.root_id, cmd.runFor);
    const room = Math.min(REACH_OUT_DRAFTS_PER_DAY - load.today, REACH_OUT_DRAFTS_OPEN_MAX - load.open);
    if (room <= 0) return { outcome: "held", reason: "no_room", planned: 0 };
    placed = leads.slice(0, room).map((l) => ({ id: l.lead_id, senderId: null, sendAtMs: startMs }));
  } else {
    const { senders, gone } = await ports.mailboxes(step, [...new Set(keeps.values())]);
    // A lead whose mailbox was removed has no thread to be nudged in: skipped, never written to from another.
    for (const l of leads) if (gone.has(keeps.get(l.lead_id) ?? "")) skips.push({ lead: l, reason: "mailbox_gone" });
    leads = leads.filter((l) => !gone.has(keeps.get(l.lead_id) ?? ""));
    if (leads.length === 0) return { outcome: "empty", reason: "nobody", planned: 0 };
    const sending = senders.filter((d) => d.cap > 0);
    if (sending.length === 0) return { outcome: "held", reason: "no_mailbox", planned: 0 };
    const plan = timetable({
      sends: leads.map((l) => ({
        id: l.lead_id,
        zone: zoneOfRegion(l.region) ?? ports.workspaceZone,
        week: weeks.get(l.lead_id)!,
        only: keeps.get(l.lead_id) ?? null,
      })),
      senders: sending,
      gapMinutes: step.gap_minutes,
      nowMs: startMs,
    });
    if (plan.placed.length === 0) return { outcome: "held", reason: "no_room", planned: 0 };
    placed = plan.placed;
  }

  const firstAt = Math.min(...placed.map((p) => p.sendAtMs));
  const run = {
    id: await reachOutRunIdFor(step.id, cmd.runFor),
    tenant_id: step.tenant_id,
    playbook_id: step.id,
    run_for: cmd.runFor,
    // A day's run, named for its day as a moment's is.
    name: `${step.name} · ${cmd.runFor}`,
    template_id: step.template_id,
    template_name: step.template_name,
    template_language: step.template_language,
    state: asks ? ("pending_approval" as const) : ("scheduled" as const),
    scheduled_for: new Date(firstAt).toISOString(),
    recipient_count: placed.length,
    audience: {
      kind: "reach_out" as const,
      root_id: step.root_id,
      step_id: step.id,
      search_id: step.lead_search_id,
    },
  };
  const contactOf = new Map([...leads, ...skips.map((s) => s.lead)].map((l) => [l.lead_id, l.contact_id ?? null]));
  const row = async (leadId: string) => ({
    id: await sendIdFor(run.id, leadId),
    tenant_id: step.tenant_id,
    broadcast_id: run.id,
    playbook_id: step.id,
    root_id: step.root_id,
    lead_id: leadId,
    contact_id: contactOf.get(leadId) ?? null,
  });
  const sends: PlannedSend[] = [
    ...(await Promise.all(
      placed.map(async (p) => ({
        ...(await row(p.id)),
        state: "planned" as const,
        mailbox_id: p.senderId,
        send_at: new Date(p.sendAtMs).toISOString(),
      })),
    )),
    ...(await Promise.all(
      skips.map(async (s) => ({
        ...(await row(s.lead.lead_id)),
        state: "skipped" as const,
        mailbox_id: null,
        send_at: null,
        reason: s.reason,
      })),
    )),
  ];
  if ((await ports.planRun(run, sends)) === "exists") return { outcome: "empty", reason: "already_ran", planned: 0 };
  await ports.recordRun(run, { planned: placed.length, skipped: skips.length });
  if (asks) {
    await ports.notifyWaiting(run.id, placed.length, firstAt);
    return { outcome: "held", reason: "waiting_for_you", planned: placed.length };
  }
  return { outcome: "sent", planned: placed.length };
}
