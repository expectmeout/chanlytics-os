/**
 * The first run (docs/superpowers/specs/2026-09-24-first-run-design.md): Setup's own rows, one step to a screen at
 * `#/start`, with the owner's receptionist filling in beside them, and what is left afterwards as one card on Today.
 *
 * Nothing here is stored. The step a workspace is on is worked out from Setup's view model on every draw, so the first
 * run resumes from what is true: a line bought in another tab moves the owner on, and a fact taken away in Settings
 * brings them back. Every sentence the first run says is here; the page composes (first-run.jsx).
 *
 * The business step is Find while there is a listing to link, and Check after (canvas R2, V2): what the receptionist
 * answers from, in the Business tab's own rows, and how customers buy. The receptionist it checks is set up from what is
 * known (first-receptionist.ts), on an owner's press.
 */
import { formatPhoneDisplay } from "./phone";
import { greetingFor } from "./greeting";
import { initialsOf } from "./viewmodels";
import { openWeekWords, servicesWords, type ServiceWordsInput } from "./business-tab";
import { DAY_NAMES, ROLE_PERMS, type Hours, type Role } from "./config";
import { bookingLinkOptional } from "./deals";
import { checkChipsOf } from "./check-chips";
import { bookingPageOffered } from "./google";
import { firstRunLiveOf, FIRST_RUN_LIVE_WORDS } from "./first-run-live";
import { firstRunTryOf, FIRST_RUN_TRY_WORDS, TRY_QUIET_AFTER_MS } from "./first-run-try";
import { areaCodeOf, firstRunPhoneOf, forwardingCarrierOf, FIRST_RUN_PHONE_WORDS } from "./first-run-phone";
import { TRY_SKIPPED, type SetupDto, type SetupRowVM, type SetupState, type SetupVM } from "./setup";
import { FIND_PARAM, FIRST_RUN_FIND_ROUTE, FIRST_RUN_ROUTE, firstRunStepRoute } from "./first-run-route";
export { FIRST_RUN_ROUTE, firstRunStepRoute, FIRST_RUN_FIND_ROUTE } from "./first-run-route";

/** What the business goes by here: the receptionist's own name, else the workspace's (typed at sign-up). */
export function businessNameOf(
  receptionistName: string | null | undefined,
  workspaceName: string | null | undefined,
): string | null {
  return (receptionistName ?? "").trim() || (workspaceName ?? "").trim() || null;
}

/** The tab's own memory that this session has landed on the first run once: Today does not send it back again. */
export const FIRST_RUN_LANDED_KEY = "chanlytics.setup.landed";

/** What a door to the first run says, wherever it is: Connections, the bell, Today's card. */
export const FINISH_SETTING_UP = "Finish setting up";

export type FirstRunStepKey = "business" | "phone" | "try" | "live";

/** What is left once the receptionist answers, on Live: Setup's rows no step asks for. */
const LIVE_ROWS = ["whatsapp", "calendar", "team", "email", "yes"] as const;

interface FirstRunStepDef {
  key: FirstRunStepKey;
  /** On the rail, in the phone's step line and as the step's heading. */
  name: string;
  /** What the step is for, under its heading. */
  lead: string;
  /** Setup's rows the step draws, in this order; a row the workspace does not have is left out. */
  rows: readonly string[];
  /** The rows that must be ready for the step to be done; a row the workspace does not have is not waited for. */
  needs: readonly string[];
}

export const FIRST_RUN_STEPS: readonly FirstRunStepDef[] = [
  {
    key: "business",
    name: "Your business",
    lead: "What your receptionist says about you: your name, when you're open, what you offer.",
    rows: ["facts", "google"],
    needs: ["facts"],
  },
  {
    key: "phone",
    name: "Your phone",
    lead: "The number your customers call, and how those calls reach your receptionist.",
    rows: ["billing", "line", "keep"],
    needs: ["billing", "line"],
  },
  {
    key: "try",
    name: "Try it",
    lead: "Call it from your own phone and hear what your customers will hear.",
    rows: ["try", "handoff"],
    needs: ["receptionist", "try"],
  },
  // The last step is where the others lead: nothing to finish, only what is left after it.
  { key: "live", name: "Live", lead: "", rows: LIVE_ROWS, needs: [] },
];

