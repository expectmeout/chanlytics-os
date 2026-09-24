/**
 * The language a list is written in: who is on it, judged over the facts a person's row carries, so the People rail, a
 * broadcast's audience, a playbook's run and the assistant count one list the same way. The built-in lists are written
 * in it too (lists.ts), so an owner's list can say anything a built-in says (decision 0009).
 *
 * The owner says it in plain English ("regulars who haven't been in since spring"); a model writes it in this
 * vocabulary and nothing else (LIST_DRAFT_JSON_SCHEMA, listDraftFieldLines), and the page shows it back as chips
 * (listRuleParts). A rule names only what the row can answer. What the row cannot answer -- a staff member, a tag, what
 * was said in a thread -- is not a field, and the draft says so rather than guessing.
 *
 * Every day fact is a count of the workspace's own dates, worked out once when the row is built (people.ts
 * toPersonRowVM), so judging a rule needs no clock: the row is the moment it was read, for the person who is looking.
 */
import { z } from "zod";
import { PERSON_CAME_FROM_WORDS, PERSON_CHANNEL_WORDS, type PersonCameFrom, type PersonChannel } from "./person-words";
import type { PersonRowVM } from "./people";

/**
 * What a list may need that a workspace, a reader or a moment may not have: a calendar read, a consult-first service
 * on the profile, deals on here, and someone looking (for "me"). Derived from a rule, never written beside it.
 */
export type ListNeed = "calendar" | "consult" | "deals" | "viewer";

/** The order a list's unmet needs are said in: the first one is the reason it cannot be counted. */
export const LIST_NEEDS: readonly ListNeed[] = ["calendar", "consult", "deals", "viewer"];

type FieldKind =
  "days" | "yesno" | "channel" | "came_from" | "count" | "purpose" | "standing" | "assigned" | "deal_stage" | "list";

/**
 * Every fact a rule may name: its id, its label (a chip's first words), its kind, what it always needs, and the line
 * the drafting model reads about it. The model's instructions are written from this table, never typed beside it.
 */
export const LIST_RULE_FIELDS: readonly {
  id: string;
  label: string;
  kind: FieldKind;
  needs: readonly ListNeed[];
  draft: string;
}[] = [
  {
    id: "last_visit",
    label: "Last visit",
    kind: "days",
    needs: ["calendar"],
    draft: "days since their last appointment on the calendar",
  },
  {
    id: "next_visit",
    label: "Next visit",
    kind: "days",
    needs: ["calendar"],
    draft: "days until their next appointment; op this_week is Monday to Sunday of this week",
  },
  { id: "booked", label: "A visit booked", kind: "yesno", needs: ["calendar"], draft: "an appointment booked ahead" },
  {
    id: "asked_not_booked",
    label: "Asked, never booked",
    kind: "yesno",
    needs: ["calendar"],
    draft: "wrote or called in the last 30 days and nothing on the calendar answers it",
  },
  {
    id: "last_heard",
    label: "Last heard from",
    kind: "days",
    needs: [],
    draft: "days since THEY last wrote or called",
  },
  { id: "first_contact", label: "First contact", kind: "days", needs: [], draft: "days since they first got in touch" },
  {
    id: "channel",
    label: "Reaches you by",
    kind: "channel",
    needs: [],
    draft: "a way they reach the business: whatsapp, sms, voice (phone calls) or email",
  },
  {
    id: "came_from",
    label: "Came from",
    kind: "came_from",
    needs: [],
    draft: "how they first came: whatsapp, sms, email, call, calendar, manual, import or lead",
  },
  { id: "calls", label: "Calls", kind: "count", needs: [], draft: "how many calls" },
  { id: "conversations", label: "Conversations", kind: "count", needs: [], draft: "how many conversations" },
  {
    id: "has_chat",
    label: "Has written with you",
    kind: "yesno",
    needs: [],
    draft: "a written conversation either way (no means they have only phoned)",
  },
  {
    id: "said_yes",
    label: "Said yes to",
    kind: "purpose",
    needs: [],
    draft: "said yes to offers, or to messages (to: offers or messages)",
  },
  {
    id: "can_receive",
    label: "Can be sent",
    kind: "purpose",
    needs: [],
    draft: "can be sent offers or messages: the yes and a number to send to (to: offers or messages)",
  },
  { id: "stopped", label: "Asked to stop", kind: "yesno", needs: [], draft: "asked to stop, or on do-not-contact" },
  {
    id: "standing",
    label: "Standing",
    kind: "standing",
    needs: [],
    draft: "value needs_you (waiting for a person) or waiting_on_you (you have the thread and they wrote last)",
  },
  {
    id: "assigned",
    label: "Thread is with",
    kind: "assigned",
    needs: [],
    draft: "who has their thread: value me, teammate or nobody",
  },
  {
    id: "deal_stage",
    label: "Deal",
    kind: "deal_stage",
    needs: ["deals"],
    draft: "where they are on the way to a deal: value consultation, proposed, won, lost (passed) or ended",
  },
  {
    id: "consultation",
    label: "A consultation",
    kind: "yesno",
    needs: ["calendar", "consult"],
    draft: "their next or last visit is a consultation",
  },
  { id: "step_due", label: "A next step due", kind: "yesno", needs: [], draft: "a next step whose day has come" },
  {
    id: "in_list",
    label: "On the list",
    kind: "list",
    needs: [],
    draft: "on another list, by its token (list); never use it in a draft",
  },
] as const;

