/**
 * The Sequences page's own verbs (decision 0060, 00441's doors), committed through the one walk every sheet and card
 * goes through (the sheets as verbs, VERB_SPECS): a customer's step after the first added or changed, taken away, given
 * new words, people taken out, and a sequence made from its draft or a draft let go. Each says the same receipt and
 * offers the same undo whichever hand pressed it. A sequence's state and a batch's approval are the campaign's and the run's own verbs (`playbook_change`, `run`).
 */
import { plural } from "../shared/words";
import { SEQUENCES_ROUTE, sequenceRoute } from "../sequences/sequence-address";
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
} from "./spec";

/** The fields of a step a change may name, as the step door takes them. */
const STEP_FIELDS = ["after_days", "only_if", "channels", "name", "params"] as const;

/** A payload's step fields, those it names. */
const stepFieldsOf = (pl: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(STEP_FIELDS.filter((k) => pl[k] !== undefined).map((k) => [k, pl[k]]));

/** Where every sequence verb's Open goes: the sequence's record. */
const openSequence = ({ payload }: { payload: Record<string, unknown> }): string | null => {
  const id = idIn(payload, "sequence_id");
  return id ? sequenceRoute(id) : null;
};

/**
 * A customer's step after the first (D6): added at the end where the payload names no step, else that step changed. The
 * undo of an added step takes it away; of a change, puts back what the door found when it wrote (its `was`).
 */
export const sequenceStepSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }): ProposalCall | ProposalRefusal => {
    const id = idIn(pl, "sequence_id");
    if (!id) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    const step = idIn(pl, "step_id");
    if (step) return { route: "PUT sequences/[id]/steps/[step]", params: { id, step }, body: stepFieldsOf(pl) };
    const template = idIn(pl, "template_id");
    if (!template) return refuseWith("Say which message the step sends.");
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

/** People taken out of a sequence: a send of theirs not yet gone is skipped with them. */
export const sequenceLeaveSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "sequence_id");
    const ids = Array.isArray(pl.enrollment_ids) ? pl.enrollment_ids.filter((x) => typeof x === "string") : [];
    return id && ids.length > 0
      ? { route: "POST sequences/[id]/leave", params: { id }, body: { enrollment_ids: ids } }
      : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: (_p, data) => {
    const n = Number(rec(data).left) || 0;
    return n === 0 ? "Nobody was still in it" : `${plural(n, "person", "people")} taken out`;
  },
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
    if (!idIn(first, "template_id") || typeof first.trigger !== "string")
      return refuseWith("Say what starts it and the message it sends first.");
    return {
      route: "POST sequences",
      body: { first, then: Array.isArray(pl.then) ? pl.then : [], start: pl.start === true },
    };
  },
  receipt: (_p, data) => (rec(data).state === "on" ? "The sequence is on" : "Kept as a draft: nothing goes yet"),
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
 * the sequence is on (00441 sequence_state_of). The undo pauses it; it is never a draft again, having been on.
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
    return { route: "POST sequences/draft", body: { words, ...previous } };
  },
  receipt: () => "Drafted",
  open: () => `${SEQUENCES_ROUTE}/new`,
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
