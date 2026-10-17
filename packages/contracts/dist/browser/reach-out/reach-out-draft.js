import { mailboxDailyCap, mailboxRampShare, MAILBOX_RAMP } from "../email/mailbox-connections.js";
import {
  REACH_OUT_PREVIEW_INDEX_MAX
} from "./reach-out-dtos.js";
import { REACH_OUT_SHEET_WORDS, startWords } from "./reach-out-sheet.js";
import {
  REACH_OUT_AFTER_DAYS,
  REACH_OUT_MAILBOXES_MAX,
  REACH_OUT_STEPS_MAX,
  chainIssueWords,
  holdWords,
  isReachOutHold,
  validateReachOutChain
} from "./reach-out-words.js";
export const REACH_OUT_FIRST_WORDS = {
  subject: "A quick one for {{business}}",
  body: "{{opening}}\n\nI run {{your business}}, and we help businesses like yours. Would it be worth a short call?\n\n{{your name}}",
  nudge: "Just checking this reached you. Happy to send a few details if it's useful.\n\n{{your name}}"
};
export const REACH_OUT_GAP_FIRST = 20;
export function reachOutDefaultName(searchName) {
  return `Reach out \xB7 ${searchName}`.slice(0, 80);
}
export function reachOutDraftOf(p) {
  const c = p.chain;
  if (c)
    return {
      name: c.name,
      include_unconfirmed: c.include_unconfirmed,
      gap_minutes: c.gap_minutes,
      mailbox_ids: c.mailbox_ids,
      owner_sends: c.owner_sends === true,
      signed_by: c.signed_by ?? p.signedBy ?? "",
      steps: c.steps.map((s) => ({
        id: s.id,
        subject: s.n === 0 ? s.subject : null,
        body: s.body,
        after_days: s.n === 0 ? null : s.after_days,
        hand: s.hand
      }))
    };
  return {
    name: reachOutDefaultName(p.searchName),
    include_unconfirmed: !!p.includeUnconfirmed,
    gap_minutes: REACH_OUT_GAP_FIRST,
    mailbox_ids: [],
    owner_sends: p.ownerSends === true,
    signed_by: p.signedBy ?? "",
    steps: [
      {
        id: null,
        subject: REACH_OUT_FIRST_WORDS.subject,
        body: REACH_OUT_FIRST_WORDS.body,
        after_days: null,
        hand: null
      }
    ]
  };
}
export function reachOutVersionDraftOf(chain, name, signedBy) {
  const d = reachOutDraftOf({ chain, searchName: chain.name, signedBy });
  return { ...d, name, steps: d.steps.map((s) => ({ ...s, id: null })) };
}
export const REACH_OUT_NEW_LIST_WORDS = {
  title: "A list of its own",
  goesOn: (lead) => `${lead} goes on it when you start`,
  version: (name) => `A version of \u201C${name}\u201D: the same steps, waits and mailboxes. Change what's different.`,
  /** A version's name until the owner names it. */
  nameOf: (sequence, lead) => `${sequence}, for ${lead}`,
  /** A new sequence's name for a lead, until the owner names it. */
  forLead: (lead) => `For ${lead}`,
  before: "Each lead's first email is written for them as their batch is planned; you see it before it goes.",
  /** Back on the lead, once it started: the name it was given may not be the one it opened with, so the lead's is said. */
  started: (lead) => `Started: ${lead} is on its own list`,
  startedOn: (list) => `Started on \u201C${list}\u201D`,
  someone: "this lead"
};
export function reachOutMayAddStep(d) {
  return d.steps.length < REACH_OUT_STEPS_MAX && !d.steps[d.steps.length - 1]?.hand;
}
export function reachOutAddStep(d) {
  if (!reachOutMayAddStep(d)) return d;
  const step = {
    id: null,
    subject: null,
    body: REACH_OUT_FIRST_WORDS.nudge,
    after_days: REACH_OUT_AFTER_DAYS.first,
    hand: null
  };
  return { ...d, steps: [...d.steps, step] };
}
export function reachOutAddHandStep(d, kind) {
  if (!reachOutMayAddStep(d)) return d;
  const step = { id: null, subject: null, body: "", after_days: REACH_OUT_AFTER_DAYS.first, hand: { kind, words: "" } };
  return { ...d, steps: [...d.steps, step] };
}
export function reachOutSetHandWords(d, i, words) {
  const s = d.steps[i];
  if (!s?.hand) return d;
  return { ...d, steps: d.steps.map((x, j) => j === i ? { ...x, hand: { kind: s.hand.kind, words } } : x) };
}
export function reachOutDropStep(d) {
  return d.steps.length > 1 ? { ...d, steps: d.steps.slice(0, -1) } : d;
}
export function reachOutAfterDayChoices() {
  const out = [];
  for (let n = REACH_OUT_AFTER_DAYS.min; n <= REACH_OUT_AFTER_DAYS.max; n += 1) out.push(n);
  return out;
}
export function reachOutChainBodyOf(d, searchId) {
  return {
    name: d.name.trim() || "Reach out",
    search_id: searchId,
    include_unconfirmed: d.include_unconfirmed,
    gap_minutes: d.gap_minutes,
    mailbox_ids: d.mailbox_ids,
    owner_sends: d.owner_sends,
    signed_by: d.signed_by.trim() || null,
    // An email carries no hand at all: the door reads a step with the key as a hand step (00228).
    steps: d.steps.map((s, i) => ({
      ...s.id ? { id: s.id } : {},
      subject: i === 0 ? s.subject ?? "" : null,
      body: s.hand ? "" : s.body,
      after_days: i === 0 ? null : s.after_days,
      ...s.hand ? { hand: { kind: s.hand.kind, words: s.hand.words } } : {}
    }))
  };
}
export function reachOutDraftIssues(d, has) {
  const issues = validateReachOutChain(
    reachOutChainBodyOf(d, "00000000-0000-4000-8000-000000000000"),
    has
  );
  const steps = d.steps.map(() => ({ subject: [], body: [], after_days: [] }));
  const out = { steps, signed_by: [], chain: [], ready: issues.length === 0 };
  for (const i of issues) {
    const words = chainIssueWords(i);
    if (i.step === null) (i.field === "signed_by" ? out.signed_by : out.chain).push(words);
    else if (i.field === "subject" || i.field === "body" || i.field === "after_days")
      steps[i.step][i.field].push(words);
  }
  return out;
}
export function reachOutSheetPaceOf(mailboxes, picked) {
  const from = mailboxes.filter((m) => m.state === "connected" && (picked.length === 0 || picked.includes(m.id)));
  if (from.length === 0) return { share: 0, sentDays: 0, mailboxes: 0, rises: null };
  const share = from.reduce((t, m) => t + mailboxDailyCap(m), 0);
  const sentDays = Math.min(...from.map((m) => m.sent_days));
  const next = MAILBOX_RAMP.find((s) => s.days > sentDays);
  const youngest = from.find((m) => m.sent_days === sentDays);
  const rises = next && youngest && mailboxDailyCap(youngest) >= mailboxRampShare(sentDays) ? next.days - sentDays : null;
  return { share, sentDays, mailboxes: from.length, rises };
}
export function previewRefusedWords(reason) {
  switch (reason) {
    case "no_booking_link":
      return "Your words name {{booking link}}, and your booking link isn't set.";
    case "no_signed_by":
      return "Your words name {{your name}}. Say the name you sign with.";
    case "no_subject":
      return "Your email needs a subject.";
    case "unknown_slot":
      return "Your words name a slot that isn't one of the six.";
    case "missing_value":
      return "This business is missing a value your words name, so its email would be skipped.";
    case "no_business_address":
      return "Add your business's address in Settings \u203A Details: every email carries it at the foot.";
    default:
      return "These words can't go as they are.";
  }
}
export function previewLinesOf(p) {
  const v = p.preview;
  return {
    reader: v.lead ? `as ${v.lead.business_name} reads it \xB7 ${p.index + 1} of ${p.of}` : null,
    nobody: v.lead ? null : "Nobody on this search can be written to yet.",
    hold: v.hold && isReachOutHold(v.hold) ? `The check would hold this one: ${holdWords(v.hold, v.detail)}.` : null,
    refused: v.refused ? previewRefusedWords(v.refused) : null,
    unavailable: v.unavailable ? "The opening couldn't be written just now. Rewrite the opening to ask again." : null,
    first: p.index <= 0,
    last: p.index + 1 >= p.of
  };
}
export function reachOutPreviewOf(reach) {
  return Math.max(1, Math.min(reach, REACH_OUT_PREVIEW_INDEX_MAX + 1));
}
export const REACH_OUT_PREVIEW_WORDS = {
  read: "Read it as they will",
  prev: "Previous",
  next: "Next",
  rewrite: "Rewrite the opening",
  reading: "Writing this business's opening\u2026",
  changed: "Your words changed \xB7 Read it again"
};
export function reachOutDoorOf(r) {
  if (!r) return null;
  if (r.chain) return { kind: "open", label: "Open its reach-out", rootId: r.chain };
  if (r.ready > 0) return { kind: "write", label: `Write to the ${r.ready} ready`, include: false };
  const unconfirmed = Math.max(0, r.with_unconfirmed - r.ready);
  if (unconfirmed > 0) return { kind: "write", label: `Write to the ${unconfirmed} unconfirmed`, include: true };
  return null;
}
export function reachOutWhoWords(includeUnconfirmed) {
  return includeUnconfirmed ? "Ready, and those whose address is unconfirmed, never written to. Keeps itself current as the search grows." : REACH_OUT_SHEET_WORDS.who;
}
export function reachOutMayPickMailbox(d) {
  return d.mailbox_ids.length < REACH_OUT_MAILBOXES_MAX;
}
export function reachOutSheetUnreadOf(r) {
  if (r.mailboxes === "failed" || r.settings === "failed")
    return "Your mailboxes or your booking link couldn't be read. Start waits until they are; reload to try again.";
  if (r.mailboxes === "reading" || r.settings === "reading") return "Reading your mailboxes and your booking link\u2026";
  return null;
}
export function reachOutEditedWords(rechecked) {
  return rechecked > 0 ? `Saved. ${rechecked === 1 ? "1 email waiting to go is" : `${rechecked} emails waiting to go are`} checked again against these words.` : "Saved. Its next run writes these words.";
}
export function reachOutSavedWords(saved) {
  const said = saved.start ? startWords(saved.start) : { tone: "good", text: reachOutEditedWords(saved.rechecked) };
  const run = saved.start ? saved.start.run_id : null;
  return run ? { ...said, to: `broadcasts/run:${run}`, label: "Open the run" } : { ...said, to: `outbound/${saved.root_id}`, label: "Open its reach-out" };
}
export const REACH_OUT_SHEET_PARTS = {
  who: "Who gets it",
  words: "What you'd say",
  then: "Then",
  pace: "Pace",
  from: "From",
  before: "Before it goes",
  subject: "Subject",
  body: "Your words",
  signAs: "Sign as",
  after: "After",
  afterTail: "with nothing back \xB7 in the same thread",
  dayOne: "Day one \xB7 the pace below",
  remove: "Remove this step",
  everyMailbox: "Every connected mailbox",
  /** From's choice for a reach-out its owner sends (00429). */
  youSend: "You send them, from your own inbox",
  mailboxesMax: `Up to ${REACH_OUT_MAILBOXES_MAX} mailboxes, or every connected one.`,
  connectGoogle: "Connect Google",
  connectMicrosoft: "Connect Microsoft",
  close: "Close",
  recommended: "Recommended",
  start: "Start it",
  save: "Save",
  starting: "Starting\u2026",
  saving: "Saving\u2026",
  cancel: "Cancel",
  name: "The reach-out's name",
  fromLine: "From",
  toLine: "To",
  subjectLine: "Subject",
  footLine: "At the foot",
  repliesLine: "Replies"
};
