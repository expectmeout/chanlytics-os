/**
 * One step of a reach-out, on its day (Reach out §4.1, §4.5): who it writes to, a run for them, and when each email
 * goes. A run of a step whose words are new to its owner waits for them (decision 0064: its first, and its first after
 * new words); any other gives thirty minutes to be stopped and tells its owner when it goes, waits too when its
 * sequence asks for each (its mode, E7), or goes at once where its owner set the sequence to send on its own (decision
 * 0120). While a run of the chain waits, no new business is written to; a follow-up to the people already written to
 * goes on, unless a run of its own step waits (0120). A lead the door would refuse (outreachRefusalOf, the door's own mapping), one whose email from the
 * chain bounced (C4), and one that keeps no open hour all week are skipped with why, so none of them heads the step's
 * page every day. What the timetable cannot place within its horizon waits for the next day's run. A reach-out its owner
 * sends (00429) plans no mailbox and no timetable: its day's share (REACH_OUT_DRAFTS_PER_DAY, less what the chain's runs
 * of the day already hold, so the steps after the first, planned first, are never crowded out), never past the pile its
 * owner can keep up with (REACH_OUT_DRAFTS_OPEN_MAX, less what waits for them already), each due as the run goes ahead,
 * to be handed to the owner once checked. The run and its sends are written whole. Nothing here sends: the
 * reach-out clock claims what is due (Part 3, PR 5 and 6).
 */
import {
  batchModeOf,
  PLAYBOOK_VETO_DELAY_MS,
  REACH_OUT_DRAFTS_OPEN_MAX,
  REACH_OUT_DRAFTS_PER_DAY,
  sendWindowsOf,
  timetable,
  weekHoursOf,
  zoneOfRegion,
  type WeekHours,
} from "@chanlytics/contracts";
import { getReachOutRunId, sendIdFor } from "./reach-out-ids";
import { followerRefusalOf } from "./reach-out-ports";
import type {
  NewReachOutRun,
  PlannedSend,
  ReachOutLead,
  ReachOutRunOutcome,
  ReachOutRunPorts,
  ReachOutStep,
} from "./reach-out-ports";

/** A week with no hour a cold email may arrive in (closed every day): never placeable, whatever the mailboxes' room. */
const neverOpen = (week: WeekHours): boolean => Object.values(sendWindowsOf(week)).every((w) => w.length === 0);

/**
 * A planned batch nobody asked to OK first, under a sequence that holds each one for a stop. Before each batch promises
 * "You're told it's ready": a batch nobody could be told of does not go by itself, it waits for its owner's OK instead. A bell or a hold that fails is said by the door in
 * its own log; a batch that could be neither told of nor held is never lost, it goes at its time. A run its owner sends
 * by hand never goes without them, so there is nothing to say.
 */
async function goesOrWaits(
  ports: ReachOutRunPorts,
  step: ReachOutStep,
  run: NewReachOutRun,
  plan: { counts: { planned: number; skipped: number }; firstAt: number },
): Promise<ReachOutRunOutcome> {
  const planned = plan.counts.planned;
  // The door writes its own failure down and answers false (run-context.ts); one that throws anyway reads the same
  // here, as not told and not held, so no failure of either can lose the batch.
  const ownerKnows = step.owner_sends || (await ports.notifyGoes(run.id, planned, plan.firstAt).catch(() => false));
  const waits = !ownerKnows && (await ports.holdForOk(run.id).catch(() => false));
  // On the record in the state it ends in: a run that waits is never recorded as the system's own send.
  await ports.recordRun(waits ? { ...run, state: "pending_approval" } : run, plan.counts);
  if (!waits) return { outcome: "sent", planned };
  // It shows on Today and on the page's top card and never expires: a waiting bell that fails costs it nothing.
  await ports.notifyWaiting(run.id, planned, plan.firstAt).catch(() => undefined);
  return { outcome: "held", reason: "waiting_for_you", planned };
}

