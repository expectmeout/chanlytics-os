import "server-only";
import { z } from "zod";
import {
  ASK_SELECTION_MAX,
  CONSENT_SOURCES,
  LIST_DRAFT_JSON_SCHEMA,
  NOTE_LINE_MAX,
  OWN_MESSAGE_REFUSALS,
  PERSON_MODE_WORDS,
  answerSaidOf,
  offersYesRefusal,
  parseListToken,
  plural,
  proposalBelowNeeds,
} from "@chanlytics/contracts";
import { poolList } from "../../../../people/audience";
import { load } from "../../../../readers";
import { audiencePool } from "../../../../readers/audience-pool";
import { lists as listsReader } from "../../../../readers/lists";
import { ruleMembers } from "../../read/people";
import {
  AUDIENCES_CALL,
  UUID,
  actAction,
  approvalWords,
  defineActions,
  offeredTo,
  propose,
  refuse,
  str,
  type ProposalOutcome,
  type ToolContext,
} from "../../context";

/**
 * Many people at once (the operator, 15 Oct 2026, D5): the same act People's bulk bar does for a selection -- their
 * answers, the receptionist for them, a note line under each, on or off a list kept by hand -- for a selection Ask names
 * by rule, by list or by ids, resolved here over everyone in People (as a send counts them), its count on the card before
 * anything happens, at most ASK_SELECTION_MAX, and committed in the batch doors' own parts of fifty.
 */

/** A selection as the model names it: conditions in the lists' vocabulary, a list's token, or ids a read returned. */
const SELECTION = {
  all: z
    .array(z.unknown())
    .meta(LIST_DRAFT_JSON_SCHEMA.properties.all)
    .optional()
    .describe("Who: conditions in the lists' vocabulary, as people with action search and propose_list take them."),
  list: z.string().optional().describe("Who: a list's token (seg:<id>, list:<id>) or a People list's bare id."),
  ids: z.array(z.string()).optional().describe("Who: the ids of people a read returned."),
};
type Selection = { all?: unknown[]; list?: string; ids?: string[] };

/**
 * The people a selection names, each once, in People's order; or the refusal, in words the model says. A new list kept
 * by hand takes its people by their ids too (act/people/list.ts).
 */
export async function selected(
  t: ToolContext,
  s: Selection,
): Promise<{ ids: string[]; said: string } | { refusal: string }> {
  const named = [s.all?.length ? 1 : 0, s.list ? 1 : 0, s.ids?.length ? 1 : 0].reduce((a, b) => a + b, 0);
  if (named !== 1) return { refusal: "name who by exactly one of all (conditions), list (a token) or ids" };
  const pool = (await load(t.rc, audiencePool, undefined)).data;
  const inPool = new Set(pool.people.map((r) => r.id));
  let ids: string[];
  let said: string;
  if (s.all?.length) {
    const held = await ruleMembers(t, s.all);
    if ("error" in held) return { refusal: held.error };
    ids = pool.people.filter((r) => held.ids.has(r.id)).map((r) => r.id);
    said = "who the conditions hold today";
  } else if (s.list) {
    const token = str(s.list, 60);
    const ref = parseListToken(token) ?? parseListToken(`list:${token}`) ?? parseListToken(`seg:${token}`);
    if (!ref) return { refusal: `list must be a list token from ${AUDIENCES_CALL}, or a People list's id` };
    const kept = ref.kind === "saved" ? (await load(t.rc, listsReader, undefined)).data.lists : undefined;
    const found = await poolList(t.ctx, t.tenantId, pool, ref, kept);
    if (!found) return { refusal: `no such list; ${AUDIENCES_CALL} names them` };
    if ("unknown" in found) return { refusal: `${found.label}: ${found.unknown}` };
    const on = new Set(found.memberIds);
    ids = pool.people.filter((r) => on.has(r.id)).map((r) => r.id);
    said = `everyone on ${found.label}`;
  } else {
    const asked = [...new Set((s.ids ?? []).map((x) => str(x, 40)))];
    const bad = asked.filter((x) => !UUID.test(x) || !inPool.has(x));
    if (bad.length) return { refusal: `${plural(bad.length, "id is", "ids are")} not people in this workspace` };
    ids = asked;
    said = plural(ids.length, "person", "people");
  }
  if (!ids.length) return { refusal: "nobody is in that selection today: say so" };
  if (ids.length > ASK_SELECTION_MAX)
    return {
      refusal: `${ids.length} people is more than one card acts on (${ASK_SELECTION_MAX}): narrow it, or split it by a condition`,
    };
  return { ids, said };
}

