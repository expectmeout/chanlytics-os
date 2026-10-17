import { recordOrNull } from "../shared/unknown.js";
import { REPLY_WINDOW_MS } from "./run-words.js";
const NOT_ANSWERS = /* @__PURE__ */ new Set(["merge", "stop"]);
const NAMES_THE_EMAIL = /* @__PURE__ */ new Set(["unsubscribe", "complaint", "reply"]);
const NAMES_THE_SEND = /* @__PURE__ */ new Set(["carrier", "whatsapp"]);
const isIn = (set, source) => typeof source === "string" && set.has(source);
const wordOrNull = (v) => typeof v === "string" && v !== "" ? v : null;
function purposeOf(named) {
  return named === "email_marketing" || named === "marketing" ? named : "conversational";
}
function keyOfEvent(data, consent, purpose) {
  const asEmail = purpose === "email_marketing" && consent === "opted_out" && isIn(NAMES_THE_EMAIL, data.source);
  const email = asEmail ? wordOrNull(data.message_id) : null;
  if (email) return { field: "messageId", value: email };
  const send = isIn(NAMES_THE_SEND, data.source) ? wordOrNull(data.message_external_id) : null;
  return send ? { field: "messageExternalId", value: send } : null;
}
function countedOf(e) {
  const data = recordOrNull(e.data);
  const atMs = Date.parse(e.at);
  if (!data || !Number.isFinite(atMs) || isIn(NOT_ANSWERS, data.source)) return null;
  const consent = data.consent;
  if (consent !== "opted_in" && consent !== "opted_out") return null;
  const purpose = purposeOf(data.purpose);
  return {
    id: e.id,
    contactId: e.contactId,
    at: e.at,
    atMs,
    consent,
    purpose,
    key: keyOfEvent(data, consent, purpose)
  };
}
const namedBy = (key, sends) => sends.filter((s) => s[key.field] === key.value);
function reachedBefore(e, sends) {
  return sends.filter((s) => {
    const sentMs = Date.parse(s.sentAt);
    const inside = sentMs < e.atMs && e.atMs - sentMs <= REPLY_WINDOW_MS;
    return inside && (e.purpose !== "email_marketing" || s.byEmail);
  });
}
const isLaterEvent = (a, b) => a.atMs !== b.atMs ? a.atMs > b.atMs : a.id > b.id;
export function answersToRuns(sends, events) {
  const sendsOf = /* @__PURE__ */ new Map();
  for (const s of sends) {
    if (!s.live) continue;
    const had = sendsOf.get(s.contactId);
    if (had) had.push(s);
    else sendsOf.set(s.contactId, [s]);
  }
  const standing = /* @__PURE__ */ new Map();
  for (const raw of events) {
    const e = countedOf(raw);
    const theirs = e ? sendsOf.get(e.contactId) : void 0;
    if (!e || !theirs) continue;
    const exact = e.key !== null;
    for (const s of e.key ? namedBy(e.key, theirs) : reachedBefore(e, theirs)) {
      const slot = JSON.stringify([s.runId, s.contactId]);
      const held = standing.get(slot);
      if (!held || isLaterEvent(e, held.event)) standing.set(slot, { runId: s.runId, event: e, exact });
    }
  }
  return [...standing.values()].map(({ runId, event: e, exact }) => ({
    runId,
    contactId: e.contactId,
    consent: e.consent,
    purpose: e.purpose,
    at: e.at,
    eventId: e.id,
    exact
  }));
}
