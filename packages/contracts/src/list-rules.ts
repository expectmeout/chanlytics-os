/**
 * A smart list's rule: who is on it, judged over the facts a person's row already carries, so the People rail, a
 * broadcast's audience, a playbook's run and the assistant count one list the same way.
 *
 * The owner says it in plain English ("regulars who haven't been in since spring"); a model writes it in this
 * vocabulary and nothing else (LIST_DRAFT_JSON_SCHEMA), and the page shows it back as chips (listRuleParts). A rule
 * names only what the row can answer: a visit by the calendar's own clock, the last and first time they were heard
 * from, the wires they use, where they came from, their calls and conversations, and their yes to offers. What the
 * row cannot answer -- a staff member, a tag, what was said in a thread -- is not a field, and the draft says so rather
 * than guessing.
 */
import { z } from "zod";
import {
  PERSON_CAME_FROM_WORDS,
  PERSON_CHANNEL_WORDS,
  type PersonCameFrom,
  type PersonChannel,
  type PersonRowVM,
} from "./people";

const DAY_MS = 86_400_000;

export const LIST_RULE_FIELDS = [
  { id: "last_visit", label: "Last visit", kind: "days", needsCalendar: true },
  { id: "next_visit", label: "Next visit", kind: "days", needsCalendar: true },
  { id: "booked", label: "A visit booked", kind: "yesno", needsCalendar: true },
  { id: "asked_not_booked", label: "Asked, never booked", kind: "yesno", needsCalendar: true },
  { id: "last_heard", label: "Last heard from", kind: "days", needsCalendar: false },
  { id: "first_contact", label: "First contact", kind: "days", needsCalendar: false },
  { id: "channel", label: "Reaches you by", kind: "channel", needsCalendar: false },
  { id: "came_from", label: "Came from", kind: "came_from", needsCalendar: false },
  { id: "calls", label: "Calls", kind: "count", needsCalendar: false },
  { id: "conversations", label: "Conversations", kind: "count", needsCalendar: false },
  { id: "offers_yes", label: "Said yes to offers", kind: "yesno", needsCalendar: false },
] as const;
export type ListRuleField = (typeof LIST_RULE_FIELDS)[number]["id"];

const CHANNELS = ["whatsapp", "sms", "voice", "email"] as const satisfies readonly PersonChannel[];
const CAME_FROM = [
  "whatsapp",
  "sms",
  "email",
  "call",
  "calendar",
  "manual",
  "import",
  "lead",
] as const satisfies readonly PersonCameFrom[];

/** A span of days: more than N days ago (or away), or within the last (or next) N. */
const Days = z.object({
  op: z.enum(["more_than", "within"]),
  days: z.number().int().min(1).max(3650),
});
const Count = z.object({ op: z.enum(["at_least", "at_most"]), n: z.number().int().min(0).max(10_000) });
const YesNo = z.object({ op: z.literal("is"), yes: z.boolean() });

export const ListConditionSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("last_visit"), ...Days.shape }),
  z.object({ field: z.literal("next_visit"), ...Days.shape }),
  z.object({ field: z.literal("booked"), ...YesNo.shape }),
  z.object({ field: z.literal("asked_not_booked"), ...YesNo.shape }),
  z.object({ field: z.literal("last_heard"), ...Days.shape }),
  z.object({ field: z.literal("first_contact"), ...Days.shape }),
  z.object({ field: z.literal("channel"), op: z.enum(["is", "is_not"]), channel: z.enum(CHANNELS) }),
  z.object({ field: z.literal("came_from"), op: z.enum(["is", "is_not"]), from: z.enum(CAME_FROM) }),
  z.object({ field: z.literal("calls"), ...Count.shape }),
  z.object({ field: z.literal("conversations"), ...Count.shape }),
  z.object({ field: z.literal("offers_yes"), ...YesNo.shape }),
]);
export type ListCondition = z.infer<typeof ListConditionSchema>;

/** Every condition must hold. One to eight of them; a list of everyone is Everyone. */
export const ListRuleSchema = z.object({
  all: z.array(ListConditionSchema).min(1).max(8),
});
export type ListRule = z.infer<typeof ListRuleSchema>;

