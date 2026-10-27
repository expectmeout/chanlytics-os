/**
 * The small helpers people.ts and the person modules share: a month's span, a timestamp read, the dates they print.
 * Internal: index.ts never re-exports it (the person-words.ts / run-words.ts pattern). A day, a week, a call's length
 * and a capital letter are the shared modules' (shared/time.ts, shared/clock.ts, shared/words.ts).
 */
import { clockDate } from "../shared/clock";
import { DAY_MS } from "../shared/time";
import type { PersonCampaignVM, PersonDetailDto, PersonSequenceVM } from "./person-dto";
import type { PersonProposalVM } from "./person-reach";
import { adRoute } from "../ads/address";
import { PERSON_AD_ON, PERSON_CAME_FROM_WORDS, PERSON_CHANNEL_WORDS, type PersonChannel } from "./person-words";
import type { ConversationDto } from "../conversations/thread-dto";
import type { WrittenChannel } from "../conversations/thread-channel";
import {
  THREAD_CHANNEL_WORDS,
  isChatMessage,
  isFromTheirSide,
  isTheirOwnWords,
  writtenChannelOf,
} from "../conversations/thread-channel";
import { HELD_REASONS, isReplyTo } from "../broadcasts/run-words";
import { addressOf } from "../activity/record-address";

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

/**
 * The wire a reply goes out on, exactly: where they last wrote, by the reply route's own rule (verbs replyChannelOf,
 * contracts isTheirOwnWords): their newest own words across their threads, and for a person who has written none, the
 * newest written thing from their side (a program at their address is still their address). Null for neither.
 */
export function replyChannelOfThreads(conversations: ReadonlyArray<ConversationDto>): WrittenChannel | null {
  type Latest = { at: number; channel: string | null | undefined } | null;
  let own: Latest = null;
  let any: Latest = null;
  for (const c of conversations) {
    for (const m of c.messages) {
      if (!isFromTheirSide(m)) continue;
      const at = Date.parse(m.channel_ts ?? m.created_at);
      if (!Number.isFinite(at)) continue;
      if (!any || at > any.at) any = { at, channel: m.channel };
      if (isTheirOwnWords(m) && (!own || at > own.at)) own = { at, channel: m.channel };
    }
  }
  const latest = own ?? any;
  return latest ? writtenChannelOf(latest.channel) : null;
}

/**
 * Where nothing has come from their side: the wire the business's own written words last went by across their
 * threads, as the Inbox's reply box and the reply route read it (thread-channel.ts answerWireOf, the dashboard's
 * replyChannelOf), so a person a member wrote to first reads the same wire on their page. Null where it wrote none.
 */
