/**
 * AI's own work, as Today says it (Working for you, 21 Nov 2026, W1 to W3 and W13): who AI is talking to right now, what
 * it did today, each with when and why a tap away, and how many people it answered and booked since this member last
 * looked at Today. Made from what Today's read already holds (the newest hundred threads with their newest messages, the
 * open holds) and the one thing it did not: the visits AI booked today (GET today's `ai`). Pure: the page and its tests
 * make it alike.
 */
import type { EscalationDto } from "../conversations/escalations";
import { reasonHeld, reasonLabelOf } from "../conversations/escalations";
import { clipAtWord, messageWords } from "../conversations/message-words";
import { contactName } from "../conversations/thread-contact";
import { threadChannelWords } from "../conversations/thread-channel";
import type { ConversationDto } from "../conversations/thread-dto";
import { MIN_MS } from "../shared/time";
import { entryOf } from "../shared/unknown";

/** A visit AI booked, as GET today carries it: who, when it is, what, and when AI booked it. */
export interface AiBookedDto {
  id: string;
  starts_at: string;
  service: string | null;
  /** The name the booking states, else null: the sheet names its thread's person where it has one. */
  who: string | null;
  conversation_id: string | null;
  timezone: string;
  created_at: string;
}

/**
 * What GET today says of AI beside the day's read: the visits AI booked today (null where that read failed), whether
 * Stop everything is on (null where the settings could not be read), and when this member last looked at Today (null
 * for the first look). Absent from a server from before (either deploy order).
 */
export interface TodayAiReadDto {
  booked: AiBookedDto[] | null;
  stopped: boolean | null;
  looked_at: string | null;
}

/**
 * Where a member's last look at Today is kept: their own saved views, under this page (PUT views/today_seen), as Ask keeps
 * its follow-ups under its own. Written as they leave Today, read by GET today as the moment "since you last looked" is from.
 */
export const TODAY_LOOKED_PAGE = "today_seen";

/** When a member last looked at Today, from their saved views; null where none is kept or it is not an instant. */
export function lookedAtOf(views: Readonly<Record<string, unknown>> | null | undefined): string | null {
  const seen = views?.[TODAY_LOOKED_PAGE];
  const at: unknown = seen && typeof seen === "object" ? Reflect.get(seen, "at") : null;
  return typeof at === "string" && Number.isFinite(Date.parse(at)) ? at : null;
}

/** Someone AI is in a conversation with now: who, on what, and their last words. */
export interface AiTalkingVM {
  conversation_id: string;
  who: string;
  /** "WhatsApp · “Anything Saturday morning?”" */
  said: string;
}

/** One thing AI did today, a line of the AI sheet: booked a visit, held a conversation for you, set one aside. */
export interface AiDidVM {
  kind: "booked" | "held" | "set_aside";
  at_ms: number;
  who: string;
  /** What it was, in a few words: "Color", "Asked to book a time", "A sales pitch". */
  what: string;
  /** Why, a tap away (W13): a hold's "AI held it: booking a time needs you."; null where nothing more is known. */
  why: string | null;
  conversation_id: string | null;
  /** A booking's visit, which its line opens on its day. */
  visit: { id: string; starts_at: string; timezone: string } | null;
}

/** AI's work as Today draws it: stopped or on, who now, what it did today newest first, and since this member looked. */
export interface TodayAiVM {
  /** Stop everything is on; null where it could not be read, and the page says nothing it cannot back. */
  stopped: boolean | null;
  talking: AiTalkingVM[];
  did: AiDidVM[];
  /** When this member last looked at Today, as an instant; null for a first look. */
  looked_ms: number | null;
  /** Since then: the people AI answered and the visits it booked (W2); null with no earlier look today. */
  since: { answered: number; booked: number } | null;
}

/** AI is in a conversation while it wrote in the last few minutes and they wrote in the last few more. */
const AI_WROTE_WITHIN_MS = 5 * MIN_MS;
const THEY_WROTE_WITHIN_MS = 10 * MIN_MS;
/** How much of their last words a line of Right now says. */
const TALKING_WORDS_MAX = 60;
/** The most of what AI did today the sheet carries: the newest. */
const AI_DID_MAX = 12;

/** What a set-aside's sender was read as, in a few words, and what one read as neither is. */
const SET_ASIDE_WHAT: Record<string, string> = {
  pitch: "A sales pitch",
  notice: "A notice, not a customer",
};
const SET_ASIDE_ELSE = "Not a customer";
/** A booking or a hold whose person the read does not name. */
const SOMEONE = "Someone";

const msOf = (iso: string | null | undefined): number | null => {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(ms) ? ms : null;
};