export async function runReachOut(
  ports: ReachOutRunPorts,
  step: ReachOutStep,
  cmd: { runFor: string },
): Promise<ReachOutRunOutcome> {
  if (step.state !== "running") return { outcome: "off", reason: "paused", planned: 0 };
  if (!ports.maySpend) return { outcome: "held", reason: "billing", planned: 0 };
  if (await ports.alreadyRan(step.id, cmd.runFor)) return { outcome: "empty", reason: "already_ran", planned: 0 };
  // A run that waits for its owner holds what is behind it and no more (decision 0120): nothing new is written to a
  // new business while any run of the chain waits, and a step makes no second run while one of its own waits, so under
  // Ask me they never pile up. A first email that waits never holds the follow-ups to the people already written to.
  const waiting = await ports.waitingSteps(step.root_id);
  if (step.trigger === "lead_first" ? waiting.size > 0 : waiting.has(step.id))
    return { outcome: "held", reason: "waiting_for_you", planned: 0 };
  // Its first run asks, because its words are new; after that its batches go as Before each batch says, first emails
  // and follow-ups alike (decision 0077, amended 9 Nov 2026): held thirty minutes for a stop, asked for, or, where its
  // owner set that on the sequence, sent on their own (0120).
  const mode = batchModeOf({ mode: ports.mode, words_ok_at: step.words_ok_at });
  const asks = mode === "ask";

  // Who it may write to, and who it skips with why: a later step's leads the door would refuse, or whose email from the
  // chain bounced; any lead that keeps no open hour all week.
  const skips: Array<{ lead: ReachOutLead; reason: string }> = [];
  let leads: ReachOutLead[] = [];
  // A later step's lead keeps the mailbox its chain wrote from (decision 0056, 3): the nudge goes in the same thread.
  const keeps = new Map<string, string>();
  // A later step's lead it refuses for good (stopped, wrote back, set aside, unsubscribed, bounced) is passed over:
  // its place ends with why (00455). Someone away is only skipped today: the step takes them back after the day named.
  const passed: { lead_id: string; why: string }[] = [];
  if (step.trigger === "lead_first") leads = await ports.audience(step);
  else
    for (const f of await ports.followers(step)) {
      if (f.mailbox_id) keeps.set(f.lead_id, f.mailbox_id);
      const refused = followerRefusalOf(f, { bounced: true });
      if (refused === "outreach_away") skips.push({ lead: f, reason: refused });
      else if (refused) passed.push({ lead_id: f.lead_id, why: refused });
      else leads.push(f);
    }
  if (passed.length > 0) await ports.passOver(step.root_id, passed);
  const weeks = new Map(leads.map((l) => [l.lead_id, weekHoursOf(l.hours).week]));
  const weekOf = (l: (typeof leads)[number]) => weeks.get(l.lead_id) ?? weekHoursOf(l.hours).week;
  for (const l of leads) if (neverOpen(weekOf(l))) skips.push({ lead: l, reason: "closed_every_day" });
  const skipped = new Set(skips.map((s) => s.lead.lead_id));
  leads = leads.filter((l) => !skipped.has(l.lead_id)).slice(0, step.cap_per_run);
  if (leads.length === 0) return { outcome: "empty", reason: "nobody", planned: 0 };

  // A run its owner approves goes from the moment they do (the clock plans a stale send again), and so does one of a
  // sequence that sends on its own; one held for a stop gives its owner thirty minutes first.
  const now = ports.now();
  const startMs = mode === "veto" ? now + PLAYBOOK_VETO_DELAY_MS : now;
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
        week: weekOf(l),
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
    id: await getReachOutRunId(step.id, cmd.runFor),
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
  const counts = { planned: placed.length, skipped: skips.length };
  if (asks) {
    await ports.recordRun(run, counts);
    await ports.notifyWaiting(run.id, placed.length, firstAt);
    return { outcome: "held", reason: "waiting_for_you", planned: placed.length };
  }
  // On its own (0120): nothing to stop and nobody to ask, so it is recorded as the system's send and goes. Today's
  // "Since" line and the sequence's History say what went.
  if (mode === "auto") {
    await ports.recordRun(run, counts);
    return { outcome: "sent", planned: placed.length };
  }
  return goesOrWaits(ports, step, run, { counts, firstAt });
}
