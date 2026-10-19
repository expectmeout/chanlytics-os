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
// The rule's grammar is read in the browser too (asListRule: People, Broadcasts, Playbooks), so it is written in
// zod/mini, which the bundler cuts down to the parts it uses, where the classic API ships whole (89 KB gzipped). The
// routes' and the model's schemas over it are list-schemas.ts's, in the classic API.
// First, before this module builds a schema: zod-config.ts says why. A page's bundle takes this module alone
// (contracts-browser.mjs), never the entry that imports the setting first.
import "../../zod-config";
import * as z from "zod/mini";
import { PERSON_CAME_FROM_WORDS, PERSON_CHANNEL_WORDS, type PersonCameFrom, type PersonChannel } from "../person-words";
import type { PersonRowVM } from "../person-row";
import { plural } from "../../shared/words";
import { HELD_WORDS, NEEDS_YOU_WORD } from "../../conversations/standing";
import {
  LIST_ANY_MAX,
  LIST_ASSIGNED,
  LIST_DAY_OPS as DAY_OPS,
  LIST_DEAL_STAGES,
  LIST_PURPOSES,
  LIST_RULE_FIELDS,
  LIST_RULE_MAX,
  LIST_STANDINGS,
  listFieldOf as fieldOf,
  type ListFieldKind as FieldKind,
} from "./list-fields";
import { factHolds } from "./list-match";

const FIELD_IDS = LIST_RULE_FIELDS.map((f) => f.id);

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
const Days = { op: z.enum(DAY_OPS), days: z.optional(z.int().check(z.minimum(1), z.maximum(3650))) };
const YesNo = { op: z.literal("is"), yes: z.boolean() };
const Count = { op: z.enum(["at_least", "at_most"]), n: z.int().check(z.minimum(0), z.maximum(10_000)) };
const IsOrNot = z.enum(["is", "is_not"]);
/** A list's token, as the address writes it: `seg:<built-in id>` or `list:<saved list id>` (lists.ts). */
const Token = z.string().check(z.regex(/^(seg:[a-z_]{1,40}|list:[0-9a-f-]{36})$/i));

// Strict: a fact that says anything this build does not read ("service": "balayage") is not read as a broader one.
const fact = <T extends z.core.$ZodLooseShape>(shape: T) => z.strictObject(shape);
export const ListFactSchema = z.discriminatedUnion("field", [
  fact({ field: z.literal("last_visit"), ...Days }),
  fact({ field: z.literal("next_visit"), ...Days }),
  fact({ field: z.literal("missed_visit"), ...Days }),
  fact({ field: z.literal("booked"), ...YesNo }),
  fact({ field: z.literal("asked_not_booked"), ...YesNo }),
  fact({ field: z.literal("last_heard"), ...Days }),
  fact({ field: z.literal("first_contact"), ...Days }),
  fact({ field: z.literal("channel"), op: IsOrNot, channel: z.enum(CHANNELS) }),
  fact({ field: z.literal("came_from"), op: IsOrNot, from: z.enum(CAME_FROM) }),
  fact({ field: z.literal("calls"), ...Count }),
  fact({ field: z.literal("conversations"), ...Count }),
  fact({ field: z.literal("has_chat"), ...YesNo }),
  fact({ field: z.literal("said_yes"), ...YesNo, to: z.enum(LIST_PURPOSES) }),
  fact({ field: z.literal("can_receive"), ...YesNo, to: z.enum(LIST_PURPOSES) }),
  fact({ field: z.literal("stopped"), ...YesNo }),
  fact({ field: z.literal("standing"), op: IsOrNot, value: z.enum(LIST_STANDINGS) }),
  fact({ field: z.literal("assigned"), op: IsOrNot, value: z.enum(LIST_ASSIGNED) }),
  fact({ field: z.literal("deal_stage"), op: IsOrNot, value: z.enum(LIST_DEAL_STAGES) }),
  fact({ field: z.literal("consultation"), ...YesNo }),
  fact({ field: z.literal("step_due"), ...YesNo }),
  fact({ field: z.literal("in_list"), op: IsOrNot, list: Token }),
]);
export type ListFact = z.infer<typeof ListFactSchema>;

