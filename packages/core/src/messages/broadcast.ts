import {
  BROADCAST_CHUNK,
  BROADCAST_GAP_MS,
  BROADCAST_THROTTLE_WAITS_MS,
  OUTCOME_UNKNOWN,
  type JobNews,
  firstNameOf,
  isReachOutRun,
  jittered,
  nextOpenMoment,
  parseParamSpecs,
  purposeOfTemplate,
  renderTemplate,
  resolveParams,
} from "@chanlytics/contracts";
import type { Delivered } from "../deliver";
import { isNotTakenError } from "../wire-senders";
import type {
  BroadcastBatchCommand,
  BroadcastBatchPorts,
  BroadcastRow,
  ContactRow,
  RecipientMark,
  RecipientRow,
} from "./ports";

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

/** The one wire a broadcast goes out on: the door is asked with it, and so is whether it could be bound. */
const BROADCAST_CHANNEL = "whatsapp";

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
 * rather than a template going out under a subscription that stopped. A wire that could not be BOUND -- credentials
 * that could not be READ (Vault, the database), which are not credentials that are absent -- claims nobody: nobody
 * knows whether the number is connected, a claim settles only to sent or skipped (00182), never back to queued, so the
 * whole batch waits for the next tick, its people still queued and the run as it was, the way a batch whose people
 * could not be read waits, and nobody is told to reconnect a number that may well be connected. A number that IS
 * absent is the door's answer, per person, as it always was.
 */
async function mayGoNow(ports: BroadcastBatchPorts, b: BroadcastRow, cmd: BroadcastBatchCommand): Promise<boolean> {
  if (await ports.workspacePaused()) {
    await ports.fail(b.id, "paused");
    await ports.alert({
      kind: "broadcast_stopped",
      route: "broadcasts",
      about: { type: "broadcast", id: b.id },
      subject: `Broadcast “${b.name}” not sent`,
      body: "The workspace is paused until billing resumes, so nothing went out. Resume from Settings › Billing and send it again.",
    });
    return false;
  }
  const unbound = await ports.wireUnavailable(BROADCAST_CHANNEL);
  if (unbound) {
    console.error("broadcast_wire_unavailable", b.id, unbound);
    await stall(ports, b, cmd, "credentials");
    // The platform hears it, as a reply's wait is heard (sendQueued): a store that stays unreadable is its condition.
    await ports
      .page?.(
        `wire_unavailable:${BROADCAST_CHANNEL}`,
        `${BROADCAST_CHANNEL}: a workspace's credentials could not be read`,
        `Broadcast ${b.id} waits, everyone still queued: ${unbound}.`,
      )
      ?.catch(() => undefined);
    return false;
  }
  return true;
}

