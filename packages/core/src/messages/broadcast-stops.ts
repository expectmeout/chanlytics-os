/**
 * How a broadcast's batch ends a person's turn when the door says no, and when the whole run must stop (broadcast.ts): the
 * claim given back, a run stopped for a fact about the whole workspace, a day-before reminder that waits for a live hold.
 * Split from broadcast.ts, which sends; this is what it does with a refusal.
 */
import {
  BROADCAST_HOLD_WAIT_MS,
  jittered,
  nextOpenMoment,
  passesHandoverPause,
  workspaceRefusalFailure,
  type WorkspaceFailure,
} from "@chanlytics/contracts";
import { errField, logger } from "@chanlytics/channels";
import type { Channel, DeliveryRefusal } from "../deliver";
import type { Work } from "./broadcast-channels";
import { WORKSPACE_STOP_WORDS } from "./broadcast-words";
import type { BroadcastBatchCommand, BroadcastBatchPorts, RecipientRow } from "./ports";

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
 * same, and this one person keeps the claim, which is what such a person got before.
 */
export async function release(
  ports: BroadcastBatchPorts,
  broadcastId: string,
  contactId: string,
  reason: "throttled" | "not_taken",
): Promise<void> {
  await ports.mark(broadcastId, contactId, { state: "queued", reason, message_id: null }).catch((e: unknown) => {
    stopLog.error("broadcast_release_refused", {
      broadcast_id: broadcastId,
      contact_id: contactId,
      error: errField(e),
    });
  });
}

/**
 * THE one place a run stops for a fact about the whole workspace, which everyone left on it would meet alike (contracts
 * workspaceRefusalFailure): a billing pause, the workspace's offers by email paused by a gate, and the campaigns domain
 * offers by email leave from not being this deployment's to use. Met at the head of a batch (stoppedByBilling,
 * offersAreClosed) or at the door by the first person it applied to (afterRefusal): the run fails with the failure, the owner
 * is told how many it reached before and what to do, and everyone not yet reached stays unsent (queued), where each of them
 * skipped for it would have ended the run as "sent" with nobody told why. A domain the provider does not verify is the
 * platform's to hear as well (`cause` is what it is paged with); a gate's pause was paged where it tripped (the edge's
 * offer-gates), and a billing pause is the owner's.
 */
export async function stopForTheWorkspace(
  ports: BroadcastBatchPorts,
  b: { id: string; name: string },
  cmd: Pick<BroadcastBatchCommand, "tenantId">,
  stop: { failure: WorkspaceFailure; cause?: string },
): Promise<void> {
  const { failure, cause } = stop;
  // The tally is best effort: the run is stopping for a reason that may be the database's own.
  const sent = await ports.tally(b.id).then(
    (t) => t.sent,
    () => null,
  );
  await ports.fail(b.id, failure);
  const words = WORKSPACE_STOP_WORDS[failure];
  await ports.alert({
    kind: "broadcast_stopped",
    route: "broadcasts",
    about: { type: "broadcast", id: b.id },
    subject: `Broadcast “${b.name}” ${failure === "paused" && sent === 0 ? "not sent" : "stopped"}`,
    body: `${words.cause(sent)} ${words.fix}`,
  });
  if (failure === "campaigns_domain_unverified")
    await ports
      .page?.(
        "campaigns_domain_unverified",
        "email: a broadcast's offers could not leave, the campaigns domain is not verified",
        `Tenant ${cmd.tenantId}, broadcast ${b.id} stopped, everyone not yet sent still queued: ${cause ?? "the campaigns domain is not this runtime's to use"}.`,
      )
      ?.catch(() => undefined);
}

/**
 * The door refused this person, and what the run does about it. A refusal that holds for the whole workspace stops the run
 * (stopForTheWorkspace), after this person's claim is given back: nothing left, and nobody is burned for a fact that was
 * never theirs. A live hold on the day-before reminder waits (holdForLater). Any other refusal is the person's own, and
 * final: they are skipped with its reason, and the run goes on.
 */
export async function afterRefusal(w: Work, r: RecipientRow, reason: DeliveryRefusal): Promise<Verdict> {
  const { ports, b } = w;
  const failure = workspaceRefusalFailure(reason);
  if (failure) {
    await release(ports, b.id, r.contact_id, "not_taken");
    await stopForTheWorkspace(ports, b, w.cmd, {
      failure,
      ...(failure === "campaigns_domain_unverified"
        ? { cause: `the door refused an offer by email (${reason}): this runtime holds no verified campaigns domain` }
        : {}),
    });
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
 * day the reminder is for, and the person is skipped, `human_has_it`, as before.
 */
async function holdForLater(w: Work, r: RecipientRow): Promise<boolean> {
  const retryAt = new Date(w.ports.now() + jittered(BROADCAST_HOLD_WAIT_MS, w.ports.random));
  if (nextOpenMoment(w.facts.timezone, retryAt).moved) return false;
  await release(w.ports, w.b.id, r.contact_id, "not_taken");
  w.waiting.count += 1;
  w.waiting.retryAt ??= retryAt;
  return true;
}