const FIELD_IDS = LIST_RULE_FIELDS.map((f) => f.id);
const fieldOf = (id: string) => LIST_RULE_FIELDS.find((f) => f.id === id)!;

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
export const LIST_PURPOSES = ["offers", "messages"] as const;
export const LIST_STANDINGS = ["needs_you", "waiting_on_you"] as const;
export const LIST_ASSIGNED = ["me", "teammate", "nobody"] as const;
export const LIST_DEAL_STAGES = ["consultation", "proposed", "won", "lost", "ended"] as const;

/** How many conditions a rule may hold, and how many facts one "any" group. */
export const LIST_RULE_MAX = 12;
export const LIST_ANY_MAX = 6;

const DAY_OPS = ["more_than", "within", "never", "ever", "this_week"] as const;
const Days = { op: z.enum(DAY_OPS), days: z.number().int().min(1).max(3650).optional() };
const YesNo = { op: z.literal("is"), yes: z.boolean() };
const Count = { op: z.enum(["at_least", "at_most"]), n: z.number().int().min(0).max(10_000) };
const IsOrNot = z.enum(["is", "is_not"]);
/** A list's token, as the address writes it: `seg:<built-in id>` or `list:<saved list id>` (lists.ts). */
const Token = z.string().regex(/^(seg:[a-z_]{1,40}|list:[0-9a-f-]{36})$/i);

export const ListFactSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("last_visit"), ...Days }),
  z.object({ field: z.literal("next_visit"), ...Days }),
  z.object({ field: z.literal("booked"), ...YesNo }),
  z.object({ field: z.literal("asked_not_booked"), ...YesNo }),
  z.object({ field: z.literal("last_heard"), ...Days }),
  z.object({ field: z.literal("first_contact"), ...Days }),
  z.object({ field: z.literal("channel"), op: IsOrNot, channel: z.enum(CHANNELS) }),
  z.object({ field: z.literal("came_from"), op: IsOrNot, from: z.enum(CAME_FROM) }),
  z.object({ field: z.literal("calls"), ...Count }),
  z.object({ field: z.literal("conversations"), ...Count }),
  z.object({ field: z.literal("has_chat"), ...YesNo }),
  z.object({ field: z.literal("said_yes"), ...YesNo, to: z.enum(LIST_PURPOSES) }),
  z.object({ field: z.literal("can_receive"), ...YesNo, to: z.enum(LIST_PURPOSES) }),
  z.object({ field: z.literal("stopped"), ...YesNo }),
  z.object({ field: z.literal("standing"), op: IsOrNot, value: z.enum(LIST_STANDINGS) }),
  z.object({ field: z.literal("assigned"), op: IsOrNot, value: z.enum(LIST_ASSIGNED) }),
  z.object({ field: z.literal("deal_stage"), op: IsOrNot, value: z.enum(LIST_DEAL_STAGES) }),
  z.object({ field: z.literal("consultation"), ...YesNo }),
  z.object({ field: z.literal("step_due"), ...YesNo }),
  z.object({ field: z.literal("in_list"), op: IsOrNot, list: Token }),
]);
export type ListFact = z.infer<typeof ListFactSchema>;

/** Any one of a few facts: "reaches you by WhatsApp or by text". One level deep. */
const AnySchema = z.object({ any: z.array(ListFactSchema).min(2).max(LIST_ANY_MAX) }).strict();
export type ListAny = z.infer<typeof AnySchema>;

