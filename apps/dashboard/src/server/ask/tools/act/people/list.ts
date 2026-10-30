import "server-only";
import { z } from "zod";
import {
  AppError,
  LIST_CONDITIONS_JSON_SCHEMA,
  ListDraftAnswerSchema,
  asListRule,
  listMembers,
  listRuleParts,
  listUnknownWords,
  plural,
  ruleLists,
} from "@chanlytics/contracts";
import {
  LIST_BATCH_MAX,
  LIST_NAME_MAX,
  LIST_NAME_TAKEN,
  LIST_RULE_LINES,
  cleanListName,
  cleanListRule,
} from "../../../../people/lists";
import { load } from "../../../../readers";
import { audiencePool } from "../../../../readers/audience-pool";
import { lists as listsReader } from "../../../../readers/lists";
import {
  actAction,
  defineActions,
  propose,
  refuse,
  str,
  type ProposalOutcome,
  type ToolContext,
  nullsLeftOut,
} from "../../context";
import { selected } from "./people";

/** What they asked that the vocabulary cannot say, kept as the drafter keeps it: a few words, trimmed. */
const LEFT_OUT = ListDraftAnswerSchema.shape.cannot;

/** One of the lists routes' guards (server/people/lists.ts), run as the route runs it: its answer, or its words. */
function guard<T>(check: () => T): { ok: T } | { refused: string } {
  try {
    return { ok: check() };
  } catch (e) {
    if (e instanceof AppError) return { refused: e.message };
    throw e;
  }
}

/** A new list that names nobody: neither its rule nor its people. */
const NO_ONE_NAMED =
  "name who is on it: all, conditions for a list that keeps itself current, or ids, the people a read returned, for one kept by hand ([] for an empty one they fill on People); a list of everyone is Everyone, which People has";

/** A rule the model wrote, read strictly as a stored rule is, its nulls aside; or the refusal in the vocabulary's words. */
function ruleOf(all: unknown[]): { rule: NonNullable<ReturnType<typeof asListRule>> } | { refusal: string } {
  if (!all.length) return { refusal: "all needs a condition: a list of everyone is Everyone, which People has" };
  const rule = asListRule({ all: nullsLeftOut(all) });
  if (!rule)
    return {
      refusal:
        "all is not a rule the list vocabulary reads: one to twelve conditions, each either one fact with only the keys its field takes (field, op and that op's value) or { any: [two to six facts] }, never both; what the fields cannot say, such as a service, a tag or what was said, goes in cannot and never in a fact",
    };
  if (ruleLists(rule).length)
    return { refusal: "a list proposed here never reads another list; one that does is made on People" };
  return { rule };
}

/**
 * A list of the workspace's own renamed, or its rule changed (a smart list's), as the lists door takes it (PUT
 * segments/:id): the new name checked as a new list's is, the new rule as a made one's, and who it holds after counted as
 * People counts it. The card keeps what it was, for its undo.
 */
