/** Sequences: step specs. */

import { plural } from "../../../shared/words";
import { SEQUENCES_ROUTE, sequenceRoute } from "../../../campaigns/sequences/address";
import { SEQUENCE_TEST_WORDS } from "../../../campaigns/sequences/test";
import { VOICE_PASTE_MIN, VOICE_WORDS } from "../../../campaigns/sequences/new-draft/checks";
import { MEMORY_ROUTE } from "../memory";
import { handOf } from "../../../campaigns/reach-out/hand";
import { SEQUENCE_FLOW_WORDS } from "../../../campaigns/sequences/words/flow";
import { LEAD_WORDS_BOX, type LeadEmailText } from "../../../leads/sheet/lead-sheet-words";
import {
  asText,
  decisionOf,
  idIn,
  rec,
  refuseWith,
  PROPOSAL_WORDS,
  type ProposalCall,
  type ProposalRefusal,
  type ProposalSpec,
} from "../spec";

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
export const openSequence = ({ payload }: { payload: Record<string, unknown> }): string | null => {
  const id = idIn(payload, "sequence_id");
  return id ? sequenceRoute(id) : null;
};

/** The words a payload keeps for a lead: a body, with its subject or none; none at all puts the step's back. */
const leadWordsIn = (v: unknown): LeadEmailText | null => {
  const w = rec(v);
  return typeof w.body === "string"
    ? { subject: typeof w.subject === "string" ? w.subject : null, body: w.body }
    : null;
};

/**
 * A lead's own email at a step (decision 0096), typed on their sheet, or the step's words put back. The undo puts back
 * what the door found when it wrote (its `was`): the words before, or the step's.
 */
export const sequenceLeadWordsSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "sequence_id");
    const step = idIn(pl, "step_id");
    const lead = idIn(pl, "lead_id");
    return id && step && lead
      ? {
          route: "POST sequences/[id]/steps/[step]/lead-words",
          params: { id, step },
          body: { lead_id: lead, words: leadWordsIn(pl.words) },
        }
      : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }) =>
    leadWordsIn(pl.words) ? LEAD_WORDS_BOX.saved(asText(pl.name)) : LEAD_WORDS_BOX.backAgain(asText(pl.name)),
  undo: {
    label: () => LEAD_WORDS_BOX.undo,
    window: "ten_minutes",
    record: ({ payload: pl }, data) => ({
      sequence_id: pl.sequence_id,
      step_id: pl.step_id,
      lead_id: pl.lead_id,
      name: asText(pl.name),
      words: leadWordsIn(rec(data).was),
    }),
    call: (url) => {
      const id = asText(url.sequence_id);
      const step = asText(url.step_id);
      const lead = asText(url.lead_id);
      return id && step && lead
        ? {
            route: "POST sequences/[id]/steps/[step]/lead-words",
            params: { id, step },
            body: { lead_id: lead, words: leadWordsIn(url.words) },
          }
        : refuseWith(PROPOSAL_WORDS.noUndo);
    },
    receipt: (_data, u) =>
      leadWordsIn(u.words) ? LEAD_WORDS_BOX.undone(asText(u.name)) : LEAD_WORDS_BOX.backAgain(asText(u.name)),
  },
  open: openSequence,
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
    record: (item, data) => {
      const sequence = idIn(item.payload, "sequence_id");
      const step = idIn(item.payload, "step_id") ?? (typeof rec(data).id === "string" ? asText(rec(data).id) : null);
      if (!sequence || !step) return null;
      return {
        sequence_id: sequence,
        step_id: step,
        added: !idIn(item.payload, "step_id"),
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
    record: (item, data) => {
      const was = rec(rec(data).was);
      const template = typeof was.template_id === "string" ? was.template_id : null;
      return template
        ? {
            sequence_id: item.payload.sequence_id,
            step_id: item.payload.step_id,
            template_id: template,
            params: was.params,
            decision_id: decisionOf(data),
          }
        : null;
    },
    call: (url) => {
      const id = asText(url.sequence_id);
      const step = asText(url.step_id);
      const template = asText(url.template_id);
      return id && step && template
        ? {
            route: "POST sequences/[id]/steps/[step]/words",
            params: { id, step },
            body: { template_id: template, ...(Array.isArray(url.params) ? { params: url.params } : {}) },
          }
        : refuseWith(PROPOSAL_WORDS.noUndo);
    },
    receipt: () => "The step sends its old words",
  },
  open: openSequence,
};

/**
 * Leads, said as leads: a sequence to leads takes businesses, not people. The lead sheet's Take out says so (`leads`), since
 * it names their place by its enrollment; lead ids alone say so too.
 */
const saidAsLeads = (pl: Record<string, unknown>): boolean =>
  pl.leads === true ||
  (Array.isArray(pl.lead_ids) &&
    pl.lead_ids.length > 0 &&
    !(Array.isArray(pl.enrollment_ids) && pl.enrollment_ids.length > 0));

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
    const leads = saidAsLeads(pl);
    return n === 0
      ? "Nobody was still in it"
      : `${plural(n, leads ? "lead" : "person", leads ? "leads" : "people")} taken out`;
  },
  undo: {
    label: () => "Put them back",
    window: "ten_minutes",
    record: ({ payload: pl }, data) => {
      const id = asText(rec(data).sequence_id);
      const decision = decisionOf(data);
      return id && decision && (Number(rec(data).left) || 0) > 0
        ? { sequence_id: id, decision_id: decision, ...(saidAsLeads(pl) ? { leads: true } : {}) }
        : null;
    },
    call: (u) => {
      const id = asText(u.sequence_id);
      return id ? { route: "POST sequences/[id]/return", params: { id } } : refuseWith(PROPOSAL_WORDS.noUndo);
    },
    receipt: (data, u) => {
      const back = Number(rec(data).back) || 0;
      const out = Number(rec(data).sends_out) || 0;
      if (back === 0) return "Nobody could be put back: they left or came back in since";
      const sentence = `${u.leads === true ? plural(back, "lead", "leads") : plural(back, "person", "people")} put back`;
      return out > 0
        ? `${sentence} · ${plural(out, "email", "emails")} left out ${out === 1 ? "stays" : "stay"} out`
        : sentence;
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
 * The owner's voice, read from an email they paste under New's draft to leads (POST sequences/voice, decision 0078): up
 * to three lines on how they write, kept in Ask's memory, where Settings › Memory lists and forgets them, so nothing
 * here undoes it. The receipt says what was kept; Open goes to Memory.
 */
export const sequenceVoiceSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const text = asText(pl.text).trim();
    return text.length >= VOICE_PASTE_MIN
      ? { route: "POST sequences/voice", body: { text } }
      : refuseWith(VOICE_WORDS.tooShort);
  },
  receipt: (_p, data) => {
    const d = rec(data);
    return d.full === true ? VOICE_WORDS.full : VOICE_WORDS.kept(Array.isArray(d.lines) ? d.lines.length : 0);
  },
  open: () => MEMORY_ROUTE,
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
