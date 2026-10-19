/**
 * How a broadcast's batch ends a person's turn when the door says no, and when the whole run must stop (broadcast.ts): the
 * claim given back, a run stopped for a fact about the whole workspace, a day-before reminder that waits for a live hold.
 * Split from broadcast.ts, which sends; this is what it does with a refusal.
 */
import {
  BROADCAST_HOLD_WAIT_MS,
  audienceTrigger,
  emailRunStop,
  jittered,
  nextOpenMoment,
  passesHandoverPause,
  stoppedRunFix,
  type RunStop,
  runRoute,
} from "@chanlytics/contracts";
import { errField, logger } from "@chanlytics/channels";
import type { Channel, DeliveryRefusal } from "../deliver";
import type { Work } from "./broadcast-channels";
import { stoppedRunCause } from "./broadcast-words";
import type { BroadcastBatchCommand, BroadcastBatchPorts, BroadcastRow, RecipientRow } from "./ports";

/** The batch's own lines: a release the database refused. */
const stopLog = logger();

/** How one person's turn ended: the next goes on, the run stops, or it backs off (throttled, or never reached) by channel. */
export type Verdict = "go on" | "stop" | { back: "throttled" | "unreachable"; channel: Channel };

/**
 * The provider did not take the message: it said "not now" (channels graphThrottled, a 429), or the request never reached
 * it (a connection that never opened: providerFetch's `retryable`). Nothing left, so the claim is released, named for
 * which (00216 `throttled`, 00282 `not_taken`), and this person waits in the queue with everyone after them, rather
 * than be burned as refused with the rest of the list behind them. Every other failure keeps its claim: a timeout or a
 * 5xx may have been taken all the same. A database without the migration refuses the release; the run waits all the
 * same, and this one person keeps the claim, which is what such a person got before. Whether it took: false is that
 * refusal, said, for a caller who would otherwise count a wait for a person who is not queued (holdForLater).
 */
export async function release(
  ports: BroadcastBatchPorts,
  broadcastId: string,
  contactId: string,
  reason: "throttled" | "not_taken",
): Promise<boolean> {
  try {
    return (await ports.mark(broadcastId, contactId, { state: "queued", reason, message_id: null })) !== false;
  } catch (e) {
    stopLog.error("broadcast_release_refused", {
      broadcast_id: broadcastId,
      contact_id: contactId,
      error: errField(e),
    });
    return false;
  }
}

/**
 * THE one place a run stops for a fact about the whole workspace, which everyone left on it would meet alike (contracts
 * RunStop). A billing pause stops any run. The workspace's offers and news by email paused by a gate, and a campaigns
 * domain that cannot be used, stop only a run with nobody on it who goes another way (emailAlone): on a run that also goes
 * by WhatsApp or text they are the email person's own refusals, skipped with the reason, final, and the run goes on. Such
 * a run stopped for them would never reach the others, and the owner, told to send it again, would reach the rest twice.
 *
 * Met at the head of a batch (broadcast.ts stoppedByBilling, offersAtTheHead) or at the door by the first person it
 * applied to (afterRefusal): the run fails with the stop, the owner is told how many it reached before and what to do, and
 * everyone not yet reached stays unsent (queued), where each of them skipped for it would have ended the run as "reached
 * nobody" with nobody told why. What to do is by whose run it was (contracts stoppedRunFix): a playbook's is not sent
 * again by hand.
 */
export async function stopForTheWorkspace(
  ports: BroadcastBatchPorts,
  b: Pick<BroadcastRow, "id" | "name" | "playbook_id" | "audience">,
  why: RunStop,
): Promise<void> {
  // The tally is best effort: the run is stopping for a reason that may be the database's own.
  const sent = await ports.tally(b.id).then(
    (t) => t.sent,
    () => null,
  );
  await ports.fail(b.id, why);
  await ports.alert({
    kind: "broadcast_stopped",
    route: runRoute(b.id),
    about: { type: "broadcast", id: b.id },
    subject: `Campaign “${b.name}” ${why === "paused" && sent === 0 ? "not sent" : "stopped"}`,
    body: `${stoppedRunCause(why, sent)} ${stoppedRunFix(why, { playbook_id: b.playbook_id, trigger: audienceTrigger(b.audience) })}`,
  });
}

