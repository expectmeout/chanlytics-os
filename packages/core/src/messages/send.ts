import {
  holdNotice,
  isCampaignEmail,
  jittered,
  MIN_MS,
  PURPOSE_REFUSALS,
  type SendPurpose,
} from "@chanlytics/contracts";
import type { Channel, Delivered } from "../deliver";
import {
  isNotTakenError,
  isWireUnavailableError,
  type NotTakenError,
  type WireUnavailableError,
} from "../wire-senders";
import type { SendQueuedCommand, SendQueuedPorts } from "./ports";
import { pageTheProvider } from "./provider-page";
import { toldFromItsEvent } from "../subscribers";

export type { SendQueuedCommand } from "./ports";

/**
 * How long a reply whose wire could not be bound waits before a FRESH job tries it again, by how many fresh jobs it
 * already is the result of (payload.resumes): a blip, a bad minute, a short outage, and one more before a person is
 * told. The list's length is the bound: a send past its last wait fails loudly by name, and the ledger settles the
 * row and tells the owner as it does for any run that did not finish -- never "reconnect the number", because
 * nobody knows that it is off. Fresh rows rather than the ledger's own retry (RETRY_WAITS_MS), which is closed to a
 * kind that speaks to a person: a run that threw mid-send may have sent, and this one provably did not.
 *
 * The same waits hold a send the provider provably did not take (retry by outcome: its "not now", a connection that
 * never opened; NotTakenError), which used to fail at once, flag the thread and tell the owner over a minute's
 * throttle. Nobody is paged for it: a throttle is one minute's problem. Its last try is not held: a provider still
 * saying no then is told as any failure is.
 */
export const SEND_RETRY_WAITS_MS: readonly number[] = [MIN_MS, 3 * MIN_MS, 10 * MIN_MS, 30 * MIN_MS];

/**
 * outbound_send: the honest undo — the message sat status='queued' through
 * its cancel window; if it is STILL queued, send it through the door and
 * finalize. The door re-reads the person's consent with this message's
 * purpose, the thread's pause and the workspace's status at the wire; what is
 * here is the outbox's own business: whether the row is still there to send,
 * which yes its template needs, and who is told when the wire could not
 * carry it.
 */
