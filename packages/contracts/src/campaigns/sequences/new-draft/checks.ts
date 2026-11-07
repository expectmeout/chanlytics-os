/** New draft: checks. */

import { ASK_MEMORY_WORDS } from "../../../ask/memory/memory";
import type { ConsentChannel } from "../../../consent/channels";
import type { ParamSourceKind } from "../../templates/params";
import { FOLLOW_UP_CONDITIONS } from "../follow-up";
import type { SequenceMode } from "../sequence";
import {
  NEW_AUDIENCES,
  NEW_KINDS,
  NEW_STEP_DOES,
  NEW_WORDS_MAX,
  type DraftWho,
  type NewAudience,
  type NewEmail,
  type NewKind,
  type NewStep,
  type NewWrittenMessage,
} from "./steps";

/** Something Ask checked before the owner starts it: a tick, or what still needs them (amber). */
export interface NewCheck {
  tone: "ok" | "warn";
  words: string;
  detail: string | null;
}

/**
 * Who it reaches now, as the workspace counted it: how many can hear it, of how many the moment, list or search names
 * (null where that is the same), those it leaves out said once ("1 said stop"), those the week's breath holds back, and
 * how many each channel carries, where it was counted.
 */
export interface NewReach {
  can: number;
  of: number | null;
  left: string | null;
  held?: number;
  by?: Partial<Record<ConsentChannel, number>>;
  /** Who hears it only by WhatsApp, where its WhatsApp version is new: left out of a send before Meta approves it. */
  only_whatsapp?: number;
  /**
   * Why nobody can hear it, said only where nobody can (decision 0065 step 7, what the send screen said): everyone it
   * reaches heard from you this week, no channel it goes by can carry it, those who said yes can't be reached (no number
   * or address), or nobody said the yes it needs. Each asks for its own cure, so only one door is offered.
   */
  nobody?: NewNobody;
  /** Who said the yes it needs, where nobody can hear it: what the words say they lack. */
  said_yes?: number;
}

/** Why nobody can hear a draft (NewReach.nobody), each with its own cure: wait a week, connect, reach them, their yes. */
export type NewNobody = "breath" | "no_channel" | "no_reach" | "no_yes";

/** Where a sequence to leads sends from: the workspace's connected mailboxes (none named: every one), or the owner by hand. */
export interface NewMailbox {
  ids: string[];
  owner_sends: boolean;
  label: string;
}

/** What POST sequences/draft answers: the draft New shows, every part a choice. */
export interface NewDraftDto {
  /** The owner's own line, kept on top. */
  said: string;
  /** The business's name, which a message's preview is filled with. */
  business: string;
  kind: NewKind;
  audience: NewAudience;
  name: string;
  /** Who it is for; null where nothing here fits yet (the owner picks). */
  who: DraftWho | null;
  /** A sequence's hour, the business's own (9 to 20). */
  run_hour: number;
  /** A one-off's moment, by the business's clock ("YYYY-MM-DDTHH:MM"); null for now. */
  at: string | null;
  /** A one-off's channels, those the person said yes on; a sequence's first step's. */
  channels: ConsentChannel[];
  mailbox: NewMailbox | null;
  /** A sequence to leads takes the leads its search finds from now on. */
  adds_new: boolean;
  steps: NewStep[];
  /** The class its steps run under (its yes, its Autonomy row's default mode). */
  policy_class: string;
  /** How each batch after the first is decided (decision 0064); a one-off has none. */
  mode: SequenceMode | null;
  reach: NewReach | null;
  checks: NewCheck[];
  /** A sequence already on the moment, which a second one would double. */
  twin: { id: string; name: string } | null;
  /** What the owner asked that nothing here can do, in a sentence; null when it all fit. */
  cannot: string | null;
  /**
   * The lines Ask learned from how the owner writes, which the draft was written with (decision 0078: memory lines of
   * source `learned`); none where it learned none. Absent from a server before it, and from a draft built by hand.
   */
  voice?: string[];
}

/** What New asks Ask: the line, and any choice already made (a door's, or the owner's in the draft). */
export interface NewDraftAsk {
  words: string;
  kind?: NewKind | undefined;
  audience?: NewAudience | undefined;
  who?: DraftWho | undefined;
  /** The draft said again: its name and how many steps it had. */
  previous?: { name: string; steps: number } | undefined;
}

