import { formatPhoneDisplay } from "../shared/phone.js";
import { SETUP_STATE_WORDS } from "./setup.js";
import { KEEP_ROW, REMIND_SKIPPED, putOffEnds } from "./setup-put-off.js";
import { FORWARDING_WAIT_WORDS } from "./setup-put-off.js";
import { FIRST_RUN_ROUTE, firstRunStepRoute } from "./first-run-route.js";
import { FINISH_SETTING_UP } from "./first-run-route.js";
import { firstRunOf, firstRunStepDefOf } from "./first-run.js";
const GO_LIVE = /* @__PURE__ */ firstRunStepDefOf("live");
const SETUP_CARD_ORDER = [
  "try",
  "whatsapp",
  "clients",
  "calendar",
  "team",
  "handoff",
  "keep",
  "google",
  "email",
  "yes"
];
const CARD_PUT_OFF = {
  put: "Skip",
  hide: "Hide",
  back: "Back after a week",
  backShort: "Back",
  week: "Put off for a week.",
  good: "Off your list.",
  // "The number you already have" rests every time (setup-put-off.ts putOffEnds): what waiting costs, said with each Skip.
  keep: FORWARDING_WAIT_WORDS
};
const CARD_SKIP = { put: CARD_PUT_OFF.put, back: CARD_PUT_OFF.back, backShort: CARD_PUT_OFF.backShort };
const CARD_HOMES = {
  try: () => "Call your number any time to hear it.",
  whatsapp: () => "It's in Settings \u203A Connections.",
  clients: () => "It's in People \u203A Add people.",
  calendar: () => "It's in Settings \u203A Hours & booking.",
  team: (r) => r.verb?.to === "admin/notifications" ? "It's in Settings \u203A Notifications." : "It's in Settings \u203A Team.",
  handoff: () => "It's in Settings \u203A How it answers.",
  google: () => "It's in Settings \u203A Connections.",
  email: () => "It's in Settings \u203A Connections.",
  yes: () => "It's in People \u203A Get their yes."
};
function skipSaid(id, r) {
  if (id === KEEP_ROW) return `${CARD_PUT_OFF.week} ${CARD_PUT_OFF.keep}`;
  return putOffEnds(id, r.back) === "good" ? `${CARD_PUT_OFF.good} ${CARD_HOMES[id](r)}` : CARD_PUT_OFF.week;
}
function hideSaid(drawn) {
  const [only] = drawn;
  if (drawn.length === 1 && only) return only.said;
  const good = drawn.filter((d) => d.good).length;
  const week = drawn.length - good;
  const head = good === 0 ? `All ${drawn.length} put off for a week.` : week === 0 ? `All ${drawn.length} off your list.` : `${week} put off for a week, ${good} off your list.`;
  return drawn.some((d) => d.id === KEEP_ROW) ? `${head} ${CARD_PUT_OFF.keep}` : head;
}
const CARD_REMIND = {
  id: REMIND_SKIPPED,
  name: "The day-before reminder",
  stateWords: SETUP_STATE_WORDS.not_started,
  words: "Your calendar is in. Remind each customer the day before.",
  home: "Turn it on any time in Sequences.",
  label: "Turn on",
  // New sequence on the day-before moment, its line written in (sequence-address.ts newSequenceRoute): the composer's
  // Turn on went with its moment mode (the closed-loop audit of 17 Oct 2026, G).
  to: "campaigns/sequences/new:moment:visit_tomorrow"
};
const CARD_BILLING = { title: "Your plan", left: "Needs you" };
export const SETUP_CARD_WORDS = {
  startCta: "Continue setting up",
  startShort: "Continue",
  notAnswering: "Not answering yet",
  answering: "Answering",
  callsNotAnswered: "Calls aren't answered yet",
  next: (name) => `Next: ${name.toLowerCase()}`,
  keptTitle: "Kept for you",
  goingLive: "Finish going live",
  needYou: (n) => `${n} need${n === 1 ? "s" : ""} you`,
  doneTitle: "Already done",
  /** What is kept, in the order the steps made it. */
  kept: {
    business: (name, listed) => listed ? `${name}, read from Google` : name,
    sounds: (sounds) => `Your receptionist: ${sounds}`,
    taught: (n) => `${n} ${n === 1 ? "thing" : "things"} you taught it`,
    rehearsed: "Your rehearsal, reviewed",
    keeping: (n) => `Keeping ${n}, when you go live`,
    moving: (n) => `Moving ${n} to Chanlytics, when you go live`,
    newNumber: (n) => `Its own number, ${n}, when you go live`
  },
  done: {
    line: (n) => `Its number, ${n}`
  }
};
const cardRowOf = (vm, id) => vm.rows.find((r) => r.id === id) ?? null;
function keptForYouOf(vm, who) {
  const K = SETUP_CARD_WORDS.kept;
  const n = vm.want ? formatPhoneDisplay(vm.want.number) ?? vm.want.number : null;
  return [
    who?.business && vm.check.receptionist === "set" ? K.business(who.business, vm.check.listed) : null,
    who?.sounds && vm.receptionistMet ? K.sounds(who.sounds) : null,
    vm.rehearsal.kept ? K.taught(vm.rehearsal.kept) : null,
    vm.rehearsal.reviewed ? K.rehearsed : null,
    vm.want && n ? vm.want.way === "keep" ? K.keeping(n) : vm.want.way === "move" ? K.moving(n) : K.newNumber(n) : null
  ].filter((x) => !!x);
}
const GOING_LIVE_ROWS = ["keep", "try", "whatsapp"];
export function setupCardOf(vm, who) {
  const W = SETUP_CARD_WORDS;
  const billing = cardRowOf(vm, "billing");
  if (billing && billing.state === "waiting_you" && billing.verb)
    return {
      ...CARD_BILLING,
      start: null,
      kept: [],
      rows: [{ ...billing, said: null }],
      done: [],
      hide: null,
      skip: CARD_SKIP,
      remind: null
    };
  const fr = firstRunOf(vm);
  const paid = !billing || billing.state === "ready";
  if (!fr.complete && (fr.current !== "live" || !paid)) {
    const left = fr.steps.filter((s) => s.state !== "done").length;
    const def = firstRunStepDefOf(fr.current);
    return {
      title: FINISH_SETTING_UP,
      left: `${left} ${left === 1 ? "step" : "steps"} left`,
      start: {
        // Said as it is: nothing answers yet; WhatsApp answers and calls do not; or calls are answered and a step is open.
        name: !vm.readiness.answering ? W.notAnswering : vm.tryIt?.voice ? W.answering : W.callsNotAnswered,
        sentence: def.lead,
        status: W.next(def.name),
        cta: W.startCta,
        ctaShort: W.startShort,
        to: FIRST_RUN_ROUTE
      },
      kept: keptForYouOf(vm, who),
      rows: [],
      done: [],
      hide: null,
      skip: CARD_SKIP,
      remind: null
    };
  }
  if (!fr.complete) {
    const rows2 = GOING_LIVE_ROWS.flatMap((id) => {
      const r = cardRowOf(vm, id);
      return r && r.state !== "ready" && r.state !== "waiting_them" && r.verb ? [{ ...r, said: null }] : [];
    });
    const line = vm.tryIt?.voiceLabel ?? null;
    return {
      title: W.goingLive,
      left: rows2.length ? W.needYou(rows2.length) : W.next(GO_LIVE.name),
      // Nothing of the owner's left on Go live (the number still on its way): the one row back to it.
      start: rows2.length ? null : {
        name: W.callsNotAnswered,
        sentence: GO_LIVE.lead,
        status: W.next(GO_LIVE.name),
        cta: W.startCta,
        ctaShort: W.startShort,
        to: firstRunStepRoute("live")
      },
      kept: [],
      rows: rows2,
      done: line ? [W.done.line(line)] : [],
      hide: null,
      skip: null,
      remind: null
    };
  }
  const rows = SETUP_CARD_ORDER.flatMap((id) => {
    const r = cardRowOf(vm, id);
    return r && r.state !== "ready" && r.state !== "waiting_them" && !r.later && r.verb ? [{ ...r, said: skipSaid(id, r) }] : [];
  });
  if (!rows.length) return null;
  const calendar = cardRowOf(vm, "calendar");
  const remindGood = putOffEnds(REMIND_SKIPPED, vm.remindBack) === "good";
  const remind = vm.calendarLinked && calendar?.state === "ready" && !vm.remindSkipped && !vm.dayBeforeOn ? {
    id: CARD_REMIND.id,
    name: CARD_REMIND.name,
    stateWords: CARD_REMIND.stateWords,
    words: CARD_REMIND.words,
    label: CARD_REMIND.label,
    to: CARD_REMIND.to,
    said: remindGood ? `${CARD_PUT_OFF.good} ${CARD_REMIND.home}` : CARD_PUT_OFF.week,
    back: vm.remindBack
  } : null;
  const drawn = [
    ...rows.map((r) => ({ id: r.id, good: putOffEnds(r.id, r.back) === "good", said: r.said ?? "" })),
    ...remind ? [{ id: remind.id, good: remindGood, said: remind.said }] : []
  ];
  return {
    title: FINISH_SETTING_UP,
    left: `${drawn.length} left`,
    start: null,
    kept: [],
    rows,
    done: [],
    hide: { put: CARD_PUT_OFF.hide, said: hideSaid(drawn) },
    skip: CARD_SKIP,
    remind
  };
}
