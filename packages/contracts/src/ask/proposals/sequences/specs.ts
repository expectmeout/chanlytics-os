/** Sequences: specs. */

import { plural } from "../../../shared/words";
import { REACH_OUT_DECISIONS, REACH_OUT_SAID_OUTCOMES } from "../../../campaigns/reach-out/dtos";
import { toSendSaidWords } from "../../../campaigns/reach-out/approval";
import { SEQUENCES_ROUTE, runRoute, sequenceRoute } from "../../../campaigns/sequences/address";
import { leadsRoute } from "../../../leads/plan";
import { REWRITE_WORDS, rewroteWords, theirsOf, type RewroteOpening } from "../../../campaigns/sequences/held";
import {
  asText,
  decisionOf,
  idIn,
  rec,
  refuseWith,
  uniqueIds,
  PROPOSAL_WORDS,
  type ProposalSpec,
  LEAD_OPERATION_UNDO,
} from "../spec";
import { openSequence } from "./step-specs";

/**
 * A draft started: its first step runs, through the campaign's own door (PUT playbooks/:id, its change_playbook line), so
 * the sequence is on (00442 sequence_state_of). The undo pauses it; it is never a draft again, having been on.
 */
export const sequenceStartSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "sequence_id");
    return id
      ? { route: "PUT playbooks/[id]", params: { id }, body: { state: "running" } }
      : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }) => (asText(pl.name) ? `“${asText(pl.name)}” is on` : "The sequence is on"),
  undo: {
    label: () => "Pause it",
    window: "ten_minutes",
    record: (p, data) => {
      const id = idIn(p.payload, "sequence_id");
      return id ? { sequence_id: id, decision_id: decisionOf(data) } : null;
    },
    call: (u) => {
      const id = asText(u.sequence_id);
      return id
        ? { route: "PUT playbooks/[id]", params: { id }, body: { state: "paused" } }
        : refuseWith(PROPOSAL_WORDS.noUndo);
    },
    receipt: () => "Paused",
  },
  open: openSequence,
};

/**
 * Ask's draft of a new sequence from the owner's line (POST sequences/draft): nothing is made, so nothing undoes it; the
 * pane that asked shows it, and keeping it is `sequence_make`.
 */
export const sequenceDraftSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const words = asText(pl.words);
    if (!words) return refuseWith("Say what it should do.");
    const before = rec(pl.previous);
    const previous =
      typeof before.name === "string" && typeof before.steps === "number"
        ? { previous: { name: before.name, steps: before.steps } }
        : {};
    // The choices already made, which Ask keeps (decision 0065): the kind, the audience, and who.
    const kept = Object.fromEntries(
      ["kind", "audience", "who"].filter((k) => pl[k] !== undefined).map((k) => [k, pl[k]]),
    );
    return { route: "POST sequences/draft", body: { words, ...kept, ...previous } };
  },
  receipt: () => "Drafted",
  open: () => `${SEQUENCES_ROUTE}/new`,
};

/**
 * New's draft, kept or started (POST sequences/new, decision 0065): a sequence or a message sent once, to people or to
 * leads. Its receipt says what it is now: a draft that sends nothing, a sequence on, or a one-off on its way.
 */
export const sequenceNewSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    if (!Array.isArray(pl.steps) || pl.steps.length === 0) return refuseWith("Add a step.");
    return { route: "POST sequences/new", body: pl };
  },
  receipt: ({ payload: pl }, data) => {
    const name = asText(pl.name).trim();
    const state = rec(data).state;
    if (state === "draft") return `“${name}” is a draft: nothing goes yet`;
    return pl.kind === "once" && pl.audience !== "leads" ? `“${name}” is on its way` : `“${name}” is on`;
  },
  made: (_p, data) => asText(rec(data).made) || null,
  open: (_p, outcome) => (outcome?.made?.id ? sequenceRoute(outcome.made.id) : SEQUENCES_ROUTE),
};

/** Where a lead verb's Open goes: the sequence's Leads tab. */
const openLeads = ({ payload }: { payload: Record<string, unknown> }): string | null => {
  const id = idIn(payload, "sequence_id");
  return id ? sequenceRoute(id, "people") : null;
};

/**
 * Leads added to a sequence to leads (00426 reach_out_add, 00459 one road: every sequence to leads holds its list, a draft
 * too): the one verb Add is, from the lead sheet, the picker, the bulk bar and Ask. The add sends nothing: its next
 * batch plans the first email and waits for your OK (one carrying leads you added asks first). Undo takes them back off
 * its list while nothing has left for them (lead_undo).
 */
