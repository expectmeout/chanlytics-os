/**
 * Whether a connected mailbox takes an email in as a person's, or leaves it where it is, and why (decision 0073, R13
 * and R19; 00483). One sorting for the live read (mailbox-sync.ts) and the six months (imports/mail-history.ts), asked
 * only outside a thread a reach-out started (a reply there is a reply, whatever it looks like), in this order:
 *
 *   said       what the workspace said of the sender (contracts senderVerdictOf, by address, then by domain): a person
 *              comes in whatever the email looks like, an automated sender is left.
 *   claim      what the email claims to be (channels classifyReceived): anything but a person's is left.
 *   gmail_tab  Gmail filed it under Promotions, Social or Forums (channels filedAsBulk).
 *   updates    Gmail filed it under Updates (channels filedUnderUpdates), it answers nothing (no In-Reply-To, no
 *              References), and the workspace does not know the sender (nobody in People has the address): a
 *              notice, an account's alert, an invoice. A person Gmail filed there is listed with the rest, one press
 *              from coming in.
 *
 * What is left is noted, one line a sender (00483 mailbox_left), so the owner sees who was left and why.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyReceived, filedAsBulk, filedUnderUpdates, type MailboxEmail } from "../../packages/channels.js";
import {
  normalizeEmail,
  senderVerdictOf,
  type MailboxLeftWhy,
  type MailboxSenderVerdict,
} from "../../packages/contracts.js";
import { contactIdByEmail, mailboxSenderVerdicts, noteMailboxLeft, type Database } from "../../packages/db.js";

type Db = SupabaseClient<Database>;

/** What a sorting reads beside the email: what the workspace said of its senders, and whether it knows an address. */
export interface MailSorting {
  said: ReadonlyMap<string, MailboxSenderVerdict>;
  knows(address: string): Promise<boolean>;
}

/** A workspace's sorting, read once for a sync or a part: what it said of its senders, and People asked as needed. */
export async function mailSortingFor(db: Db, tenantId: string): Promise<MailSorting> {
  const said = await mailboxSenderVerdicts(db, tenantId);
  return { said, knows: async (address) => (await contactIdByEmail(db, tenantId, address)) !== null };
}

/** Whether an email answers another: it names one it replies to. */
const answersSomething = (e: MailboxEmail): boolean => !!(e.headers["in-reply-to"] || e.headers.references);

/** Why the mailbox leaves this email where it is, or null when it comes in as a person's. */
export async function leftWhy(e: MailboxEmail, s: MailSorting): Promise<MailboxLeftWhy | null> {
  const from = normalizeEmail(e.from?.address);
  const said = from ? senderVerdictOf(s.said, from) : null;
  if (said === "person") return null;
  if (said === "automated") return "said";
  const claim = classifyReceived(e);
  if (claim !== "person") return claim;
  if (filedAsBulk(e)) return "gmail_tab";
  if (filedUnderUpdates(e) && !answersSomething(e) && from && !(await s.knows(from))) return "updates";
  return null;
}

/** The line about what was left, one a sender (00483): best effort, the email is left either way. */
export async function noteLeft(db: Db, tenantId: string, e: MailboxEmail, why: MailboxLeftWhy): Promise<void> {
  const address = normalizeEmail(e.from?.address);
  if (!address) return;
  await noteMailboxLeft(db, {
    tenantId,
    address,
    name: e.from?.name ?? null,
    why,
    at: e.createdAt ?? new Date().toISOString(),
  });
}
