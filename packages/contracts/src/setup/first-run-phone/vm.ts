/** First run phone: vm. */

import { CHECKOUT_OUTCOME_WORDS } from "../../workspace/billing/checkout";
import { type Carrier, type PhoneCompany, type PhoneRings, type PhoneWay } from "../../voice/forwarding";
import { type SetupState } from "../lines";
import { FORWARDING_WAIT_WORDS } from "../put-off";

/**
 * `choose` is Where it answers' (decision 0073): the ways, the number, nothing bought. `go` is Go live's press before the
 * number is bought (the plan, or the buy itself); the rest are Go live's as they always were the phone step's.
 */
export type FirstRunPhoneStage = "choose" | "go" | "starting" | "buying" | "getting" | "ask" | "code" | "rows";

/** One question with its answers as a row of choices (canvas R4), and the one picked. */
export interface FirstRunPhoneQuestion<K extends string> {
  label: string;
  options: { key: K; label: string }[];
  value: K | null;
}

/** The code to dial (canvas R5, P5), from the forwarding saved on the workspace's line. */
export interface FirstRunPhoneCodeVM {
  /** "Verizon · a mobile", "A landline". */
  label: string;
  dial: string;
  tel: string;
  /** A mobile can take the code as a tap, on the phone in hand (the page offers it where the phone dials one). */
  tap: string | null;
  steps: string[];
  /** What answers before the receptionist can: voicemail, an answering machine. */
  warn: string;
  off: string;
  /** Forwarding's own words for a code the carrier refuses (forwarding.ts notes), behind "The code didn't work". */
  help: { label: string; notes: string[] };
  /** Back to the questions, to save the answers again; null where the saved forwarding has no number to ask about. */
  change: string | null;
  /** Said once a call proved it: Setup's keep row's own sentence. */
  verified: string | null;
  /**
   * An office phone system (canvas V6, decision 3): a person at Chanlytics offered to set it up with the owner on a
   * call, and, once asked, when; null for a phone with a code.
   */
  withMe: { sentence: string; label: string; asked: string | null } | null;
}

export interface FirstRunPhoneWayVM {
  key: PhoneWay;
  title: string;
  sentence: string;
  /** The way most businesses take, marked on its card. */
  recommended: string | null;
}

export interface FirstRunPhoneVM {
  stage: FirstRunPhoneStage;
  heading: string;
  lead: string;
  way: PhoneWay;
  ways: FirstRunPhoneWayVM[];
  /** The number to keep or move, E.164: the one typed, else the listing's; null for neither. */
  number: string | null;
  /** The listing's number, E.164; null for none. */
  listed: string | null;
  /** What the number box shows before the owner types in it: the listing's number, as the app writes one; "" for none. */
  box: string;
  /**
   * What is wrong with what the owner typed in the number box, said on the box itself (the button's `held` says it
   * too): something typed that is not a US number with its area code. Null before anything is typed, and in every
   * stage but choosing.
   */
  boxProblem?: string | null;
  /** The area code a number is bought in: the kept or moved number's, else the listing's; null for neither. */
  area: string | null;
  /**
   * The plan the number starts, where it has not started yet: its price, the trial and what it means. The trial covers
   * the number (decision 0090), so a workspace already on one buys it with no plan to start.
   */
  plan: { offer: string; note: string } | null;
  /**
   * The step's one coral button, `held` with why it cannot go yet, and what it does: start the trial or the plan (by
   * checkout), buy the number,
   * save the forwarding (the answers' code), or go on to Try it.
   */
  cta: { label: string; held: string | null; act: "plan" | "buy" | "forward" | "onward" } | null;
  /**
   * Where it answers: why the choice cannot be kept yet (no number to keep, not a US number, no new number picked), the
   * step's own onward held by it; null when it can, and at Go live.
   */
  held?: string | null;
  /** The two questions, for a number kept or moved, from the moment the number is on its way. */
  questions: { rings: FirstRunPhoneQuestion<PhoneRings>; company: FirstRunPhoneQuestion<PhoneCompany> | null } | null;
  /** The code to dial, once the forwarding is saved. */
  code: FirstRunPhoneCodeVM | null;
  /**
   * The number the answers are saved for, E.164: the one kept or moved, or, asked again after the code was shown, the
   * number the saved forwarding is for (never the listing's in its place); null where nothing is asked.
   */
  forwardFrom: string | null;
  /** Asked again after the code was shown: the carrier saved then, so the same answers save nothing. */
  saved: { carrier: Carrier } | null;
  /** Asked again: the way back to the code without saving. */
  keepCode: string | null;
  /**
   * The questions' way past them, before any forwarding is saved: Setup's own "Later" on the number kept, said for this
   * step. The owner chose to keep a number, so the step waits for its forwarding; this is how they say it can wait.
   * Absent wherever nothing is asked, and once a code is saved.
   */
  putOff?: string | null;
  /** What is happening, while the number is on its way: the state (a pill, its word) and the sentence under it. */
  status: { state: SetupState; words: string; sentence: string; detail: string } | null;
}

