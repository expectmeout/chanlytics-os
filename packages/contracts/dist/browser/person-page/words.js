import { plural } from "../shared/words.js";
export const NAME_SOURCES = ["typed", "import", "calendar", "signature", "wire", "lead"];
export function asNameSource(v) {
  return typeof v === "string" && NAME_SOURCES.includes(v) ? v : null;
}
export const PERSON_NAME_WORDS = {
  /** The notice: "Priya Nair signed the reply". */
  signed: (name) => `${name} signed the reply`,
  use: "Use this name",
  /** The ×'s own words, said on hover and to a screen reader. */
  notTheirs: "Not their name",
  /** The toast after the press. */
  named: (name) => `Named ${name}`,
  /** Said once for each member, under the first toast: why the offer exists. */
  firstTime: "Chanlytics offers a name when someone signs their own reply.",
  undo: "Undo",
  /** The toast after Undo: the name that is back, or that there is none. */
  backTo: (name) => name ? `${name} again` : "Their name was taken away",
  /** The toast after the ×. */
  declined: "That name won't be offered again",
  /** A stand-in's head while nobody is named, and the quiet act beside it. */
  nobody: "No one named yet",
  addName: "Add their name",
  /** The rename field of a name a signer gave: where it came from, and the way back. */
  fromSignature: (day) => `Named from their sign-off \xB7 ${day}`,
  putBack: (business) => `Put back ${business}`,
  /** What Ask is asked about a person with no name of their own. */
  askAboutThisPerson: "Ask about this person",
  askAbout: (first) => `Ask about ${first}`,
  /** The door's answers that did nothing, in the page's words (00413's why). */
  refused: {
    gone: "This person is not in your workspace.",
    no_signer: "That reply has no name to use.",
    settled: "That name was already settled.",
    named: "They have a name of their own already.",
    not_a_signer: "Their name did not come from a reply."
  }
};
export const PERSON_WALK_WORDS = {
  label: "People in this list",
  at: (at, of) => `${at} of ${of}`,
  next: "Next person",
  previous: "Previous person"
};
export const PERSON_WASH_WORDS = {
  figure: (label, value) => `${label} is now ${value}`,
  name: (name) => `Their name is now ${name}`,
  state: (word) => `Where they stand is now: ${word}`,
  upNext: "Up next has changed",
  lastWords: "They wrote again",
  history: "Something new in History"
};
export const WORKS_AT_WORDS = {
  title: "Works at",
  /** A business erased or blanked since: said where its name was, with no door. */
  gone: "Their business details were removed.",
  /** The one date line: when the finder read the listing. */
  read: (day) => `From the listing, read ${day}`,
  readOnSheet: (day) => `From the listing \xB7 read ${day}`,
  people: (n) => plural(n, "person", "people"),
  peopleHere: (n) => `People here \xB7 ${n}`,
  /** Leads' peek: the people who work at the business, as People holds them. */
  inPeople: (n) => `In People \xB7 ${n}`,
  /** Leads' name card: the people at the business, by name. */
  inPeopleNamed: (names) => `In People \xB7 ${names}`,
  /** Leads' row, under the business's name: "2 people · Priya Nair, Leah Brooks". */
  peopleLine: (n, names) => `${plural(n, "person", "people")} \xB7 ${names}`,
  /** What the Talking door does, said on it: whom it opens. */
  openInPeople: (name) => `Open ${name} in People`,
  /** A Talking lead's Stage, naming who it is talking with where they have a name of their own: "Talking · Priya Nair". */
  stageWith: (stage, name) => name ? `${stage} \xB7 ${name}` : stage,
  /** "Priya Nair, Leah Brooks", then how many more: a line names two at most. */
  someNames: (names) => names.length > 2 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} more` : names.join(", "),
  thisPage: "this page",
  /** The business sheet opened from a thread (the Inbox's Works at): the person the thread is with. */
  thisThread: "this thread",
  inTouch: (day) => `in touch ${day}`,
  neverInTouch: "not in touch yet",
  linkPerson: "Link a person",
  linkBusiness: "Link a business\u2026",
  leave: "Not at this business",
  leaveHint: "They do not work here. The business keeps its history.",
  openInLeads: "Open in Leads",
  call: "Call",
  stage: "Lead stage",
  stageNote: "changed on Leads",
  fit: "Fit",
  checks: (n) => plural(n, "check"),
  reachOut: "Sequence",
  readWhatWentOut: "Read what went out",
  listingPhone: "Listing phone",
  listingHours: (line) => `Listing hours: ${line.charAt(0).toLowerCase()}${line.slice(1)}`,
  links: "Links",
  close: "Close",
  reading: "Reading\u2026",
  /** A stand-in's line under the business's name, by how the lead and the person met. */
  weWroteFirst: (day) => `We wrote first \xB7 ${day}`,
  youCalled: (day) => `You called \xB7 ${day}`,
  saidNo: (day) => `Wrote back \xB7 ${day} \xB7 said no`,
  /** Combine (0052, amending 0028): the record we wrote to and the person who answered from another address. */
  answeredFrom: (name, address) => `${name} answered from ${address}`,
  /** The same, for someone who answered without giving a name: their address is all the page knows them by. */
  someoneAnswered: (address) => `Someone answered from ${address}`,
  combineWith: (name) => `Combine with ${name}`,
  wroteToFirst: (address) => `${address} is the record we wrote to`,
  combine: "Combine"
};
export const BUSINESS_DOOR_LABEL = (name) => `${name}: open the business`;
export const PERSON_ABOUT_WORDS = {
  label: (who) => `About ${who}`,
  reach: "Reach them",
  cameFrom: "Where they came from",
  /** Where they came from as a lead: the door to it, beside the day. */
  openLead: "Open the lead",
  messages: "Messages and receptionist",
  lists: "Lists",
  waName: (name) => `WhatsApp name \xB7 ${name}`,
  /** The number's press: its sheet on a phone, its menu on a desk. */
  callIt: "Call",
  textIt: "Text them",
  copyNumber: "Copy the number",
  /** What a copy says in place once it has copied (the kit's copy: never a toast). */
  copied: "Copied",
  /** Lists as one row on a phone: "On 3 lists", their names under it. */
  onLists: (n) => n === 0 ? "On no list yet" : `On ${plural(n, "list")}`,
  /** A phone's Campaigns, folded (canvas A, P4): how many went to them, and what came of the newest ("2 sent · Replied"). */
  campaigns: "Campaigns",
  campaignsMark: (n, newest) => `${n} sent \xB7 ${newest}`,
  /** The sequences they are in now (0060), over what went to them. */
  inSequence: "In a sequence",
  /** Messages and receptionist's rows (canvas A, P9.4): a mode the workspace sets, and a row nobody here changes. */
  thisWorkspace: "this workspace",
  readOnly: "read only",
  change: "Change",
  /** The top bar's Ask on their page (canvas A): about them by their first name, or a stand-in's business whole. */
  askAbout: (who) => `Ask about ${who}`,
  /** What the receptionist knows of them, under the rows while the group is open. */
  knowsTitle: "What the receptionist knows",
  knowsFoot: "It uses kept notes as facts and never reads them aloud."
};
export const REACH_SOURCE_WORDS = {
  phone: {
    called: (day) => `Phone \xB7 they called from it ${day}`,
    wrote: (day) => `Phone \xB7 they wrote from it ${day}`,
    booking: "Phone \xB7 from the booking",
    listing: "Phone \xB7 from the listing",
    none: "Phone"
  },
  email: {
    wrote: (day) => `Email \xB7 they wrote from it ${day}`,
    gaveOnCall: (day) => `Email \xB7 they gave it on the call ${day}`,
    listing: "Email \xB7 from the listing",
    none: "Email"
  }
};
export const ORIGIN_WORDS = {
  call: (day) => `Phoned you \xB7 ${day}`,
  whatsapp: (day) => `Wrote on WhatsApp \xB7 ${day}`,
  sms: (day) => `Texted you \xB7 ${day}`,
  email: (day) => `Wrote by email \xB7 ${day}`,
  calendar: (day) => `From your calendar \xB7 ${day}`,
  manual: (day) => `Added by hand \xB7 ${day}`,
  import: (day) => `Imported \xB7 ${day}`,
  ad: (day) => `From an ad \xB7 ${day}`,
  lead: (day) => `Found by your lead search \xB7 ${day}`,
  ownList: (day) => `From your own list \xB7 ${day}`,
  weWroteFirst: (day) => `we wrote first ${day}`,
  weCalledFirst: (day) => `We called first \xB7 ${day}`,
  /** "We wrote first by text · Sep 20": the wire as a sentence says it (CONSENT_CHANNEL_WORDS). */
  weWroteFirstOn: (on, day) => `We wrote first ${on} \xB7 ${day}`
};
export const CALL_FACT_WORDS = {
  name: (name) => `Gave their name as ${name}`,
  onTheCall: (day) => `on the call ${day}`,
  email: (day, address) => `Spelled out on the call ${day}: ${address}`,
  useEmail: "Use this address",
  notTheirAddress: "Not their address",
  fromTheCall: (day) => `from the ${day} call`,
  keepStep: "Keep as a note",
  notAStep: "Not a step",
  /** The toasts after a press. */
  emailKept: (address) => `Their address is now ${address}`,
  stepKept: "Kept as a note"
};
export const DRAFT_NOTICE_WORDS = {
  waiting: "A draft answer is waiting in the thread",
  sends: (time) => `sends at ${time}`,
  review: "Review the draft"
};
export const PERSON_PEEK_WORDS = {
  label: (name) => `Preview of ${name}`,
  close: "Close",
  page: "Open the full page",
  reading: "Reading\u2026",
  what: "this person",
  missing: { title: "This person is not in your workspace", body: "They may have been deleted." }
};
export const PERSON_LISTS_SHEET_WORDS = {
  keepsItself: "Keeps itself current",
  none: "No lists of your own yet.",
  newList: "New list",
  newListName: "The new list's name",
  make: "Make it",
  making: "Making\u2026",
  close: "Close",
  /** "Emily is on Regulars", or off it. */
  moved: (on) => on ? "is on" : "is off",
  onNew: "is on the new list",
  failed: "Could not change the list.",
  notMade: "Could not make the list."
};
export function receptionistKnowsOf(f) {
  return [
    f.name ? `Name ${f.name}` : null,
    f.worksAt ? `Works at ${f.worksAt}` : null,
    f.email ? `Email ${f.email}` : null,
    f.offers ? `Offers & news ${f.offers.charAt(0).toLowerCase()}${f.offers.slice(1)}` : null,
    f.lastInTouch ? `Last in touch ${f.lastInTouch}` : null
  ].filter((x) => x !== null).join(" \xB7 ");
}
export function messagesSummaryOf(visit, offers, receptionist) {
  const low = (s) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`;
  return [
    { id: "visit", lead: "Messages", answer: low(visit.label), notAsked: visit.unknown },
    { id: "offers", lead: "Offers & news", answer: low(offers.label), notAsked: offers.unknown },
    { id: "receptionist", lead: "", answer: receptionist, notAsked: false }
  ];
}
