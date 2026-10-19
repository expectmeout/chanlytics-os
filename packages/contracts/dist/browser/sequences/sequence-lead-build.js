import {
  LEAD_CARD_WORDS,
  leadCardStepsOf
} from "../leads/lead-card.js";
import {
  REACH_OUT_DRAFTS_PER_DAY,
  reachOutCardSlotsOf
} from "../reach-out/reach-out-rules.js";
import { chainPaceOf } from "../reach-out/reach-out-sheet.js";
import {
  REACH_OUT_AFTER_DAYS,
  REACH_OUT_GAP_MINUTES,
  REACH_OUT_SLOT_SET,
  REACH_OUT_STEPS_MAX
} from "../reach-out/reach-out-words.js";
import { plural } from "../shared/words.js";
import { slotMentions } from "../templates/slot-sets.js";
export const LEAD_BUILD_WORDS = {
  /** The Start row: who joins, then the line under it. */
  startAdd: "When you add a lead to ",
  startFound: "When a lead is ready in ",
  inIt: (n) => `${n} in it`,
  pace: (share, owner) => `up to ${share} a day, from ${owner ? "your inbox" : "your mailboxes"}`,
  noMailbox: "no mailbox to send from yet",
  howItRuns: "How it runs",
  /** A step's box. */
  firstEmail: "First email",
  followUp: "Following up",
  notWritten: "Not written yet",
  call: "Call them",
  note: "A note for you",
  callLine: "A task on their page, due that day \xB7 always last",
  /** The dock of a draft with an email still to write. */
  unwritten: (place) => `Step ${place} isn\u2019t written yet`,
  thenStart: "Then Start",
  write: (place) => `Write step ${place}`,
  /** Start refused while an email is still to write: the door's words. */
  writeFirst: (place) => `Step ${place} isn\u2019t written yet. Write it, then Start.`,
  /** A step's sheet. */
  stepTitle: (place, hand) => `Step ${place} \xB7 ${hand === "call" ? "Call" : hand === "note" ? "Note" : "Email"}`,
  stepSub: (day, people) => people > 0 ? `Day ${day} \xB7 to ${plural(people, "lead", "leads")}` : `Day ${day} \xB7 nobody in it yet`,
  done: "Done",
  subject: "Subject",
  email: "Email",
  inThread: "It answers the email before it, in the same thread: no subject.",
  insert: "Insert",
  askRewrites: "Ask rewrites it",
  askPrompt: (place, name) => `Rewrite step ${place} of \u201C${name}\u201D: `,
  preview: "Preview",
  holdsOne: "A value that can\u2019t be filled holds that one email for you.",
  aboutThem: "About them",
  aboutYou: "About you",
  whenFound: "when found",
  writtenForEach: "written for each",
  notSet: "not set",
  add: "Add",
  waits: "Waits",
  afterDays: (n) => plural(n, "day", "days"),
  onlyIfQuiet: "Then only if they haven\u2019t written back",
  removeStep: "Take this step out",
  stepOut: (place) => `Step ${place} taken out`,
  handWords: "What to do",
  handHint: "Said on their page the day it comes due.",
  saving: "Saving\u2026",
  saved: "Saved as you change it",
  /** The booking link put in from the step: Settings keeps it. */
  bookingLink: "Your booking link",
  bookingSave: "Save to Settings",
  bookingSaved: "Booking link saved",
  /** Preview as a real lead. */
  previewSub: (place) => `Step ${place}, as each lead gets it`,
  previewOf: (name, at, of) => `${name} \xB7 ${at} of ${of}`,
  yourInbox: "your inbox",
  prev: "Previous lead",
  next: "Next lead",
  example: "An example business: nobody is in it yet",
  testLine: (place, name) => `Step ${place}, as ${name} gets it`,
  testFact: "To your own inbox, marked as a test",
  heldLine: (n) => `${plural(n, "email", "emails")} held for you`,
  /** What holds the email previewed: a value they lack, or one of yours not set. */
  theyLack: (labels) => `They have no ${labels.join(" or ")}, so this email would wait for you.`,
  youUnset: (labels) => `${labels.join(" and ")} isn\u2019t set, so every email that names it waits for you.`,
  show: "Show",
  /** How it runs. */
  runs: {
    title: "How it runs",
    sub: "Saved as you change it",
    who: "Who joins",
    unconfirmed: "Write to unconfirmed addresses too",
    heldNow: (n) => `${n} held now`,
    autoAdd: "Add new ready leads from the search",
    noSearch: "It was made from a list, not a search",
    sending: "Sending",
    sendsFrom: "Sends from",
    inbox: "Your inbox \xB7 you send",
    mailboxes: (n) => n === 1 ? "Your mailbox" : `Your ${n} mailboxes`,
    connect: "Connect a mailbox",
    aDay: "A day, at most",
    every: (minutes) => `one every ${minutes} min or so`,
    youPace: "You send each, so you are the pace",
    approves: "Who approves",
    inAutonomy: "Set in Autonomy",
    signed: "Signed",
    signedNone: "Not set",
    footer: "Footer",
    footerValue: "Why they hear from you",
    noAddress: "Add your address in Settings \u203A Details: every email carries it at the foot."
  }
};
const APPROVES = {
  ask: "You, each batch",
  veto: "Goes unless you stop it",
  auto: "Goes on its own",
  never: "Nobody: it stays quiet"
};
export const leadApprovesOf = (mode) => mode !== null && Object.prototype.hasOwnProperty.call(APPROVES, mode) ? APPROVES[mode] : APPROVES.ask;
const leadSlotLabel = (key) => REACH_OUT_SLOT_SET.labels[REACH_OUT_SLOT_SET.keys.indexOf(key)] ?? key;
function leadBuildPartsOf(text) {
  const parts = [];
  let from = 0;
  for (const m of slotMentions(REACH_OUT_SLOT_SET, text)) {
    if (m.index > from) parts.push({ kind: "text", text: text.slice(from, m.index) });
    parts.push({ kind: "slot", key: m.key, label: leadSlotLabel(m.key) });
    from = m.index + m.written.length;
  }
  if (from < text.length) parts.push({ kind: "text", text: text.slice(from) });
  return parts;
}
const leadStepUnwritten = (s) => !s.hand && !s.body.trim();
export function leadFirstUnwritten(steps) {
  const at = steps.findIndex(leadStepUnwritten);
  return at < 0 ? null : at + 1;
}
const partsWords = (parts) => parts.map((p) => p.kind === "text" ? p.text : p.label).join("").trim();
export function leadBuildStepsOf(chain) {
  const out = /* @__PURE__ */ new Map();
  for (const s of [...chain.steps].sort((a, b) => a.n - b.n)) {
    const hand = s.hand?.kind ?? null;
    const unwritten = leadStepUnwritten(s);
    const subject = s.n === 0 && s.subject?.trim() ? leadBuildPartsOf(s.subject) : null;
    const title = subject ?? [
      {
        kind: "text",
        text: hand === "call" ? LEAD_BUILD_WORDS.call : hand === "note" ? LEAD_BUILD_WORDS.note : s.n === 0 ? LEAD_BUILD_WORDS.firstEmail : LEAD_BUILD_WORDS.followUp
      }
    ];
    out.set(s.id, {
      place: s.n + 1,
      title,
      named: partsWords(title),
      pre: hand || unwritten ? null : leadBuildPartsOf(s.body.replace(/\s*\n+\s*/g, " ").trim()),
      unwritten,
      hand
    });
  }
  return out;
}
export function reachOutInsertStep(d) {
  if (d.steps.length >= REACH_OUT_STEPS_MAX) return d;
  const step = {
    id: null,
    subject: null,
    body: "",
    after_days: REACH_OUT_AFTER_DAYS.first,
    hand: null
  };
  const last = d.steps[d.steps.length - 1];
  if (last?.hand && d.steps.length > 1) return { ...d, steps: [...d.steps.slice(0, -1), step, last] };
  return { ...d, steps: [...d.steps, step] };
}
export const reachOutMayInsertStep = (d) => d.steps.length < REACH_OUT_STEPS_MAX;
export function reachOutRemoveStep(d, i) {
  if (i <= 0 || i >= d.steps.length) return d;
  return { ...d, steps: d.steps.filter((_, j) => j !== i) };
}
export function reachOutPutBackStep(d, i, step) {
  if (d.steps.length >= REACH_OUT_STEPS_MAX || i <= 0) return d;
  const at = Math.min(i, d.steps.length);
  return { ...d, steps: [...d.steps.slice(0, at), { ...step, id: null }, ...d.steps.slice(at)] };
}
export function leadDraftDockOf(row, chain) {
  if (row.state !== "draft" || !chain) return null;
  const place = leadFirstUnwritten([...chain.steps].sort((a, b) => a.n - b.n));
  if (place === null) return null;
  const W = LEAD_BUILD_WORDS;
  return { place, line: W.unwritten(place), fact: W.thenStart, act: W.write(place) };
}
export function leadStartOf(row, chain) {
  const W = LEAD_BUILD_WORDS;
  const source = row.first?.source_name ?? null;
  const pace = chain ? chainPaceOf(chain) : null;
  const sends = !chain ? null : chain.owner_sends || pace && pace.share > 0 ? W.pace(pace?.share ?? REACH_OUT_DRAFTS_PER_DAY, chain.owner_sends === true) : W.noMailbox;
  return {
    lead: source ? W.startFound : W.startAdd,
    name: source ?? row.name,
    sub: [W.inIt(row.in_it), sends].filter(Boolean).join(" \xB7 ")
  };
}
const THEM = ["business", "city", "first name", "opening"];
const COMPANY = ["company", "title", "role"];
const YOU = ["your name", "your business", "booking link"];
export function leadInsertRowsOf(lead, workspace) {
  const W = LEAD_BUILD_WORDS;
  const them = lead?.kind === "company" ? [...THEM.slice(0, 3), ...COMPANY, "opening"] : THEM;
  const keys = [...them, ...YOU];
  const filled = lead ? new Map(
    reachOutCardSlotsOf(
      keys.map((k) => `{{${k}}}`),
      lead,
      workspace
    ).map((s) => [s.key, s])
  ) : null;
  return keys.map((key) => {
    const group = YOU.includes(key) ? "you" : "them";
    const label = leadSlotLabel(key);
    if (key === "opening") return { key, label, value: W.writtenForEach, look: "later", group };
    const s = filled?.get(key);
    if (group === "you") {
      const value = key === "your name" ? workspace.yourName : key === "your business" ? workspace.businessName : workspace.bookingLink;
      return value?.trim() ? { key, label, value: value.trim(), look: "value", group } : { key, label, value: W.notSet, look: "unset", group };
    }
    if (!s || s.value === null || s.fellBack) return { key, label, value: W.whenFound, look: "later", group };
    return { key, label, value: s.value, look: "value", group };
  });
}
export function leadPaceChoicesOf(mailboxes) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const gap of REACH_OUT_GAP_MINUTES) {
    const share = chainPaceOf({ mailboxes: [...mailboxes], owner_sends: false, gap_minutes: gap }).share;
    if (share === 0 || seen.has(share)) continue;
    seen.add(share);
    out.push({ gap, share, hint: LEAD_BUILD_WORDS.runs.every(gap) });
  }
  return out.sort((a, b) => b.share - a.share);
}
export function leadDraftChainOf(chain, d) {
  return {
    ...chain,
    signed_by: d.signed_by.trim() || null,
    steps: d.steps.map((s, n) => ({
      id: s.id ?? `new-${n}`,
      n,
      after_days: n === 0 ? null : s.after_days,
      subject: n === 0 ? s.subject : null,
      body: s.hand ? "" : s.body,
      template_id: null,
      hand: s.hand,
      state: "running"
    }))
  };
}
export function leadPreviewEmailOf(p) {
  const steps = leadCardStepsOf(p);
  const step = steps[p.place - 1];
  const at = [...p.chain.steps].sort((a, b) => a.n - b.n)[p.place - 1];
  if (!step || !at || at.hand) return null;
  const first = steps[0]?.subject ?? null;
  const subject = step.subject ?? (first ? [{ kind: "text", text: "Re: " }, ...first] : null);
  const gaps = [
    ...new Set([...step.subject ?? [], ...step.body].flatMap((x) => x.kind === "gap" ? [x.label] : []))
  ];
  const yours = new Set(YOU.map((k) => leadSlotLabel(k).toLowerCase()));
  const mine = gaps.filter((g) => yours.has(g));
  const theirs = gaps.filter((g) => !yours.has(g));
  const W = LEAD_BUILD_WORDS;
  const blocked = [
    mine.length ? W.youUnset(mine.map((g) => g.charAt(0).toUpperCase() + g.slice(1))) : null,
    theirs.length ? W.theyLack(theirs) : null
  ].filter(Boolean).join(" ");
  return {
    head: LEAD_CARD_WORDS.emailOf(p.place, steps.length),
    to: p.lead.to,
    subject,
    body: step.body,
    when: null,
    note: null,
    blocked: blocked || null,
    instead: null
  };
}
