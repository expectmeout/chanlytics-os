/** Broadcast: stops. */

import { addressOf, finishedRunHeldWhy, type JobNews, jittered, wireFailure } from "@chanlytics/contracts";
import { errField, logger, logAndGoOn } from "@chanlytics/log";
import type { Delivered } from "../../deliver/deliver";
import type { BroadcastChannel as Channel } from "../broadcast-channels";
import { channelOf, type Work } from "../broadcast-channels";
import { getAppointments, getFeed } from "../broadcast-feed";
import { pageTheDomain, release, stopForTheWorkspace, type Verdict } from "../broadcast-stops";
import type { BroadcastBatchCommand, BroadcastBatchPorts, BroadcastRow, ContactRow, RecipientRow } from "../ports";
import { WIRE_WORDS, gotIt, thenWhat } from "../broadcast-words";
import type { ContactId } from "@chanlytics/contracts";

/** A run as its stop's alert reads it: its name, and whose it is (thenWhat: a playbook's run is not sent again). */
export type StoppedRun = Pick<BroadcastRow, "id" | "name" | "playbook_id" | "audience">;

/**
 * How long a batch that reached nobody waits before it is tried again. The
 * rest of a run is scheduled the moment a batch ends; a batch in which every
 * read failed would otherwise schedule itself again at once, and a read that
 * keeps failing would spin the ledger until somebody canceled by hand.
 */
export const BROADCAST_STALL_RETRY_MS = 60_000;

/**
 * How many batches in a row may reach nobody for a read that failed before the run stops and says so. A minute each
 * (BROADCAST_STALL_RETRY_MS), so about half an hour: a vault or a database that has not answered for that long is an
 * outage, and a run that waited through the evening would send at night the words written for the day.
 */
export const BROADCAST_STALLS_MAX = 30;

/** A broadcast's own lines, by name: a batch or a person it could not read, a wire it could not bind. */
export const broadcastLog = logger();

/**
 * A failure of the wire itself rather than of one person's send: no
 * credentials, no wire for the channel in this runtime, or a provider
 * refusing the credentials outright. Nobody after it can be reached, and
 * marking each of them "WhatsApp refused" would end the run as sent.
 */
export function wireIsDown(out: Extract<Delivered, { outcome: "failed" }>): boolean {
  return (
    out.reason === "no_credentials" ||
    out.reason === "no_sender_for_channel" ||
    (out.reason === "provider" && (out.status === 401 || out.status === 403))
  );
}

/**
 * The door itself threw, with the person already claimed. Nobody knows
 * whether the message left, so the claim stands; and the run stops there
 * rather than claim the next person into the same failure. The job fails
 * with the door's own error, and jobs/settle hands the people still queued
 * to a fresh run, a bounded number of times when every run dies the same way.
 */
export class ThrownAtTheDoor {
  readonly error: unknown;
  constructor(error: unknown) {
    this.error = error;
  }
}

/**
 * Whether this batch may go now, asked before anyone is claimed; when it may not, it has already said so. A paused
 * workspace (tenants.status, written by billing) sends nothing: the run fails with its reason and the owner is told,
 * rather than a template going out under a subscription that stopped. A pause that lands mid-batch is the door's
 * `paused` for the next person, and takes the same way out (stopForTheWorkspace).
 */
export async function stoppedByBilling(ports: BroadcastBatchPorts, b: BroadcastRow): Promise<boolean> {
  if (!(await ports.workspacePaused())) return false;
  await stopForTheWorkspace(ports, b, "paused");
  return true;
}

/**
 * Whether a wire this batch goes by could not be bound, asked of each channel its people use and before anyone is
 * claimed; when one could not, the batch has already waited. A wire that could not be BOUND -- credentials that could
 * not be READ (Vault, the database), which are not credentials that are absent -- claims nobody: nobody knows whether
 * the number is connected, a claim settles only to sent or skipped (00182), never back to queued, so the whole batch
 * waits for the next tick, its people still queued and the run as it was, the way a batch whose people could not be
 * read waits, and nobody is told to reconnect a number that may well be connected. A number that IS absent is the
 * door's answer, per person, as it always was. A channel nobody in the batch goes by is not asked.
 */
