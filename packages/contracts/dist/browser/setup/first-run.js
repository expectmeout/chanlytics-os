import { formatPhoneDisplay } from "../shared/phone.js";
import { greetingOf } from "../voice/greeting-owner.js";
import { initialsOf } from "../conversations/thread-contact.js";
import { openWeekWords } from "../config/business-tab/open-week.js";
import { servicesWords } from "../config/business-tab/services-words.js";
import { DAY_NAMES } from "../config/workspace-config/config-rules.js";
import { ROLE_PERMS } from "../config/workspace-config/role-perms.js";
import { bookingLinkOptional } from "../deals/sells-by.js";
import { checkChipsOf } from "./check-chips.js";
import { bookingPageOffered } from "../google/google.js";
import { firstRunLiveOf, FIRST_RUN_LIVE_WORDS } from "./first-run-live.js";
import { firstRunTryOf, FIRST_RUN_TRY_WORDS, TRY_QUIET_AFTER_MS } from "./first-run-try.js";
import { areaCodeOf, firstRunPhoneOf, forwardingCarrierOf, FIRST_RUN_PHONE_WORDS } from "./first-run-phone.js";
import { TRY_SKIPPED } from "./setup.js";
import { FIND_PARAM, FIRST_RUN_FIND_ROUTE, FIRST_RUN_ROUTE, firstRunStepRoute } from "./first-run-route.js";
export { FIRST_RUN_ROUTE, firstRunStepRoute, FIRST_RUN_FIND_ROUTE } from "./first-run-route.js";
export function businessNameOf(receptionistName, workspaceName) {
  return (receptionistName ?? "").trim() || (workspaceName ?? "").trim() || null;
}
export const FIRST_RUN_LANDED_KEY = "chanlytics.setup.landed";
export const FINISH_SETTING_UP = "Finish setting up";
const LIVE_ROWS = ["whatsapp", "calendar", "team", "email", "yes"];
export const FIRST_RUN_STEPS = [
  {
    key: "business",
    name: "Your business",
    lead: "What your receptionist says about you: your name, when you're open, what you offer.",
    rows: ["facts", "google"],
    needs: ["facts"]
  },
  {
    key: "phone",
    name: "Your phone",
    lead: "The number your customers call, and how those calls reach your receptionist.",
    rows: ["billing", "line", "keep"],
    needs: ["billing", "line"]
  },
  {
    key: "try",
    name: "Try it",
    lead: "Call it from your own phone and hear what your customers will hear.",
    rows: ["try", "handoff"],
    needs: ["receptionist", "try"]
  },
  // The last step is where the others lead: nothing to finish, only what is left after it.
  { key: "live", name: "Live", lead: "", rows: LIVE_ROWS, needs: [] }
];
export const SETUP_CARD_ORDER = [
  "try",
  "whatsapp",
  "calendar",
  "team",
  "handoff",
  "keep",
  "google",
  "email",
  "yes"
];
export const FIRST_RUN_WORDS = {
  title: "Setting up",
  later: "Finish later",
  laterShort: "Later",
  back: "Back",
  continue: "Continue",
  finish: "Finish",
  liveHeading: "Your receptionist is answering",
  liveNext: "When you're ready",
  reading: "Reading your workspace\u2026",
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
    no: "Stay"
  },
  /** A row's second button on the first run, and what it says once pressed. */
  putOff: { put: "Later", undo: "Undo later" },
  /** Find, the business step while there is a listing to link (canvas R1, P1): only what Google said, and the owner's words. */
  find: {
    heading: (name) => name ? `Is this ${name}?` : "Which one is your business?",
    /** The search asks the name typed at sign-up while there is no receptionist, and the name and address on record after (the search route). */
    lead: "We looked you up on Google with the name you signed up with.",
    leadOnRecord: "We looked you up on Google with the name and address on record.",
    typed: (q) => `What Google has for \u201C${q}\u201D.`,
    reading: "Looking on Google\u2026",
    pick: "Your listing on Google",
    best: "Best match",
    maps: "See it on Maps",
    noAddress: "No address on Google",
    none: (q) => `Nothing on Google for \u201C${q}\u201D.`,
    search: "Not these? Search by name or phone number",
    /** A phone shows the best match alone until this is pressed (canvas P1). */
    more: "Not this one? Search again",
    searchCta: "Search",
    yes: "Yes, this is us",
    notOnGoogle: "We're not on Google",
    linked: (name, read) => `${name} is your listing on Google \u2014 ${read ? "read just now" : "Google will be read within the hour"}.`,
    notLinked: "Not linked",
    notSaved: "Not saved",
    retry: "Try again",
    terms: "Terms of service",
    privacy: "Privacy policy"
  },
  /** Check, the business step once Find is not shown (canvas R2, V2): what the receptionist answers from. */
  check: {
    /** A listing on record: what was found there. */
    found: "Here's what we found",
    foundLead: "Your receptionist answers from this. Fix anything that's off.",
    /** None: the basics, asked (V2). */
    basics: "Tell us the basics",
    basicsLead: "Your receptionist answers from this. You can add more later in Settings.",
    /** No receptionist yet: the owner's one press, and where it starts from. */
    makeListed: "Your receptionist starts from what your Google listing says, and you check it here.",
    makeNamed: (name) => `Your receptionist starts with ${name ? `the name ${name}` : "your business's name"}, and you add the rest here.`,
    make: "Set up your receptionist",
    making: "Setting up\u2026",
    notMade: "Not set up",
    ownerSetsUp: "An owner sets up the receptionist here.",
    /** Made, but the settings read has not brought it yet; and a read that failed, by what it could not read. */
    reading: "Reading your receptionist\u2026",
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
      removed: (name) => `Removed ${name}`
    },
    /** The booking page the business's website names, offered under the booking link row (3c-4). */
    bookingPage: { found: (page) => `Found on your website: ${page}`, use: "Use it" }
  }
};
export function unsureHoursWords(days) {
  if (!days.length) return null;
  if (days.length >= 7) return "Google's hours for every day could not be copied: add yours.";
  const names = days.map((d) => DAY_NAMES[d] ?? d);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Google's hours for ${list} could not be copied: check ${days.length === 1 ? "that day" : "those days"}.`;
}
const rowOf = (vm, id) => vm.rows.find((r) => r.id === id) ?? null;
const stepDone = (vm, def) => (
  // A number the owner chose to keep or move is not done with a line that answers: its forwarding is still to be saved,
  // or put off by name (Setup's `forwardingOwed`). Without it the step read as done from any tab that lost the choice.
  !(def.key === "phone" && vm.forwardingOwed) && def.needs.every((id) => {
    const r = rowOf(vm, id);
    return !r || r.state === "ready" || id === "try" && (vm.trySkipped || r.later);
  })
);
export function firstRunStepOf(param) {
  const hit = FIRST_RUN_STEPS.find((s) => s.key === param);
  return hit ? hit.key : null;
}
export function firstRunKicker(key) {
  const i = FIRST_RUN_STEPS.findIndex((s) => s.key === key);
  return `Step ${i + 1} of ${FIRST_RUN_STEPS.length} \xB7 ${FIRST_RUN_STEPS[i].name}`;
}
export function firstRunOf(vm, at, who) {
  const last = FIRST_RUN_STEPS[FIRST_RUN_STEPS.length - 1];
  const open = FIRST_RUN_STEPS.find((s) => s !== last && !stepDone(vm, s));
  const current = open ? open.key : last.key;
  const steps = FIRST_RUN_STEPS.map((def2, i) => ({
    key: def2.key,
    name: def2.name,
    number: i + 1,
    state: def2.key === current ? "current" : def2 !== last && stepDone(vm, def2) ? "done" : "ahead",
    rows: def2.rows.map((id) => rowOf(vm, id)).filter((r) => r !== null),
    to: def2.key === current ? FIRST_RUN_ROUTE : firstRunStepRoute(def2.key)
  }));
  const findAsked = at === FIND_PARAM;
  const asked = findAsked ? "business" : firstRunStepOf(at);
  const shown = steps.find((s) => s.key === asked && s.state !== "ahead") ?? steps.find((s) => s.key === current) ?? steps[0];
  const def = FIRST_RUN_STEPS[shown.number - 1];
  const final = def === last;
  const google = rowOf(vm, "google");
  const find = shown.key === "business" && !!who?.owner && vm.findable && !!google && (findAsked || !google.later);
  const C = FIRST_RUN_WORDS.check;
  const onCheck = shown.key === "business" && !find && vm.check.receptionist !== "broken";
  const made = vm.check.receptionist === "set";
  const check = onCheck ? {
    made,
    make: !made && who?.owner ? {
      sentence: vm.check.listed ? C.makeListed : C.makeNamed(businessNameOf(null, who.workspaceName)),
      cta: C.make,
      busy: C.making
    } : null,
    waiting: !made && !who?.owner ? C.ownerSetsUp : null,
    unsure: made ? unsureHoursWords(vm.check.unsure) : null,
    find: vm.findable && who?.owner ? { label: C.findIt, to: FIRST_RUN_FIND_ROUTE } : null,
    type: vm.check.type,
    bookingPage: vm.check.bookingPage
  } : null;
  const F = FIRST_RUN_WORDS.find;
  const facts = rowOf(vm, "facts");
  const face = find ? {
    heading: F.heading(businessNameOf(who?.receptionistName, who?.workspaceName)),
    lead: who?.receptionistName ? F.leadOnRecord : F.lead,
    onward: null
  } : check ? {
    heading: vm.check.listed ? C.found : C.basics,
    lead: vm.check.listed ? C.foundLead : C.basicsLead,
    onward: made ? {
      label: C.looksRight,
      to: FIRST_RUN_ROUTE,
      leaves: false,
      held: shown.state === "done" ? null : facts?.sentence ?? null
    } : null
  } : final ? {
    heading: FIRST_RUN_WORDS.liveHeading,
    lead: vm.readiness.sentence,
    onward: { label: FIRST_RUN_WORDS.finish, to: "today", leaves: true, held: null }
  } : {
    heading: def.name,
    lead: def.lead,
    onward: shown.state === "done" ? { label: FIRST_RUN_WORDS.continue, to: FIRST_RUN_ROUTE, leaves: false, held: null } : null
  };
  const onward = face.onward;
  const primary = onward || find || check ? null : shown.rows.find((r) => r.state !== "ready" && !r.later && r.verb) ?? null;
  return {
    steps,
    current,
    complete: !open,
    shown,
    heading: face.heading,
    lead: face.lead,
    phoneLine: firstRunKicker(shown.key),
    progress: Math.round(shown.number / FIRST_RUN_STEPS.length * 100),
    primaryRow: primary ? primary.id : null,
    back: shown.number > 1 ? steps[shown.number - 2].to : null,
    onward,
    find,
    findDone: find && findAsked ? shown.to : null,
    check
  };
}
const CARD_SKIP = { put: "Skip", said: "Put off. It stays in Setting up for when you're ready." };
const CARD_REMIND = {
  words: "Your calendar is in. Remind each customer the day before?",
  label: "Turn on",
  // New sequence on the day-before moment, its line written in (sequence-address.ts newSequenceRoute): the composer's
  // Turn on went with its moment mode (the closed-loop audit of 17 Oct 2026, G).
  to: "campaigns/sequences/new:moment:visit_tomorrow"
};
export function setupCardOf(vm) {
  const fr = firstRunOf(vm);
  if (!fr.complete && fr.current !== "try") {
    const left = fr.steps.slice(0, -1).filter((s) => s.state !== "done").length;
    const next = fr.steps.find((s) => s.key === fr.current) ?? fr.steps[0];
    const def = FIRST_RUN_STEPS[next.number - 1];
    return {
      title: FINISH_SETTING_UP,
      left: `${left} ${left === 1 ? "step" : "steps"} left`,
      start: {
        // Said as it is: nothing answers yet; WhatsApp answers and calls do not (Setup's readiness counts either);
        // or calls are answered and a step is still open.
        name: !vm.readiness.answering ? "Your receptionist isn't answering yet" : vm.tryIt?.voice ? "Your receptionist is answering" : "Calls aren't answered yet",
        sentence: def.lead,
        status: `Next: ${next.name.toLowerCase()}`,
        cta: "Continue setting up",
        ctaShort: "Continue",
        to: FIRST_RUN_ROUTE
      },
      rows: [],
      hide: null,
      skip: CARD_SKIP,
      remind: null
    };
  }
  const rows = SETUP_CARD_ORDER.map((id) => rowOf(vm, id)).filter(
    (r) => r !== null && r.state !== "ready" && !r.later && !!r.verb
  );
  if (!rows.length) return null;
  const said = rows.length === 1 ? CARD_SKIP.said : `All ${rows.length} put off. They stay in Setting up for when you're ready.`;
  const calendar = rowOf(vm, "calendar");
  return {
    title: FINISH_SETTING_UP,
    left: `${rows.length} left`,
    start: null,
    rows,
    hide: { put: "Hide", said },
    skip: CARD_SKIP,
    // Only where Campaigns can make the reminder: a calendar link connected (SetupVM.calendarLinked, the moments'
    // calendarOn), and the row ready. The row's Ready alone also says "booked by hand" and bookings by email alone, where
    // the moment is not offered and core refuses it.
    remind: vm.calendarLinked && calendar?.state === "ready" ? { ...CARD_REMIND } : null
  };
}
const linkShown = (url) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");
function cardGreeting(spoken, profile, setup) {
  const stored = profile?.phone_greeting ?? setup.business.phone_greeting ?? null;
  return greetingOf({ name: spoken, stored, paused: false }).text;
}
export function receptionistCardOf(i) {
  if (i.sellsBy !== null && typeof i.sellsBy !== "string") {
    throw new TypeError(
      "receptionistCardOf needs how customers buy (the workspace's sells_by, null when not said): how a business that quotes is reached turns on it."
    );
  }
  const b = i.brain;
  const p = b?.profile ?? null;
  const spoken = (b?.business_name || i.setup.business.name || "").trim();
  const name = businessNameOf(spoken, i.workspaceName) ?? "";
  const tried = !!(i.setup.channels.voice.lastInboundAt || i.setup.channels.whatsapp.lastInboundAt);
  const status = !i.answering ? { state: "not_started", words: "Not answering yet" } : tried ? { state: "ready", words: "Answering" } : { state: "waiting_you", words: "Answering \xB7 not tried yet" };
  const sv = servicesWords(p?.services ?? null);
  const kept = i.numbers?.keptLine ?? null;
  const line = i.numbers?.voiceLine ?? i.setup.channels.voice.number ?? null;
  const through = i.numbers?.handoff ?? i.setup.business.handoff ?? null;
  const show = (n) => n ? formatPhoneDisplay(n) ?? n : null;
  const quotes = !!b && !b.booking_link && bookingLinkOptional(i.sellsBy);
  return {
    caption: "Your receptionist, so far",
    initials: name ? initialsOf(name) : "",
    name: name || "Your receptionist",
    status,
    strip: `Your receptionist \xB7 ${status.words}`,
    greetingLabel: "Greets every caller with",
    greeting: cardGreeting(spoken, p, i.setup),
    rows: [
      { key: "open", label: "Open", value: i.setup.business.hours && p?.hours ? openWeekWords(p.hours, i.tz) : null },
      {
        key: "knows",
        label: "Knows",
        value: sv.count ? [sv.chips.map((c) => c.name).join(", "), sv.more].filter(Boolean).join(" ") : null
      },
      quotes ? { key: "books", label: "For a quote", value: "Takes their details" } : { key: "books", label: "Books with", value: b?.booking_link ? linkShown(b.booking_link) : null },
      { key: "speaks", label: "Speaks", value: p?.languages?.length ? p.languages.join(", ") : null },
      // The line it answers, and the number set to forward to it, as recorded: no claim about when a call forwards.
      {
        key: "answers",
        label: "Answers",
        value: line ? kept ? `${show(line)}, and calls forwarded from ${show(kept)}` : show(line) : null
      },
      { key: "through", label: "Puts through to", value: show(through) }
    ],
    foot: "Fills in as you go. You can change any of it later in Settings."
  };
}
export function shouldLandOnFirstRun(role, answering, route, landed) {
  if (landed || answering || !ROLE_PERMS[role]?.settings) return false;
  return route === "" || route === "today";
}
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
  landedKey: FIRST_RUN_LANDED_KEY
};
