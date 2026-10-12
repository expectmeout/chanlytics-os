/**
 * What a person's page says about their name and the business they work at (decision 0052), in one place: the notice
 * that offers a signer's name, the toasts its press answers with, the business line and the Works at row, the business
 * sheet, and the door's refusals. Every page that says one of these (the person page, the Inbox's thread header, Leads'
 * peek, the bell) reads it here.
 */
import { plural } from "../shared/words";

/** Where a person's name came from (00413 contacts.name_source), in the one order: see person_name_rank. */
export const NAME_SOURCES = ["typed", "import", "calendar", "signature", "wire", "lead"] as const;
export type NameSource = (typeof NAME_SOURCES)[number];

/** A name source as the wire carries it, or null for a person whose name nobody set, or set before it was kept. */
export function asNameSource(v: unknown): NameSource | null {
  return typeof v === "string" && (NAME_SOURCES as readonly string[]).includes(v) ? (v as NameSource) : null;
}

/** The words of a signer's name, its offer and its press. */
export const PERSON_NAME_WORDS = {
  /** The notice: "Priya Nair signed the reply". */
  signed: (name: string) => `${name} signed the reply`,
  use: "Use this name",
  /** The ×'s own words, said on hover and to a screen reader. */
  notTheirs: "Not their name",
  /** The toast after the press. */
  named: (name: string) => `Named ${name}`,
  /** Said once for each member, under the first toast: why the offer exists. */
  firstTime: "Chanlytics offers a name when someone signs their own reply.",
  undo: "Undo",
  /** The toast after Undo: the name that is back, or that there is none. */
  backTo: (name: string | null) => (name ? `${name} again` : "Their name was taken away"),
  /** The toast after the ×. */
  declined: "That name won't be offered again",
  /** A stand-in's head while nobody is named, and the quiet act beside it. */
  nobody: "No one named yet",
  addName: "Add their name",
  /** The rename field of a name a signer gave: where it came from, and the way back. */
  fromSignature: (day: string) => `Named from their sign-off · ${day}`,
  putBack: (business: string) => `Put back ${business}`,
  /** What Ask is asked about a person with no name of their own. */
  askAboutThisPerson: "Ask about this person",
  askAbout: (first: string) => `Ask about ${first}`,
  /** The door's answers that did nothing, in the page's words (00413's why). */
  refused: {
    gone: "This person is not in your workspace.",
    no_signer: "That reply has no name to use.",
    settled: "That name was already settled.",
    named: "They have a name of their own already.",
    not_a_signer: "Their name did not come from a reply.",
  },
} as const;

/** The words of the business a person works at: the line under their name, the Works at row and the sheet. */
/** Stepping from person to person through the People view they were opened from (0052, canvas A): "‹ 4 of 24 ›". */
export const PERSON_WALK_WORDS = {
  label: "People in this list",
  at: (at: number, of: number) => `${at} of ${of}`,
  next: "Next person",
  previous: "Previous person",
  /** The phone's ⋯, where stepping is its first two rows. */
  nextAt: (at: number, of: number) => `Next person · ${at} of ${of}`,
} as const;

/**
 * What the page says, politely, of a value someone else changed while it is open (0052, canvas A: the motion grammar's
 * wash): the figures, the state, the name after a rename, Up next, their last words and History's newest row.
 */
export const PERSON_WASH_WORDS = {
  figure: (label: string, value: string) => `${label} is now ${value}`,
  name: (name: string) => `Their name is now ${name}`,
  state: (word: string) => `Where they stand is now: ${word}`,
  upNext: "Up next has changed",
  lastWords: "They wrote again",
  history: "Something new in History",
} as const;

export const WORKS_AT_WORDS = {
  title: "Works at",
  /** A business erased or blanked since: said where its name was, with no door. */
  gone: "Their business details were removed.",
  /** The one date line: when the finder read the listing. */
  read: (day: string) => `From the listing, read ${day}`,
  readOnSheet: (day: string) => `From the listing · read ${day}`,
  people: (n: number) => plural(n, "person", "people"),
  peopleHere: (n: number) => `People here · ${n}`,
  /** Leads' peek: the people who work at the business, as People holds them. */
  inPeople: (n: number) => `In People · ${n}`,
  /** Leads' name card: the people at the business, by name. */
  inPeopleNamed: (names: string) => `In People · ${names}`,
  /** Leads' row, under the business's name: "2 people · Priya Nair, Leah Brooks". */
  peopleLine: (n: number, names: string) => `${plural(n, "person", "people")} · ${names}`,
  /** What the Talking door does, said on it: whom it opens. */
  openInPeople: (name: string) => `Open ${name} in People`,
  /** A Talking lead's Stage, naming who it is talking with where they have a name of their own: "Talking · Priya Nair". */
  stageWith: (stage: string, name: string | null) => (name ? `${stage} · ${name}` : stage),
  /** "Priya Nair, Leah Brooks", then how many more: a line names two at most. */
  someNames: (names: readonly string[]) =>
    names.length > 2 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} more` : names.join(", "),
  thisPage: "this page",
  /** The business sheet opened from a thread (the Inbox's Works at): the person the thread is with. */
  thisThread: "this thread",
  inTouch: (day: string) => `in touch ${day}`,
  neverInTouch: "not in touch yet",
  linkPerson: "Link a person",
  linkBusiness: "Link a business…",
  leave: "Not at this business",
  leaveHint: "They do not work here. The business keeps its history.",
  openInLeads: "Open in Leads",
  call: "Call",
  stage: "Lead stage",
  stageNote: "changed on Leads",
  fit: "Fit",
  checks: (n: number) => plural(n, "check"),
  reachOut: "Reach out",
  readWhatWentOut: "Read what went out",
  listingPhone: "Listing phone",
  listingHours: (line: string) => `Listing hours: ${line.charAt(0).toLowerCase()}${line.slice(1)}`,
  links: "Links",
  close: "Close",
  reading: "Reading…",
  /** A stand-in's line under the business's name, by how the lead and the person met. */
  weWroteFirst: (day: string) => `We wrote first · ${day}`,
  youCalled: (day: string) => `You called · ${day}`,
  saidNo: (day: string) => `Wrote back · ${day} · said no`,
  /** Combine (0052, amending 0028): the record we wrote to and the person who answered from another address. */
  answeredFrom: (name: string, address: string) => `${name} answered from ${address}`,
  combineWith: (name: string) => `Combine with ${name}`,
  wroteToFirst: (address: string) => `${address} is the record we wrote to`,
  combine: "Combine",
} as const;

/** The door a press of the business line opens, said to a screen reader. */
export const BUSINESS_DOOR_LABEL = (name: string) => `${name}: open the business`;
