import { MINOR_PER_UNIT, aboutADayAfter, addDays, patchRestarts } from "./ads.js";
import { moneyOf, perDayOf } from "./money.js";
import { ADS_DAILY_CHOICES_MINOR, ADS_END_SHIFTS, ADS_TOTAL_STEPS, ADS_ZIP_DIGITS, BUDGET_RULES } from "./rules.js";
import { areaWord } from "./vm-base.js";
import { PLATFORM_OWNER, REVIEW_WITHIN, dayWord } from "./words.js";
import { CHIPS, DRAWER, EDIT, LIST, ZIPS } from "./words-drawer.js";
const ZIPS_PREFIX = "zips:";
export const areaValueOf = (area) => area.kind === "radius" ? String(area.miles) : `${ZIPS_PREFIX}${area.zips.join(",")}`;
export function areaOfValue(value) {
  if (value.startsWith(ZIPS_PREFIX)) {
    return { kind: "zips", zips: value.slice(ZIPS_PREFIX.length).split(",").filter(Boolean) };
  }
  return { kind: "radius", miles: Number(value) };
}
export function zipIssue(text, have) {
  const zip = text.trim();
  if (!new RegExp(`^\\d{${ADS_ZIP_DIGITS}}$`).test(zip)) return ZIPS.bad(ADS_ZIP_DIGITS);
  return have.includes(zip) ? ZIPS.already(zip) : null;
}
const ROUND_TO_MINOR = 10 * MINOR_PER_UNIT;
function amountChoices(ad, spentMinor, floorMinor) {
  const now = ad.budget.amountMinor;
  const round = (n) => Math.round(n / ROUND_TO_MINOR) * ROUND_TO_MINOR;
  const steps = ad.budget.mode === "total" ? ADS_TOTAL_STEPS.map((k) => round(now * k)) : ADS_DAILY_CHOICES_MINOR;
  const min = ad.budget.mode === "total" ? spentMinor : floorMinor ?? 0;
  return [.../* @__PURE__ */ new Set([...steps, now])].filter((n) => n >= min).sort((a, b) => a - b);
}
function limitsOf(saved, today) {
  const rule = BUDGET_RULES[saved.platform];
  const now = saved.budget.amountMinor;
  const pct = rule.maxStep === null ? 0 : Math.round(rule.maxStep * 100);
  const last = saved.budgetChangedDay ?? null;
  const next = rule.waitDays > 0 && last !== null ? addDays(last, rule.waitDays) : null;
  return {
    savedMinor: now,
    step: rule.maxStep === null ? null : { lo: Math.ceil(now * (100 - pct) / 100), hi: Math.floor(now * (100 + pct) / 100), share: rule.maxStep },
    again: next !== null && today < next ? next : null
  };
}
function editRefusalOf(n, limits) {
  if (n === limits.savedMinor) return null;
  if (limits.again !== null) return CHIPS.tiktokWait(dayWord(limits.again));
  const { step } = limits;
  return step !== null && (n < step.lo || n > step.hi) ? CHIPS.tiktokStepOut(step.share) : null;
}
function amountOption(ad, n, o) {
  const now = ad.budget.amountMinor;
  const cur = ad.currency;
  const current = n === now;
  const raise = n > now;
  const refused = editRefusalOf(n, o.limits);
  if (ad.budget.mode === "total") {
    const perDay = perDayOf(aboutADayAfter({ ad, amountMinor: n, endDay: ad.endDay, today: o.today }), cur);
    const label2 = raise ? CHIPS.raise(moneyOf(n, cur)) : LIST.inAll(moneyOf(n, cur));
    const sub = current ? LIST.asItIs(perDay) : raise ? LIST.raiseSub({ more: moneyOf(n - now, cur), perDay }) : LIST.perDayLeft(perDay);
    return { minor: n, label: label2, sub: refused ?? sub, current, raise, refused };
  }
  const average = BUDGET_RULES[ad.platform].dailyIsAverage;
  const day = perDayOf(n, cur);
  const label = raise ? LIST.raiseDaily(day, average) : LIST.dailyRow(day, average);
  const diff = current ? null : raise ? LIST.dailyMore(perDayOf(n - now, cur)) : LIST.dailyLess(perDayOf(now - n, cur));
  return { minor: n, label, sub: refused ?? diff, current, raise, refused };
}
function ownOf(ad, o) {
  const total = ad.budget.mode === "total";
  const least = total ? Math.max(o.spentMinor, MINOR_PER_UNIT) : o.floorMinor ?? MINOR_PER_UNIT;
  const { step, again } = o.limits;
  const refused = again === null ? null : CHIPS.tiktokWait(dayWord(again));
  if (step === null) return { minMinor: least, maxMinor: null, refused, hint: refused };
  const minMinor = Math.max(least, step.lo);
  const range = CHIPS.tiktokRange({
    lo: moneyOf(minMinor, ad.currency),
    hi: moneyOf(step.hi, ad.currency),
    maxStep: step.share
  });
  return { minMinor, maxMinor: step.hi, refused, hint: refused ?? range };
}
function endOptions(ad, today, lastEnd) {
  if (ad.budget.mode !== "total") return [];
  const tomorrow = addDays(today, 1);
  const moved = ADS_END_SHIFTS.map((n) => addDays(ad.endDay, n)).filter(
    (d) => d >= tomorrow && (lastEnd === null || d <= lastEnd)
  );
  const days = [.../* @__PURE__ */ new Set([...moved, ad.endDay])].sort((a, b) => a.localeCompare(b));
  return days.map((day) => {
    const left = aboutADayAfter({ ad, amountMinor: ad.budget.amountMinor, endDay: day, today });
    const perDay = perDayOf(left, ad.currency);
    const sub = day === ad.endDay ? LIST.asItIs(perDay) : day < ad.endDay ? LIST.endsSooner(perDay) : LIST.endsLater(perDay);
    return { day, label: dayWord(day), sub, current: day === ad.endDay };
  });
}
function notesOf(ad, o) {
  const p = ad.platform;
  const rule = BUDGET_RULES[p];
  const total = ad.budget.mode === "total";
  const amount = [];
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
  const end = o.lastEnd !== null && rule.totalMaxDays !== null ? [evening, CHIPS.googleLastDay({ days: rule.totalMaxDays, day: dayWord(o.lastEnd) })] : [evening];
  return { offer: [CHIPS.offer(p)], area, amount, end };
}
function areaOptions(ad, config) {
  if (ad.platform === "tiktok") return [];
  return config.areas.map((a) => ({
    miles: a.miles,
    label: areaWord({ kind: "radius", miles: a.miles }),
    people: a.people && ad.platform === "meta" ? CHIPS.areaPeople(a.people[0], a.people[1]) : null
  }));
}
export function editOf(ad, t, o) {
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
    notes: notesOf(ad, { spentMinor, floorMinor, lastEnd })
  };
}
export function raiseOf(ad, next) {
  const by = next.budget.amountMinor - ad.budget.amountMinor;
  return by > 0 ? { total: ad.budget.mode === "total", to: next.budget.amountMinor, by } : null;
}
export function editFootOf(o) {
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
      say: `${LIST.moreSpent(moneyOf(raise.by, cur))} \xB7 ${changes}`,
      save: DRAWER.foot.saveRaise(moneyOf(raise.to, cur))
    };
  }
  return {
    say: `${LIST.dailyMoreHead(perDayOf(raise.by, cur))} \xB7 ${changes}`,
    save: DRAWER.foot.saveRaiseDaily(perDayOf(raise.to, cur))
  };
}