/**
 * broadcast_send: one batch of a broadcast, then the next.
 *
 * The route enrolled the recipients; this sends to up to BROADCAST_CHUNK of
 * them, re-checking each person at the wire — the one place a miss is
 * unrecoverable — and records why anyone was held back. Then it schedules
 * itself again for the rest, or closes the broadcast and tells the
 * workspace. A canceled broadcast stops at the next batch; a template that
 * is no longer approved fails it before a single send; a wire that is down
 * fails it at the first person it cannot reach.
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
  if (!(await mayGoNow(ports, b, cmd))) return;
  // Only while still scheduled: a cancel that landed between the read above
  // and this write is the row's answer, and the batch sends nothing.
  if (b.state === "scheduled" && !(await ports.startSending(b.id))) return;

  // The template must still be what Meta approved.
  const tpl = await ports.template(b.template_name, b.template_language);
  if (!tpl || tpl.meta_status !== "approved") {
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
  // WHICH yes this send needs. Meta's category is the authority — it can
  // recategorise a live template — and purposeOfTemplate fails closed, so a
  // template whose category we do not have reads as marketing and needs the
  // stronger consent rather than the weaker one.
  const purpose = purposeOfTemplate(tpl.category);

  // What fills each slot: typed text once, the rest per person. The
  // workspace's own words for the slots that name it are read once.
  const specs = parseParamSpecs(b.params);
  const { businessName, bookingLink, timezone } = await ports.facts();
  if (await ranIntoTheNight(ports, b, cmd, timezone)) return;
  const batch = await ports.batch(b.id, BROADCAST_CHUNK);

  // The people on the batch and what they were already sent, read once for
  // the batch rather than once per person. FAIL CLOSED: a read that fails
  // leaves the whole batch queued rather than guessing about anyone -- "we
  // could not check" is not "yes" -- and the run waits before trying again.
  const ids = batch.map((r) => r.contact_id);
  let people = new Map<string, ContactRow>();
  let priors = new Map<string, { id: string; sentAt: string | null }>();
  let unreadable = false;
  if (ids.length > 0) {
    try {
      [people, priors] = await Promise.all([ports.contacts(ids), ports.alreadySent(b.id, ids)]);
    } catch (e) {
      unreadable = true;
      console.error("broadcast_batch_unreadable", b.id, e instanceof Error ? e.message : String(e));
    }
  }

  let begun = 0;
  let marked = 0;
  const mark = async (contactId: string, patch: RecipientMark) => {
    marked += 1;
    await ports.mark(b.id, contactId, patch);
  };
  const skip = (contactId: string, reason: string) => mark(contactId, { state: "skipped", reason });

  /**
   * One person, to the wire and back. "stop" when the run cannot go on past them; "throttled" when WhatsApp said not
   * now; "unreachable" when the request never reached WhatsApp at all (giveBack).
   */
  const one = async (r: RecipientRow): Promise<Verdict> => {
    const c = people.get(r.contact_id) ?? null;
    if (!c || c.erased_at) {
      await skip(r.contact_id, "erased");
      return "go on";
    }
    if (!c.phone_e164) {
      await skip(r.contact_id, "no_phone");
      return "go on";
    }
    // A run that died between the wire and its own bookkeeping left this
    // person a message row and a queued recipient row. Resumed (jobs/settle
    // reschedules the rest), the batch reads the row rather than sending twice:
    // they got it, and the recipient row now says so.
    const prior = priors.get(c.id) ?? null;
    // Their row records when the message actually LEFT, not when this run
    // noticed it had: the broadcast's page lists its people in that order, and
    // a resumed run stamping "now" on an hour-old send reorders the whole list.
    if (prior) {
      await mark(r.contact_id, { state: "sent", message_id: prior.id, sent_at: prior.sentAt });
      return "go on";
    }
    // The thread this send belongs to. Which yes this message needs, the
    // pause, and the workspace's status are the door's to re-read at the
    // wire, below — the one place a stale answer cannot be taken back.
    const target = await ports.target(c.phone_e164);
    if (!target) {
      await skip(r.contact_id, "no_thread");
      return "go on";
    }

    // Their own words in the slots: a first name nobody has on file reads
    // "there"; a slot nothing can fill holds the person, never a blank send.
    // A visit run's words for this person, resolved when the run was made.
    const facts = (r.facts !== null && typeof r.facts === "object" && !Array.isArray(r.facts) ? r.facts : {}) as Record<
      string,
      unknown
    >;
    const params = resolveParams(specs, {
      firstName: firstNameOf(c.display_name, c.wa_profile_name),
      businessName,
      bookingLink,
      visitWhen: typeof facts.visit_when === "string" ? facts.visit_when : null,
      visitService: typeof facts.visit_service === "string" ? facts.visit_service : null,
      // A follow-up's link, frozen when the run was made (0006).
      proposalLink: typeof facts.proposal_link === "string" ? facts.proposal_link : null,
    });
    if (params.some((v) => !v)) {
      await skip(r.contact_id, "missing_value");
      return "go on";
    }
    const words = renderTemplate(tpl.body_preview, params);
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
    await ports.mark(b.id, r.contact_id, { state: "failed", reason: OUTCOME_UNKNOWN });
    // The door. It asks the one predicate with this template's purpose — a
    // promotional send needs the yes to offers, an appointment reminder the
    // yes to conversation — and it asks at the wire, whatever the route found
    // when it enrolled them; then the pause, the workspace's status, the send
    // on the tenant's credentials, and the row either way. A refusal leaves no
    // row: the person's own line says why they were held. A broadcast is the
    // owner's words (the row says so) sent by the machine (the door is told so).
    const out = await ports
      .deliver({
        tenantId: cmd.tenantId,
        conversationId: target.conversationId,
        contactId: c.id,
        to: c.phone_e164,
        channel: "whatsapp",
        sender: "human",
        kind: "broadcast",
        purpose,
        proactive: true,
        body: words,
        template: { name: b.template_name, language: b.template_language, params },
        // A send WhatsApp provably did not take (a connection that never opened, its "not now") is handed back rather
        // than written as failed: this person waits in the queue, and the run waits with them (00280).
        holdIfNotTaken: true,
        // A run's message names its playbook, so a thread reads "by the Win-back playbook".
        meta: {
          source: "broadcast",
          broadcast_id: b.id,
          broadcast_name: b.name,
          ...(b.playbook_id
            ? {
                playbook_id: b.playbook_id,
                playbook_name: String((b.audience as { label?: unknown } | null)?.label ?? b.name),
              }
            : {}),
        },
      })
      .catch((e: unknown): NotTaken => {
        if (isNotTakenError(e)) return { outcome: "not_taken", status: e.status };
        throw new ThrownAtTheDoor(e);
      });
    if (out.outcome === "not_taken") return giveBack(ports, b.id, r.contact_id, out.status !== 0);
    if (out.outcome === "sent") {
      // The claim's "nobody knows" is settled: a sent row carries no reason.
      await mark(r.contact_id, { state: "sent", reason: null, message_id: out.messageId });
      return "go on";
    }
    if (out.outcome === "refused") {
      await skip(r.contact_id, out.reason);
      return "go on";
    }
    if (out.throttled) return giveBack(ports, b.id, r.contact_id, true);
    await mark(r.contact_id, { state: "failed", reason: "send_failed", message_id: out.messageId });
    if (!wireIsDown(out)) return "go on";
    await stopForTheWire(ports, b, out);
    return "stop";
  };

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
      verdict = await one(r);
    } catch (e) {
      if (e instanceof ThrownAtTheDoor) throw e.error;
      console.error("broadcast_person_unreadable", r.contact_id, e instanceof Error ? e.message : String(e));
      continue;
    }
    if (verdict === "stop") return;
    if (verdict === "throttled" || verdict === "unreachable") return backOff(ports, b, cmd, timezone, verdict);
    // A breath between two sends, none after the last: the next batch is a job away.
    if (BROADCAST_GAP_MS > 0 && i < batch.length - 1) await ports.sleep(BROADCAST_GAP_MS);
  }

  const remaining = await ports.remaining(b.id);
  if (remaining > 0) {
    // Still wanted? A cancel during this batch stops here.
    if ((await ports.state(b.id)) !== "sending") return;
    // A batch that reached nobody waits before the next, a bounded number of times (stall): every read failed,
    // and trying again this second is how a failing read spins the ledger.
    if (batch.length > 0 && marked === 0) await stall(ports, b, cmd, "people");
    else await ports.scheduleNext(b.id);
    return;
  }

  const { sent, held } = await ports.tally(b.id);
  await ports.finish(b.id, { sent, held });
  await ports.alert(finishedNews(b, sent, held));
}