export const ListConditionSchema = z.union([AnySchema, ListFactSchema]);
export type ListCondition = ListFact | ListAny;

/** Whether a day fact's op carries its days, and whether `this_week` is said of a fact it fits. */
function factProblem(f: ListFact): string | null {
  if (f.field !== "last_visit" && f.field !== "next_visit" && f.field !== "last_heard" && f.field !== "first_contact")
    return null;
  if ((f.op === "more_than" || f.op === "within") && f.days === undefined) return `${f.field} ${f.op} needs days`;
  if (f.op === "this_week" && f.field !== "next_visit") return "only the next visit can be this week";
  return null;
}

/** Every condition must hold. One to LIST_RULE_MAX of them; a list of everyone is Everyone. */
export const ListRuleSchema = z
  .object({
    v: z.literal(2).optional(),
    all: z.array(ListConditionSchema).min(1).max(LIST_RULE_MAX),
  })
  .superRefine((r, ctx) => {
    for (const f of r.all.flatMap((c) => ("any" in c ? c.any : [c]))) {
      const p = factProblem(f);
      if (p) ctx.addIssue({ code: z.ZodIssueCode.custom, message: p });
    }
  });
export type ListRule = { v?: 2; all: ListCondition[] };

/**
 * Version 1's spellings read as version 2's (decision 0009): `offers_yes` was the bare answer to offers and is now
 * said_yes to offers, the consent rule's own answer (saidYesTo). Nothing is written in version 1 again.
 */
function upgradeFact(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const f = raw as Record<string, unknown>;
  if (f.field === "offers_yes") return { field: "said_yes", op: "is", to: "offers", yes: f.yes };
  return f;
}

function upgrade(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { all?: unknown }).all)) return raw;
  const r = raw as { v?: unknown; all: unknown[] };
  return {
    v: 2,
    all: r.all.map((c) =>
      c && typeof c === "object" && Array.isArray((c as { any?: unknown }).any)
        ? { any: ((c as { any: unknown[] }).any ?? []).map(upgradeFact) }
        : upgradeFact(c),
    ),
  };
}

/** A stored rule in version 2, or null when it is not one this build reads: such a list cannot be counted (lists.ts). */
export function asListRule(raw: unknown): ListRule | null {
  const r = ListRuleSchema.safeParse(upgrade(raw));
  return r.success ? (r.data as ListRule) : null;
}

/** Every fact in a rule, the ones inside an "any" group too. */
export function ruleFacts(rule: ListRule): ListFact[] {
  return rule.all.flatMap((c) => ("any" in c ? c.any : [c]));
}

/** What one fact needs: its field's needs, and a value's own (waiting on YOU, a consultation). */
export function factNeeds(f: ListFact): ListNeed[] {
  const needs = new Set<ListNeed>(fieldOf(f.field).needs);
  if (f.field === "standing" && f.value === "waiting_on_you") needs.add("viewer");
  if (f.field === "assigned" && f.value !== "nobody") needs.add("viewer");
  if (f.field === "deal_stage" && f.value === "consultation") {
    needs.add("calendar");
    needs.add("consult");
  }
  return LIST_NEEDS.filter((n) => needs.has(n));
}

/** What a rule needs, in LIST_NEEDS' order. A list it reads adds that list's needs (lists.ts listNeeds). */
export function ruleNeeds(rule: ListRule): ListNeed[] {
  const needs = new Set(ruleFacts(rule).flatMap(factNeeds));
  return LIST_NEEDS.filter((n) => needs.has(n));
}

/** The lists a rule reads, by token (in_list). */
export function ruleLists(rule: ListRule): string[] {
  return [...new Set(ruleFacts(rule).flatMap((f) => (f.field === "in_list" ? [f.list] : [])))];
}

type DayOp = (typeof DAY_OPS)[number];

/** A day fact over a count of the workspace's dates (null: no such moment). */
function dayHolds(days: number | null, op: DayOp, n: number | undefined): boolean {
  switch (op) {
    case "never":
      return days === null;
    case "ever":
      return days !== null;
    case "within":
      return days !== null && days <= (n ?? 0);
    case "more_than":
      return days !== null && days > (n ?? 0);
    case "this_week":
      return false;
  }
}

/** Whether a person is on a list another list's rule reads: the judge answers it before this runs (lists.ts). */
export type InList = (token: string, personId: string) => boolean;

