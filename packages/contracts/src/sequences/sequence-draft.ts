/**
 * A new sequence, drafted by Ask (decision 0060, S4: New): the owner says in a line what it should do, and the draft fills
 * the flow every sequence has -- the moment that starts it, its first message, and the steps after it, each a wait, what
 * must still hold and a message -- from the moments this workspace offers and the messages it holds, never one it lacks.
 * Nothing is written by a draft (decision 0017): the owner keeps it as a draft or starts it (POST sequences). The shape the
 * model fills, its limits, what POST sequences/draft answers and the page's words. No zod here: the page reads these in the
 * browser; what the routes parse is sequence-draft-schema.ts.
 */
import { appointmentWords, type AppointmentWord } from "../journey/appointment-word";
import type { ParamSpec } from "../templates/templates";
import { FOLLOW_UP_CONDITIONS, type FollowUpCondition } from "./follow-up";

/** How long the owner's line may be, and how many steps may follow the first. */
export const SEQUENCE_DRAFT_WORDS_MAX = 500;
export const SEQUENCE_DRAFT_THEN_MAX = 3;
/** The wait before a step after the first, in days: the steps' own bounds (00441 sequence_steps_shape). */
export const SEQUENCE_WAIT_DAYS = { min: 1, max: 90 } as const;

/**
 * The shape the model fills, in the house's convention (people/lists/list-rules.ts LIST_DRAFT_JSON_SCHEMA): every property
 * required, "" and [] for none. A moment and a message are named by the keys the request lists them under, so nothing the
 * model writes is an id; `texts` are the words for a message's typed slots, in their order; `cannot` says what the owner
 * asked that no moment or message here can do.
 */
export const SEQUENCE_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "moment", "hour", "first", "then", "cannot"],
  properties: {
    name: { type: "string" },
    moment: { type: "string" },
    hour: { type: "integer" },
    first: {
      type: "object",
      additionalProperties: false,
      required: ["message", "texts"],
      properties: { message: { type: "string" }, texts: { type: "array", items: { type: "string" } } },
    },
    then: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "after_days", "only_if", "message", "texts"],
        properties: {
          name: { type: "string" },
          after_days: { type: "integer" },
          only_if: { type: "array", items: { type: "string", enum: [...FOLLOW_UP_CONDITIONS] } },
          message: { type: "string" },
          texts: { type: "array", items: { type: "string" } },
        },
      },
    },
    cannot: { type: "string" },
  },
} as const;

/** A step of a draft: its message as the page shows it, the values it is sent with, and, after the first, its wait. */
export interface SequenceDraftStepDto {
  name: string;
  /** Days after the step before; null for the first. */
  after_days: number | null;
  only_if: FollowUpCondition[];
  template_id: string;
  /** The message as it reads: its title and words, and the channels it can go by now. */
  message: { title: string; body: string; channels: string[] };
  params: ParamSpec[];
}

/**
 * A list a new sequence may start on, as the composer names one (playbooks' pools): `seg:<key>` for one of People's,
 * `list:<id>` for one the workspace keeps; and its name. Everyone on it gets the first step, and whoever joins it later.
 */
export interface SequenceDraftListDto {
  token: string;
  label: string;
}

/** Whether a token names a list as the composer writes one: `seg:<key>` (People's) or `list:<uuid>` (the workspace's). */
export const isListToken = (token: string): boolean =>
  /^seg:[a-z0-9_]{1,40}$/.test(token) ||
  /^list:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);

/** What POST sequences/draft answers: the sequence it would make, with what Ask could not do. */
export interface SequenceDraftDto {
  /** The owner's own line, kept on top. */
  said: string;
  /** The business's name, which a message's preview is filled with (templates exampleParams). */
  business: string;
  name: string;
  trigger: string;
  /** The list it starts on, for a sequence on a list (trigger `saved_list`); null for one on a moment. */
  list: SequenceDraftListDto | null;
  run_hour: number;
  policy_class: string;
  steps: SequenceDraftStepDto[];
  /** What the owner asked that no moment or message here can do, in a sentence; null when it all fit. */
  cannot: string | null;
}

/** The New pane's words, said once. */
export const SEQUENCE_NEW_WORDS = {
  title: "New sequence",
  ask: "What should it do?",
  example:
    "After someone comes in, thank them the next day, and if they haven’t booked again in 4 weeks, invite them back",
  draft: "Draft it",
  again: "Say it again",
  drafting: "Ask is drafting it…",
  head: "Ask filled it in · nothing goes until you start it",
  byAsk: "by Ask",
  keep: "Keep as a draft",
  start: "Start",
  discard: "Discard",
  startsWhen: "It starts with the next run of its moment",
  first: "The first batch waits for your OK, as every batch of its kind does",
  starts: "What starts it",
  startsOn: { moment: "A moment", list: "A list", date: "A date", leads: "Leads" },
  startsHint: {
    moment: "Before they come in, after they leave, or when they go quiet: Ask drafts the steps from your line",
    list: "Everyone on a list, and whoever joins it later",
    date: "One message to the people you pick, on a day you pick",
    leads: "Emails to businesses a search found, written for each one",
  },
  whichList: "Which list",
  noLists: "No list to start on yet. Make one in People.",
  openComposer: { date: "Write it", leads: "Pick the leads" },
  failed: "Ask couldn’t draft it just now. Try again in a moment.",
  /** A door's moment that a sequence already starts on: by its name, with the door to it. */
  already: (name: string): string => `“${name}” already starts on this moment`,
  open: "Open it",
} as const;

/**
 * The owner's line New starts from on a moment a door asked for (`new:moment:<trigger>`): what they would have said, so
 * Draft it is one press. Null for a moment with no line of its own: New starts on a moment with an empty line, as it does
 * with none asked for. In the workspace's word for an appointment.
 */
export function newSequenceLine(trigger: string, word: AppointmentWord): string | null {
  const a = appointmentWords(word);
  switch (trigger) {
    case "visit_tomorrow":
      return `Remind each customer the day before their ${a.one}`;
    case "visited":
      return `Thank each customer the day after their ${a.one}, and ask how it went`;
    case "quiet_30":
    case "lapsed":
      return "Invite back anyone who hasn’t been in for a while";
    case "new_week":
      return "Welcome each new customer in their first week";
    case "phoned_only":
      return "Ask anyone who only phoned to save our number";
    case "everyone_monthly":
      return "Send everyone this month’s offer";
    case "proposal_waiting":
      return "Follow up on a proposal they haven’t answered";
    default:
      return null;
  }
}
