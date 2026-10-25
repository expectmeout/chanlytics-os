import { DAY_NAMES } from "../config/workspace-config/config-rules.js";
import { possessive } from "../shared/words.js";
import { WALK_IN_WORDS } from "../config/business-tab/choices.js";
import { ASSISTANT_NAME_WORDS } from "../config/business-tab/how-it-answers.js";
import {
  FIND_PARAM,
  FIRST_RUN_FIND_ROUTE,
  FIRST_RUN_ROUTE,
  FIRST_RUN_STEP_KEYS,
  firstRunStepOf,
  firstRunStepRoute
} from "./first-run-route.js";
import { FIRST_RUN_TITLE } from "./first-run-route.js";
import { businessNameOf } from "./first-run-receptionist.js";
export { FIRST_RUN_ROUTE, firstRunStepRoute, FIRST_RUN_FIND_ROUTE } from "./first-run-route.js";
const STEP_DEFS = {
  business: {
    name: "Your business",
    lead: "We find you on Google and build a receptionist that answers as you.",
    rows: ["facts", "google"]
  },
  receptionist: {
    name: "Your receptionist",
    lead: "What it knows, the two things only you know, and how it sounds.",
    rows: ["facts"]
  },
  rehearse: {
    name: "Rehearse",
    lead: "Talk to it as a customer would, then fix what it gets wrong. Free, and nothing to buy yet.",
    rows: []
  },
  channels: {
    name: "Where it answers",
    lead: "Choose what your customers use. Nothing is bought here; it all connects when you go live.",
    rows: ["line", "keep", "whatsapp", "calendar", "email"]
  },
  live: {
    name: "Go live",
    lead: "Everything you chose starts at once.",
    rows: ["billing", "line", "keep", "try", "handoff", "whatsapp"]
  }
};
export const firstRunStepDefOf = (key) => ({ key, ...STEP_DEFS[key] });
export const FIRST_RUN_STEPS = /* @__PURE__ */ FIRST_RUN_STEP_KEYS.map((key) => ({
  key,
  ...STEP_DEFS[key]
}));
const rowOf = (vm, id) => vm.rows.find((r) => r.id === id) ?? null;
const ready = (vm, id) => {
  const r = rowOf(vm, id);
  return !r || r.state === "ready";
};
const STEP_DONE = {
  // Set up, and Connect it to Google answered where it is offered (decision 0073, R17): connected, or Not now.
  business: (vm) => vm.check.receptionist === "set" && !vm.googleConnect.offered,
  receptionist: (vm) => vm.check.receptionist === "set" && ready(vm, "facts") && (vm.receptionistMet || vm.readiness.answering || vm.rehearsal.reviewed > 0),
  rehearse: (vm) => vm.rehearsal.reviewed > 0 || vm.rehearseSkipped || vm.readiness.answering,
  // A calls choice saved, or a line already on its way or asked of a person; with no number to choose here (no lines
  // provider on this deployment), the member's going on, and Go live's rows say who has the line.
  channels: (vm) => !!vm.want || vm.lineUnderway || !vm.numbersHere && vm.channelsSeen,
  // The plan runs and the line answers; a number kept owes no forwarding; and a call came in, or the check was put off.
  live: (vm) => {
    const t = rowOf(vm, "try");
    return ready(vm, "billing") && ready(vm, "line") && ready(vm, "receptionist") && !vm.forwardingOwed && (!t || t.state === "ready" || vm.trySkipped || t.later);
  }
};
const stepDone = (vm, key) => STEP_DONE[key](vm);
export const FIRST_RUN_WORDS = {
  title: FIRST_RUN_TITLE,
  later: "Finish later",
  laterShort: "Later",
  back: "Back",
  continue: "Continue",
  finish: "Open Today",
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
  /** Find, Your business while there is a listing to link (canvas 1B): only what Google said, and the owner's words. */
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
    /** A phone shows the best match alone until this is pressed (canvas 1B, phone). */
    more: "Not this one? Search again",
    searchCta: "Search",
    yes: "That's us",
    notOnGoogle: "We're not on Google",
    linked: (name, read) => `${name} is your listing on Google \u2014 ${read ? "read just now" : "Google will be read within the hour"}.`,
    notLinked: "Not linked",
    notSaved: "Not saved",
    retry: "Try again",
    terms: "Terms of service",
    privacy: "Privacy policy"
  },
  /**
   * Connect it to Google (decision 0073, R17; canvas 1B·g, 1B·h, 1B·i): after "That's us", for an owner who manages the
   * profile, what one Google sign-in brings, said before Google's window; back from it, what came in; and, for an
   * account that manages no such location, who can add the owner. Not now keeps the public listing watched.
   */
  google: {
    heading: "Do you manage it on Google?",
    lead: (business) => `Sign in with the Google account that manages ${business ?? "your business"}, and it comes in as you keep it there:`,
    brings: [
      "All your reviews, and you answer them from here",
      "Your hours, holiday hours included",
      "Your services and prices, for you to check next",
      "New reviews within the hour, on your bell"
    ],
    note: (assistant) => `${assistant ?? "Your receptionist"} drafts the replies, and nothing is posted until you say so. Disconnect it any time in Settings.`,
    connect: "Connect Google",
    someoneElse: "Someone else manages it",
    notNow: "Not now",
    connectedHeading: (business) => `${business ?? "Your business"} is connected`,
    connectedWho: (email) => email ? `Google \xB7 ${email} \xB7 just now` : "Google \xB7 just now",
    rows: { reviews: "Reviews", hours: "Hours", services: "Services and prices", news: "New reviews" },
    reviewsSay: (n, back, waiting) => [
      n === null ? "Reading them" : n === 1 ? "The one there is" : `All ${n.toLocaleString()}`,
      back ? `back to ${back}` : null,
      waiting ? `${waiting} wait for a reply` : null
    ].filter(Boolean).join(" \xB7 "),
    hoursSay: "As your profile keeps them, offered at Check",
    servicesSay: (n) => n ? `${n}, for you to check next` : "None listed on your profile",
    newsSay: "Read every hour; your bell rings",
    in: "In",
    on: "On",
    reading: "Reading\u2026",
    replies: "Replies wait for you until you choose otherwise in Autonomy.",
    notManagerHeading: "Someone else manages it on Google",
    notManagerLead: (business) => `That account doesn't manage ${business ?? "your business"}. Whoever does can add you in a minute:`,
    notManagerSteps: (business, email) => [
      `On Google, they open ${business ?? "your business"} and its Business Profile settings.`,
      `In People and access, they add ${email ?? "you"} as an owner or manager.`,
      "You press Connect Google again: Today keeps it as a row until then."
    ],
    notManagerUntil: (assistant) => `Until then ${assistant ?? "your receptionist"} reads your public listing: the rating, the count, and the five reviews Google shows.`,
    goOn: "Go on without it",
    tryAnother: "Try another account",
    /** A refusal from Google that Connections has no words for. */
    failed: "Google did not connect. Try again.",
    /** The callback's own refusals that mean the account manages no location of this business. */
    notManagerWhy: ["no_locations", "no_location", "not_on_maps", "accounts_unreadable"]
  },
  /** Your workspace, building (canvas 1B): what is done, what waits on the owner, and what comes next, beside Find. */
  building: {
    title: "Your workspace, building",
    made: (name) => `Workspace made \xB7 ${name}`,
    searching: "Searching Google",
    found: (n) => n === 0 ? "Not found on Google yet" : `Found on Google \xB7 ${n} ${n === 1 ? "match" : "matches"}`,
    /** While Google is asked: the line the confirming takes, said ahead, so the list keeps its length as it answers. */
    confirmNext: "Confirm your listing",
    confirm: "Waiting for you to confirm it",
    confirmed: "Your listing, confirmed",
    connect: "Connect your Business Profile",
    connected: "Your Business Profile, connected",
    website: "Read your website",
    websiteRead: "Your website, read",
    write: "Write your receptionist",
    written: "Your receptionist, written",
    note: "Until you connect it, it reads only what's public: your Google listing and your website."
  },
  /** Check, Your receptionist (canvas 2): what the receptionist answers from. */
  check: {
    /** A listing on record: what was found there. */
    found: (name) => name ? `Meet ${possessive(name)} receptionist` : "Meet your receptionist",
    foundLead: "Built from your Google listing. Fix anything that's off.",
    /** Your receptionist with nothing found on Google: what it answers from is the rows under this. */
    basicsLead: "Your receptionist answers from this. You can add more later in Settings.",
    /** No receptionist yet, on Your business: the step is the owner's one press, said as what it does. */
    makeHeading: "Build your receptionist",
    makeLead: "One press writes it from what we know. Nothing answers anyone until you go live.",
    /** Where the press starts it from: the listing, or the name typed at sign-up. */
    makeListed: "It starts from your Google listing, and you check every detail next.",
    makeNamed: (name) => `It starts with ${name ? `the name ${name}` : "your business's name"}, and you add the rest next.`,
    make: "Build my receptionist",
    making: "Building\u2026",
    notMade: "Not set up",
    ownerSetsUp: "An owner sets up the receptionist here.",
    /** Made, but the settings read has not brought it yet; and a read that failed, by what it could not read. */
    reading: "Reading your receptionist\u2026",
    failedWhat: "your receptionist",
    /** The onward, once what it answers from is checked: on to the rehearsal (decision 0073). */
    looksRight: "Rehearse it now",
    rehearseNote: "Next: talk to it as a customer would, then fix what it gets wrong. Free. Nothing to buy yet.",
    /** Not on Google, said, where Google can be searched: the way back to Find. */
    findIt: "On Google after all? Find it",
    /** What each group of rows is, for a screen reader: the words on screen are the rows' own. */
    groups: { facts: "Your hours and where you are", booking: "Booking and prices", offer: "What it offers" },
    /** The two things only the owner knows (canvas 2): walk-ins, and what it says of a price. */
    onlyYou: "Two things only you know",
    walkIns: {
      label: WALK_IN_WORDS.ask,
      options: {
        yes: WALK_IN_WORDS.options.yes.label,
        room: WALK_IN_WORDS.options.room.label,
        no: WALK_IN_WORDS.options.no.label
      },
      saved: "Kept."
    },
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
  },
  /** How it sounds (canvas 2, 2·e, 2·f, 2·g): the panel beside Check, a sheet on a phone. */
  sounds: {
    heading: "How it sounds",
    open: "How it sounds",
    change: "Change",
    voices: "Voices",
    voicesNote: "8 voices \xB7 hear each one",
    personality: "Personality",
    /** The name box's example is the voice the owner is hearing (sounds.tsx), never another name beside it. */
    name: "Name",
    nameHint: ASSISTANT_NAME_WORDS.hint,
    speaks: "Speaks",
    later: "Change any of it later in Settings.",
    done: "Done",
    hear: (voice) => `Hear ${voice}`,
    /** Under the greeting (canvas 2): the owner's own words any time, the disclosure always kept (decision 0051). */
    ownWords: "Your own words any time; the automated-assistant line always stays.",
    /** What a pick kept, said in its toast. */
    kept: (what) => what ? `${what}. Kept.` : "Kept.",
    stop: "Stop",
    /** A language first that the voice doesn't speak natively (canvas 2·f): the native voices suggested. */
    accent: (voice, language, natives) => `${voice} speaks ${language} with an accent.${natives.length ? ` ${natives.join(" or ")} ${natives.length === 1 ? "sounds" : "sound"} native to ${language}-speaking callers.` : ""}`,
    switchTo: (voice) => `Use ${voice}`,
    keep: (voice) => `Keep ${voice}`
  },
  /** Rehearse (canvas 3, 3R): decision 0069's parts on a page, and the step's skip. */
  rehearse: {
    heading: (name) => name ? `Talk to ${name} as a customer would` : "Talk to it as a customer would",
    lead: "A rehearsal: nothing is sent and nobody is dialed. Then see how it did, and fix what it got wrong.",
    reviewedHeading: (name) => name ? `How ${name} did` : "How it did",
    reviewedLead: "Each answer judged against what it was told then. Fix what it got wrong; each fix is one change you can undo.",
    onward: "Looks good, go on",
    again: "Talk again",
    typeInstead: "Type instead",
    talkInstead: "Talk instead",
    using: "What it's reading",
    usingNote: "What it answers from. Anything it didn't know shows after the call.",
    tryAsking: "Try asking",
    asks: ["Are you open Sunday?", "Do you do kids' cuts?", "Can I get a refund?", "\xBFHablan espa\xF1ol?"],
    notSent: "Kept with this rehearsal. Never in Reports, never in People.",
    trained: (n) => n ? `Trained: ${n} ${n === 1 ? "thing" : "things"} so far.` : "Trained so far: nothing yet.",
    skip: "Can't talk right now? Skip for now",
    nudge: "Most owners talk to it once. It's a minute, and it's how you know it answers as you'd want.",
    stay: "OK, I'll talk to it",
    anyway: "Skip anyway"
  },
  /** Where it answers (canvas 4): the step's onward; its tiles are first-run-channels.ts. */
  channels: {
    heading: (name) => name ? `Where should ${name} answer?` : "Where should it answer?",
    onward: "Continue to go live"
  },
  /** Go live (canvas 5A–5C): its stages are first-run-golive.ts; these are the step's own head and its last onward. */
  live: {
    heading: (name) => name ? `${name} is ready to go live` : "Your receptionist is ready to go live",
    answering: (assistant, business) => `${assistant ?? "Your receptionist"} is answering${business ? ` for ${business}` : ""}`
  }
};
export function unsureHoursWords(days) {
  if (!days.length) return null;
  if (days.length >= 7) return "Google's hours for every day could not be copied: add yours.";
  const names = days.map((d) => DAY_NAMES[d] ?? d);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Google's hours for ${list} could not be copied: check ${days.length === 1 ? "that day" : "those days"}.`;
}
export function firstRunKicker(key) {
  const i = FIRST_RUN_STEPS.findIndex((s) => s.key === key);
  return `${i + 1} of ${FIRST_RUN_STEPS.length} \xB7 ${FIRST_RUN_STEPS[i].name}`;
}
function stepAskedOf(at) {
  const findAsked = at === FIND_PARAM;
  return { asked: findAsked ? "business" : firstRunStepOf(at), findAsked };
}
function checkOf(vm, key, find, who) {
  const C = FIRST_RUN_WORDS.check;
  const made = vm.check.receptionist === "set";
  if (vm.check.receptionist === "broken") return null;
  const onBusiness = key === "business" && !find && !made;
  const onReceptionist = key === "receptionist";
  if (!onBusiness && !onReceptionist) return null;
  return {
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
  };
}
function faceOf(o) {
  const { vm, shown, find, check, complete, who } = o;
  const W = FIRST_RUN_WORDS;
  const def = STEP_DEFS[shown.key];
  const business = businessNameOf(who?.receptionistName, who?.workspaceName);
  const assistant = (who?.assistantName ?? "").trim() || null;
  const onward = (label, held = null) => ({ label, to: FIRST_RUN_ROUTE, leaves: false, held });
  if (find)
    return {
      heading: W.find.heading(business),
      lead: who?.receptionistName ? W.find.leadOnRecord : W.find.lead,
      onward: null
    };
  switch (shown.key) {
    case "business": {
      const set = vm.check.receptionist !== "none";
      return {
        heading: set ? def.name : W.check.makeHeading,
        lead: set ? def.lead : W.check.makeLead,
        onward: shown.state === "done" ? onward(W.continue) : null
      };
    }
    case "receptionist": {
      const facts = rowOf(vm, "facts");
      return {
        heading: W.check.found(business),
        lead: vm.check.listed ? W.check.foundLead : W.check.basicsLead,
        onward: check?.made ? onward(W.check.looksRight, ready(vm, "facts") ? null : facts?.sentence ?? null) : null
      };
    }
    case "rehearse":
      return vm.rehearsal.reviewed > 0 ? {
        heading: W.rehearse.reviewedHeading(assistant),
        lead: W.rehearse.reviewedLead,
        onward: onward(W.rehearse.onward)
      } : { heading: W.rehearse.heading(assistant), lead: W.rehearse.lead, onward: null };
    case "channels":
      return { heading: W.channels.heading(assistant), lead: def.lead, onward: onward(W.channels.onward) };
    case "live":
      return complete ? {
        heading: W.live.answering(assistant, business),
        lead: "",
        onward: { label: W.finish, to: "today", leaves: true, held: null }
      } : { heading: W.live.heading(assistant), lead: def.lead, onward: null };
  }
}
export function firstRunOf(vm, at, who) {
  const done = Object.fromEntries(FIRST_RUN_STEP_KEYS.map((k) => [k, stepDone(vm, k)]));
  const open = FIRST_RUN_STEPS.find((s) => !done[s.key]);
  const complete = !open;
  const current = open ? open.key : "live";
  const steps = FIRST_RUN_STEPS.map((def, i) => ({
    key: def.key,
    name: def.name,
    number: i + 1,
    state: def.key === current && !complete ? "current" : done[def.key] ? "done" : "ahead",
    rows: def.rows.map((id) => rowOf(vm, id)).filter((r) => r !== null),
    to: def.key === current ? FIRST_RUN_ROUTE : firstRunStepRoute(def.key)
  }));
  const { asked, findAsked } = stepAskedOf(at);
  const shown = steps.find((s) => s.key === asked && s.state !== "ahead") ?? steps.find((s) => s.key === current) ?? steps[0];
  const google = rowOf(vm, "google");
  const find = shown.key === "business" && !!who?.owner && vm.findable && !!google && (findAsked || !google.later);
  const connect = shown.key === "business" && !find && !!who?.owner && vm.check.receptionist === "set" && vm.googleConnect.offered;
  const check = connect ? null : checkOf(vm, shown.key, find, who);
  const face = connect ? {
    heading: FIRST_RUN_WORDS.google.heading,
    lead: FIRST_RUN_WORDS.google.lead(businessNameOf(who?.receptionistName, who?.workspaceName)),
    onward: null
  } : faceOf({ vm, shown, find, check, complete, who });
  const drawsRows = !find && !connect && !check && shown.key === "business";
  const primary = drawsRows ? shown.rows.find((r) => r.state !== "ready" && !r.later && r.verb) ?? null : null;
  const R = FIRST_RUN_WORDS.rehearse;
  return {
    steps,
    current,
    complete,
    shown,
    heading: face.heading,
    lead: face.lead,
    phoneLine: firstRunKicker(shown.key),
    progress: Math.round(shown.number / FIRST_RUN_STEPS.length * 100),
    primaryRow: primary ? primary.id : null,
    back: shown.number > 1 ? steps[shown.number - 2].to : null,
    onward: face.onward,
    find,
    findDone: find && findAsked ? shown.to : null,
    connect,
    check,
    skip: shown.key === "rehearse" && vm.rehearsal.reviewed === 0 && !vm.rehearseSkipped ? { label: R.skip, nudge: R.nudge, stay: R.stay, anyway: R.anyway } : null
  };
}