/** One fact over one person. A fact the row does not have (no visit, never heard from) holds only `never`. */
function holds(f: ListFact, v: PersonRowVM, inList: InList): boolean {
  const is = "op" in f && f.op === "is";
  switch (f.field) {
    case "last_visit":
      return dayHolds(v.lastVisitDays, f.op, f.days);
    case "next_visit":
      return f.op === "this_week" ? v.nextVisitThisWeek : dayHolds(v.nextVisitDays, f.op, f.days);
    case "last_heard":
      return dayHolds(v.heardDays, f.op, f.days);
    case "first_contact":
      // Within the last N days only on a real date: an import's floor says their first contact was earlier.
      return f.op === "within" && !v.firstContact.evidence ? false : dayHolds(v.firstDays, f.op, f.days);
    case "booked":
      return v.booked === f.yes;
    case "asked_not_booked":
      return v.askedNotBooked === f.yes;
    case "has_chat":
      return v.hasChat === f.yes;
    case "stopped":
      return v.stopped === f.yes;
    case "consultation":
      return v.consultationVisit === f.yes;
    case "step_due":
      return v.stepDue === f.yes;
    case "said_yes":
      return v.saidYes[f.to] === f.yes;
    case "can_receive":
      return v.canReceive[f.to] === f.yes;
    case "channel":
      return v.channels.includes(f.channel) === is;
    case "came_from":
      return (v.cameFrom?.key === f.from) === is;
    case "calls":
      return f.op === "at_least" ? v.calls >= f.n : v.calls <= f.n;
    case "conversations":
      return f.op === "at_least" ? v.threads >= f.n : v.threads <= f.n;
    case "standing":
      return (v.standing === f.value) === is;
    case "assigned":
      return (v.assigned === f.value) === is;
    case "deal_stage":
      return (v.dealStage === f.value) === is;
    case "in_list":
      return inList(f.list, v.id) === is;
  }
}

const noLists: InList = () => false;

