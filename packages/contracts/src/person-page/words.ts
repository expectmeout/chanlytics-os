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
  /** Its one-row form, in a head under who it is, before the name in bold: "Signed Priya Nair · Oct 6". */
  signedAs: "Signed",
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

/** Stepping from person to person through the People view they were opened from (0052, canvas A): "‹ 4 of 24 ›". */
export const PERSON_WALK_WORDS = {
  label: "People in this list",
  at: (at: number, of: number) => `${at} of ${of}`,
  next: "Next person",
  previous: "Previous person",
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

/** The words of the business a person works at: the line under their name, the Works at row and the sheet. */
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
  reachOut: "Sequence",
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
  /** The same, for someone who answered without giving a name: their address is all the page knows them by. */
  someoneAnswered: (address: string) => `Someone answered from ${address}`,
  combineWith: (name: string) => `Combine with ${name}`,
  wroteToFirst: (address: string) => `${address} is the record we wrote to`,
  combine: "Combine",
} as const;

/** The door a press of the business line opens, said to a screen reader. */
export const BUSINESS_DOOR_LABEL = (name: string) => `${name}: open the business`;

/**
 * What a person's rail holds (canvas A), on a desk beside the work and on a phone as the About tab: how to reach them,
 * where they came from, the business they work at, what they may be sent and the receptionist with it, and their lists.
 */
export const PERSON_ABOUT_WORDS = {
  label: (who: string) => `About ${who}`,
  reach: "Reach them",
  cameFrom: "Where they came from",
  /** Where they came from as a lead: the door to it, beside the day. */
  openLead: "Open the lead",
  messages: "Messages and receptionist",
  lists: "Lists",
  waName: (name: string) => `WhatsApp name · ${name}`,
  /** The number's press: its sheet on a phone, its menu on a desk. */
  callIt: "Call",
  textIt: "Text them",
  copyNumber: "Copy the number",
  /** What a copy says in place once it has copied (the kit's copy: never a toast). */
  copied: "Copied",
  /** Lists as one row on a phone: "On 3 lists", their names under it. */
  onLists: (n: number) => (n === 0 ? "On no list yet" : `On ${plural(n, "list")}`),
  /** A phone's Campaigns, folded (canvas A, P4): how many went to them, and what came of the newest ("2 sent · Replied"). */
  campaigns: "Campaigns",
  campaignsMark: (n: number, newest: string) => `${n} sent · ${newest}`,
  /** The sequences they are in now (0060), over what went to them. */
  inSequence: "In a sequence",
  /** Messages and receptionist's rows (canvas A, P9.4): a mode the workspace sets, and a row nobody here changes. */
  thisWorkspace: "this workspace",
  readOnly: "read only",
  change: "Change",
  /** The top bar's Ask on their page (canvas A): about them by their first name, or a stand-in's business whole. */
  askAbout: (who: string) => `Ask about ${who}`,
  /** What the receptionist knows of them, under the rows while the group is open. */
  knowsTitle: "What the receptionist knows",
  knowsFoot: "It uses kept notes as facts and never reads them aloud.",
} as const;

/**
 * Reach them's rows (canvas A, C3): under the number and the address, what it is and where it came from, by the
 * evidence: they called or wrote from it (the day of the first), the booking or the listing it came in on, else the
 * word alone. Never a day no row of theirs holds.
 */
export const REACH_SOURCE_WORDS = {
  phone: {
    called: (day: string) => `Phone · they called from it ${day}`,
    wrote: (day: string) => `Phone · they wrote from it ${day}`,
    booking: "Phone · from the booking",
    listing: "Phone · from the listing",
    none: "Phone",
  },
  email: {
    wrote: (day: string) => `Email · they wrote from it ${day}`,
    gaveOnCall: (day: string) => `Email · they gave it on the call ${day}`,
    listing: "Email · from the listing",
    none: "Email",
  },
} as const;

/**
 * Where they came from, in one line (canvas A, C3): how they first reached you, or came to be here, and when. A first
 * contact that was ours says so ("We called first"); a lead says how it was found and when we first wrote.
 */
export const ORIGIN_WORDS = {
  call: (day: string) => `Phoned you · ${day}`,
  whatsapp: (day: string) => `Wrote on WhatsApp · ${day}`,
  sms: (day: string) => `Texted you · ${day}`,
  email: (day: string) => `Wrote by email · ${day}`,
  instagram: (day: string) => `Wrote on Instagram · ${day}`,
  calendar: (day: string) => `From your calendar · ${day}`,
  manual: (day: string) => `Added by hand · ${day}`,
  import: (day: string) => `Imported · ${day}`,
  ad: (day: string) => `From an ad · ${day}`,
  lead: (day: string) => `Found by your lead search · ${day}`,
  ownList: (day: string) => `From your own list · ${day}`,
  weWroteFirst: (day: string) => `we wrote first ${day}`,
  weCalledFirst: (day: string) => `We called first · ${day}`,
  /** "We wrote first by text · Sep 20": the wire as a sentence says it (CONSENT_CHANNEL_WORDS). */
  weWroteFirstOn: (on: string, day: string) => `We wrote first ${on} · ${day}`,
} as const;

