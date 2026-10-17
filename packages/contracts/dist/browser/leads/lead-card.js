import { capitalize } from "../shared/words.js";
import {
  REACH_OUT_OPENING_MARK,
  REACH_OUT_VALUE_MARKS,
  reachOutCardEmailOf,
  reachOutCardSlotsOf
} from "../reach-out/reach-out-rules.js";
import { REACH_OUT_SLOT_SET } from "../reach-out/reach-out-words.js";
import {
  REACH_OUT_WHY_NOT_WORDS,
  reachOutWhenOf
} from "../reach-out/reach-out-leads.js";
import { chainPaceOf } from "../reach-out/reach-out-sheet.js";
import { slotMentions } from "../templates/slot-sets.js";
export const LEAD_CARD_WORDS = {
  emailOf: (k, of) => of > 1 ? `Email ${k} of ${of}` : "Email 1",
  fromInbox: "from your own inbox",
  fromBoxes: "from your mailboxes",
  to: "To",
  subject: "Subject",
  opening: "A line about them, written when its batch is planned. You read it before it goes.",
  greets: (fallback) => `Nobody is named here, so it greets them as \u201C${fallback}\u201D.`,
  checking: "once their address checks out",
  holes: (labels) => `Its words need ${labels.join(" and ")}, which this lead doesn't have, so Add is off. Change the words in the sequence.`,
  firstPile: "You write their email once, when you write to them all at the end.",
  after: (days) => `${days ?? "?"} days after, if nothing comes back`,
  emailsTitle: "What they would get",
  noEmails: "This sequence has no email to show yet.",
  elsewhere: (name) => `They're with \u201C${name}\u201D already, and a lead is in one sequence at a time, so Add is off.`,
  callTip: "No email can go to them, so the yes here is a call from your phone.",
  choose: "Someone else named there can be written to instead: choose them on Reach.",
  slotsTitle: "What fills their words"
};
const LEAD_CARD_WHY_NOT = {
  gone: "They're no longer in your leads, so Add is off.",
  closed: "They were already worked, so Add is off.",
  customer: "They're already a customer, so Add is off.",
  suppressed: "They asked not to be written to, so Add is off.",
  written: "They were already written to, and a business is written to once, so Add is off.",
  shared: "They share a number or a site with another lead, and a business is written to once, so Add is off.",
  no_email: "No address to write to, so Add is off.",
  checking: "Their address is still being checked.",
  unconfirmed: "Their address can't be confirmed, and this sequence writes only to confirmed ones, so Add is off.",
  invalid: "Their address bounced, so Add is off.",
  unchecked: "Their address hasn't been checked yet, so Add is off.",
  already: "They're on this sequence's list already.",
  not_counted: "They're still in Needs review: keep them first.",
  elsewhere: "They're in another sequence already, and a lead is in one sequence at a time, so Add is off."
};
const ADDRESS_WHYS = /* @__PURE__ */ new Set(["no_email", "invalid", "unconfirmed", "unchecked"]);
export const LEAD_CARD_TABS = [
  { id: "why", label: "Why" },
  { id: "reach", label: "Reach" },
  { id: "emails", label: "Emails" },
  { id: "about", label: "About" },
  { id: "activity", label: "Activity" }
];
const slotLabel = (key) => {
  const at = REACH_OUT_SLOT_SET.keys.indexOf(key);
  return (REACH_OUT_SLOT_SET.labels[at] || key).toLowerCase();
};
const VALUE_RE = new RegExp(
  `${REACH_OUT_VALUE_MARKS[0]}([^${REACH_OUT_VALUE_MARKS[1]}]*)${REACH_OUT_VALUE_MARKS[1]}`,
  "g"
);
function cardValuesOf(text) {
  const parts = [];
  let from = 0;
  for (const m of text.matchAll(VALUE_RE)) {
    const at = m.index ?? 0;
    if (at > from) parts.push(...gapsOf(text.slice(from, at)));
    parts.push({ kind: "value", text: m[1] ?? "" });
    from = at + m[0].length;
  }
  if (from < text.length) parts.push(...gapsOf(text.slice(from)));
  return parts;
}
function gapsOf(text) {
  const parts = [];
  let from = 0;
  for (const m of slotMentions(REACH_OUT_SLOT_SET, text)) {
    if (m.index > from) parts.push({ kind: "text", text: text.slice(from, m.index) });
    parts.push({ kind: "gap", label: slotLabel(m.key) });
    from = m.index + m.written.length;
  }
  if (from < text.length) parts.push({ kind: "text", text: text.slice(from) });
  return parts;
}
export function leadCardPartsOf(text) {
  const pieces = text.split(REACH_OUT_OPENING_MARK);
  return pieces.flatMap((piece, i) => {
    const words = piece.replace(i > 0 ? /^\n+/ : /^/, "").replace(i < pieces.length - 1 ? /\n+$/ : /$/, "");
    return [...i > 0 ? [{ kind: "opening" }] : [], ...words ? cardValuesOf(words) : []];
  });
}
const signedAs = (chain, w) => ({ ...w, yourName: chain.signed_by });
const emailSteps = (chain) => chain.steps.filter((s) => !s.hand).sort((a, b) => a.n - b.n);
function fromWords(chain) {
  if (chain.owner_sends) return LEAD_CARD_WORDS.fromInbox;
  const one = chainPaceOf(chain).from;
  if (one) return `from ${one}`;
  return chain.mailboxes.length > 1 ? LEAD_CARD_WORDS.fromBoxes : null;
}
function blockedOf(holes, check) {
  if (check)
    return check.why === "elsewhere" && check.chain_name ? LEAD_CARD_WORDS.elsewhere(check.chain_name) : LEAD_CARD_WHY_NOT[check.why];
  return holes.length ? LEAD_CARD_WORDS.holes(holes.map(slotLabel)) : null;
}
function insteadOf(lead, check) {
  if (!check || !ADDRESS_WHYS.has(check.why)) return null;
  if (lead.canChoose) return "choose";
  return lead.canCall ? "call" : null;
}
export function leadCardEmailOf(p) {
  const steps = emailSteps(p.chain);
  const first = steps[0];
  if (!first) return null;
  const email = reachOutCardEmailOf(
    { subject: first.subject ?? "", body: first.body },
    p.lead,
    signedAs(p.chain, p.workspace)
  );
  const from = fromWords(p.chain);
  const when = reachOutWhenOf(
    {
      root_id: p.chain.root_id,
      name: p.chain.name,
      state: p.chain.state,
      fed_by: p.chain.fed_by,
      run_hour: p.chain.next.run_hour,
      last_run_for: p.chain.next.last_run_for,
      waiting_run_id: p.chain.next.waiting_run_id
    },
    p.nowMs,
    p.tz
  );
  const blocked = blockedOf(email.holes, p.check);
  return {
    head: [LEAD_CARD_WORDS.emailOf(1, steps.length), from].filter(Boolean).join(" \xB7 "),
    to: p.lead.to,
    subject: email.subject === null ? null : leadCardPartsOf(email.subject),
    body: leadCardPartsOf(email.body),
    when: blocked ? null : capitalize(p.lead.emailState === "checking" && !p.check ? `${when}, ${LEAD_CARD_WORDS.checking}` : when),
    note: email.fellBack.includes("first name") ? LEAD_CARD_WORDS.greets("there") : null,
    blocked,
    instead: insteadOf(p.lead, p.check)
  };
}
export function leadCardStepsOf(p) {
  const w = signedAs(p.chain, p.workspace);
  return emailSteps(p.chain).map((s, i) => {
    const email = reachOutCardEmailOf({ subject: i === 0 ? s.subject ?? "" : null, body: s.body }, p.lead, w);
    return {
      id: s.id,
      label: `Email ${i + 1}`,
      after: i === 0 ? null : LEAD_CARD_WORDS.after(s.after_days),
      subject: email.subject === null ? null : leadCardPartsOf(email.subject),
      body: leadCardPartsOf(email.body),
      gap: email.holes.length > 0
    };
  });
}
const LEAD_CARD_SLOT_FROM = {
  place: "From their listing",
  company: "From their source",
  person: "Of the person it writes to, from their source",
  workspace: "Your workspace's name, in Settings",
  signs: "The name this sequence signs with",
  booking: "Your booking link, in Settings",
  opening: "Written for them when its batch is planned, and read by you before it goes",
  fallback: (said) => `Nobody is named here, so it says \u201C${said}\u201D`,
  gap: "They have none, so the send would hold this email"
};
function slotFromOf(key, company) {
  if (key === "your business") return LEAD_CARD_SLOT_FROM.workspace;
  if (key === "your name") return LEAD_CARD_SLOT_FROM.signs;
  if (key === "booking link") return LEAD_CARD_SLOT_FROM.booking;
  if (key === "first name" || key === "title" || key === "role") return LEAD_CARD_SLOT_FROM.person;
  return company ? LEAD_CARD_SLOT_FROM.company : LEAD_CARD_SLOT_FROM.place;
}
export function leadCardSlotsOf(p) {
  const texts = emailSteps(p.chain).flatMap((s, i) => i === 0 ? [s.subject ?? "", s.body] : [s.body]);
  const company = p.lead.kind === "company";
  return reachOutCardSlotsOf(texts, p.lead, signedAs(p.chain, p.workspace)).map((s) => {
    const label = capitalize(slotLabel(s.key));
    if (s.key === "opening")
      return { key: s.key, label, value: null, from: LEAD_CARD_SLOT_FROM.opening, look: "later" };
    if (s.value === null) return { key: s.key, label, value: null, from: LEAD_CARD_SLOT_FROM.gap, look: "gap" };
    if (s.fellBack)
      return { key: s.key, label, value: s.value, from: LEAD_CARD_SLOT_FROM.fallback(s.value), look: "fallback" };
    return { key: s.key, label, value: s.value, from: slotFromOf(s.key, company), look: "value" };
  });
}
const LEAD_CARD_BULK_WORDS = {
  door: (n) => `Add all ${n}\u2026`,
  title: (target) => `Add them to \u201C${target}\u201D`,
  goes: "Go as they are",
  there: "Greeted as \u201Cthere\u201D: nobody is named",
  checking: "Go once their address checks out",
  elsewhere: "In another sequence already",
  cant: "Can't be written to",
  holes: "missing what its words need",
  press: (n) => n ? `Add the ${n}` : "None can be added",
  waiting: "Asking which of them can go\u2026"
};
export const leadCardBulkDoorOf = (n) => LEAD_CARD_BULK_WORDS.door(n);
const countsWords = (counts) => [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([w, n]) => `${n} ${w}`).join(", ");
function bucketOf(chain, b, w) {
  const c = b.check;
  if (c) return c.why === "elsewhere" ? ["elsewhere", c.chain_name] : ["cant", REACH_OUT_WHY_NOT_WORDS[c.why]];
  const first = emailSteps(chain)[0];
  const email = first ? reachOutCardEmailOf({ subject: first.subject ?? "", body: first.body }, b.lead, w) : null;
  if (email && email.holes.length) return ["cant", LEAD_CARD_BULK_WORDS.holes];
  if (b.lead.emailState === "checking") return ["checking", null];
  return email && email.fellBack.length ? ["there", null] : ["goes", null];
}
export function leadCardBulkOf(p) {
  const w = signedAs(p.chain, p.workspace);
  const ids = [];
  const n = /* @__PURE__ */ new Map();
  const why = { elsewhere: /* @__PURE__ */ new Map(), cant: /* @__PURE__ */ new Map() };
  let waiting = 0;
  for (const b of p.leads) {
    if (b.check === void 0) {
      waiting += 1;
      continue;
    }
    const [key, words] = bucketOf(p.chain, b, w);
    n.set(key, (n.get(key) ?? 0) + 1);
    if (key === "elsewhere" || key === "cant") {
      const said = key === "elsewhere" ? words ? `with \u201C${words}\u201D` : "with another" : words ?? "";
      why[key].set(said, (why[key].get(said) ?? 0) + 1);
    } else ids.push(b.id);
  }
  const keys = ["goes", "there", "checking", "elsewhere", "cant"];
  return {
    title: LEAD_CARD_BULK_WORDS.title(p.chain.name),
    ids,
    buckets: keys.filter((k) => (n.get(k) ?? 0) > 0).map((k) => ({
      key: k,
      label: LEAD_CARD_BULK_WORDS[k],
      n: n.get(k) ?? 0,
      note: k === "elsewhere" || k === "cant" ? countsWords(why[k]) : null,
      goes: k !== "elsewhere" && k !== "cant"
    })),
    press: waiting ? LEAD_CARD_BULK_WORDS.waiting : LEAD_CARD_BULK_WORDS.press(ids.length),
    waiting
  };
}
const LEAD_CARD_REASON_WORDS = {
  lowShare: (share) => `${capitalize(share)} of its reviews are 1 or 2 stars`,
  unclaimed: "nobody has claimed its listing",
  both: (low) => `${low}, and nobody has claimed its listing.`,
  fromListing: "Seen on its listing: the spread of its reviews and its claim mark.",
  fromJudge: "Claude's reading of its listing and its website. A reading, not a fact on the page.",
  fromCompany: "What its source says of the company."
};
export function leadCardReasonOf(vm) {
  const low = vm.rated?.low ?? null;
  const share = low ? low.replace(/\s*at 1.2 stars?$/i, "").trim() : null;
  const unclaimed = !!vm.claimedNote && !vm.company;
  if (share && unclaimed)
    return {
      text: LEAD_CARD_REASON_WORDS.both(LEAD_CARD_REASON_WORDS.lowShare(share)),
      from: LEAD_CARD_REASON_WORDS.fromListing,
      how: "seen"
    };
  if (share)
    return {
      text: `${LEAD_CARD_REASON_WORDS.lowShare(share)}.`,
      from: LEAD_CARD_REASON_WORDS.fromListing,
      how: "seen"
    };
  if (unclaimed)
    return {
      text: `${capitalize(LEAD_CARD_REASON_WORDS.unclaimed)}.`,
      from: LEAD_CARD_REASON_WORDS.fromListing,
      how: "seen"
    };
  const sentence = vm.fit.sentence.trim();
  if (!sentence) return null;
  return {
    text: sentence,
    from: vm.company ? LEAD_CARD_REASON_WORDS.fromCompany : LEAD_CARD_REASON_WORDS.fromJudge,
    how: vm.company ? "seen" : "read"
  };
}
export const LEAD_CARD_MARKS_MAX = 4;
export function leadCardMarksOf(vm) {
  const all = vm.groups.flatMap(
    (g) => g.checks.filter((c) => c.answer !== "no").map((c) => ({ key: c.key, label: c.label, how: g.how, answer: c.answer, from: c.source }))
  );
  const rank = (m) => m.answer === "unknown" ? 0 : m.how === "seen" ? 1 : 2;
  return all.sort((a, b) => rank(a) - rank(b)).slice(0, LEAD_CARD_MARKS_MAX);
}
