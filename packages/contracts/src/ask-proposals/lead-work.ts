/**
 * The lead workbench's cards and a cold email's (the operator, 15 Oct 2026): a lead's stage or a call's outcome, the marks
 * a search's leads take, Later, many leads at once, the address checked again, who a company's email goes to, leads
 * chosen into a list of their own, a search's new round, a cold email sequence over a search or a list, and what a
 * business wrote back to an email its owner sent. Each is a door Leads or Reach out already presses (their routes'
 * own bodies), so a card and a press make the same call; a lead door answers its own sentence (`toast`), which the
 * receipt says, and an operation id and version, which its undo takes back (`lead_undo`).
 */
import { leadsRoute } from "../leads/lead-plan";
import { SEQUENCES_ROUTE, sequenceRoute } from "../sequences/sequence-address";
import {
  PROPOSAL_WORDS,
  asText,
  idIn,
  rec,
  refuseWith,
  type ProposalCall,
  type ProposalSpec,
  type ProposalSpecAboveOperator,
  type ProposalUndo,
  oneOrMany,
  uniqueIds,
} from "./spec";

/** Where a lead's card opens: Leads, with the lead open, in the search it was worked in where the card names one. */
const openLead = ({ payload: pl }: { payload: Record<string, unknown> }): string => {
  const id = idIn(pl, "lead_id");
  return id ? leadsRoute({ searchId: idIn(pl, "search_id"), list: "all", cls: null, peek: id }) : "clients/leads";
};

/** The ids a payload names, as text, each once. */

/** A door's own sentence for what it did (`toast`), the receipt every lead door answers with; else the card's words. */
const toastOr = (data: unknown, words: string): string => asText(rec(data).toast) || words;

/**
 * The undo every lead operation offers (POST lead-operations/:id/undo, `lead_undo`): by the operation the door answered
 * and the version it wrote, while nothing has moved the lead since. A stage that made a person keeps none (§9.6): its
 * door answers `undo: null`.
 */
const leadOpUndo: ProposalUndo = {
  label: () => "Undo",
  window: "ten_minutes",
  record: (_p, data) => {
    const d = rec(data);
    if (d.undo === null) return null;
    const u = rec(d.undo);
    const op = typeof u.op_id === "string" ? u.op_id : typeof d.op_id === "string" ? d.op_id : null;
    return op ? { op_id: op, version: Number(u.version ?? d.version ?? 0) } : null;
  },
  call: (u) => ({
    route: "POST lead-operations/[id]/undo",
    params: { id: asText(u.op_id) },
    body: { version: Number(u.version ?? 0) },
  }),
  receipt: () => "Put back as it was",
};

/**
 * A lead's stage, a call's outcome, "Did you send it?" or Not a fit (POST leads/:id/stage, the page's one door for them):
 * the body is LeadStageInput as the builder checked it. An operator's: working a lead spends nothing.
 */
export const leadStageSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) =>
    idIn(pl, "lead_id") && pl.input && typeof pl.input === "object"
      ? { route: "POST leads/[id]/stage", params: { id: asText(pl.lead_id) }, body: pl.input }
      : refuseWith(PROPOSAL_WORDS.cannotApprove),
  receipt: ({ payload: pl }, data) => toastOr(data, `${asText(pl.who) || "The lead"} moved`),
  undo: leadOpUndo,
  open: openLead,
};

/** The marks a partner's door sets on a search's leads: keep, set aside, put back. */
const LEAD_MARK_DOORS = {
  keep: "POST leads/[id]/keep",
  exclude: "POST leads/[id]/exclude",
  put_back: "POST leads/[id]/put-back",
} as const;
type LeadMark = keyof typeof LEAD_MARK_DOORS;
const isLeadMark = (v: unknown): v is LeadMark =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(LEAD_MARK_DOORS, v);
const LEAD_MARK_SAID: Record<LeadMark, string> = { keep: "kept", exclude: "set aside", put_back: "put back" };

/** Keep, Exclude or Put back on the leads of one search (the Needs review pile's acts): a request a lead. */
export const leadMarkSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "keep, set aside or put back a search's leads",
  gate: "find",
  commit: ({ payload: pl }) => {
    const search = idIn(pl, "search_id");
    const ids = uniqueIds(pl.lead_ids);
    if (!isLeadMark(pl.mark) || !search || !ids.length) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    const door = LEAD_MARK_DOORS[pl.mark];
    const calls: ProposalCall[] = ids.map((id) => ({ route: door, params: { id }, body: { search_id: search } }));
    return oneOrMany(calls);
  },
  gather: (answers) => ({ done: answers.length }),
  receipt: ({ payload: pl }, data) => {
    const n = Number(rec(data).done) || 1;
    const said = isLeadMark(pl.mark) ? LEAD_MARK_SAID[pl.mark] : "marked";
    return n === 1 && asText(pl.who) ? `${asText(pl.who)} ${said}` : `${n} leads ${said}`;
  },
  open: openLead,
};

/** Later: a lead set to come back to (POST leads/:id/later), an operator's. */
export const leadLaterSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) =>
    idIn(pl, "lead_id") && idIn(pl, "search_id")
      ? { route: "POST leads/[id]/later", params: { id: asText(pl.lead_id) }, body: { search_id: pl.search_id } }
      : refuseWith(PROPOSAL_WORDS.cannotApprove),
  receipt: ({ payload: pl }) => `${asText(pl.who) || "The lead"} is under Later`,
  undo: leadOpUndo,
  open: openLead,
};

/**
 * Many leads marked contacted or not a fit, or kept or set aside (POST leads/bulk): by their ids, at most 500 a request,
 * or every lead a view of Leads matches, which the door reads itself, so it reaches 1,240 and not the 500 on screen.
 */