export const FIRST_RUN_PHONE_WORDS = {
  chooseHeading: "How should calls reach your receptionist?",
  /** Where it answers' tile (canvas 4). */
  calls: "Calls",
  mode: { unanswered: "When nobody picks up", always: "Every call" },
  orNew: "get a new number",
  orMove: "move it to Chanlytics",
  /** Under the calls choice: when the receptionist's line is bought, kept or moved (it answers what is forwarded) or new. */
  ownLater: "Your receptionist answers on a line of its own, bought when you go live.",
  newLater: "The number is bought when you go live, not before.",
  chooseLead:
    "Most businesses keep the number customers already know. Your team still answers first, and your receptionist gets the rest.",
  readyHeading: "Getting your receptionist's number ready",
  readyLeadForwarded: "Customers never see this number: the calls nobody picks up at yours are sent to it.",
  readyLeadNew: "Customers call this number directly. Put it on your website and your Google listing.",
  recommended: "Recommended",
  keepTitle: (display: string | null) => (display ? `Keep ${display}` : "Keep the number you have"),
  keepListed:
    "The number on your Google listing. Calls nobody picks up go to your receptionist. Same phone, same phone company.",
  keepTyped: "Calls nobody picks up go to your receptionist. Same phone, same phone company.",
  newTitle: "Get a new number",
  newSentence: "For a business that doesn't have one yet. Customers call it directly.",
  moveTitle: "Move my number to Chanlytics",
  moveSentence: "Takes 7–14 business days. Your number forwards in the meantime, so nothing changes for customers.",
  numberLabel: "The number customers call",
  numberPlaceholder: "(305) 555-0100",
  areaLabel: "Area code",
  areaPlaceholder: "305",
  find: "Find numbers",
  finding: "Looking…",
  pickLabel: "Pick your receptionist's number",
  noneFree: (area: string) => `Nothing free in ${area} right now. Try a nearby area code.`,
  threeDigits: "Three digits, like 305.",
  local: "Local",
  held: {
    number: "Type the number customers call.",
    us: "Forwarding works for a US number: type it with its area code.",
    pick: "Pick a number first.",
  },
  cta: {
    /** Go live's press (canvas 5A): the trial or the plan started by checkout, or the number bought. */
    plan: "Start my plan",
    buy: "Go live",
  },
  planOffer: (price: string, days: number) =>
    days
      ? `${days} days free, then ${price || "your plan"}`
      : price
        ? `${price}, starting today`
        : "Your plan, starting today",
  planNoteNoCalls: (days: number) =>
    days
      ? "Every channel you chose is included. Nothing is charged until the trial ends, and you can cancel anytime from Billing."
      : "Every channel you chose is included. The first charge is today, and you can cancel anytime from Billing.",
  planNote: (days: number) =>
    days
      ? "Your number is included. Nothing is charged until the trial ends, and you can cancel anytime from Billing."
      : "Your number is included. The first charge is today, and you can cancel anytime from Billing.",
  starting: "Starting your plan…",
  startingDetail: "Your card is on file. This page updates as Stripe confirms it.",
  buyingIn: (area: string | null) =>
    area ? `Getting your receptionist's number in ${area}…` : "Getting your receptionist's number…",
  buyingNew: (number: string) => `Getting ${number}…`,
  usually: "Usually a minute or two; this page updates by itself",
  /** What the page says when a buy or a search is refused, over the door's own sentence. */
  notBought: "No number yet",
  moveAsked: "We'll move your number with you and reach you by email. Until then, it forwards.",
  moveNotAsked: "The move wasn't asked for. Ask again from Settings later; your number forwards meanwhile.",
  cancelled: CHECKOUT_OUTCOME_WORDS.cancel,
  /** The two questions while the number is on its way (canvas R4), and the button they lead to. */
  ringsLabel: (display: string | null) =>
    display ? `Which phone rings when customers call ${display}?` : "Which phone rings when customers call?",
  rings: { mobile: "A mobile", landline: "A landline", office: "An office phone system" } as Record<PhoneRings, string>,
  companyLabel: "Who's the phone company?",
  company: { verizon: "Verizon", att: "AT&T", tmobile: "T-Mobile", other: "Another company" } as Record<
    PhoneCompany,
    string
  >,
  show: "Show me what to dial",
  showOffice: "Show me where to forward",
  readySoon: "Ready in a moment",
  answerFirst: "Answer the questions first.",
  askHeading: "One more thing",
  askLead: "How the calls are sent to your receptionist depends on the phone that rings.",
  /** The code (canvas R5, P5). */
  codeHeading: "Dial this on the phone customers call",
  codeLead:
    "It tells your phone company to send the calls nobody picks up to your receptionist. You only do this once.",
  codeLeadAll: "It tells your phone company to send every call to your receptionist. You only do this once.",
  codeLabel: (company: string | null, rings: PhoneRings) =>
    rings === "landline" ? "A landline" : company ? `${company} · a mobile` : "A mobile",
  stepsLandline: ["Pick up the phone customers call.", "Dial the code above.", "Wait for the tone, then hang up."],
  stepsMobile: ["On the phone customers call, dial the code above.", "Wait for the tone, then hang up."],
  /** A tab that lost the answers: what rings is not known, so neither is said. */
  stepsAny: ["Dial the code above on the phone customers call.", "Wait for the tone, then hang up."],
  // Not a promise the code replaces voicemail: forwarding.ts says a voicemail that picks up first keeps calls away.
  warnMobile:
    "Voicemail on this phone? If it still picks up after you dial the code, calls never reach your receptionist: see The code didn't work.",
  warnLandline:
    "If an answering machine is on this line, turn it off. Otherwise it answers before your receptionist can.",
  warnAny:
    "Voicemail or an answering machine on that phone? If it picks up first, calls never reach your receptionist: see The code didn't work.",
  off: (code: string) => `To switch it off later, dial ${code}.`,
  tap: "Tap to dial",
  done: "Done, let's try it",
  help: "The code didn't work",
  change: "Change the answers",
  keepCode: "Keep what I have",
  /** The forwarding put off from the questions: what the link says, and what the page says once it is. */
  putOff: "Set up forwarding later",
  putOffSaid: `Put off for a week, then it's back on Today. ${FORWARDING_WAIT_WORDS}`,
  /** The code, or the number to forward to, copied for the phone it is typed on. */
  copy: "Copy",
  copied: "Copied",
  notCopied: "Not copied. Select the code and copy it yourself.",
  /** An office phone system (canvas V6): the number to forward to, and a person to do it with. */
  officeHeading: "Forward missed calls in your phone system",
  officeLead: "Office phone systems set this in their own settings, under “forwarding” or “when no one answers”.",
  officeLabel: (always: boolean) => (always ? "Forward every call to" : "Forward unanswered calls to"),
  officeSteps: [
    "Open your phone system's settings.",
    "Find forwarding, or what happens when no one answers.",
    "Forward the calls to the number above: your receptionist's number. Customers never see it.",
  ],
  officeWarn: "Voicemail in the system? The forwarding has to come before it, or calls never reach your receptionist.",
  officeOff: "To switch it off later, take the forwarding out in the same settings.",
  withMe: "Not sure where it is? A person at Chanlytics can do it with you on a call.",
  withMeLabel: "Do it with me",
  helpOffice: "It didn't work",
  withMeAsked: (ago: string) => `Asked ${ago}: a person at Chanlytics will email you to find a time.`,
  withMeFailed: "Not asked",
  withMeSent: "We'll email you to find a time for a call.",
  notForwarded: "Forwarding not saved",
} as const;
