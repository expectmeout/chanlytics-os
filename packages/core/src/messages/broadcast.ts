import {
  BROADCAST_CHUNK,
  BROADCAST_GAP_MS,
  BROADCAST_THROTTLE_WAITS_MS,
  OUTCOME_UNKNOWN,
  type JobNews,
  audienceTrigger,
  firstNameOf,
  isReachOutRun,
  jittered,
  nextOpenMoment,
  parseParamSpecs,
  purposeOfTemplate,
  resolveParams,
} from "@chanlytics/contracts";
import { errField, logger } from "@chanlytics/channels";
import type { Channel, Delivered, Delivery } from "../deliver";
import { isNotTakenError } from "../wire-senders";
import { channelOf, countSent, overAllowance, queueEmailRow, rowFacts, prepare, type Work } from "./broadcast-channels";
import type { BroadcastBatchCommand, BroadcastBatchPorts, BroadcastRow, ContactRow, RecipientRow } from "./ports";

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

/**
 * What a run says of each wire it goes out on, in the owner's words: the credentials it could not read, why the wire is
 * down and what to do, when the provider limits it, and when it cannot be reached. One set per channel; WhatsApp's are
 * what every broadcast has always said.
 */
const WIRE_WORDS: Record<
  Channel,
  {
    credentials: string;
    down: string;
    notConnected: string;
    noWire: string;
    answered: string;
    reconnect: string;
    limiting: string;
    lifts: string;
    reach: string;
    fine: string;
    to: string;
  }
> = {
  whatsapp: {
    credentials: "This workspace's WhatsApp credentials",
    down: "WhatsApp could not be reached on this workspace's number",
    notConnected: "the number is not connected",
    noWire: "this runtime has no WhatsApp wire",
    answered: "WhatsApp answered HTTP",
    reconnect: "Reconnect the number in Settings › Channels",
    limiting: "WhatsApp kept limiting how fast this number may send",
    lifts: "WhatsApp lifts these limits on its own",
    reach: "WhatsApp could not be reached",
    fine: "Nothing is wrong with the number",
    to: "WhatsApp",
  },
  sms: {
    credentials: "This workspace's texting line",
    down: "Texts could not be sent on this workspace's line",
    notConnected: "the line is not connected",
    noWire: "this runtime has no texting wire",
    answered: "the texting provider answered HTTP",
    reconnect: "Check the line in Settings › Channels",
    limiting: "The texting provider kept limiting how fast this line may send",
    lifts: "It lifts these limits on its own",
    reach: "The texting provider could not be reached",
    fine: "Nothing is wrong with the line",
    to: "the texting provider",
  },
  email: {
    credentials: "This workspace's mailbox",
    down: "Email could not be sent from this workspace's mailbox",
    notConnected: "the mailbox is not set up",
    noWire: "this runtime has no email wire",
    answered: "the mail provider answered HTTP",
    reconnect: "Check the mailbox in Settings › Connections",
    limiting: "The mail provider kept limiting how fast this workspace may send",
    lifts: "It lifts these limits on its own",
    reach: "The mail provider could not be reached",
    fine: "Nothing is wrong with the mailbox",
    to: "the mail provider",
  },
};

/**
 * What a run says when the mail provider's own limit is used up (channels resendLimitOf: the day's or the month's): a no
 * until it resets, which is longer than any wait of a run, and so a run's stop, not a person's refusal.
 */
const LIMIT_WORDS: Record<"daily" | "monthly", { reached: string; again: string }> = {
  daily: {
    reached: "The mail provider's limit for the day was reached",
    again: "It resets on its own; send it again tomorrow.",
  },
  monthly: {
    reached: "The mail provider's limit for the month was reached",
    again: "It resets with the new month; send it again then.",
  },
};

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
 * rather than a template going out under a subscription that stopped.
 */
