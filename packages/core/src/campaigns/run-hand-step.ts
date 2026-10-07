/**
 * A chain's hand step, on its day (Reach out Part 5, G20): each lead the step reaches is handed to the team as a call to
 * make or a note, a dated step on the lead's person, due that day. The reach is an email step's (the followers); a lead
 * the send door would refuse is not handed either, since they wrote back, said no, are away or are no longer being
 * written to: the same predicate (outreachRefusalOf). A bounced email is no reason not to call. Nothing is sent, so
 * nothing waits for approval or spends. The run, its handed sends and the steps are written whole by the door.
 */
import { handStepWords, outreachRefusalOf } from "@chanlytics/contracts";
import { handStepIdFor, reachOutRunIdFor, sendIdFor } from "./reach-out-ids";
import type { HandStep, HandStepPorts, ReachOutFollower, ReachOutRunOutcome } from "./reach-out-ports";

/** Whether the send door would refuse to write to this lead: then the team is not handed them either. */
const doorRefuses = (f: ReachOutFollower): boolean =>
  outreachRefusalOf({
    leadStage: f.facts.lead_stage,
    suppressed: f.facts.suppressed,
    wroteBack: f.facts.wrote_back,
    away: f.facts.away === true,
    stopped: f.facts.stopped === true,
  }) !== null;

export async function runHandStep(
  ports: HandStepPorts,
  step: HandStep,
  cmd: { runFor: string },
): Promise<ReachOutRunOutcome> {
  if (step.state !== "running") return { outcome: "off", reason: "paused", planned: 0 };
  const leads = (await ports.followers(step)).filter((f) => !doorRefuses(f)).slice(0, step.cap_per_run);
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
