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
  title: "New sequence",
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
  starts: "What starts it",
  startsOn: { moment: "A moment", list: "A list", date: "A date", leads: "Leads" },
  startsHint: {
    moment: "Before they come in, after they leave, or when they go quiet: Ask drafts the steps from your line",
    list: "Everyone on a list, and whoever joins it later",
    date: "One message to the people you pick, on a day you pick",
    leads: "Emails to businesses a search found, written for each one"
  },
  whichList: "Which list",
  noLists: "No list to start on yet. Make one in People.",
  openComposer: { date: "Write it", leads: "Pick the leads" },
  failed: "Ask couldn\u2019t draft it just now. Try again in a moment."
};