/**
 * Today's card, in the order each row helps most: the test call first, until one has come in (the first run lets it be
 * skipped, Today does not forget it); then WhatsApp, because the booking link goes out by WhatsApp on a
 * call; then the calendar, so it can say which times are open; then someone to back the owner up; then the rows a
 * step offered and nobody took.
 */
export const SETUP_CARD_ORDER = [
  "try",
  "whatsapp",
  "calendar",
  "team",
  "handoff",
  "keep",
  "google",
  "email",
  "yes",
] as const;

export const FIRST_RUN_WORDS = {
  title: "Setting up",
  later: "Finish later",
  laterShort: "Later",
  back: "Back",
  continue: "Continue",
  finish: "Finish",
  liveHeading: "Your receptionist is answering",
  liveNext: "When you're ready",
  reading: "Reading your workspace…",
  failedWhat: "your workspace",
  failedBody: "This page can't read your workspace at the moment. Nothing you set up is lost.",
  toToday: "Back to Today",
  /** Finish's activation refused: said, and Finish still goes on to Today. */
  notFinished: "Calls were not switched on",
  /**
   * Asked before the page moves on while a row on it holds typing never saved (the record kit's open fold), or while
   * a save is on its way, which asks in other words: "without saving" is untrue of a change already sent.
   */
  leave: {
    question: "Leave without saving?",
    detail: "What you typed on this step has not been saved.",
    savingQuestion: "Leave while this saves?",
    savingDetail: "Your change is on its way and carries on without this step. If it does not go through you are told.",
    yes: "Yes, leave",
    no: "Stay",
  },
  /** A row's second button on the first run, and what it says once pressed. */
  putOff: { put: "Later", undo: "Undo later" },
  /** Find, the business step while there is a listing to link (canvas R1, P1): only what Google said, and the owner's words. */
  find: {
    heading: (name: string | null) => (name ? `Is this ${name}?` : "Which one is your business?"),
    /** The search asks the name typed at sign-up while there is no receptionist, and the name and address on record after (the search route). */
    lead: "We looked you up on Google with the name you signed up with.",
    leadOnRecord: "We looked you up on Google with the name and address on record.",
    typed: (q: string) => `What Google has for “${q}”.`,
    reading: "Looking on Google…",
    pick: "Your listing on Google",
    best: "Best match",
    maps: "See it on Maps",
    noAddress: "No address on Google",
    none: (q: string) => `Nothing on Google for “${q}”.`,
    search: "Not these? Search by name or phone number",
    /** A phone shows the best match alone until this is pressed (canvas P1). */
    more: "Not this one? Search again",
    searchCta: "Search",
    yes: "Yes, this is us",
    notOnGoogle: "We're not on Google",
    linked: (name: string, read: boolean) =>
      `${name} is your listing on Google — ${read ? "read just now" : "Google will be read within the hour"}.`,
    notLinked: "Not linked",
    notSaved: "Not saved",
    retry: "Try again",
    terms: "Terms of service",
    privacy: "Privacy policy",
  },
  /** Check, the business step once Find is not shown (canvas R2, V2): what the receptionist answers from. */
  check: {
    /** A listing on record: what was found there. */
    found: "Here's what we found",
    foundLead: "Your receptionist answers from this. Fix anything that's off.",
    /** None: the basics, asked (V2). */
    basics: "Tell us the basics",
    basicsLead: "Your receptionist answers from this. You can add more later in Settings › Business.",
    /** No receptionist yet: the owner's one press, and where it starts from. */
    makeListed: "Your receptionist starts from what your Google listing says, and you check it here.",
    makeNamed: (name: string | null) =>
      `Your receptionist starts with ${name ? `the name ${name}` : "your business's name"}, and you add the rest here.`,
    make: "Set up your receptionist",
    making: "Setting up…",
    notMade: "Not set up",
    ownerSetsUp: "An owner sets up the receptionist here.",
    /** Made, but the settings read has not brought it yet; and a read that failed, by what it could not read. */
    reading: "Reading your receptionist…",
    failedWhat: "your receptionist",
    /** The onward, once what it answers from is checked. */
    looksRight: "Looks right",
    /** Not on Google, said, where Google can be searched: the way back to Find. */
    findIt: "On Google after all? Find it",
    /** What each group of rows is, for a screen reader: the words on screen are the rows' own. */
    groups: { facts: "Your hours and where you are", buys: "How customers buy", offer: "What it offers" },
    /** The chips (check-chips.ts): a tap adds one, a tap on one that is on takes it out, with an Undo. */
    chips: {
      services: "Tap what you offer. A few is enough.",
      languages: "Languages it answers in",
      ownService: "+ Your own",
      otherLanguage: "+ Other",
      removed: (name: string) => `Removed ${name}`,
    },
    /** The booking page the business's website names, offered under the booking link row (3c-4). */
    bookingPage: { found: (page: string) => `Found on your website: ${page}`, use: "Use it" },
  },
} as const;

