/** Broadcast: batch. */

import {
  addressOf,
  BROADCAST_CHUNK,
  BROADCAST_GAP_MS,
  BROADCAST_THROTTLE_WAITS_MS,
  OUTCOME_UNKNOWN,
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
import { errField } from "@chanlytics/log";
import type { Delivered, Delivery } from "../../deliver/deliver";
import type { BroadcastChannel as Channel } from "../broadcast-channels";
import { isNotTakenError, isWireUnavailableError } from "../../deliver/wire-senders";
import {
  batchSlots,
  channelOf,
  countSent,
  isOverAllowance,
  purposeAtTheDoor,
  queueEmailRow,
  rowFacts,
  rowHold,
  prepare,
  startsInTime,
  type Work,
} from "../broadcast-channels";
import { visitStands } from "../broadcast-feed";
import { handleRefusal, holdBeforeAnyClaim, release, isTakenBeforeItWent, type Verdict } from "../broadcast-stops";
import type { BroadcastBatchCommand, BroadcastBatchPorts, BroadcastRow, RecipientRow } from "../ports";
import { LIMIT_WORDS, WIRE_WORDS, gotIt, wordsKeptOnRow, thenWhat } from "../broadcast-words";
import { pageTheProvider } from "../provider-page";
import {
  ThrownAtTheDoor,
  afterTheBatch,
  broadcastLog,
  giveBack,
  offersAtTheHead,
  readPeople,
  recipientAddressOf,
  stopAfterHours,
  stoppedByBilling,
  type NotTaken,
  type StoppedRun,
  wireIsDown,
  wireIsUnbound,
} from "./stops";

/**
 * One person, to the wire and back. "stop" when the run cannot go on past them; a back-off when the provider said not
 * now, or the request never reached it at all (giveBack).
 */
async function sendOne(work: Work, recipient: RecipientRow): Promise<Verdict> {
  const { ports, b } = work;
  const skip = async (reason: string): Promise<Verdict> => {
    await work.mark(recipient.contact_id, { state: "skipped", reason });
    return "go on";
  };
  const value = work.people.get(recipient.contact_id) ?? null;
  if (!value || value.erased_at) return skip("erased");
  const channel = channelOf(recipient);
  const where = recipientAddressOf(value, channel);
  if ("held" in where) return skip(where.held);
  // A run that died between the wire and its own bookkeeping left this
  // person a message row and a queued recipient row. Resumed (jobs/settle
  // reschedules the rest), the batch reads the row rather than sending twice:
  // they got it, and the recipient row now says so.
  const prior = work.priors.get(value.id) ?? null;
  // Their row records when the message actually LEFT, not when this run
  // noticed it had: the broadcast's page lists its people in that order, and
  // a resumed run stamping "now" on an hour-old send reorders the whole list.
  if (prior) {
    await work.mark(recipient.contact_id, { state: "sent", message_id: prior.id, sent_at: prior.sentAt });
    return "go on";
  }
  // Their own row holds them (rowHold): left out for the week's breath, or a reminder's appointment, asked again at the send
  // (decision 0002): one that moved, was cancelled or left the calendar since the run drew it holds the person, never a
  // message for a time that no longer stands. The record is asked, and the calendar feed beside it (S1-05), which is newer
  // than the record by up to the hourly sweep; a feed that could not be read leaves a reminder for a calendar event queued
  // for the next batch, never sent on a guess (broadcast-feed.ts).
  const rowHeld = rowHold(recipient, () => visitStands(work, recipient));
  if (rowHeld) return skip(rowHeld);
  // Meta no longer approves WhatsApp's template: that holds the people who go by WhatsApp, and by no other channel, who
  // stay as they were and go on their own versions (the run fails only when nobody else is on it, below).
  if (channel === "whatsapp" && !work.whatsappApproved) return skip("template_not_approved");
  // The campaigns domain an offer by email leaves from cannot be used, on a run that also goes another way (the head,
  // offersAtTheHead): each person who goes by email is held for it, the door's own reason; the run goes on for the others.
  if (channel === "email" && work.offersClosed) return skip("email_marketing_disabled");
  // Chanlytics pays for emails and texts, so it meters them: a person past the month's allowance is held on their
  // channel, never moved to another (contracts CAMPAIGN_MONTH_ALLOWANCE).
  if (channel !== "whatsapp" && (await isOverAllowance(work, channel))) return skip("month_allowance");
  // The thread this send belongs to: by their number, or for an email by the person, never created here. Which yes
  // this message needs, the pause, and the workspace's status are the door's to re-read at the wire, below -- the one
  // place a stale answer cannot be taken back.
  const target = channel === "email" ? await ports.targetOfContact(value.id) : await ports.target(where.to);
  if (!target) return skip("no_thread");

  // Their own words in the slots: a first name nobody has on file reads "there"; a slot nothing can fill (a review link
  // nobody keeps) holds the person, never a blank send. A visit run's words were resolved when the run was made; a freed
  // time's are read as it goes.
  const params = resolveParams(work.specs, {
    firstName: firstNameOf(value.display_name, value.wa_profile_name, {
      source: value.name_source,
      settled: !!value.name_settled_at,
    }),
    businessName: work.facts.businessName,
    bookingLink: work.facts.bookingLink,
    reviewLink: work.reviewLink,
    ...wordsKeptOnRow(rowFacts(recipient), { b: work.b, tz: work.facts.timezone, nowMs: work.ports.now() }),
  });
  if (params.some((v) => !v)) return skip("missing_value");
  const created = await prepare(work, {
    r: recipient,
    c: value,
    channel,
    to: where.to,
    conversationId: target.conversationId,
    params,
  });
  if ("held" in created) return skip(created.held);

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
  if (!(await ports.mark(b.id, recipient.contact_id, { state: "failed", reason: OUTCOME_UNKNOWN }))) return "go on";
  // An email's queued row is written only now, with the claim held: a claim that was lost or failed left none behind. A
  // write that fails gives the claim back (nothing was written, nothing left), and the person waits queued like one
  // whose thread could not be read; a row under that id that has had its say is not sent again. The row is written
  // claimed for the wire too (ports queueEmail), so a member's cancel-send cannot win it while the provider answers.
  const queued = await queueEmailRow(work, created).catch(async (e: unknown) => {
    await release(ports, b.id, recipient.contact_id, "not_taken");
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
  const out = await ports.deliver(created.delivery).catch(async (e: unknown): Promise<NotTaken> => {
    if (isNotTakenError(e)) return { outcome: "not_taken", status: e.status };
    if (isWireUnavailableError(e)) return { outcome: "not_taken", status: 0 };
    await withdrawQueued(ports, b, created.delivery);
    throw new ThrownAtTheDoor(e);
  });
  if (out.outcome === "not_taken") {
    // Nothing left: an email's queued row is withdrawn so nothing stays queued, and the next try writes its own.
    await withdrawQueued(ports, b, created.delivery);
    return giveBack(ports, { broadcastId: b.id, contactId: recipient.contact_id }, out.status !== 0, channel);
  }
  if (out.outcome === "sent") {
    // The claim's "nobody knows" is settled: a sent row carries no reason.
    countSent(work, channel);
    await work.mark(recipient.contact_id, { state: "sent", reason: null, message_id: out.messageId });
    return "go on";
  }
  if (out.outcome === "refused") return handleRefusal(work, recipient, out.reason);
  if (out.throttled) return giveBack(ports, { broadcastId: b.id, contactId: recipient.contact_id }, true, channel);
  // The mail provider's day or month is used up: nobody after this person can go either, so the run stops, as a wire
  // that is down stops it, and they stay queued with the rest (nobody is burned as refused for a limit that lifts).
  if (out.limit === "daily" || out.limit === "monthly") {
    await stopForTheLimit(work, recipient.contact_id, out, out.limit);
    return "stop";
  }
  await work.mark(recipient.contact_id, { state: "failed", reason: "send_failed", message_id: out.messageId });
  if (!wireIsDown(out)) return "go on";
  await stopForTheWire(work, out, channel);
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
  const broadcast = await ports.broadcast(cmd.broadcastId);
  if (!broadcast) return;
  // Only a scheduled or sending broadcast goes out: a run waiting for a
  // person (pending_approval) has no job, and one that ended stays ended.
  if (broadcast.state !== "scheduled" && broadcast.state !== "sending") return;
  // A reach-out's run has no recipients here: its sends are the reach-out clock's (Part 3). A job that reached one
  // would end it as sent to nobody, and the clock would claim nothing more from it.
  if (isReachOutRun(broadcast.audience)) return;
  if (await stoppedByBilling(ports, broadcast)) return;
  // The day's sending hours, asked at the head of every batch rather than only after a wait: a long run that began inside
  // them would otherwise go on, batch after batch, past the last hour.
  const facts = await ports.facts();
  if (await outsideTheHours(ports, broadcast, cmd, facts.timezone)) return;
  const slots = await batchSlots(ports, broadcast.params);
  // Who is next, before the wires are asked about: the channels this batch goes by are its people's.
  const batch = await ports.batch(broadcast.id, BROADCAST_CHUNK);
  const held = [
    () => wireIsUnbound(ports, broadcast, cmd, batch),
    () => isTakenBeforeItWent(ports, broadcast, facts.timezone),
  ];
  if (await holdBeforeAnyClaim(held)) return;
  // Only while still scheduled: a cancel that landed between the read above
  // and this write is the row's answer, and the batch sends nothing.
  if (broadcast.state === "scheduled" && !(await ports.startSending(broadcast.id))) return;

  // The message, read once: its rows on every channel. Its WhatsApp version must still be what Meta approved (and whole,
  // contracts messageHolds). When it is not, that holds the run's WhatsApp people alone (sendOne skips them,
  // template_not_approved) and the run goes on for whoever is on email or text, on their own versions; only a run with
  // nobody else on it fails, before a single send. A message with no row at all holds nobody's WhatsApp, as a missing row did.
  const rows = await ports.message(broadcast.template_name, broadcast.template_language);
  const message = campaignMessageOf(rows, broadcast.template_name, broadcast.template_language);
  const {
    whatsapp: [whatsappRow = null],
  } = versionsOf(rows, broadcast.template_name);
  const whatsappApproved = message !== null && messageHolds(message).whatsapp;
  if (!whatsappApproved && !(await ports.byOtherChannels(broadcast.id, "whatsapp"))) {
    await ports.fail(broadcast.id, "template_not_approved");
    await ports.alert({
      kind: "broadcast_stopped",
      route: addressOf({ kind: "send", id: broadcast.id }),
      about: { type: "broadcast", id: broadcast.id },
      subject: `Campaign “${broadcast.name}” stopped`,
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
  const trigger = audienceTrigger(broadcast.audience);
  const purpose = purposeAtTheDoor(trigger, message);
  const offers = isOfferByEmail({ channel: "email", purpose, proactive: true, about: messageAboutOfTrigger(trigger) });
  const head = await offersAtTheHead(ports, { b: broadcast, cmd, batch, offers });
  if (head === "wait" || head === "stopped") return;
  const { people, priors, appointments, feed, unreadable } = await readPeople(ports, broadcast, batch);
  const work: Work = {
    ports,
    cmd,
    b: broadcast,
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
      work.marked += 1;
      await ports.mark(broadcast.id, contactId, patch);
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
      verdict = await sendOne(work, r);
    } catch (e) {
      if (e instanceof ThrownAtTheDoor) throw e.error;
      broadcastLog.error("broadcast_person_unreadable", { contact_id: r.contact_id, error: errField(e) });
      continue;
    }
    if (verdict === "stop") return;
    if (verdict !== "go on") return backOff(ports, broadcast, cmd, { ...verdict, timezone: facts.timezone });
    // A breath between two sends, none after the last: the next batch is a job away.
    if (BROADCAST_GAP_MS > 0 && i < batch.length - 1) await ports.sleep(BROADCAST_GAP_MS);
  }

  // A batch that stopped at its wire's moment is no failing read: the next is placed at once, never stalled on.
  await afterTheBatch(work, yielded ? 0 : batch.length);
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
  broadcast: BroadcastRow,
  cmd: BroadcastBatchCommand,
  timezone: string,
): Promise<boolean> {
  const open = nextOpenMoment(timezone, new Date(ports.now()));
  if (!open.moved) return false;
  const waited = (cmd.waits ?? 0) > 0 || (cmd.stalls ?? 0) > 0;
  const dayBound = triggerOf(audienceTrigger(broadcast.audience) ?? "")?.kind === "visit";
  if (waited || dayBound) await stopAfterHours(ports, broadcast, waited);
  else await ports.scheduleNext(broadcast.id, open.at);
  return true;
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
  work: Work,
  out: Extract<Delivered, { outcome: "failed" }>,
  channel: Channel,
): Promise<void> {
  const { ports, b } = work;
  const words = WIRE_WORDS[channel];
  const cause =
    out.reason === "no_credentials"
      ? words.notConnected
      : out.reason === "no_sender_for_channel"
        ? words.noWire
        : `${words.answered} ${out.status}`;
  await ports.fail(b.id, wireFailure("wire_unavailable", channel));
  await pageForTheRun(work, out, channel);
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
  work: Work,
  contactId: string,
  out: Extract<Delivered, { outcome: "failed" }>,
  limit: "daily" | "monthly",
): Promise<void> {
  const { ports, b } = work;
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
  await pageForTheRun(work, out, "email");
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
  stoppedRun: StoppedRun,
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
        `Broadcast ${stoppedRun.id} could not open a connection to ${words.to}; the person it was for is back in the queue and the run ${at ? `tries again at ${at.toISOString()}` : "has stopped"}.`,
      )
      ?.catch(() => undefined);
  if (at && !nextOpenMoment(timezone, at).moved) {
    await ports.scheduleNext(stoppedRun.id, at, { waits: waited + 1 });
    return;
  }
  const { sent } = await ports.tally(stoppedRun.id);
  await ports.fail(stoppedRun.id, wireFailure(why === "throttled" ? "throttled" : "wire_unavailable", channel));
  const until = at ? "until the day's sending hours ran out" : "for about an hour";
  await ports.alert({
    kind: "broadcast_stopped",
    route: addressOf({ kind: "send", id: stoppedRun.id }),
    about: { type: "broadcast", id: stoppedRun.id },
    subject: `Campaign “${stoppedRun.name}” stopped`,
    body:
      why === "throttled"
        ? `${words.limiting} ${until}, so the rest was not sent. ${gotIt(sent)} ${thenWhat(stoppedRun, words.lifts, `${words.lifts}; send it again later.`, "tomorrow")}`
        : `${words.reach} ${until}, so the rest was not sent. ${gotIt(sent)} ${thenWhat(stoppedRun, words.fine, `${words.fine}; send it again later.`, "tomorrow")}`,
  });
}
