/**
 * The senders of a connected mailbox's mail, as the dashboard holds them (00483): the list under the mailbox on
 * Connections (who it left mail from, and what the workspace said of senders), what a member says of a sender, and "Not
 * a person" on a person. A sender said to be a person is brought in through the edge (op bring_in), which alone holds
 * the mailbox's token; a sender said not to be one is sorted on the member's session, and the person deleted through
 * the erasure's own legs.
 */
import {
  AppError,
  normalizeEmail,
  senderDomainOffered,
  senderSortRefusal,
  type MailboxSenderVerdict,
  type MailboxSendersDto,
} from "@chanlytics/contracts";
import { mailboxConnectionsOf, mailboxSendersOf, sortMailboxSender } from "@chanlytics/db";
import { eraseContact } from "@/server/people/erase-contact";
import type { erasureScope } from "@/server/verbs";
import type { RouteContext } from "@/server/with-route";
import { log } from "@/server/log";
import { edgeMailboxes } from "./mailbox-connections";

/** The workspace's own mailboxes' domains: never said to be automated as a whole (contracts senderDomainOffered). */
async function ownHosts(ctx: RouteContext, tenantId: string): Promise<string[]> {
  return (await mailboxConnectionsOf(ctx.supabase, tenantId)).map((m) => m.host);
}

/** The list under the mailbox, on the member's session. */
export function mailboxSendersFor(ctx: RouteContext, tenantId: string): Promise<MailboxSendersDto> {
  return mailboxSendersOf(ctx.supabase, tenantId);
}

/** What the door refused, in the route's words: not theirs to change, or not a sender. */
function sortRefused(e: unknown): never {
  const code = (e as { code?: unknown } | null)?.code;
  if (code === "42501") throw new AppError("forbidden", "Only someone who may change the settings can do this.");
  if (code === "22023") throw new AppError("validation", "That isn't an address or a domain.");
  throw e;
}

/**
 * A sender's mail from the mailboxes' six months and since, kept in their thread: how many, or null when the edge could
 * not be asked now. Best effort: what was said stands either way, and their next email comes in.
 */
async function bringIn(tenantId: string, userId: string, address: string): Promise<number | null> {
  const a = await edgeMailboxes({ op: "bring_in", tenant_id: tenantId, user_id: userId, address }, 55_000);
  const kept = (a.body as { kept?: unknown } | null)?.kept;
  if (a.status === 200 && typeof kept === "number") return kept;
  log.warn("mailbox_bring_in_failed", { tenant_id: tenantId, status: a.status });
  return null;
}

/**
 * What a member says of a sender: an address or a domain is automated, a person, or taken back (null). A person said of
 * an address is brought in. Answers the sender as kept, and how many of their emails came in.
 */
export async function sortSender(
  ctx: RouteContext,
  tenantId: string,
  input: { sender: string; verdict: MailboxSenderVerdict | null },
): Promise<{ sender: string; verdict: MailboxSenderVerdict | null; kept: number | null }> {
  const sender = input.sender.trim().toLowerCase();
  const refusal = senderSortRefusal(sender, input.verdict, await ownHosts(ctx, tenantId));
  if (refusal) throw new AppError("validation", refusal);
  await sortMailboxSender(ctx.supabase, { tenantId, sender, verdict: input.verdict }).catch(sortRefused);
  const kept = input.verdict === "person" && sender.includes("@") ? await bringIn(tenantId, ctx.userId, sender) : null;
  return { sender, verdict: input.verdict, kept };
}

/**
 * "Not a person" on a person: their address, or every address at their domain where that is offered, said to be
 * automated, then the person deleted as Delete person deletes (erase-contact.ts). The saying comes first, so an erasure
 * that has to be asked again finds it said, and the next email from them stays in the mailbox.
 */
export async function notAPerson(
  ctx: RouteContext,
  contact: Awaited<ReturnType<typeof erasureScope.load>>,
  scope: "address" | "domain",
) {
  const address = normalizeEmail(contact.email);
  if (!address) throw new AppError("validation", "This person has no email address to sort.");
  const domain = scope === "domain" ? senderDomainOffered(address, await ownHosts(ctx, contact.tenant_id)) : null;
  if (scope === "domain" && !domain) throw new AppError("validation", "Only this address can be marked.");
  await sortMailboxSender(ctx.supabase, {
    tenantId: contact.tenant_id,
    sender: domain ?? address,
    verdict: "automated",
  }).catch(sortRefused);
  return eraseContact(ctx, contact);
}