/**
 * The days whose hours Google gives in a way the week cannot hold (hoursFromGoogle's `unsure`: past midnight, around
 * the clock), said under the hours on Check; null for none.
 */
export function unsureHoursWords(days: readonly string[]): string | null {
  if (!days.length) return null;
  if (days.length >= 7) return "Google's hours for every day could not be copied: add yours.";
  const names = days.map((d) => (DAY_NAMES as Record<string, string>)[d] ?? d);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Google's hours for ${list} could not be copied: check ${days.length === 1 ? "that day" : "those days"}.`;
}

export type FirstRunStepState = "done" | "current" | "ahead";

/**
 * Check (canvas R2, V2, P2): the business step once Find is not shown and the settings can be read. The page draws the
 * Business tab's own rows over the settings read's brain (first-run.jsx FrCheck); these are the words around them.
 */
export interface FirstRunCheckVM {
  /** A receptionist is set up, so there are rows to draw. */
  made: boolean;
  /** None yet and an owner is looking: the one press that sets it up from what is known, the step's coral button. */
  make: { sentence: string; cta: string; busy: string } | null;
  /** None yet and someone else is looking: who sets it up. */
  waiting: string | null;
  /** The days Google's hours could not be copied for, said under the hours; null for none. */
  unsure: string | null;
  /** Not on Google, said, where Google can be searched and an owner is looking: the way back to Find. */
  find: { label: string; to: string } | null;
  /** Google's kind of place, which the service chips suggest by (FIRST_RUN_HELPERS.chips); null without one. */
  type: string | null;
  /** The booking page the business's website names, while the record holds no booking link: offered, never saved. */
  bookingPage: string | null;
}

export interface FirstRunStepVM {
  key: FirstRunStepKey;
  name: string;
  /** 1 to 4. */
  number: number;
  state: FirstRunStepState;
  rows: SetupRowVM[];
  /** Where the step opens: the first run's own address for the current step, `start/<step>` for another. */
  to: string;
}

export interface FirstRunVM {
  steps: FirstRunStepVM[];
  /** The first step not done: where `#/start` opens. Live once the other three are. */
  current: FirstRunStepKey;
  /** Your business, your phone and try it are done. */
  complete: boolean;
  /** The step on screen: the one the address names when it has been reached, else the current one. */
  shown: FirstRunStepVM;
  heading: string;
  lead: string;
  /** "Step 2 of 4 · Your phone", the phone's header. */
  phoneLine: string;
  /** How much of the phone's bar is filled, in percent: the shown step's own place. */
  progress: number;
  /** The row whose button is the step's one coral action: its first open row, while the step still asks something. */
  primaryRow: string | null;
  /** Where Back goes: the step before the shown one. */
  back: string | null;
  /**
   * The business step is Find: an owner, Google searchable on this deployment, nothing linked, and Google not put off
   * (or Find asked for by name, FIRST_RUN_FIND_ROUTE). The page draws Find in place of the step's rows (first-run.jsx
   * FrFind); its heading and lead are `heading` and `lead`, and its button is the step's one coral one, so no onward.
   */
  find: boolean;
  /** After "We're not on Google" on Find asked for by name: the business step's own address, where Find is gone. */
  findDone: string | null;
  /**
   * Once the shown step asks nothing more: on to where the workspace is, or Finish to Today from Live. `leaves` is a
   * way out of the first run; a step's own move is not one, and replaces the address so Back leaves. Check's onward is
   * shown before its step is done, `held` with the facts row's own sentence for what is still missing; every other
   * onward is shown only once there is nothing to hold it.
   */
  onward: { label: string; to: string; leaves: boolean; held: string | null } | null;
  /** The business step is Check (FirstRunCheckVM); null for any other step, for Find, and for settings that cannot be read. */
  check: FirstRunCheckVM | null;
}

