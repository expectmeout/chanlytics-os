/**
 * How each kind of record a workspace holds reaches the owner's own copy of it (GET export, "Download your records" on
 * Settings › Business; the wiring's second audit, R14 X1 and X2).
 *
 * The card, the privacy page and the Terms said "everything", and the file held people, conversations, calls and the
 * consent history: 54 of the 59 workspace tables an owner's session can read were in no section of it, and nothing failed
 * as the gap grew. Erasure has a rule that makes a new column say how it is reached (packages/db repositories/erasure/registry.ts);
 * this is the export's. Every kind of record (RECORD_KINDS) names one of three answers, and a kind added there does not
 * compile until it names one here:
 *
 *   section       its rows are a section of the file;
 *   derived       what it holds is in the file another way (the workspace is the file's header);
 *   not_exported  it is left out, with what it is and why, which the file says in its `not_included` list.
 *
 * The file's sections are EXPORT_SECTIONS, in the order the file holds them: the customer record first (people, their
 * conversations and the files they sent, calls, consent), then what the privacy policy names next (notes and steps,
 * deals, the business's own details, the team, bookings), then the rest. The export test holds the file's keys to them.
 */
import type { RecordKind } from "./record-kinds";

/** The sections of the owner's copy, in the order the file holds them. */
export const EXPORT_SECTIONS = [
  "people",
  "conversations",
  "files",
  "calls",
  "consent_history",
  "notes_and_steps",
  "deals",
  "business",
  "team",
  "bookings",
  "lists",
  "list_members",
  "campaigns",
  "sends",
  "templates",
  "holds",
  "rules",
  "reviews",
  "leads",
  "reach_out_replies",
  "form_entries",
] as const;

/** A section of the owner's copy. */
export type ExportSection = (typeof EXPORT_SECTIONS)[number];

/** Something the file does not hold, said in it and beside the link: what it is, and why. */
export interface ExportLeftOut {
  readonly what: string;
  readonly why: string;
}

/** How one kind of record reaches the owner's copy. */
export type ExportOf =
  { readonly section: ExportSection } | { readonly derived: string } | { readonly not_exported: ExportLeftOut };

/** Each kind of record and how it reaches the owner's copy. A kind with no answer does not compile. */
export const EXPORT_OF = {
  person: { section: "people" },
  conversation: { section: "conversations" },
  call: { section: "calls" },
  hold: { section: "holds" },
  visit: { section: "bookings" },
  step: { section: "notes_and_steps" },
  deal: { section: "deals" },
  list: { section: "lists" },
  lead: { section: "leads" },
  campaign: { section: "campaigns" },
  send: { section: "sends" },
  template: { section: "templates" },
  reach_out: { section: "reach_out_replies" },
  review: { section: "reviews" },
  facts: { section: "business" },
  rules: { section: "rules" },
  channel: {
    not_exported: {
      what: "The business's connections",
      why: "They hold the keys to your services, and each service keeps its own record. Settings › Connections lists them.",
    },
  },
  team: { section: "team" },
  workspace: { derived: "The file's header: the workspace's name, zone and id, and when the copy was taken." },
  notification: {
    not_exported: {
      what: "The bell's notices",
      why: "Each one says again what a section of the file holds, and they are cleared as they are read.",
    },
  },
  billing: {
    not_exported: {
      what: "The subscription and its invoices",
      why: "The payment provider holds them. Settings › Billing opens them.",
    },
  },
  brought: {
    not_exported: {
      what: "The import's progress and its copy of your Business Profile and website",
      why: "What came in is in the file's people, conversations, bookings and business. The rest is progress and a public copy.",
    },
  },
  file: {
    not_exported: {
      what: "Photos",
      why: "They are files, not rows: each one downloads from Settings › Files.",
    },
  },
  draft: {
    not_exported: {
      what: "The replies AI drafted and you did not send",
      why: "They are suggestions, never sent and written again when someone writes · what you sent is in the file's conversations.",
    },
  },
  ad_account: {
    not_exported: {
      what: "The ad account's connection",
      why: "The ad platform holds the account and its bill · Settings › Connections shows what is connected.",
    },
  },
  ad: {
    not_exported: {
      what: "Ads and what they spent",
      why: "They are a copy of what the ad platform holds, and its own export gives them whole.",
    },
  },
  // What people sent through a form, a business's own or its website's (00675, 00680): their answers, as sent.
  request: { section: "form_entries" },
  rehearsal: {
    not_exported: {
      what: "Rehearsals with AI",
      why: "They are you playing a customer, not a customer's record · what you kept from them is in the file's business section.",
    },
  },
} as const satisfies Record<RecordKind, ExportOf>;

/** What the file leaves out that is no kind of record a page draws, each with why. */
const LEFT_OUT_BESIDE_THE_KINDS: readonly ExportLeftOut[] = [
  {
    what: "Call audio",
    why: "It is removed on the schedule the privacy policy states · each call's transcript is in calls.",
  },
  {
    what: "The activity log",
    why: "Each change it records is in the section of the record it changed, and every consent change is in consent_history.",
  },
];

