/**
 * A hold, told from its record (decision 0043): the pure half of core's hold-notice subscriber (core/subscribers.ts),
 * moved out of today/notifications.ts, the bell's, which stood at its 800 lines.
 */
import { ESCALATION_REASON_SHORT, HOLD_ACT_WORDS, holdActOf, reasonShort } from "../conversations/escalations";
import { formatPhoneDisplay } from "../shared/phone";
import type { JobNews } from "../today/notifications";

/*
 * Why a thread waits for a person is said in the Inbox's own words (escalations.ts ESCALATION_REASON_SHORT, through
 * reasonShort), "needs a person — <why>", and what the owner does about it in the reason's act (HOLD_ACT_WORDS): a
 * reason has one vocabulary, in the mail, the phone, the bell and every page (D1-hold-reasons). This file held a second
 * map for the same closed set ("has waited two hours for a person" where the Inbox said "nobody picked this up").
 */

/** The channel a thread was last written on, in the words an owner reads. */
const HOLD_CHANNEL_WORDS: Readonly<Record<string, string>> = {
  whatsapp: "WhatsApp",
  sms: "Text",
  email: "Email",
  voice: "Phone",
};

/** What a hold's notice says, read from its rows (packages/db holdFactsOf). */
export interface HoldFacts {
  conversationId: string;
  /** The hold's reason, one of ESCALATION_REASONS. */
  reason: string;
  /** The hold's own words: what happened and what to do, written where it was decided. */
  details: string | null;
  /** The person's name, when the record has one. */
  who: string | null;
  /** Their number (E.164) or their address. */
  address: string | null;
  /** The channel of their latest message, or of the thread. */
  channel: string | null;
  /** Their latest words in the thread. */
  customerWords: string | null;
  /** What the receptionist said or held after them, when it did. */
  replyWords: string | null;
  /** How many hours the receptionist is out of the thread, when it is. */
  pausedHours: number | null;
  /** The person is erased, or being erased: the thread is told of, never them. */
  erased: boolean;
}

/** A line of words cut to `max` characters, an ellipsis where it was cut. */
const clipped = (s: string, max: number): string => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/**
 * The owner's notice of a hold (decision 0043): who needs a person and why, their words and the receptionist's, the
 * hold's own words, where to answer, and the pause when there is one. An erased person is "A customer", with no words
 * and no number. The platform's copy, for a workspace nobody can be told in, says the fact and never the words.
 */
export function holdNotice(f: HoldFacts): Omit<JobNews, "sourceEvent"> {
  // The Inbox's clause for the reason, and none for a reason the set does not know (the subject then says only that a
  // person is needed, never the raw token).
  const why = Object.hasOwn(ESCALATION_REASON_SHORT, f.reason) ? reasonShort(f.reason) : null;
  const act = HOLD_ACT_WORDS[holdActOf(f.reason)].notice;
  const where = HOLD_CHANNEL_WORDS[f.channel ?? ""] ?? "The";
  const shown = f.erased ? null : f.address?.startsWith("+") ? (formatPhoneDisplay(f.address) ?? f.address) : f.address;
  const name = (!f.erased && f.who?.trim()) || shown || "A customer";
  const lines = f.erased
    ? []
    : [
        ...(f.customerWords ? [`They wrote: “${clipped(f.customerWords, 600)}”`] : []),
        ...(f.replyWords ? [`The receptionist: “${clipped(f.replyWords, 600)}”`] : []),
        ...(f.details ? [clipped(f.details, 600)] : []),
      ];
  // What to do, by the reason's act: reply, call back, or nothing that may be sent; the pause rides after it when there is one.
  const pause = f.pausedHours
    ? `${act.replace(/\.$/, "")} — the receptionist is paused on this thread for ${f.pausedHours}h.`
    : act;
  return {
    kind: "handoff",
    route: `inbox/th-${f.conversationId}`,
    about: { type: "conversation", id: f.conversationId },
    subject: clipped(why ? `${name} needs a person — ${why}` : `${name} needs a person`, 200),
    body: [...lines, "", `${where} conversation${shown ? ` · ${shown}` : ""}`, pause].join("\n").replace(/^\n/, ""),
    redactedBody: `A ${where === "The" ? "" : `${where} `}conversation needed a person${why ? ` (${why})` : ""}, and nobody could be told.`,
  };
}
