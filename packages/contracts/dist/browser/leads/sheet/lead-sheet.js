import { capitalize, plural } from "../../shared/words.js";
import { clockDate, clockNear } from "../../shared/clock.js";
import { reachOutStandingOf } from "../../reach-out/reach-out-leads.js";
import { leadCardEmailOf } from "../lead-card.js";
import { LEAD_CLOSED_WORDS, LEAD_LEFT_OUT_WORD, LEAD_REVIEW_WORD } from "../lead-words.js";
export const LEAD_SHEET_WORDS = {
  tabs: "About this lead",
  raise: "Show everything about them",
  lower: "Back to the card",
  close: "Close",
  more: "More for this lead",
  stage: "Stage",
  why: {
    head: "Why it fits",
    checks: (passed, of) => `${passed} of ${of} checks`,
    reasons: "Reasons to write now",
    people: "People here"
  },
  reach: { head: "Ways to reach them", sub: "best first", others: "Other addresses on their site" },
  emails: {
    steps: "The steps",
    vars: (name) => `Its variables, for ${name}`,
    to: "To",
    from: "From",
    when: "When",
    none: "Choose a sequence to see what they would get."
  },
  about: { links: "Their links", hours: "Their week" },
  /** The three tabs' own headings and doors (the refined canvas). */
  panes: {
    listing: "From the listing",
    company: "The company",
    writesTo: "The sequence writes to",
    where: "Where they are",
    steps: "Their steps",
    everyStep: (name) => `Every step, and who else is in it: ${name}`,
    takeOut: "Take out",
    wentOut: "What went out",
    takeOutLine: "Only of this sequence; Put back undoes. Stop writing to them anywhere is in the \u22EF."
  },
  activity: { stand: "In a sequence", found: "How it was found" },
  change: "Change",
  done: "Done",
  choose: (name) => `Which sequence, for ${name}`,
  /** Change's way into Sequences (the refined canvas): a version of the one chosen, or a new one, and back here. */
  versionOf: (name) => `Make a version of ${name}`,
  versionHint: "The same steps and mailboxes, a new first email, its own list. Made in Sequences.",
  newSequence: "New sequence",
  newSequenceHint: "Starts in Sequences with this lead, and comes back",
  chooseFootPile: "Used for the rest of this pile. A sequence fed by its own search takes its leads by itself.",
  chooseFoot: "Used for the leads you open next. A sequence fed by its own search takes its leads by itself.",
  fills: "Every field fills",
  greets: "Greets them as \u201Cthere\u201D",
  needs: (labels) => `Needs ${labels}`,
  emailOf: (name) => `${name} \xB7 email 1`,
  modeFirst: "No sequence takes leads you add yet. Add the ones you'd write to; you write to them once, at the end.",
  modeSearch: (name) => `This search has \u201C${name}\u201D, so every ready lead here goes. Not a fit is how one stays out.`,
  goesWith: (name) => `Goes with \u201C${name}\u201D`,
  phoneOnly: "No email found",
  phoneOnlyLine: "There's a number to call. Call saves what was said and moves on.",
  elsewhereIn: (name) => `In \u201C${name}\u201D`,
  elsewhereLine: "A business is written to once, so this one stays with that sequence.",
  inSequence: (name) => `In \u201C${name}\u201D`,
  stopped: "The sequence stopped",
  stoppedLine: "They wrote back, so nothing more goes. Answer them in the Inbox.",
  wroteBack: "They wrote back",
  endTitle: (decided) => decided ? `All ${decided} decided.` : "Nothing left to look at.",
  endAdded: (name) => `Added to \u201C${name}\u201D`,
  endHeld: "On your new list",
  endLater: "For later",
  endNotFit: "Not a fit",
  endNote: "Its next batch waits for your OK, because it carries leads you added.",
  endNoteFirst: "Next, write what they get. Nothing goes until you approve its first batch.",
  next: "Next",
  later: "Later",
  notFit: "Not a fit",
  add: "Add",
  hold: "Add to a new list",
  keep: "Keep",
  exclude: "Leave out",
  call: "Call",
  draft: "Draft an email",
  openIt: "Open it",
  itsSequence: "Its sequence",
  stop: "Stop writing",
  thread: "Open the thread",
  putBack: "Put back",
  ready: "Move back to Ready",
  laterAgain: (n) => `Later \xB7 ${n}`,
  leave: "Done for now",
  writeHeld: (n) => `Write to the ${n}`,
  openTarget: "Open the sequence",
  approveIn: (name) => `Approve in ${name}`,
  noTarget: "No sequence takes leads you add yet: start one from New message.",
  keepSub: (left) => `Counts this month \xB7 ${left} left`,
  back: "Back",
  hides: "Hides it from every search",
  lastWhy: "Your last reason",
  copyAll: "Copy everything",
  copied: "Copied what is known of them"
};
const ADDRESS_WHYS = /* @__PURE__ */ new Set(["no_email", "invalid"]);
const SETTING_WHYS = /* @__PURE__ */ new Set(["unconfirmed", "unchecked"]);
function settledOf(lead, story) {
  if (lead.cls === "excluded") return "closed";
  if (lead.cls === "review") return "review";
  if (lead.stage === "converted" || story && story.replied) return "replied";
  if (lead.stage === "archived" || story && story.bounced) return "closed";
  return lead.inSequence ? "sequence" : null;
}
function checkStateOf(check, lead) {
  if (!check) return null;
  if (check.why === "elsewhere") return "elsewhere";
  if (check.why === "already") return "sequence";
  if (check.why === "checking") return "finding";
  if (ADDRESS_WHYS.has(check.why)) return lead.canCall ? "phone" : "closed";
  return SETTING_WHYS.has(check.why) ? "gap" : "closed";
}
export function leadSheetStateOf(p) {
  const settled = settledOf(p.lead, p.story) ?? checkStateOf(p.check, p.lead);
  if (settled) return settled;
  if (!p.lead.hasEmail || p.lead.emailState === "invalid") return p.lead.canCall ? "phone" : "closed";
  if (p.lead.emailState === "checking") return "finding";
  return p.email && (p.email.blocked || p.email.note) ? "gap" : "ready";
}
export function leadSheetClosedOf(p) {
  const call = p.lead.canCall ? "call" : null;
  if (p.lead.cls === "excluded")
    return {
      title: LEAD_LEFT_OUT_WORD,
      line: "Left out of this search. Put back brings it in again.",
      fix: "put_back"
    };
  if (p.lead.stage === "archived") {
    const word = p.closedReason && p.closedReason in LEAD_CLOSED_WORDS ? LEAD_CLOSED_WORDS[p.closedReason] : "Closed";
    return { title: word, line: "Closed: nothing is written to them.", fix: "ready" };
  }
  if (p.lead.emailState === "invalid")
    return { title: "Their address bounced", line: "Nothing more goes to it.", fix: call };
  if (!p.lead.hasEmail && !p.lead.canCall)
    return { title: "No way to reach them yet", line: "No address and no number were found.", fix: null };
  return { title: "Can't be written to", line: p.blocked ?? "This one can't be added.", fix: call };
}
function meterOf(dots) {
  const parts = dots.slice(0, 5).map((d) => d.answer === "yes" ? d.how === "read" ? "read" : "ok" : d.answer === "unknown" ? "warn" : "rest");
  while (parts.length < 5) parts.push("rest");
  return parts;
}
export function leadSheetFitOf(vm, state) {
  const base = { meter: meterOf(vm.checkDots), tip: vm.checksSummary };
  if (state === "review") return { ...base, pill: { kind: "lead_class", value: "review", label: LEAD_REVIEW_WORD } };
  if (state === "sequence" || state === "elsewhere")
    return { ...base, pill: { kind: "lead_stage", value: "nurture", label: "Contacted" } };
  if (state === "replied") return { ...base, pill: { kind: "lead_stage", value: "converted", label: "Talking" } };
  if (state === "closed" && vm.stage === "archived")
    return { ...base, pill: { kind: "lead_stage", value: "archived", label: "Closed" } };
  const news = vm.fit.cls !== "strong" && vm.fit.word;
  return { ...base, pill: news ? { kind: "lead_fit", value: vm.fit.cls, label: vm.fit.word } : null };
}
const toneOf = (state) => state === "ok" ? "ok" : state === "checking" ? "info" : state === "none" ? "none" : "warn";
export function leadSheetCellsOf(vm) {
  const email = vm.slots.mailbox;
  const phone = vm.slots.phone;
  const third = vm.company && vm.links.linkedin ? { key: "linkedin", label: "LinkedIn", word: null, tone: "ok", tip: vm.links.linkedin.label } : vm.links.website ? {
    key: "site",
    label: "Site",
    word: vm.links.instagram ? "+ Insta" : null,
    tone: "ok",
    tip: vm.links.website.label
  } : { key: "site", label: "Site", word: "none", tone: "none", tip: "No website was found." };
  return [
    {
      key: "email",
      label: "Email",
      word: email.state === "ok" ? null : email.word,
      tone: toneOf(email.state),
      tip: vm.reach.email.tip
    },
    {
      key: "phone",
      label: "Phone",
      word: phone.state === "ok" ? null : phone.word,
      tone: toneOf(phone.state),
      tip: vm.reach.phone ? vm.reach.phone.tip : phone.tip
    },
    third
  ];
}
const slot = (act, label, icon, key = null) => ({
  act,
  label,
  icon,
  key,
  sub: null,
  off: null
});
const SW = LEAD_SHEET_WORDS;
export function leadSheetEndRailOf(p) {
  const last = p.held ? slot("write_held", SW.writeHeld(p.held), "send") : p.target ? slot("open_target", SW.approveIn(p.target), "chevron") : slot("leave", SW.leave, "check");
  return {
    x: false,
    slots: [
      ...p.later > 0 ? [slot("later_again", SW.laterAgain(p.later), "clock")] : [],
      ...last.act === "leave" ? [] : [slot("leave", SW.leave, "x")],
      last
    ]
  };
}
const stepLabel = (n, hand) => hand === "call" ? "A call for you" : hand === "note" ? "A note for you" : n === 0 ? "First email" : "Follow-up";
function sheetStepOf(s, day, t, clock) {
  const sends = t.sends.filter((x) => x.n === s.n);
  const gone = sends.find((x) => x.sent_at || x.left);
  const label = stepLabel(s.n, s.hand);
  if (gone) {
    const at2 = gone.sent_at ? Date.parse(gone.sent_at) : NaN;
    const when = Number.isFinite(at2) ? clockDate(at2, clock.tz, clock.nowMs) : "";
    return { n: s.n, day, label, sub: gone.bounced ? "Bounced" : "Sent", when, look: "done" };
  }
  const planned = sends.find((x) => x.send_at);
  const at = planned && planned.send_at ? Date.parse(planned.send_at) : NaN;
  if (Number.isFinite(at))
    return { n: s.n, day, label, sub: "Planned", when: clockNear(at, clock.tz, clock.nowMs), look: "next" };
  const wait = s.after_days ? `+${plural(s.after_days, "day", "days")}` : "";
  return {
    n: s.n,
    day,
    label,
    sub: s.n === 0 ? "In its next batch" : "If nothing comes back",
    when: wait,
    look: "later"
  };
}
export function leadSheetTrackOf(t, nowMs, tz) {
  if (!t.chain) return null;
  const known = t.chain.steps ?? [...new Set(t.sends.map((s) => s.n).filter((n) => n !== null))].map((n) => ({
    n,
    after_days: null,
    hand: null
  }));
  let day = 1;
  const steps = [...known].sort((a, b) => a.n - b.n).map((s) => {
    if (s.n > 0) day += s.after_days ?? 0;
    return sheetStepOf(s, day, t, { nowMs, tz });
  });
  const later = steps.find((s) => s.look === "later");
  if (later && !steps.some((s) => s.look === "next")) later.look = "next";
  const standing = reachOutStandingOf(t, nowMs, tz);
  return { name: t.chain.name, rootId: t.chain.root_id, steps, line: standing ? capitalize(standing.line) : null };
}
export function leadSheetStoryOf(t) {
  if (!t) return null;
  return {
    replied: t.readings.some((r) => !r.undone && r.claim !== "auto_reply"),
    bounced: t.sends.some((s) => s.bounced)
  };
}
export function leadSheetReplyOf(t) {
  if (!t) return null;
  const r = [...t.readings].reverse().find((x) => !x.undone && x.claim !== "auto_reply");
  return r && r.summary ? r.summary : null;
}
export function leadSheetOptionsOf(p) {
  return p.chains.map((c) => {
    const email = p.lead ? leadCardEmailOf({ chain: c, lead: p.lead, workspace: p.workspace, nowMs: p.nowMs, tz: p.tz }) : null;
    const holes = email && email.blocked ? email.blocked : null;
    const steps = c.steps.filter((s) => !s.hand).length;
    return {
      rootId: c.root_id,
      name: c.name,
      meta: `${plural(steps, "email", "emails")} \xB7 ${c.owner_sends ? "from your own inbox" : "from your mailboxes"}`,
      fill: holes ? holes : email && email.note ? SW.greets : SW.fills,
      tone: holes ? "warn" : "ok",
      on: c.root_id === p.picked
    };
  });
}
export function leadSheetReasonsOf(vm) {
  if (vm.company) return [];
  return [
    ...vm.rated && vm.rated.low ? [{ text: vm.rated.low, tone: "warn", from: "its listing" }] : [],
    ...vm.claimedNote ? [{ text: "Listing not claimed", tone: "info", from: "its listing" }] : []
  ];
}
export function leadSheetAboutOf(vm) {
  const listing = vm.company ? vm.company.source : "its listing";
  const rows = [
    ...vm.rated ? [
      {
        k: "Rating",
        v: [vm.rated.score, vm.rated.reviews, vm.rated.low].filter(Boolean).join(" \xB7 "),
        from: "listing"
      }
    ] : [],
    ...vm.weekSummary ? [{ k: "Hours", v: vm.weekSummary, from: "listing" }] : [],
    ...vm.where ? [{ k: "Address", v: vm.where.line, from: vm.distance || null }] : [],
    ...vm.about ? [{ k: "About", v: vm.about, from: null }] : [],
    // The listing's own facts, each said once: the rating is the row above, with its low share.
    ...vm.facts.filter((f) => !(vm.rated && f.k === "Rated")).map((f) => ({ k: f.k, v: f.v, from: null }))
  ];
  return { head: vm.company ? "The company" : "The place", from: vm.company ? listing : "its listing", rows };
}
export function leadSheetStandOf(p) {
  if (p.track) return { title: SW.inSequence(p.track.name), line: p.track.line ?? "" };
  if (p.state === "closed" && p.closed) return { title: p.closed.title, line: p.closed.line };
  if (p.searchWrites)
    return { title: "Not in a sequence yet", line: `${SW.goesWith(p.searchWrites)} in its next batch.` };
  return {
    title: "Not in a sequence yet",
    line: p.target ? `Add puts it on \u201C${p.target}\u201D's list; it goes in its next batch.` : SW.noTarget
  };
}
export function leadSheetChecksOf(vm) {
  const passed = vm.checkDots.filter((d) => d.answer === "yes").length;
  return SW.why.checks(passed, vm.checkDots.length);
}
