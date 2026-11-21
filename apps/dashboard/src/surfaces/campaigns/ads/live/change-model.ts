/**
 * An ad made here, changed from its drawer, as a model (the Ads plan's 4.5 and 5.2; decision 0050, call 3): the
 * sentence whose total, last day and miles are tapped to change them, the box each opens with its hint and its press,
 * and what a press came to. Pure: the page's read and the moment are handed in.
 *
 * The press is drawn by the same rule the route and the edge judge it by (contracts adChangeIssue), against what Meta
 * holds as the page read it, so nothing is pressed that would come back refused: a raise names its most, a total under
 * Meta's least or past the owner's most has no press and says why, and the press carries what Meta held, so a total or
 * a last day the owner changed in Meta since is never put back.
 */
import { adChangeIssue, adChangeLeast, adChangeMostOf } from "@chanlytics/contracts";
import type { AdChangeAsk, AdChangeFacts, AdChangeIssue, AdLiveDto, AdsLiveDto } from "@chanlytics/contracts";
import { moneyOf } from "../model/money";
import { dayOfIso, timeOf } from "../model/vm-base";
import { dayWord } from "../model/words";
import { CHANGE_EDIT, CHANGE_ON_WAY, CHANGE_SENTENCE, CHANGE_TOAST } from "./change-words";

/** A word of the sentence that is changed in place. */
export type ChangeWord = "total" | "end_day" | "miles";

/** Where an ad stands for its owner to change it: running, paused, in Meta's check, or its total spent. */
const CHANGEABLE: readonly AdLiveDto["state"][] = ["on", "paused", "review", "finished"];
/** And where it may be ended for good: those, and one that needs its owner (Meta turned it down, say). */
const ENDABLE: readonly AdLiveDto["state"][] = [...CHANGEABLE, "needs-you"];

export interface ChangeSentenceVM {
  /** "People within ", then the miles; or "People in and around " or "People across " a wider place. */
  lead: string;
  area: string;
  total: string;
  end: string;
  /** Which words open a box: none while a change is on its way, nor for anyone who may not change the ad. */
  taps: Record<ChangeWord, boolean>;
  /** One quiet line under it: a change on its way, one Meta hasn't answered, or a change made in Meta. */
  note: string | null;
  facts: AdChangeFacts;
  /** What Meta holds now: a press carries it. */
  from: { total_minor: number; ends_at: string };
  /** When Meta takes the next change of the total, where its four an hour are used; null where it takes one now. */
  amountAfter: string | null;
  /** Whether End is offered. */
  ends: boolean;
}

/**
 * The facts a change is judged against, from the page's read of an ad made here: Meta's total and what it spent, the
 * run's first and last day, and the miles approved. The server reads the same from the ad's row (contracts
 * adChangeFactsOf); both hand them to the one rule.
 */
function liveChangeFactsOf(ad: AdLiveDto, dto: AdsLiveDto): AdChangeFacts | null {
  const { made_here: here, budget, ends_at: endsAt } = ad;
  const { min_daily_minor: minDaily, currency, timezone } = dto.account;
  if (!here || budget?.kind !== "total" || endsAt === null || minDaily === null || currency === null) return null;
  return {
    currency,
    minDailyMinor: minDaily,
    ownerMostMinor: dto.account.most_minor,
    totalMinor: budget.minor,
    spentMinor: Math.max(0, budget.minor - (budget.left_minor ?? budget.minor)),
    startDay: here.start_day,
    endDay: dayOfIso(endsAt, timezone ?? "UTC"),
    today: dto.today,
    miles: here.miles,
  };
}

const milesWords = (miles: number): string => CHANGE_SENTENCE.miles(miles);

/** What a change on its way is said as, under the sentence. */
function onWayOf(ad: AdLiveDto, currency: string): string | null {
  const change = ad.made_here?.change ?? null;
  if (change === null) return ad.made_here?.changed_in_meta ? CHANGE_ON_WAY.inMeta : null;
  if (change.unsure) return CHANGE_ON_WAY.unsure;
  if (change.what === "total") return CHANGE_ON_WAY.total(moneyOf(change.total_minor, currency));
  if (change.what === "end_day") return CHANGE_ON_WAY.end_day(dayWord(change.end_day));
  if (change.what === "miles") return CHANGE_ON_WAY.miles(milesWords(change.miles));
  return CHANGE_ON_WAY.end;
}

/** An ad made here's sentence, where its owner may change it; null for any other ad, or one Meta has not read whole. */
export function changeSentenceOf(ad: AdLiveDto, dto: AdsLiveDto, nowMs: number): ChangeSentenceVM | null {
  const facts = liveChangeFactsOf(ad, dto);
  const here = ad.made_here;
  if (facts === null || !here || ad.ends_at === null || dto.account.status !== "connected") return null;
  if (!CHANGEABLE.includes(ad.state)) return null;
  const waiting = here.change !== null || ad.pending !== null;
  const may = dto.can_press && !waiting;
  const place = here.place;
  const amountAfter = here.amount_after !== null && Date.parse(here.amount_after) > nowMs ? here.amount_after : null;
  return {
    lead:
      place === null
        ? CHANGE_SENTENCE.within
        : place.kind === "city"
          ? CHANGE_SENTENCE.inAround
          : CHANGE_SENTENCE.across,
    area: place?.name ?? milesWords(facts.miles ?? 0),
    total: moneyOf(facts.totalMinor, facts.currency),
    end: dayWord(facts.endDay),
    taps: { total: may, end_day: may, miles: may && facts.miles !== null },
    note: onWayOf(ad, facts.currency),
    facts,
    from: { total_minor: facts.totalMinor, ends_at: ad.ends_at },
    amountAfter,
    ends: dto.can_press && here.change?.what !== "end" && ENDABLE.includes(ad.state),
  };
}