export const leadsBulkSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const body = rec(pl.body);
    return body.by === "ids" || body.by === "view"
      ? { route: "POST leads/bulk", body }
      : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: (_p, data) => toastOr(data, `${Number(rec(data).done) || 0} leads changed`),
  undo: leadOpUndo,
  open: () => "clients/leads",
};

/** The mailbox check once more, for leads whose last check did not answer: the owner's or a partner's, since it spends. */
export const leadsCheckSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "check leads' addresses again",
  gate: "find",
  commit: ({ payload: pl }) => {
    const ids = uniqueIds(pl.lead_ids);
    return ids.length ? { route: "POST leads/check-again", body: { ids } } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: (_p, data) => toastOr(data, `${Number(rec(data).scheduled) || 0} addresses checked again`),
  open: () => "clients/leads",
};

/**
 * Who a company's email goes to (POST leads/:id/addressee): one of the people its source named, by their place in its
 * facts. Their address is checked first, a fraction of a cent, so it is the owner's or a partner's.
 */
export const leadAddresseeSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "choose who a company's email goes to",
  gate: "find",
  commit: ({ payload: pl }) =>
    idIn(pl, "lead_id") && typeof pl.person === "number"
      ? { route: "POST leads/[id]/addressee", params: { id: asText(pl.lead_id) }, body: { person: pl.person } }
      : refuseWith(PROPOSAL_WORDS.cannotApprove),
  receipt: ({ payload: pl }) => `Writes to ${asText(pl.person_name) || "them"} at ${asText(pl.who) || "the company"}`,
  open: openLead,
};

/**
 * Leads chosen into a list of their own (POST lead-searches/chosen, Leads' *Write to them*): a search of its own that a
 * cold email sequence writes to. It spends nothing: only a lead already counted joins. Its id is what a later step of a
 * plan names by its token.
 */
export const leadListSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const ids = uniqueIds(pl.lead_ids);
    return asText(pl.name) && ids.length
      ? { route: "POST lead-searches/chosen", body: { name: asText(pl.name), lead_ids: ids } }
      : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }, data) => {
    const n = Number(rec(data).counted) || 0;
    return `“${asText(pl.name)}”: ${n === 1 ? "1 lead" : `${n} leads`} to write to`;
  },
  made: (_p, data) => idIn(rec(data), "search_id"),
  open: (_p, outcome) =>
    outcome?.made?.id ? leadsRoute({ searchId: outcome.made.id, list: "all", cls: null }) : "clients/leads",
};

/** A search's new round (POST lead-searches/:id/more): a top-up, or the same search found again. It spends. */
export const leadSearchMoreSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "find more leads for a search",
  gate: "find",
  commit: ({ payload: pl }) =>
    idIn(pl, "search_id") && pl.plan && typeof pl.plan === "object"
      ? {
          route: "POST lead-searches/[id]/more",
          params: { id: asText(pl.search_id) },
          body: { purpose: pl.purpose === "renew" ? "renew" : "topup", plan: pl.plan },
        }
      : refuseWith(PROPOSAL_WORDS.cannotApprove),
  receipt: ({ payload: pl }) =>
    `${asText(pl.name) || "The search"} finds more. It carries on if you leave; Leads shows it.`,
  undo: {
    label: () => "Stop it",
    window: "ten_minutes",
    record: (p) => (idIn(p.payload, "search_id") ? { search_id: p.payload.search_id } : null),
    call: (u) => ({ route: "POST lead-searches/[id]/stop", params: { id: asText(u.search_id) } }),
    receipt: () => "Stopping. Whatever it found is kept.",
  },
  open: ({ payload: pl }) => {
    const id = idIn(pl, "search_id");
    return id ? leadsRoute({ searchId: id, list: "all", cls: null }) : "clients/leads";
  },
};

/**
 * A cold email sequence (POST reach-outs, Reach out): emails written to the businesses of a search or of a list of chosen
 * leads, from the workspace's own mailboxes (0056), its steps and their waits, its pace and who signs it. Saved whole
 * after every word is checked by the door; its first run is planned at once, and a list's run waits for the owner's say
 * before any email goes. Its id is what a later step names.
 */
export const reachOutMakeSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const chain = rec(pl.chain);
    return asText(chain.name) && asText(chain.search_id) && Array.isArray(chain.steps) && chain.steps.length
      ? { route: "POST reach-outs", body: chain }
      : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }) =>
    `“${asText(rec(pl.chain).name)}” is saved. Its first batch is planned now, and waits for your OK before an email goes.`,
  made: (_p, data) => idIn(rec(data), "root_id"),
  open: (_p, outcome) => (outcome?.made?.id ? sequenceRoute(outcome.made.id) : SEQUENCES_ROUTE),
};

/** What a business wrote back to an email its owner sent themselves, as the owner says it (00429): yes, no, not now. */
export const reachOutSaidSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) =>
    idIn(pl, "lead_id") && asText(pl.intent)
      ? {
          route: "POST reach-outs/leads/[id]/said",
          params: { id: asText(pl.lead_id) },
          body: {
            intent: pl.intent,
            ...(typeof pl.day === "string" ? { day: pl.day } : {}),
            ...(typeof pl.refer_to === "string" ? { refer_to: pl.refer_to } : {}),
          },
        }
      : refuseWith(PROPOSAL_WORDS.cannotApprove),
  receipt: ({ payload: pl }, data) =>
    rec(data).already === true
      ? "Already said: nothing was written twice"
      : `${asText(pl.who) || "The business"}: ${asText(pl.said) || asText(pl.intent)}`,
  open: openLead,
};