/** Who is looking at the first run, for the business step's Find. */
export interface FirstRunWho {
  /** Only an owner may search Google and link a listing: the page asks the role gate, View-as included. */
  owner: boolean;
  /** The receptionist's own name, when it has one (Setup's business name). */
  receptionistName: string | null;
  /** The workspace's name, typed at sign-up. */
  workspaceName: string | null;
}

const rowOf = (vm: SetupVM, id: string): SetupRowVM | null => vm.rows.find((r) => r.id === id) ?? null;
const stepDone = (vm: SetupVM, def: FirstRunStepDef): boolean =>
  def.needs.every((id) => {
    const r = rowOf(vm, id);
    // The test call is waited for until it came in, or the member skipped it: in the first run (TRY_SKIPPED, which
    // Today's row outlives) or on Today's card (the row itself put off).
    return !r || r.state === "ready" || (id === "try" && (vm.trySkipped || r.later));
  });

/** The step a `#/start/<step>` address names, or null for anything else. */
export function firstRunStepOf(param: string | null | undefined): FirstRunStepKey | null {
  const hit = FIRST_RUN_STEPS.find((s) => s.key === param);
  return hit ? hit.key : null;
}

/** "Step 2 of 4 · Your phone": where a step stands in the first run, said the one way (the phone's header, sign-up's name screen). */
export function firstRunKicker(key: FirstRunStepKey): string {
  const i = FIRST_RUN_STEPS.findIndex((s) => s.key === key);
  return `Step ${i + 1} of ${FIRST_RUN_STEPS.length} · ${FIRST_RUN_STEPS[i].name}`;
}

/**
 * Where the workspace is in the first run, and what the step on screen draws. `at` is the address's step (or `find`,
 * the business step with Find asked for); `who` is who is looking, for Find: nobody may link without it.
 */
