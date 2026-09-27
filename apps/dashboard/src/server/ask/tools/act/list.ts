import "server-only";
import { z } from "zod";
import {
  AppError,
  LIST_DRAFT_JSON_SCHEMA,
  ListDraftAnswerSchema,
  draftListRule,
  listMembers,
  listRuleParts,
  listUnknownWords,
  plural,
  ruleLists,
} from "@chanlytics/contracts";
import { LIST_NAME_MAX, LIST_NAME_TAKEN, LIST_RULE_LINES, cleanListName, cleanListRule } from "../../../people/lists";
import { load } from "../../../readers";
import { audiencePool } from "../../../readers/audience-pool";
import { lists as listsReader } from "../../../readers/lists";
import { defineAct, propose, refuse, type ProposalOutcome, type ToolContext } from "../context";

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

async function proposeList(
  t: ToolContext,
  input: { name: string; all: unknown[]; cannot: string },
): Promise<ProposalOutcome> {
  const named = guard(() => cleanListName(input.name));
  if ("refused" in named) return refuse(named.refused);
  const name = named.ok;
  const left = LEFT_OUT.safeParse(input.cannot);
  if (!left.success) return refuse(`cannot is a few words, at most ${LEFT_OUT.maxLength} characters`);
  const cannot = left.data;
  // The rule this turn's model wrote, read as the drafter's answer is (contracts draftListRule): each fact cut to what its
  // field reads, then read strictly. No second model call (the Phase 4 plan, D10).
  if (!input.all.length) return refuse("all needs a condition: a list of everyone is Everyone, which People has");
  const rule = draftListRule(input.all);
  if (!rule)
    return refuse(
      "all is not a rule the list vocabulary reads: one to twelve conditions, each one fact with the op and value its field takes, or { any: [two to six facts] }; what the fields cannot say goes in cannot",
    );
  // A draft never reads another list: the vocabulary's own rule, which its schema says by leaving the field out.
  if (ruleLists(rule).length)
    return refuse("a list proposed here never reads another list; one that does is made on People");
  // The workspace's own lists, as People's rail reads them (readers/lists.ts), once a turn: a name a live one has is the
  // route's refusal (00169: an archived list's name is free), and the rule is checked against them as the route checks it.
  const kept = (await load(t.rc, listsReader, undefined)).data.lists;
  if (kept.some((l) => !l.archived_at && l.name.toLowerCase() === name.toLowerCase()))
    return refuse(`${LIST_NAME_TAKEN} Read people with action lists: it may say this already, or take another name`);
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
 * vocabulary -- the drafter's own shape, `all` exactly as its schema says it (contracts LIST_DRAFT_JSON_SCHEMA) and its
 * lines (server/people/lists.ts LIST_RULE_LINES) -- and checked by the route's guards before a card is shown.
 */
export const propose_list = defineAct({
  name: "propose_list",
  description: [
    [
      "Propose a new list on People that keeps itself current by its rule: a card the person asking approves, and nothing is made until they do.",
      "A list is an audience a broadcast or a playbook can go to, and a line on People's rail; who is on it is counted over everyone in People, as a send counts it, and the card says how many are on it today.",
      `It takes name, what People calls the list (at most ${LIST_NAME_MAX} characters, and one no list of theirs has), all, its rule, and cannot, what they asked that the rule cannot say, in a few words, or empty when nothing was left out: the card says it back rather than dropping it.`,
      "The rule is written in the list vocabulary:",
    ].join(" "),
    ...LIST_RULE_LINES,
    [
      "Read people with action lists first, since a list by that name, or one that says it already, may exist; campaigns with action audiences counts a list for a send.",
      "Call it when they want a group of people kept together, to look at or to send to later; a list kept by hand, people put on it one by one, is made on People.",
      "A rule the vocabulary cannot read, or one that reads another list, is refused in words.",
    ].join(" "),
  ].join("\n"),
  input: z.object({
    name: z.string(),
    // The drafter's own schema for the rule, shown to the model as it is; the builder reads it (draftListRule).
    all: z.array(z.unknown()).meta(LIST_DRAFT_JSON_SCHEMA.properties.all),
    cannot: z.string(),
  }),
  kind: "list",
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
  ],
  label: "Preparing a list",
  build: proposeList,
});
