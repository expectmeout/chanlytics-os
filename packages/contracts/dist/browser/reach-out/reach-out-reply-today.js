import { REPLY_INTENT_WORDS } from "./reach-out-replies.js";
function rowWorthy(r) {
  return !r.undone && r.claim !== "auto_reply" && r.intent !== "no";
}
const drafted = (r) => r.draft_state === "written" && !!r.draft;
export function replyRowOf(row, r) {
  const read = !r.unread && r.intent !== "other";
  return {
    ...row,
    kind: "reply",
    channel: "Email",
    // The reach-out it answers, so Today's row says what the reply is to (00426's truth pass): "Email, Early gyms".
    via: r.chain ?? null,
    status: read ? ["Wrote back", REPLY_INTENT_WORDS[r.intent]] : ["Wrote back"],
    sentence: r.summary ?? row.sentence,
    quoted: false,
    cta: { label: drafted(r) ? "Read the draft" : "Open and reply", to: row.cta.to }
  };
}
function newestReadings(readings) {
  const newest = /* @__PURE__ */ new Map();
  for (const r of readings) if (!newest.has(r.conversation_id)) newest.set(r.conversation_id, r);
  return newest;
}
export function withoutWrongPerson(waiting, readings) {
  const gone = /* @__PURE__ */ new Set();
  for (const [thread, r] of newestReadings(readings)) if (r.intent === "wrong_person" && !r.undone) gone.add(thread);
  return gone.size ? waiting.filter((w) => !gone.has(w.conversationId)) : [...waiting];
}
export function withReplies(rows, readings) {
  const newest = newestReadings(readings);
  return rows.map((row) => {
    const r = row.kind === "handoff" && row.conversationId ? newest.get(row.conversationId) : void 0;
    return r && rowWorthy(r) ? replyRowOf(row, r) : row;
  });
}
export function bellActionOf(row, readings) {
  if (row.kind !== "reach_out_replied" || !row.about || row.about.type !== "conversation") return row.action;
  const r = readings.find((x) => x.conversation_id === row.about?.id);
  return r && !r.undone && drafted(r) ? "Read the draft" : row.action;
}
