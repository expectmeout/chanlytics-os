/**
 * The Sequences page's own verbs (decision 0060, 00442's doors), committed through the one walk every sheet and card
 * goes through (the sheets as verbs, PROPOSAL_SPECS): a customer's step after the first added or changed, taken away, given
 * new words, people taken out, an email the check held decided and one handed to its owner said of, and a sequence made
 * from its draft or a draft let go. Each says the same receipt and
 * offers the same undo whichever hand pressed it. A sequence's state and a batch's approval are the campaign's and the run's own verbs (`playbook_change`, `run`).
 */
import { plural } from "../shared/words";
import { REACH_OUT_DECISIONS, REACH_OUT_SAID_OUTCOMES } from "../reach-out/reach-out-dtos";
import { toSendSaidWords } from "../reach-out/reach-out-approval";
import { SEQUENCES_ROUTE, runRoute, sequenceRoute } from "../sequences/sequence-address";
import { SEQUENCE_TEST_WORDS } from "../sequences/sequence-test";
import { leadsRoute } from "../leads/lead-plan";
import { handOf } from "../reach-out/reach-out-hand";
import { SEQUENCE_FLOW_WORDS } from "../sequences/sequence-words";
import {
  asText,
  decisionOf,
  idIn,
  rec,
  refuseWith,
  uniqueIds,
  PROPOSAL_WORDS,
  type ProposalCall,
  type ProposalRefusal,
  type ProposalSpec,
} from "./spec";

/** The fields of a step a change may name, as the step door takes them; a message's values, or a call's words, apart. */
const STEP_FIELDS = ["after_days", "only_if", "channels", "name"] as const;

/**
 * A payload's step fields, those it names: a call's or a note's words where it hands them over (decision 0065 step 6),
 * else a message's values. Never both, and never a hand of null: a change's `was` names the one its step holds.
 */
function stepFieldsOf(pl: Record<string, unknown>): Record<string, unknown> {
  const hand = handOf(pl.hand);
  // A call or a note goes by no channel: its `was` names the first step's, which the door refuses on it.
  const kept = STEP_FIELDS.filter((k) => pl[k] !== undefined && !(hand && k === "channels"));
  const fields = Object.fromEntries(kept.map((k) => [k, pl[k]]));
  if (hand) return { ...fields, hand };
  return pl.params !== undefined ? { ...fields, params: pl.params } : fields;
}

/** Where every sequence verb's Open goes: the sequence's record. */
const openSequence = ({ payload }: { payload: Record<string, unknown> }): string | null => {
  const id = idIn(payload, "sequence_id");
  return id ? sequenceRoute(id) : null;
};

/**
 * A customer's step after the first (D6): added at the end where the payload names no step, else that step changed. A
 * step sends a message (`template_id`), or hands them over as a call or a note (`hand`, decision 0065 step 6). The undo
 * of an added step takes it away; of a change, puts back what the door found when it wrote (its `was`).
 */
export const sequenceStepSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }): ProposalCall | ProposalRefusal => {
    const id = idIn(pl, "sequence_id");
    if (!id) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    const step = idIn(pl, "step_id");
    if (step) return { route: "PUT sequences/[id]/steps/[step]", params: { id, step }, body: stepFieldsOf(pl) };
    if (handOf(pl.hand)) return { route: "POST sequences/[id]/steps", params: { id }, body: stepFieldsOf(pl) };
    const template = idIn(pl, "template_id");
    if (!template) return refuseWith(SEQUENCE_FLOW_WORDS.sayWhatStepDoes);
    return { route: "POST sequences/[id]/steps", params: { id }, body: { ...stepFieldsOf(pl), template_id: template } };
  },
  receipt: ({ payload: pl }, data) => {
    const place = Number(rec(data).place) || null;
    const step = place ? `Step ${place}` : "The step";
    return idIn(pl, "step_id") ? `${step} changed` : `${step} added`;
  },
  undo: {
    label: ({ payload }) => (idIn(payload, "step_id") ? "Put it back" : "Take it away"),
    window: "ten_minutes",
    record: (p, data) => {
      const sequence = idIn(p.payload, "sequence_id");
      const step = idIn(p.payload, "step_id") ?? (typeof rec(data).id === "string" ? asText(rec(data).id) : null);
      if (!sequence || !step) return null;
      return {
        sequence_id: sequence,
        step_id: step,
        added: !idIn(p.payload, "step_id"),
        was: rec(rec(data).was),
        decision_id: decisionOf(data),
      };
    },
    call: (u) => {
      const id = asText(u.sequence_id);
      const step = asText(u.step_id);
      if (!id || !step) return refuseWith(PROPOSAL_WORDS.noUndo);
      if (u.added === true) return { route: "DELETE sequences/[id]/steps/[step]", params: { id, step } };
      const was = stepFieldsOf(rec(u.was));
      return Object.keys(was).length === 0
        ? refuseWith(PROPOSAL_WORDS.noUndo)
        : { route: "PUT sequences/[id]/steps/[step]", params: { id, step }, body: was };
    },
    receipt: (_data, u) => (u.added === true ? "The step is gone again" : "The step is as it was"),
  },
  open: openSequence,
};

