/**
 * The small helpers people.ts and the person modules share: a month's span, a timestamp read, the dates they print.
 * Internal: index.ts never re-exports it (the person-words.ts / run-words.ts pattern). A day, a week, a call's length
 * and a capital letter are the shared modules' (shared/time.ts, shared/clock.ts, shared/words.ts).
 */
import { clockDate } from "../shared/clock";
import { DAY_MS } from "../shared/time";
import type { PersonDetailDto, PersonProposalVM } from "./people";
import { PERSON_CAME_FROM_WORDS, PERSON_CHANNEL_WORDS, type PersonChannel } from "./person-words";
import { type ConversationDto, writtenChannelOf } from "../conversations/viewmodels";

export const MONTH_MS = 30 * DAY_MS;

/* ------------------------------- helpers --------------------------------- */

export const ts = (iso: string | null | undefined): number | null => (iso ? new Date(iso).getTime() : null);

/**
 * "Jul 14", or "Jul 14, 2025" once it is not this year, by the business's
 * calendar (clock.ts). Every day and time on a person is said in the workspace's
 * zone: these formatters had none, so the browser's zone decided which day a
 * message was on (the 12 September audit's D5).
 */
export function fmtDate(ms: number, tz: string, nowMs: number): string {
  return clockDate(ms, tz, nowMs);
}

/** The wire a reply goes out on, exactly: where they last wrote (the reply route's own rule, verbs replyChannelOf). */
export function replyChannelOfThreads(
  conversations: ReadonlyArray<ConversationDto>,
): "whatsapp" | "sms" | "email" | null {
  let latest: { at: number; channel: string | null | undefined } | null = null;
  for (const c of conversations) {
    for (const m of c.messages) {
      if (m.sender !== "customer" || m.type === "call_summary") continue;
      const at = Date.parse(m.channel_ts ?? m.created_at);
      if (Number.isFinite(at) && (!latest || at > latest.at)) latest = { at, channel: m.channel };
    }
  }
  return latest ? writtenChannelOf(latest.channel) : null;
}

/** How a reply goes, in the words the page uses for the wire. */

/**
 * The newest message that carried the proposal's address and went out -- a
 * status that is not queued, canceled or failed, the rule people_list calls
 * spoken. Derived from the messages the page already reads, so "sent" is never
 * a stored flag that can disagree with the thread.
 */
export function proposalSent(conversations: ReadonlyArray<ConversationDto>, url: string): PersonProposalVM["sent"] {
  let best: { at: number; iso: string; channel: string | null } | null = null;
  for (const c of conversations) {
    for (const m of c.messages) {
      if (m.direction !== "outbound" || !m.body || !m.body.includes(url)) continue;
      if (m.status && ["queued", "canceled", "failed"].includes(m.status)) continue;
      const iso = m.channel_ts ?? m.created_at;
      const at = Date.parse(iso);
      if (Number.isFinite(at) && (!best || at > best.at)) best = { at, iso, channel: m.channel ?? null };
    }
  }
  if (!best) return null;
  const via =
    best.channel && best.channel in PERSON_CHANNEL_WORDS ? PERSON_CHANNEL_WORDS[best.channel as PersonChannel] : null;
  return { at: best.iso, via };
}

/**
 * Whether a message carrying the proposal's address is still on its way: queued, in the seconds its send can be
 * undone. The deal card says "Sending" and offers no second send until it has gone (0008).
 */
export function proposalSending(conversations: ReadonlyArray<ConversationDto>, url: string): boolean {
  return conversations.some((c) =>
    c.messages.some((m) => m.direction === "outbound" && m.status === "queued" && !!m.body && m.body.includes(url)),
  );
}

/**
 * Who added a person and how, from their first contact.added event (PersonDetailDto.added), read as
 * people_list reads it for came_from (00138): 'calendar' is the calendar sweep, 'lead' the lead finder
 * (00140, 00142), 'import' a client list the owner brought in (00170), and any other source -- 'manual',
 * or whatever POST contacts was given -- a hand. In came_from's words, once: History's row says who and
 * "Added" how, About's Added row the day and how.
 */
export function addedBy(added: Pick<NonNullable<PersonDetailDto["added"]>, "source" | "title">): {
  who: string;
  how: string;
} {
  if (added.source === "import") return { who: "You", how: "from a spreadsheet" };
  if (added.source !== "calendar" && added.source !== "lead") return { who: "You", how: "by hand" };
  const from = PERSON_CAME_FROM_WORDS[added.source];
  return {
    who: added.source === "calendar" ? "Calendar" : "Leads",
    how: `from ${from.charAt(0).toLowerCase()}${from.slice(1)}${added.source === "calendar" && added.title ? ` (${added.title})` : ""}`,
  };
}
