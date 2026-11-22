import "server-only";

/**
 * A press on one request (00680; the Forms plan, 3.5): its reply sent, a member's word that it was answered another
 * way (and that word taken back), a request that is not a real one held, and a held entry let through.
 *
 * The reply leaves by the doors every message leaves by: core's beginConversation opens the person's one thread where
 * they have none and queues the message as a reply is queued, with its seconds to take it back, and what the person
 * writes back is AI's to answer by the workspace's own rules (the canvas's call 13). The send door decides whether it
 * may go at all. The reply is then kept as what answered THIS request (form_entry_links), written by the act itself:
 * a reply never closes another request, and one that fails or is taken back answers nothing.
 *
 * A person's page is never overwritten by what was typed into a form. Where the request's address is not the one on
 * their page, the reply waits for the member's pick: the request's own (their page takes it, by the member's word) or
 * the one on their page. An address that bounced may be answered at its likely fix, by the same pick.
 */
import { AppError, asTenantId, emailTypoFix, heldContactId, type FormRequestPress } from "@chanlytics/contracts";
import { beginConversation } from "@chanlytics/core";
import {
  findFormRequest,
  findFormVersion,
  holdFormEntry,
  letFormEntryThrough,
  linkFormReply,
  markFormEntryAnswered,
  removeFormEntryMark,
  type FormEntryRead,
} from "@chanlytics/db/forms";
import { findPersonAddress, setPersonEmail } from "@chanlytics/db/people";
import { beginPorts } from "../new-conversation/ports";
import type { Member } from "../shared/route";
import { serviceDb } from "../shared/service-db";
import { dbRefusal, type RouteContext } from "../shared/with-route";

/** What a press on a request answers: the message a reply queued, with how long it can be taken back, or nothing more. */
interface FormRequestPressed {
  message_id: string | null;
  cancelable_until: string | null;
  conversation_id: string | null;
}

const NOTHING_SENT: FormRequestPressed = { message_id: null, cancelable_until: null, conversation_id: null };

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
  const version = await findFormVersion(ctx.supabase, member.tenantId, entry.versionId);
  const subject = press.subject ?? `Re: ${version?.description?.heading ?? "your request"}`;
  const receipt = await beginConversation(beginPorts(ctx), {
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
  await linkFormReply(ctx.supabase, {
    tenantId: member.tenantId,
    entryId: entry.id,
    messageId: receipt.message_id,
    userId: ctx.userId,
  });
  return {
    message_id: receipt.message_id,
    cancelable_until: receipt.cancelable_until,
    conversation_id: receipt.conversation_id,
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
  const marked = { tenantId: member.tenantId, entryId: entry.id };
  if (press.act === "mark") await markFormEntryAnswered(ctx.supabase, { ...marked, userId: ctx.userId });
  else if (press.act === "unmark") await removeFormEntryMark(ctx.supabase, marked);
  // The entry itself is the service role's to write: the route asked the member's role, and the door asks the row's workspace.
  else if (press.act === "hold") await holdFormEntry(serviceDb(), member.tenantId, entry.id);
  else await letFormEntryThrough(serviceDb(), member.tenantId, entry.id);
  return NOTHING_SENT;
}
