import { capitalize, plural } from "../../shared/words.js";
import { clockDate, clockNear } from "../../shared/clock.js";
import { reachOutStandingOf } from "../../reach-out/reach-out-leads.js";
import { leadCardEmailOf } from "../lead-card.js";
import { LEAD_CLOSED_WORDS, LEAD_LEFT_OUT_WORD } from "../lead-words.js";
export const LEAD_SHEET_WORDS = {
  tabs: "About this lead",
  raise: "Show everything about them",
  lower: "Back to the card",
  close: "Close",
  more: "More for this lead",
  stage: "Stage",
  why: {
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
    email: "Email",
    /** The site's row opens it, in a tab of its own: said once, here, and nowhere else in Contact. */
    openSite: "Open their site",
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
  notInYet: "Not in a sequence yet",
  stopped: "The sequence stopped",
  wroteBack: "They wrote back",
  /** Their reply as Claude read it: a reading, so never in quotation marks as if their words. */
  readAs: "Their reply, as read",
  /** Every lead the pile went through: added, set aside and put off alike. */
  endTitle: (looked) => looked ? `All ${looked} looked at.` : "Nothing left to look at.",
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
  const last = p.held ? slot("write_held", SW.writeHeld(p.held), "send") : p.target && p.added > 0 ? slot("open_target", SW.approveIn(p.target), "chevron") : slot("leave", SW.leave, "check");
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
  if (sends.some((x) => x.state === "held"))
    return { n: s.n, day, label, sub: "Held by the check", when: "", look: "next" };
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
export function leadSheetAboutOf(vm) {
  const listing = vm.company ? vm.company.source : "its listing";
  const rows = [
    ...vm.rated ? [
      {
        k: "Rating",
        // The low-star share is the card's reason, said once there.
        v: [vm.rated.score, vm.rated.reviews].join(" \xB7 "),
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
  const b = p.box;
  return { title: b.verb && b.name ? `${b.verb} \u201C${b.name}\u201D` : SW.notInYet, line: b.line };
}
