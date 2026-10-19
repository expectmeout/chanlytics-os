import { appointmentWords } from "../journey/appointment-word.js";
import { FOLLOW_UP_CONDITIONS } from "./follow-up.js";
export const SEQUENCE_DRAFT_WORDS_MAX = 500;
export const SEQUENCE_DRAFT_THEN_MAX = 3;
export const SEQUENCE_WAIT_DAYS = { min: 1, max: 90 };
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
      properties: { message: { type: "string" }, texts: { type: "array", items: { type: "string" } } }
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
          texts: { type: "array", items: { type: "string" } }
        }
      }
    },
    cannot: { type: "string" }
  }
};
export const isListToken = (token) => /^seg:[a-z0-9_]{1,40}$/.test(token) || /^list:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
export const SEQUENCE_NEW_WORDS = {
  /** The one New (the Campaigns wiring review's rule F): every sequence, a message sent once among them, starts here. */
  title: "New",
  ask: "What should it do?",
  example: "After someone comes in, thank them the next day, and if they haven\u2019t booked again in 4 weeks, invite them back",
  draft: "Draft it",
  again: "Say it again",
  drafting: "Ask is drafting it\u2026",
  head: "Ask filled it in \xB7 nothing goes until you start it",
  byAsk: "by Ask",
  keep: "Keep as a draft",
  start: "Start",
  discard: "Discard",
  startsWhen: "It starts with the next run of its moment",
  first: "The first batch waits for your OK, as every batch of its kind does",
  /** Who it is for and when it goes: the one question New asks first. */
  starts: "Who and when",
  startsOn: { moment: "A moment", list: "A list", date: "Once", leads: "Leads" },
  startsHint: {
    moment: "Before they come in, after they leave, or when they go quiet: Ask drafts the steps from your line",
    list: "Everyone on a list, and whoever joins it later",
    date: "One message to the people you pick, now or on a day you pick",
    leads: "Emails to businesses a search found, written for each one"
  },
  whichList: "Which list",
  noLists: "No list to start on yet. Make one in People.",
  failed: "Ask couldn\u2019t draft it just now. Try again in a moment.",
  /** A door's moment that a sequence already starts on: by its name, with the door to it. */
  already: (name) => `\u201C${name}\u201D already starts on this moment`,
  open: "Open it"
};
export function newSequenceLine(trigger, word) {
  const a = appointmentWords(word);
  switch (trigger) {
    case "visit_tomorrow":
      return `Remind each customer the day before their ${a.one}`;
    case "visited":
      return `Thank each customer the day after their ${a.one}, and ask how it went`;
    case "quiet_30":
    case "lapsed":
      return "Invite back anyone who hasn\u2019t been in for a while";
    case "new_week":
      return "Welcome each new customer in their first week";
    case "phoned_only":
      return "Ask anyone who only phoned to save our number";
    case "everyone_monthly":
      return "Send everyone this month\u2019s offer";
    case "proposal_waiting":
      return "Follow up on a proposal they haven\u2019t answered";
    default:
      return null;
  }
}
