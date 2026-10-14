/**
 * How each kind of record a workspace holds reaches the owner's own copy of it (GET export, "Download your records" on
 * Settings › Business; the wiring's second audit, R14 X1 and X2).
 *
 * The card, the privacy page and the Terms said "everything", and the file held people, conversations, calls and the
 * consent history: 54 of the 59 workspace tables an owner's session can read were in no section of it, and nothing failed
 * as the gap grew. Erasure has a rule that makes a new column say how it is reached (packages/db erasure-registry.ts);
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
      what: "The business's numbers, mailboxes and connections",
      why: "They hold the providers' credentials, and each provider keeps its own record of them; Settings › Connections lists them.",
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
      why: "The payment provider holds them; Settings › Billing opens them.",
    },
  },
} as const satisfies Record<RecordKind, ExportOf>;

/** What the file leaves out that is no kind of record a page draws, each with why. */
const LEFT_OUT_BESIDE_THE_KINDS: readonly ExportLeftOut[] = [
  {
    what: "Call audio",
    why: "It is removed on the schedule the privacy policy states; each call's transcript is in calls.",
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
export const EXPORT_HOLDS_WORDS =
  "People, conversations with their messages and a link to each file a customer sent, which opens for a day, calls with their transcripts, every consent change with who recorded it, notes and steps, deals, your business details, the team, bookings, lists, campaigns and what each sent, templates, holds, the receptionist's rules, Google reviews, leads, and how each reply to a reach-out was read.";

/** What the owner's copy leaves out, as the card says it: each `what` of exportLeftOut, the why at the file's end. */
export function exportLeftOutWords(): string {
  // Semicolons between them: a thing left out may itself be a list ("its numbers, mailboxes and connections").
  const what = exportLeftOut().map((l) => l.what.charAt(0).toLowerCase() + l.what.slice(1));
  return `Not in it: ${what.slice(0, -1).join("; ")}; and ${what.at(-1) ?? ""}. The end of the file says why for each.`;
}

/** Everything the owner's copy does not hold, each with why: the file's `not_included`, in the order the kinds are named. */
export function exportLeftOut(): ExportLeftOut[] {
  const kinds: ExportLeftOut[] = [];
  for (const how of Object.values(EXPORT_OF) as readonly ExportOf[])
    if ("not_exported" in how) kinds.push(how.not_exported);
  return [...kinds, ...LEFT_OUT_BESIDE_THE_KINDS];
}

/** The sections some kind of record is exported to, each once, in the file's order. */
export function exportedSections(): ExportSection[] {
  const named = new Set<ExportSection>();
  for (const how of Object.values(EXPORT_OF) as readonly ExportOf[]) if ("section" in how) named.add(how.section);
  return EXPORT_SECTIONS.filter((s) => named.has(s));
}
