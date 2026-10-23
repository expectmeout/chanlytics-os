export const REPLY_DRAFT_KINDS = ["reply", "brief"];
export const REPLY_DRAFTS_IDS_MAX = 20;
export function replyDraftAbout(kind, f) {
  if (kind === "brief") {
    return [
      "Call them back.",
      f.details ? `The phone receptionist left this for the call: ${f.details}` : null,
      "Prepare what I should say and ask on the call."
    ].filter(Boolean).join(" ");
  }
  return [
    "Reply to what they wrote last. They are waiting on a person.",
    f.reason ? `My receptionist handed it to me because: ${f.reason}.` : null,
    "Answer it from the facts you have. Do not ask me anything: where a fact is missing, say I will find out and get back to them today."
  ].filter(Boolean).join(" ");
}
export function draftIsCurrent(d, forMessageId) {
  return d.for_message_id === forMessageId;
}
export function draftHasWords(d) {
  return d.kind === "brief" ? d.words.brief !== null : d.words.text.trim().length > 0;
}
