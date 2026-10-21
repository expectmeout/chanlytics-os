import { plural } from "../shared/words.js";
import { REACH_OUT_DECISIONS, REACH_OUT_SAID_OUTCOMES } from "../reach-out/reach-out-dtos.js";
import { toSendSaidWords } from "../reach-out/reach-out-approval.js";
import { SEQUENCES_ROUTE, runRoute, sequenceRoute } from "../sequences/sequence-address.js";
import { SEQUENCE_TEST_WORDS } from "../sequences/sequence-test.js";
import { leadsRoute } from "../leads/lead-plan.js";
import { handOf } from "../reach-out/reach-out-hand.js";
import { SEQUENCE_FLOW_WORDS } from "../sequences/sequence-words.js";
import {
  asText,
  decisionOf,
  idIn,
  rec,
  refuseWith,
  uniqueIds,
  PROPOSAL_WORDS
} from "./spec.js";
const STEP_FIELDS = ["after_days", "only_if", "channels", "name"];
function stepFieldsOf(pl) {
  const hand = handOf(pl.hand);
  const kept = STEP_FIELDS.filter((k) => pl[k] !== void 0 && !(hand && k === "channels"));
  const fields = Object.fromEntries(kept.map((k) => [k, pl[k]]));
  if (hand) return { ...fields, hand };
  return pl.params !== void 0 ? { ...fields, params: pl.params } : fields;
}
const openSequence = ({ payload }) => {
  const id = idIn(payload, "sequence_id");
  return id ? sequenceRoute(id) : null;
};
export const sequenceStepSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
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
    label: ({ payload }) => idIn(payload, "step_id") ? "Put it back" : "Take it away",
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
        decision_id: decisionOf(data)
      };
    },
    call: (u) => {
      const id = asText(u.sequence_id);
      const step = asText(u.step_id);
      if (!id || !step) return refuseWith(PROPOSAL_WORDS.noUndo);
      if (u.added === true) return { route: "DELETE sequences/[id]/steps/[step]", params: { id, step } };
      const was = stepFieldsOf(rec(u.was));
      return Object.keys(was).length === 0 ? refuseWith(PROPOSAL_WORDS.noUndo) : { route: "PUT sequences/[id]/steps/[step]", params: { id, step }, body: was };
    },
    receipt: (_data, u) => u.added === true ? "The step is gone again" : "The step is as it was"
  },
  open: openSequence
};
export const sequenceStepRemoveSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "sequence_id");
    const step = idIn(pl, "step_id");
    return id && step ? { route: "DELETE sequences/[id]/steps/[step]", params: { id, step } } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: (_p, data) => {
    const n = Number(rec(data).removed) || 1;
    return n > 1 ? `${plural(n, "step", "steps")} taken away` : "The step is taken away";
  },
  open: openSequence
};
export const sequenceWordsSpec = {
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
      body: { template_id: template, ...Array.isArray(pl.params) ? { params: pl.params } : {} }
    };
  },
  receipt: (_p, data) => rec(data).waits === true ? "The new words wait for WhatsApp; the step sends its own until then" : "The step sends the new words",
  undo: {
    label: () => "Put the old words back",
    window: "ten_minutes",
    record: (p, data) => {
      const was = rec(rec(data).was);
      const template = typeof was.template_id === "string" ? was.template_id : null;
      return template ? {
        sequence_id: p.payload.sequence_id,
        step_id: p.payload.step_id,
        template_id: template,
        params: was.params,
        decision_id: decisionOf(data)
      } : null;
    },
    call: (u) => {
      const id = asText(u.sequence_id);
      const step = asText(u.step_id);
      const template = asText(u.template_id);
      return id && step && template ? {
        route: "POST sequences/[id]/steps/[step]/words",
        params: { id, step },
        body: { template_id: template, ...Array.isArray(u.params) ? { params: u.params } : {} }
      } : refuseWith(PROPOSAL_WORDS.noUndo);
    },
    receipt: () => "The step sends its old words"
  },
  open: openSequence
};
export const sequenceLeaveSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "sequence_id");
    const ids = Array.isArray(pl.enrollment_ids) ? pl.enrollment_ids.filter((x) => typeof x === "string") : [];
    const leads = Array.isArray(pl.lead_ids) ? pl.lead_ids.filter((x) => typeof x === "string") : [];
    return id && ids.length + leads.length > 0 ? {
      route: "POST sequences/[id]/leave",
      params: { id },
      body: leads.length > 0 ? { enrollment_ids: ids, lead_ids: leads } : { enrollment_ids: ids }
    } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }, data) => {
    const n = Number(rec(data).left) || 0;
    const leads = Array.isArray(pl.lead_ids) && pl.lead_ids.length > 0 && !(Array.isArray(pl.enrollment_ids) && pl.enrollment_ids.length > 0);
    return n === 0 ? "Nobody was still in it" : `${plural(n, leads ? "lead" : "person", leads ? "leads" : "people")} taken out`;
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
      return out > 0 ? `${said} \xB7 ${plural(out, "email", "emails")} left out ${out === 1 ? "stays" : "stay"} out` : said;
    }
  },
  open: openSequence
};
export const sequenceTestSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "sequence_id");
    const step = idIn(pl, "step_id");
    const lead = idIn(pl, "lead_id");
    return id && step ? {
      route: "POST sequences/[id]/steps/[step]/test",
      params: { id, step },
      ...lead ? { body: { lead_id: lead } } : {}
    } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: (_p, data) => SEQUENCE_TEST_WORDS.sent(asText(rec(data).to) || "you"),
  open: openSequence
};
export const sequenceMakeSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const first = rec(pl.first);
    if (first.starts === "leads") {
      if (!asText(first.name).trim()) return refuseWith("Name it.");
      return { route: "POST sequences", body: { first, then: [], start: pl.start === true } };
    }
    if (!idIn(first, "template_id") || typeof first.trigger !== "string")
      return refuseWith("Say what starts it and the message it sends first.");
    return {
      route: "POST sequences",
      body: { first, then: Array.isArray(pl.then) ? pl.then : [], start: pl.start === true }
    };
  },
  receipt: ({ payload: pl }, data) => {
    const first = rec(pl.first);
    const on = rec(data).state === "on";
    if (first.starts !== "leads") return on ? "The sequence is on" : "Kept as a draft: nothing goes yet";
    const name = asText(first.name).trim();
    const added = Number(rec(data).added) || 0;
    const lead = asText(pl.lead_name);
    const draft = on ? "" : " (draft)";
    if (added === 1 && lead) return `Added ${lead} to ${name}${draft}`;
    if (added > 0) return `Added ${plural(added, "lead", "leads")} to ${name}${draft}`;
    return on ? `\u201C${name}\u201D is on` : `\u201C${name}\u201D is a draft: nothing goes yet`;
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
    receipt: () => "The sequence is gone again"
  },
  made: (_p, data) => asText(rec(data).id),
  open: (_p, outcome) => outcome?.made ? sequenceRoute(outcome.made.id) : SEQUENCES_ROUTE
};
export const sequenceStartSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "sequence_id");
    return id ? { route: "PUT playbooks/[id]", params: { id }, body: { state: "running" } } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }) => asText(pl.name) ? `\u201C${asText(pl.name)}\u201D is on` : "The sequence is on",
  undo: {
    label: () => "Pause it",
    window: "ten_minutes",
    record: (p, data) => {
      const id = idIn(p.payload, "sequence_id");
      return id ? { sequence_id: id, decision_id: decisionOf(data) } : null;
    },
    call: (u) => {
      const id = asText(u.sequence_id);
      return id ? { route: "PUT playbooks/[id]", params: { id }, body: { state: "paused" } } : refuseWith(PROPOSAL_WORDS.noUndo);
    },
    receipt: () => "Paused"
  },
  open: openSequence
};
export const sequenceDraftSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const words = asText(pl.words);
    if (!words) return refuseWith("Say what it should do.");
    const before = rec(pl.previous);
    const previous = typeof before.name === "string" && typeof before.steps === "number" ? { previous: { name: before.name, steps: before.steps } } : {};
    const kept = Object.fromEntries(
      ["kind", "audience", "who"].filter((k) => pl[k] !== void 0).map((k) => [k, pl[k]])
    );
    return { route: "POST sequences/draft", body: { words, ...kept, ...previous } };
  },
  receipt: () => "Drafted",
  open: () => `${SEQUENCES_ROUTE}/new`
};
export const sequenceNewSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    if (!Array.isArray(pl.steps) || pl.steps.length === 0) return refuseWith("Add a step.");
    return { route: "POST sequences/new", body: pl };
  },
  receipt: ({ payload: pl }, data) => {
    const name = asText(pl.name).trim();
    const state = rec(data).state;
    if (state === "draft") return `\u201C${name}\u201D is a draft: nothing goes yet`;
    return pl.kind === "once" && pl.audience !== "leads" ? `\u201C${name}\u201D is on its way` : `\u201C${name}\u201D is on`;
  },
  made: (_p, data) => asText(rec(data).made) || null,
  open: (_p, outcome) => outcome?.made?.id ? sequenceRoute(outcome.made.id) : SEQUENCES_ROUTE
};
const openLeads = ({ payload }) => {
  const id = idIn(payload, "sequence_id");
  return id ? sequenceRoute(id, "people") : null;
};
export const sequenceAddSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "sequence_id");
    const leads = uniqueIds(pl.lead_ids);
    return id && leads.length > 0 ? { route: "POST sequences/[id]/leads", params: { id }, body: { lead_ids: leads } } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }, data) => {
    const added = Number(rec(data).added ?? 0);
    const name = asText(pl.name) || "the sequence";
    const lead = asText(pl.lead_name);
    const draft = pl.draft === true ? " (draft)" : "";
    if (added === 0) return `None could be added to ${name}`;
    return added === 1 && lead ? `Added ${lead} to ${name}${draft}` : `Added ${plural(added, "lead", "leads")} to ${name}${draft}`;
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
      body: { version: Number(u.version ?? 1) }
    }),
    receipt: () => "Taken back off its list. Nothing had been written to them."
  },
  open: openLeads
};
export const sequenceMoveSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "sequence_id");
    const lead = idIn(pl, "lead_id");
    return id && lead ? { route: "POST sequences/[id]/move", params: { id }, body: { lead_id: lead } } : refuseWith(PROPOSAL_WORDS.cannotApprove);
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
      return id && lead ? { route: "POST sequences/[id]/move", params: { id }, body: { lead_id: lead } } : refuseWith(PROPOSAL_WORDS.noUndo);
    },
    receipt: () => "Moved back"
  },
  open: openLeads
};
export const leadSearchAimSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const search = idIn(pl, "search_id");
    return search ? { route: "POST lead-searches/[id]/aim", params: { id: search }, body: { sequence_id: idIn(pl, "sequence_id") } } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }) => asText(pl.name) ? `Adds go to ${asText(pl.name)}` : "Adds go nowhere yet",
  undo: {
    label: () => "Undo",
    window: "ten_minutes",
    record: (p) => {
      const search = idIn(p.payload, "search_id");
      return search ? { search_id: search, was: idIn(p.payload, "was") } : null;
    },
    call: (u) => {
      const search = asText(u.search_id);
      return search ? { route: "POST lead-searches/[id]/aim", params: { id: search }, body: { sequence_id: idIn(u, "was") } } : refuseWith(PROPOSAL_WORDS.noUndo);
    },
    receipt: () => "The pick is as it was"
  },
  open: ({ payload }) => leadsRoute({ searchId: idIn(payload, "search_id"), list: "all", cls: null })
};
export const sequenceDiscardSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "sequence_id");
    return id ? { route: "DELETE sequences/[id]", params: { id } } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: () => "The draft is gone",
  open: () => SEQUENCES_ROUTE
};
export const sequenceEndSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "sequence_id");
    return id ? { route: "DELETE playbooks/[id]", params: { id } } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }) => asText(pl.name) ? `\u201C${asText(pl.name)}\u201D has ended` : "It has ended",
  open: openSequence
};
const openRun = ({ payload }) => {
  const run = idIn(payload, "run_id");
  return run ? runRoute(run) : null;
};
const theirs = (name) => /s$/i.test(name) ? `${name}'` : `${name}'s`;
const DECIDED = {
  include: (name) => `${theirs(name)} email goes as written`,
  rewrite: (name) => `${theirs(name)} opening is written again`,
  skip: (name) => `${name} is left out of this batch`,
  not_a_fit: (name) => `${name} is set aside: not a fit`
};
export const sequenceSendDecideSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "send_id");
    const decision = REACH_OUT_DECISIONS.find((d) => d === pl.decision);
    return id && decision ? { route: "POST reach-out-sends/[id]/decide", params: { id }, body: { decision } } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }) => {
    const decision = REACH_OUT_DECISIONS.find((d) => d === pl.decision) ?? "include";
    return DECIDED[decision](asText(pl.name) || "The business");
  },
  open: openRun
};
export const sequenceSendSaidSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "send_id");
    const outcome = REACH_OUT_SAID_OUTCOMES.find((o) => o === pl.outcome);
    return id && outcome ? { route: "POST reach-out-sends/[id]/said", params: { id }, body: { outcome } } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }, data) => {
    const a = rec(data);
    return toSendSaidWords(asText(pl.name) || "The business", {
      said: a.said === true,
      state: asText(a.state),
      reason: asText(a.reason),
      since: asText(a.since),
      on_thread: a.on_thread === true
    });
  },
  open: openRun
};