/** Any one of a few facts: "reaches you by WhatsApp or by text". One level deep. */
const AnySchema = z.strictObject({ any: z.array(ListFactSchema).check(z.minLength(2), z.maxLength(LIST_ANY_MAX)) });
export type ListAny = z.infer<typeof AnySchema>;

export const ListConditionSchema = z.union([AnySchema, ListFactSchema]);
export type ListCondition = ListFact | ListAny;

/** A fact over a count of days since or until one of a person's dates (DAY_OPS). */
type DayFact = Extract<
  ListFact,
  { field: "last_visit" | "next_visit" | "missed_visit" | "last_heard" | "first_contact" }
>;

const isDayFact = (f: ListFact): f is DayFact =>
  f.field === "last_visit" ||
  f.field === "next_visit" ||
  f.field === "missed_visit" ||
  f.field === "last_heard" ||
  f.field === "first_contact";

/** Whether a day fact's op carries its days, and whether `this_week` is said of a fact it fits. */
function factProblem(f: ListFact): string | null {
  if (!isDayFact(f)) return null;
  if ((f.op === "more_than" || f.op === "within") && f.days === undefined) return `${f.field} ${f.op} needs days`;
  if (f.op === "this_week" && f.field !== "next_visit") return "only the next one on the calendar can be this week";
  return null;
}

/** Every condition must hold. One to LIST_RULE_MAX of them; a list of everyone is Everyone. */
export const ListRuleSchema = z
  // A rule that says more than this build reads ("none": [...]) is not one it reads, never a broader one it does.
  .strictObject({
    v: z.optional(z.literal(2)),
    all: z.array(ListConditionSchema).check(z.minLength(1), z.maxLength(LIST_RULE_MAX)),
  })
  .check(
    z.superRefine((r, ctx) => {
      for (const f of r.all.flatMap((c) => ("any" in c ? c.any : [c]))) {
        const p = factProblem(f);
        if (p) ctx.addIssue({ code: "custom", message: p });
      }
    }),
  );
export type ListRule = { v?: 2; all: ListCondition[] };

/**
 * Version 1's spellings read as version 2's (decision 0009): `offers_yes` was the bare answer to offers and is now
 * said_yes to offers, the answer they gave (reach-any.ts answeredYes). Nothing is written in version 1 again.
 */
function upgradeFact(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const f = raw as Record<string, unknown>;
  if (f.field === "offers_yes") return { field: "said_yes", op: "is", to: "offers", yes: f.yes };
  return f;
}

/**
 * Version 1 (no `v`) and version 2 read as version 2; anything else is left as it is, for the schema to refuse: a
 * version 3 rule is not a version 2 rule with its new parts dropped. Every key is kept, so a condition that is both a
 * fact and an "any" group, or a rule with a part this build does not know, is refused rather than narrowed.
 */
function upgrade(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { all?: unknown }).all)) return raw;
  const r = raw as { v?: unknown; all: unknown[] };
  if (r.v !== undefined && r.v !== 2) return raw;
  return {
    ...r,
    v: 2,
    all: r.all.map((c) =>
      c && typeof c === "object" && Array.isArray((c as { any?: unknown }).any)
        ? { ...c, any: (c as { any: unknown[] }).any.map(upgradeFact) }
        : upgradeFact(c),
    ),
  };
}

/** A stored rule in version 2, or null when it is not one this build reads: such a list cannot be counted (lists.ts). */
export function asListRule(raw: unknown): ListRule | null {
  const r = ListRuleSchema.safeParse(upgrade(raw));
  return r.success ? r.data : null;
}

/** The keys each kind of fact carries beside its field and op: what a draft's fact is cut down to. */
const KIND_KEYS: Record<FieldKind, readonly string[]> = {
  days: ["days"],
  yesno: ["yes"],
  channel: ["channel"],
  came_from: ["from"],
  count: ["n"],
  purpose: ["to", "yes"],
  standing: ["value"],
  assigned: ["value"],
  deal_stage: ["value"],
  list: ["list"],
};

