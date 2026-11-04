/**
 * A lead's own email (decision 0094): one email a member writes to one lead, sent from a connected mailbox or said sent
 * from their own mail app. Every word and rule of it the sheet, its door and History share.
 *
 *   leadEmailFromOf   the mailbox it leaves from, or why it goes from the mail app
 *   leadEmailLineOf   how one reads in History
 */
import { mailboxSendsNow } from "../../email/mailbox-connections";
import { mailboxDailyCap } from "../../email/mailbox-standing";
import { PURPOSE_REFUSALS } from "../../consent/consent";
import { sequenceLeftWords } from "../../sequences/sequence-words";

export const LEAD_OWN_EMAIL_WORDS = {
  send: "Send",
  from: (address: string) => `From ${address}`,
  sending: (address: string) => `Sending from ${address}`,
  /** Why the mail app is the road: said under the email, and by the door when a press finds the same. */
  whyNot: {
    no_mailbox: "Connect a Google mailbox on Connections to send from here.",
    not_sending: "Your mailbox can't send right now. Connections, under Email, says why.",
    day_full: "Your mailbox has sent its share for today.",
  },
  /** Asked twice while one is on its way, as the partial index refuses it. */
  onItsWay: "Your last email to them is still on its way.",
  noUnsubscribe: "Sending from here isn't set up yet.",
  notActive: "This workspace can't send from here right now. Billing says why.",
  monthSpent: "This workspace has sent its month's share of first emails.",
  noAddress: "This lead has no address that reaches them. Call instead.",
  unsendable: "These words can't go as an email. Change them and try again.",
  takenBack: "Not sent. Your email is here to change.",
  notTakenBack: "Not taken back",
  sub: "Written for them. Change anything, then send it.",
  subject: "Subject",
  words: "Your email",
  foot: "Added under your email",
  row: {
    from: (address: string) => `You wrote to them from ${address}`,
    yourself: "You wrote to them yourself",
    notSent: (why: string) => (why ? `Your email did not go: ${why}` : "Your email did not go"),
  },
} as const;

const W = LEAD_OWN_EMAIL_WORDS;

/** Why an email of your own goes from your mail app, not a mailbox. */
export type LeadEmailWhy = keyof typeof LEAD_OWN_EMAIL_WORDS.whyNot;

/** A connected mailbox as the pick reads it: its row and its day (mailbox_capacity). */
export interface LeadEmailMailbox {
  id: string;
  address: string;
  provider: string;
  connected_by: string | null;
  state: string;
  resting_until: string | null;
  sent_days: number;
  daily_cap: number;
  customer_domain: boolean;
  /** What it spends in the rolling day: left, of unknown outcome, queued, claimed. */
  used: number;
}

/**
 * The mailbox a lead's own email leaves from. A lead in a sequence hears from its sequence's mailbox alone, while the
 * workspace has it (each lead hears from one, 00424): if that one can't send now, the mail app, never a second address.
 * Otherwise the member's own first, then the workspace's oldest, the first that sends now with room in its day. Google
 * alone (Microsoft is halted, 27 Oct 2026). Why not, where none will do.
 */
export function leadEmailFromOf<M extends LeadEmailMailbox>(p: {
  sequenceMailbox: string | null;
  userId: string;
  mailboxes: readonly M[];
  nowMs: number;
}): { from: M; why: null } | { from: null; why: LeadEmailWhy } {
  const google = p.mailboxes.filter((m) => m.provider === "google");
  const held = google.find((m) => m.id === p.sequenceMailbox);
  const mine = (m: M) => m.connected_by === p.userId;
  const asked = held ? [held] : [...google.filter(mine), ...google.filter((m) => !mine(m))];
  if (asked.length === 0) return { from: null, why: "no_mailbox" };
  const sending = asked.filter((m) => mailboxSendsNow(m, p.nowMs));
  if (sending.length === 0) return { from: null, why: "not_sending" };
  const from = sending.find((m) => m.used < mailboxDailyCap(m));
  return from ? { from, why: null } : { from: null, why: "day_full" };
}

/**
 * Why a press was refused, in the send door's own words where it has them (contracts draftRefusalOf, db reachOutPerson).
 * A lead gone, closed or someone's in People is one no longer written to.
 */
export function leadEmailRefusalOf(reason: string): string {
  if (reason === "no_address") return W.noAddress;
  return PURPOSE_REFUSALS[reason] ?? PURPOSE_REFUSALS.outreach_lead_closed;
}

/** One email of your own, as its read answers it (GET leads/:id/emails), oldest first. */
export interface LeadEmailDto {
  id: string;
  state: string;
  /** When it left, or was said sent; else when it was written. */
  at: string | null;
  /** The mailbox it left from; null where you said you sent it yourself. */
  from: string | null;
  said: boolean;
  reason: string | null;
}

/** Why a send that was taken back with Undo stands skipped (the clock reads it off its email): it was never anything. */
const TAKEN_BACK = "canceled";

/** How one reads in History; null for one taken back with Undo. */
export function leadEmailLineOf(e: LeadEmailDto): string | null {
  if (e.reason === TAKEN_BACK) return null;
  if (e.state === "sent") return e.from ? W.row.from(e.from) : W.row.yourself;
  if (e.state === "queued") return W.sending(e.from ?? "");
  return W.row.notSent(e.state === "failed" ? "" : sequenceLeftWords(e.reason));
}
