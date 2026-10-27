import {
  addressOf,
  BROADCAST_CHUNK,
  BROADCAST_GAP_MS,
  BROADCAST_THROTTLE_WAITS_MS,
  finishedRunHeldWhy,
  OUTCOME_UNKNOWN,
  type JobNews,
  audienceTrigger,
  campaignMessageOf,
  firstNameOf,
  isOfferByEmail,
  isReachOutRun,
  jittered,
  messageAboutOfTrigger,
  messageHolds,
  nextOpenMoment,
  resolveParams,
  triggerOf,
  versionsOf,
  whatsappStoppedRunWords,
  wireFailure,
} from "@chanlytics/contracts";
import { errField, logger } from "@chanlytics/channels";
import type { Delivered, Delivery } from "../deliver";
import type { BroadcastChannel as Channel } from "./broadcast-channels";
import { isNotTakenError, isWireUnavailableError } from "../wire-senders";
import {
  batchSlots,
  channelOf,
  countSent,
  overAllowance,
  purposeAtTheDoor,
  queueEmailRow,
  rowFacts,
  rowHold,
  prepare,
  startsInTime,
  type Work,
} from "./broadcast-channels";
import { appointmentsOf, feedOf, visitStands } from "./broadcast-feed";
import { afterRefusal, pageTheDomain, release, stopForTheWorkspace, type Verdict } from "./broadcast-stops";
import type { BroadcastBatchCommand, BroadcastBatchPorts, BroadcastRow, ContactRow, RecipientRow } from "./ports";
import { LIMIT_WORDS, WIRE_WORDS, gotIt, thenWhat } from "./broadcast-words";
import { pageTheProvider } from "./provider-page";

/** A run as its stop's alert reads it: its name, and whose it is (thenWhat: a playbook's run is not sent again). */
type StoppedRun = Pick<BroadcastRow, "id" | "name" | "playbook_id" | "audience">;

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
const broadcastLog = logger();

/**
 * A failure of the wire itself rather than of one person's send: no
 * credentials, no wire for the channel in this runtime, or a provider
 * refusing the credentials outright. Nobody after it can be reached, and
 * marking each of them "WhatsApp refused" would end the run as sent.
 */