async function proposeListChange(
  t: ToolContext,
  input: { list_id: string; name?: string; all?: unknown[]; cannot?: string },
): Promise<ProposalOutcome> {
  const id = str(input.list_id, 40);
  const kept = (await load(t.rc, listsReader, undefined)).data.lists;
  const list = kept.find((l) => l.id === id && !l.archived_at);
  if (!list) return refuse("list_id must be one of the workspace's own lists (people with action lists)");
  let name: string | undefined;
  if (input.name !== undefined) {
    const named = guard(() => cleanListName(input.name));
    if ("refused" in named) return refuse(named.refused);
    if (named.ok.toLowerCase() !== list.name.toLowerCase()) {
      if (kept.some((l) => l.id !== id && !l.archived_at && l.name.toLowerCase() === named.ok.toLowerCase()))
        return refuse(LIST_NAME_TAKEN);
      name = named.ok;
    }
  }
  let rule: NonNullable<ReturnType<typeof asListRule>> | undefined;
  if (input.all && input.all.length) {
    if (list.rule == null) return refuse(`${list.name} is kept by hand: it has no rule. Make a smart list instead`);
    const r = ruleOf(input.all);
    if ("refusal" in r) return refuse(r.refusal);
    const checked = guard(() => cleanListRule(r.rule, kept, list.id));
    if ("refused" in checked) return refuse(checked.refused);
    rule = r.rule;
  }
  if (!name && !rule) return refuse("change takes a new name, new conditions (all), or both");
  let holds = "";
  if (rule) {
    const pool = (await load(t.rc, audiencePool, undefined)).data;
    const on = listMembers({ ids: [], rule }, pool.rows, pool.listCtx);
    holds =
      on.state === "ok"
        ? ` — ${plural(on.ids.size, "person", "people")} on it today`
        : ` — ${listUnknownWords(on.reason, pool.calendar.state)}`;
  }
  const cannot = str(input.cannot, LEFT_OUT.maxLength ?? 120);
  return propose({
    kind: "list_change",
    title: name ? `Rename ${list.name}` : `Change ${list.name}`,
    summary: `${name ? `${list.name} → ${name}` : list.name}${rule ? ` · ${listRuleParts(rule).join(" · ")}` : ""}${holds}${cannot ? `. Left out: ${cannot}` : ""}`,
    payload: {
      list_id: list.id,
      was_name: list.name,
      ...(name ? { name } : {}),
      ...(rule ? { rule } : {}),
      was: { name: list.name, ...(rule ? { rule: list.rule } : {}) },
    },
  });
}

/** A list of the workspace's own taken down (DELETE segments/:id): deleted, or archived where something depends on it. */
async function proposeListDelete(t: ToolContext, input: { list_id: string }): Promise<ProposalOutcome> {
  const id = str(input.list_id, 40);
  const kept = (await load(t.rc, listsReader, undefined)).data.lists;
  const list = kept.find((l) => l.id === id && !l.archived_at);
  if (!list) return refuse("list_id must be one of the workspace's own lists (people with action lists)");
  return propose({
    kind: "list_delete",
    title: `Delete ${list.name}`,
    summary:
      "The people stay. Where a campaign runs on it or another list reads it, it is archived instead, and that says so.",
    payload: { list_id: list.id, name: list.name },
  });
}

/**
 * A new list kept by hand, as People's New list makes one: its name, and the people a read returned put on it once it is
 * made (contracts listSpec's `then`), each named on the card; none, a list they fill from People later.
 */
async function proposeHandList(t: ToolContext, name: string, asked: string[]): Promise<ProposalOutcome> {
  if (asked.length > LIST_BATCH_MAX)
    return refuse(`a new list kept by hand starts with at most ${LIST_BATCH_MAX}; put the rest on it after`);
  const who = asked.length ? await selected(t, { ids: asked }) : { ids: [] as string[] };
  if ("refusal" in who) return refuse(who.refusal);
  const pool = who.ids.length ? (await load(t.rc, audiencePool, undefined)).data : null;
  const byId = new Map((pool?.rows ?? []).map((r) => [r.id, r.name]));
  const names = who.ids.map((id) => byId.get(id) ?? "").filter(Boolean);
  // A few people by name, as a card names whom it acts on; more, how many.
  const named = names.length === who.ids.length && names.length <= 3;
  return propose({
    kind: "list",
    title: `List: ${name}`,
    summary: !who.ids.length
      ? "Kept by hand, with nobody on it yet: people are put on it from their page or People"
      : named
        ? `Kept by hand: ${names.join(", ")}`
        : `Kept by hand, starting with ${plural(who.ids.length, "person", "people")}`,
    payload: { name, kept: "hand", ids: who.ids, names, count: who.ids.length },
  });
}