export const sequenceAddSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "sequence_id");
    const leads = uniqueIds(pl.lead_ids);
    return id && leads.length > 0
      ? { route: "POST sequences/[id]/leads", params: { id }, body: { lead_ids: leads } }
      : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }, data) => {
    const added = Number(rec(data).added ?? 0);
    const name = asText(pl.name) || "the sequence";
    const lead = asText(pl.lead_name);
    const draft = pl.draft === true ? " (draft)" : "";
    if (added === 0) return `None could be added to ${name}`;
    return added === 1 && lead
      ? `Added ${lead} to ${name}${draft}`
      : `Added ${plural(added, "lead", "leads")} to ${name}${draft}`;
  },
  undo: {
    label: () => "Undo",
    ...LEAD_OPERATION_UNDO,
  },
  open: openLeads,
};

/**
 * A lead nothing was sent to, out of the sequence it stands in and into this one (00459 sequence_move): one press, the
 * lead sheet's Move to. Undo moves it back the same way, while nothing has been sent to it there.
 */
export const sequenceMoveSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "sequence_id");
    const lead = idIn(pl, "lead_id");
    return id && lead
      ? { route: "POST sequences/[id]/move", params: { id }, body: { lead_id: lead } }
      : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }) => `${asText(pl.lead_name) || "The lead"} moved to ${asText(pl.name) || "the sequence"}`,
  undo: {
    label: () => "Move back",
    window: "ten_minutes",
    record: (p, data) => {
      const from = asText(rec(data).from);
      const lead = idIn(p.payload, "lead_id");
      return from && lead ? { sequence_id: from, lead_id: lead } : null;
    },
    call: (u) => {
      const id = asText(u.sequence_id);
      const lead = asText(u.lead_id);
      return id && lead
        ? { route: "POST sequences/[id]/move", params: { id }, body: { lead_id: lead } }
        : refuseWith(PROPOSAL_WORDS.noUndo);
    },
    receipt: () => "Moved back",
  },
  open: openLeads,
};

/**
 * Where a search's Add goes (00459 lead_search_aim): a sequence to leads, or none, kept on the search so a desk, a phone
 * and a teammate agree. Undo puts back the pick it had (`was`).
 */
export const leadSearchAimSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const search = idIn(pl, "search_id");
    return search
      ? { route: "POST lead-searches/[id]/aim", params: { id: search }, body: { sequence_id: idIn(pl, "sequence_id") } }
      : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }) => (asText(pl.name) ? `Adds go to ${asText(pl.name)}` : "Adds go nowhere yet"),
  undo: {
    label: () => "Undo",
    window: "ten_minutes",
    record: (p) => {
      const search = idIn(p.payload, "search_id");
      return search ? { search_id: search, was: idIn(p.payload, "was") } : null;
    },
    call: (u) => {
      const search = asText(u.search_id);
      return search
        ? { route: "POST lead-searches/[id]/aim", params: { id: search }, body: { sequence_id: idIn(u, "was") } }
        : refuseWith(PROPOSAL_WORDS.noUndo);
    },
    receipt: () => "The pick is as it was",
  },
  open: ({ payload }) => leadsRoute({ searchId: idIn(payload, "search_id"), list: "all", cls: null }),
};

/** A sequence that never sent, taken away whole: a draft let go. Nothing undoes it; one that sent is paused instead. */
export const sequenceDiscardSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "sequence_id");
    return id ? { route: "DELETE sequences/[id]", params: { id } } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: () => "The draft is gone",
  open: () => SEQUENCES_ROUTE,
};

/**
 * A customer's sequence that has sent, ended for good (the loop review's item 10, End it): its first step goes through the
 * campaign's own door (DELETE playbooks/:id), so it sends nothing more and nobody is added to it; what it sent stays in its
 * History. Nothing undoes it. A sequence to leads is paused instead: the door refuses it in its own words.
 */
export const sequenceEndSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "sequence_id");
    return id ? { route: "DELETE playbooks/[id]", params: { id } } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }) => (asText(pl.name) ? `“${asText(pl.name)}” has ended` : "It has ended"),
  open: openSequence,
};