export function firstRunOf(vm: SetupVM, at?: string | null, who?: FirstRunWho): FirstRunVM {
  const last = FIRST_RUN_STEPS[FIRST_RUN_STEPS.length - 1];
  const open = FIRST_RUN_STEPS.find((s) => s !== last && !stepDone(vm, s));
  const current: FirstRunStepKey = open ? open.key : last.key;
  const steps: FirstRunStepVM[] = FIRST_RUN_STEPS.map((def, i) => ({
    key: def.key,
    name: def.name,
    number: i + 1,
    state: def.key === current ? "current" : def !== last && stepDone(vm, def) ? "done" : "ahead",
    rows: def.rows.map((id) => rowOf(vm, id)).filter((r): r is SetupRowVM => r !== null),
    to: def.key === current ? FIRST_RUN_ROUTE : firstRunStepRoute(def.key),
  }));
  const findAsked = at === FIND_PARAM;
  const asked = findAsked ? "business" : firstRunStepOf(at);
  const shown =
    steps.find((s) => s.key === asked && s.state !== "ahead") ?? steps.find((s) => s.key === current) ?? steps[0];
  const def = FIRST_RUN_STEPS[shown.number - 1];
  const final = def === last;
  // Find, while an owner can link a listing: Google searchable and nothing linked (Setup's `findable`), and not put
  // off, unless Find was asked for by name.
  const google = rowOf(vm, "google");
  const find = shown.key === "business" && !!who?.owner && vm.findable && !!google && (findAsked || !google.later);
  // Check, once Find is not shown: every other business step, unless the settings cannot be read, where Setup's facts
  // row is the owner's way to ask for the repair (only Chanlytics can make one).
  const C = FIRST_RUN_WORDS.check;
  const onCheck = shown.key === "business" && !find && vm.check.receptionist !== "broken";
  const made = vm.check.receptionist === "set";
  const check: FirstRunCheckVM | null = onCheck
    ? {
        made,
        make:
          !made && who?.owner
            ? {
                sentence: vm.check.listed ? C.makeListed : C.makeNamed(businessNameOf(null, who.workspaceName)),
                cta: C.make,
                busy: C.making,
              }
            : null,
        waiting: !made && !who?.owner ? C.ownerSetsUp : null,
        unsure: made ? unsureHoursWords(vm.check.unsure) : null,
        find: vm.findable && who?.owner ? { label: C.findIt, to: FIRST_RUN_FIND_ROUTE } : null,
        type: vm.check.type,
        bookingPage: vm.check.bookingPage,
      }
    : null;
  // What the step on screen is, said once: its heading, its lead and its one coral button (onward). Find's button is
  // its own, so no onward beside it. Check's is Looks right, held until the step is done, and none while there is no
  // receptionist to check (its press is the button then). Live's is Finish; any other step's is Continue once it is
  // done, and its first open row's while it asks something (primaryRow).
  const F = FIRST_RUN_WORDS.find;
  const facts = rowOf(vm, "facts");
  const face: Pick<FirstRunVM, "heading" | "lead" | "onward"> = find
    ? {
        heading: F.heading(businessNameOf(who?.receptionistName, who?.workspaceName)),
        lead: who?.receptionistName ? F.leadOnRecord : F.lead,
        onward: null,
      }
    : check
      ? {
          heading: vm.check.listed ? C.found : C.basics,
          lead: vm.check.listed ? C.foundLead : C.basicsLead,
          onward: made
            ? {
                label: C.looksRight,
                to: FIRST_RUN_ROUTE,
                leaves: false,
                held: shown.state === "done" ? null : (facts?.sentence ?? null),
              }
            : null,
        }
      : final
        ? {
            heading: FIRST_RUN_WORDS.liveHeading,
            lead: vm.readiness.sentence,
            onward: { label: FIRST_RUN_WORDS.finish, to: "today", leaves: true, held: null },
          }
        : {
            heading: def.name,
            lead: def.lead,
            onward:
              shown.state === "done"
                ? { label: FIRST_RUN_WORDS.continue, to: FIRST_RUN_ROUTE, leaves: false, held: null }
                : null,
          };
  const onward = face.onward;
  const primary =
    onward || find || check ? null : (shown.rows.find((r) => r.state !== "ready" && !r.later && r.verb) ?? null);
  return {
    steps,
    current,
    complete: !open,
    shown,
    heading: face.heading,
    lead: face.lead,
    phoneLine: firstRunKicker(shown.key),
    progress: Math.round((shown.number / FIRST_RUN_STEPS.length) * 100),
    primaryRow: primary ? primary.id : null,
    back: shown.number > 1 ? steps[shown.number - 2].to : null,
    onward,
    find,
    findDone: find && findAsked ? shown.to : null,
    check,
  };
}

export interface SetupCardVM {
  title: string;
  /** "3 steps left" while the first run is not done; "2 left" after. */
  left: string;
  /** While calls are not answered: the one row, which opens the first run where it stands. */
  /** `ctaShort` is the button on a phone, where it sits beside the words (canvas P9). */
  start: { name: string; sentence: string; status: string; cta: string; ctaShort: string; to: string } | null;
  /** After: Setup's own rows, open and not put off, in SETUP_CARD_ORDER. */
  rows: SetupRowVM[];
  /** Puts every row off at once, and what the toast says after; only where rows can be put off. */
  hide: { put: string; said: string } | null;
  /** A row's second button on the card, and what the toast says after (its Undo is the toast's own). */
  skip: { put: string; said: string };
}

const CARD_SKIP = { put: "Skip", said: "Put off. It stays in Setting up for when you're ready." } as const;

