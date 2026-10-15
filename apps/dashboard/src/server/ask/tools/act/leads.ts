import "server-only";
import { z } from "zod";
import {
  LEAD_CALL_OUTCOMES,
  LEAD_LIST_MAX,
  LEAD_NOT_A_FIT_WHYS,
  LeadStageInputSchema,
  LeadsViewSchema,
  OWNER_SAID_INTENTS,
  leadNamedPeople,
  plural,
  proposalBelowNeeds,
  type LeadRowDto,
} from "@chanlytics/contracts";
import { load } from "../../../readers";
import { lead as leadReader } from "../../../readers/leads";
import { search as searchReader } from "../../../readers/searches";
import {
  UUID,
  actAction,
  approvalWords,
  defineActions,
  offeredTo,
  propose,
  refuse,
  str,
  unlessNotFound,
  type ProposalOutcome,
  type ToolContext,
} from "../context";

/**
 * Leads, worked by card (the operator, 15 Oct 2026): every act the Leads page's workbench and its bulk bar press, and
 * what a business wrote back to an email its owner sent -- each through the page's own door (contracts lead-work.ts),
 * so a card and a press make the same call, say the door's own sentence and offer its undo. Nothing is sent to a lead
 * here: a cold email sequence is propose_sequence's, and finding leads propose_lead_search's.
 */

/** How many leads one card names by id: the bulk door's own part. */
const LEADS_PART = 500;

/** One lead a read returned, as its row says it, in the search it was worked in where one is named; or the refusal. */
async function leadOnCard(
  t: ToolContext,
  leadId: string,
  searchId?: string,
): Promise<{ row: LeadRowDto } | { refusal: string }> {
  const id = str(leadId, 40);
  if (!UUID.test(id)) return { refusal: "lead_id must be an id leads returned" };
  const search = str(searchId, 40);
  const read = await unlessNotFound(load(t.rc, leadReader, { id, ...(UUID.test(search) ? { search } : {}) }));
  if (!read) return { refusal: "no such lead in this workspace" };
  return { row: read.data.row };
}

/** Ids a read returned, each once, at most `max`; or the refusal. */
function leadIdsOf(raw: readonly string[] | undefined, max: number): { ids: string[] } | { refusal: string } {
  const ids = [...new Set((raw ?? []).map((x) => str(x, 40)))].filter((x) => UUID.test(x));
  if (!ids.length) return { refusal: "lead_ids must name at least one lead a read returned" };
  if (ids.length > max) return { refusal: `at most ${max} leads at once: narrow it, or use a view of Leads` };
  return { ids };
}

/** What a stage move is asked as, flat, and the door's own input made from it (LeadStageInput). */
type StageAsked = {
  lead_id: string;
  search_id?: string;
  move: "ready" | "nurture" | "converted" | "not_a_fit" | "said_no" | "emailed" | "call";
  why?: (typeof LEAD_NOT_A_FIT_WHYS)[number];
  outcome?: (typeof LEAD_CALL_OUTCOMES)[number];
  note?: string;
  spoke_with?: string;
};
const STAGE_SAID: Record<StageAsked["move"], string> = {
  ready: "back to Ready",
  nurture: "to Nurture",
  converted: "to a customer, in People",
  not_a_fit: "out: not a fit",
  said_no: "out: they said no",
  emailed: "emailed",
  call: "a call's outcome",
};

function stageInputOf(a: StageAsked): unknown {
  switch (a.move) {
    case "ready":
    case "nurture":
    case "converted":
      return { kind: "stage", stage: a.move };
    case "not_a_fit":
      return { kind: "not_a_fit", why: a.why ?? "other" };
    case "said_no":
      return { kind: "said_no" };
    case "emailed":
      return { kind: "emailed" };
    case "call":
      return {
        kind: "outcome",
        outcome: a.outcome,
        ...(a.note?.trim() ? { note: a.note.trim() } : {}),
        ...(a.spoke_with?.trim() ? { spoke_with: a.spoke_with.trim() } : {}),
      };
  }
}

async function proposeStage(t: ToolContext, a: StageAsked): Promise<ProposalOutcome> {
  const input = LeadStageInputSchema.safeParse(stageInputOf(a));
  if (!input.success)
    return refuse(
      a.move === "call"
        ? `outcome is required for a call: ${LEAD_CALL_OUTCOMES.join(", ")}`
        : (input.error.issues[0]?.message ?? "that move cannot be made"),
    );
  const lead = await leadOnCard(t, a.lead_id, a.search_id);
  if ("refusal" in lead) return refuse(lead.refusal);
  const r = lead.row;
  return propose({
    kind: "lead_stage",
    title: `${r.business_name}: ${STAGE_SAID[a.move]}`,
    summary:
      a.move === "call"
        ? `Call outcome: ${(a.outcome ?? "").replace(/_/g, " ")}${a.note?.trim() ? ` · “${a.note.trim()}”` : ""}`
        : `${r.business_name} moves ${STAGE_SAID[a.move]}${a.move === "converted" ? ": a person is made in People for it" : ""}`,
    payload: { lead_id: r.id, search_id: r.search_id, who: r.business_name, input: input.data },
  });
}