export async function wireIsUnbound(
  ports: BroadcastBatchPorts,
  broadcast: BroadcastRow,
  cmd: BroadcastBatchCommand,
  batch: readonly RecipientRow[],
): Promise<boolean> {
  for (const channel of new Set(batch.map(channelOf))) {
    const unbound = await ports.wireUnavailable(channel);
    if (!unbound) continue;
    broadcastLog.error("broadcast_wire_unavailable", { broadcast_id: broadcast.id, channel, reason: unbound });
    const stopped = (await stall(ports, broadcast, cmd, channel)) === "stopped";
    // The platform hears it, as a reply's wait is heard (sendQueued): a store that stays unreadable is its condition.
    await ports
      .page?.(
        `wire_unavailable:${channel}`,
        `${channel}: a workspace's credentials could not be read`,
        `Broadcast ${broadcast.id} ${stopped ? "stopped after waiting the most it may" : "waits"}, everyone still queued: ${unbound}.`,
      )
      ?.catch(() => undefined);
    return true;
  }
  return false;
}

/**
 * The batch's people and what they were already sent, read once for the batch rather than once per person. FAIL
 * CLOSED: a read that fails leaves the whole batch queued rather than guessing about anyone -- "we could not check" is
 * not "yes" -- and the run waits before trying again.
 */
export async function readPeople(
  ports: BroadcastBatchPorts,
  broadcast: BroadcastRow,
  batch: readonly RecipientRow[],
): Promise<Pick<Work, "people" | "priors" | "appointments" | "feed"> & { unreadable: boolean }> {
  const ids = batch.map((r) => r.contact_id);
  if (ids.length === 0)
    return { people: new Map(), priors: new Map(), appointments: new Map(), feed: null, unreadable: false };
  try {
    const [people, priors, appointments, feed] = await Promise.all([
      ports.contacts(ids),
      ports.alreadySent(broadcast.id, ids),
      getAppointments(ports, broadcast, batch),
      getFeed(ports, broadcast, batch),
    ]);
    return { people, priors, appointments, feed, unreadable: false };
  } catch (e) {
    broadcastLog.error("broadcast_batch_unreadable", { broadcast_id: broadcast.id, error: errField(e) });
    return { people: new Map(), priors: new Map(), appointments: new Map(), feed: null, unreadable: true };
  }
}

/** Where a person is reached on their channel, or why not: a number for WhatsApp and a text, an address for an email. */
export function recipientAddressOf(c: ContactRow, channel: Channel): { to: string } | { held: string } {
  const to = channel === "email" ? c.email : c.phone_e164;
  return to ? { to } : { held: channel === "email" ? "no_address" : "no_phone" };
}

/**
 * The batch is over: the run closes and tells the workspace when nobody is left, or places the next batch. A cancel during
 * this batch stops here. A batch that reached nobody waits before the next, a bounded number of times (stall): every read
 * failed, and trying again this second is how a failing read spins the ledger. Unless it reached nobody because everyone
 * it could reach was given back to wait for a live hold (holdForLater), or all that is left is them: then the next batch is
 * placed after the hold, in the day's hours, and is not a failing read to stall on.
 */
export async function afterTheBatch(work: Work, picked: number): Promise<void> {
  const { ports, b, cmd } = work;
  const remaining = await ports.remaining(b.id);
  if (remaining <= 0) {
    const { sent, held } = await ports.tally(b.id);
    // Which reasons its news names only when counted anyone was skipped for, read before the run is closed: a read that
    // fails leaves the run open for the job's next try, where one after the close would lose the owner their news.
    const counted = held > 0 ? await ports.heldFor(b.id) : [];
    await ports.finish(b.id, { sent, held });
    await ports.alert(finishedNews(b, { sent, held, counted }));
    return;
  }
  if ((await ports.state(b.id)) !== "sending") return;
  const { count, retryAt } = work.waiting;
  if (retryAt && (work.marked === 0 || remaining === count))
    await ports.scheduleNext(b.id, retryAt, {
      ...(cmd.waits ? { waits: cmd.waits } : {}),
      ...(cmd.stalls ? { stalls: cmd.stalls } : {}),
    });
  else if (picked > 0 && work.marked === 0) await stall(ports, b, cmd, "people");
  else await ports.scheduleNext(b.id);
}

