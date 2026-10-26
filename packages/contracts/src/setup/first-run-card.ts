/**
 * Today's card (moved from first-run.ts with decision 0073): what is left to set up, said one of three ways.
 *
 * - While a step before Go live is open, or Go live has not been paid: one row that opens the first run where it stands,
 *   and what is kept for the owner so far (canvas T·a), so Later never reads as lost.
 * - Once paid and something on Go live waits on the owner (the code, the check of the line, WhatsApp's approval): those
 *   rows first, each opening its place, and what is already done (canvas T·c).
 * - After: Setup's own rows that wait on the owner, with Skip and Hide: a Skip puts a row off for a week, and once it
 *   is back, for good, with where it is set up from then (setup-put-off.ts setupPutOffNext).
 */
import { formatPhoneDisplay } from "../shared/phone";
import { SETUP_STATE_WORDS, type SetupRowVM, type SetupVM } from "./setup";
import { KEEP_ROW, REMIND_SKIPPED, putOffEnds } from "./setup-put-off";
import { FORWARDING_WAIT_WORDS } from "./setup-put-off";
import { FIRST_RUN_ROUTE, firstRunStepRoute } from "./first-run-route";
import { FINISH_SETTING_UP } from "./first-run-route";
import { firstRunOf, firstRunStepDefOf } from "./first-run";

/** Go live, the last step: what the card names while the owner goes live. */
const GO_LIVE = /* @__PURE__ */ firstRunStepDefOf("live");

/**
 * Today's card, in the order each row helps most: the test call first, until one has come in (the first run lets it be
 * skipped, Today does not forget it); then WhatsApp, because the booking link goes out by WhatsApp on a call; then the
 * clients' file (decision 0073, R22), so People starts full; then the calendar, so it can say which times are open; then
 * someone to back the owner up; then the rows a step offered and nobody took.
 */
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
  "yes",
] as const;

export interface SetupCardVM {
  title: string;
  /**
   * "3 steps left" while the first run is not done; "2 need you" while going live; "2 left" after, the reminder's row
   * counted with Setup's; "Needs you" beside "Your plan" while a payment failed.
   */
  left: string;
  /** While calls are not answered: the one row, which opens the first run where it stands. */
  /** `ctaShort` is the button on a phone, where it sits beside the words (canvas P9). */
  start: { name: string; sentence: string; status: string; cta: string; ctaShort: string; to: string } | null;
  /** What the first run keeps for the owner while a step is open (canvas T·a "Kept for you"): a line each. */
  kept: string[];
  /**
   * After: Setup's own rows that wait on the owner and are not put off, in SETUP_CARD_ORDER, each with what its Skip
   * says once pressed; a row waiting on Meta, Google or a booking tool's first email is no step of theirs, and stays on
   * Setting up. While going live, Go live's rows that wait on the owner, which no Skip puts off. Or, while a payment
   * failed or the plan is paused, Billing's row alone (CARD_BILLING).
   */
  rows: SetupCardRowVM[];
  /** What is already done while going live (canvas T·c "Already done"): a line each. */
  done: string[];
  /** Puts every row off at once, each as its Skip would, and what the toast says after; only where rows can be put off. */
  hide: { put: string; said: string } | null;
  /**
   * A row's second button on the card, and what a row back from a week put off says beside its name: `back` at a
   * desk, `backShort` on a phone, where the name shares its line with the row's buttons. Null while going live.
   */
  skip: { put: string; back: string; backShort: string } | null;
  /**
   * After the first run, with the calendar in: the one door to the appointment reminder, at the payoff (decision 22 of
   * the spec of 9 Oct 2026: no new first-run step), drawn as the card's last row: its name over its sentence, its button
   * and a Skip that puts `id` off as a row is (`said` is the toast's, `back` whether its week put off ended), so Hide
   * puts it off too. Null while a step is open, while skipped, once a day-before reminder runs (the routes refuse a
   * second), and without a calendar link connected, which the reminder reads (booked by hand or by email alone, Setup's
   * row is ready and the reminder cannot be made).
   */
  remind: {
    id: string;
    name: string;
    stateWords: string;
    words: string;
    label: string;
    to: string;
    said: string;
    back: boolean;
  } | null;
}

/**
 * One of Setup's rows on Today's card: the row, and what its toast says once its Skip is pressed (its Undo is the
 * toast's); null for a row that cannot be put off (Billing's, and Go live's while going live).
 */
export interface SetupCardRowVM extends SetupRowVM {
  said: string | null;
}

/**
 * What putting a row off says on the card: for a week the first time, and once it is back, off the list for good, with
 * where it is set up from then (CARD_HOMES). "It stays in Setting up" named a page nothing reached once the first run
 * was done, and one that drew five of these rows.
 */
const CARD_PUT_OFF = {
  put: "Skip",
  hide: "Hide",
  back: "Back after a week",
  backShort: "Back",
  week: "Put off for a week.",
  good: "Off your list.",
  // What waiting on "The number you already have" costs, said with each of its Skips.
  keep: FORWARDING_WAIT_WORDS,
} as const;