/**
 * A rule the drafting model wrote (LIST_DRAFT_JSON_SCHEMA, whose every property is optional): each fact cut down to the
 * keys its field reads, an "any" group to its facts, then read strictly (asListRule). A stored rule is never read this
 * leniently: the model fills in what it may, a stored rule says what it means.
 */
export function draftListRule(all: readonly unknown[]): ListRule | null {
  const cut = (raw: unknown): unknown => {
    if (!raw || typeof raw !== "object") return raw;
    const f = raw as Record<string, unknown>;
    const field = LIST_RULE_FIELDS.find((x) => x.id === f.field);
    if (!field) return raw;
    const keep = ["field", "op", ...KIND_KEYS[field.kind]];
    return Object.fromEntries(Object.entries(f).filter(([k, v]) => keep.includes(k) && v !== null));
  };
  return asListRule({
    all: all.map((c) =>
      c && typeof c === "object" && Array.isArray((c as { any?: unknown }).any)
        ? { any: (c as { any: unknown[] }).any.map(cut) }
        : cut(c),
    ),
  });
}

const lower = (s: string) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`;

const STANDING_WORDS: Record<(typeof LIST_STANDINGS)[number], string> = {
  needs_you: NEEDS_YOU_WORD,
  waiting_on_you: HELD_WORDS.yours.pill,
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

/** A day fact said with no days: never, and ever, each field in its own words. */
const DAY_FACT_ENDS: Record<
  "last_visit" | "missed_visit" | "last_heard" | "first_contact",
  { never: string; ever: string }
> = {
  last_visit: { never: "Never on the calendar", ever: "On the calendar before" },
  missed_visit: { never: "Never missed one", ever: "Has missed one" },
  last_heard: { never: "Never heard from", ever: "Has written or called" },
  first_contact: { never: "No first contact on file", ever: "Has a first contact" },
};

/**
 * One fact in the page's words: a chip. `listName` says a list another list reads by its name; without it the chip
 * says "another list".
 */
export function listFactWords(f: ListFact, listName: (token: string) => string | null = () => null): string {
  const label = fieldOf(f.field).label;
  switch (f.field) {
    case "last_visit":
    case "missed_visit":
    case "last_heard":
    case "first_contact":
      return f.op === "never"
        ? DAY_FACT_ENDS[f.field].never
        : f.op === "ever"
          ? DAY_FACT_ENDS[f.field].ever
          : f.op === "more_than"
            ? `${label} more than ${plural(f.days ?? 0, "day")} ago`
            : `${label} in the last ${plural(f.days ?? 0, "day")}`;
    case "next_visit":
      return f.op === "this_week"
        ? `${label} this week`
        : f.op === "never"
          ? "Nothing ahead on the calendar"
          : f.op === "ever"
            ? "Something ahead on the calendar"
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
    .map((c) => ("any" in c ? (c.any.find((f) => factHolds(f, v)) ?? c.any[0]) : c))
    .map((f) => listFactWords(f, listName))
    .join(" · ");
}

/**
 * Who a rule leaves out for want of a date (the operator stress run, 15 Oct 2026): a day fact over more than N days
 * holds only for someone with that date on record, so someone never heard from is not quiet (the Quiet list's rule) and
 * someone never on the calendar has not been away from it. For each such condition, the rule with it read as never, and
 * that condition's chip ("Never heard from"): whoever it holds is said apart, never as nobody.
 */
export function ruleUndated(rule: ListRule): { words: string; rule: ListRule }[] {
  return rule.all.flatMap((c, i) => {
    if ("any" in c || !isDayFact(c) || c.op !== "more_than") return [];
    const never: DayFact = { field: c.field, op: "never" };
    return [{ words: listFactWords(never), rule: { ...rule, all: rule.all.map((x, k) => (k === i ? never : x)) } }];
  });
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
