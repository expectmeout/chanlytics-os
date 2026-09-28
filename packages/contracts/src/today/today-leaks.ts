/**
 * Worth a look: the few things Today holds that no row on it says on its own, each a re-print of a number
 * Reports (today-period.ts's `ReportsLike`) or People already publishes, in the order of what they cost.
 */
import { NO_NUMBER_REACH, saidYesTo, type PersonRowVM } from "../people/people";
import {
  consultationsWithoutProposal,
  consultsHeldWords,
  proposalsWaiting,
  type DealPaceVM,
  type DealVM,
} from "../deals/deals";
import { pipelineRoute } from "../deals/pipeline";
import { isOptedOutContact } from "../consent/consent";
import { capitalize } from "../shared/words";
import type { ReportsLike } from "./today-period";
import type { TodayNoReplyVM } from "./today-vm";

/* ------------------------------ worth a look ----------------------------- */

/**
 * The few things this page holds that no row on it says on its own.
 *
 * Every one of them is a RE-PRINT: the numbers are the ones Reports and
 * People already publish, said together so the shape shows. "18 wrote or
 * called" sits on Reports and "17 asked, never booked" sits on People, and
 * neither page can tell you they are the same eighteen people. Nothing here
 * is counted twice, and nothing here is a trend -- a period over a period is
 * noise at these counts (reports.ts dropped tile deltas for exactly that).
 */
export type TodayLeakId =
  "never-booked" | "unanswered" | "consults-waiting" | "proposals-waiting" | "unreachable" | "quiet";

export interface TodayLeakVM {
  id: TodayLeakId;
  /** A look, never a failure: amber where a person should look, blue for what waits on someone else. */
  tone: "warn" | "info";
  /** The tone as a word, so severity never rides on colour alone: "Booking gap", "No reply", "Reach", "Gone quiet". */
  tag: string;
  /** The tone's icon (the legacy Icon set). */
  icon: "calendar" | "alert" | "users" | "clock";
  /** The problem, in one sentence, with the number in it. */
  text: string;
  /** The arithmetic behind the sentence, so nobody has to take it on faith. */
  math: string;
  /**
   * Who the row names, up to two, each with where a press goes and the words it says on hover. The unanswered row
   * names who is waiting NOW with nothing back, the threads Today holds: not the count's own subjects (the count is
   * Reports' over its period), so its lead says "Waiting now" and never draws them as the people the sentence counts.
   * The consultations row names the count's own people, the first two the Pipeline lists, each to their page.
   */
  people: Array<{ id: string; name: string; to: string; title: string }>;
  /** The words in front of `people`, which say who they are; null on a row that names nobody. */
  peopleLead: string | null;
  /** What "Ask why" asks: the row's own sentence and its arithmetic. Ask grounds every citation in what it read. */
  ask: string;
  /** The door. */
  cta: { label: string; to: string };
  /** The act, when the list this is about has one it can actually run. */
  also: { label: string; to: string } | null;
}

/** The rows that made the cut, how many qualified past the cap, and the line that says so ("and 2 more"). */
export interface TodayLeaksVM {
  rows: TodayLeakVM[];
  more: number;
  moreLine: string | null;
}

/** A People list as the People surface publishes it. */
export interface JourneyListLike {
  id: string;
  label: string;
  group: string;
  count: number;
  action: { text: string; cta: string; to: string; enabled: boolean } | null;
}

