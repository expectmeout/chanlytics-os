/**
 * What Ask is asked for one person, and what it answers (POST people/[id]/draft): the shape the model must fill, its
 * limits, and what the reach read answers (GET people/[id]/reach). No zod here: the sheet reads these in the browser;
 * what the routes parse is person-draft-schema.ts.
 */
import type { ConsentChannel } from "../consent/consent-channels";
import type { WriteWay } from "./write-ways";

export const DRAFT_HOWS = ["message", "call"] as const;
export type DraftHow = (typeof DRAFT_HOWS)[number];
export const DRAFT_TONES = ["shorter", "warmer"] as const;
export type DraftTone = (typeof DRAFT_TONES)[number];

/** How long the plan may be, how many questions may come back, and how long an answer to one. */
export const DRAFT_ABOUT_MAX = 500;
export const DRAFT_ASKS_MAX = 2;
export const DRAFT_ANSWER_MAX = 300;
/** A note the receptionist reads is short: it is one fact, not a brief. */
export const PLAN_NOTE_MAX = 280;

/**
 * The shape the model fills, in the house's convention (people/lists/list-schemas.ts LIST_DRAFT_JSON_SCHEMA): every
 * property required, "" and [] for none, no nullable. `asks` non-empty means it needs to know more and wrote nothing.
 */
export const PERSON_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["asks", "text", "subject", "note", "opening", "points", "avoid", "ask"],
  properties: {
    asks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "question"],
        properties: { key: { type: "string" }, question: { type: "string" } },
      },
    },
    text: { type: "string" },
    subject: { type: "string" },
    note: { type: "string" },
    opening: { type: "string" },
    points: { type: "array", items: { type: "string" } },
    avoid: { type: "array", items: { type: "string" } },
    ask: { type: "string" },
  },
} as const;

/** A question Ask needs answered before it writes, and the member's answer to it on the way back. */
export interface DraftAsk {
  key: string;
  question: string;
}

/** A call's brief: how to open, what to say, what to leave out, what to ask for. */
export interface CallBrief {
  opening: string;
  points: string[];
  avoid: string[];
  ask: string;
}

/** What POST people/[id]/draft answers. Exactly one of: questions, the words (with a subject for an email), a brief. */
export interface PersonDraftDto {
  asks: DraftAsk[];
  text: string;
  subject: string;
  /** The fact the receptionist would read, when the member keeps it. */
  note: string;
  brief: CallBrief | null;
  /** What the product knows of them, in a few lines, for the brief: said by code from their page, never by the model. */
  facts: string[];
}

/** What GET people/[id]/reach answers: how this person can be written to and called now. */
export interface PersonReachDto {
  person: { id: string; name: string; phone: string | null; email: string | null };
  /** Their thread as the Inbox addresses it (`th-<conversation>`), or null when they have none. */
  thread: string | null;
  ways: WriteWay[];
  default_wire: ConsentChannel | null;
  /** A call from the member's own phone: their number, or why none is offered. */
  call: { ok: boolean; tel: string | null; why: string | null };
  /** Whether the receptionist answers what this person writes: its mode for them is not ask-first or never. */
  receptionist: { answers: boolean };
  /** They said yes to offers: a promotion among the approved messages may go to them. */
  offers_ok: boolean;
  /**
   * What fills an approved message's own slots for this person, as the send fills them (core reply.ts shapeTemplate):
   * their first name, the business's name, and its booking link. Null where the workspace has no business name on
   * file, and the send refuses an approved message for want of it.
   */
  fills: { first_name: string | null; business_name: string; booking_link: string | null } | null;
  /**
   * The line the first text of ours to reach them carries (the rates, and how to stop: what the carriers ask of a
   * first text), where a text can go to them and none has reached them yet; null otherwise. Shown before the send:
   * what lands on a person's phone is never a surprise to whoever sent it.
   */
  first_text_line: string | null;
}
