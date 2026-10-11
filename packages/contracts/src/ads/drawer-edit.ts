/**
 * What the tapped words' lists are made of, and what Edit's foot says of its changes (page-only): the areas and the ZIP codes,
 * the amounts with what each does to a day and which the platform will not take, the end dates with the same, and the one
 * press that raises what can be spent, which names its most. Apart from drawer-parts.ts only for the file limit; drawer.ts
 * hands every name a page needs on. Pure, like the rest of the models: the rules are rules.ts's, the words words-drawer.ts's.
 */
import type { AdArea, AdPatch, AdRead, AdsConfig, AdsRead } from "./ads";
import { MINOR_PER_UNIT, aboutADayAfter, addDays, patchRestarts } from "./ads";
import { moneyOf, perDayOf } from "./money";
import { ADS_DAILY_CHOICES_MINOR, ADS_END_SHIFTS, ADS_TOTAL_STEPS, ADS_ZIP_DIGITS, BUDGET_RULES } from "./rules";
import type { Totals } from "./vm-base";
import { areaWord } from "./vm-base";
import { PLATFORM_OWNER, REVIEW_WITHIN, dayWord } from "./words";
import { CHIPS, DRAWER, EDIT, LIST, ZIPS } from "./words-drawer";

// ---------------------------------------------------------------------------------------------------------------------
// The area as a word a tapped chip hands back, and a ZIP code typed to add

const ZIPS_PREFIX = "zips:";

/** The word a tapped area hands back: the miles of a circle (`5`), or the ZIP codes (`zips:10001,10003`). */
export const areaValueOf = (area: AdArea): string =>
  area.kind === "radius" ? String(area.miles) : `${ZIPS_PREFIX}${area.zips.join(",")}`;

/** The area a word names (areaValueOf's other way). */
export function areaOfValue(value: string): AdArea {
  if (value.startsWith(ZIPS_PREFIX)) {
    return { kind: "zips", zips: value.slice(ZIPS_PREFIX.length).split(",").filter(Boolean) };
  }
  return { kind: "radius", miles: Number(value) };
}