const CARD_SKIP = { put: CARD_PUT_OFF.put, back: CARD_PUT_OFF.back, backShort: CARD_PUT_OFF.backShort } as const;

/** A row Today's card may draw. */
type CardRowId = (typeof SETUP_CARD_ORDER)[number];

/**
 * Where a row is set up once it is off the card for good: the page its own button opens, or for the test call, the
 * number itself; the kept number's forwarding, On calls' row (settings/business/phone/kept-number.tsx).
 */
const CARD_HOMES: Record<CardRowId, (r: SetupRowVM) => string> = {
  try: () => "Call your number any time to hear it.",
  whatsapp: () => "It's in Settings › Connections.",
  clients: () => "It's in People › Add people.",
  calendar: () => "It's in Settings › Hours & booking.",
  team: (r) =>
    r.verb?.to === "admin/notifications" ? "It's in Settings › Notifications." : "It's in Settings › Team.",
  handoff: () => "It's in Settings › How it answers.",
  keep: () => "It's in Settings › How it answers.",
  google: () => "It's in Settings › Connections.",
  email: () => "It's in Settings › Connections.",
  yes: () => "It's in People › Get their yes.",
};

/** What a row's Skip says once pressed: for a week, or for good with its home; the kept number's, with what it costs. */
function skipSaid(id: CardRowId, r: SetupRowVM): string {
  const said = putOffEnds(r.back) === "good" ? `${CARD_PUT_OFF.good} ${CARD_HOMES[id](r)}` : CARD_PUT_OFF.week;
  return id === KEEP_ROW ? `${said} ${CARD_PUT_OFF.keep}` : said;
}

/**
 * What Hide says: every row on the card put off as its own Skip would put it, counted by how. One row says its own
 * words; the kept number's cost is said whenever it is among them.
 */
function hideSaid(drawn: ReadonlyArray<{ id: string; good: boolean; said: string }>): string {
  const [only] = drawn;
  if (drawn.length === 1 && only) return only.said;
  const good = drawn.filter((d) => d.good).length;
  const week = drawn.length - good;
  const head =
    good === 0
      ? `All ${drawn.length} put off for a week.`
      : week === 0
        ? `All ${drawn.length} off your list.`
        : `${week} put off for a week, ${good} off your list.`;
  return drawn.some((d) => d.id === KEEP_ROW) ? `${head} ${CARD_PUT_OFF.keep}` : head;
}

/**
 * Today's door to the reminder (decision 22): New sequence opened on the day-before moment. Its sentence names no
 * appointment: Setup holds no word for one, and New sequence says the workspace's own (journey/appointment-word.ts), so
 * the two never disagree. Put off for good, it is not in Setting up: Sequences is where it is made.
 */
const CARD_REMIND = {
  id: REMIND_SKIPPED,
  name: "The day-before reminder",
  stateWords: SETUP_STATE_WORDS.not_started,
  words: "Your calendar is in. Remind each customer the day before.",
  home: "Turn it on any time in Sequences.",
  label: "Turn on",
  // New sequence on the day-before moment, its line written in (sequence-address.ts newSequenceRoute): the composer's
  // Turn on went with its moment mode (the closed-loop audit of 17 Oct 2026, G).
  to: "campaigns/sequences/new:moment:visit_tomorrow",
} as const;

/**
 * The card while a payment failed or the plan is paused: said as the plan, never as a step of setting up. Go live needs
 * Billing, so a card that failed after setting up read as a step left, and opened the first run.
 */
const CARD_BILLING = { title: "Your plan", left: "Needs you" } as const;

export const SETUP_CARD_WORDS = {
  startCta: "Continue setting up",
  startShort: "Continue",
  notAnswering: "Not answering yet",
  answering: "Answering",
  callsNotAnswered: "Calls aren't answered yet",
  next: (name: string) => `Next: ${name.toLowerCase()}`,
  keptTitle: "Kept for you",
  goingLive: "Finish going live",
  needYou: (n: number) => `${n} need${n === 1 ? "s" : ""} you`,
  doneTitle: "Already done",
  /** What is kept, in the order the steps made it. */
  kept: {
    business: (name: string, listed: boolean) => (listed ? `${name}, read from Google` : name),
    sounds: (sounds: string) => `Your receptionist: ${sounds}`,
    taught: (n: number) => `${n} ${n === 1 ? "thing" : "things"} you taught it`,
    rehearsed: "Your rehearsal, reviewed",
    keeping: (n: string) => `Keeping ${n}, when you go live`,
    moving: (n: string) => `Moving ${n} to Chanlytics, when you go live`,
    newNumber: (n: string) => `Its own number, ${n}, when you go live`,
  },
  done: {
    line: (n: string) => `Its number, ${n}`,
  },
} as const;

/** What the page knows that Setup does not: the business's name and how the receptionist sounds (the settings read). */
export interface SetupCardWho {
  business: string | null;
  /** "Tamsin · Warm · Ava" (first-run-receptionist.ts soundsWords); null until the settings read lands. */
  sounds: string | null;
}