async function proposeMark(
  t: ToolContext,
  a: { search_id: string; lead_ids: string[]; mark: "keep" | "exclude" | "put_back" },
): Promise<ProposalOutcome> {
  if (!offeredTo(markAction, t.role)) return refuse(proposalBelowNeeds("lead_mark"));
  const searchId = str(a.search_id, 40);
  if (!UUID.test(searchId)) return refuse("search_id must be a search leads with action searches returned");
  const search = await unlessNotFound(load(t.rc, searchReader, { id: searchId }));
  if (!search) return refuse("no such search in this workspace");
  const ids = leadIdsOf(a.lead_ids, LEADS_PART);
  if ("refusal" in ids) return refuse(ids.refusal);
  const one = ids.ids.length === 1 ? await leadOnCard(t, ids.ids[0], searchId) : null;
  const who = one && "row" in one ? one.row.business_name : null;
  const said = { keep: "kept", exclude: "set aside", put_back: "put back" }[a.mark];
  return propose({
    kind: "lead_mark",
    title: `${who ?? plural(ids.ids.length, "lead", "leads")} ${said}`,
    summary: `${who ?? plural(ids.ids.length, "lead", "leads")} in “${search.data.search.name}”: ${said}`,
    payload: { search_id: searchId, lead_ids: ids.ids, mark: a.mark, ...(who ? { who } : {}) },
  });
}

async function proposeLater(t: ToolContext, a: { lead_id: string; search_id: string }): Promise<ProposalOutcome> {
  const lead = await leadOnCard(t, a.lead_id, a.search_id);
  if ("refusal" in lead) return refuse(lead.refusal);
  return propose({
    kind: "lead_later",
    title: `${lead.row.business_name}: later`,
    summary: `${lead.row.business_name} goes under Later, to come back to`,
    payload: { lead_id: lead.row.id, search_id: lead.row.search_id, who: lead.row.business_name },
  });
}

async function proposeBulk(
  t: ToolContext,
  a: {
    become: "contacted" | "not_a_fit" | "keep" | "exclude";
    lead_ids?: string[];
    search_id?: string;
    view?: unknown;
  },
): Promise<ProposalOutcome> {
  if (a.view !== undefined && a.lead_ids?.length) return refuse("name the leads by lead_ids or by a view, never both");
  if (a.view !== undefined) {
    if (a.become !== "contacted" && a.become !== "not_a_fit")
      return refuse("a view's leads are marked contacted or not_a_fit");
    const view = LeadsViewSchema.safeParse(a.view);
    if (!view.success) return refuse(`view: ${view.error.issues[0]?.message ?? "not a view of Leads"}`);
    return propose({
      kind: "leads_bulk",
      title: `Every lead the view matches: ${a.become === "contacted" ? "contacted" : "not a fit"}`,
      summary: "Every lead the view of Leads matches, not only the ones on screen; the door counts them.",
      payload: { body: { by: "view", action: a.become, view: view.data } },
    });
  }
  const ids = leadIdsOf(a.lead_ids, LEADS_PART);
  if ("refusal" in ids) return refuse(ids.refusal);
  const searchId = str(a.search_id, 40);
  if ((a.become === "keep" || a.become === "exclude") && !UUID.test(searchId))
    return refuse("keep and exclude name the search the leads were found in (search_id)");
  return propose({
    kind: "leads_bulk",
    title: `${plural(ids.ids.length, "lead", "leads")}: ${a.become.replace(/_/g, " ")}`,
    summary: `${plural(ids.ids.length, "lead", "leads")} marked ${a.become.replace(/_/g, " ")}`,
    payload: {
      body: { by: "ids", action: a.become, ids: ids.ids, ...(UUID.test(searchId) ? { search_id: searchId } : {}) },
    },
  });
}

async function proposeCheck(t: ToolContext, a: { lead_ids: string[] }): Promise<ProposalOutcome> {
  if (!offeredTo(checkAction, t.role)) return refuse(proposalBelowNeeds("leads_check"));
  const ids = leadIdsOf(a.lead_ids, LEADS_PART);
  if ("refusal" in ids) return refuse(ids.refusal);
  return propose({
    kind: "leads_check",
    title: `Check ${plural(ids.ids.length, "address", "addresses")} again`,
    summary: `The mailbox check once more, for ${plural(ids.ids.length, "lead", "leads")} whose last check did not answer; a fraction of a cent each.`,
    payload: { lead_ids: ids.ids },
  });
}