/** Whether End is offered on an ad that has no sentence (one Meta turned down, say): its owner may end it here. */
export const endsAlone = (ad: AdLiveDto, dto: AdsLiveDto): boolean =>
  Boolean(ad.made_here) &&
  dto.can_press &&
  dto.account.status === "connected" &&
  ad.made_here?.change?.what !== "end" &&
  ad.state === "needs-you";

/** What the owner typed into a box: the total in minor units, the last day, the miles. */
export interface ChangeTyped {
  total_minor: number;
  end_day: string;
  miles: number;
}

/** What a box says and offers: the hint under it, and the press, or none where nothing can be sent as typed. */
interface ChangeEditVM {
  hint: string;
  tone: "calm" | "warn";
  press: { words: string; ask: AdChangeAsk; most: number | null } | null;
}

/** An issue the rule found, said as what to type (docs/words.md: a field says what to do, not what is wrong). */
function issueHint(issue: Exclude<AdChangeIssue, { code: "same" } | { code: "wide" }>, currency: string): string {
  const money = (minor: number) => moneyOf(minor, currency);
  if (issue.code === "too_soon") return CHANGE_EDIT.issue.too_soon(dayWord(issue.nearest_day));
  if (issue.code === "too_long")
    return CHANGE_EDIT.issue.too_long({ day: dayWord(issue.nearest_day), least: money(issue.least_minor) });
  if (issue.code === "miles") return CHANGE_EDIT.issue.miles(milesWords(issue.nearest_miles));
  return CHANGE_EDIT.issue[issue.code](money(issue.nearest_minor));
}

/** The hint under the total's box where nothing is wrong: Meta's least for the run, and the owner's most. */
function totalHint(facts: AdChangeFacts): string {
  const least = moneyOf(adChangeLeast(facts).minor, facts.currency);
  return facts.ownerMostMinor === null
    ? CHANGE_EDIT.hint.total(least)
    : CHANGE_EDIT.hint.totalMost(least, moneyOf(facts.ownerMostMinor, facts.currency));
}

/** The press a change has, in words that say what it does: a raise names its most. */
function pressWords(ask: AdChangeAsk, facts: AdChangeFacts): string {
  if (ask.what === "total")
    return ask.total_minor > facts.totalMinor
      ? CHANGE_EDIT.raise(moneyOf(ask.total_minor, facts.currency))
      : CHANGE_EDIT.lower(moneyOf(ask.total_minor, facts.currency));
  if (ask.what === "end_day")
    return ask.end_day > facts.endDay
      ? CHANGE_EDIT.runUntil(dayWord(ask.end_day))
      : CHANGE_EDIT.endOn(dayWord(ask.end_day));
  return ask.what === "miles" ? CHANGE_EDIT.within(milesWords(ask.miles)) : "";
}

const defaultHint = (word: ChangeWord, facts: AdChangeFacts): string =>
  word === "total" ? totalHint(facts) : word === "end_day" ? CHANGE_EDIT.hint.end_day : CHANGE_EDIT.hint.miles;

/** A box, as the owner has typed into it: its hint, and its press where what was typed can be sent. */
export function changeEditOf(
  vm: ChangeSentenceVM,
  word: ChangeWord,
  typed: ChangeTyped,
  at: { timezone: string },
): ChangeEditVM {
  const { facts } = vm;
  if (word === "total" && vm.amountAfter !== null)
    return { hint: CHANGE_EDIT.hint.amountAfter(timeOf(vm.amountAfter, at.timezone)), tone: "warn", press: null };
  const ask: AdChangeAsk =
    word === "total"
      ? { what: "total", total_minor: typed.total_minor }
      : word === "end_day"
        ? { what: "end_day", end_day: typed.end_day }
        : { what: "miles", miles: typed.miles };
  const issue = adChangeIssue(ask, facts);
  if (issue?.code === "same" || issue?.code === "wide")
    return { hint: defaultHint(word, facts), tone: "calm", press: null };
  if (issue !== null) return { hint: issueHint(issue, facts.currency), tone: "warn", press: null };
  const most = adChangeMostOf(ask, facts);
  return {
    hint: most === null ? defaultHint(word, facts) : CHANGE_EDIT.hint.raise,
    tone: "calm",
    press: { words: pressWords(ask, facts), ask, most },
  };
}

/** What the boxes start from: what Meta holds now. */
export const typedOf = (vm: ChangeSentenceVM): ChangeTyped => ({
  total_minor: vm.facts.totalMinor,
  end_day: vm.facts.endDay,
  miles: vm.facts.miles ?? 0,
});

/** What a change press says it came to, and whether it can be taken back from its toast. */
export function changeToastOf(
  ask: AdChangeAsk,
  outcome: string,
  ad: { name: string; currency: string },
): { msg: string; tone?: "warn"; undoable: boolean } {
  if (outcome === "sent") return { msg: CHANGE_TOAST.unsure, tone: "warn", undoable: false };
  if (outcome === "same") return { msg: CHANGE_TOAST.same, undoable: false };
  if (outcome === "took_back") return { msg: CHANGE_TOAST.tookBack, undoable: false };
  if (ask.what === "end")
    return { msg: outcome === "soon" ? CHANGE_TOAST.soon.end : CHANGE_TOAST.ended(ad.name), undoable: false };
  const soon = outcome === "soon";
  const words = soon ? CHANGE_TOAST.soon : CHANGE_TOAST;
  const msg =
    ask.what === "total"
      ? words.total(moneyOf(ask.total_minor, ad.currency))
      : ask.what === "end_day"
        ? words.end_day(dayWord(ask.end_day))
        : words.miles(milesWords(ask.miles));
  return { msg, undoable: true };
}