async function proposeList(
  t: ToolContext,
  input: { name: string; all?: unknown[]; ids?: string[]; cannot: string },
): Promise<ProposalOutcome> {
  const named = guard(() => cleanListName(input.name));
  if ("refused" in named) return refuse(named.refused);
  const name = named.ok;
  const left = LEFT_OUT.safeParse(input.cannot);
  if (!left.success) return refuse(`cannot is a few words, at most ${LEFT_OUT.maxLength} characters`);
  const cannot = left.data;
  const all = input.all ?? [];
  const ids = [...new Set((input.ids ?? []).map((x) => str(x, 40)).filter(Boolean))];
  if (all.length && ids.length)
    return refuse("a list keeps itself by its rule (all) or is kept by hand (ids), never both: make one of them");
  // Neither said: no list of everyone (People has Everyone), and an empty one kept by hand only where ids says so.
  if (!all.length && input.ids === undefined) return refuse(NO_ONE_NAMED);
  // The rule this turn's model wrote, read strictly as a stored rule is (contracts asListRule), its nulls aside. No second
  // model call (the Phase 4 plan, D10). Not as the drafter's answer is (draftListRule, which cuts each fact to the keys
  // its field reads): the drafter's structured output holds it to the schema, and Ask's tools are not strict, so a key a
  // field does not take ("service": "balayage") or a fact beside an any group would be dropped into a broader list.
  // A draft never reads another list: the vocabulary's own rule, which its schema says by leaving the field out.
  const r = all.length ? ruleOf(all) : null;
  if (r && "refusal" in r) return refuse(r.refusal);
  // The workspace's own lists, as People's rail reads them (readers/lists.ts), once a turn: a name a live one has is the
  // route's refusal (00169: an archived list's name is free), and a rule is checked against them as the route checks it.
  const kept = (await load(t.rc, listsReader, undefined)).data.lists;
  if (kept.some((l) => !l.archived_at && l.name.toLowerCase() === name.toLowerCase()))
    return refuse(`${LIST_NAME_TAKEN} Read people with action lists: it may say this already, or take another name`);
  // No rule: kept by hand, as People's New list makes one, with the people they named.
  if (!r) return proposeHandList(t, name, ids);
  const rule = r.rule;
  const checked = guard(() => cleanListRule(rule, kept));
  if ("refused" in checked) return refuse(checked.refused);
  // Who is on it today, counted as people.lists counts the workspace's own lists: over the audience pool (everyone, for
  // the member asking, as a send counts them), or why it cannot be counted here, in the rail's words.
  const pool = (await load(t.rc, audiencePool, undefined)).data;
  const on = listMembers({ ids: [], rule }, pool.rows, pool.listCtx);
  const holds =
    on.state === "ok"
      ? `${plural(on.ids.size, "person", "people")} on it today, and it keeps itself current`
      : listUnknownWords(on.reason, pool.calendar.state);
  // The rail's words why it cannot be counted end a sentence of their own; the count's does not.
  const said = cannot ? `${/[.!?]$/.test(holds) ? holds : `${holds}.`} Left out: ${cannot}` : holds;
  return propose({
    kind: "list",
    title: `List: ${name}`,
    // The rule as People's chips, who it holds, and what it left out, as the People page's draft says each.
    summary: `${listRuleParts(rule).join(" · ")} — ${said}`,
    payload: { name, rule, cannot, ...(on.state === "ok" ? { count: on.ids.size } : {}) },
  });
}

/**
 * A list on People, kept current by its rule (the Phase 4 plan, D10): the rule written by this turn's model in the list
 * vocabulary -- the drafter's own facts, `all` as the tools say it (contracts LIST_CONDITIONS_JSON_SCHEMA) and its
 * lines (server/people/lists.ts LIST_RULE_LINES) -- and checked by the route's guards before a card is shown.
 */
const LIST_ID = z.string().describe("A list of the workspace's own: its id from people with action lists.");
const ALL = z.array(z.unknown()).meta(LIST_CONDITIONS_JSON_SCHEMA);

