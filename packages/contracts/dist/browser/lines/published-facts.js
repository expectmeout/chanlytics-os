const PUBLISHED_FACTS = {
  legal_name: true,
  trade_name: true,
  ein: false,
  business_type: false,
  company_type: false,
  industry: true,
  about: true,
  website_url: true,
  street: true,
  street_secondary: true,
  city: true,
  region: true,
  postal_code: true,
  country: true,
  contact_first_name: false,
  contact_last_name: false,
  contact_email: true,
  contact_phone: false,
  contact_title: false,
  contact_job_position: false
};
const RECORD_COLUMNS = Object.keys(PUBLISHED_FACTS);
const PUBLISHED = new Set(RECORD_COLUMNS.filter((c) => PUBLISHED_FACTS[c]));
export function isPublishedFact(column) {
  return PUBLISHED.has(column);
}
export function changedRecordFields(before, after) {
  const words = (v) => (v ?? "").trim();
  return RECORD_COLUMNS.filter((c) => words(before[c]) !== words(after[c]));
}
export function publicPagePath(slug) {
  return `/b/${slug}`;
}
const RECORD_FILINGS = ["none", "stopped", "in_review", "sent_back", "on_file"];
const FILING_OF_STATE = {
  none: "none",
  needs_record: "none",
  otp_waiting: "in_review",
  registering: "in_review",
  approved: "in_review",
  hosting: "in_review",
  active: "on_file",
  rejected: "sent_back",
  // A filing that failed may have stopped before the brand or after it. Where the reader knows (`brand`, the edge's), a
  // brand made is a brand the carriers hold, under the name it was filed with, and none made means nothing went to them;
  // where it does not (a page), it is `stopped`, which the fork still counts as filed, as it did: a second filing of a
  // brand that exists is a second fee.
  failed: "stopped"
};
const isSmsState = (s) => !!s && Object.hasOwn(FILING_OF_STATE, s);
export function recordFilingOf(lines) {
  let best = "none";
  for (const l of lines) {
    if (l.reg_mock || !isSmsState(l.sms_state)) continue;
    let f = FILING_OF_STATE[l.sms_state];
    if (l.brand === true && (f === "none" || f === "stopped")) f = "on_file";
    else if (l.brand === false && f === "stopped") f = "none";
    if (RECORD_FILINGS.indexOf(f) > RECORD_FILINGS.indexOf(best)) best = f;
  }
  return best;
}
export const LINE_FILED_NAMES = { brand: "a2p_filed_name", campaign: "a2p_campaign_name" };
export const RENAME_WORDS = {
  pages: (name) => `Your sign-up page, its paper form and your desk sign say \u201C${name}\u201D now.`,
  held: (filed) => `The carriers still hold \u201C${filed}\u201D as you filed it, and the text confirming a START says it until it is changed with them.`,
  ask: "Request a name change",
  kept: "Saved. The workspace could not be renamed, so your sign-up page and your sign still say its old name.",
  requested: "Requested: a person at Chanlytics changes the name with the carriers and writes to you.",
  already: "Already asked: a person at Chanlytics is changing the name with the carriers."
};
const FILINGS = RECORD_FILINGS;
export function recordSavedOf(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw;
  if (typeof r.first !== "boolean" || !Array.isArray(r.changed) || typeof r.filing !== "string") return null;
  if (!FILINGS.includes(r.filing)) return null;
  const changed = r.changed;
  const name = typeof r.filed_name === "string" ? r.filed_name.trim() : "";
  return {
    first: r.first,
    changed: RECORD_COLUMNS.filter((c) => changed.includes(c)),
    filing: r.filing,
    filed_name: name || null
  };
}
export function recordSavedWords(s) {
  if (!s) return "Saved.";
  const page = "Your public page shows it now";
  if (s.first) return `Saved. ${page}, and the carriers see it when you file.`;
  if (!s.changed.length) return "Saved. Nothing in it had changed.";
  const published = s.changed.some(isPublishedFact);
  const filed = s.filed_name ? `\u201C${s.filed_name}\u201D as you filed it` : "what you filed";
  switch (s.filing) {
    case "none":
      return published ? `Saved. ${page}, and the carriers see it when you file.` : "Saved. The carriers see it when you file.";
    case "in_review":
      return published ? `Saved. ${page}; the carriers are still reviewing ${filed}.` : `Saved. The carriers are still reviewing ${filed}.`;
    case "on_file":
      return published ? `Saved. ${page}; the carriers still hold ${filed}.` : `Saved. The carriers still hold ${filed}.`;
    case "sent_back":
      return published ? `Saved. ${page}, and Chanlytics sends your corrections to the carriers for you, at no cost.` : "Saved. Chanlytics sends your corrections to the carriers for you, at no cost.";
    case "stopped":
      return published ? `Saved. ${page}.` : "Saved.";
  }
}
export const RECORD_REVIEW_CONFIRM = {
  question: "Change what the carriers are reviewing?",
  detail: "They check your registration against your public page, which changes as soon as you save, and a campaign still waiting on them is sent with the record as you save it. A page that no longer matches what you filed can send the registration back.",
  yes: "Save it anyway",
  no: "Not yet"
};
export const PUBLIC_FIELD_MARK = "public";
export const BUSINESS_PAGE_NOTE = {
  before: "Boxes marked public go on your business's own page once the name and the address are saved, beside the number customers reach you on and the services you list under Settings \u203A Details. Anyone can open the page, and search engines list it.",
  live: "Boxes marked public are on your business's own page, beside the number customers reach you on and the services you list under Settings \u203A Details. Anyone can open the page, and search engines list it.",
  open: "Open your page"
};
export const SERVICES_ON_PUBLIC_PAGE = "The business's own page lists these, with how long each takes and its price, once the business is on record under Settings \u203A Connections. Anyone can open it.";