export function ourWireOfThreads(conversations: ReadonlyArray<ConversationDto>): WrittenChannel | null {
  let last: { at: number; channel: string | null | undefined } | null = null;
  for (const c of conversations) {
    for (const m of c.messages) {
      if (m.direction !== "outbound" || !isChatMessage(m)) continue;
      const at = Date.parse(m.channel_ts ?? m.created_at);
      if (Number.isFinite(at) && (!last || at > last.at)) last = { at, channel: m.channel };
    }
  }
  return last ? writtenChannelOf(last.channel) : null;
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
 * (00140, 00142), 'import' a client list the owner brought in (00170), 'ad' an ad (the ad by name and platform, with
 * the address that opens it, `to`, where it is known), and any other source -- 'manual', or whatever POST contacts was
 * given -- a hand. In came_from's words, once: History's row says who and "Added" how, About's Added row the day and
 * how.
 */
export function addedBy(added: Pick<NonNullable<PersonDetailDto["added"]>, "source" | "title" | "ad">): {
  who: string;
  how: string;
  to: string | null;
} {
  if (added.source === "import") return { who: "You", how: "from a spreadsheet", to: null };
  if (added.source === "ad") return addedByAd(added.ad ?? null);
  if (added.source !== "calendar" && added.source !== "lead") return { who: "You", how: "by hand", to: null };
  const from = PERSON_CAME_FROM_WORDS[added.source];
  return {
    who: added.source === "calendar" ? "Calendar" : "Leads",
    how: `from ${from.charAt(0).toLowerCase()}${from.slice(1)}${added.source === "calendar" && added.title ? ` (${added.title})` : ""}`,
    to: null,
  };
}

/** An ad that brought someone: `from an ad (Spring offer, on Facebook and Instagram)`, and the door to it where the ad is known. */
function addedByAd(ad: NonNullable<PersonDetailDto["added"]>["ad"] | null): {
  who: string;
  how: string;
  to: string | null;
} {
  const from = PERSON_CAME_FROM_WORDS.ad.toLowerCase();
  if (!ad) return { who: "Ads", how: `from ${from}`, to: null };
  return { who: "Ads", how: `from ${from} (${ad.name}, on ${PERSON_AD_ON[ad.platform]})`, to: adRoute(ad.id) };
}

/**
 * The runs that named a person, newest first, each with what became of it: sent, and answered by the run report's own
 * rule (isReplyTo) in the thread the message went to; held back, in the owner's words for why (HELD_REASONS); or not
 * sent. A person's page said nothing about what a playbook or a broadcast had sent them.
 */
export function campaignsOf(d: PersonDetailDto, tz: string, nowMs: number): PersonCampaignVM[] {
  const threadOf = new Map<string, string>();
  const repliesIn = new Map<string, string[]>();
  for (const c of d.conversations) {
    for (const m of c.messages) {
      threadOf.set(m.id, c.id);
      // A reply is their own words, as a run's page counts it (isTheirOwnWords): not a call's note, not their mailbox.
      if (isTheirOwnWords(m)) repliesIn.set(c.id, [...(repliesIn.get(c.id) ?? []), m.created_at]);
    }
  }
  return (d.campaigns ?? []).map((c) => {
    const at = ts(c.sent_at ?? c.scheduled_for);
    const thread = c.message_id ? threadOf.get(c.message_id) : undefined;
    const sentAt = c.sent_at;
    const replied =
      c.state === "sent" && !!sentAt && !!thread && (repliesIn.get(thread) ?? []).some((x) => isReplyTo(sentAt, x));
    const why = c.reason ? HELD_REASONS[c.reason] : undefined;
    const outcome =
      c.state === "sent"
        ? replied
          ? "Replied"
          : "Sent"
        : c.state === "skipped"
          ? `Held — ${why ?? "held back"}`
          : c.state === "failed"
            ? why
              ? `Didn't send — ${why}`
              : "Didn't send"
            : "Waiting to send";
    return {
      id: c.broadcast_id,
      kind: c.playbook_id ? "playbook" : "broadcast",
      title: c.playbook_id ? c.playbook_name || c.name : c.name,
      when: at !== null ? clockDate(at, tz, nowMs) : "—",
      outcome,
      // Which wire it went by, or would have: a person on three channels is not told "Sent" with nowhere to look.
      line: `${c.playbook_id ? "Campaign" : "Sent once"} · ${THREAD_CHANNEL_WORDS[writtenChannelOf(c.channel)]} · ${outcome}`,
      tone: replied ? "ok" : c.state === "skipped" || c.state === "failed" ? "warn" : "plain",
      to: addressOf({ kind: "send", id: c.broadcast_id }),
    };
  });
}

/** The sequences a person is in now (0060, S5), as their page says them, soonest next first (PersonSequenceVM). */
export function inSequencesOf(d: PersonDetailDto, tz: string, nowMs: number): PersonSequenceVM[] {
  return (d.sequences ?? []).map((q) => ({
    id: q.id,
    name: q.name,
    line: q.next_at ? `step ${q.place} · next ${clockDate(Date.parse(q.next_at), tz, nowMs)}` : `step ${q.place}`,
    to: addressOf({ kind: "campaign", id: q.id }),
  }));
}