/**
 * What the owner's copy holds, as the card beside its link says it (Settings › Business, "Your data"): a section for each
 * kind of record EXPORT_OF exports, in the file's order.
 */
// screen-word: behind Why, the copy's every section named whole (docs/words.md, "Kept on purpose")
export const EXPORT_HOLDS_WORDS =
  "People, conversations with their messages and a link to each file a customer sent, which opens for a day, calls with their transcripts, every consent change with who recorded it, notes and steps, deals, your business details, the team, bookings, lists, campaigns and what each sent, saved messages, holds, AI's rules, Google reviews, leads, and how each reply from a lead was read.";

/** What the owner's copy leaves out, as the card says it: each `what` of exportLeftOut, the why at the file's end. */
export function exportLeftOutWords(): string {
  // Commas between them, so no `what` is itself a list with a comma in it (docs/words.md: no semicolons).
  const subject = exportLeftOut().map((l) => l.what.charAt(0).toLowerCase() + l.what.slice(1));
  return `Not in it: ${subject.slice(0, -1).join(", ")} and ${subject.at(-1) ?? ""}. The end of the file says why for each.`;
}

/** Everything the owner's copy does not hold, each with why: the file's `not_included`, in the order the kinds are named. */
export function exportLeftOut(): ExportLeftOut[] {
  const kinds: ExportLeftOut[] = [];
  for (const how of Object.values(EXPORT_OF)) if ("not_exported" in how) kinds.push(how.not_exported);
  return [...kinds, ...LEFT_OUT_BESIDE_THE_KINDS];
}

/** The sections some kind of record is exported to, each once, in the file's order. */
export function exportedSections(): ExportSection[] {
  const named = new Set<ExportSection>();
  for (const how of Object.values(EXPORT_OF)) if ("section" in how) named.add(how.section);
  return EXPORT_SECTIONS.filter((s) => named.has(s));
}

/**
 * The sections of one person's own copy (GET export?person=<id>, "Download their records" on their page; the wiring's
 * second audit, R14 X5), in the workspace's order: what is kept about them, for when they ask what the business holds,
 * which the privacy page says they may. The only complete answer was the workspace's file, everyone's records in one.
 * Each section holds their rows alone: their row, their threads with the files they sent, their calls, every change to
 * their answers, the notes and steps on them, their deals and bookings, the lists they were put on, what each campaign
 * run sent them, what was handed over from their threads, their own rules, the business they work at and how each of
 * their replies to a reach-out was read.
 */
export const PERSON_EXPORT_SECTIONS = [
  "people",
  "conversations",
  "files",
  "calls",
  "consent_history",
  "notes_and_steps",
  "deals",
  "bookings",
  "lists",
  "list_members",
  "sends",
  "holds",
  "rules",
  "leads",
  "reach_out_replies",
  "form_entries",
] as const satisfies readonly ExportSection[];

/** A section of one person's own copy. */
export type PersonExportSection = (typeof PERSON_EXPORT_SECTIONS)[number];

/**
 * Each section of the workspace's copy that a person's leaves out, with why. A section the workspace's copy gains is in
 * a person's (PERSON_EXPORT_SECTIONS) or named here, or this does not compile.
 */
const PERSON_LEAVES_OUT = {
  business: {
    what: "The business's own details",
    why: "They are the workspace's, not this person's · the workspace's own copy holds them.",
  },
  team: {
    what: "The team",
    why: "Each member is the workspace's. Who acted on their record is said on it: `author_user_id`, `created_by` or `added_by`.",
  },
  campaigns: {
    what: "The campaigns",
    why: "A campaign is the workspace's. What it sent them is in sends, and each message as they got it is in conversations.",
  },
  templates: {
    what: "Saved messages",
    why: "A saved message is the workspace's. Each message written from one is in conversations, as they received it.",
  },
  reviews: {
    what: "Google reviews",
    why: "A review is tied to no one in the record: Google names its author as they chose. The workspace's copy holds them.",
  },
} as const satisfies Record<Exclude<ExportSection, PersonExportSection>, ExportLeftOut>;

/** What one person's copy leaves out beside the workspace's sections. */
const PERSON_LEFT_OUT_BESIDE: readonly ExportLeftOut[] = [
  {
    what: "Which lists made by a rule they are on",
    why: "A rule's list holds whoever matches it as the record stands. Lists they were put on by hand are in lists.",
  },
];

/** Everything one person's copy does not hold, each with why: its `not_included`. */
export function personExportLeftOut(): ExportLeftOut[] {
  return [...Object.values(PERSON_LEAVES_OUT), ...PERSON_LEFT_OUT_BESIDE, ...LEFT_OUT_BESIDE_THE_KINDS];
}