/** A draft's steps that hand a person over must be the last: one, at most, and never the first. */
export function handStepsHold(steps: readonly Pick<NewStep, "does">[]): boolean {
  return steps.every((s, i) => s.does === "message" || (i > 0 && i === steps.length - 1));
}

/**
 * The values a person's message Ask writes may name, by the name the model writes and the source that fills each. A
 * visit's time and service, a proposal's link and the freed time, only on the step a run knows them (a visit
 * moment's, a proposal follow-up's or a freed time's first).
 */
export const NEW_VALUES: ReadonlyArray<{ say: string; kind: ParamSourceKind; label: string; example: string }> = [
  { say: "first name", kind: "first_name", label: "First name", example: "Dani" },
  { say: "business name", kind: "business_name", label: "Business name", example: "Maya Studio" },
  { say: "booking link", kind: "booking_link", label: "Booking link", example: "https://example.com/book" },
  { say: "review link", kind: "review_link", label: "Review link", example: "https://example.com/review" },
  { say: "booked time", kind: "visit_when", label: "Booked time", example: "tomorrow at 2:30 PM" },
  { say: "booked service", kind: "visit_service", label: "Booked service", example: "color" },
  { say: "proposal link", kind: "proposal_link", label: "Proposal link", example: "https://example.com/proposal" },
  { say: "freed time", kind: "freed_when", label: "Freed time", example: "tomorrow at 2:00 PM" },
];

/**
 * Words written with named values ({{first name}}) as a message holds them, numbered in order of first use across its
 * versions ({{1}}), with the values they take. Null where a name is none of NEW_VALUES, or a brace has no pair.
 */
export function numberedValues(
  versions: readonly string[],
): { rewrite: (text: string) => string; slots: NewWrittenMessage["slots"] } | null {
  const order: string[] = [];
  for (const text of versions) {
    if (/\{(?!\{)|(?<!\})\}/.test(text.replace(/\{\{[^{}]*\}\}/g, ""))) return null;
    for (const m of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
      const say = (m[1] ?? "").toLowerCase();
      if (!NEW_VALUES.some((v) => v.say === say)) return null;
      if (!order.includes(say)) order.push(say);
    }
  }
  const slots = order.map((say, i) => {
    const v = NEW_VALUES.find((x) => x.say === say);
    if (!v) throw new Error(`unknown value ${say}`);
    return { position: i + 1, label: v.label, example: v.example, kind: v.kind };
  });
  const rewrite = (text: string) =>
    text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, say: string) => `{{${order.indexOf(say.toLowerCase()) + 1}}}`);
  return { rewrite, slots };
}

/**
 * The shape the model fills, in the house's convention (people/lists/schemas.ts LIST_DRAFT_JSON_SCHEMA): every
 * property required, "" and [] for none. Who and a held message are named by the keys the request lists them under,
 * so nothing the model writes is an id. A step either sends a message (a person's: a held one by its key, with `texts`
 * for its typed values, or one written in `write`; a lead's: `subject` and `body`), or hands the person over (`words`).
 */
export const NEW_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "audience", "who", "name", "hour", "when", "steps", "cannot"],
  properties: {
    kind: { type: "string", enum: [...NEW_KINDS] },
    audience: { type: "string", enum: [...NEW_AUDIENCES] },
    who: { type: "string" },
    name: { type: "string" },
    hour: { type: "integer" },
    when: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["does", "after_days", "only_if", "message", "texts", "write", "subject", "body", "words"],
        properties: {
          does: { type: "string", enum: [...NEW_STEP_DOES] },
          after_days: { type: "integer" },
          only_if: { type: "array", items: { type: "string", enum: [...FOLLOW_UP_CONDITIONS] } },
          message: { type: "string" },
          texts: { type: "array", items: { type: "string" } },
          write: {
            type: "object",
            additionalProperties: false,
            required: ["title", "offer", "whatsapp", "email_subject", "email_body", "text"],
            properties: {
              title: { type: "string" },
              offer: { type: "boolean" },
              whatsapp: { type: "string" },
              email_subject: { type: "string" },
              email_body: { type: "string" },
              text: { type: "string" },
            },
          },
          subject: { type: "string" },
          body: { type: "string" },
          words: { type: "string" },
        },
      },
    },
    cannot: { type: "string" },
  },
} as const;

/* ------------------------------------------------------------------------------------------- the owner's voice */