/** Today's card: what is left to set up, or null when nothing is. */
export function setupCardOf(vm: SetupVM): SetupCardVM | null {
  const fr = firstRunOf(vm);
  // Calls answered and only the test call left: Setup's own rows, Try it first, each with its Skip and the card's Hide,
  // as after the first run -- a workspace that answers is never held to a card it cannot put away.
  if (!fr.complete && fr.current !== "try") {
    // The steps that ask something: every one but the last, which is where they lead.
    const left = fr.steps.slice(0, -1).filter((s) => s.state !== "done").length;
    const next = fr.steps.find((s) => s.key === fr.current) ?? fr.steps[0];
    const def = FIRST_RUN_STEPS[next.number - 1];
    return {
      title: FINISH_SETTING_UP,
      left: `${left} ${left === 1 ? "step" : "steps"} left`,
      start: {
        // Said as it is: nothing answers yet; WhatsApp answers and calls do not (Setup's readiness counts either);
        // or calls are answered and a step is still open.
        name: !vm.readiness.answering
          ? "Your receptionist isn't answering yet"
          : vm.tryIt?.voice
            ? "Your receptionist is answering"
            : "Calls aren't answered yet",
        sentence: def.lead,
        status: `Next: ${next.name.toLowerCase()}`,
        cta: "Continue setting up",
        ctaShort: "Continue",
        to: FIRST_RUN_ROUTE,
      },
      rows: [],
      hide: null,
      skip: CARD_SKIP,
    };
  }
  const rows = SETUP_CARD_ORDER.map((id) => rowOf(vm, id)).filter(
    (r): r is SetupRowVM => r !== null && r.state !== "ready" && !r.later && !!r.verb,
  );
  if (!rows.length) return null;
  const said =
    rows.length === 1 ? CARD_SKIP.said : `All ${rows.length} put off. They stay in Setting up for when you're ready.`;
  return {
    title: FINISH_SETTING_UP,
    left: `${rows.length} left`,
    start: null,
    rows,
    hide: { put: "Hide", said },
    skip: CARD_SKIP,
  };
}

export interface ReceptionistCardInputs {
  setup: SetupDto;
  answering: boolean;
  /** The receptionist's brain as the settings read has it; null until that read lands. */
  brain: {
    business_name?: string | null;
    booking_link?: string | null;
    profile?: {
      hours?: Partial<Record<string, Hours>> | null;
      services?: readonly ServiceWordsInput[] | null;
      languages?: readonly string[] | null;
    } | null;
  } | null;
  /** The numbers as the settings read resolved them (facts.ts); null until that read lands. */
  numbers: { voiceLine: string | null; keptLine: string | null; handoff: string | null } | null;
  /** The workspace's own name, for a receptionist with none yet. */
  workspaceName: string | null;
  /** The workspace's clock, which the hours are in. */
  tz: string;
  /**
   * How the workspace's customers buy (tenants.sells_by), null where it was never said. Required: a business that
   * quotes has no booking link by right (deals.ts bookingLinkOptional), and is reached for a quote instead.
   */
  sellsBy: string | null;
}

export interface ReceptionistCardVM {
  caption: string;
  initials: string;
  name: string;
  /** Whether it answers, as Setup's own states say it (the page's StatePill tones them): not yet, not tried, answering. */
  status: { state: SetupState; words: string };
  /** The phone's one line for the card: "Your receptionist · Answering". */
  strip: string;
  greetingLabel: string;
  greeting: string;
  rows: Array<{
    key: "open" | "knows" | "books" | "speaks" | "answers" | "through";
    label: string;
    value: string | null;
  }>;
  foot: string;
}

/** A link as a person reads it: no scheme, no "www.", no trailing slash. */
const linkShown = (url: string): string => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");

