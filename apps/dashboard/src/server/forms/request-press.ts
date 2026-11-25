import "server-only";

/**
 * A press on one request (00680; the Forms plan, 3.5): its reply sent, a member's word that it was answered another
 * way (and that word taken back), a request that is not a real one held, a held entry let through, and the time it
 * asked for answered Booked it or Can't (00691, F3: request-time.ts).
 *
 * The reply leaves by the doors every message leaves by: core's beginConversation opens the person's one thread where
 * they have none and queues the message as a reply is queued, with its seconds to take it back, and what the person
 * writes back is AI's to answer by the workspace's own rules (the canvas's call 13). The send door decides whether it
 * may go at all. The message says which request it answers, and is kept as what answered THIS request (form_entry_links)
 * in its own write (00713 messages_answer_a_form_request): a reply never closes another request, one that fails or is taken
 * back answers nothing, and a link that could not be written is a message that was not, so nothing is sent.
 *
 * A person's page is never overwritten by what was typed into a form. Where the request's address is not the one on
 * their page, the reply waits for the member's pick: the request's own (their page takes it, by the member's word) or
 * the one on their page. An address that bounced may be answered at its likely fix, by the same pick.
 */
import {
  AppError,
  asTenantId,
  emailTypoFix,
  heldContactId,
  recordOrEmpty,
  type FormRequestPress,
} from "@chanlytics/contracts";
import { beginConversation, type BeginPorts } from "@chanlytics/core";
import {
  findFormRequest,
  findFormVersion,
  holdFormEntry,
  letFormEntryThrough,
  markFormEntryAnswered,
  removeFormEntryMark,
  type FormEntryRead,
} from "@chanlytics/db/forms";
import { findPersonAddress, setPersonEmail } from "@chanlytics/db/people";
import { beginPorts } from "../new-conversation/ports";
import { readSiteRequestShapes } from "../connections/outside-forms";
import { answerRequestTime } from "./request-time";
import type { Member } from "../shared/route";
import { dbRefusal, type RouteContext } from "../shared/with-route";

/**
 * What a press on a request answers: the message a reply queued, with how long it can be taken back; for Booked it, the
 * reply it drafts from the visit's own words (F3); or nothing more.
 */
interface FormRequestPressed {
  message_id: string | null;
  cancelable_until: string | null;
  conversation_id: string | null;
  reply: string | null;
}

const NOTHING_SENT: FormRequestPressed = {
  message_id: null,
  cancelable_until: null,
  conversation_id: null,
  reply: null,
};

/** A request's heading, as its reply's subject says it: its version's, or its site form's name (00709); null where unread. */
async function requestHeadingOf(ctx: RouteContext, member: Member, entry: FormEntryRead): Promise<string | null> {
  if (entry.versionId) {
    const version = await findFormVersion(ctx.supabase, member.tenantId, entry.versionId);
    return version?.description?.heading ?? null;
  }
  if (!entry.outsideFormId) return null;
  const shapes = await readSiteRequestShapes(ctx.supabase, member.tenantId);
  return shapes.get(entry.outsideFormId)?.description.heading ?? null;
}

/** The request a press names, or a refusal in the house's words. */
async function requestOrRefuse(ctx: RouteContext, member: Member, entryId: string): Promise<FormEntryRead> {
  const entry = await findFormRequest(ctx.supabase, member.tenantId, entryId);
  if (!entry) throw new AppError("not_found", "That request isn't here any more.", 404);
  return entry;
}

/**
 * The address a reply by email goes to, settled before anything is queued, and answered so the send agrees to it by
 * value: the one on their page; or one the member picked, which their page then takes: the request's own, or the
 * likely fix of an address that looks mistyped (contracts emailTypoFix: the fix a reply that bounced is offered).
 * With the request's and the page's apart and no pick, the reply is refused in words that say both, and nothing is
 * sent. A pick that is none of these is no pick.
 */