/**
 * The run FINISHED. Said as what it is, not as a job that did not finish, which is what every alert from this file was
 * kept as until 00141, so two completed broadcasts were counted into Today's "6 jobs did not finish". And as many as it
 * reached, of how many: a run that reached nobody is not "sent", in its words or in its KIND (it was `broadcast_sent`
 * under "reached nobody": the bell's green tick, and "1 broadcast finished" in what Today says you missed; it is a
 * broadcast that did not go out, `broadcast_stopped`). The reasons it gives for who was held name those of contracts
 * HELD_WHEN_COUNTED (an email hold, the week's breath, the month's allowance) only where it skipped someone for one.
 */
function finishedNews(
  input: { id: string; name: string },
  { sent, held, counted }: { sent: number; held: number; counted: readonly string[] },
): JobNews {
  const reason = finishedRunHeldWhy(counted);
  const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
  return {
    kind: sent > 0 ? "broadcast_sent" : "broadcast_stopped",
    route: addressOf({ kind: "send", id: input.id }),
    about: { type: "broadcast", id: input.id },
    subject: sent > 0 ? `Campaign “${input.name}” sent` : `Campaign “${input.name}” reached nobody`,
    body:
      sent > 0
        ? `${sent} of ${people(sent + held)} got it${held ? `; ${held} held back (${reason})` : ""}. Replies land in the Inbox.`
        : `None of the ${people(held)} on it got it: each was held back (${reason}). The run's page says who and why.`,
  };
}

/**
 * What this batch's offers by email wait on, asked before anyone is claimed: "wait" when the batch has already waited,
 * "stopped" when the run has, "closed" when they cannot leave from here and the run goes on without them, "open" otherwise
 * (and for a batch that asks nothing of the campaigns domain). A domain the provider could not be asked about is not a no:
 * the run waits a minute and asks again (a stall, ports offersUnread), and the platform hears of it. Asked only when the
 * run's message is an offer by email (`offers`: contracts isOfferByEmail, which is the business's own news as well,
 * decision D2; a visit's message goes from the mail domain, which is not in question) and someone in the batch goes by email.
 *
 * A campaigns domain the deployment names and the provider does not verify (ports offersClosed) does one of two things, by
 * who is on the run (ports byOtherChannels). A run of email alone stops, saying so, before anyone is claimed
 * (stopForTheWorkspace): everyone left would be held alike, each a skip that is final, and the run would end as having
 * reached nobody. A run that also goes by WhatsApp or text goes on: each person who goes by email is skipped with the
 * door's own reason for it (`email_marketing_disabled`, sendOne: before they are claimed, since no link can be sealed for an
 * offer that cannot leave and `prepare` would hold them as having no channel), and everyone else is reached. Stopped, such
 * a run never reached a WhatsApp person behind the first email person, and the owner, told to send it again, reached the
 * others twice. The platform is paged either way, with which (pageTheDomain).
 */
export async function offersAtTheHead(
  ports: BroadcastBatchPorts,
  { b, cmd, batch, offers }: Pick<Work, "b" | "cmd"> & { batch: readonly RecipientRow[]; offers: boolean },
): Promise<"wait" | "stopped" | "closed" | "open"> {
  if (!offers || !batch.some((r) => channelOf(r) === "email")) return "open";
  const unread = await ports.offersUnread();
  if (unread) {
    broadcastLog.error("broadcast_wire_unavailable", { broadcast_id: b.id, channel: "email", reason: unread });
    const stopped = (await stall(ports, b, cmd, "email")) === "stopped";
    await ports
      .page?.(
        "campaigns_domain_unread",
        "email: a broadcast's offers wait, the campaigns domain could not be checked",
        `Tenant ${cmd.tenantId}, broadcast ${b.id} ${stopped ? "stopped after waiting the most it may" : "waits"}, everyone still queued: ${unread}.`,
      )
      ?.catch(logAndGoOn("paging the platform"));
    return "wait";
  }
  const reason = await ports.offersClosed();
  if (!reason) return "open";
  const alone = !(await ports.byOtherChannels(b.id, "email"));
  if (alone) await stopForTheWorkspace(ports, b, "campaigns_domain_unverified");
  await pageTheDomain(ports, { tenantId: cmd.tenantId, id: b.id }, { stopped: alone, cause: reason });
  return alone ? "stopped" : "closed";
}

