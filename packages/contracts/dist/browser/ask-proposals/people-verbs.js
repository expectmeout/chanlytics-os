import { MERGE_WORDS } from "../people/person-merge.js";
import { PERSON_MODE_WORDS } from "../people/person-receptionist.js";
import {
  PEOPLE_CHANGED,
  PROPOSAL_WORDS,
  asText,
  decisionOf,
  gatherCounts,
  idIn,
  inBatches,
  rec,
  refuseWith,
  oneOrMany,
  uniqueIds
} from "./spec.js";
const purposeOf = (v) => v === "conversational" || v === "marketing" ? v : null;
const consentIn = (v) => v === "opted_in" || v === "opted_out" ? v : "unknown";
const fieldsOf = (pl, keys) => Object.fromEntries(keys.filter((k) => pl[k] !== void 0).map((k) => [k, pl[k]]));
export function answerSaidOf(purpose, consent) {
  if (purpose === "marketing") {
    if (consent === "opted_in") return "said yes to offers and news";
    if (consent === "opted_out") return "said no to offers \u2014 other messages still reach them";
    return "has not been asked about offers";
  }
  if (consent === "opted_in") return "said yes to messages";
  if (consent === "opted_out") return "said stop \u2014 nothing goes out to them at all";
  return 'is back to "not asked"';
}
function manySaid(data, verb) {
  const d = rec(data);
  const done = typeof d.done === "number" ? d.done : 0;
  const failedRows = Array.isArray(d.failed) ? d.failed : [];
  const skipped = Array.isArray(d.skipped) ? d.skipped : [];
  const failed = failedRows.length + skipped.length;
  const why = asText(rec(failedRows[0]).message) || (skipped.length ? "no longer in this workspace" : "");
  return { done, failed, said: failed ? `${failed} could not be ${verb}${why ? ` \u2014 ${why}` : ""}` : "" };
}
function manyCalls(route, pl, fields) {
  const ids = uniqueIds(pl.ids);
  if (!ids.length) return refuseWith("Pick at least one person.");
  const rest = fieldsOf(pl, fields);
  const calls = inBatches(ids).map((part) => ({ route, body: { ...rest, ids: part }, events: [PEOPLE_CHANGED] }));
  return oneOrMany(calls);
}
const ANSWER_DOOR = {
  conversational: "PUT contacts/[id]/consent",
  marketing: "PUT contacts/[id]/marketing-consent"
};
const ANSWER_MANY_DOOR = {
  conversational: "PUT contacts/consent",
  marketing: "PUT contacts/marketing-consent"
};
const personRoute = ({ payload }) => {
  const id = idIn(payload, "contact_id");
  return id ? `clients/${id}` : null;
};
export const answerSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const purpose = purposeOf(pl.purpose);
    if (!purpose) return refuseWith("Say which question this answers.");
    return {
      route: ANSWER_DOOR[purpose],
      params: { id: asText(pl.contact_id) },
      body: fieldsOf(pl, ["consent", "source", "note", "message_id"]),
      events: [PEOPLE_CHANGED]
    };
  },
  receipt: ({ payload: pl }) => `${asText(pl.who)} ${answerSaidOf(purposeOf(pl.purpose) ?? "conversational", consentIn(pl.consent))}`,
  open: personRoute
};
export const answerManySpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const purpose = purposeOf(pl.purpose);
    if (!purpose) return refuseWith("Say which question this answers.");
    return manyCalls(ANSWER_MANY_DOOR[purpose], pl, ["consent", "source", "note"]);
  },
  gather: gatherCounts,
  receipt: ({ payload: pl }, data) => {
    const m = manySaid(data, "recorded");
    const what = purposeOf(pl.purpose) === "marketing" ? "to offers" : "to messages";
    const answer = consentIn(pl.consent);
    const head = answer === "unknown" ? `${m.done} back to "not asked"` : `${m.done} said ${answer === "opted_in" ? "yes" : "no"} ${what}`;
    return m.said ? `${head} \xB7 ${m.said}` : head;
  },
  open: () => "clients"
};
export const personModeManySpec = {
  needs: "owner",
  doing: "change how the receptionist treats these people",
  gate: "settings",
  commit: ({ payload: pl }) => manyCalls("PUT contacts/receptionist", pl, ["mode"]),
  gather: gatherCounts,
  receipt: ({ payload: pl }, data) => {
    const m = manySaid(data, "changed");
    const mode = asText(pl.mode);
    const head = `Receptionist for ${m.done}: ${PERSON_MODE_WORDS[mode] ?? asText(pl.mode)}`;
    return m.said ? `${head} \xB7 ${m.said}` : head;
  },
  open: () => "clients"
};
export const noteManySpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => manyCalls("PUT contacts/notes", pl, ["append"]),
  gather: gatherCounts,
  receipt: (_p, data) => {
    const m = manySaid(data, "noted");
    const head = `Note added for ${m.done}`;
    return m.said ? `${head} \xB7 ${m.said}` : head;
  },
  open: () => "clients"
};
export const personAddSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => ({
    route: "POST contacts",
    body: fieldsOf(pl, ["phone", "email", "name", "source"]),
    events: [PEOPLE_CHANGED]
  }),
  receipt: ({ payload: pl }, data) => {
    const who = asText(pl.name).trim() || asText(pl.phone).trim() || asText(pl.email).trim();
    return `${who} ${rec(data).existed === true ? "was already here \u2014 opened" : "added"}`;
  },
  made: (_p, data) => idIn(rec(data), "contact_id"),
  open: () => "clients"
};
export const personMergeSpec = {
  needs: "owner",
  doing: "merge two records of one person",
  gate: "settings",
  commit: ({ payload: pl }) => ({
    route: "POST contacts/[id]/merge",
    params: { id: asText(pl.contact_id) },
    body: fieldsOf(pl, ["merge"]),
    events: [PEOPLE_CHANGED]
  }),
  receipt: ({ payload: pl }) => MERGE_WORDS.done(asText(pl.who), asText(pl.other)),
  open: personRoute
};
const threadMade = (data) => idIn(rec(data), "conversation_id");
export const personMessageSpec = {
  needs: "operator",
  gate: "approve",
  commit: (p) => {
    const pl = p.payload;
    if (!idIn(pl, "contact_id") || !asText(pl.wire)) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    return {
      route: "POST people/[id]/message",
      params: { id: asText(pl.contact_id) },
      body: fieldsOf(pl, ["wire", "text", "subject", "template", "email_to", "then", "note"]),
      idempotencyKey: p.id,
      events: [PEOPLE_CHANGED]
    };
  },
  receipt: ({ payload: pl }) => `On its way to ${asText(pl.who)} \u2014 sends in 15 seconds unless you cancel`,
  undo: {
    label: () => "Sends 15 seconds after you approve; cancel within them",
    window: "cancelable",
    record: (_p, data) => ({
      message_id: rec(data).message_id,
      cancelable_until: rec(data).cancelable_until,
      decision_id: decisionOf(data)
    }),
    call: (u) => ({ route: "POST messages/[id]/cancel-send", params: { id: asText(u.message_id) } }),
    receipt: () => "Canceled before it sent"
  },
  made: (_p, data) => threadMade(data),
  open: (p, outcome) => outcome?.made?.id ? `inbox/th-${outcome.made.id}` : personRoute(p)
};
