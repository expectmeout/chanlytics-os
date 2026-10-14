/**
 * Say it (POST people/[id]/say; the sheets as verbs, 14 Oct 2026, step 5): a member says what happened with one person
 * in their own words, and the deal sheet's or the note sheet's fields are filled from it. One model call, in the shape
 * contracts names (people/doors/say-it.ts), counted as a person's draft is (its bucket, Ask's one daily budget); what
 * comes back is kept field by field by each field's own rule, and nothing is written: the sheet is filled, and its Save
 * is the member's, through the verb it always commits.
 *
 * The person is read as their page reads them, on the member's own session (readers/person.ts), so the model is told
 * their name and the services their deals name, and the business's services and today in its own zone, so "Friday"
 * is a day. An amount the member's words did not say is never kept: a model that adds one cannot put a price on a deal.
 */
import "server-only";
import {
  SAY_IT_DEAL_JSON_SCHEMA,
  SAY_IT_NOTE_JSON_SCHEMA,
  SayItDealAnswerSchema,
  SayItNoteAnswerSchema,
  dealFill,
  noteFill,
  parseTenantConfig,
  toPersonVM,
  zoneDayKey,
  type SayItDto,
  type SayItInput,
} from "@chanlytics/contracts";
import { askForJson } from "../model-json";
import { load, type ReaderContext } from "../readers";
import * as facts from "../readers/facts";
import { person } from "../readers/person";

const DEAL_RULES = [
  "You fill in a deal's form from what a member of a business's team said about one of their customers.",
  'Use only what they said. Give "" for every field they did not say.',
  "service: what the deal is for, as they named it; one of the business's services where it is plainly that one.",
  "value: the amount, as digits alone: no currency sign, no separators (1,200 is 1200).",
  "per: once, month or year, only when they said how often it is paid.",
  "link: the proposal's web address, only when they gave one.",
  "valid_until: the last day the proposal stands, as YYYY-MM-DD, worked out from today when they named a day.",
  "lost_reason: price, timing, elsewhere, no_reply, not_a_fit or other, only when they said why the customer passed.",
  "note: anything else they said worth keeping on the deal, in a few words.",
];

const NOTE_RULES = [
  "You write a note about one customer from what a member of a business's team said.",
  "body: the note in their words, tidied into one or two short sentences. Never add what they did not say.",
  'day: when they said something is to be done on a day ("call back Friday"), that day as YYYY-MM-DD, worked out from today; otherwise "".',
  "team_only: true for the team's own reminder or judgment; false for a fact about the customer that whoever answers them should know first (a preference, a name they go by).",
];

/** The digits of a text, every separator gone: "1,200" and "1200" are one amount. */
const digitsIn = (s: string) => s.replace(/[^0-9]/g, "");

/** What the model is told besides the words: today in the business's zone, the person, the business's services. */
function knownOf(o: { today: string; weekday: string; name: string; theirs: string[]; services: string[] }): string {
  return [
    `Today is ${o.weekday}, ${o.today}, in the business's own time zone.`,
    `The customer: ${o.name}.`,
    o.theirs.length ? `Their deals are for: ${o.theirs.join(", ")}.` : "They have no deal yet.",
    o.services.length ? `The business's services: ${o.services.join(", ")}.` : null,
  ]
    .filter((x): x is string => !!x)
    .join("\n");
}

/** The route's handle: the person and the business as their pages read them, one model call, and what is kept of it. */
export async function sayIt(rc: ReaderContext, id: string, input: SayItInput): Promise<SayItDto> {
  const [read, config, names] = await Promise.all([
    load(rc, person, { id }),
    load(rc, facts.config, undefined),
    load(rc, facts.facts, undefined),
  ]);
  const zone = names.data.timezone;
  const vm = toPersonVM(read.data.person, zone, rc.now, rc.userId);
  const brain = parseTenantConfig(config.data?.config ?? null)?.brain;
  const known = knownOf({
    today: zoneDayKey(rc.now.getTime(), zone),
    weekday: new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long" }).format(rc.now),
    name: vm.name,
    theirs: [...new Set((vm.deals ?? []).map((d) => d.service).filter((s): s is string => !!s))],
    // By name alone: a service's price note is never handed to the model.
    services: (brain?.profile?.services ?? []).slice(0, 12).map((s) => s.name),
  });
  const call = (rules: string[], schema: Record<string, unknown>) => ({
    tenantId: rc.tenantId,
    userId: rc.userId,
    purpose: "person_draft" as const,
    request: {
      max_tokens: 400,
      system: rules.join("\n"),
      schema,
      messages: [{ role: "user", content: `${known}\n\nWhat they said:\n${input.words}` }],
    },
  });
  if (input.verb === "note") {
    const answer = await askForJson(call(NOTE_RULES, SAY_IT_NOTE_JSON_SCHEMA), SayItNoteAnswerSchema, "note");
    return { verb: "note", note: noteFill(answer) };
  }
  const answer = await askForJson(call(DEAL_RULES, SAY_IT_DEAL_JSON_SCHEMA), SayItDealAnswerSchema, "deal");
  const deal = dealFill(answer);
  // An amount is kept only where the member said it: its digits are in their words.
  if (deal.value && !digitsIn(input.words).includes(digitsIn(deal.value.split(".")[0] ?? ""))) deal.value = "";
  return { verb: "deal", deal };
}