/** What People publishes, as far as this reads it. */
export interface PeopleListsLike {
  lists: JourneyListLike[];
  aggregates?: { total: number };
  /**
   * Everyone the lists are counted from: whether anybody said yes to offers is theirs to say, a number or not; their
   * deal and when they last wrote, for the proposals waiting (0004); and who they are and when their last
   * consultation ended, for the consultations with no proposal yet (0008), where the surface carries them.
   */
  rows: ReadonlyArray<
    Pick<PersonRowVM, "consent"> &
      Partial<Pick<PersonRowVM, "id" | "name" | "deal" | "askedMs" | "consultedMs" | "followUp">>
  >;
  /** Whether deals are on here (dealsAreOn, 0008): the consultations and the proposals waiting are rows only then. */
  dealsOn?: boolean;
  /**
   * When People was read and its rows worked out: the deal rows are counted at that moment, as the Pipeline counts
   * the same rows (pipeline-scope.jsx), so the two pages never say two numbers for one list.
   */
  fetchedAt?: number;
  /** The workspace's pace (dealPaceOf), which says when a proposal out is waiting; none until five are decided. */
  dealPace?: DealPaceVM | null;
}

/** At most this many; the rest is not an insight, it is a list. */
export const TODAY_LEAK_MAX = 2;

/**
 * In this order, and the order is the point: the first four all cost a
 * customer, and the one that costs more of them comes first. A person who
 * asked and never got onto the calendar is the business's whole purpose
 * missed; a message nobody answered is one conversation; a consultation with
 * no proposal after it is a step the business has not taken (0008), and a
 * proposal waiting past a week is one the customer has not answered (0004),
 * so the business's own step comes first. Then the two that cost a chance
 * rather than a customer.
 */
const LEAK_ORDER: readonly TodayLeakId[] = [
  "never-booked",
  "unanswered",
  "consults-waiting",
  "proposals-waiting",
  "unreachable",
  "quiet",
];

// The arithmetic was written to sit under the sentence ("of 21 in the last 30 days"); as a sentence of its own it takes a capital.
const askWhy = (text: string, math: string): string => `${text} ${capitalize(math)}. Why is that?`;