function wireIsDown(out: Extract<Delivered, { outcome: "failed" }>): boolean {
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
class ThrownAtTheDoor {
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
async function stoppedByBilling(ports: BroadcastBatchPorts, b: BroadcastRow): Promise<boolean> {
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
async function wireIsUnbound(
  ports: BroadcastBatchPorts,
  b: BroadcastRow,
  cmd: BroadcastBatchCommand,
  batch: readonly RecipientRow[],
): Promise<boolean> {
  for (const channel of new Set(batch.map(channelOf))) {
    const unbound = await ports.wireUnavailable(channel);
    if (!unbound) continue;
    broadcastLog.error("broadcast_wire_unavailable", { broadcast_id: b.id, channel, reason: unbound });
    const stopped = (await stall(ports, b, cmd, channel)) === "stopped";
    // The platform hears it, as a reply's wait is heard (sendQueued): a store that stays unreadable is its condition.
    await ports
      .page?.(
        `wire_unavailable:${channel}`,
        `${channel}: a workspace's credentials could not be read`,
        `Broadcast ${b.id} ${stopped ? "stopped after waiting the most it may" : "waits"}, everyone still queued: ${unbound}.`,
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
async function readPeople(
  ports: BroadcastBatchPorts,
  b: BroadcastRow,
  batch: readonly RecipientRow[],
): Promise<Pick<Work, "people" | "priors" | "appointments" | "feed"> & { unreadable: boolean }> {
  const ids = batch.map((r) => r.contact_id);
  if (ids.length === 0)
    return { people: new Map(), priors: new Map(), appointments: new Map(), feed: null, unreadable: false };
  try {
    const [people, priors, appointments, feed] = await Promise.all([
      ports.contacts(ids),
      ports.alreadySent(b.id, ids),
      appointmentsOf(ports, b, batch),
      feedOf(ports, b, batch),
    ]);
    return { people, priors, appointments, feed, unreadable: false };
  } catch (e) {
    broadcastLog.error("broadcast_batch_unreadable", { broadcast_id: b.id, error: errField(e) });
    return { people: new Map(), priors: new Map(), appointments: new Map(), feed: null, unreadable: true };
  }
}

/** Where a person is reached on their channel, or why not: a number for WhatsApp and a text, an address for an email. */
function recipientAddressOf(c: ContactRow, channel: Channel): { to: string } | { held: string } {
  const to = channel === "email" ? c.email : c.phone_e164;
  return to ? { to } : { held: channel === "email" ? "no_address" : "no_phone" };
}

/**
 * One person, to the wire and back. "stop" when the run cannot go on past them; a back-off when the provider said not
 * now, or the request never reached it at all (giveBack).
 */
async function sendOne(w: Work, r: RecipientRow): Promise<Verdict> {
  const { ports, b } = w;
  const skip = async (reason: string): Promise<Verdict> => {
    await w.mark(r.contact_id, { state: "skipped", reason });
    return "go on";
  };
  const c = w.people.get(r.contact_id) ?? null;
  if (!c || c.erased_at) return skip("erased");
  const channel = channelOf(r);
  const where = recipientAddressOf(c, channel);
  if ("held" in where) return skip(where.held);
  // A run that died between the wire and its own bookkeeping left this
  // person a message row and a queued recipient row. Resumed (jobs/settle
  // reschedules the rest), the batch reads the row rather than sending twice:
  // they got it, and the recipient row now says so.
  const prior = w.priors.get(c.id) ?? null;
  // Their row records when the message actually LEFT, not when this run
  // noticed it had: the broadcast's page lists its people in that order, and
  // a resumed run stamping "now" on an hour-old send reorders the whole list.
  if (prior) {
    await w.mark(r.contact_id, { state: "sent", message_id: prior.id, sent_at: prior.sentAt });
    return "go on";
  }
  // Their own row holds them (rowHold): left out for the week's breath, or a reminder's appointment, asked again at the send
  // (decision 0002): one that moved, was cancelled or left the calendar since the run drew it holds the person, never a
  // message for a time that no longer stands. The record is asked, and the calendar feed beside it (S1-05), which is newer
  // than the record by up to the hourly sweep; a feed that could not be read leaves a reminder for a calendar event queued
  // for the next batch, never sent on a guess (broadcast-feed.ts).
  const rowHeld = rowHold(r, () => visitStands(w, r));
  if (rowHeld) return skip(rowHeld);
  // Meta no longer approves WhatsApp's template: that holds the people who go by WhatsApp, and by no other channel, who
  // stay as they were and go on their own versions (the run fails only when nobody else is on it, below).
  if (channel === "whatsapp" && !w.whatsappApproved) return skip("template_not_approved");
  // The campaigns domain an offer by email leaves from cannot be used, on a run that also goes another way (the head,
  // offersAtTheHead): each person who goes by email is held for it, the door's own reason; the run goes on for the others.
  if (channel === "email" && w.offersClosed) return skip("email_marketing_disabled");
  // Chanlytics pays for emails and texts, so it meters them: a person past the month's allowance is held on their
  // channel, never moved to another (contracts CAMPAIGN_MONTH_ALLOWANCE).
  if (channel !== "whatsapp" && (await overAllowance(w, channel))) return skip("month_allowance");
  // The thread this send belongs to: by their number, or for an email by the person, never created here. Which yes
  // this message needs, the pause, and the workspace's status are the door's to re-read at the wire, below -- the one
  // place a stale answer cannot be taken back.
  const target = channel === "email" ? await ports.targetOfContact(c.id) : await ports.target(where.to);
  if (!target) return skip("no_thread");

  // Their own words in the slots: a first name nobody has on file reads "there"; a slot nothing can fill (a review link
  // nobody keeps) holds the person, never a blank send. A visit run's words were resolved when the run was made.
  const facts = rowFacts(r);
  const params = resolveParams(w.specs, {
    firstName: firstNameOf(c.display_name, c.wa_profile_name, { source: c.name_source, settled: !!c.name_settled_at }),
    businessName: w.facts.businessName,
    bookingLink: w.facts.bookingLink,
    reviewLink: w.reviewLink,
    visitWhen: typeof facts.visit_when === "string" ? facts.visit_when : null,
    visitService: typeof facts.visit_service === "string" ? facts.visit_service : null,
    // A follow-up's link, frozen when the run was made (0006).
    proposalLink: typeof facts.proposal_link === "string" ? facts.proposal_link : null,
  });
  if (params.some((v) => !v)) return skip("missing_value");
  const made = await prepare(w, { r, c, channel, to: where.to, conversationId: target.conversationId, params });
  if ("held" in made) return skip(made.held);

  // CLAIM THIS PERSON BEFORE THE WIRE IS TOUCHED. deliver records a
  // broadcast's message only once the provider has accepted it, so a run
  // killed in between leaves no message row: `alreadySent` above finds
  // nothing, this row still says 'queued', and the resumed run sends the same
  // template to the same person a second time — the one thing a broadcast
  // must never do, and the thing the whole SPEAKS_TO_A_PERSON rule exists to
  // prevent. Written first, the row says "a run was mid-send here and nobody
  // knows how it went", and a moment later it is overwritten with the truth
  // (sent or skipped: the one failed the guard lets move on, 00182).
  // The trade is deliberate: it risks one person who WOULD have been sent to
  // and now is not, in the gap between two adjacent writes, to close a gap
  // the width of a call to Meta — and between those two, never twice wins.
  // A compare-and-set: it takes only a person still queued, so two runs that overlap cannot both claim, and so both
  // send, the same person. One that another run took first is that run's, and nothing more is done here.
  if (!(await ports.mark(b.id, r.contact_id, { state: "failed", reason: OUTCOME_UNKNOWN }))) return "go on";
  // An email's queued row is written only now, with the claim held: a claim that was lost or failed left none behind. A
  // write that fails gives the claim back (nothing was written, nothing left), and the person waits queued like one
  // whose thread could not be read; a row under that id that has had its say is not sent again. The row is written
  // claimed for the wire too (ports queueEmail), so a member's cancel-send cannot win it while the provider answers.
  const queued = await queueEmailRow(w, made).catch(async (e: unknown) => {
    await release(ports, b.id, r.contact_id, "not_taken");
    throw e;
  });
  if (!queued) return skip("send_failed");
  // The door. It asks the one predicate with this template's purpose — a
  // promotional send needs the yes to offers, an appointment reminder the
  // yes to conversation — and it asks at the wire, whatever the route found
  // when it enrolled them; then the pause, the workspace's status, the send
  // on the tenant's credentials, and the row either way. A refusal leaves no
  // row: the person's own line says why they were held. A broadcast is the
  // owner's words (the row says so) sent by the machine (the door is told so). An email's row is already written,
  // queued, and the door finalizes it. A door that throws before the wire leaves that row queued, so it is withdrawn
  // here (a row the door settled is not touched): none is left to count against the month. A wire that could not be
  // bound at the send (the number this person wrote to, of a workspace's two) left nothing either, as one not taken.
  const out = await ports.deliver(made.delivery).catch(async (e: unknown): Promise<NotTaken> => {
    if (isNotTakenError(e)) return { outcome: "not_taken", status: e.status };
    if (isWireUnavailableError(e)) return { outcome: "not_taken", status: 0 };
    await withdrawQueued(ports, b, made.delivery);
    throw new ThrownAtTheDoor(e);
  });
  if (out.outcome === "not_taken") {
    // Nothing left: an email's queued row is withdrawn so nothing stays queued, and the next try writes its own.
    await withdrawQueued(ports, b, made.delivery);
    return giveBack(ports, { broadcastId: b.id, contactId: r.contact_id }, out.status !== 0, channel);
  }
  if (out.outcome === "sent") {
    // The claim's "nobody knows" is settled: a sent row carries no reason.
    countSent(w, channel);
    await w.mark(r.contact_id, { state: "sent", reason: null, message_id: out.messageId });
    return "go on";
  }
  if (out.outcome === "refused") return afterRefusal(w, r, out.reason);
  if (out.throttled) return giveBack(ports, { broadcastId: b.id, contactId: r.contact_id }, true, channel);
  // The mail provider's day or month is used up: nobody after this person can go either, so the run stops, as a wire
  // that is down stops it, and they stay queued with the rest (nobody is burned as refused for a limit that lifts).
  if (out.limit === "daily" || out.limit === "monthly") {
    await stopForTheLimit(w, r.contact_id, out, out.limit);
    return "stop";
  }
  await w.mark(r.contact_id, { state: "failed", reason: "send_failed", message_id: out.messageId });
  if (!wireIsDown(out)) return "go on";
  await stopForTheWire(w, out, channel);
  return "stop";
}

/**
 * broadcast_send: one batch of a broadcast, then the next.
 *
 * The route enrolled the recipients, each on the channel picked for them (contracts reachFor); this sends to up to
 * BROADCAST_CHUNK of them, each on their own channel -- WhatsApp's template, a text's version, an email's version from
 * the hosted mailbox -- re-checking each person at the wire, the one place a miss is unrecoverable, and records why
 * anyone was held back. Then it schedules itself again for the rest, or closes the broadcast and tells the workspace.
 * A canceled broadcast stops at the next batch; a WhatsApp version that is no longer approved fails a run that goes by
 * WhatsApp alone before a single send; a wire that is down fails it at the first person it cannot reach.
 */
export async function sendBroadcastBatch(ports: BroadcastBatchPorts, cmd: BroadcastBatchCommand): Promise<void> {
  const b = await ports.broadcast(cmd.broadcastId);
  if (!b) return;
  // Only a scheduled or sending broadcast goes out: a run waiting for a
  // person (pending_approval) has no job, and one that ended stays ended.
  if (b.state !== "scheduled" && b.state !== "sending") return;
  // A reach-out's run has no recipients here: its sends are the reach-out clock's (Part 3). A job that reached one
  // would end it as sent to nobody, and the clock would claim nothing more from it.
  if (isReachOutRun(b.audience)) return;
  if (await stoppedByBilling(ports, b)) return;
  // The day's sending hours, asked at the head of every batch rather than only after a wait: a long run that began inside
  // them would otherwise go on, batch after batch, past the last hour.
  const facts = await ports.facts();
  if (await outsideTheHours(ports, b, cmd, facts.timezone)) return;
  const slots = await batchSlots(ports, b.params);
  // Who is next, before the wires are asked about: the channels this batch goes by are its people's.
  const batch = await ports.batch(b.id, BROADCAST_CHUNK);
  if (await wireIsUnbound(ports, b, cmd, batch)) return;
  // Only while still scheduled: a cancel that landed between the read above
  // and this write is the row's answer, and the batch sends nothing.
  if (b.state === "scheduled" && !(await ports.startSending(b.id))) return;

  // The message, read once: its rows on every channel. Its WhatsApp version must still be what Meta approved (and whole,
  // contracts messageHolds). When it is not, that holds the run's WhatsApp people alone (sendOne skips them,
  // template_not_approved) and the run goes on for whoever is on email or text, on their own versions; only a run with
  // nobody else on it fails, before a single send. A message with no row at all holds nobody's WhatsApp, as a missing row did.
  const rows = await ports.message(b.template_name, b.template_language);
  const message = campaignMessageOf(rows, b.template_name, b.template_language);
  const {
    whatsapp: [whatsappRow = null],
  } = versionsOf(rows, b.template_name);
  const whatsappApproved = message !== null && messageHolds(message).whatsapp;
  if (!whatsappApproved && !(await ports.byOtherChannels(b.id, "whatsapp"))) {
    await ports.fail(b.id, "template_not_approved");
    await ports.alert({
      kind: "broadcast_stopped",
      route: addressOf({ kind: "send", id: b.id }),
      about: { type: "broadcast", id: b.id },
      subject: `Campaign “${b.name}” stopped`,
      body: whatsappStoppedRunWords(message),
    });
    return;
  }

  // WHICH yes this send needs. The message's own purpose (contracts campaignMessageOf): Meta's category is the authority
  // where it has a WhatsApp row, in any status — it can recategorise a live template — and else the category its email's
  // and text's rows carry. purposeOfTemplate fails closed, so a message whose category we do not have (or that has no row at
  // all) reads as marketing and needs the stronger consent rather than the weaker one. Whichever channel it goes by; and a
  // playbook's run asks the stricter of it and its moment's class, as its enrolment did (purposeAtTheDoor). (What fills
  // each slot, typed text once and the rest per person, and the workspace's own words for the slots that name it, are
  // `slots` and `facts`, read once above.)
  // The moment a playbook's run was made for (contracts audienceTrigger), null for a broadcast: a visit run is never held by the
  // month's allowance, and what its message is about, the pause it passes and whether it is an offer by email follow from it.
  const trigger = audienceTrigger(b.audience);
  const purpose = purposeAtTheDoor(trigger, message);
  const offers = isOfferByEmail({ channel: "email", purpose, proactive: true, about: messageAboutOfTrigger(trigger) });
  const head = await offersAtTheHead(ports, { b, cmd, batch, offers });
  if (head === "wait" || head === "stopped") return;
  const { people, priors, appointments, feed, unreadable } = await readPeople(ports, b, batch);
  const w: Work = {
    ports,
    cmd,
    b,
    // The message's own purpose, kept when Meta no longer approves its WhatsApp row (a message that is gone reads as marketing).
    purpose,
    tpl: whatsappRow ?? { body_preview: null },
    whatsappApproved,
    rows,
    ...slots,
    facts,
    people,
    priors,
    appointments,
    feed,
    month: {},
    offersClosed: head === "closed",
    // The head asked, where the domain was closed: the run goes on, so somebody on it goes another way.
    emailAlone: head === "closed" ? false : null,
    trigger,
    marked: 0,
    waiting: { count: 0, retryAt: null },
    mark: async (contactId, patch) => {
      w.marked += 1;
      await ports.mark(b.id, contactId, patch);
    },
  };

  let begun = 0;
  let yielded = false;
  for (const [i, r] of batch.entries()) {
    if (unreadable) break;
    // Yield before the runner's ceiling rather than be killed mid-send: no new
    // send starts after the deadline, and the follow-up job below carries the
    // rest. One person at least, so a batch that starts late still moves on --
    // but never a send whose own wire would outlive the function (startsInTime),
    // the first's included: that leaves the rest queued, and is no stall.
    if (begun > 0 && ports.now() >= cmd.deadline) break;
    yielded = !startsInTime(cmd, r, ports.now());
    if (yielded) break;
    begun += 1;
    // FAIL CLOSED per person: a read that fails before the door — their
    // thread, the words for their slots — leaves them queued for the next
    // batch rather than guessing; and one person's failure is never the
    // batch's: the people after them are still reached. The door itself is
    // the exception (ThrownAtTheDoor).
    let verdict: Verdict;
    try {
      verdict = await sendOne(w, r);
    } catch (e) {
      if (e instanceof ThrownAtTheDoor) throw e.error;
      broadcastLog.error("broadcast_person_unreadable", { contact_id: r.contact_id, error: errField(e) });
      continue;
    }
    if (verdict === "stop") return;
    if (verdict !== "go on") return backOff(ports, b, cmd, { ...verdict, timezone: facts.timezone });
    // A breath between two sends, none after the last: the next batch is a job away.
    if (BROADCAST_GAP_MS > 0 && i < batch.length - 1) await ports.sleep(BROADCAST_GAP_MS);
  }

  // A batch that stopped at its wire's moment is no failing read: the next is placed at once, never stalled on.
  await afterTheBatch(w, yielded ? 0 : batch.length);
}

/**
 * The batch is over: the run closes and tells the workspace when nobody is left, or places the next batch. A cancel during
 * this batch stops here. A batch that reached nobody waits before the next, a bounded number of times (stall): every read
 * failed, and trying again this second is how a failing read spins the ledger. Unless it reached nobody because everyone
 * it could reach was given back to wait for a live hold (holdForLater), or all that is left is them: then the next batch is
 * placed after the hold, in the day's hours, and is not a failing read to stall on.
 */
async function afterTheBatch(w: Work, picked: number): Promise<void> {
  const { ports, b, cmd } = w;
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
  const { count, retryAt } = w.waiting;
  if (retryAt && (w.marked === 0 || remaining === count))
    await ports.scheduleNext(b.id, retryAt, {
      ...(cmd.waits ? { waits: cmd.waits } : {}),
      ...(cmd.stalls ? { stalls: cmd.stalls } : {}),
    });
  else if (picked > 0 && w.marked === 0) await stall(ports, b, cmd, "people");
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
  b: { id: string; name: string },
  { sent, held, counted }: { sent: number; held: number; counted: readonly string[] },
): JobNews {
  const why = finishedRunHeldWhy(counted);
  const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
  return {
    kind: sent > 0 ? "broadcast_sent" : "broadcast_stopped",
    route: addressOf({ kind: "send", id: b.id }),
    about: { type: "broadcast", id: b.id },
    subject: sent > 0 ? `Campaign “${b.name}” sent` : `Campaign “${b.name}” reached nobody`,
    body:
      sent > 0
        ? `${sent} of ${people(sent + held)} got it${held ? `; ${held} held back (${why})` : ""}. Replies land in the Inbox.`
        : `None of the ${people(held)} on it got it: each was held back (${why}). The run's page says who and why.`,
  };
}

/**
 * The day's sending hours (contracts nextOpenMoment: nine to the twenty-hundred hour, by the business's clock), asked at
 * the head of EVERY batch. Asked only after a wait, a long run that began inside them went on past the last hour: a
 * 2,000-person run started at 8:45 PM was sent batch after batch until it was done. True when nothing is to be sent now.
 *
 * The rest of an evening run WAITS for the open moment, as the pages promise ("Sends wait for 9:00–20:59"): the next batch
 * is placed at nine by the business's clock, the run stays `sending`, and nobody it reached is reached again. Ending it was
 * worse than late: the owner was told to send it again, and that reaches the whole list, those it reached included
 * (broadcastFailureFix). Two runs END (`after_hours`) instead. A visit's, whose words name the day ("tomorrow at 2:00 PM",
 * "yesterday"): at nine the next morning they would be wrong, which is why a late approval of one is refused
 * (contracts runDayPassed). And one that waited (a throttle, a stall) and woke past the hours, as backOff and stall already
 * end it: that wait is the run's own trouble, said as such.
 */
async function outsideTheHours(
  ports: BroadcastBatchPorts,
  b: BroadcastRow,
  cmd: BroadcastBatchCommand,
  timezone: string,
): Promise<boolean> {
  const open = nextOpenMoment(timezone, new Date(ports.now()));
  if (!open.moved) return false;
  const waited = (cmd.waits ?? 0) > 0 || (cmd.stalls ?? 0) > 0;
  const dayBound = triggerOf(audienceTrigger(b.audience) ?? "")?.kind === "visit";
  if (waited || dayBound) await stopAfterHours(ports, b, waited);
  else await ports.scheduleNext(b.id, open.at);
  return true;
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
async function offersAtTheHead(
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
      ?.catch(() => undefined);
    return "wait";
  }
  const why = await ports.offersClosed();
  if (!why) return "open";
  const alone = !(await ports.byOtherChannels(b.id, "email"));
  if (alone) await stopForTheWorkspace(ports, b, "campaigns_domain_unverified");
  await pageTheDomain(ports, { tenantId: cmd.tenantId, id: b.id }, { stopped: alone, cause: why });
  return alone ? "stopped" : "closed";
}

/**
 * The provider did not take the message, and the claim goes back (release), named for what happened. A 429 or 408 is its
 * "not now" (reached); no answer at all is a provider this run could not reach. The run waits either way (backOff).
 */
async function giveBack(
  ports: BroadcastBatchPorts,
  who: { broadcastId: string; contactId: string },
  reached: boolean,
  channel: Channel,
): Promise<Verdict> {
  await release(ports, who.broadcastId, who.contactId, reached ? "throttled" : "not_taken");
  return { back: reached ? "throttled" : "unreachable", channel };
}

/** What the door's refusal to take a send becomes here: its status, 0 when the provider was never reached. */
type NotTaken = { outcome: "not_taken"; status: number };

/**
 * A batch that reached nobody because a read failed (the number's credentials, or its people) waits a minute and tries
 * again, the count carried in the job; past BROADCAST_STALLS_MAX in a row it stops and the owner is told. Before, it
 * waited a minute for ever: a vault out from 7:50 PM to 11 PM re-queued the run a hundred and ninety times, then sent
 * the day's template at 11 PM.
 */
async function stall(
  ports: BroadcastBatchPorts,
  b: StoppedRun,
  cmd: BroadcastBatchCommand,
  /** What could not be read: the people, or the credentials of this channel's wire (for the owner's words). */
  what: "people" | Channel,
): Promise<"waits" | "stopped"> {
  const stalls = (cmd.stalls ?? 0) + 1;
  if (stalls <= BROADCAST_STALLS_MAX) {
    const at = new Date(ports.now() + jittered(BROADCAST_STALL_RETRY_MS, ports.random));
    await ports.scheduleNext(b.id, at, { ...(cmd.waits ? { waits: cmd.waits } : {}), stalls });
    return "waits";
  }
  // The tally is best effort: a database that has not answered for half an hour may not answer for it either.
  const sent = await ports.tally(b.id).then(
    (t) => t.sent,
    () => null,
  );
  const fine = what === "people" ? "Nothing is wrong with your channels" : WIRE_WORDS[what].fine;
  // The failure says what could not be read, and for a wire's credentials which wire: the words for each are the channel's own.
  await ports.fail(b.id, what === "people" ? "people_unreadable" : wireFailure("stalled", what));
  await ports.alert({
    kind: "broadcast_stopped",
    route: addressOf({ kind: "send", id: b.id }),
    about: { type: "broadcast", id: b.id },
    subject: `Campaign “${b.name}” stopped`,
    body: [
      `${what === "people" ? "The people on it" : WIRE_WORDS[what].credentials} could not be read for about half an hour, so the rest was not sent.`,
      gotIt(sent),
      thenWhat(b, fine, `${fine}; send it again later.`, "tomorrow"),
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
async function stopAfterHours(ports: BroadcastBatchPorts, b: StoppedRun, waited: boolean): Promise<void> {
  const sent = await ports.tally(b.id).then(
    (t) => t.sent,
    () => null,
  );
  await ports.fail(b.id, "after_hours");
  await ports.alert({
    kind: "broadcast_stopped",
    route: addressOf({ kind: "send", id: b.id }),
    about: { type: "broadcast", id: b.id },
    subject: `Campaign “${b.name}” stopped`,
    body: [
      waited
        ? "It was waiting to go on when the day's sending hours ran out, so the rest was not sent."
        : "The day's sending hours ran out before it was done, so the rest was not sent.",
      gotIt(sent),
      thenWhat(b, null, "Send it again tomorrow.", "tomorrow"),
    ]
      .filter(Boolean)
      .join(" "),
  });
}

/**
 * The platform hears what the provider said to this run, as it hears it of a reply (provider-page.ts: one helper, so the
 * same refusal is paged under the same key whichever way the send was made). A pager that throws never turns a run that
 * stopped for it into a run that failed to say so.
 */
async function pageForTheRun(w: Work, out: Extract<Delivered, { outcome: "failed" }>, channel: Channel): Promise<void> {
  await pageTheProvider(
    w.ports,
    { channel, purpose: w.purpose, out },
    `Tenant ${w.cmd.tenantId}, broadcast ${w.b.id}, everyone not yet sent still queued`,
  ).catch(() => undefined);
}

/**
 * The wire, not the person: the run stops here and says so, rather than burning everyone still queued as refused and
 * ending as "sent". A provider that refuses the key outright (401, 403) is paged, as a reply's refusal is; and where that
 * key is the deployment's (email's) the owner is not told to fix their mailbox, which was never at fault.
 */
async function stopForTheWire(
  w: Work,
  out: Extract<Delivered, { outcome: "failed" }>,
  channel: Channel,
): Promise<void> {
  const { ports, b } = w;
  const words = WIRE_WORDS[channel];
  const cause =
    out.reason === "no_credentials"
      ? words.notConnected
      : out.reason === "no_sender_for_channel"
        ? words.noWire
        : `${words.answered} ${out.status}`;
  await ports.fail(b.id, wireFailure("wire_unavailable", channel));
  await pageForTheRun(w, out, channel);
  const theirs = out.reason === "provider" ? words.platformKey : null;
  await ports.alert({
    kind: "broadcast_stopped",
    route: addressOf({ kind: "send", id: b.id }),
    about: { type: "broadcast", id: b.id },
    subject: `Campaign “${b.name}” stopped`,
    body: theirs
      ? `${theirs.down} (HTTP ${out.status}), so the rest was not sent. ${thenWhat(b, theirs.told, `${theirs.told}. Send it again later.`, "when_it_can")}`
      : `${words.down} (${cause}), so the rest was not sent. ${thenWhat(b, words.reconnect, `${words.reconnect} and send it again.`, "tomorrow")}`,
  });
}

/**
 * The mail provider's limit for the day or the month is used up (channels resendLimitOf): it refuses every email on its
 * key until it resets. This person's claim goes back (nothing left, so they wait queued with everyone after them) and
 * the run stops as a wire that is down stops it, saying so, rather than burn the rest of the list as refused and end as
 * sent. The platform hears it too, as a reply's limit is heard (provider-page.ts): every workspace's email waits.
 */
async function stopForTheLimit(
  w: Work,
  contactId: string,
  out: Extract<Delivered, { outcome: "failed" }>,
  limit: "daily" | "monthly",
): Promise<void> {
  const { ports, b } = w;
  await release(ports, b.id, contactId, "throttled");
  const sent = await ports.tally(b.id).then(
    (t) => t.sent,
    () => null,
  );
  const words = LIMIT_WORDS[limit];
  await ports.fail(b.id, "provider_limit");
  await ports.alert({
    kind: "broadcast_stopped",
    route: addressOf({ kind: "send", id: b.id }),
    about: { type: "broadcast", id: b.id },
    subject: `Campaign “${b.name}” stopped`,
    body: [
      `${words.reached}, so the rest was not sent.`,
      gotIt(sent),
      thenWhat(b, words.resets, words.again, words.next),
    ]
      .filter(Boolean)
      .join(" "),
  });
  await pageForTheRun(w, out, "email");
}

/**
 * An email written queued and never sent, withdrawn so none is left queued for a sweep to call lost, or counted against
 * the month: the provider did not take it, or the door threw before the wire. Only a row still queued is withdrawn (one
 * the door settled is left as it settled it), and a failed withdrawal is logged, never the run's failure. Any other
 * delivery has no row.
 */
async function withdrawQueued(ports: BroadcastBatchPorts, b: { id: string }, delivery: Delivery): Promise<void> {
  const email = delivery.channel === "email" ? delivery.messageId : null;
  if (!email) return;
  await ports.withdrawEmail(email).catch((e: unknown) => {
    broadcastLog.error("broadcast_email_not_withdrawn", { broadcast_id: b.id, message_id: email, error: errField(e) });
  });
}

/**
 * The provider is limiting the sender, or could not be reached at all: the batch stops where it is, and the run tries
 * again after its next wait (BROADCAST_THROTTLE_WAITS_MS, drawn a little longer at random), carrying the count. Past
 * the last wait, or when the next try would fall outside the day's sending hours, it stops and says why instead: a run
 * waiting into the night would send tomorrow the words written for today, which is why a late approval is refused
 * too. A WhatsApp nobody can reach is the platform's condition too, and pages it (once per window, the pager's quiet).
 */
async function backOff(
  ports: BroadcastBatchPorts,
  b: StoppedRun,
  cmd: BroadcastBatchCommand,
  /** Why and on which channel (the verdict), and the zone the day's sending hours are kept by. */
  how: Extract<Verdict, { back: unknown }> & { timezone: string },
): Promise<void> {
  const { back: why, channel, timezone } = how;
  const words = WIRE_WORDS[channel];
  const waited = cmd.waits ?? 0;
  const wait = BROADCAST_THROTTLE_WAITS_MS[waited];
  const at = wait === undefined ? null : new Date(ports.now() + jittered(wait, ports.random));
  if (why === "unreachable")
    await ports
      .page?.(
        `unreachable:${channel}`,
        `${channel}: a broadcast could not reach the provider`,
        `Broadcast ${b.id} could not open a connection to ${words.to}; the person it was for is back in the queue and the run ${at ? `tries again at ${at.toISOString()}` : "has stopped"}.`,
      )
      ?.catch(() => undefined);
  if (at && !nextOpenMoment(timezone, at).moved) {
    await ports.scheduleNext(b.id, at, { waits: waited + 1 });
    return;
  }
  const { sent } = await ports.tally(b.id);
  await ports.fail(b.id, wireFailure(why === "throttled" ? "throttled" : "wire_unavailable", channel));
  const until = at ? "until the day's sending hours ran out" : "for about an hour";
  await ports.alert({
    kind: "broadcast_stopped",
    route: addressOf({ kind: "send", id: b.id }),
    about: { type: "broadcast", id: b.id },
    subject: `Campaign “${b.name}” stopped`,
    body:
      why === "throttled"
        ? `${words.limiting} ${until}, so the rest was not sent. ${gotIt(sent)} ${thenWhat(b, words.lifts, `${words.lifts}; send it again later.`, "tomorrow")}`
        : `${words.reach} ${until}, so the rest was not sent. ${gotIt(sent)} ${thenWhat(b, words.fine, `${words.fine}; send it again later.`, "tomorrow")}`,
  });
}
