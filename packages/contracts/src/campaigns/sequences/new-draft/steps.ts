/** New draft: steps. */

import { CONSENT_LIST_IDS } from "../../broadcasts/audience";
import type { ConsentChannel } from "../../../consent/channels";
import { REACH_OUT_AFTER_DAYS, REACH_OUT_STEPS_MAX } from "../../reach-out/words/limits";
import type { ParamSourceKind, ParamSpec } from "../../templates/params";
import { FOLLOW_UP_CONDITIONS, type FollowUpCondition } from "../follow-up";
import { SEQUENCE_WAIT_DAYS } from "../draft";

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
export function whoSuits(draftWho: DraftWho, audience: NewAudience, kind: NewKind): boolean {
  if (audience === "leads") return draftWho.kind === "search" || draftWho.kind === "leads";
  if (kind === "sequence") return draftWho.kind === "moment" || draftWho.kind === "list";
  return draftWho.kind === "everyone" || draftWho.kind === "list";
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
export function leadChainStepOf(newStep: Pick<NewStep, "does" | "email" | "after_days" | "hand">, index: number) {
  if (newStep.does !== "message")
    return {
      subject: null,
      body: "",
      after_days: newStep.after_days,
      hand: { kind: newStep.does, words: newStep.hand },
    };
  return {
    subject: index === 0 ? (newStep.email?.subject ?? "") : null,
    body: newStep.email?.body ?? "",
    after_days: index === 0 ? null : newStep.after_days,
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