/** Whether a person is on a list by its rule: every condition holds, an "any" group when one of its facts does. */
export function listRuleMatches(rule: ListRule, v: PersonRowVM, inList: InList = noLists): boolean {
  return rule.all.every((c) => ("any" in c ? c.any.some((f) => holds(f, v, inList)) : holds(c, v, inList)));
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
const lower = (s: string) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`;

const STANDING_WORDS: Record<(typeof LIST_STANDINGS)[number], string> = {
  needs_you: "Needs you",
  waiting_on_you: "Waiting on you",
};
const ASSIGNED_WORDS: Record<(typeof LIST_ASSIGNED)[number], string> = {
  me: "you",
  teammate: "a teammate",
  nobody: "nobody",
};
const DEAL_STAGE_LIST_WORDS: Record<(typeof LIST_DEAL_STAGES)[number], string> = {
  consultation: "a consultation",
  proposed: "a proposal out",
  won: "a client",
  lost: "passed",
  ended: "ended",
};
const PURPOSE_WORDS: Record<(typeof LIST_PURPOSES)[number], string> = { offers: "offers", messages: "messages" };

/**
 * One fact in the page's words: a chip. `listName` says a list another list reads by its name; without it the chip
 * says "another list".
 */
export function listFactWords(f: ListFact, listName: (token: string) => string | null = () => null): string {
  const label = fieldOf(f.field).label;
  switch (f.field) {
    case "last_visit":
    case "last_heard":
    case "first_contact":
      return f.op === "never"
        ? f.field === "last_visit"
          ? "Never visited"
          : f.field === "last_heard"
            ? "Never heard from"
            : "No first contact on file"
        : f.op === "ever"
          ? f.field === "last_visit"
            ? "Has visited"
            : f.field === "last_heard"
              ? "Has written or called"
              : "Has a first contact"
          : f.op === "more_than"
            ? `${label} more than ${plural(f.days ?? 0, "day")} ago`
            : `${label} in the last ${plural(f.days ?? 0, "day")}`;
    case "next_visit":
      return f.op === "this_week"
        ? `${label} this week`
        : f.op === "never"
          ? "No visit ahead"
          : f.op === "ever"
            ? "A visit ahead"
            : f.op === "within"
              ? `${label} in the next ${plural(f.days ?? 0, "day")}`
              : `${label} more than ${plural(f.days ?? 0, "day")} away`;
    case "booked":
    case "asked_not_booked":
    case "has_chat":
    case "stopped":
    case "consultation":
    case "step_due":
      return f.yes ? label : `Not: ${lower(label)}`;
    case "said_yes":
    case "can_receive":
      return f.yes ? `${label} ${PURPOSE_WORDS[f.to]}` : `Not: ${lower(label)} ${PURPOSE_WORDS[f.to]}`;
    case "channel":
      return `${f.op === "is" ? label : "Never reaches you by"} ${PERSON_CHANNEL_WORDS[f.channel]}`;
    case "came_from":
      return `${f.op === "is" ? label : "Did not come from"}: ${PERSON_CAME_FROM_WORDS[f.from]}`;
    case "calls":
    case "conversations":
      return `${f.op === "at_least" ? "At least" : "At most"} ${plural(f.n, f.field === "calls" ? "call" : "conversation")}`;
    case "standing":
      return f.op === "is" ? STANDING_WORDS[f.value] : `Not: ${lower(STANDING_WORDS[f.value])}`;
    case "assigned":
      return `${f.op === "is" ? label : "Thread is not with"} ${ASSIGNED_WORDS[f.value]}`;
    case "deal_stage":
      return `${f.op === "is" ? label : "Deal is not"}: ${DEAL_STAGE_LIST_WORDS[f.value]}`;
    case "in_list": {
      const name = listName(f.list);
      return f.op === "is" ? `On ${name ?? "another list"}` : `Not on ${name ?? "another list"}`;
    }
  }
}

/** One condition in the page's words: a fact, or an "any" group's facts joined by "or". */
export function listConditionWords(c: ListCondition, listName?: (token: string) => string | null): string {
  return "any" in c ? c.any.map((f) => listFactWords(f, listName)).join(", or ") : listFactWords(c, listName);
}

/** A rule as the chips the page shows it in, one per condition, in its order. */
export function listRuleParts(rule: ListRule, listName?: (token: string) => string | null): string[] {
  return rule.all.map((c) => listConditionWords(c, listName));
}

/** The facts a person meets, in the page's words: why a smart list has them (a profile's "because" line). */
export function listRuleWhy(rule: ListRule, v: PersonRowVM, listName?: (token: string) => string | null): string {
  return rule.all
    .map((c) => ("any" in c ? (c.any.find((f) => holds(f, v, noLists)) ?? c.any[0]) : c))
    .map((f) => listFactWords(f, listName))
    .join(" · ");
}

/**
 * The drafting model's lines about the vocabulary, one per field, from LIST_RULE_FIELDS: the fields and their ops as
 * the schema reads them, so the prompt cannot name a field the schema refuses.
 */
export function listDraftFieldLines(): string[] {
  const ops: Record<FieldKind, string> = {
    days: "op more_than or within with days; never or ever without",
    yesno: "op is; yes true or false",
    channel: "op is or is_not; channel",
    came_from: "op is or is_not; from",
    count: "op at_least or at_most; n",
    purpose: "op is; to; yes",
    standing: "op is or is_not; value",
    assigned: "op is or is_not; value",
    deal_stage: "op is or is_not; value",
    list: "op is or is_not; list",
  };
  return LIST_RULE_FIELDS.filter((f) => f.kind !== "list").map((f) => `- ${f.id}: ${f.draft}. ${ops[f.kind]}.`);
}

const LEAF_PROPERTIES = {
  field: { type: "string", enum: FIELD_IDS.filter((id) => id !== "in_list") },
  op: { type: "string", enum: [...DAY_OPS, "at_least", "at_most", "is", "is_not"] },
  days: { type: "integer" },
  n: { type: "integer" },
  yes: { type: "boolean" },
  channel: { type: "string", enum: [...CHANNELS] },
  from: { type: "string", enum: [...CAME_FROM] },
  to: { type: "string", enum: [...LIST_PURPOSES] },
  value: { type: "string", enum: [...new Set([...LIST_STANDINGS, ...LIST_ASSIGNED, ...LIST_DEAL_STAGES])] },
} as const;

/**
 * The shape the model answers a plain-English description in: the rule, a name for the list, and what in the words
 * the vocabulary cannot say (a staff member, a tag, what was said), which the page shows rather than drops. A condition
 * is a fact, or `any`: two or more facts of which one must hold. A draft never reads another list.
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
        properties: {
          ...LEAF_PROPERTIES,
          any: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["field", "op"],
              properties: LEAF_PROPERTIES,
            },
          },
        },
      },
    },
  },
} as const;

export const ListDraftAnswerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  cannot: z.string().trim().max(200),
  all: z.array(z.unknown()).max(LIST_RULE_MAX),
});
export type ListDraftAnswer = z.infer<typeof ListDraftAnswerSchema>;
