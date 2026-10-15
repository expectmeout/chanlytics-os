/**
 * What of the business on record anyone can read, and what a save of it says (the wiring's second audit, X4-3 and X4-4).
 *
 * The record is one form with two readers. The carriers read all of it when a line is filed. The business's own page
 * (/b/<slug>, and its texting terms) shows part of it, to anyone, and search engines list that page: the names, the
 * address, the email, the website, what the business does and its industry. The tax id, the legal form, the owner's own
 * mobile and their names are never on it. Before this, the form said only that the carriers read the boxes, and the save
 * said "The carriers see this when you file" whether or not a filing already held the old words.
 *
 * Which column is public is said once, here, for every column the form keeps: a column added to the record is a compile
 * error in PUBLISHED_FACTS until it says which it is, and the public reader's columns are held to this list by a type test
 * (apps/dashboard/src/server/public/public-facts.type-test.ts).
 */
import type { SchemaSet } from "../shared/schema-sets";
import type { BusinessRecordDto } from "./business-record";

/** A column of the business on record that an owner fills (the row's own clock is not one). */
export type BusinessRecordColumn = Exclude<keyof BusinessRecordDto, "updated_at">;

/** Whether each column is on the business's public page, in the order the form asks. */
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
  contact_job_position: false,
} as const satisfies { readonly [K in BusinessRecordColumn]: boolean };

/** The columns the public page may show: the public reader selects these and no others. */
export type PublishedRecordColumn = {
  [K in BusinessRecordColumn]: (typeof PUBLISHED_FACTS)[K] extends true ? K : never;
}[BusinessRecordColumn];

const RECORD_COLUMNS = Object.keys(PUBLISHED_FACTS) as BusinessRecordColumn[];
const PUBLISHED = new Set<string>(RECORD_COLUMNS.filter((c) => PUBLISHED_FACTS[c]));

/** Whether a column of the record is on the business's public page. */
export function isPublishedFact(column: string): boolean {
  return PUBLISHED.has(column);
}

/**
 * The columns a save moved, in the form's order: names, never their values (the rule contracts changedConfigFields
 * keeps for the ledger). Blank and missing are the same, and so is a value with spaces around it.
 */
export function changedRecordFields(
  before: Partial<BusinessRecordDto>,
  after: Partial<BusinessRecordDto>,
): BusinessRecordColumn[] {
  const words = (v: string | null | undefined) => (v ?? "").trim();
  return RECORD_COLUMNS.filter((c) => words(before[c]) !== words(after[c]));
}

/** The business's own page, on whatever site serves it. */
export function publicPagePath(slug: string): string {
  return `/b/${slug}`;
}

/**
 * Where a filing of the record stands with the carriers, as the save speaks of it: `none` (nothing filed, or a rehearsal
 * against the free test registry), `in_review` (filed, the carriers not through with it), `on_file` (the carriers hold
 * it), `sent_back` (refused, and corrected by Chanlytics at no cost), or `stopped` (a filing that failed, where whether it
 * made a brand first is not known: a page's line carries no provider id).
 */
const RECORD_FILINGS = ["none", "stopped", "in_review", "sent_back", "on_file"] as const;
export type RecordFiling = (typeof RECORD_FILINGS)[number];

const FILING_OF_STATE: Record<SchemaSet<"lines.sms_state">, RecordFiling> = {
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
  failed: "stopped",
};

const isSmsState = (s: string | null): s is SchemaSet<"lines.sms_state"> => !!s && Object.hasOwn(FILING_OF_STATE, s);

/**
 * Where the workspace's filing stands, across its lines: the strongest of them, in RECORD_FILINGS' order. A rehearsal
 * (reg_mock) or a state outside the set is none. `brand`, where the reader knows it, is whether the line's filing made a
 * brand at the carriers: a brand made is held, whatever the line's state says of the rest (a held campaign's filing the
 * pre-flight refused leaves the line `needs_record` with its brand at the carriers), and a failed filing that made none
 * sent them nothing.
 */
export function recordFilingOf(
  lines: readonly { sms_state: string | null; reg_mock?: boolean | null; brand?: boolean }[],
): RecordFiling {
  let best: RecordFiling = "none";
  for (const l of lines) {
    if (l.reg_mock || !isSmsState(l.sms_state)) continue;
    let f = FILING_OF_STATE[l.sms_state];
    if (l.brand === true && (f === "none" || f === "stopped")) f = "on_file";
    else if (l.brand === false && f === "stopped") f = "none";
    if (RECORD_FILINGS.indexOf(f) > RECORD_FILINGS.indexOf(best)) best = f;
  }
  return best;
}

/**
 * Where a line keeps the names a filing sent the carriers (its facts): the brand's, the business on record's name (X4-3),
 * and the campaign's, whose confirmation a customer receives after START and which no later rename reaches (X4-5).
 */
