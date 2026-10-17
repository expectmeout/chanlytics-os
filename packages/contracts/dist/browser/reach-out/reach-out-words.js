import { isFreeMail } from "../email/free-mail.js";
import { posesAsReply } from "../email/email-subject.js";
import { languageName } from "../templates/template-languages.js";
import { siteHost } from "../leads/search/clean.js";
import { violatesNoPrices } from "../config/policy.js";
import { normalizeEmail } from "../shared/email-address.js";
import { emailIssues } from "../templates/message-versions.js";
import { namedSlots, slotCountIn, slotFault, slotMentions, slotsOut } from "../templates/slot-sets.js";
import { HAND_WORDS_MAX } from "./reach-out-hand.js";
export const REACH_OUT_SLOTS = [
  "opening",
  "business",
  "city",
  "your name",
  "your business",
  "booking link",
  // A company's addressee (00430), after the six: a slot's place is its number in a stored version ({{2}} is business),
  // so a slot is only ever added at the end.
  "first name",
  "company",
  "title",
  "role"
];
export const REACH_OUT_SLOT_FALLBACKS = {
  "first name": "there"
};
export const REACH_OUT_SLOT_WORDS = {
  opening: "written for each business",
  "first name": `the person's first name at a company; \u201C${REACH_OUT_SLOT_FALLBACKS["first name"]}\u201D where nobody is named`,
  business: "their name on Google, or their company's",
  company: "their company's name, or their business's",
  title: "the person's title at a company; a business with nobody named is not written to with it",
  role: "the person's role (owner, director, manager); a business with nobody named is not written to with it",
  city: "their city",
  "your name": "the name you sign with",
  "your business": "your business's name",
  "booking link": "your booking link"
};
const REACH_OUT_SLOT_LABELS = {
  opening: "Opening",
  "first name": "First name",
  business: "Their business",
  company: "Their company",
  title: "Their title",
  role: "Their role",
  city: "Their city",
  "your name": "Your name",
  "your business": "Your business",
  "booking link": "Booking link"
};
export const REACH_OUT_SLOT_SET = namedSlots(
  REACH_OUT_SLOTS,
  REACH_OUT_SLOTS.map((s) => REACH_OUT_SLOT_LABELS[s])
);
export const REACH_OUT_SUBJECT_MAX = 80;
export const REACH_OUT_BODY_MAX = 1200;
export const REACH_OUT_WORDS_MAX = 120;
export const OPENING_WORDS_MAX = 40;
export const OPENING_CHARS_MAX = 400;
export const ANGLE_WORDS_MAX = 3;
export const REACH_OUT_STEPS_MAX = 5;
export const REACH_OUT_MAILBOXES_MAX = 10;
export const REACH_OUT_NAME_MAX = 80;
export const SIGNED_BY_MAX = 60;
export const REACH_OUT_GAP_MINUTES = [5, 8, 12, 20, 30, 60];
export const REACH_OUT_AFTER_DAYS = { min: 2, max: 30, first: 4 };
export function slotCount(text, slot) {
  return slotCountIn(REACH_OUT_SLOT_SET, text, slot);
}
export function reachOutSlotFault(text) {
  return slotFault(REACH_OUT_SLOT_SET, text);
}
export function wordsNeedOpening(w) {
  return slotCount(`${w.subject ?? ""}
${w.body}`, "opening") > 0;
}
export function wordCount(text) {
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}
export function emailWordCount(text) {
  const slots = slotMentions(REACH_OUT_SLOT_SET, text).reduce(
    (n, m) => n + (m.key === "opening" ? OPENING_WORDS_MAX : 1),
    0
  );
  return slots + wordCount(slotsOut(REACH_OUT_SLOT_SET, text));
}
const ADDRESS = /[^\s@<>]+@[^\s@<>]+/g;
const SCHEME_OR_WWW = /\bhttps?:\/\/[^\s<>]+|\bwww\.[^\s<>]+/gi;
const BARE_HOST = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}\b(?:\/[^\s<>]*)?/g;
export function linksIn(text) {
  const out = [];
  const rest = slotsOut(REACH_OUT_SLOT_SET, text).replace(ADDRESS, " ").replace(SCHEME_OR_WWW, (m) => {
    out.push(m);
    return " ";
  });
  for (const m of rest.matchAll(BARE_HOST)) out.push(m[0]);
  return out;
}
export function linkCount(text) {
  return linksIn(text).length + slotCount(text, "booking link");
}
export function shoutingLine(text) {
  let run = 0;
  for (const line of slotsOut(REACH_OUT_SLOT_SET, text).split(/\r\n|\r|\n/)) {
    const letters = line.replace(/[^\p{L}]/gu, "");
    const capitals = letters !== "" && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
    run = capitals ? run + letters.length : 0;
    if (run >= 8) return true;
  }
  return false;
}
function coldSubjectProblems(subject) {
  const out = [];
  if (posesAsReply(subject)) out.push("subject_poses_as_reply");
  if (slotCount(subject, "opening") > 0) out.push("opening_in_subject");
  if (linkCount(subject) > 0) out.push("link_in_subject");
  if (shoutingLine(subject)) out.push("shouting");
  return out;
}
function coldBodyProblems(body) {
  const out = [];
  if (slotCount(body, "opening") > 1) out.push("opening_twice");
  if (emailWordCount(body) > REACH_OUT_WORDS_MAX) out.push("too_many_words");
  if (linkCount(body) > 1) out.push("too_many_links");
  if (shoutingLine(body)) out.push("shouting");
  return out;
}
export function reachOutRules(first) {
  return {
    slots: REACH_OUT_SLOT_SET,
    subject: first,
    subjectMax: REACH_OUT_SUBJECT_MAX,
    bodyMax: REACH_OUT_BODY_MAX,
    subjectAlso: coldSubjectProblems,
    bodyAlso: coldBodyProblems,
    say: wordsIssueWords,
    foot: REACH_OUT_FOOT_NOTE
  };
}
const REACH_OUT_FOOT_NOTE = "The footer is added when it goes: why they are hearing from you, who you are and where, and how to say no.";
export function validateReachOutWords(w, first) {
  return emailIssues({ subject: (w.subject ?? "").trim(), body: w.body.trim() }, reachOutRules(first));
}
export function wordsIssueWords(i) {
  switch (i.problem) {
    case "subject_missing":
      return "Give your email a subject.";
    case "subject_too_long":
      return `Keep the subject under ${REACH_OUT_SUBJECT_MAX} characters.`;
    case "subject_poses_as_reply":
      return "A first email can't start with Re: or Fwd:.";
    case "opening_in_subject":
      return "The opening goes in the email, not the subject.";
    case "link_in_subject":
      return "Keep links out of the subject.";
    case "body_missing":
      return "Write what you'd say.";
    case "body_too_long":
      return `Keep it under ${REACH_OUT_BODY_MAX.toLocaleString("en-US")} characters.`;
    case "unknown_slot":
      return `{{${i.slot ?? ""}}} isn't one of the slots. Use one from the list.`;
    case "stray_brace":
      return "Braces are for slots only, two on each side: {{business}}.";
    case "opening_twice":
      return "The opening goes in once.";
    case "too_many_words":
      return `Keep it under ${REACH_OUT_WORDS_MAX} words, counting the opening as ${OPENING_WORDS_MAX}.`;
    case "too_many_links":
      return "One link at most. A second reads like a pitch.";
    case "shouting":
      return "A line in capitals reads like spam.";
  }
}
export function validateReachOutChain(c, has) {
  const out = [];
  c.steps.forEach((s, i) => {
    if (s.hand) out.push(...handIssues(s.hand, i, c.steps.length));
    else
      for (const w of validateReachOutWords({ subject: s.subject, body: s.body }, i === 0)) out.push({ step: i, ...w });
    if (i === 0 && s.after_days !== null) out.push({ step: 0, field: "after_days", problem: "first_has_a_delay" });
    if (i === 0 && !s.hand && (linksIn(`${s.subject ?? ""}
${s.body}`).length > 0 || slotCount(s.body, "booking link") > 0))
      out.push({ step: 0, field: "body", problem: "first_has_a_link" });
    if (i > 0 && s.after_days === null) out.push({ step: i, field: "after_days", problem: "step_needs_a_delay" });
  });
  const said = c.steps.filter((s) => !s.hand).map((s, i) => `${i === 0 ? s.subject ?? "" : ""}
${s.body}`).join("\n");
  if (slotCount(said, "your name") > 0 && !c.signed_by?.trim())
    out.push({ step: null, field: "signed_by", problem: "no_name_to_sign" });
  if (slotCount(said, "booking link") > 0 && !has.bookingLink)
    out.push({ step: null, field: "body", problem: "no_booking_link" });
  return out;
}
function handIssues(hand, i, steps) {
  const out = [];
  if (i === 0 || i < steps - 1) out.push({ step: i, field: "body", problem: "hand_not_last" });
  const words = hand.words.trim();
  if (!words) out.push({ step: i, field: "body", problem: "hand_words_empty" });
  else if (words.length > HAND_WORDS_MAX) out.push({ step: i, field: "body", problem: "hand_words_long" });
  return out;
}
export function chainIssueWords(i) {
  switch (i.problem) {
    case "hand_not_last":
      return "A call or a note ends the chain.";
    case "hand_words_empty":
      return "Say what to do when they come up.";
    case "hand_words_long":
      return `Keep it under ${HAND_WORDS_MAX} characters.`;
    case "first_has_a_delay":
      return "Your email goes on day one.";
    case "step_needs_a_delay":
      return "Say how many days after the one before.";
    case "no_name_to_sign":
      return "Your words name {{your name}}. Say the name you sign with.";
    case "no_booking_link":
      return "Your words name {{booking link}}. Add your booking link in Settings \u203A Business first.";
    case "first_has_a_link":
      return "Keep your first email free of links: put your booking link in the nudge.";
    default:
      return wordsIssueWords({ field: i.field === "subject" ? "subject" : "body", problem: i.problem, slot: i.slot });
  }
}
export const OPENING_FACT_KEYS = [
  "category",
  "city",
  "rating",
  "reviews",
  "website",
  "hours",
  "about",
  "why_it_fits"
];
export function isOpeningFactKey(k) {
  return OPENING_FACT_KEYS.includes(k);
}
export function factValue(r, k) {
  const v = r[k];
  if (v === null || v === void 0) return null;
  const s = String(v).trim();
  return s ? s : null;
}
const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
function recordNumbers(r) {
  const out = /* @__PURE__ */ new Set();
  const add = (n) => {
    out.add(String(n));
    out.add(n.toLocaleString("en-US"));
    out.add(n.toFixed(1));
  };
  if (r.rating !== null) {
    add(r.rating);
    add(5);
  }
  if (r.reviews !== null) add(r.reviews);
  for (const text of [r.business_name, r.category, r.city, r.hours, r.about, r.why_it_fits])
    for (const m of (text ?? "").matchAll(NUMBER)) out.add(m[0].replace(/,$/, ""));
  return out;
}
export const OPENING_PROBLEMS = [
  "empty",
  "too_long",
  "link",
  "brace",
  "shouting",
  "price",
  "angle",
  "unnamed_fact",
  "unbacked_number"
];
export function isOpeningProblem(p) {
  return OPENING_PROBLEMS.includes(p ?? "");
}
export function checkOpening(o, r) {
  const text = o.opening.trim();
  if (!text) return "empty";
  if (wordCount(text) > OPENING_WORDS_MAX || text.length > OPENING_CHARS_MAX) return "too_long";
  let unnamed = text;
  for (const own of [r.business_name, r.city]) if (own?.trim()) unnamed = unnamed.split(own.trim()).join(" ");
  if (linksIn(unnamed).length > 0 || /@/.test(unnamed)) return "link";
  if (/\{\{|\}\}/.test(text)) return "brace";
  if (shoutingLine(text)) return "shouting";
  if (violatesNoPrices(text)) return "price";
  const angle = o.angle.trim().split(/\s+/).filter(Boolean);
  if (angle.length === 0 || angle.length > ANGLE_WORDS_MAX) return "angle";
  for (const k of o.facts_used) if (!isOpeningFactKey(k) || !factValue(r, k)) return "unnamed_fact";
  const known = recordNumbers(r);
  for (const m of text.matchAll(NUMBER)) if (!known.has(m[0].replace(/,$/, ""))) return "unbacked_number";
  return null;
}
export function openingProblemWords(p) {
  switch (p) {
    case "empty":
      return "it said nothing";
    case "too_long":
      return `it ran past ${OPENING_WORDS_MAX} words or ${OPENING_CHARS_MAX} characters`;
    case "link":
      return "it carried a link or a web address";
    case "brace":
      return "it left a {{slot}} in";
    case "shouting":
      return "it had a line in capitals";
    case "price":
      return "it named a price";
    case "angle":
      return `its angle was not ${ANGLE_WORDS_MAX} words or fewer`;
    case "unnamed_fact":
      return "it leaned on a fact the record does not hold";
    case "unbacked_number":
      return "it named a number the record does not hold";
  }
}
export const CHAIN_MIN_LISTINGS = 3;
export function chainOf(l) {
  if (siteHost(l.website) && l.site_listings >= CHAIN_MIN_LISTINGS) return { by: "site", listings: l.site_listings };
  if (l.name_listings >= CHAIN_MIN_LISTINGS) return { by: "name", listings: l.name_listings };
  return null;
}
export function customerDomainOf(email, sharedWithPerson) {
  const address = normalizeEmail(email);
  const domain = address ? address.slice(address.lastIndexOf("@") + 1) : "";
  return sharedWithPerson && domain && !isFreeMail(domain) ? domain : null;
}
export const REACH_OUT_HOLDS = [
  "customer_domain",
  "chain",
  "language",
  "unbacked_fact",
  "reads_like_spam",
  "check_unavailable",
  // A business outside the countries cold email goes to without asking (decision 0056, 9): the owner may include it.
  "abroad"
];
export function isReachOutHold(r) {
  return REACH_OUT_HOLDS.includes(r ?? "");
}
export function holdWords(h, detail, stepLanguage = "en") {
  switch (h) {
    case "customer_domain":
      return `a person in People writes from ${detail || "their domain"}`;
    case "chain": {
      const [by, n] = (detail ?? "").split(":");
      return n ? `reads like a chain: ${n} listings share their ${by === "name" ? "name" : "website"}` : "reads like a chain";
    }
    case "language":
      return `their listing reads in ${languageName(detail || "?")}; the email is in ${languageName(stepLanguage)}`;
    case "unbacked_fact":
      return detail ? `the opening said \u201C${detail}\u201D, which their record doesn't hold` : "the opening said something their record doesn't hold";
    case "reads_like_spam":
      return isOpeningProblem(detail) ? `the opening read like a pitch: ${openingProblemWords(detail)}` : "the opening read like a pitch";
    case "check_unavailable":
      return isOpeningProblem(detail) ? `the opening couldn't be written to the rules: ${openingProblemWords(detail)}` : "the check couldn't run";
    case "abroad":
      return `they're in ${countryWords(detail)}, where writing to a business first may need its say`;
  }
}
export const REACH_OUT_COUNTRIES_FREE = /* @__PURE__ */ new Set(["US", "CA", "GB"]);
export const REACH_OUT_COUNTRIES_REFUSED = /* @__PURE__ */ new Set(["DE", "AT"]);
export function reachOutCountryOf(country) {
  const c = (country ?? "US").trim().toUpperCase() || "US";
  if (REACH_OUT_COUNTRIES_REFUSED.has(c)) return "refused";
  return REACH_OUT_COUNTRIES_FREE.has(c) ? "free" : "held";
}
const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
function countryWords(code) {
  const c = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "another country";
  try {
    return COUNTRY_NAMES.of(c) ?? c;
  } catch {
    return c;
  }
}
export function holdDoors(h) {
  switch (h) {
    case "customer_domain":
      return ["skip", "include"];
    case "chain":
      return ["include", "not_a_fit"];
    case "language":
      return ["include", "skip"];
    case "unbacked_fact":
    case "reads_like_spam":
      return ["rewrite", "include", "skip"];
    case "check_unavailable":
      return ["rewrite", "skip"];
    case "abroad":
      return ["include", "skip"];
  }
}
export const HOLD_DOOR_WORDS = {
  include: "Include",
  rewrite: "Rewrite the opening",
  skip: "Skip",
  not_a_fit: "Not a fit"
};
