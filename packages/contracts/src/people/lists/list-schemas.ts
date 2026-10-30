/**
 * What the routes and the model read about lists, in zod's classic API: the People export's query and the list a
 * model drafts. Apart from lists.ts and list-rules.ts, which the browser reads (the rule's own grammar is zod/mini),
 * so a page that counts a list loads none of the classic API.
 */
import { z } from "zod";
import {
  LIST_ASSIGNED,
  LIST_DEAL_STAGES,
  LIST_RULE_FIELDS,
  LIST_RULE_MAX,
  LIST_STANDINGS,
  type ListFieldKind,
} from "./list-fields";
import { LIST_CONDITIONS_JSON_SCHEMA } from "./list-rules";
import { parseListToken } from "./list-token";

/**
 * The People export's query (GET contacts/export): the list it follows, by its token (`seg:<id>` or `list:<id>`);
 * none is everyone. The route counts it the way a send does, every member and not the page's loaded rows.
 */
export const PeopleExportQuerySchema = z.object({
  list: z
    .string()
    .max(80)
    .refine((t) => parseListToken(t) !== null, "Name a list by its token.")
    .optional(),
});

/** Each key's type as the assistant's tools show it (list-rules.ts), so the two shapes cannot name a key apart. */
const TOOL_KEY = LIST_CONDITIONS_JSON_SCHEMA.items.properties;
const fieldsOfKind = (kind: ListFieldKind) => LIST_RULE_FIELDS.filter((f) => f.kind === kind).map((f) => f.id);
const jsonEnum = (values: readonly string[]) => ({ type: "string", enum: [...values] });
const IS_OR_NOT = ["is", "is_not"];

/** One kind of fact as the drafter writes it: the fields and ops it takes, then its keys, every one required. */
function draftFact(field: readonly string[], op: readonly string[], keys: Record<string, object> = {}) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["field", "op", ...Object.keys(keys)],
    properties: { field: jsonEnum(field), op: jsonEnum(op), ...keys },
  };
}

/**
 * The shape the model answers a plain-English description in (list_draft): the rule, a name for the list, and what in
 * the words the vocabulary cannot say (a staff member, a tag, what was said), which the page shows rather than drops. A
 * condition is a fact, or `any`: two or more facts of which one must hold. A draft never reads another list.
 *
 * The API compiles this into a grammar (output_config.format), and each optional key roughly doubles it. So each kind
 * of fact is its own shape with every key it carries required, as the rule's grammar reads it (list-rules.ts
 * ListFactSchema), and the facts are said once, in $defs, for both places a fact goes. Probed 30 Oct 2026 on Sonnet 5:
 * the tools' shape (field and op required, the rest optional, `any` nested) was "Schema is too complex." after 28 s,
 * on every model; these facts written out in both places, "The compiled grammar is too large"; this, compiled in 5 s.
 */
export const LIST_DRAFT_JSON_SCHEMA = {
  $defs: {
    fact: {
      anyOf: [
        draftFact(fieldsOfKind("days"), ["more_than", "within"], { days: TOOL_KEY.days }),
        draftFact(fieldsOfKind("days"), ["never", "ever"]),
        draftFact(["next_visit"], ["this_week"]),
        draftFact(fieldsOfKind("yesno"), ["is"], { yes: TOOL_KEY.yes }),
        draftFact(fieldsOfKind("channel"), IS_OR_NOT, { channel: TOOL_KEY.channel }),
        draftFact(fieldsOfKind("came_from"), IS_OR_NOT, { from: TOOL_KEY.from }),
        draftFact(fieldsOfKind("count"), ["at_least", "at_most"], { n: TOOL_KEY.n }),
        draftFact(fieldsOfKind("purpose"), ["is"], { to: TOOL_KEY.to, yes: TOOL_KEY.yes }),
        draftFact(fieldsOfKind("standing"), IS_OR_NOT, { value: jsonEnum(LIST_STANDINGS) }),
        draftFact(fieldsOfKind("assigned"), IS_OR_NOT, { value: jsonEnum(LIST_ASSIGNED) }),
        draftFact(fieldsOfKind("deal_stage"), IS_OR_NOT, { value: jsonEnum(LIST_DEAL_STAGES) }),
      ],
    },
  },
  type: "object",
  additionalProperties: false,
  required: ["name", "all", "cannot"],
  properties: {
    name: { type: "string" },
    cannot: { type: "string" },
    all: {
      type: "array",
      items: {
        anyOf: [
          { $ref: "#/$defs/fact" },
          {
            type: "object",
            additionalProperties: false,
            required: ["any"],
            properties: { any: { type: "array", items: { $ref: "#/$defs/fact" } } },
          },
        ],
      },
    },
  },
};

export const ListDraftAnswerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  cannot: z.string().trim().max(200),
  all: z.array(z.unknown()).max(LIST_RULE_MAX),
});
export type ListDraftAnswer = z.infer<typeof ListDraftAnswerSchema>;