async function proposeAddressee(t: ToolContext, a: { lead_id: string; person: string }): Promise<ProposalOutcome> {
  if (!offeredTo(addresseeAction, t.role)) return refuse(proposalBelowNeeds("lead_addressee"));
  const lead = await leadOnCard(t, a.lead_id);
  if ("refusal" in lead) return refuse(lead.refusal);
  const named = leadNamedPeople(lead.row.facts);
  if (!named.length) return refuse(`${lead.row.business_name} names nobody: its email goes to the business`);
  const asked = str(a.person, 120).toLowerCase();
  const person =
    named.find((p) => p.name.toLowerCase() === asked) ?? named.find((p) => p.name.toLowerCase().includes(asked));
  if (!person)
    return refuse(`${lead.row.business_name} names ${named.map((p) => p.name).join(", ")}: choose one of them`);
  if (person.addressee) return refuse(`${person.name} is already who its email goes to`);
  return propose({
    kind: "lead_addressee",
    title: `Write to ${person.name} at ${lead.row.business_name}`,
    summary: `${person.name}${person.title ? `, ${person.title}` : ""}: their address is checked first, a fraction of a cent.`,
    payload: { lead_id: lead.row.id, person: person.at, person_name: person.name, who: lead.row.business_name },
  });
}

async function proposeLeadList(t: ToolContext, a: { name: string; lead_ids: string[] }): Promise<ProposalOutcome> {
  const name = str(a.name, 120);
  if (!name) return refuse("name is what Leads calls the list");
  const ids = leadIdsOf(a.lead_ids, LEAD_LIST_MAX);
  if ("refusal" in ids) return refuse(ids.refusal);
  return propose({
    kind: "lead_list",
    title: `A list of leads: ${name}`,
    summary: `${plural(ids.ids.length, "lead", "leads")} kept together to write to; only a lead already counted joins, so nothing is spent.`,
    payload: { name, lead_ids: ids.ids },
  });
}

const SAID_WORDS: Record<(typeof OWNER_SAID_INTENTS)[number], string> = {
  interested: "interested: they are Talking now",
  question: "a question to answer",
  not_now: "not now: they come back on their day",
  no: "no: never written to again",
  wrong_person: "the wrong person",
};

async function proposeSaid(
  t: ToolContext,
  a: { lead_id: string; intent: (typeof OWNER_SAID_INTENTS)[number]; day?: string; refer_to?: string },
): Promise<ProposalOutcome> {
  if (a.day && !/^\d{4}-\d{2}-\d{2}$/.test(a.day)) return refuse("day is YYYY-MM-DD");
  const lead = await leadOnCard(t, a.lead_id);
  if ("refusal" in lead) return refuse(lead.refusal);
  return propose({
    kind: "reach_out_said",
    title: `${lead.row.business_name} wrote back`,
    summary: `${lead.row.business_name}: ${SAID_WORDS[a.intent]}${a.day ? ` (${a.day})` : ""}${a.refer_to ? ` · write to ${a.refer_to} instead` : ""}`,
    payload: {
      lead_id: lead.row.id,
      who: lead.row.business_name,
      intent: a.intent,
      said: SAID_WORDS[a.intent],
      ...(a.day ? { day: a.day } : {}),
      ...(a.refer_to?.trim() ? { refer_to: a.refer_to.trim().slice(0, 120) } : {}),
    },
  });
}

const LEAD_ID = z.string().describe("A lead's id, from leads.");
const SEARCH_ID = z.string().describe("The search it was found in, from leads with action searches.");
const LEAD_IDS = z.array(z.string()).describe("Leads' ids, from leads.");

const markAction = actAction({
  kind: "lead_mark",
  input: z.object({
    search_id: SEARCH_ID,
    lead_ids: LEAD_IDS,
    mark: z.enum(["keep", "exclude", "put_back"]).describe("keep it, set it aside, or put it back."),
  }),
  examples: [
    {
      search_id: "9c2e4b6d-1f3a-4e5c-8b7d-0a1c2e3f4b5d",
      lead_ids: ["5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b"],
      mark: "keep",
    },
  ],
  label: "Preparing the marks",
  words: `Action mark keeps, sets aside or puts back leads of one search (its Needs review pile's acts). ${approvalWords("lead_mark")}.`,
  build: proposeMark,
});
const checkAction = actAction({
  kind: "leads_check",
  input: z.object({ lead_ids: LEAD_IDS }),
  examples: [{ lead_ids: ["5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b"] }],
  label: "Preparing the check",
  words: `Action check runs the mailbox check once more for leads whose last check did not answer; it spends a fraction of a cent each. ${approvalWords("leads_check")}.`,
  build: proposeCheck,
});
const addresseeAction = actAction({
  kind: "lead_addressee",
  input: z.object({
    lead_id: LEAD_ID,
    person: z
      .string()
      .describe("The name of one of the people the company's source named (leads with action lead says them)."),
  }),
  examples: [{ lead_id: "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b", person: "Dana Reyes" }],
  label: "Preparing who to write to",
  words: `Action addressee chooses who a company's email goes to: one of the people its source named; their address is checked first. ${approvalWords("lead_addressee")}.`,
  build: proposeAddressee,
});