/** What is wrong with a ZIP code typed to add, in words; null where it can be added. */
export function zipIssue(text: string, have: readonly string[]): string | null {
  const zip = text.trim();
  if (!new RegExp(`^\\d{${ADS_ZIP_DIGITS}}$`).test(zip)) return ZIPS.bad(ADS_ZIP_DIGITS);
  return have.includes(zip) ? ZIPS.already(zip) : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// The lists

export interface AreaOption {
  miles: number;
  label: string;
  /** `About 30,000 to 55,000 people · Meta's estimate`, where Meta returned one. */
  people: string | null;
}

/** One amount in the list: what it says, what it does to a day, and why the platform will not take it, if it will not. */
export interface AmountOption {
  minor: number;
  label: string;
  /** What this choice changes (a day's spend, the most that can be spent); the reason, when it is refused. */
  sub: string | null;
  current: boolean;
  /** Above the amount now: the one kind of press that names its most. */
  raise: boolean;
  /** The platform's rule that stops it, in its words; null where it is allowed. */
  refused: string | null;
}

/** One end date in the list, with what it does to a day over the days left. */
export interface EndOption {
  day: string;
  label: string;
  sub: string;
  current: boolean;
}

/** What a typed amount may be (the box of "Your own amount"), in minor units. */
export interface OwnAmount {
  minMinor: number;
  /** Null where the platform bounds it by nothing but the account. */
  maxMinor: number | null;
  /** Why no amount can be typed now (TikTok's wait), else null. */
  refused: string | null;
  /** The line under the box, where the platform bounds the amount. */
  hint: string | null;
}

/** What the tapped words' lists are made of. Amounts are minor units of `currency`. */
export interface EditVM {
  areas: AreaOption[];
  /** The ZIP codes of the area now, where it is a list of them (TikTok); null for a circle. */
  zips: string[] | null;
  /** The amount is a daily one (about $15 a day), not a total. */
  daily: boolean;
  /** Totals (or daily amounts) to choose from, ascending; those above the current one are raises. */
  amounts: AmountOption[];
  currentMinor: number;
  /** The platform's floor a day, read from the ad account; null where it states none. */
  floorMinor: number | null;
  spentMinor: number;
  currency: string;
  own: OwnAmount;
  minEnd: string;
  endDay: string;
  /** The end dates offered, none for a daily amount (it has no end). */
  ends: EndOption[];
  /** Google: the last day a total can run to (90 days from the start); null where there is none. */
  lastEnd: string | null;
  /** What each choice changes, one note a line. */
  notes: Record<"offer" | "area" | "amount" | "end", string[]>;
}

/** Amounts are offered in tens of units. */
const ROUND_TO_MINOR = 10 * MINOR_PER_UNIT;

/** The amounts a total (or a daily amount) can be changed to: ascending, nothing below what is spent or the floor. */
function amountChoices(ad: AdRead, spentMinor: number, floorMinor: number | null): number[] {
  const now = ad.budget.amountMinor;
  const round = (n: number) => Math.round(n / ROUND_TO_MINOR) * ROUND_TO_MINOR;
  const steps = ad.budget.mode === "total" ? ADS_TOTAL_STEPS.map((k) => round(now * k)) : ADS_DAILY_CHOICES_MINOR;
  const min = ad.budget.mode === "total" ? spentMinor : (floorMinor ?? 0);
  return [...new Set([...steps, now])].filter((n) => n >= min).sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------------------------------------------------
// What the platform will take: TikTok's step and its wait

/** What the platform takes of a change to the amount the ad was saved with: how far in one step, and not before which day. */
interface Limits {
  savedMinor: number;
  /** The least and most an amount may become in one change (TikTok: 30% either way); null where there is no such limit. */
  step: { lo: number; hi: number; share: number } | null;
  /** The day an amount may be changed again, where that is still ahead of today (TikTok: 2 days after the last change). */
  again: string | null;
}

function limitsOf(saved: AdRead, today: string): Limits {
  const rule = BUDGET_RULES[saved.platform];
  const now = saved.budget.amountMinor;
  const pct = rule.maxStep === null ? 0 : Math.round(rule.maxStep * 100);
  const last = saved.budgetChangedDay ?? null;
  const next = rule.waitDays > 0 && last !== null ? addDays(last, rule.waitDays) : null;
  return {
    savedMinor: now,
    step:
      rule.maxStep === null
        ? null
        : { lo: Math.ceil((now * (100 - pct)) / 100), hi: Math.floor((now * (100 + pct)) / 100), share: rule.maxStep },
    again: next !== null && today < next ? next : null,
  };
}

/** Why the platform will not take an amount, in its words; null where it will. */
function refusalOf(n: number, limits: Limits): string | null {
  if (n === limits.savedMinor) return null;
  if (limits.again !== null) return CHIPS.tiktokWait(dayWord(limits.again));
  const { step } = limits;
  return step !== null && (n < step.lo || n > step.hi) ? CHIPS.tiktokStepOut(step.share) : null;
}

/** One amount: its words, what it does, and whether the platform takes it. */
function amountOption(ad: AdRead, n: number, o: { today: string; limits: Limits }): AmountOption {
  const now = ad.budget.amountMinor;
  const cur = ad.currency;
  const current = n === now;
  const raise = n > now;
  const refused = refusalOf(n, o.limits);
  if (ad.budget.mode === "total") {
    const perDay = perDayOf(aboutADayAfter({ ad, amountMinor: n, endDay: ad.endDay, today: o.today }), cur);
    const label = raise ? CHIPS.raise(moneyOf(n, cur)) : LIST.inAll(moneyOf(n, cur));
    const sub = current
      ? LIST.asItIs(perDay)
      : raise
        ? LIST.raiseSub({ more: moneyOf(n - now, cur), perDay })
        : LIST.perDayLeft(perDay);
    return { minor: n, label, sub: refused ?? sub, current, raise, refused };
  }
  // A daily amount has no most, so it says about, and where the platform spends it as an average it says so.
  const average = BUDGET_RULES[ad.platform].dailyIsAverage;
  const day = perDayOf(n, cur);
  const label = raise ? LIST.raiseDaily(day, average) : LIST.dailyRow(day, average);
  const diff = current ? null : raise ? LIST.dailyMore(perDayOf(n - now, cur)) : LIST.dailyLess(perDayOf(now - n, cur));
  return { minor: n, label, sub: refused ?? diff, current, raise, refused };
}

/** What "Your own amount" may be: nothing below what is spent or the floor, and where the platform limits a step, inside it. */
function ownOf(ad: AdRead, o: { spentMinor: number; floorMinor: number | null; limits: Limits }): OwnAmount {
  const total = ad.budget.mode === "total";
  const least = total ? Math.max(o.spentMinor, MINOR_PER_UNIT) : (o.floorMinor ?? MINOR_PER_UNIT);
  const { step, again } = o.limits;
  const refused = again === null ? null : CHIPS.tiktokWait(dayWord(again));
  if (step === null) return { minMinor: least, maxMinor: null, refused, hint: refused };
  const minMinor = Math.max(least, step.lo);
  const range = CHIPS.tiktokRange({
    lo: moneyOf(minMinor, ad.currency),
    hi: moneyOf(step.hi, ad.currency),
    maxStep: step.share,
  });
  return { minMinor, maxMinor: step.hi, refused, hint: refused ?? range };
}

// ---------------------------------------------------------------------------------------------------------------------
// The end dates

/** The days an end can be moved to (a week earlier, then later; nothing before tomorrow; Google's total stops at 90 days). */
function endOptions(ad: AdRead, today: string, lastEnd: string | null): EndOption[] {
  if (ad.budget.mode !== "total") return [];
  const tomorrow = addDays(today, 1);
  const moved = ADS_END_SHIFTS.map((n) => addDays(ad.endDay, n)).filter(
    (d) => d >= tomorrow && (lastEnd === null || d <= lastEnd),
  );
  const days = [...new Set([...moved, ad.endDay])].sort((a, b) => a.localeCompare(b));
  return days.map((day): EndOption => {
    const left = aboutADayAfter({ ad, amountMinor: ad.budget.amountMinor, endDay: day, today });
    const perDay = perDayOf(left, ad.currency);
    const sub =
      day === ad.endDay ? LIST.asItIs(perDay) : day < ad.endDay ? LIST.endsSooner(perDay) : LIST.endsLater(perDay);
    return { day, label: dayWord(day), sub, current: day === ad.endDay };
  });
}

/** What each choice changes, one line a note. */
function notesOf(
  ad: AdRead,
  o: { spentMinor: number; floorMinor: number | null; lastEnd: string | null },
): EditVM["notes"] {
  const p = ad.platform;
  const rule = BUDGET_RULES[p];
  const total = ad.budget.mode === "total";
  const amount: string[] = [];
  if (o.floorMinor !== null || p === "google") {
    amount.push(CHIPS.floor(p, o.floorMinor === null ? null : moneyOf(o.floorMinor, ad.currency), rule.totalMaxDays));
  }
  if (total) amount.push(CHIPS.belowSpent(moneyOf(o.spentMinor, ad.currency)));
  amount.push(CHIPS.stops(p), CHIPS.noRestart);
  if (!total && p === "meta" && rule.dailyIsAverage) amount.push(CHIPS.dailyOver);
  if (!total && p === "google" && rule.dailyIsAverage) amount.push(CHIPS.dailyOverGoogle);
  if (rule.maxStep !== null) amount.push(CHIPS.tiktokChange(rule.maxStep, rule.waitDays));
  const area = [p === "meta" ? CHIPS.areaSmall : p === "google" ? CHIPS.areaGoogle : CHIPS.areaTiktok, CHIPS.areaMeta];
  const evening = p === "google" && ad.endsAt ? CHIPS.endGoogle(dayWord(ad.endDay), ad.endsAt) : CHIPS.endLater;
  const end =
    o.lastEnd !== null && rule.totalMaxDays !== null
      ? [evening, CHIPS.googleLastDay({ days: rule.totalMaxDays, day: dayWord(o.lastEnd) })]
      : [evening];
  return { offer: [CHIPS.offer(p)], area, amount, end };
}

function areaOptions(ad: AdRead, config: AdsConfig): AreaOption[] {
  if (ad.platform === "tiktok") return [];
  return config.areas.map((a): AreaOption => ({
    miles: a.miles,
    label: areaWord({ kind: "radius", miles: a.miles }),
    people: a.people && ad.platform === "meta" ? CHIPS.areaPeople(a.people[0], a.people[1]) : null,
  }));
}

/**
 * The lists of an ad's tapped words. `saved` is the ad as the platform has it, where `ad` is the ad as an unsaved edit would
 * make it: what the platform takes of an amount is measured from what it holds, never from a draft.
 */
export function editOf(ad: AdRead, t: Totals, o: { read: AdsRead; config: AdsConfig; saved?: AdRead }): EditVM {
  const floorMinor = o.config.minPerDayMinor[ad.platform];
  const today = o.read.today;
  const days = BUDGET_RULES[ad.platform].totalMaxDays;
  const lastEnd = ad.budget.mode === "total" && days !== null ? addDays(ad.startDay, days) : null;
  const limits = limitsOf(o.saved ?? ad, today);
  const spentMinor = t.lifetimeMinor;
  return {
    areas: areaOptions(ad, o.config),
    zips: ad.area.kind === "zips" ? [...ad.area.zips] : null,
    daily: ad.budget.mode === "daily",
    amounts: amountChoices(ad, spentMinor, floorMinor).map((n) => amountOption(ad, n, { today, limits })),
    currentMinor: ad.budget.amountMinor,
    floorMinor,
    spentMinor,
    currency: ad.currency,
    own: ownOf(ad, { spentMinor, floorMinor, limits }),
    minEnd: today,
    endDay: ad.endDay,
    ends: endOptions(ad, today, lastEnd),
    lastEnd,
    notes: notesOf(ad, { spentMinor, floorMinor, lastEnd }),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Edit's foot: what the changes do, and the one press that names its most

/** What a draft does to what can be spent, where it raises it: by how much, to what, and whether that is a total. */
export function raiseOf(ad: AdRead, next: AdRead): { total: boolean; to: number; by: number } | null {
  const by = next.budget.amountMinor - ad.budget.amountMinor;
  return by > 0 ? { total: ad.budget.mode === "total", to: next.budget.amountMinor, by } : null;
}

/** Edit's foot: its line, and the primary's words. */
export interface EditFootVM {
  say: string;
  save: string;
}

/**
 * Edit's foot over a draft: `n` changes, whether they send the ad back for checking, and, where the draft raises the total,
 * the most that can then be spent, which the primary names too (`Save · raise to $900`). Lowering, and every other change,
 * is plain `Save changes`: a raise of spend is the only press that names its most. A raised daily amount has no most, so it
 * says about.
 */
export function editFootOf(o: { ad: AdRead; next: AdRead; patch: AdPatch; n: number }): EditFootVM {
  const { ad, next, patch, n } = o;
  if (n === 0) return { say: EDIT.noChanges, save: DRAWER.foot.save };
  const owner = PLATFORM_OWNER[ad.platform];
  const within = REVIEW_WITHIN[ad.platform];
  const changes = DRAWER.foot.changes({ n, restarts: patchRestarts(ad, patch), owner, within });
  const raise = raiseOf(ad, next);
  if (raise === null) return { say: changes, save: DRAWER.foot.save };
  const cur = ad.currency;
  if (raise.total) {
    return {
      say: `${LIST.moreSpent(moneyOf(raise.by, cur))} · ${changes}`,
      save: DRAWER.foot.saveRaise(moneyOf(raise.to, cur)),
    };
  }
  return {
    say: `${LIST.dailyMoreHead(perDayOf(raise.by, cur))} · ${changes}`,
    save: DRAWER.foot.saveRaiseDaily(perDayOf(raise.to, cur)),
  };
}
