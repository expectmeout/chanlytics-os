import { formatPhoneDisplay } from "../shared/phone.js";
import { REMIND_SKIPPED, SETUP_STATE_WORDS } from "./setup.js";
import { FIRST_RUN_ROUTE, firstRunStepRoute } from "./first-run-route.js";
import { FINISH_SETTING_UP } from "./first-run-door.js";
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
const CARD_SKIP = { put: "Skip", said: "Put off. It stays in Setting up for when you're ready." };
const CARD_REMIND = {
  id: REMIND_SKIPPED,
  name: "The day-before reminder",
  stateWords: SETUP_STATE_WORDS.not_started,
  words: "Your calendar is in. Remind each customer the day before.",
  said: "Put off. Turn it on any time in Sequences.",
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
      rows: [billing],
      done: [],
      hide: null,
      skip: CARD_SKIP,
      remind: null
    };
  const fr = firstRunOf(vm);
  const paid = !billing || billing.state === "ready";
  if (!fr.complete && (fr.current !== "live" || !paid)) {
    const left2 = fr.steps.filter((s) => s.state !== "done").length;
    const def = firstRunStepDefOf(fr.current);
    return {
      title: FINISH_SETTING_UP,
      left: `${left2} ${left2 === 1 ? "step" : "steps"} left`,
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
    const rows2 = GOING_LIVE_ROWS.map((id) => cardRowOf(vm, id)).filter(
      (r) => r !== null && r.state !== "ready" && r.state !== "waiting_them" && !!r.verb
    );
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
  const rows = SETUP_CARD_ORDER.map((id) => cardRowOf(vm, id)).filter(
    (r) => r !== null && r.state !== "ready" && r.state !== "waiting_them" && !r.later && !!r.verb
  );
  if (!rows.length) return null;
  const calendar = cardRowOf(vm, "calendar");
  const remind = vm.calendarLinked && calendar?.state === "ready" && !vm.remindSkipped && !vm.dayBeforeOn ? { ...CARD_REMIND } : null;
  const left = rows.length + (remind ? 1 : 0);
  const said = left === 1 ? CARD_SKIP.said : remind ? `All ${left} put off. They stay in Setting up, and the reminder in Sequences.` : `All ${left} put off. They stay in Setting up for when you're ready.`;
  return {
    title: FINISH_SETTING_UP,
    left: `${left} left`,
    start: null,
    kept: [],
    rows,
    done: [],
    hide: { put: "Hide", said },
    skip: CARD_SKIP,
    remind
  };
}