export const LINE_FILED_NAMES = { brand: "a2p_filed_name", campaign: "a2p_campaign_name" } as const;

/**
 * What an owner is told when the business is renamed (X4-5; Ruben, 15 October 2026): its pages follow at once, and a name
 * the carriers hold does not. A filed confirmation can only be replaced by a new campaign, so that change goes through
 * Chanlytics, asked for here (a setup request of kind `name`).
 */
export const RENAME_WORDS = {
  pages: (name: string) => `Your sign-up page, its paper form and your desk sign say “${name}” now.`,
  held: (filed: string) =>
    `The carriers still hold “${filed}” as you filed it, and the text confirming a START says it until it is changed with them.`,
  ask: "Request a name change",
  kept: "Saved. The workspace could not be renamed, so your sign-up page and your sign still say its old name.",
  requested: "Requested: a person at Chanlytics changes the name with the carriers and writes to you.",
  already: "Already asked: a person at Chanlytics is changing the name with the carriers.",
} as const;

/** What the save door answers beside the record: what moved, and what the carriers hold of it. */
export interface RecordSavedDto {
  /** The first record this workspace kept. */
  first: boolean;
  changed: BusinessRecordColumn[];
  filing: RecordFiling;
  /** The name the brand was filed under, where a filing kept it. */
  filed_name: string | null;
}

const FILINGS: readonly string[] = RECORD_FILINGS;

/** The save's answer, read off the edge's: null from an edge that does not say (one deployed before this). */
export function recordSavedOf(raw: unknown): RecordSavedDto | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.first !== "boolean" || !Array.isArray(r.changed) || typeof r.filing !== "string") return null;
  if (!FILINGS.includes(r.filing)) return null;
  const changed: unknown[] = r.changed;
  const name = typeof r.filed_name === "string" ? r.filed_name.trim() : "";
  return {
    first: r.first,
    changed: RECORD_COLUMNS.filter((c) => changed.includes(c)),
    filing: r.filing as RecordFiling,
    filed_name: name || null,
  };
}

/** What the owner is told when the record is saved: what the public page shows, and what the carriers hold. */
export function recordSavedWords(s: RecordSavedDto | null): string {
  if (!s) return "Saved.";
  const page = "Your public page shows it now";
  if (s.first) return `Saved. ${page}, and the carriers see it when you file.`;
  if (!s.changed.length) return "Saved. Nothing in it had changed.";
  const published = s.changed.some(isPublishedFact);
  const filed = s.filed_name ? `“${s.filed_name}” as you filed it` : "what you filed";
  switch (s.filing) {
    case "none":
      return published
        ? `Saved. ${page}, and the carriers see it when you file.`
        : "Saved. The carriers see it when you file.";
    case "in_review":
      return published
        ? `Saved. ${page}; the carriers are still reviewing ${filed}.`
        : `Saved. The carriers are still reviewing ${filed}.`;
    case "on_file":
      return published
        ? `Saved. ${page}; the carriers still hold ${filed}.`
        : `Saved. The carriers still hold ${filed}.`;
    case "sent_back":
      return published
        ? `Saved. ${page}, and Chanlytics sends your corrections to the carriers for you, at no cost.`
        : "Saved. Chanlytics sends your corrections to the carriers for you, at no cost.";
    case "stopped":
      return published ? `Saved. ${page}.` : "Saved.";
  }
}

/**
 * Asked before a change to what the page shows is saved while the carriers are reviewing the filing: they check the
 * registration against the page, and a campaign waiting on the brand is filed from the record as it then stands
 * (the edge's registrations sweep).
 */
export const RECORD_REVIEW_CONFIRM = {
  question: "Change what the carriers are reviewing?",
  detail:
    "They check your registration against your public page, which changes as soon as you save, and a campaign still waiting on them is sent with the record as you save it. A page that no longer matches what you filed can send the registration back.",
  yes: "Save it anyway",
  no: "Not yet",
} as const;

/** The mark on a box whose answer goes on the public page. */
export const PUBLIC_FIELD_MARK = "public";

/** What the form says of the page, before it publishes and once it does, and the link to it. */
export const BUSINESS_PAGE_NOTE = {
  before:
    "Boxes marked public go on your business's own page once the name and the address are saved, beside the number customers reach you on and the services you list under Settings › Business. Anyone can open the page, and search engines list it.",
  live: "Boxes marked public are on your business's own page, beside the number customers reach you on and the services you list under Settings › Business. Anyone can open the page, and search engines list it.",
  open: "Open your page",
} as const;

/** Said under the services a business lists: they are on its public page too. */
export const SERVICES_ON_PUBLIC_PAGE =
  "The business's own page lists these, with how long each takes and its price, once the business is on record under Settings › Connections. Anyone can open it.";