/** A step after the first taken away, with the steps after it. Nothing undoes it: its words and waits are gone. */
export const sequenceStepRemoveSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "sequence_id");
    const step = idIn(pl, "step_id");
    return id && step
      ? { route: "DELETE sequences/[id]/steps/[step]", params: { id, step } }
      : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: (_p, data) => {
    const n = Number(rec(data).removed) || 1;
    return n > 1 ? `${plural(n, "step", "steps")} taken away` : "The step is taken away";
  },
  open: openSequence,
};

/**
 * A step's message from now, with its values: at once, or waiting for WhatsApp while the step sends its own (`waits`).
 * The undo gives it back the message it had.
 */
export const sequenceWordsSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "sequence_id");
    const step = idIn(pl, "step_id");
    const template = idIn(pl, "template_id");
    if (!id || !step || !template) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    return {
      route: "POST sequences/[id]/steps/[step]/words",
      params: { id, step },
      body: { template_id: template, ...(Array.isArray(pl.params) ? { params: pl.params } : {}) },
    };
  },
  receipt: (_p, data) =>
    rec(data).waits === true
      ? "The new words wait for WhatsApp; the step sends its own until then"
      : "The step sends the new words",
  undo: {
    label: () => "Put the old words back",
    window: "ten_minutes",
    record: (p, data) => {
      const was = rec(rec(data).was);
      const template = typeof was.template_id === "string" ? was.template_id : null;
      return template
        ? {
            sequence_id: p.payload.sequence_id,
            step_id: p.payload.step_id,
            template_id: template,
            params: was.params,
            decision_id: decisionOf(data),
          }
        : null;
    },
    call: (u) => {
      const id = asText(u.sequence_id);
      const step = asText(u.step_id);
      const template = asText(u.template_id);
      return id && step && template
        ? {
            route: "POST sequences/[id]/steps/[step]/words",
            params: { id, step },
            body: { template_id: template, ...(Array.isArray(u.params) ? { params: u.params } : {}) },
          }
        : refuseWith(PROPOSAL_WORDS.noUndo);
    },
    receipt: () => "The step sends its old words",
  },
  open: openSequence,
};

/**
 * People taken out of a sequence: a send of theirs not yet gone is skipped with them. The undo puts them back with their
 * next step (00450 sequence_return), where still out for its reason; the sends it skipped stay skipped, and it says so.
 */
export const sequenceLeaveSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "sequence_id");
    const ids = Array.isArray(pl.enrollment_ids) ? pl.enrollment_ids.filter((x) => typeof x === "string") : [];
    // A lead on its list that nothing has been planned for yet has no place to end: it comes off the list (00455).
    const leads = Array.isArray(pl.lead_ids) ? pl.lead_ids.filter((x) => typeof x === "string") : [];
    return id && ids.length + leads.length > 0
      ? {
          route: "POST sequences/[id]/leave",
          params: { id },
          body: leads.length > 0 ? { enrollment_ids: ids, lead_ids: leads } : { enrollment_ids: ids },
        }
      : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }, data) => {
    const n = Number(rec(data).left) || 0;
    // Leads, said as leads: a sequence to leads takes businesses, not people (the lead sheet's Take out).
    const leads =
      Array.isArray(pl.lead_ids) &&
      pl.lead_ids.length > 0 &&
      !(Array.isArray(pl.enrollment_ids) && pl.enrollment_ids.length > 0);
    return n === 0
      ? "Nobody was still in it"
      : `${plural(n, leads ? "lead" : "person", leads ? "leads" : "people")} taken out`;
  },
  undo: {
    label: () => "Put them back",
    window: "ten_minutes",
    record: (_p, data) => {
      const id = asText(rec(data).sequence_id);
      const decision = decisionOf(data);
      return id && decision && (Number(rec(data).left) || 0) > 0 ? { sequence_id: id, decision_id: decision } : null;
    },
    call: (u) => {
      const id = asText(u.sequence_id);
      return id ? { route: "POST sequences/[id]/return", params: { id } } : refuseWith(PROPOSAL_WORDS.noUndo);
    },
    receipt: (data) => {
      const back = Number(rec(data).back) || 0;
      const out = Number(rec(data).sends_out) || 0;
      if (back === 0) return "Nobody could be put back: they left or came back in since";
      const said = `${plural(back, "person", "people")} put back`;
      return out > 0
        ? `${said} · ${plural(out, "email", "emails")} left out ${out === 1 ? "stays" : "stay"} out`
        : said;
    },
  },
  open: openSequence,
};