/*
 * The owner's voice in a cold email (decision 0078): kept as lines of Ask's memory, each starting "In cold emails:", and
 * learned once from an email the owner pastes (POST sequences/voice). What the paste takes, what it answers, and the
 * words New says around it. The lines themselves are memory's (ask/memory/memory.ts), forgotten in Settings › Memory.
 */

/** A paste is a whole email: shorter says nothing of how its owner writes, longer is not one email. */
export const VOICE_PASTE_MIN = 40;

export const VOICE_PASTE_MAX = 4000;

/** The most lines one paste keeps. */
export const VOICE_LINES_MAX = 3;

/** How a learned line about writing starts, so it reads as one in every Ask turn and in Settings › Memory. */
export const VOICE_LINE_LEAD = "In cold emails:";

/** What a paste answers: the lines kept, and whether memory was full before all of them were. */
export interface SequenceVoiceDto {
  lines: string[];
  full: boolean;
}

/** A learned line as New says it: without its lead, and without its closing stop ("short, no greeting"). */
export function voiceSaid(line: string): string {
  const lead = new RegExp(`^${VOICE_LINE_LEAD}\\s*`, "i");
  return line
    .replace(lead, "")
    .replace(/[.\s]+$/, "")
    .trim();
}

/** The line under a draft written with learned lines; null where it was written with none. */
export function voiceLineOf(lines: readonly string[] | undefined): string | null {
  const sentence = (lines ?? []).map(voiceSaid).filter(Boolean);
  return sentence.length ? `Written the way you write: ${sentence.join(" · ")}` : null;
}

/** The words New says around the owner's voice. */
export const VOICE_WORDS = {
  paste: "Paste an email you've sent, and Ask writes the way you do.",
  placeholder: "An email you wrote to someone new",
  use: "Use it",
  reading: "Reading how you write…",
  memory: "Memory",
  tooShort: `Paste a whole email, ${VOICE_PASTE_MIN} characters at least.`,
  tooLong: `That is more than one email: ${VOICE_PASTE_MAX} characters at most.`,
  kept: (n: number) =>
    n === 0
      ? "Ask found nothing in it about how you write."
      : n === 1
        ? "Ask kept a line on how you write, and is drafting again."
        : `Ask kept ${n} lines on how you write, and is drafting again.`,
  full: ASK_MEMORY_WORDS.full,
} as const;

/* ---------------------------------------------------------------------------------------------- what Ask drafted */

/*
 * What Ask drafted for a sequence to leads (decision 0078, step 2), kept with the sequence's make decision
 * (make_sequence, 00459 sequence_create_leads): the owner's line to Ask, and each step's email as Ask wrote it, null for
 * a call or a note. The drafter reads it beside the words as they stand, so what the owner changed, before Start or
 * after, is said to the next draft; Ask's morning reads it to see what they changed.
 */
export interface AsDrafted {
  asked: string;
  steps: Array<NewEmail | null>;
}

/** The pair's half a page sends with its make: from Ask's answer as it came, never from the draft being edited. */
export function asDraftedOf(text: string, emails: ReadonlyArray<NewEmail | null>): AsDrafted {
  return {
    asked: text.trim().slice(0, NEW_WORDS_MAX),
    steps: emails.map((e) => (e ? { subject: e.subject, body: e.body } : null)),
  };
}

/** One email of a kept draft read back, or null where it is a call's, a note's, or in no shape this reads. */
function draftedEmailOf(v: unknown): NewEmail | null {
  if (!v || typeof v !== "object") return null;
  const { subject, body } = v as { subject?: unknown; body?: unknown };
  return typeof body === "string" ? { subject: typeof subject === "string" ? subject : null, body } : null;
}

/** What a make decision kept, read back from its payload's `as_drafted`, or null where it kept none. */
export function asDraftedFrom(value: unknown): AsDrafted | null {
  if (!value || typeof value !== "object") return null;
  const { asked, steps } = value as { asked?: unknown; steps?: unknown };
  if (typeof asked !== "string" || !Array.isArray(steps)) return null;
  return { asked, steps: steps.map(draftedEmailOf) };
}

/** Whether an email went as Ask drafted it: the same subject and words, the spacing between them aside. */
export function sentAsDrafted(drafted: NewEmail, sent: NewEmail): boolean {
  const same = (a: string | null, b: string | null) =>
    (a ?? "").replace(/\s+/g, " ").trim() === (b ?? "").replace(/\s+/g, " ").trim();
  return same(drafted.subject, sent.subject) && same(drafted.body, sent.body);
}