/**
 * Whether nobody on the run goes another way than email, asked once a batch (Work.emailAlone): what a hold on the
 * workspace's offers and news by email does to a run turns on it (stopForTheWorkspace).
 */
async function emailAlone(w: Work): Promise<boolean> {
  w.emailAlone ??= !(await w.ports.byOtherChannels(w.b.id, "email"));
  return w.emailAlone;
}

/**
 * The platform hears that a run's offers and news by email could not leave, the campaigns domain not being this runtime's
 * to use, with what the run did about it: stopped, when it goes by email alone, or went on past its email people. Once
 * while it lasts (its pager has its own memory per key).
 */
export async function pageTheDomain(
  ports: BroadcastBatchPorts,
  run: { tenantId: BroadcastBatchCommand["tenantId"]; id: string },
  how: { stopped: boolean; cause: string },
): Promise<void> {
  await ports
    .page?.(
      "campaigns_domain_unverified",
      "email: a broadcast's offers could not leave, the campaigns domain is not verified",
      how.stopped
        ? `Tenant ${run.tenantId}, broadcast ${run.id} stopped, everyone not yet sent still queued: ${how.cause}.`
        : `Tenant ${run.tenantId}, broadcast ${run.id}: its offers and news by email are skipped person by person while this lasts, and the run goes on for everyone else: ${how.cause}.`,
    )
    ?.catch(() => undefined);
}

/**
 * The door refused this person, and what the run does about it. A refusal that holds for the whole workspace stops the run
 * (stopForTheWorkspace), after this person's claim is given back: nothing left, and nobody is burned for a fact that was
 * never theirs. That is a billing pause on any run, and a hold on offers and news by email on a run of email alone; on a
 * run that also goes another way that hold is this email person's skip. A live hold on the day-before reminder waits
 * (holdForLater). Any other refusal is the person's own, and final: they are skipped with its reason, and the run goes on.
 */
export async function afterRefusal(w: Work, r: RecipientRow, reason: DeliveryRefusal): Promise<Verdict> {
  const { ports, b } = w;
  const emailStop = emailRunStop(reason);
  const stop: RunStop | null = reason === "paused" ? "paused" : emailStop && (await emailAlone(w)) ? emailStop : null;
  if (stop) {
    await release(ports, b.id, r.contact_id, "not_taken");
    await stopForTheWorkspace(ports, b, stop);
    if (stop === "campaigns_domain_unverified")
      await pageTheDomain(
        ports,
        { tenantId: w.cmd.tenantId, id: b.id },
        {
          stopped: true,
          cause: `the door refused an offer by email (${reason}): this runtime holds no verified campaigns domain`,
        },
      );
    return "stop";
  }
  if (reason === "human_has_it" && passesHandoverPause(w.trigger) && (await holdForLater(w, r))) return "go on";
  await w.mark(r.contact_id, { state: "skipped", reason });
  return "go on";
}

/**
 * A day-before reminder the door held because somebody has the thread right now (a call in progress, a teammate speaking:
 * the 24-hour pause no longer stops it, contracts passesHandoverPause, so `human_has_it` here is a live hold, which ends).
 * Not a final skip: the claim is given back (nothing left), the person stays queued, and the run tries them again after
 * BROADCAST_HOLD_WAIT_MS, in the batch's own mechanics (a released person is tried again under a new attempt, 00301). True
 * when they wait. False when the next try would fall outside the day's sending hours: the run has reached the end of the
 * day the reminder is for, and the person is skipped, `human_has_it`, as before. False too when the database refused the
 * release: the person is still claimed, not queued, so nothing would try them again, and a wait counted for them would hold
 * the run for nobody.
 */
async function holdForLater(w: Work, r: RecipientRow): Promise<boolean> {
  const retryAt = new Date(w.ports.now() + jittered(BROADCAST_HOLD_WAIT_MS, w.ports.random));
  if (nextOpenMoment(w.facts.timezone, retryAt).moved) return false;
  if (!(await release(w.ports, w.b.id, r.contact_id, "not_taken"))) return false;
  w.waiting.count += 1;
  w.waiting.retryAt ??= retryAt;
  return true;
}