export const propose_leads = defineActions({
  name: "propose_leads",
  description:
    "Propose work on leads, as a card the person approves, by action: a lead's stage or a call's outcome, keep or set aside a search's leads, Later, many leads at once, the address checked again, who a company's email goes to, leads kept as a list to write to, or what a business wrote back.",
  tail: "Read leads first for the ids. Nothing here writes to a lead: a cold email sequence over a search or a list is propose_sequence with action cold_email, and finding leads propose_lead_search.",
  actions: {
    stage: actAction({
      kind: "lead_stage",
      input: z.object({
        lead_id: LEAD_ID,
        search_id: SEARCH_ID.optional(),
        move: z
          .enum(["ready", "nurture", "converted", "not_a_fit", "said_no", "emailed", "call"])
          .describe("Where it goes: a stage, out (not_a_fit, said_no), emailed by hand, or a call's outcome."),
        why: z.enum(LEAD_NOT_A_FIT_WHYS).optional().describe("Why not a fit."),
        outcome: z.enum(LEAD_CALL_OUTCOMES).optional().describe("A call's outcome, for move call."),
        note: z.string().optional().describe("A few words about the call."),
        spoke_with: z.string().optional().describe("Who the call reached."),
      }),
      examples: [
        { lead_id: "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b", move: "call", outcome: "interested", spoke_with: "Dana" },
      ],
      label: "Preparing the lead's move",
      words:
        "Action stage moves one lead: to ready, nurture or converted (a customer, which makes a person in People), out as not_a_fit (with why) or said_no, emailed (they wrote by hand), or a call's outcome (move call, with outcome, a note and who it reached).",
      build: proposeStage,
    }),
    mark: markAction,
    later: actAction({
      kind: "lead_later",
      input: z.object({ lead_id: LEAD_ID, search_id: SEARCH_ID }),
      examples: [
        { lead_id: "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b", search_id: "9c2e4b6d-1f3a-4e5c-8b7d-0a1c2e3f4b5d" },
      ],
      label: "Preparing Later",
      words: "Action later puts one lead under Later, to come back to.",
      build: proposeLater,
    }),
    bulk: actAction({
      kind: "leads_bulk",
      input: z.object({
        become: z.enum(["contacted", "not_a_fit", "keep", "exclude"]).describe("What every one becomes."),
        lead_ids: LEAD_IDS.optional(),
        search_id: SEARCH_ID.optional(),
        view: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("A view of Leads (its search, list and filters), for every lead it matches."),
      }),
      examples: [{ become: "contacted", lead_ids: ["5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b"] }],
      label: "Preparing the leads",
      words: `Action bulk marks many leads at once: by lead_ids (at most ${LEADS_PART}), or every lead a view of Leads matches (contacted or not_a_fit), which the door counts itself.`,
      build: proposeBulk,
    }),
    check: checkAction,
    addressee: addresseeAction,
    list: actAction({
      kind: "lead_list",
      input: z.object({
        name: z.string().describe("What Leads calls the list."),
        lead_ids: LEAD_IDS,
      }),
      examples: [{ name: "Salons near you", lead_ids: ["5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b"] }],
      label: "Preparing the list of leads",
      words: `Action list keeps chosen leads (at most ${LEAD_LIST_MAX}) as a list of their own, a search a cold email sequence writes to; it spends nothing. In a plan, a cold email step names it by its token.`,
      build: proposeLeadList,
    }),
    said: actAction({
      kind: "reach_out_said",
      input: z.object({
        lead_id: LEAD_ID,
        intent: z
          .enum(OWNER_SAID_INTENTS)
          .describe("What they wrote back: interested, question, not_now, no or wrong_person."),
        day: z.string().optional().describe("For not_now, the day they named, YYYY-MM-DD."),
        refer_to: z.string().optional().describe("For wrong_person, who to write to instead."),
      }),
      examples: [{ lead_id: "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b", intent: "interested" }],
      label: "Preparing what they said",
      words:
        "Action said records what a business wrote back to an email sent by hand from the business's own inbox: interested makes it Talking (then propose a deal and a time), a no is never written to again, not_now comes back on its day.",
      build: proposeSaid,
    }),
  },
});