/**
 * People's lists (D11, the operator, 15 Oct 2026): a new list (make, the one definition before), kept current by its rule
 * or, since the operator stress run (15 Oct 2026: "put her on a new list called Mornings" was dropped), kept by hand with
 * the people named, as People's New list makes one; one of the workspace's own renamed or its rule changed (change), or
 * taken down (delete). Putting people on or off a list kept by hand that is there is propose_people's.
 */
export const propose_list = defineActions({
  name: "propose_list",
  description: [
    [
      "Propose a list on People, as a card the person asking approves, by action: a new list, one that keeps itself current by its rule or one kept by hand with the people they name, one of the workspace's own renamed or its rule changed, or one taken down. Nothing is made until they approve.",
      "A list is an audience a sequence or a send can go to, and a line on People's rail; who is on it is counted over everyone in People, as a send counts it, and the card says how many are on it today.",
      "A rule is written in the list vocabulary:",
    ].join(" "),
    ...LIST_RULE_LINES,
    // The lines end with one, so the actions' words that follow start on a line of their own.
    "",
  ].join("\n"),
  tail: "Read people with action lists first, since a list by that name, or one that says it already, may exist. A rule the vocabulary cannot read is refused in words; what the fields cannot say goes in cannot, never in a fact. People on or off a list kept by hand: propose_people with action list.",
  actions: {
    make: actAction({
      kind: "list",
      input: z.object({
        name: z
          .string()
          .describe(`What People calls the list, at most ${LIST_NAME_MAX} characters, one no list of theirs has.`),
        // The drafter's own schema for the rule, shown to the model as it is; the builder reads it strictly (asListRule).
        all: ALL.optional(),
        ids: z
          .array(z.string())
          .optional()
          .describe("A list kept by hand: the ids of the people a read returned who start on it, in place of all."),
        cannot: z
          .string()
          .describe("What they asked that the rule cannot say, in a few words; empty when nothing was left out."),
      }),
      examples: [
        { name: "Lapsed regulars", all: [{ field: "last_visit", op: "more_than", days: 60 }], cannot: "regulars" },
        {
          name: "Texters who said yes",
          all: [
            {
              any: [
                { field: "channel", op: "is", channel: "sms" },
                { field: "channel", op: "is", channel: "whatsapp" },
              ],
            },
            { field: "said_yes", op: "is", to: "offers", yes: true },
          ],
          cannot: "",
        },
        {
          name: "Family",
          ids: ["a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e"],
          cannot: "",
        },
      ],
      label: "Preparing a list",
      words:
        "Action make takes name and either all (its rule) and cannot, for a new list that keeps itself current, or ids, for a new list kept by hand that starts with the people a read returned ([] for an empty one they fill on People), as People's New list makes one. Call it when they want a group of people kept together, to look at or to send to later: by a rule where what they describe is one, by hand where they name the people.",
      build: proposeList,
    }),
    change: actAction({
      kind: "list_change",
      input: z.object({
        list_id: LIST_ID,
        name: z.string().optional().describe("Its new name."),
        all: ALL.optional(),
        cannot: z.string().optional().describe("What the new rule cannot say, in a few words."),
      }),
      examples: [{ list_id: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b", name: "Regulars (90 days)" }],
      label: "Preparing the list change",
      words:
        "Action change renames one of the workspace's own lists, changes a smart list's rule (all), or both; the card says who it holds after, and its undo puts back what it was.",
      build: proposeListChange,
    }),
    delete: actAction({
      kind: "list_delete",
      input: z.object({ list_id: LIST_ID }),
      examples: [{ list_id: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b" }],
      label: "Preparing the delete",
      words:
        "Action delete takes down one of the workspace's own lists; the people stay, and one a campaign runs on, or one other lists are built from, is archived instead, which its receipt says.",
      build: proposeListDelete,
    }),
  },
});
