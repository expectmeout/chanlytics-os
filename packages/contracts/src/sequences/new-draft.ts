/**
 * One New for every sequence (decision 0065): the draft New shows and keeps, for each kind (a sequence, or a message
 * sent once) and each audience (people, or leads a search found). Ask drafts it from the owner's line (POST
 * sequences/draft) and every part of it is a choice the owner can change in place: who and when, each step's wait,
 * condition and message, and a call or a note. The audience changes only what each choice offers, as the database holds
 * it (sequence_steps' checks): a lead is written to by email alone, in its own words, waits 2 to 30 days and stops when
 * it replies; a person is reached on the channels they said yes on, by the workspace's messages, waits 1 to 90 days and
 * may be kept going only while they haven't booked or written back. Nothing is written by a draft (decision 0017): Keep
 * as a draft or Start makes it (POST sequences). No zod here: the page reads these in the browser; what the routes parse
 * is the server's.
 */
import { ASK_MEMORY_WORDS } from "../ask-memory/memory";
import { CONSENT_LIST_IDS } from "../broadcasts/broadcast-audience";
import type { ConsentChannel } from "../consent/consent-channels";
import { REACH_OUT_AFTER_DAYS, REACH_OUT_STEPS_MAX } from "../reach-out/reach-out-words";
import type { ParamSourceKind, ParamSpec } from "../templates/templates";
import { FOLLOW_UP_CONDITIONS, type FollowUpCondition } from "./follow-up";
import type { SequenceMode } from "./sequence";
import { SEQUENCE_WAIT_DAYS } from "./sequence-draft";

/** What a draft is: steps over days, or one message sent once. */
export const NEW_KINDS = ["sequence", "once"] as const;
export type NewKind = (typeof NEW_KINDS)[number];

/** Who it is for: people in People, or businesses a search found. */
export const NEW_AUDIENCES = ["people", "leads"] as const;
export type NewAudience = (typeof NEW_AUDIENCES)[number];

/** What a step does: sends a message, or hands each person to the team as a call to make or a note. */
export const NEW_STEP_DOES = ["message", "call", "note"] as const;
export type NewStepDoes = (typeof NEW_STEP_DOES)[number];

/** How many steps a sequence holds, first included: the database's (sequence_create's five after the first; a chain's five). */
export const NEW_STEPS_MAX: Record<NewAudience, number> = { people: 6, leads: REACH_OUT_STEPS_MAX };

/** How long a step after the first may wait, in days, for each audience: the steps' own bounds. */
export const NEW_WAIT_DAYS: Record<NewAudience, { min: number; max: number }> = {
  people: SEQUENCE_WAIT_DAYS,
  leads: { min: REACH_OUT_AFTER_DAYS.min, max: REACH_OUT_AFTER_DAYS.max },
};

/** A wait as each audience holds it. */
export const newWaitOf = (audience: NewAudience, days: number): number =>
  Math.min(NEW_WAIT_DAYS[audience].max, Math.max(NEW_WAIT_DAYS[audience].min, Math.round(days)));

/**
 * What a later step may wait on, for each audience: a person until they book or write back; a lead has none to pick,
 * since a reply ends its sequence whatever the step says.
 */
export const newConditionsOf = (audience: NewAudience): readonly FollowUpCondition[] =>
  audience === "people" ? FOLLOW_UP_CONDITIONS : [];

/** How far ahead a message sent once may be set: the send's own ceiling (create-broadcast's BROADCAST_SCHEDULE_MAX_DAYS). */
export const NEW_ONCE_AHEAD_DAYS = 30;

/** How long the owner's line may be. */
export const NEW_WORDS_MAX = 500;

/**
 * Who a draft is for, as each choice names it:
 * - `moment`: people when a moment of their journey comes (a playbook trigger);
 * - `list`: people on a list (`seg:<key>` for one of People's, `list:<id>` for one the workspace keeps, or the people a
 *   door picked, as its audience's token): a sequence starts on each who joins, a one-off goes to who is on it;
 * - `everyone`: a one-off to everyone who can hear it;
 * - `search`: leads a search found;
 * - `leads`: leads picked on Leads, by id.
 */
export type DraftWho =
  | { kind: "moment"; trigger: string; label: string }
  | { kind: "list"; token: string; label: string }
  | { kind: "everyone"; label: string }
  | { kind: "search"; id: string; label: string }
  | { kind: "leads"; ids: string[]; label: string };

/** Whether a who suits an audience and a kind: a moment starts a sequence to people, Everyone is a one-off's, a list either. */
export function whoSuits(who: DraftWho, audience: NewAudience, kind: NewKind): boolean {
  if (audience === "leads") return who.kind === "search" || who.kind === "leads";
  if (kind === "sequence") return who.kind === "moment" || who.kind === "list";
  return who.kind === "everyone" || who.kind === "list";
}