/**
 * What another system said of them before Chanlytics (decision 0073, R22), one line under where they came from:
 * "Before Chanlytics · 12 visits · last Apr 23 · birthday Mar 14 · from Vagaro's file". Never counted as today's.
 */
export const BEFORE_WORDS = {
  label: "Before Chanlytics",
  visits: (n: number) => plural(n, "visit"),
  last: (day: string) => `last ${day}`,
  birthday: (day: string) => `birthday ${day}`,
  from: (tool: string | null) => (tool ? `from ${tool}'s file` : "from your file"),
} as const;

/**
 * What a call left that the page can use (canvas A, C10): the name they gave, an address they spelled out, a next step
 * the receptionist noted. Each a notice at its home, offered and never applied by itself.
 */
export const CALL_FACT_WORDS = {
  name: (name: string) => `Gave their name as ${name}`,
  onTheCall: (day: string) => `on the call ${day}`,
  email: (day: string, address: string) => `Spelled out on the call ${day}: ${address}`,
  useEmail: "Use this address",
  notTheirAddress: "Not their address",
  fromTheCall: (day: string) => `from the ${day} call`,
  keepStep: "Keep as a note",
  notAStep: "Not a step",
  /** The toasts after a press. */
  emailKept: (address: string) => `Their address is now ${address}`,
  stepKept: "Kept as a note",
} as const;

/** A reply the receptionist wrote and holds before it sends (the veto window): said under their last words (canvas A). */
export const DRAFT_NOTICE_WORDS = {
  waiting: "A draft answer is waiting in the thread",
  sends: (time: string) => `sends at ${time}`,
  review: "Review the draft",
} as const;

/**
 * A person seen over People's list on a desk (canvas A, PEEK-01): their head, Up next, their last words and their note,
 * the arrows that walk the list, and the doors to the thread and the full page.
 */
export const PERSON_PEEK_WORDS = {
  label: (name: string) => `Preview of ${name}`,
  close: "Close",
  page: "Open the full page",
  reading: "Reading…",
  what: "this person",
  missing: { title: "This person is not in your workspace", body: "They may have been deleted." },
} as const;

/**
 * Add to a list (canvas A, More's record group): a switch for each list kept by hand, the lists that keep themselves as
 * doors, a new list made with them on it in place, and what each press says after.
 */
export const PERSON_LISTS_SHEET_WORDS = {
  keepsItself: "Keeps itself current",
  none: "No lists of your own yet.",
  newList: "New list",
  newListName: "The new list's name",
  make: "Make it",
  making: "Making…",
  close: "Close",
  /** "Emily is on Regulars", or off it. */
  moved: (on: boolean) => (on ? "is on" : "is off"),
  onNew: "is on the new list",
  failed: "Could not change the list.",
  notMade: "Could not make the list.",
} as const;

/**
 * What the receptionist knows of them, in one line (canvas A, P9.4): their name, where they work, their address, their
 * answer on offers, and when they were last in touch, each only where it is known.
 */
export function receptionistKnowsOf(f: {
  name: string | null;
  worksAt: string | null;
  email: string | null;
  offers: string | null;
  lastInTouch: string | null;
}): string {
  return [
    f.name ? `Name ${f.name}` : null,
    f.worksAt ? `Works at ${f.worksAt}` : null,
    f.email ? `Email ${f.email}` : null,
    f.offers ? `Offers & news ${f.offers.charAt(0).toLowerCase()}${f.offers.slice(1)}` : null,
    f.lastInTouch ? `Last in touch ${f.lastInTouch}` : null,
  ]
    .filter((x): x is string => x !== null)
    .join(" · ");
}

/** One part of Messages and receptionist's summary: what it is of, its answer, and whether the answer is "not asked". */
export interface MessagesSummaryPart {
  id: "visit" | "offers" | "receptionist";
  lead: string;
  answer: string;
  notAsked: boolean;
}

/**
 * Messages and receptionist, folded (canvas A): the three answers in one line, "Messages not asked · Offers & news not
 * asked · Answer", each a part, so the page can make a "not asked" the press that asks it.
 */
export function messagesSummaryOf(
  visit: { label: string; unknown: boolean },
  offers: { label: string; unknown: boolean },
  receptionist: string,
): MessagesSummaryPart[] {
  const low = (s: string) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`;
  return [
    { id: "visit", lead: "Messages", answer: low(visit.label), notAsked: visit.unknown },
    { id: "offers", lead: "Offers & news", answer: low(offers.label), notAsked: offers.unknown },
    { id: "receptionist", lead: "", answer: receptionist, notAsked: false },
  ];
}