/** How one person's turn ended: the next goes on, the run stops, or it backs off (throttled, or never reached). */
type Verdict = "go on" | "stop" | "throttled" | "unreachable";

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
 * WhatsApp did not take the message, and the claim goes back (release), named for what happened. A 429 or 408 is its
 * "not now" (reached); no answer at all is a WhatsApp this run could not reach. The run waits either way (backOff).
 */
async function giveBack(
  ports: BroadcastBatchPorts,
  broadcastId: string,
  contactId: string,
  reached: boolean,
): Promise<Verdict> {
  await release(ports, broadcastId, contactId, reached ? "throttled" : "not_taken");
  return reached ? "throttled" : "unreachable";
}

/** What the door's refusal to take a send becomes here: its status, 0 when WhatsApp was never reached. */
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
  what: "credentials" | "people",
): Promise<void> {
  const stalls = (cmd.stalls ?? 0) + 1;
  if (stalls <= BROADCAST_STALLS_MAX) {
    const at = new Date(ports.now() + jittered(BROADCAST_STALL_RETRY_MS, ports.random));
    await ports.scheduleNext(b.id, at, { ...(cmd.waits ? { waits: cmd.waits } : {}), stalls });
    return;
  }
  // The tally is best effort: a database that has not answered for half an hour may not answer for it either.
  const sent = await ports.tally(b.id).then(
    (t) => t.sent,
    () => null,
  );
  await ports.fail(b.id, "stalled");
  await ports.alert({
    kind: "broadcast_stopped",
    route: "broadcasts",
    about: { type: "broadcast", id: b.id },
    subject: `Broadcast “${b.name}” stopped`,
    body: [
      `${what === "credentials" ? "This workspace's WhatsApp credentials" : "The people on it"} could not be read for about half an hour, so the rest was not sent.`,
      gotIt(sent),
      "Nothing is wrong with the number; send it again later.",
    ]
      .filter(Boolean)
      .join(" "),
  });
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
): Promise<void> {
  const cause =
    out.reason === "no_credentials"
      ? "the number is not connected"
      : out.reason === "no_sender_for_channel"
        ? "this runtime has no WhatsApp wire"
        : `WhatsApp answered HTTP ${out.status}`;
  await ports.fail(b.id, "wire_unavailable");
  await ports.alert({
    kind: "broadcast_stopped",
    route: "broadcasts",
    about: { type: "broadcast", id: b.id },
    subject: `Broadcast “${b.name}” stopped`,
    body: `WhatsApp could not be reached on this workspace's number (${cause}), so the rest was not sent. Reconnect the number in Settings › Channels and send it again.`,
  });
}