async function settleAddress(
  ctx: RouteContext,
  member: Member,
  entry: FormEntryRead & { contactId: NonNullable<FormEntryRead["contactId"]> },
  picked: string | undefined,
): Promise<string | null> {
  const typed = entry.reach.email;
  const person = await findPersonAddress(ctx.supabase, member.tenantId, entry.contactId);
  const page = person?.email?.toLowerCase() ?? null;
  const pick = picked?.toLowerCase() ?? null;
  const mended = [typed, page].flatMap((address) => (address ? [emailTypoFix(address)?.toLowerCase()] : []));
  if (pick && pick !== page && (pick === typed || mended.includes(pick))) {
    const { error } = await setPersonEmail(ctx.supabase, heldContactId(entry.contactId), pick);
    if (error) throw dbRefusal(error);
    return pick;
  }
  if (!typed || !page || page === typed || pick === page) return page;
  throw new AppError(
    "conflict",
    `They typed ${typed} on this request, and their page says ${page}. Choose where the reply goes.`,
    409,
  );
}

/**
 * The world a reply begins in, with its message saying which request it answers: the database links the two as the message
 * is written (00713), so a reply queued is a request answered, or neither.
 */
function answeringPorts(ports: BeginPorts, entryId: string): BeginPorts {
  const reply = ports.reply;
  const meta = (row: { meta?: unknown }) => ({ ...recordOrEmpty(row.meta), form_entry_id: entryId });
  return { ...ports, reply: { ...reply, queue: (row) => reply.queue({ ...row, meta: meta(row) }) } };
}

/** The reply sent by the road named, and kept as what answered this request. */
async function sendReply(
  ctx: RouteContext,
  member: Member,
  press: Extract<FormRequestPress, { act: "reply" }>,
  idempotencyKey: string | null,
): Promise<FormRequestPressed> {
  const entry = await requestOrRefuse(ctx, member, press.entry_id);
  const { contactId } = entry;
  if (!contactId || entry.state === "held" || entry.test)
    throw new AppError("conflict", "This entry is held for a look. Let it through before answering it.", 409);
  const to = press.wire === "email" ? await settleAddress(ctx, member, { ...entry, contactId }, press.email_to) : null;
  const subject = press.subject ?? `Re: ${(await requestHeadingOf(ctx, member, entry)) ?? "your request"}`;
  const receipt = await beginConversation(answeringPorts(beginPorts(ctx), entry.id), {
    tenantId: asTenantId(member.tenantId),
    personId: contactId,
    userId: ctx.userId,
    wire: press.wire,
    // The address is agreed by value (core reply.ts ReplyBody.email_to): the member saw it on the request's page.
    body: { text: press.text, ...(press.wire === "email" ? { subject, ...(to ? { email_to: to } : {}) } : {}) },
    // What they write back is AI's to answer, as with anyone who writes in (the canvas's call 13).
    then: "receptionist",
    idempotencyKey,
  });
  return {
    message_id: receipt.message_id,
    cancelable_until: receipt.cancelable_until,
    conversation_id: receipt.conversation_id,
    reply: null,
  };
}

/** `POST forms/requests`: one press on a request. `idempotencyKey` is the page's own for one press of Send. */
export async function applyFormRequestPress(
  ctx: RouteContext,
  member: Member,
  press: FormRequestPress,
  idempotencyKey: string | null,
): Promise<FormRequestPressed> {
  if (press.act === "reply") return sendReply(ctx, member, press, idempotencyKey);
  // Read under the member's own row rules first: a request of another workspace is not found, whatever follows.
  const entry = await requestOrRefuse(ctx, member, press.entry_id);
  // The time it asked for, answered as a chat's is (F3): the door decides, and the decision is the member's.
  if (press.act === "book" || press.act === "cant")
    return { ...NOTHING_SENT, ...(await answerRequestTime(ctx, member, entry.id, press.act === "book")) };
  const marked = { tenantId: member.tenantId, entryId: entry.id };
  if (press.act === "mark") await markFormEntryAnswered(ctx.supabase, { ...marked, userId: ctx.userId });
  else if (press.act === "unmark") await removeFormEntryMark(ctx.supabase, marked);
  // The entry itself is written by its doors, on the member's session: each asks that they act in the workspace (00717).
  else if (press.act === "hold") await holdFormEntry(ctx.supabase, member.tenantId, entry.id);
  else await letFormEntryThrough(ctx.supabase, member.tenantId, entry.id);
  return NOTHING_SENT;
}