const QUESTIONS = { messages: "conversational", offers: "marketing" } as const;
const ANSWERS = { yes: "opted_in", no: "opted_out", not_asked: "unknown" } as const;
// A selection is never "in their own message": one message is not every person's (OWN_MESSAGE_REFUSALS.batch).
const MANY_SOURCES = CONSENT_SOURCES.map((x) => x.id).filter((id) => id !== "customer_message") as [
  string,
  ...string[],
];

async function proposeAnswers(
  t: ToolContext,
  input: Selection & {
    question: keyof typeof QUESTIONS;
    answer: keyof typeof ANSWERS;
    how?: string;
    note?: string;
  },
): Promise<ProposalOutcome> {
  const purpose = QUESTIONS[input.question];
  const consent = ANSWERS[input.answer];
  const source = consent === "unknown" ? undefined : input.how;
  if (consent !== "unknown" && !source) return refuse("how is required for a yes or a no: in_person, phone or form");
  if (source === "customer_message") return refuse(OWN_MESSAGE_REFUSALS.batch);
  if (purpose === "marketing" && consent === "opted_in") {
    const no = offersYesRefusal(source);
    if (no) return refuse(no);
  }
  const who = await selected(t, input);
  if ("refusal" in who) return refuse(who.refusal);
  const how = source ? (CONSENT_SOURCES.find((x) => x.id === source)?.label ?? source) : null;
  return propose({
    kind: "answer_many",
    title: `${plural(who.ids.length, "person's answer", "people's answers")}`,
    summary: `${plural(who.ids.length, "person", "people")} (${who.said}) ${answerSaidOf(purpose, consent)}${how ? ` · ${how}` : ""}`,
    payload: {
      ids: who.ids,
      purpose,
      consent,
      ...(source ? { source } : {}),
      ...(input.note?.trim() ? { note: input.note.trim().slice(0, 280) } : {}),
      count: who.ids.length,
    },
  });
}

async function proposeModes(
  t: ToolContext,
  input: Selection & { mode: "auto" | "ask" | "never" | "inherit" },
): Promise<ProposalOutcome> {
  if (!offeredTo(modesAction, t.role)) return refuse(proposalBelowNeeds("person_mode_many"));
  const who = await selected(t, input);
  if ("refusal" in who) return refuse(who.refusal);
  return propose({
    kind: "person_mode_many",
    title: `Receptionist for ${plural(who.ids.length, "person", "people")}`,
    summary: `${PERSON_MODE_WORDS[input.mode] ?? input.mode} · ${who.said}`,
    payload: { ids: who.ids, mode: input.mode, count: who.ids.length },
  });
}

async function proposeNotes(t: ToolContext, input: Selection & { text: string }): Promise<ProposalOutcome> {
  const text = input.text.trim();
  if (!text) return refuse("text is the note line's words");
  if (text.length > NOTE_LINE_MAX) return refuse(`a note line is at most ${NOTE_LINE_MAX} characters`);
  const who = await selected(t, input);
  if ("refusal" in who) return refuse(who.refusal);
  return propose({
    kind: "note_many",
    title: `A note for ${plural(who.ids.length, "person", "people")}`,
    summary: `“${text}” under each one's notes · ${who.said}`,
    payload: { ids: who.ids, append: text, count: who.ids.length },
  });
}

