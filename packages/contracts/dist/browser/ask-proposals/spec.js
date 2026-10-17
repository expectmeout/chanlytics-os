export const PROPOSAL_WORDS = {
  cannotApprove: "This card cannot be approved from here.",
  noUndo: "This one has no undo.",
  /** A card past ASK_CARD_FRESH_MS (askCardLapsed): nothing is sent, and asking again makes it from what is true now. */
  lapsed: "This card is more than a day old, and what it would change may have moved since. Ask again and it is made from how things stand now.",
  /** A plan's card past its week (askCardLapsed): the same, in the plan's words. */
  planLapsed: "This plan is more than a week old, and what it would change may have moved since. Ask again and it is made from how things stand now.",
  /** A plan's card naming a step that was undone: what that step made is gone, so nothing is sent to it. */
  planUndone: "A step this one builds on was undone, so what it would use is gone and nothing is sent. Ask again and the plan is made from how things stand now.",
  /** A plan's card naming a step that has made nothing yet: that step is approved first. */
  waitsForStep: (n) => `This waits for step ${n}: approve step ${n} first, then this one.`,
  /**
   * A plan's card naming a step that was approved and made nothing it can use (a message whose every version was
   * refused): waiting would never help, so the plan is asked for again.
   */
  stepMadeNothing: (n) => `Step ${n} made nothing this one can use, so nothing is sent. Ask again and the plan is made from how things stand now.`,
  /**
   * A card of several requests stopped by a refusal after some went (`done` of `of`): what went stands, the rest did not
   * go, and the refusal says why in its own words.
   */
  batchStopped: (done, of, why) => `${done} of ${of} parts went, then: ${/[.!?…]$/.test(why.trim()) ? why.trim() : `${why.trim()}.`} The rest did not go.`,
  /** A plan's silent steps, stopped at step n by its refusal (`why`, in the refusal's own words): nothing after it was done. */
  planStopped: (n, why) => `Stopped at step ${n}: ${/[.!?…]$/.test(why.trim()) ? why.trim() : `${why.trim()}.`} The steps after it were not done.`
};
export const ASK_SENDS = /* @__PURE__ */ (() => /* @__PURE__ */ new Set([
  "reply",
  "whisper",
  "broadcast",
  "playbook",
  "run",
  "lead_search",
  "people_search",
  "person_message",
  "sequence_start",
  "call_hand_over",
  "leads_check",
  "lead_addressee",
  "lead_search_more",
  "reach_out_make",
  "review_reply"
]))();
export const asText = (v) => v == null ? "" : String(v);
export const rec = (v) => v && typeof v === "object" ? v : {};
export const decisionOf = (data) => {
  const id = rec(data).decision_id;
  return typeof id === "string" && id ? id : null;
};
export const wasIn = (data, k) => {
  const was = rec(rec(data).was);
  return Object.prototype.hasOwnProperty.call(was, k) ? was[k] : void 0;
};
export const idIn = (pl, k) => typeof pl?.[k] === "string" && pl[k] ? pl[k] : null;
export const refuseWith = (words) => ({ refused: words });
export const uniqueIds = (v) => Array.isArray(v) ? [...new Set(v.map(asText).filter(Boolean))] : [];
export function oneOrMany(calls) {
  const [only, ...rest] = calls;
  return only && rest.length === 0 ? only : calls;
}
const BATCH_SIZE = 50;
export function inBatches(items, size = BATCH_SIZE) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
export function gatherCounts(answers) {
  const out = { done: 0, failed: [], skipped: [] };
  for (const a of answers) {
    const d = rec(a);
    out.done = out.done + (typeof d.done === "number" ? d.done : 0);
    if (Array.isArray(d.failed)) out.failed.push(...d.failed);
    if (Array.isArray(d.skipped)) out.skipped.push(...d.skipped);
  }
  return out;
}
export const ownEntry = (m, k) => Object.prototype.hasOwnProperty.call(m, k) ? m[k] : void 0;
export const PEOPLE_CHANGED = { type: "surface:clients" };