/** A stored rule, or null when it is not one this build reads: a list whose rule cannot be read has nobody on it. */
export function asListRule(raw: unknown): ListRule | null {
  const r = ListRuleSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Whether a rule reads the calendar: a list that does is judged only when the calendar was read. */
export function ruleNeedsCalendar(rule: ListRule): boolean {
  return rule.all.some((c) => LIST_RULE_FIELDS.find((f) => f.id === c.field)?.needsCalendar);
}

const within = (days: number | null, c: { op: "more_than" | "within"; days: number }): boolean =>
  days !== null && (c.op === "within" ? days <= c.days : days > c.days);
const ago = (ts: number | null, nowMs: number): number | null =>
  ts === null ? null : Math.floor((nowMs - ts) / DAY_MS);

/** One condition over one person. A fact the row does not have (no visit, never heard from) holds nothing about days. */
function holds(c: ListCondition, v: PersonRowVM, nowMs: number): boolean {
  switch (c.field) {
    case "last_visit":
      return within(v.lastVisitDays, c);
    case "next_visit":
      return within(v.nextVisitDays, c);
    case "booked":
      return v.booked === c.yes;
    case "asked_not_booked":
      return v.askedNotBooked === c.yes;
    case "last_heard":
      return within(ago(v.lastContact.ts, nowMs), c);
    case "first_contact":
      return within(ago(v.firstContact.ts, nowMs), c);
    case "channel":
      return v.channels.includes(c.channel) === (c.op === "is");
    case "came_from":
      return (v.cameFrom?.key === c.from) === (c.op === "is");
    case "calls":
      return c.op === "at_least" ? v.calls >= c.n : v.calls <= c.n;
    case "conversations":
      return c.op === "at_least" ? v.threads >= c.n : v.threads <= c.n;
    case "offers_yes":
      return (v.consent.marketing === "opted_in") === c.yes;
  }
}

/** Whether a person is on a list by its rule: every condition holds. */
export function listRuleMatches(rule: ListRule, v: PersonRowVM, nowMs: number): boolean {
  return rule.all.every((c) => holds(c, v, nowMs));
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** One condition in the page's words: a chip. */
export function listConditionWords(c: ListCondition): string {
  const label = LIST_RULE_FIELDS.find((f) => f.id === c.field)!.label;
  switch (c.field) {
    case "last_visit":
    case "last_heard":
    case "first_contact":
      return c.op === "more_than"
        ? `${label} more than ${plural(c.days, "day")} ago`
        : `${label} in the last ${plural(c.days, "day")}`;
    case "next_visit":
      return c.op === "within"
        ? `${label} in the next ${plural(c.days, "day")}`
        : `${label} more than ${plural(c.days, "day")} away`;
    case "booked":
    case "asked_not_booked":
    case "offers_yes":
      return c.yes ? label : `Not: ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
    case "channel":
      return `${c.op === "is" ? label : "Never reaches you by"} ${PERSON_CHANNEL_WORDS[c.channel]}`;
    case "came_from":
      return `${c.op === "is" ? label : "Did not come from"}: ${PERSON_CAME_FROM_WORDS[c.from]}`;
    case "calls":
    case "conversations":
      return `${c.op === "at_least" ? "At least" : "At most"} ${plural(c.n, c.field === "calls" ? "call" : "conversation")}`;
  }
}

/** A rule as the chips the page shows it in, one per condition, in its order. */
export function listRuleParts(rule: ListRule): string[] {
  return rule.all.map(listConditionWords);
}

/**
 * The shape the model answers a plain-English description in: the rule, a name for the list, and what in the words
 * the vocabulary cannot say (a staff member, a tag, what was said), which the page shows rather than drops.
 */
export const LIST_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "all", "cannot"],
  properties: {
    name: { type: "string" },
    cannot: { type: "string" },
    all: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "op"],
        properties: {
          field: { type: "string", enum: LIST_RULE_FIELDS.map((f) => f.id) },
          op: { type: "string", enum: ["more_than", "within", "at_least", "at_most", "is", "is_not"] },
          days: { type: "integer" },
          n: { type: "integer" },
          yes: { type: "boolean" },
          channel: { type: "string", enum: [...CHANNELS] },
          from: { type: "string", enum: [...CAME_FROM] },
        },
      },
    },
  },
} as const;

export const ListDraftAnswerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  cannot: z.string().trim().max(200),
  all: z.array(ListConditionSchema).max(8),
});
export type ListDraftAnswer = z.infer<typeof ListDraftAnswerSchema>;

/**
 * Who is on a list the workspace keeps: the ids put on it by hand, or, for a smart list, everyone its rule holds for
 * today. The People rail, a profile, a broadcast's audience, a playbook's run and the assistant all ask this, so a
 * list is counted one way. A rule this build cannot read has nobody on it; a rule that reads the calendar has nobody
 * on it when the calendar could not be read, never everyone its other conditions hold for.
 */
export function savedListIds(
  list: { ids: readonly string[]; rule?: unknown },
  rows: readonly PersonRowVM[],
  nowMs: number,
  calendarOk: boolean,
): Set<string> {
  if (list.rule == null) return new Set(list.ids);
  const rule = asListRule(list.rule);
  if (!rule || (ruleNeedsCalendar(rule) && !calendarOk)) return new Set();
  return new Set(rows.filter((r) => listRuleMatches(rule, r, nowMs)).map((r) => r.id));
}