/**
 * Send me a test (W5): a customer step's message mailed to the member who pressed it, at their own address, filled for an
 * example person. Nothing reaches a customer and nothing is kept, so there is nothing to undo; the receipt names the
 * address it went to.
 */
export const sequenceTestSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "sequence_id");
    const step = idIn(pl, "step_id");
    // A lead's step is filled for the lead previewed (the draft's record's Preview as a real lead).
    const lead = idIn(pl, "lead_id");
    return id && step
      ? {
          route: "POST sequences/[id]/steps/[step]/test",
          params: { id, step },
          ...(lead ? { body: { lead_id: lead } } : {}),
        }
      : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: (_p, data) => SEQUENCE_TEST_WORDS.sent(asText(rec(data).to) || "you"),
  open: openSequence,
};

/**
 * A new sequence made whole from its draft (S4, New): its first step and the steps after it, kept as a draft or started
 * (`start`). The undo takes it away again, while it has sent nothing (sequence_discard); after that it is paused.
 */
export const sequenceMakeSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const first = rec(pl.first);
    // A sequence to leads by name (00459): a copy, Ask's words or one email still to write, on its list, a draft.
    if (first.starts === "leads") {
      if (!asText(first.name).trim()) return refuseWith("Name it.");
      return { route: "POST sequences", body: { first, then: [], start: pl.start === true } };
    }
    if (!idIn(first, "template_id") || typeof first.trigger !== "string")
      return refuseWith("Say what starts it and the message it sends first.");
    return {
      route: "POST sequences",
      body: { first, then: Array.isArray(pl.then) ? pl.then : [], start: pl.start === true },
    };
  },
  receipt: ({ payload: pl }, data) => {
    const first = rec(pl.first);
    const on = rec(data).state === "on";
    if (first.starts !== "leads") return on ? "The sequence is on" : "Kept as a draft: nothing goes yet";
    // The canvas's receipt for New, mid-pile: who went in it, and that it is a draft.
    const name = asText(first.name).trim();
    const added = Number(rec(data).added) || 0;
    const lead = asText(pl.lead_name);
    const draft = on ? "" : " (draft)";
    if (added === 1 && lead) return `Added ${lead} to ${name}${draft}`;
    if (added > 0) return `Added ${plural(added, "lead", "leads")} to ${name}${draft}`;
    return on ? `“${name}” is on` : `“${name}” is a draft: nothing goes yet`;
  },
  undo: {
    label: () => "Take it away",
    window: "ten_minutes",
    record: (_p, data) => {
      const id = asText(rec(data).id);
      return id ? { sequence_id: id, decision_id: decisionOf(data) } : null;
    },
    call: (u) => {
      const id = asText(u.sequence_id);
      return id ? { route: "DELETE sequences/[id]", params: { id } } : refuseWith(PROPOSAL_WORDS.noUndo);
    },
    receipt: () => "The sequence is gone again",
  },
  made: (_p, data) => asText(rec(data).id),
  open: (_p, outcome) => (outcome?.made ? sequenceRoute(outcome.made.id) : SEQUENCES_ROUTE),
};

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
    window: "ten_minutes",
    record: (_p, data) => {
      const d = rec(data);
      return typeof d.op_id === "string" ? { op_id: d.op_id, version: Number(d.version ?? 1) } : null;
    },
    call: (u) => ({
      route: "POST lead-operations/[id]/undo",
      params: { id: asText(u.op_id) },
      body: { version: Number(u.version ?? 1) },
    }),
    receipt: () => "Taken back off its list. Nothing had been written to them.",
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
/** A name's possessive, as the receipt says it: "Lamplight Books' email", "Persida's email". */
const theirs = (name: string) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

const DECIDED: Record<(typeof REACH_OUT_DECISIONS)[number], (name: string) => string> = {
  include: (name) => `${theirs(name)} email goes as written`,
  // Said as it is: the check writes it within the minute, and People shows it being written until it is back.
  rewrite: (name) => `${theirs(name)} opening is being written again`,
  skip: (name) => `${name} is left out of this batch`,
  not_a_fit: (name) => `${name} is set aside: not a fit`,
};

/**
 * An email the check held, decided (R18, 00211 reach_out_send_decide): it goes as it is, its opening is written again, it
 * is left out of its batch, or its business is set aside as not a fit. The run's sheet in Sent and a sequence's People
 * press the same door. Nothing to undo: an email let go may already be on its way.
 */
export const sequenceSendDecideSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "send_id");
    const decision = REACH_OUT_DECISIONS.find((d) => d === pl.decision);
    return id && decision
      ? { route: "POST reach-out-sends/[id]/decide", params: { id }, body: { decision } }
      : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }) => {
    const decision = REACH_OUT_DECISIONS.find((d) => d === pl.decision) ?? "include";
    return DECIDED[decision](asText(pl.name) || "The business");
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