/** When AI last wrote on a thread, and when they did: from its newest messages. */
function lastWrote(conv: ConversationDto): { ai: number | null; they: number | null; words: string } {
  let ai: number | null = null;
  let they: number | null = null;
  let words = "";
  for (const m of conv.messages) {
    const at = msOf(m.created_at);
    if (at === null) continue;
    if (m.sender === "ai" && m.direction === "outbound" && (ai === null || at > ai)) ai = at;
    if (m.sender === "customer" && m.direction === "inbound" && (they === null || at > they)) {
      they = at;
      words = clipAtWord(messageWords(m), TALKING_WORDS_MAX);
    }
  }
  return { ai, they, words };
}

/** Who AI is talking to now: a thread where it wrote in the last minutes and they did too, newest first. */
function talkingOf(conversations: readonly ConversationDto[], nowMs: number): AiTalkingVM[] {
  return conversations.flatMap((conv) => {
    const w = lastWrote(conv);
    if (w.ai === null || w.they === null) return [];
    if (nowMs - w.ai > AI_WROTE_WITHIN_MS || nowMs - w.they > THEY_WROTE_WITHIN_MS) return [];
    const channel = threadChannelWords(conv.messages);
    return [
      { conversation_id: conv.id, who: contactName(conv), said: w.words ? `${channel} · “${w.words}”` : channel },
    ];
  });
}

/** What AI did today, from the day's read: its bookings, the holds opened today, the threads it set aside. */
function didOf(
  read: {
    conversations: readonly ConversationDto[];
    escalations: ReadonlyArray<EscalationDto & { conversation_id: string }>;
  },
  booked: readonly AiBookedDto[],
  dayStartMs: number,
): AiDidVM[] {
  const byThread = new Map(read.conversations.map((c) => [c.id, c]));
  const nameOf = (id: string | null, named: string | null): string => {
    if (named) return named;
    const conv = id ? byThread.get(id) : undefined;
    return conv ? contactName(conv) : SOMEONE;
  };
  const bookings = booked.flatMap((b): AiDidVM[] => {
    const at = msOf(b.created_at);
    return at === null
      ? []
      : [
          {
            kind: "booked",
            at_ms: at,
            who: nameOf(b.conversation_id, b.who),
            what: b.service ?? "A visit",
            why: null,
            conversation_id: b.conversation_id,
            visit: { id: b.id, starts_at: b.starts_at, timezone: b.timezone },
          },
        ];
  });
  const holds = read.escalations.flatMap((e): AiDidVM[] => {
    const at = msOf(e.created_at);
    return at === null || at < dayStartMs
      ? []
      : [
          {
            kind: "held",
            at_ms: at,
            who: nameOf(e.conversation_id, null),
            what: reasonLabelOf(e.reason),
            why: reasonHeld(e.reason),
            conversation_id: e.conversation_id,
            visit: null,
          },
        ];
  });
  const asides = read.conversations.flatMap((c): AiDidVM[] => {
    const at = msOf(c.set_aside_at);
    return at === null || at < dayStartMs
      ? []
      : [
          {
            kind: "set_aside",
            at_ms: at,
            who: contactName(c),
            what: entryOf(SET_ASIDE_WHAT, c.set_aside_why ?? "") ?? SET_ASIDE_ELSE,
            why: null,
            conversation_id: c.id,
            visit: null,
          },
        ];
  });
  return [...bookings, ...holds, ...asides].sort((a, b) => b.at_ms - a.at_ms).slice(0, AI_DID_MAX);
}

/** How many people AI answered since a moment: the threads it wrote on since then. */
const answeredSince = (conversations: readonly ConversationDto[], sinceMs: number): number =>
  conversations.filter((c) => {
    const ai = lastWrote(c).ai;
    return ai !== null && ai >= sinceMs;
  }).length;

/**
 * AI's work today, at `nowMs`. `dayStartMs` is the business's midnight (the day's own window): what AI did is today's.
 * With no `ai` from the server (a server from before), nothing is said of what it booked or whether it is stopped.
 */
export function todayAiOf(
  read: {
    conversations: readonly ConversationDto[];
    escalations: ReadonlyArray<EscalationDto & { conversation_id: string }>;
    ai?: TodayAiReadDto | null;
  },
  at: { nowMs: number; dayStartMs: number },
): TodayAiVM {
  const booked = read.ai?.booked ?? [];
  const looked = msOf(read.ai?.looked_at);
  return {
    stopped: read.ai?.stopped ?? null,
    talking: talkingOf(read.conversations, at.nowMs),
    did: didOf(read, booked, at.dayStartMs),
    looked_ms: looked,
    // Said only of a look today: what AI booked is read from the business's midnight, so an older look is the day's to say.
    since:
      looked === null || looked < at.dayStartMs
        ? null
        : {
            answered: answeredSince(read.conversations, looked),
            booked: booked.filter((b) => (msOf(b.created_at) ?? 0) >= looked).length,
          },
  };
}