export async function sendQueued(ports: SendQueuedPorts, cmd: SendQueuedCommand): Promise<void> {
  const p = cmd.payload;
  let msg: Awaited<ReturnType<SendQueuedPorts["queued"]>>;
  try {
    msg = await ports.queued(p.message_id);
  } catch (e) {
    // Throw: the tick fails the job, settles the message and tells the tenant,
    // so it is visibly stuck rather than invisibly lost.
    throw new Error(
      `outbound_send: cannot read message ${p.message_id}: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
  if (!msg || msg.status !== "queued") return; // canceled or already handled: no-op
  // Which yes this send needs: the template's, as Meta has it, or stricter when the job says the words are an offer.
  // A payload is our own code's word, and our own code is not the authority on a template's category, so it can only
  // tighten. Proactive likewise: only a job that says so starts a conversation; everything else on this queue answers
  // a thread that exists.
  const fromTemplate = await ports.purposeOf(p.template);
  // Outreach is its own lane (a cold email to a business the finder found): it loosens nothing, because the door
  // refuses it anywhere outside its own rules (email only, a lead, an unsubscribe, an own verified domain).
  const purpose: SendPurpose =
    p.purpose === "outreach" ? "outreach" : p.purpose === "marketing" ? "marketing" : fromTemplate;
  // A channel this runtime has no wire for finds none at the door and fails
  // loudly, leaving the customer un-messaged rather than reached over the
  // wrong wire.
  const channel = (msg.channel ?? "whatsapp") as Channel;
  const to = channel === "email" ? p.to_email : channel === "instagram" ? p.to_instagram : p.to_phone;
  // A job that does not say where its words go was scheduled wrongly: it fails, and the tick settles the row and tells the owner.
  if (!to)
    throw new Error(
      `outbound_send: message ${p.message_id} goes out by ${channel} and the job names no ${channel === "email" ? "address" : channel === "instagram" ? "Instagram id" : "number"}`,
    );
  const resumes = resumesOf(p);
  // A person's own message that begins a conversation (payload.starts, core conversations/begin.ts): a start at the
  // door, and theirs. Only a row a person wrote may say so: the receptionist's own reply travels this path too.
  const starts = p.starts === true && (msg.sender ?? "human") === "human";
  // The row is this run's before anything reaches a wire. A second job naming the same message (a schedule made
  // twice, a writer that checked and then wrote beside another) finds it claimed and sends nothing: this job is done,
  // and the row is the claiming run's to finish, or the ledger's to settle when that run died.
  if (!(await ports.claim(p.message_id))) return;
  let out: Delivered;
  try {
    out = await ports.deliver({
      tenantId: cmd.tenantId,
      conversationId: p.conversation_id,
      contactId: null,
      to,
      channel,
      // Read from the ROW, not hardcoded: under a veto window the receptionist's
      // own reply travels this path, and stamping every send "human" would make
      // the metrics report a bot's words as a person's.
      sender: (msg.sender ?? "human") as "ai" | "human" | "system",
      purpose,
      proactive: p.proactive === true || starts,
      // One message to one person in their own thread (a reply, the receptionist's, a person's written one): theirs.
      // A campaign's news goes by the broadcast's batch, which says ours (contracts MessageAbout, decision D1).
      about: "theirs",
      // No moment's: a reply is no playbook's run, so there is nothing for the door to pass the handover pause for.
      trigger: null,
      body: p.body ?? msg.body ?? "",
      template: p.template,
      // The request the row was queued with, sent as it was frozen. A row without one fails at the wire, by name.
      ...(msg.email ? { email: msg.email, ownEmail: msg.ownEmail } : {}),
      ...(msg.leadId ? { leadId: msg.leadId } : {}),
      messageId: p.message_id,
      // Held as the person's own words: the thread's pause is the one their own message took (deliver kindOf).
      ...(starts ? { kind: "reply" as const } : {}),
      holdIfNotTaken: resumes < SEND_RETRY_WAITS_MS.length,
    });
  } catch (e) {
    // The wire could not be BOUND: the workspace's credentials could not be read. Not a refusal, and not "no
    // credentials" -- the number may well be connected -- so nothing is flagged and nobody is told to reconnect it.
    // Nothing left and the row is still queued, so the same send is handed to a fresh job a while on, a bounded
    // number of times; the platform is paged, because a credentials store that does not answer is its condition.
    // A send the provider did not take is handed on the same way, and pages nobody. Any other throw is the door's
    // own, and stays as loud as it was.
    if (!isWireUnavailableError(e) && !isNotTakenError(e)) throw e;
    // Nothing left, so the claim is given back before the fresh job is asked for: it is that job's to take.
    await ports.release(p.message_id);
    await resendLater(ports, cmd, channel, e);
    return;
  }
  if (out.outcome === "refused" && out.reason === "too_late") return handItOver(ports, cmd, { channel, to });
  if (out.outcome !== "failed") return;
  await sayItFailed(ports, cmd, { msg, channel, purpose, to, out });
}

/**
 * The receptionist's reply the door held back as too late (deliver.ts too_late): it would have reached them past the
 * reply horizon after the message it answers, so it is a person's to send, exactly as that message would have been had
 * it come in this late (inbound reply-gates.ts tooLate). The row keeps the words, canceled, for whoever answers. A
 * thread nothing holds is held under the same reason, `stale`, and told from its event, once per hold. A hold that
 * could not be written is told here, in the notice its event would have given, since nothing will say it again.
 */
async function handItOver(
  ports: SendQueuedPorts,
  cmd: SendQueuedCommand,
  f: { channel: Channel; to: string },
): Promise<void> {
  const conversationId = cmd.payload.conversation_id;
  // A thread already held keeps its hold: its reason, its act and its one notice. The receptionist's own escalation
  // queues its holding message as a draft and opens the hold in the same breath (inbound dispatch.ts heldOrKept), and
  // 'stale' replacing a booking's hold lost its act and told the owner again. A hold that cannot be read is not one
  // known to be open: the thread is handed over, since a second notice is better than a thread nobody holds.
  if (await ports.openHold(conversationId).catch(() => null)) return;
  const details = PURPOSE_REFUSALS.too_late;
  const held = await ports.escalate(conversationId, "stale", details);
  if (toldFromItsEvent(held)) return;
  await ports.alert(
    holdNotice({
      conversationId,
      reason: "stale",
      details,
      who: null,
      address: f.to,
      channel: f.channel,
      // Not read again on a path the database just failed: the thread, one tap away, has their words. Nor the
      // draft's: the hold's own notice names only words that reached them (db holdFactsOf), and these never did.
      customerWords: null,
      replyWords: null,
      pausedHours: null,
      // The door refuses an erased person before it asks how late a draft is, so this one is not.
      erased: false,
    }),
  );
}

/** How many fresh jobs this send already is the result of (payload.resumes). */
function resumesOf(p: SendQueuedCommand["payload"]): number {
  return typeof p.resumes === "number" && p.resumes > 0 ? Math.floor(p.resumes) : 0;
}

/**
 * A reply whose wire could not be BOUND (deliver WireUnavailableError), or that the provider did not take
 * (NotTakenError), handed to a fresh job a while on, a bounded number of times (SEND_RETRY_WAITS_MS); past the last
 * wait it fails loudly by name. A wire that could not be bound pages the platform; a send not taken does not.
 */
async function resendLater(
  ports: SendQueuedPorts,
  cmd: SendQueuedCommand,
  channel: Channel,
  e: WireUnavailableError | NotTakenError,
): Promise<void> {
  const p = cmd.payload;
  const resumes = resumesOf(p);
  const table = SEND_RETRY_WAITS_MS[resumes];
  const unbound = isWireUnavailableError(e);
  if (table === undefined)
    throw new Error(
      `outbound_send: the ${channel} ${unbound ? "wire could not be bound" : "provider did not take it"} for ${resumes} fresh jobs in a row (${e.message})`,
      { cause: e },
    );
  // Drawn a little longer at random, so the replies one outage held are not all tried again in the same heartbeat.
  const wait = jittered(table, ports.random);
  // The fresh job first: it is what keeps the reply. The page is the platform's news, and a pager that throws must
  // not turn a reply that is waiting into one that failed.
  await ports.retry(new Date((ports.now ?? Date.now)() + wait), { ...p, resumes: resumes + 1 });
  if (!unbound) return;
  await ports
    .page?.(
      `wire_unavailable:${channel}`,
      `${channel}: a workspace's credentials could not be read`,
      `Tenant ${cmd.tenantId}, message ${p.message_id}: ${e.message}. The reply stays queued; a fresh job tries again in ${Math.round(wait / MIN_MS)} min (${resumes + 1} of ${SEND_RETRY_WAITS_MS.length}).`,
    )
    ?.catch(() => undefined);
}

/** What a failed send owes: the platform paged for its own conditions, the thread flagged and the owner told. */
interface FailedSend {
  msg: NonNullable<Awaited<ReturnType<SendQueuedPorts["queued"]>>>;
  channel: Channel;
  purpose: SendPurpose;
  to: string;
  out: Extract<Delivered, { outcome: "failed" }>;
}

/** The wire could not carry it. */
async function sayItFailed(ports: SendQueuedPorts, cmd: SendQueuedCommand, f: FailedSend): Promise<void> {
  const p = cmd.payload;
  const { msg, channel, to, out } = f;
  // A provider's limit or a refused key is the platform's to hear, never one thread's (provider-page.ts, as a broadcast's).
  await pageTheProvider(ports, f, `Tenant ${cmd.tenantId}, message ${p.message_id}`);
  // A campaign's email that failed (a reach-out, a broadcast) is its run's to report, once, and its row already says
  // it: never a flag on a thread nobody there wrote on, or an owner alert per email of a run. The one predicate the
  // receipt and a job that died ask too (contracts isCampaignEmail).
  if (channel === "email" && isCampaignEmail(msg.email)) return;
  // The wire could not carry it: the thread is flagged for a person and the
  // owner told, in words that say whose reply it was and what stopped it --
  // a number with no credentials is not "HTTP 503". A refusal needs neither;
  // the row says why.
  const cause = causeOf(out, channel);
  const receptionist = msg.sender === "ai";
  const flagged = await raiseSendFailed(ports, {
    conversationId: p.conversation_id,
    details: `${receptionist ? "The receptionist's reply" : "Dashboard reply"} could not be delivered (${cause}).`,
  });
  // A flag written is told from its event (decision 0043). One that could not be is told here: the job completes, and
  // nothing will say it again.
  if (toldFromItsEvent(flagged)) return;
  await ports.alert({
    kind: "handoff",
    route: `inbox/th-${p.conversation_id}`,
    about: { type: "conversation", id: p.conversation_id },
    subject: `Reply delivery failed: ${to}`,
    body: `${receptionist ? "A reply the receptionist queued" : "A reply queued from the dashboard"} could not be sent (${cause}). The thread is flagged in the Inbox.`,
  });
}

/**
 * A reply that did not reach the customer: THE statement of what it owes, whichever way it was found out. The thread is
 * flagged for a person (reason send_failed, with why in `details`), by a send the wire could not carry (sayItFailed) and
 * by a delivery the provider reported failed after taking it (late-failure.ts), so the two cannot come to say it
 * differently. Answers what the flag came to. A flag written is told from its event, once per hold (decision 0043,
 * owner_notice), as every hold is: a thread already held for a failed send (`refreshed`) has its details brought up to
 * date and rings no second bell, so a receipt the provider sends twice, or a run of failures on one thread, is one
 * notice. What a flag that could not be written comes to is the caller's: the send tells the owner itself, and a
 * receipt throws, so the provider says it again.
 *
 * The flag is a conversation that needs a person: the same thing a WhatsApp handoff is, drawn the same way. The job
 * itself completes; it never was "a job did not finish". (Today drops an away-row whose conversation the queue already
 * shows, so this row usually appears only as the thread at the top of the page, which is where it is.)
 */
export function raiseSendFailed(
  ports: Pick<SendQueuedPorts, "escalate">,
  f: { conversationId: string; details: string },
): Promise<"opened" | "changed" | "refreshed" | "failed"> {
  return ports.escalate(f.conversationId, "send_failed", f.details);
}

/** Why it did not leave, in words for the owner: a number with no credentials is not "HTTP 503". */
function causeOf(out: FailedSend["out"], channel: Channel): string {
  const limit = out.limit ?? null;
  // Named for the wire it was going out on: a text with no line is not a
  // WhatsApp number that failed.
  const notConnected =
    channel === "sms"
      ? "the texting line is not connected"
      : channel === "whatsapp"
        ? "the WhatsApp number is not connected"
        : `the ${channel} channel is not connected`;
  return out.reason === "no_credentials"
    ? notConnected
    : out.reason === "no_sender_for_channel"
      ? `this runtime has no ${channel} line`
      : out.reason === "wire_unreadable"
        ? "the thread could not be read at the wire"
        : limit === "daily" || limit === "monthly"
          ? "the mail provider's sending limit is used up for now"
          : limit === "rate"
            ? "the mail provider asked us to slow down"
            : limit === "in_flight"
              ? "the mail provider is still sending an earlier try of it; check the thread before sending it again"
              : // Status 0 is no answer at all: no answer in time or a connection dropped after it left (it may have
                // gone), a connection that never opened, or the email wire refusing a request it will not send
                // (wire-senders.ts emailSender). The row keeps which; "HTTP 0" told an owner nothing.
                out.status === 0 && out.mayHaveGone
                ? "the provider did not answer, so it may have gone; check the thread before sending it again"
                : out.status === 0
                  ? "it never reached the provider"
                  : `HTTP ${out.status}`;
}