async function proposeOnList(
  t: ToolContext,
  input: Selection & { list_id: string; put: "on" | "off" },
): Promise<ProposalOutcome> {
  const listId = str(input.list_id, 40);
  const kept = (await load(t.rc, listsReader, undefined)).data.lists;
  const target = kept.find((l) => l.id === listId && !l.archived_at);
  if (!target) return refuse("list_id must be one of the workspace's own lists (people with action lists)");
  if (target.rule != null)
    return refuse(`${target.name} keeps itself by its rule: nobody is put on it by hand; change its rule instead`);
  const who = await selected(t, input);
  if ("refusal" in who) return refuse(who.refusal);
  const on = input.put === "on";
  return propose({
    kind: "list_member",
    title: `${on ? "Put" : "Take"} ${plural(who.ids.length, "person", "people")} ${on ? "on" : "off"} ${target.name}`,
    summary: `${who.said} ${on ? "joins" : "leaves"} ${target.name}`,
    payload: {
      list_id: target.id,
      name: target.name,
      ...(on ? { add: who.ids } : { remove: who.ids }),
      count: who.ids.length,
    },
  });
}

/** The receptionist for many: an owner's, as its batch door is, named so its builder asks its role. */
const modesAction = actAction({
  kind: "person_mode_many",
  input: z.object({
    ...SELECTION,
    mode: z
      .enum(["auto", "ask", "never", "inherit"])
      .describe("auto (answers them), ask (asks a person first), never (silent), inherit (the workspace's rule)."),
  }),
  examples: [{ list: "list:6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b", mode: "ask" }],
  label: "Preparing a receptionist change",
  words: `Action mode sets how the receptionist treats everyone in a selection. ${approvalWords("person_mode_many")}.`,
  build: proposeModes,
});

export const propose_people = defineActions({
  name: "propose_people",
  description: `Propose one act for many people in People at once, as one card the person approves: their answers, the receptionist for them, a note line under each, or putting them on or off a list kept by hand. Name who by exactly one of all (conditions in the lists' vocabulary, as propose_list takes them), list (a list's token) or ids; the card counts them first, at most ${ASK_SELECTION_MAX}, and it goes in parts of fifty.`,
  tail: "Read people with action search with the same all or list first, to say who and how many. For one person, propose_person.",
  actions: {
    answer: actAction({
      kind: "answer_many",
      input: z.object({
        ...SELECTION,
        question: z
          .enum(["messages", "offers"])
          .describe("messages: about their own bookings; offers: offers and news."),
        answer: z.enum(["yes", "no", "not_asked"]).describe("What they said, or not_asked to clear it."),
        how: z.enum(MANY_SOURCES).optional().describe("How they told you: in_person, phone or form."),
        note: z.string().optional().describe("A few words kept with each answer."),
      }),
      examples: [
        { list: "list:6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b", question: "messages", answer: "yes", how: "in_person" },
      ],
      label: "Preparing their answers",
      words:
        "Action answer records the same answer for everyone in a selection, as a class signing up at the desk: only what they said. A yes to offers has to be in writing (form); never record a yes they did not give.",
      build: proposeAnswers,
    }),
    mode: modesAction,
    note: actAction({
      kind: "note_many",
      input: z.object({
        ...SELECTION,
        text: z.string().describe(`One line, at most ${NOTE_LINE_MAX} characters, added under each one's notes.`),
      }),
      examples: [{ list: "list:6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b", text: "Class of 12 Sep" }],
      label: "Preparing a note",
      words: "Action note adds one line under every selected person's notes, never replacing what is there.",
      build: proposeNotes,
    }),
    list: actAction({
      kind: "list_member",
      input: z.object({
        ...SELECTION,
        list_id: z.string().describe("A list of the workspace's own, kept by hand (people with action lists)."),
        put: z.enum(["on", "off"]).describe("on puts them on it, off takes them off."),
      }),
      examples: [
        {
          all: [{ field: "said_yes", op: "is", to: "offers", yes: true }],
          list_id: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
          put: "on",
        },
      ],
      label: "Preparing the list",
      words:
        "Action list puts a selection on a list kept by hand, or takes it off; a list kept by its rule takes nobody by hand (change its rule with propose_list instead).",
      build: proposeOnList,
    }),
  },
});
