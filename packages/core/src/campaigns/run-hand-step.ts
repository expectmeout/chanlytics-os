/**
 * A chain's hand step, on its day (Reach out Part 5, G20): each lead the step reaches is handed to the team as a call to
 * make or a note, a dated step on the lead's person, due that day. The reach is an email step's (the followers); a lead
 * the send door would refuse is not handed either, since they wrote back, said no, are away or are no longer being
 * written to: the same predicate (outreachRefusalOf). A bounced email is no reason not to call. Nothing is sent, so
 * nothing waits for approval or spends. The run, its handed sends and the steps are written whole by the door.
 */
import { handStepWords } from "@chanlytics/contracts";
import { handStepIdFor, reachOutRunIdFor, sendIdFor } from "./reach-out-ids";
import { followerRefusalOf } from "./reach-out-ports";
import type { HandStep, HandStepPorts, ReachOutFollower, ReachOutRunOutcome } from "./reach-out-ports";

/** Whether the send door would refuse to write to this lead: then the team is not handed them either. */
const doorRefuses = (f: ReachOutFollower): boolean => followerRefusalOf(f, { bounced: false }) !== null;

export async function runHandStep(
  ports: HandStepPorts,
  step: HandStep,
  cmd: { runFor: string },
): Promise<ReachOutRunOutcome> {
  if (step.state !== "running") return { outcome: "off", reason: "paused", planned: 0 };
  const followers = await ports.followers(step);
  // A lead the step refuses for good is passed over, its place ended with why (00455); someone away waits for the day.
  const passed = followers.flatMap((f) => {
    const why = followerRefusalOf(f, { bounced: false });
    return why && why !== "outreach_away" ? [{ lead_id: f.lead_id, why }] : [];
  });
  if (passed.length > 0) await ports.passOver(step.root_id, passed);
  const leads = followers.filter((f) => !doorRefuses(f)).slice(0, step.cap_per_run);
  if (leads.length === 0) return { outcome: "empty", reason: "nobody", planned: 0 };

  const names = await ports.businessNames(leads.map((l) => l.lead_id));
  const runId = await reachOutRunIdFor(step.id, cmd.runFor);
  const items = await Promise.all(
    leads.map(async (l) => ({
      send_id: await sendIdFor(runId, l.lead_id),
      lead_id: l.lead_id,
      contact_id: l.contact_id,
      words: handStepWords(step.hand.kind, names.get(l.lead_id) ?? "", step.hand.words),
      source_id: await handStepIdFor(step.id, l.lead_id),
    })),
  );
  const r = await ports.handRun({ stepId: step.id, runId, day: cmd.runFor, items });
  return r.made > 0 ? { outcome: "sent", planned: r.made } : { outcome: "empty", reason: "already_ran", planned: 0 };
}