export function todayLeaks(
  reports: ReportsLike | null,
  people: PeopleListsLike | null,
  /** Who is waiting with nothing back, from the day's view model (`noReply`); the unanswered row names two of them. */
  noReply: readonly TodayNoReplyVM[] = [],
  max = TODAY_LEAK_MAX,
  nowMs = Date.now(),
): TodayLeaksVM {
  const found = new Map<TodayLeakId, TodayLeakVM>();
  const list = (id: string) => (people ? (people.lists.find((l) => l.id === id) ?? null) : null);
  const step = (id: string) => {
    const l = list(id);
    return l && l.action && l.action.enabled && l.count > 0 ? { label: l.action.cta, to: l.action.to } : null;
  };

  const b = reports ? reports.booking : null;
  // Five is the floor: two people who did not book is a quiet week, not a leak.
  if (reports && b && b.present && b.pct !== null && (b.asked ?? 0) >= 5 && b.pct <= 25) {
    const asked = b.asked ?? 0;
    const booked = b.booked ?? 0;
    const never = list("asked_never_booked");
    const text =
      booked === 0
        ? `${asked} people wrote or called in the last ${reports.vm.rangeLabel}. Not one of them is on the calendar.`
        : `Only ${booked} of the ${asked} people who wrote or called in the last ${reports.vm.rangeLabel} got onto the calendar.`;
    const math = never ? `${b.headline} · ${never.count} on Asked, never booked` : b.headline;
    found.set("never-booked", {
      id: "never-booked",
      tone: "warn",
      tag: "Booking gap",
      icon: "calendar",
      text,
      math,
      people: [],
      peopleLead: null,
      ask: askWhy(text, math),
      cta: { label: "See who", to: never ? `clients/seg:${never.id}` : "clients" },
      also: step("asked_never_booked"),
    });
  }

  const a = reports && reports.vm.answered ? reports.vm.answered.totals : null;
  // Two, not one: a single message nobody answered can be a wrong number or a
  // STOP, and this rule has no act to offer, only a door to Reports where the
  // tile already prints the figure. Two is a pattern. The count is Reports'
  // over its period; the names are the threads waiting right now.
  if (reports && a && a.none >= 2) {
    const text = `${a.none} customer message${a.none === 1 ? "" : "s"} never got an answer at all.`;
    const math = `of ${a.in} in the last ${reports.vm.rangeLabel} · the receptionist answered ${a.ai}, you answered ${a.you}`;
    found.set("unanswered", {
      id: "unanswered",
      tone: "warn",
      tag: "No reply",
      icon: "alert",
      text,
      math,
      people: noReply
        .slice(0, 2)
        .map((r) => ({ id: r.conversationId, name: r.who, to: r.to, title: `Open ${r.who}'s thread` })),
      peopleLead: "Waiting now",
      ask: askWhy(text, math),
      cta: { label: "Open Reports", to: "reports" },
      also: null,
    });
  }

  // The deal rows are counted at the moment People's rows were worked out, as the Pipeline counts the same rows: one
  // clock, so the two pages say one number.
  const dealsAt = (people && people.fetchedAt) || nowMs;

  // A consultation that ended in the last week with no proposal after it is the next step nobody has taken (0008). One
  // is enough, as a proposal waiting is. The rule is contracts' consultationsWithoutProposal over the rows People
  // holds, the rows, the rule and the clock the Pipeline counts its Consultations by, so the number is the Pipeline's,
  // re-printed in its own sentence (consultsHeldWords). The names are the count's own people, the first two the rule
  // gives, as the Pipeline lists them, each to their page. Amber, as a person should look (#928). Only where deals are
  // on (0008).
  const consultRows = (people?.rows ?? []).filter(
    (r): r is typeof r & Pick<PersonRowVM, "id" | "name" | "deal" | "consultedMs"> =>
      typeof r.id === "string" && typeof r.name === "string" && "deal" in r && "consultedMs" in r,
  );
  const held = consultationsWithoutProposal(consultRows, dealsAt);
  if (people && people.dealsOn && held.length >= 1) {
    const n = held.length;
    const text = `${n} consultation${n === 1 ? "" : "s"} in the last week ended with no proposal yet.`;
    const math = `${consultsHeldWords(n)} · on Pipeline`;
    found.set("consults-waiting", {
      id: "consults-waiting",
      tone: "warn",
      tag: "Next step",
      icon: "calendar",
      text,
      math,
      people: held
        .slice(0, 2)
        .map((r) => ({ id: r.id, name: r.name, to: `clients/${r.id}`, title: `Open ${r.name} in People` })),
      peopleLead: "Held with",
      ask: askWhy(text, math),
      cta: { label: "See who", to: "clients/pipeline" },
      also: null,
    });
  }

  // A proposal out past a week with nothing back costs a customer who was one step from yes (0004). One is enough: an
  // agency sends a few a month. The rule is contracts' proposalsWaiting; the count is over the rows People holds. Only
  // where deals are on (0008): a workspace whose customers book keeps whatever deals it has out of sight.
  const dealRows = (people?.rows ?? []).filter(
    (r): r is typeof r & { deal: DealVM | null; askedMs: number | null } => "deal" in r && "askedMs" in r,
  );
  // Past the workspace's pace by a fifth once it has one (0008, amended), a week until then: the Pipeline's own rule.
  const pace = people?.dealPace ?? null;
  const out = proposalsWaiting(dealRows, dealsAt, pace);
  // Where a follow-up runs (0006), the ones it has in hand are not a leak: the row counts only the people it will not
  // reach -- no link, no yes, no number, or their one nudge already gone -- names two of them, and its door is the
  // Pipeline's own waiting view, where each row says which is which.
  const inHand = out.filter((r) => r.followUp?.kind === "will").length;
  const waiting = out.filter((r) => r.followUp?.kind !== "will");
  const po = list("proposal_out");
  if (people && people.dealsOn && waiting.length >= 1) {
    const n = waiting.length;
    // Longer than usual only where it is: the thirty-day cap can hold the wait at or under the pace itself.
    const ago = pace ? `${pace.waitDays} days` : "a week";
    const text = pace?.longerThanUsual
      ? `${n} proposal${n === 1 ? " has" : "s have"} waited longer than usual with nothing back.`
      : `${n} proposal${n === 1 ? "" : "s"} went out more than ${ago} ago with nothing back.`;
    const since = pace
      ? `${pace.words.charAt(0).toLowerCase()}${pace.words.slice(1)} · nothing heard since it went`
      : "nothing heard since it went";
    const counted = po ? `${po.count} on Proposal out · ${since}` : since;
    const math = inHand ? `${counted} · the follow-up has ${inHand} more` : counted;
    found.set("proposals-waiting", {
      id: "proposals-waiting",
      tone: "warn",
      tag: "Waiting",
      icon: "clock",
      text,
      math,
      // Never someone who asked to stop: a follow-up is not theirs to be sent, by hand or at all.
      people: inHand
        ? waiting
            .filter((r) => !isOptedOutContact({ consent: r.consent.state, dnc: r.consent.dnc }))
            .slice(0, 2)
            .flatMap((r) =>
              r.id && r.name ? [{ id: r.id, name: r.name, to: `clients/${r.id}`, title: `Open ${r.name}` }] : [],
            )
        : [],
      peopleLead: inHand ? "Yours to follow up" : null,
      ask: askWhy(text, math),
      cta: {
        label: "See who",
        to: inHand ? pipelineRoute({ view: "waiting" }) : po ? `clients/seg:${po.id}` : "clients",
      },
      also: null,
    });
  }

  // A yes to hearing from the business is not a yes to an offer, and a list
  // nobody can be mailed reads as a broken composer one screen later.
  const yes = list("opted_in");
  const offers = list("offers_ok");
  // Three, for the same reason: one person who said yes is not yet a list.
  if (people && yes && offers && yes.count >= 3 && offers.count === 0) {
    // Nobody can be sent an offer, and that has two causes (#663): nobody said yes to offers, or the ones who did --
    // anyone in the workspace, as a broadcast to everyone counts them (#811) -- have no number to send one to. Only
    // the first is a yes to go and get; the second is said with People's reason, and with no door to the QR, which
    // would ask them for an answer they gave.
    const noNumber = people.rows.some((r) => saidYesTo(r, "marketing"));
    const text = `${yes.count} ${yes.count === 1 ? "person has" : "people have"} said yes to messages, but ${noNumber ? "nobody can be sent an offer yet" : "nobody has said yes to offers"}.`;
    const math = `${noNumber ? NO_NUMBER_REACH : "a broadcast reaches only the second yes"} · 0 can receive one`;
    found.set("unreachable", {
      id: "unreachable",
      tone: "warn",
      tag: "Reach",
      icon: "users",
      text,
      math,
      people: [],
      peopleLead: null,
      ask: askWhy(text, math),
      cta: { label: "Open People", to: `clients/seg:${yes.id}` },
      also: !noNumber && yes.action && yes.action.enabled ? { label: yes.action.cta, to: yes.action.to } : null,
    });
  }

  const quiet = list("quiet");
  if (quiet && quiet.count >= 5) {
    const text = `${quiet.count} people have not heard from you in 30 days.`;
    const math = people && people.aggregates ? `of ${people.aggregates.total} in People` : "on the Quiet 30+ days list";
    found.set("quiet", {
      id: "quiet",
      tone: "info",
      tag: "Gone quiet",
      icon: "clock",
      text,
      math,
      people: [],
      peopleLead: null,
      ask: askWhy(text, math),
      cta: { label: "See who", to: `clients/seg:${quiet.id}` },
      also: step("quiet"),
    });
  }

  const all = LEAK_ORDER.map((id) => found.get(id)).filter((x): x is TodayLeakVM => !!x);
  const more = Math.max(0, all.length - max);
  // A third problem is counted, never dropped in silence; the page draws this line, it does not compose it.
  return { rows: all.slice(0, max), more, moreLine: more ? `and ${more} more` : null };
}