/**
 * WhatsApp did not take the message: it said "not now" (channels graphThrottled, a 429), or the request never reached
 * it (a connection that never opened: providerFetch's `retryable`). Nothing left, so the claim is released, named for
 * which (00216 `throttled`, 00280 `not_taken`), and this person waits in the queue with everyone after them, rather
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
    console.error("broadcast_release_refused", contactId, e instanceof Error ? e.message : String(e));
  });
}

/**
 * WhatsApp is limiting the number, or could not be reached at all: the batch stops where it is, and the run tries
 * again after its next wait (BROADCAST_THROTTLE_WAITS_MS, drawn a little longer at random), carrying the count. Past
 * the last wait, or when the next try would fall outside the day's sending hours, it stops and says why instead: a run
 * waiting into the night would send tomorrow the words written for today, which is why a late approval is refused
 * too. A WhatsApp nobody can reach is the platform's condition too, and pages it (once per window, the pager's quiet).
 */
async function backOff(
  ports: BroadcastBatchPorts,
  b: { id: string; name: string },
  cmd: BroadcastBatchCommand,
  timezone: string,
  why: "throttled" | "unreachable",
): Promise<void> {
  const waited = cmd.waits ?? 0;
  const wait = BROADCAST_THROTTLE_WAITS_MS[waited];
  const at = wait === undefined ? null : new Date(ports.now() + jittered(wait, ports.random));
  if (why === "unreachable")
    await ports
      .page?.(
        `unreachable:${BROADCAST_CHANNEL}`,
        `${BROADCAST_CHANNEL}: a broadcast could not reach the provider`,
        `Broadcast ${b.id} could not open a connection to WhatsApp; the person it was for is back in the queue and the run ${at ? `tries again at ${at.toISOString()}` : "has stopped"}.`,
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
        ? `WhatsApp kept limiting how fast this number may send ${until}, so the rest was not sent. ${gotIt(sent)} WhatsApp lifts these limits on its own; send it again later.`
        : `WhatsApp could not be reached ${until}, so the rest was not sent. ${gotIt(sent)} Nothing is wrong with the number; send it again later.`,
  });
}