const cardRowOf = (vm: SetupVM, id: string): SetupRowVM | null => vm.rows.find((r) => r.id === id) ?? null;

/** What the first run has kept so far, a line each (canvas T·a). */
function keptForYouOf(vm: SetupVM, who: SetupCardWho | undefined): string[] {
  const K = SETUP_CARD_WORDS.kept;
  const n = vm.want ? (formatPhoneDisplay(vm.want.number) ?? vm.want.number) : null;
  return [
    who?.business && vm.check.receptionist === "set" ? K.business(who.business, vm.check.listed) : null,
    who?.sounds && vm.receptionistMet ? K.sounds(who.sounds) : null,
    vm.rehearsal.kept ? K.taught(vm.rehearsal.kept) : null,
    vm.rehearsal.reviewed ? K.rehearsed : null,
    vm.want && n
      ? vm.want.way === "keep"
        ? K.keeping(n)
        : vm.want.way === "move"
          ? K.moving(n)
          : K.newNumber(n)
      : null,
  ].filter((x): x is string => !!x);
}

/** Go live's rows that wait on the owner once paid: the forwarding, the check of the line, WhatsApp. */
const GOING_LIVE_ROWS = ["keep", "try", "whatsapp"] as const;

/** Today's card: what is left to set up, or null when nothing is. */
export function setupCardOf(vm: SetupVM, who?: SetupCardWho): SetupCardVM | null {
  const W = SETUP_CARD_WORDS;
  // Billing's row waits on the owner only for a payment that failed or a plan paused (setup-rows.ts billingRow): its own
  // row, its own act (the card's portal, or Billing), required, so nothing to Skip or Hide.
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
      remind: null,
    };
  const fr = firstRunOf(vm);
  const paid = !billing || billing.state === "ready";
  // A step before Go live open, or Go live not paid yet: the one row back to where the owner left off (canvas T·a).
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
        to: FIRST_RUN_ROUTE,
      },
      kept: keptForYouOf(vm, who),
      rows: [],
      done: [],
      hide: null,
      skip: CARD_SKIP,
      remind: null,
    };
  }
  // Paid, and Go live still waits on the owner: its rows that are theirs to do first, then what is done (canvas T·c).
  if (!fr.complete) {
    const rows = GOING_LIVE_ROWS.flatMap((id): SetupCardRowVM[] => {
      const r = cardRowOf(vm, id);
      return r && r.state !== "ready" && r.state !== "waiting_them" && r.verb ? [{ ...r, said: null }] : [];
    });
    const line = vm.tryIt?.voiceLabel ?? null;
    return {
      title: W.goingLive,
      left: rows.length ? W.needYou(rows.length) : W.next(GO_LIVE.name),
      // Nothing of the owner's left on Go live (the number still on its way): the one row back to it.
      start: rows.length
        ? null
        : {
            name: W.callsNotAnswered,
            sentence: GO_LIVE.lead,
            status: W.next(GO_LIVE.name),
            cta: W.startCta,
            ctaShort: W.startShort,
            to: firstRunStepRoute("live"),
          },
      kept: [],
      rows,
      done: line ? [W.done.line(line)] : [],
      hide: null,
      skip: null,
      remind: null,
    };
  }
  // What waits on the owner: a row waiting on someone else (Meta's approval, Google's read, a booking tool's first
  // email) is not theirs to do, and on a phone, where a row's sentence is not drawn, nothing said it waited.
  const rows = SETUP_CARD_ORDER.flatMap((id): SetupCardRowVM[] => {
    const r = cardRowOf(vm, id);
    return r && r.state !== "ready" && r.state !== "waiting_them" && !r.later && r.verb
      ? [{ ...r, said: skipSaid(id, r) }]
      : [];
  });
  if (!rows.length) return null;
  const calendar = cardRowOf(vm, "calendar");
  // Only where Campaigns can make the reminder: a calendar link connected (SetupVM.calendarLinked, the moments'
  // calendarOn), and the row ready. The row's Ready alone also says "booked by hand" and bookings by email alone, where
  // the moment is not offered and core refuses it. Not once one runs: the routes refuse a second.
  const remindGood = putOffEnds(vm.remindBack) === "good";
  const remind =
    vm.calendarLinked && calendar?.state === "ready" && !vm.remindSkipped && !vm.dayBeforeOn
      ? {
          id: CARD_REMIND.id,
          name: CARD_REMIND.name,
          stateWords: CARD_REMIND.stateWords,
          words: CARD_REMIND.words,
          label: CARD_REMIND.label,
          to: CARD_REMIND.to,
          said: remindGood ? `${CARD_PUT_OFF.good} ${CARD_REMIND.home}` : CARD_PUT_OFF.week,
          back: vm.remindBack,
        }
      : null;
  // The reminder is a row of the card as drawn, so it is counted and hidden with Setup's; it is kept in Sequences.
  const drawn = [
    ...rows.map((r) => ({ id: r.id, good: putOffEnds(r.back) === "good", said: r.said ?? "" })),
    ...(remind ? [{ id: remind.id, good: remindGood, said: remind.said }] : []),
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
    remind,
  };
}