/**
 * The provider did not take the message, and the claim goes back (release), named for what happened. A 429 or 408 is its
 * "not now" (reached); no answer at all is a provider this run could not reach. The run waits either way (backOff).
 */
export async function giveBack(
  ports: BroadcastBatchPorts,
  personName: { broadcastId: string; contactId: ContactId },
  reached: boolean,
  channel: Channel,
): Promise<Verdict> {
  await release(ports, personName.broadcastId, personName.contactId, reached ? "throttled" : "not_taken");
  return { back: reached ? "throttled" : "unreachable", channel };
}

/** What the door's refusal to take a send becomes here: its status, 0 when the provider was never reached. */
export type NotTaken = { outcome: "not_taken"; status: number };

/**
 * A batch that reached nobody because a read failed (the number's credentials, or its people) waits a minute and tries
 * again, the count carried in the job; past BROADCAST_STALLS_MAX in a row it stops and the owner is told. Before, it
 * waited a minute for ever: a vault out from 7:50 PM to 11 PM re-queued the run a hundred and ninety times, then sent
 * the day's template at 11 PM.
 */
async function stall(
  ports: BroadcastBatchPorts,
  stoppedRun: StoppedRun,
  cmd: BroadcastBatchCommand,
  /** What could not be read: the people, or the credentials of this channel's wire (for the owner's words). */
  kind: "people" | Channel,
): Promise<"waits" | "stopped"> {
  const stalls = (cmd.stalls ?? 0) + 1;
  if (stalls <= BROADCAST_STALLS_MAX) {
    const at = new Date(ports.now() + jittered(BROADCAST_STALL_RETRY_MS, ports.random));
    await ports.scheduleNext(stoppedRun.id, at, { ...(cmd.waits ? { waits: cmd.waits } : {}), stalls });
    return "waits";
  }
  // The tally is best effort: a database that has not answered for half an hour may not answer for it either.
  const sent = await ports.tally(stoppedRun.id).then(
    (t) => t.sent,
    () => null,
  );
  const fine = kind === "people" ? "Nothing is wrong with your channels" : WIRE_WORDS[kind].fine;
  // The failure says what could not be read, and for a wire's credentials which wire: the words for each are the channel's own.
  await ports.fail(stoppedRun.id, kind === "people" ? "people_unreadable" : wireFailure("stalled", kind));
  await ports.alert({
    kind: "broadcast_stopped",
    route: addressOf({ kind: "send", id: stoppedRun.id }),
    about: { type: "broadcast", id: stoppedRun.id },
    subject: `Campaign “${stoppedRun.name}” stopped`,
    body: [
      `${kind === "people" ? "The people on it" : WIRE_WORDS[kind].credentials} could not be read for about half an hour, so the rest was not sent.`,
      gotIt(sent),
      thenWhat(stoppedRun, fine, `${fine}; send it again later.`, "tomorrow"),
    ]
      .filter(Boolean)
      .join(" "),
  });
  return "stopped";
}

/**
 * A run that is found outside the day's sending hours, one that waited and woke there or one that went on into them, stops,
 * and the owner is told.
 */
export async function stopAfterHours(
  ports: BroadcastBatchPorts,
  stoppedRun: StoppedRun,
  waited: boolean,
): Promise<void> {
  const sent = await ports.tally(stoppedRun.id).then((t) => t.sent, logAndGoOn("tally", null));
  await ports.fail(stoppedRun.id, "after_hours");
  await ports.alert({
    kind: "broadcast_stopped",
    route: addressOf({ kind: "send", id: stoppedRun.id }),
    about: { type: "broadcast", id: stoppedRun.id },
    subject: `Campaign “${stoppedRun.name}” stopped`,
    body: [
      waited
        ? "It was waiting to go on when the day's sending hours ran out, so the rest was not sent."
        : "The day's sending hours ran out before it was done, so the rest was not sent.",
      gotIt(sent),
      thenWhat(stoppedRun, null, "Send it again tomorrow.", "tomorrow"),
    ]
      .filter(Boolean)
      .join(" "),
  });
}