/** The owner's receptionist, so far: who it is, whether it answers, what it greets with and what it knows. */
export function receptionistCardOf(i: ReceptionistCardInputs): ReceptionistCardVM {
  if (i.sellsBy !== null && typeof i.sellsBy !== "string") {
    throw new TypeError(
      "receptionistCardOf needs how customers buy (the workspace's sells_by, null when not said): how a business that quotes is reached turns on it.",
    );
  }
  const b = i.brain;
  const p = b?.profile ?? null;
  // The name the phone greets with is the receptionist's own (voice call-start reads the brain), never the
  // workspace's: the card's title may borrow the workspace's until there is one, the greeting may not.
  const spoken = (b?.business_name || i.setup.business.name || "").trim();
  const name = businessNameOf(spoken, i.workspaceName) ?? "";
  const tried = !!(i.setup.channels.voice.lastInboundAt || i.setup.channels.whatsapp.lastInboundAt);
  const status: ReceptionistCardVM["status"] = !i.answering
    ? { state: "not_started", words: "Not answering yet" }
    : tried
      ? { state: "ready", words: "Answering" }
      : { state: "waiting_you", words: "Answering · not tried yet" };
  const sv = servicesWords(p?.services ?? null);
  const kept = i.numbers?.keptLine ?? null;
  const line = i.numbers?.voiceLine ?? i.setup.channels.voice.number ?? null;
  const through = i.numbers?.handoff ?? i.setup.business.handoff ?? null;
  const show = (n: string | null) => (n ? (formatPhoneDisplay(n) ?? n) : null);
  // A business that quotes, with no link, is reached for a quote: its receptionist takes their details (decision 2).
  const quotes = !!b && !b.booking_link && bookingLinkOptional(i.sellsBy);
  return {
    caption: "Your receptionist, so far",
    initials: name ? initialsOf(name) : "",
    name: name || "Your receptionist",
    status,
    strip: `Your receptionist · ${status.words}`,
    greetingLabel: "Greets every caller with",
    greeting: greetingFor(spoken || null),
    rows: [
      { key: "open", label: "Open", value: i.setup.business.hours && p?.hours ? openWeekWords(p.hours, i.tz) : null },
      {
        key: "knows",
        label: "Knows",
        value: sv.count ? [sv.chips.map((c) => c.name).join(", "), sv.more].filter(Boolean).join(" ") : null,
      },
      quotes
        ? { key: "books", label: "For a quote", value: "Takes their details" }
        : { key: "books", label: "Books with", value: b?.booking_link ? linkShown(b.booking_link) : null },
      { key: "speaks", label: "Speaks", value: p?.languages?.length ? p.languages.join(", ") : null },
      // The line it answers, and the number set to forward to it, as recorded: no claim about when a call forwards.
      {
        key: "answers",
        label: "Answers",
        value: line ? (kept ? `${show(line)}, and calls forwarded from ${show(kept)}` : show(line)) : null,
      },
      { key: "through", label: "Puts through to", value: show(through) },
    ],
    foot: "Fills in as you go. You can change any of it later in Settings › Business.",
  };
}

/**
 * Whether this arrival lands on the first run: an owner, a receptionist that answers nowhere yet, a plain arrival
 * (Today or nothing), and not already sent there this session. Everyone else gets Today. Setup's rule, moved with the
 * page it lands on.
 */
export function shouldLandOnFirstRun(
  role: string | null | undefined,
  answering: boolean,
  route: string,
  landed: boolean,
): boolean {
  // Whoever may set the workspace up: its owner, and the partner who brought it (0011).
  if (landed || answering || !ROLE_PERMS[role as Role]?.settings) return false;
  return route === "" || route === "today";
}

/** The first run's rules and words, as the bridge publishes them for the pages (window.__firstRun). */
export const FIRST_RUN_HELPERS = {
  of: firstRunOf,
  receptionist: receptionistCardOf,
  todayCard: setupCardOf,
  chips: checkChipsOf,
  bookingPageOffered,
  /** The phone step (first-run-phone.ts): what it says over Setup and the owner's choice, and its words. */
  phone: firstRunPhoneOf,
  phoneWords: FIRST_RUN_PHONE_WORDS,
  areaCodeOf,
  /** Try it (first-run-try.ts): what the step says over Setup and the Live page's calls, its words, and when it asks why. */
  tryIt: firstRunTryOf,
  tryWords: FIRST_RUN_TRY_WORDS,
  tryQuietAfterMs: TRY_QUIET_AFTER_MS,
  trySkipped: TRY_SKIPPED,
  /** Live (first-run-live.ts): the summary, the greeting and Finish; "It will / Not yet" is the Business tab's card. */
  live: firstRunLiveOf,
  liveWords: FIRST_RUN_LIVE_WORDS,
  /** The carrier whose codes the answers choose (first-run-phone.ts), which the forwarding is saved with. */
  forwardingCarrierOf,
  /** A number as the app writes one (phone.ts): the numbers offered to pick are said this way, never Twilio's. */
  numberWords: formatPhoneDisplay,
  words: FIRST_RUN_WORDS,
  landedKey: FIRST_RUN_LANDED_KEY,
} as const;