/** Where a send's verb opens: the run that holds the email, its sheet in Sent (`run_id`), or nowhere it was not named. */
const openRun = ({ payload }: { payload: Record<string, unknown> }): string | null => {
  const run = idIn(payload, "run_id");
  return run ? runRoute(run) : null;
};

/** What deciding a held email did, by the answer given: said with the business's name where the press carries it. */
const DECIDED: Record<(typeof REACH_OUT_DECISIONS)[number], (name: string) => string> = {
  include: (name) => `${theirsOf(name)} email goes as written`,
  rewrite: (name) => rewroteWords(name, null),
  skip: (name) => `${name} is left out of this batch`,
  not_a_fit: (name) => `${name} is set aside: not a fit`,
};

/** The opening an email stands with, as POST reach-out-sends/check and Undo answer it (ReachOutOpeningDto); null where none. */
function openingOf(sent: unknown): RewroteOpening | null {
  const o = rec(sent);
  return typeof o.written === "boolean"
    ? { written: o.written, held: asText(o.held) || null, paused: o.paused === true }
    : null;
}

/**
 * An email the check held, decided (R18, 00211 reach_out_send_decide): it goes as it is, its opening is written again, it
 * is left out of its batch, or its business is set aside as not a fit. The run's sheet in Sent and a sequence's People
 * press the same door. A rewrite may say what should change (`change`, 00505), and its opening is written at once by
 * the second call (POST reach-out-sends/check), whose answer the receipt says; a page that shows the check's steps as it
 * goes asks for it itself (`check: false`). Its undo puts back the opening it replaced while the email waits. The other
 * answers have none: an email let go may already be on its way.
 */
export const sequenceSendDecideSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "send_id");
    const decision = REACH_OUT_DECISIONS.find((d) => d === pl.decision);
    const change = decision === "rewrite" ? asText(pl.change).trim() : "";
    return id && decision
      ? { route: "POST reach-out-sends/[id]/decide", params: { id }, body: { decision, ...(change ? { change } : {}) } }
      : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  then: ({ payload: pl }) => {
    const id = idIn(pl, "send_id");
    return pl.decision === "rewrite" && id && pl.check !== false
      ? { route: "POST reach-out-sends/check", body: { send_ids: [id] } }
      : null;
  },
  receipt: ({ payload: pl }, _data, then) => {
    const decision = REACH_OUT_DECISIONS.find((d) => d === pl.decision) ?? "include";
    const name = asText(pl.name) || "The business";
    if (decision !== "rewrite") return DECIDED[decision](name);
    const sent = then && then.ok ? rec(then.data).sends : null;
    return rewroteWords(name, Array.isArray(sent) ? openingOf(sent[0]) : null);
  },
  undo: {
    label: ({ payload: pl }) => (pl.decision === "rewrite" ? REWRITE_WORDS.undo : null),
    window: "ten_minutes",
    // The opening it replaced is the database's to put back, or to refuse in its words where there is none.
    record: ({ payload: pl }) => {
      const id = idIn(pl, "send_id");
      return pl.decision === "rewrite" && id ? { send_id: id, name: asText(pl.name) } : null;
    },
    call: (u) => {
      const id = asText(u.send_id);
      return id
        ? { route: "POST reach-out-sends/[id]/undo-rewrite", params: { id } }
        : refuseWith(PROPOSAL_WORDS.noUndo);
    },
    receipt: (data, u) => {
      const name = asText(u.name) || "The business";
      return openingOf(rec(data).rewritten)?.held
        ? `${theirsOf(name)} earlier opening is back, held as it was`
        : `${theirsOf(name)} earlier opening is back`;
    },
  },
  open: openRun,
};

/**
 * The owner's word on an email handed to them to send from their own inbox (00429 reach_out_send_said): it went, or it
 * did not. Said once; a second word answers how it stands, which the receipt says (contracts toSendSaidWords).
 */
export const sequenceSendSaidSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "send_id");
    const outcome = REACH_OUT_SAID_OUTCOMES.find((o) => o === pl.outcome);
    return id && outcome
      ? { route: "POST reach-out-sends/[id]/said", params: { id }, body: { outcome } }
      : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }, data) => {
    const a = rec(data);
    return toSendSaidWords(asText(pl.name) || "The business", {
      said: a.said === true,
      state: asText(a.state),
      reason: asText(a.reason),
      since: asText(a.since),
      on_thread: a.on_thread === true,
    });
  },
  open: openRun,
};