async function stoppedByBilling(ports: BroadcastBatchPorts, b: BroadcastRow): Promise<boolean> {
  if (!(await ports.workspacePaused())) return false;
  await ports.fail(b.id, "paused");
  await ports.alert({
    kind: "broadcast_stopped",
    route: "broadcasts",
    about: { type: "broadcast", id: b.id },
    subject: `Broadcast “${b.name}” not sent`,
    body: "The workspace is paused until billing resumes, so nothing went out. Resume from Settings › Billing and send it again.",
  });
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
): Promise<Pick<Work, "people" | "priors"> & { unreadable: boolean }> {
  const ids = batch.map((r) => r.contact_id);
  if (ids.length === 0) return { people: new Map(), priors: new Map(), unreadable: false };
  try {
    const [people, priors] = await Promise.all([ports.contacts(ids), ports.alreadySent(b.id, ids)]);
    return { people, priors, unreadable: false };
  } catch (e) {
    broadcastLog.error("broadcast_batch_unreadable", { broadcast_id: b.id, error: errField(e) });
    return { people: new Map(), priors: new Map(), unreadable: true };
  }
}

/** Where a person is reached on their channel, or why not: a number for WhatsApp and a text, an address for an email. */
function addressOf(c: ContactRow, channel: Channel): { to: string } | { held: string } {
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
  const where = addressOf(c, channel);
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
  // Meta no longer approves WhatsApp's template: that holds the people who go by WhatsApp, and by no other channel, who
  // stay as they were and go on their own versions (the run fails only when nobody else is on it, below).
  if (channel === "whatsapp" && !w.whatsappApproved) return skip("template_not_approved");
  // Chanlytics pays for emails and texts, so it meters them: a person past the month's allowance is held on their
  // channel, never moved to another (contracts CAMPAIGN_MONTH_ALLOWANCE).
  if (channel !== "whatsapp" && (await overAllowance(w, channel))) return skip("month_allowance");
  // The thread this send belongs to: by their number, or for an email by the person, never created here. Which yes
  // this message needs, the pause, and the workspace's status are the door's to re-read at the wire, below -- the one
  // place a stale answer cannot be taken back.
  const target = channel === "email" ? await ports.targetOfContact(c.id) : await ports.target(where.to);
  if (!target) return skip("no_thread");

  // Their own words in the slots: a first name nobody has on file reads
  // "there"; a slot nothing can fill holds the person, never a blank send.
  // A visit run's words for this person, resolved when the run was made.
  const facts = rowFacts(r);
  const params = resolveParams(w.specs, {
    firstName: firstNameOf(c.display_name, c.wa_profile_name),
    businessName: w.facts.businessName,
    bookingLink: w.facts.bookingLink,
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
  // whose thread could not be read; a row under that id that has had its say is not sent again.
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
  // here (a row the door settled is not touched): none is left to count against the month.
  const out = await ports.deliver(made.delivery).catch(async (e: unknown): Promise<NotTaken> => {
    if (isNotTakenError(e)) return { outcome: "not_taken", status: e.status };
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
  if (out.outcome === "refused") return skip(out.reason);
  if (out.throttled) return giveBack(ports, { broadcastId: b.id, contactId: r.contact_id }, true, channel);
  // The mail provider's day or month is used up: nobody after this person can go either, so the run stops, as a wire
  // that is down stops it, and they stay queued with the rest (nobody is burned as refused for a limit that lifts).
  if (out.limit === "daily" || out.limit === "monthly") {
    await stopForTheLimit(ports, b, r.contact_id, out.limit);
    return "stop";
  }
  await w.mark(r.contact_id, { state: "failed", reason: "send_failed", message_id: out.messageId });
  if (!wireIsDown(out)) return "go on";
  await stopForTheWire(ports, b, out, channel);
  return "stop";
}

/**
 * broadcast_send: one batch of a broadcast, then the next.
 *
 * The route enrolled the recipients, each on the channel picked for them (contracts reachFor); this sends to up to
 * BROADCAST_CHUNK of them, each on their own channel -- WhatsApp's template, a text's version, an email's version from
 * the hosted mailbox -- re-checking each person at the wire, the one place a miss is unrecoverable, and records why
 * anyone was held back. Then it schedules itself again for the rest, or closes the broadcast and tells the workspace.
 * A canceled broadcast stops at the next batch; a template that is no longer approved fails it before a single send; a
 * wire that is down fails it at the first person it cannot reach.
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
  // Who is next, before the wires are asked about: the channels this batch goes by are its people's.
  const batch = await ports.batch(b.id, BROADCAST_CHUNK);
  if (await wireIsUnbound(ports, b, cmd, batch)) return;
  // Only while still scheduled: a cancel that landed between the read above
  // and this write is the row's answer, and the batch sends nothing.
  if (b.state === "scheduled" && !(await ports.startSending(b.id))) return;

  // WhatsApp's template must still be what Meta approved. When it is not, that holds the run's WhatsApp people alone
  // (sendOne skips them, template_not_approved) and the run goes on for whoever is on email or text, on their own
  // versions; only a run with nobody else on it fails, before a single send.
  const tpl = await ports.template(b.template_name, b.template_language, "whatsapp");
  const whatsappApproved = tpl?.meta_status === "approved";
  if (!whatsappApproved && !(await ports.byOtherChannels(b.id))) {
    await ports.fail(b.id, "template_not_approved");
    await ports.alert({
      kind: "broadcast_stopped",
      route: "broadcasts",
      about: { type: "broadcast", id: b.id },
      subject: `Broadcast “${b.name}” stopped`,
      body: `The template “${b.template_name}” is no longer approved by WhatsApp, so nothing was sent.`,
    });
    return;
  }

  // What fills each slot: typed text once, the rest per person. The
  // workspace's own words for the slots that name it are read once.
  const facts = await ports.facts();
  if (await ranIntoTheNight(ports, b, cmd, facts.timezone)) return;
  const { people, priors, unreadable } = await readPeople(ports, b, batch);
  const w: Work = {
    ports,
    cmd,
    b,
    // WHICH yes this send needs. Meta's category is the authority — it can
    // recategorise a live template — and purposeOfTemplate fails closed, so a
    // template whose category we do not have reads as marketing and needs the
    // stronger consent rather than the weaker one. Whichever channel it goes by.
    // The message's own, kept when Meta no longer approves its WhatsApp row (a row that is gone reads as marketing).
    purpose: purposeOfTemplate(tpl?.category),
    tpl: tpl ?? { body_preview: null },
    whatsappApproved,
    specs: parseParamSpecs(b.params),
    facts,
    people,
    priors,
    versions: {},
    month: {},
    // A visit run is never held by the month's allowance; its audience names the moment (contracts audienceTrigger).
    trigger: audienceTrigger(b.audience),
    marked: 0,
    mark: async (contactId, patch) => {
      w.marked += 1;
      await ports.mark(b.id, contactId, patch);
    },
  };

  let begun = 0;
  for (const [i, r] of batch.entries()) {
    if (unreadable) break;
    // Yield before the runner's ceiling rather than be killed mid-send: no new
    // send starts after the deadline, and the follow-up job below carries the
    // rest. One person at least, so a batch that starts late still moves on.
    if (begun > 0 && ports.now() >= cmd.deadline) break;
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

  const remaining = await ports.remaining(b.id);
  if (remaining > 0) {
    // Still wanted? A cancel during this batch stops here.
    if ((await ports.state(b.id)) !== "sending") return;
    // A batch that reached nobody waits before the next, a bounded number of times (stall): every read failed,
    // and trying again this second is how a failing read spins the ledger.
    if (batch.length > 0 && w.marked === 0) await stall(ports, b, cmd, "people");
    else await ports.scheduleNext(b.id);
    return;
  }

  const { sent, held } = await ports.tally(b.id);
  await ports.finish(b.id, { sent, held });
  await ports.alert(finishedNews(b, sent, held));
}

/** How one person's turn ended: the next goes on, the run stops, or it backs off (throttled, or never reached) by channel. */
type Verdict = "go on" | "stop" | { back: "throttled" | "unreachable"; channel: Channel };

/**
 * The run FINISHED. Said as what it is, not as a job that did not finish, which is what every alert from this file was
 * kept as until 00141, so two completed broadcasts were counted into Today's "6 jobs did not finish". And as many as it
 * reached, of how many: a run that reached nobody is not "sent".
 */
function finishedNews(b: { id: string; name: string }, sent: number, held: number): JobNews {
  const why = "no recorded yes, asked to stop, no number, a person had the thread, or a run that did not finish";
  const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
  return {
    kind: "broadcast_sent",
    route: "broadcasts",
    about: { type: "broadcast", id: b.id },
    subject: sent > 0 ? `Broadcast “${b.name}” sent` : `Broadcast “${b.name}” reached nobody`,
    body:
      sent > 0
        ? `${sent} of ${people(sent + held)} got it${held ? `; ${held} held back (${why})` : ""}. Replies land in the Inbox.`
        : `None of the ${people(held)} on it got it: each was held back (${why}). The broadcast's page says who and why.`,
  };
}

/**
 * A run that waited (WhatsApp's "not now", a network that would not connect, a read that failed) looks at the clock
 * again before it sends: a wait that ran into the night ends the run, rather than sending tonight, or tomorrow, the
 * words written for today. True when it has ended.
 */
async function ranIntoTheNight(
  ports: BroadcastBatchPorts,
  b: { id: string; name: string },
  cmd: BroadcastBatchCommand,
  timezone: string,
): Promise<boolean> {
  const waited = (cmd.waits ?? 0) > 0 || (cmd.stalls ?? 0) > 0;
  if (!waited || !nextOpenMoment(timezone, new Date(ports.now())).moved) return false;
  await stopAfterHours(ports, b);
  return true;
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

/** "N people got it", "One person got it", "Nobody got it", or nothing when the count could not be read. */
function gotIt(sent: number | null): string {
  if (sent === null) return "";
  return sent === 0 ? "Nobody got it." : sent === 1 ? "One person got it." : `${sent} people got it.`;
}

/**
 * A batch that reached nobody because a read failed (the number's credentials, or its people) waits a minute and tries
 * again, the count carried in the job; past BROADCAST_STALLS_MAX in a row it stops and the owner is told. Before, it
 * waited a minute for ever: a vault out from 7:50 PM to 11 PM re-queued the run a hundred and ninety times, then sent
 * the day's template at 11 PM.
 */
async function stall(
  ports: BroadcastBatchPorts,
  b: { id: string; name: string },
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
  await ports.fail(b.id, "stalled");
  const words = WIRE_WORDS[what === "people" ? "whatsapp" : what];
  await ports.alert({
    kind: "broadcast_stopped",
    route: "broadcasts",
    about: { type: "broadcast", id: b.id },
    subject: `Broadcast “${b.name}” stopped`,
    body: [
      `${what === "people" ? "The people on it" : words.credentials} could not be read for about half an hour, so the rest was not sent.`,
      gotIt(sent),
      `${words.fine}; send it again later.`,
    ]
      .filter(Boolean)
      .join(" "),
  });
  return "stopped";
}

/** A run that waited and woke outside the day's sending hours stops there, and the owner is told. */
async function stopAfterHours(ports: BroadcastBatchPorts, b: { id: string; name: string }): Promise<void> {
  const sent = await ports.tally(b.id).then(
    (t) => t.sent,
    () => null,
  );
  await ports.fail(b.id, "after_hours");
  await ports.alert({
    kind: "broadcast_stopped",
    route: "broadcasts",
    about: { type: "broadcast", id: b.id },
    subject: `Broadcast “${b.name}” stopped`,
    body: [
      "It was waiting to go on when the day's sending hours ran out, so the rest was not sent.",
      gotIt(sent),
      "Send it again tomorrow.",
    ]
      .filter(Boolean)
      .join(" "),
  });
}

/**
 * The wire, not the person: the run stops here and says so, rather than burning everyone still queued as refused and
 * ending as "sent".
 */
async function stopForTheWire(
  ports: BroadcastBatchPorts,
  b: { id: string; name: string },
  out: Extract<Delivered, { outcome: "failed" }>,
  channel: Channel,
): Promise<void> {
  const words = WIRE_WORDS[channel];
  const cause =
    out.reason === "no_credentials"
      ? words.notConnected
      : out.reason === "no_sender_for_channel"
        ? words.noWire
        : `${words.answered} ${out.status}`;
  await ports.fail(b.id, "wire_unavailable");
  await ports.alert({
    kind: "broadcast_stopped",
    route: "broadcasts",
    about: { type: "broadcast", id: b.id },
    subject: `Broadcast “${b.name}” stopped`,
    body: `${words.down} (${cause}), so the rest was not sent. ${words.reconnect} and send it again.`,
  });
}

/**
 * The mail provider's limit for the day or the month is used up (channels resendLimitOf): it refuses every email on its
 * key until it resets. This person's claim goes back (nothing left, so they wait queued with everyone after them) and
 * the run stops as a wire that is down stops it, saying so, rather than burn the rest of the list as refused and end as
 * sent. The platform hears it too, as a reply's limit is heard (send.ts pageTheProvider): every workspace's email waits.
 */
async function stopForTheLimit(
  ports: BroadcastBatchPorts,
  b: { id: string; name: string },
  contactId: string,
  limit: "daily" | "monthly",
): Promise<void> {
  await release(ports, b.id, contactId, "throttled");
  const sent = await ports.tally(b.id).then(
    (t) => t.sent,
    () => null,
  );
  const words = LIMIT_WORDS[limit];
  await ports.fail(b.id, "provider_limit");
  await ports.alert({
    kind: "broadcast_stopped",
    route: "broadcasts",
    about: { type: "broadcast", id: b.id },
    subject: `Broadcast “${b.name}” stopped`,
    body: [`${words.reached}, so the rest was not sent.`, gotIt(sent), words.again].filter(Boolean).join(" "),
  });
  await ports
    .page?.(
      "provider_quota:email",
      `email: the ${limit === "daily" ? "day" : "month"}'s sending limit is used up`,
      `Broadcast ${b.id} stopped on it, everyone not yet sent still queued. Every workspace's email is refused until it resets or the plan grows.`,
    )
    ?.catch(() => undefined);
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
 * The provider did not take the message: it said "not now" (channels graphThrottled, a 429), or the request never reached
 * it (a connection that never opened: providerFetch's `retryable`). Nothing left, so the claim is released, named for
 * which (00216 `throttled`, 00282 `not_taken`), and this person waits in the queue with everyone after them, rather
 * than be burned as refused with the rest of the list behind them. Every other failure keeps its claim: a timeout or a
 * 5xx may have been taken all the same. A database without the migration refuses the release; the run waits all the
 * same, and this one person keeps the claim, which is what such a person got before.
 */
async function release(
  ports: BroadcastBatchPorts,
  broadcastId: string,
  contactId: string,
  reason: "throttled" | "not_taken",
): Promise<void> {
  await ports.mark(broadcastId, contactId, { state: "queued", reason, message_id: null }).catch((e: unknown) => {
    broadcastLog.error("broadcast_release_refused", {
      broadcast_id: broadcastId,
      contact_id: contactId,
      error: errField(e),
    });
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
  b: { id: string; name: string },
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
  await ports.fail(b.id, why === "throttled" ? "throttled" : "wire_unavailable");
  const until = at ? "until the day's sending hours ran out" : "for about an hour";
  await ports.alert({
    kind: "broadcast_stopped",
    route: "broadcasts",
    about: { type: "broadcast", id: b.id },
    subject: `Broadcast “${b.name}” stopped`,
    body:
      why === "throttled"
        ? `${words.limiting} ${until}, so the rest was not sent. ${gotIt(sent)} ${words.lifts}; send it again later.`
        : `${words.reach} ${until}, so the rest was not sent. ${gotIt(sent)} ${words.fine}; send it again later.`,
  });
}
