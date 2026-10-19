import { plural } from "../../shared/words.js";
import { LEAD_CLOSED_WORDS, LEAD_LEFT_OUT_WORD } from "../lead-words.js";
import { placeSpanOf } from "../../sequences/sequence-place.js";
export const LEAD_SHEET_WORDS = {
  label: "About this lead",
  raise: "Show everything about them",
  lower: "Back to the quick look",
  close: "Close",
  more: "More for this lead",
  back: "Back",
  /** An email drawn whole: who it is from and to. */
  emails: { from: "From", to: "To" },
  /** The quick acts at half: each opens outside the app. */
  quick: { website: "Website", call: "Call", maps: "Maps" },
  /** The sections of the one scroll, in their order. */
  sections: {
    fit: "Fit",
    about: "About",
    contact: "Contact",
    sequence: "Sequence",
    found: "How we found them"
  },
  fitChecks: (passed, of) => `${passed} of ${of} checks`,
  passed: (n) => `${n} passed`,
  aboutFrom: (from) => from,
  listing: "Listing",
  claimed: "Claimed by the owner",
  unclaimed: "Nobody has claimed it",
  hours: "Hours",
  /** Contact: where the sequence writes, and changing who it writes to. */
  writesHere: "The sequence writes here",
  writeHere: "Write here",
  checkedMailbox: "mailbox checked",
  notConfirmed: "Not confirmed",
  emailOnSite: "Email found on its contact page",
  /** Sequence, before one: not in one yet, and the email they'd get from the pick. */
  notInOne: "Not in one yet",
  wouldGet: "The email they'd get",
  wouldGetOf: (name) => `${name}\u2019s step 1, filled for them`,
  noPick: "Pick a sequence to see the email they'd get.",
  noEmailToWrite: "No email to write to: no sequence can take them. Call them instead.",
  /** The lead's ⋯: the rare acts. */
  menu: {
    theyWrote: "They wrote back\u2026",
    copy: "Copy details",
    copied: "Copied what is known of them",
    never: "Never write to them again",
    neverHint: "Stops every sequence",
    erase: "Erase this lead"
  },
  /** The picker: a step of the same sheet. */
  picker: {
    title: (name) => `Add ${name} to`,
    titleMany: (n) => `Add ${n} to`,
    sub: "Tap one to add. It becomes the pick for this search.",
    canJoin: (name) => `${name} can join any of these`,
    yours: "Your lead sequences",
    none: "No sequence takes leads yet. Make one by name; you write its emails after the pile.",
    newOne: "New sequence",
    newLine: "Name it now; write the emails after the pile",
    newLineMany: (n) => `Name it; the ${n} wait in it as a draft`,
    pick: "the pick for this search"
  },
  /** Many at once, from the selection bar: the same picker and New, named by how many. */
  bulk: {
    noEmail: (n) => n === 1 ? "1 has no email" : `${n} have no email`,
    addTo: (n, name) => `Add ${n} to ${name}`,
    addAny: (n) => `Add ${n} to a sequence`,
    choose: "Choose where they go",
    stay: (n) => n === 1 ? "1 couldn't join and stays selected" : `${n} couldn't join and stay selected`,
    later: "Later",
    laterDone: (n) => `${plural(n, "lead", "leads")} put off for later`,
    more: "More"
  },
  /** New: a name and a start, mid-pile. */
  make: {
    title: "New sequence",
    sub: (name) => `${name} goes in it. Nothing sends until you start it.`,
    subMany: (n) => `The ${n} go in it. Nothing sends until you start it.`,
    name: "Name",
    from: "Start from",
    copy: (name) => `Copy ${name}`,
    copyLine: "Same emails and waits, on a new list",
    change: "Change",
    ask: "A draft by Ask",
    askLine: "From your goal in Settings and this search",
    blank: "Blank",
    blankLine: "You write every email",
    create: (name) => `Create and add ${name}`,
    createMany: (n) => `Create and add ${n}`,
    drafting: "Writing a draft\u2026"
  },
  /** The pile's end. */
  end: {
    title: (n) => n ? `All ${n} decided` : "Nothing left to decide",
    toSequence: (n, name) => `${n} to ${name}`,
    notFit: (n) => `${n} not a fit`,
    later: (n) => `${n} for later`,
    goThrough: "Go through them",
    approve: (n) => `Approve ${n}`,
    write: "Write the emails in Sequences",
    writeNote: (n) => `Next: one set of emails for the ${n}, in the draft's record. Back brings you here.`,
    approveNote: "Their first batch waits for your OK: it carries leads you added."
  },
  /** The pile's line over the card. */
  of: (at, of, search) => `${at} of ${of} \xB7 ${search}`,
  /** Adds go to: the pick, said on Leads over the rows. */
  addsGoTo: "Adds go to",
  noneYet: "Pick a sequence"
};
const ADDRESS_WHYS = /* @__PURE__ */ new Set(["no_email", "invalid"]);
const SETTING_WHYS = /* @__PURE__ */ new Set(["unconfirmed", "unchecked"]);
const BOUNCED = /* @__PURE__ */ new Set(["bounced", "outreach_bounced"]);
function settledOf(lead, place) {
  if (lead.cls === "excluded") return "closed";
  if (lead.cls === "review") return "review";
  const g = place ? place.place.group : null;
  if (lead.stage === "converted" || g === "replied") return "replied";
  if (lead.stage === "archived" || g === "left" && BOUNCED.has(place?.place.why ?? "")) return "closed";
  return place ? "sequence" : null;
}
function checkStateOf(check, lead) {
  if (!check) return null;
  if (check.why === "elsewhere" || check.why === "written") return "elsewhere";
  if (check.why === "already") return "sequence";
  if (check.why === "checking") return "finding";
  if (ADDRESS_WHYS.has(check.why)) return lead.canCall ? "phone" : "closed";
  return SETTING_WHYS.has(check.why) ? "gap" : "closed";
}
export function leadSheetStateOf(p) {
  const settled = settledOf(p.lead, p.place) ?? checkStateOf(p.check, p.lead);
  if (settled) return settled;
  if (!p.lead.hasEmail || p.lead.emailState === "invalid") return p.lead.canCall ? "phone" : "closed";
  if (p.lead.emailState === "checking") return "finding";
  return p.email && p.email.blocked ? "gap" : "ready";
}
export function leadSheetClosedOf(p) {
  const call = p.lead.canCall ? "call" : null;
  if (p.lead.cls === "excluded") return { title: LEAD_LEFT_OUT_WORD, line: "", fix: "put_back" };
  if (p.lead.stage === "archived") {
    const word = p.closedReason && p.closedReason in LEAD_CLOSED_WORDS ? LEAD_CLOSED_WORDS[p.closedReason] : "Closed";
    return { title: word, line: "Nothing is written to them.", fix: "ready" };
  }
  if (p.lead.emailState === "invalid")
    return { title: "Their address bounced", line: "Nothing more goes to it.", fix: call };
  if (!p.lead.hasEmail && !p.lead.canCall)
    return { title: "No way to reach them yet", line: "No address and no number were found.", fix: null };
  return { title: "Can't be written to", line: p.blocked ?? "This one can't be added.", fix: call };
}
export function leadVerdictOf(vm) {
  const cls = vm.fit.cls;
  if (cls === "strong") return { word: vm.fit.word, tone: "ok", out: false };
  if (cls === "look" || cls === "long") return { word: vm.fit.word, tone: "warn", out: false };
  return { word: vm.fit.word, tone: "plain", out: cls === "out" };
}
export const sheetSlot = (act, label, icon, key = null, more = {}) => ({ act, label, icon, key, off: null, ...more });
const STATE_WORDS = {
  on: { word: "On", tone: "ok" },
  draft: { word: "Draft", tone: "warn" },
  paused: { word: "Paused", tone: "plain" },
  ended: { word: "Ended", tone: "plain" }
};
function pickerLineOf(r) {
  const span = placeSpanOf(r.steps, r.days ?? 0);
  if (r.state === "draft") {
    const added = r.in_it > 0 ? `${r.in_it} added` : "Nobody added yet";
    return (r.unwritten ?? 0) > 0 ? `${added} \xB7 emails not written yet` : `${added} \xB7 ${span}`;
  }
  const inIt = `${r.in_it} in it`;
  return r.state === "paused" ? `${span} \xB7 ${inIt} \xB7 adds wait until it's on` : `${span} \xB7 ${inIt}`;
}
export function leadPickerRowsOf(rows, picked) {
  return rows.filter((r) => r.starts === "leads" && r.state !== "ended").sort((a, b) => a.id === picked ? -1 : b.id === picked ? 1 : b.created_at.localeCompare(a.created_at)).map((r) => ({
    id: r.id,
    name: r.name,
    state: r.state,
    ...STATE_WORDS[r.state],
    line: pickerLineOf(r),
    picked: r.id === picked
  }));
}
export function leadPileEndOf(p) {
  const W = LEAD_SHEET_WORDS.end;
  const decided = p.added.reduce((n, a) => n + a.n, 0) + p.notFit + p.later;
  const rows = p.added.filter((a) => a.n > 0).map((a) => ({
    key: a.id,
    icon: "plus",
    words: W.toSequence(a.n, a.name),
    ...STATE_WORDS[a.state],
    act: a.state === "on" && a.waiting ? { kind: "approve", label: W.approve(a.waiting.people), sequenceId: a.id, batchId: a.waiting.batchId } : null
  }));
  if (p.notFit > 0)
    rows.push({ key: "not_a_fit", icon: "x", words: W.notFit(p.notFit), word: null, tone: "plain", act: null });
  if (p.later > 0)
    rows.push({
      key: "later",
      icon: "clock",
      words: W.later(p.later),
      word: null,
      tone: "plain",
      act: { kind: "later", label: W.goThrough, sequenceId: null, batchId: null }
    });
  const draft = p.added.find((a) => a.state === "draft" && a.n > 0) ?? null;
  const waits = p.added.some((a) => a.state === "on" && a.waiting);
  return {
    title: W.title(decided),
    rows,
    note: draft ? W.writeNote(draft.n) : waits ? W.approveNote : null,
    primary: draft ? { label: W.write, sequenceId: draft.id } : null
  };
}
export function leadSheetAboutOf(vm) {
  const listing = vm.company ? vm.company.source : "Google listing";
  const W = LEAD_SHEET_WORDS;
  const rows = [
    ...vm.company || vm.claimed === null ? [] : [{ k: W.listing, v: vm.claimed ? W.claimed : W.unclaimed, from: null }],
    ...vm.weekSummary ? [{ k: W.hours, v: vm.weekSummary, from: null }] : [],
    // The listing's own facts, each said once: the rating is the head's.
    ...vm.facts.filter((f) => f.k !== "Rated").map((f) => ({ k: f.k, v: f.v, from: null }))
  ];
  return { head: vm.company ? "The company" : W.sections.about, from: listing, text: vm.about, rows };
}
