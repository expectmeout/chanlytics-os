import "../../zod-config.js";
import * as z from "zod/mini";
import { PERSON_CAME_FROM_WORDS, PERSON_CHANNEL_WORDS } from "../person-words.js";
import { plural } from "../../shared/words.js";
import { HELD_WORDS, NEEDS_YOU_WORD } from "../../conversations/standing.js";
export const LIST_NEEDS = ["calendar", "consult", "deals", "viewer"];
export const LIST_RULE_FIELDS = [
  {
    id: "last_visit",
    label: "Last on the calendar",
    kind: "days",
    needs: ["calendar"],
    draft: "days since their last appointment on the calendar"
  },
  {
    id: "next_visit",
    label: "Next on the calendar",
    kind: "days",
    needs: ["calendar"],
    draft: "days until their next appointment; op this_week is Monday to Sunday of this week"
  },
  {
    id: "missed_visit",
    label: "Missed one",
    kind: "days",
    needs: ["calendar"],
    draft: "days since an appointment they did not come to, as a member marked it missed on the calendar"
  },
  { id: "booked", label: "Booked ahead", kind: "yesno", needs: ["calendar"], draft: "an appointment booked ahead" },
  {
    id: "asked_not_booked",
    label: "Asked, never booked",
    kind: "yesno",
    needs: ["calendar"],
    draft: "wrote or called in the last 30 days and nothing on the calendar answers it"
  },
  {
    id: "last_heard",
    label: "Last heard from",
    kind: "days",
    needs: [],
    draft: "days since THEY last wrote or called"
  },
  { id: "first_contact", label: "First contact", kind: "days", needs: [], draft: "days since they first got in touch" },
  {
    id: "channel",
    label: "Reaches you by",
    kind: "channel",
    needs: [],
    draft: "a way they reach the business: whatsapp, sms, voice (phone calls) or email"
  },
  {
    id: "came_from",
    label: "Came from",
    kind: "came_from",
    needs: [],
    draft: "how they first came: whatsapp, sms, email, call, calendar, manual, import or lead"
  },
  { id: "calls", label: "Calls", kind: "count", needs: [], draft: "how many calls" },
  { id: "conversations", label: "Conversations", kind: "count", needs: [], draft: "how many conversations" },
  {
    id: "has_chat",
    label: "Has written with you",
    kind: "yesno",
    needs: [],
    draft: "a written conversation either way (no means they have only phoned)"
  },
  {
    id: "said_yes",
    label: "Said yes to",
    kind: "purpose",
    needs: [],
    draft: "said yes to offers, or to messages (to: offers or messages)"
  },
  {
    id: "can_receive",
    label: "Can be sent",
    kind: "purpose",
    needs: [],
    draft: "can be sent offers or messages: the yes and a number to send to (to: offers or messages)"
  },
  { id: "stopped", label: "Asked to stop", kind: "yesno", needs: [], draft: "asked to stop, or on do-not-contact" },
  {
    id: "standing",
    label: "Standing",
    kind: "standing",
    needs: [],
    draft: "value needs_you (waiting for a person) or waiting_on_you (a thread you have: you took it over, or your reply paused the receptionist)"
  },
  {
    id: "assigned",
    label: "Thread is with",
    kind: "assigned",
    needs: [],
    draft: "who has their thread: value me, teammate or nobody"
  },
  {
    id: "deal_stage",
    label: "Deal",
    kind: "deal_stage",
    needs: ["deals"],
    draft: "where they are on the way to a deal: value consultation, proposed, won, lost (passed) or ended"
  },
  {
    id: "consultation",
    label: "A consultation",
    kind: "yesno",
    needs: ["calendar", "consult"],
    draft: "their next or last appointment is a consultation"
  },
  { id: "step_due", label: "A next step due", kind: "yesno", needs: [], draft: "a next step whose day has come" },
  {
    id: "in_list",
    label: "On the list",
    kind: "list",
    needs: [],
    draft: "on another list, by its token (list); never use it in a draft"
  }
];
const FIELD_IDS = LIST_RULE_FIELDS.map((f) => f.id);
const fieldOf = (id) => LIST_RULE_FIELDS.find((f) => f.id === id);
const CHANNELS = ["whatsapp", "sms", "voice", "email"];
const CAME_FROM = [
  "whatsapp",
  "sms",
  "email",
  "call",
  "calendar",
  "manual",
  "import",
  "lead"
];
export const LIST_PURPOSES = ["offers", "messages"];
export const LIST_STANDINGS = ["needs_you", "waiting_on_you"];
export const LIST_ASSIGNED = ["me", "teammate", "nobody"];
export const LIST_DEAL_STAGES = ["consultation", "proposed", "won", "lost", "ended"];
export const LIST_RULE_MAX = 12;
export const LIST_ANY_MAX = 6;
const DAY_OPS = ["more_than", "within", "never", "ever", "this_week"];
const Days = { op: z.enum(DAY_OPS), days: z.optional(z.int().check(z.minimum(1), z.maximum(3650))) };
const YesNo = { op: z.literal("is"), yes: z.boolean() };
const Count = { op: z.enum(["at_least", "at_most"]), n: z.int().check(z.minimum(0), z.maximum(1e4)) };
const IsOrNot = z.enum(["is", "is_not"]);
const Token = z.string().check(z.regex(/^(seg:[a-z_]{1,40}|list:[0-9a-f-]{36})$/i));
const fact = (shape) => z.strictObject(shape);
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
  fact({ field: z.literal("in_list"), op: IsOrNot, list: Token })
]);
const AnySchema = z.strictObject({ any: z.array(ListFactSchema).check(z.minLength(2), z.maxLength(LIST_ANY_MAX)) });
export const ListConditionSchema = z.union([AnySchema, ListFactSchema]);
const isDayFact = (f) => f.field === "last_visit" || f.field === "next_visit" || f.field === "missed_visit" || f.field === "last_heard" || f.field === "first_contact";
function factProblem(f) {
  if (!isDayFact(f)) return null;
  if ((f.op === "more_than" || f.op === "within") && f.days === void 0) return `${f.field} ${f.op} needs days`;
  if (f.op === "this_week" && f.field !== "next_visit") return "only the next one on the calendar can be this week";
  return null;
}
export const ListRuleSchema = z.strictObject({
  v: z.optional(z.literal(2)),
  all: z.array(ListConditionSchema).check(z.minLength(1), z.maxLength(LIST_RULE_MAX))
}).check(
  z.superRefine((r, ctx) => {
    for (const f of r.all.flatMap((c) => "any" in c ? c.any : [c])) {
      const p = factProblem(f);
      if (p) ctx.addIssue({ code: "custom", message: p });
    }
  })
);
function upgradeFact(raw) {
  if (!raw || typeof raw !== "object") return raw;
  const f = raw;
  if (f.field === "offers_yes") return { field: "said_yes", op: "is", to: "offers", yes: f.yes };
  return f;
}
function upgrade(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.all)) return raw;
  const r = raw;
  if (r.v !== void 0 && r.v !== 2) return raw;
  return {
    ...r,
    v: 2,
    all: r.all.map(
      (c) => c && typeof c === "object" && Array.isArray(c.any) ? { ...c, any: c.any.map(upgradeFact) } : upgradeFact(c)
    )
  };
}
export function asListRule(raw) {
  const r = ListRuleSchema.safeParse(upgrade(raw));
  return r.success ? r.data : null;
}
const KIND_KEYS = {
  days: ["days"],
  yesno: ["yes"],
  channel: ["channel"],
  came_from: ["from"],
  count: ["n"],
  purpose: ["to", "yes"],
  standing: ["value"],
  assigned: ["value"],
  deal_stage: ["value"],
  list: ["list"]
};
export function draftListRule(all) {
  const cut = (raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const f = raw;
    const field = LIST_RULE_FIELDS.find((x) => x.id === f.field);
    if (!field) return raw;
    const keep = ["field", "op", ...KIND_KEYS[field.kind]];
    return Object.fromEntries(Object.entries(f).filter(([k, v]) => keep.includes(k) && v !== null));
  };
  return asListRule({
    all: all.map(
      (c) => c && typeof c === "object" && Array.isArray(c.any) ? { any: c.any.map(cut) } : cut(c)
    )
  });
}
export function ruleFacts(rule) {
  return rule.all.flatMap((c) => "any" in c ? c.any : [c]);
}
export function factNeeds(f) {
  const needs = new Set(fieldOf(f.field).needs);
  if (f.field === "standing" && f.value === "waiting_on_you") needs.add("viewer");
  if (f.field === "assigned" && f.value !== "nobody") needs.add("viewer");
  if (f.field === "deal_stage" && f.value === "consultation") {
    needs.add("calendar");
    needs.add("consult");
  }
  return LIST_NEEDS.filter((n) => needs.has(n));
}
export function ruleNeeds(rule) {
  const needs = new Set(ruleFacts(rule).flatMap(factNeeds));
  return LIST_NEEDS.filter((n) => needs.has(n));
}
export function ruleLists(rule) {
  return [...new Set(ruleFacts(rule).flatMap((f) => f.field === "in_list" ? [f.list] : []))];
}
function dayHolds(days, op, n) {
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
function holds(f, v, inList) {
  const is = "op" in f && f.op === "is";
  switch (f.field) {
    case "last_visit":
      return dayHolds(v.lastVisitDays, f.op, f.days);
    case "next_visit":
      return f.op === "this_week" ? v.nextVisitThisWeek : dayHolds(v.nextVisitDays, f.op, f.days);
    case "missed_visit":
      return dayHolds(v.missedVisitDays, f.op, f.days);
    case "last_heard":
      return dayHolds(v.heardDays, f.op, f.days);
    case "first_contact":
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
      return v.cameFrom?.key === f.from === is;
    case "calls":
      return f.op === "at_least" ? v.calls >= f.n : v.calls <= f.n;
    case "conversations":
      return f.op === "at_least" ? v.threads >= f.n : v.threads <= f.n;
    case "standing":
      return v.standing === f.value === is;
    case "assigned":
      return v.assigned === f.value === is;
    case "deal_stage":
      return v.dealStages.includes(f.value) === is;
    case "in_list":
      return inList(f.list, v.id) === is;
  }
}
const noLists = () => false;
export function listRuleMatches(rule, v, inList = noLists) {
  return rule.all.every((c) => "any" in c ? c.any.some((f) => holds(f, v, inList)) : holds(c, v, inList));
}
const lower = (s) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`;
const STANDING_WORDS = {
  needs_you: NEEDS_YOU_WORD,
  waiting_on_you: HELD_WORDS.yours.pill
};
const ASSIGNED_WORDS = {
  me: "you",
  teammate: "a teammate",
  nobody: "nobody"
};
const DEAL_STAGE_LIST_WORDS = {
  consultation: "a consultation",
  proposed: "a proposal out",
  won: "a client",
  lost: "passed",
  ended: "ended"
};
const PURPOSE_WORDS = { offers: "offers", messages: "messages" };
const DAY_FACT_ENDS = {
  last_visit: { never: "Never on the calendar", ever: "On the calendar before" },
  missed_visit: { never: "Never missed one", ever: "Has missed one" },
  last_heard: { never: "Never heard from", ever: "Has written or called" },
  first_contact: { never: "No first contact on file", ever: "Has a first contact" }
};
export function listFactWords(f, listName = () => null) {
  const label = fieldOf(f.field).label;
  switch (f.field) {
    case "last_visit":
    case "missed_visit":
    case "last_heard":
    case "first_contact":
      return f.op === "never" ? DAY_FACT_ENDS[f.field].never : f.op === "ever" ? DAY_FACT_ENDS[f.field].ever : f.op === "more_than" ? `${label} more than ${plural(f.days ?? 0, "day")} ago` : `${label} in the last ${plural(f.days ?? 0, "day")}`;
    case "next_visit":
      return f.op === "this_week" ? `${label} this week` : f.op === "never" ? "Nothing ahead on the calendar" : f.op === "ever" ? "Something ahead on the calendar" : f.op === "within" ? `${label} in the next ${plural(f.days ?? 0, "day")}` : `${label} more than ${plural(f.days ?? 0, "day")} away`;
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
export function listConditionWords(c, listName) {
  return "any" in c ? c.any.map((f) => listFactWords(f, listName)).join(", or ") : listFactWords(c, listName);
}
export function listRuleParts(rule, listName) {
  return rule.all.map((c) => listConditionWords(c, listName));
}
export function listRuleWhy(rule, v, listName) {
  return rule.all.map((c) => "any" in c ? c.any.find((f) => holds(f, v, noLists)) ?? c.any[0] : c).map((f) => listFactWords(f, listName)).join(" \xB7 ");
}
export function ruleUndated(rule) {
  return rule.all.flatMap((c, i) => {
    if ("any" in c || !isDayFact(c) || c.op !== "more_than") return [];
    const never = { field: c.field, op: "never" };
    return [{ words: listFactWords(never), rule: { ...rule, all: rule.all.map((x, k) => k === i ? never : x) } }];
  });
}
export function listDraftFieldLines() {
  const ops = {
    days: "op more_than or within with days; never or ever without",
    yesno: "op is; yes true or false",
    channel: "op is or is_not; channel",
    came_from: "op is or is_not; from",
    count: "op at_least or at_most; n",
    purpose: "op is; to; yes",
    standing: "op is or is_not; value",
    assigned: "op is or is_not; value",
    deal_stage: "op is or is_not; value",
    list: "op is or is_not; list"
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
  value: { type: "string", enum: [.../* @__PURE__ */ new Set([...LIST_STANDINGS, ...LIST_ASSIGNED, ...LIST_DEAL_STAGES])] }
};
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
              properties: LEAF_PROPERTIES
            }
          }
        }
      }
    }
  }
};