/**
 * What one of the lists is to New, by its token: a list to start on or send to; everyone, where a one-off names one of
 * People's lists of who said yes, which every send already crosses its audience with (the send screen read them so,
 * CONSENT_LIST_IDS); or never, for who said stop (the canvas's own word on the old New: "Opted out among them").
 */
export function newListOf(token: string, kind: NewKind): "list" | "everyone" | "never" {
  const id = token.startsWith("seg:") ? token.slice(4) : null;
  if (id === "opted_out") return "never";
  if (kind === "once" && id !== null && CONSENT_LIST_IDS.includes(id)) return "everyone";
  return "list";
}

/**
 * A lead's step as a sequence to leads holds it (POST sequences' `first.steps`): its own email (a later one in the first's
 * thread, so no subject), or a call or a note. New's make and Leads' "A draft by Ask" both send steps so.
 */
export function leadChainStepOf(s: Pick<NewStep, "does" | "email" | "after_days" | "hand">, i: number) {
  if (s.does !== "message")
    return { subject: null, body: "", after_days: s.after_days, hand: { kind: s.does, words: s.hand } };
  return {
    subject: i === 0 ? (s.email?.subject ?? "") : null,
    body: s.email?.body ?? "",
    after_days: i === 0 ? null : s.after_days,
  };
}

/** A message Ask wrote for a person's step: filed on Keep or Start (POST templates/message's body), never before. */
export interface NewWrittenMessage {
  name: string;
  category: "marketing" | "utility";
  versions: {
    whatsapp?: { body: string };
    email?: { subject: string; body: string };
    sms?: { body: string };
  };
  slots: Array<{ position: number; label: string; example: string; kind: ParamSourceKind }>;
}

/** A person's step's message: one the workspace holds (`template_id`), or one Ask wrote (`written`). */
export interface NewMessage {
  template_id: string | null;
  title: string;
  /** Its words as the page shows them: WhatsApp's or a text's, else the email's. */
  body: string;
  /** The channels it can go by now (WhatsApp's while Meta approves it), or, for one Ask wrote, the ones it is written for. */
  channels: ConsentChannel[];
  params: ParamSpec[];
  /** An offer, which only people who said yes to offers hear, and never by text. */
  offer: boolean;
  written: NewWrittenMessage | null;
  /** Its values' names in order, where the message names them ("When the openings are"): what a typed value is asked as. */
  labels?: string[];
}

/** A lead's step's email, in its own words: a later one answers in the first's thread, with no subject. */
export interface NewEmail {
  subject: string | null;
  body: string;
}

/** One step of a draft: its wait after the step before (none for the first), what must still hold, and what it does. */
export interface NewStep {
  name: string;
  after_days: number | null;
  only_if: FollowUpCondition[];
  does: NewStepDoes;
  /** A person's message step's message. */
  message: NewMessage | null;
  /** A lead's message step's email. */
  email: NewEmail | null;
  /** A call's or a note's words: what to do when they come up ("" for a message). */
  hand: string;
}

/** A step as Keep and Start send it (POST sequences/new), and as a kept one-off holds it: its message by id or as written. */
export interface NewKeptStep extends Omit<NewStep, "message"> {
  message: Pick<NewMessage, "template_id" | "params" | "written"> | null;
}

/** A message sent once, kept as a draft (00465 `sequences.once`): who it goes to, when (null: now), how, and its step. */
export interface NewOnceKept {
  who: DraftWho;
  at: string | null;
  channels: ConsentChannel[];
  step: NewKeptStep;
}

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
 * visit's time and service, and a proposal's link, only on the step a run knows them (a visit moment's or a proposal
 * follow-up's first).
 */
export const NEW_VALUES: ReadonlyArray<{ say: string; kind: ParamSourceKind; label: string; example: string }> = [
  { say: "first name", kind: "first_name", label: "First name", example: "Dani" },
  { say: "business name", kind: "business_name", label: "Business name", example: "Maya Studio" },
  { say: "booking link", kind: "booking_link", label: "Booking link", example: "https://example.com/book" },
  { say: "review link", kind: "review_link", label: "Review link", example: "https://example.com/review" },
  { say: "booked time", kind: "visit_when", label: "Booked time", example: "tomorrow at 2:30 PM" },
  { say: "booked service", kind: "visit_service", label: "Booked service", example: "color" },
  { say: "proposal link", kind: "proposal_link", label: "Proposal link", example: "https://example.com/proposal" },
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
 * The shape the model fills, in the house's convention (people/lists/list-schemas.ts LIST_DRAFT_JSON_SCHEMA): every
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
 * words New says around it. The lines themselves are memory's (ask-memory/memory.ts), forgotten in Settings › Memory.
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
  const said = (lines ?? []).map(voiceSaid).filter(Boolean);
  return said.length ? `Written the way you write: ${said.join(" · ")}` : null;
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
