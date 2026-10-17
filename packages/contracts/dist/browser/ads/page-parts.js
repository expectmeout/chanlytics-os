import { appointmentWords } from "../journey/appointment-word.js";
import { joinWords } from "../shared/words.js";
import { addDays, daysBetween } from "./ads.js";
import { ADS_DEFAULT_CURRENCY, moneyOf, perDayOf, sumMoney, sumsOf } from "./money.js";
import {
  ADS_ASK_MIN,
  ADS_ASK_MIN_CALLS,
  ADS_ASK_SOON_DAYS,
  ADS_CHANCE_Z,
  ADS_EXTEND_MAX_DAYS,
  ADS_MOVE_DAYS,
  ADS_MOVE_STEP_MINOR,
  BUDGET_RULES
} from "./rules.js";
import {
  PLATFORMS,
  adAccountOf,
  adPersonWho,
  costEach,
  countCtx,
  counted,
  dayOfIso,
  doorNeeds,
  endsWhenOf,
  firstMissing,
  firstReadyDoor,
  leftOfAd,
  needsSecond,
  platformsFor,
  smallestPreset,
  started,
  sum,
  totalOf,
  totalsOf,
  viewState
} from "./vm-base.js";
import {
  ADS_DOORS,
  DOOR,
  PLATFORM_OWNER,
  PLATFORM_WORD,
  SETTINGS_DOOR,
  STATE,
  checkFix,
  dayLines,
  dayShort,
  dayWord,
  daysWord
} from "./words.js";
import { ASK, CHOOSE, FIGURES, LEDGER, NO_ADS, PHONE, STANDING, TILES, V0, askWhy } from "./words-page.js";
export const platformsRead = (read, how) => PLATFORMS.filter((p) => {
  const acct = adAccountOf(read, p);
  return acct !== void 0 && acct.status === "connected" && acct.read === how;
});
export const ownersOf = (platforms) => joinWords(platforms.map((p) => PLATFORM_OWNER[p]));
function perHead(items, n, enough) {
  const sums = sumsOf(items);
  const one = sums.length === 1 ? sums[0] : void 0;
  if (!one || n <= 0 || !enough(n)) return null;
  return { minor: one.minor / n, currency: one.currency };
}
export function pageTotals(read) {
  const rows = read.ads.map((ad) => ({ ad, t: totalsOf(ad, read) }));
  const mine = rows.filter((r) => counted(r.ad));
  const byDoor = (door) => sum(mine.filter((r) => r.ad.door === door).map((r) => r.t.inTouch));
  const booked = sum(mine.map((r) => r.t.booked));
  const eachSpend = mine.map((r) => ({ minor: r.t.spentMinor, currency: r.ad.currency }));
  const cost = costEach(sum(eachSpend.map((i) => i.minor)), booked);
  return {
    spent: rows.map((r) => ({ minor: r.t.spentMinor, currency: r.ad.currency })),
    spentAds: rows.filter((r) => r.t.spentMinor > 0).length,
    touch: sum(mine.map((r) => r.t.inTouch)),
    wrote: byDoor("whatsapp"),
    left: byDoor("form"),
    booked,
    eachSpend,
    each: cost === null ? null : perHead(eachSpend, booked, () => true)
  };
}
export const eachInTouch = (p) => perHead(p.eachSpend, p.touch, () => true);
function waitingRows(read) {
  const byId = new Map(read.ads.map((ad) => [ad.id, ad]));
  return read.people.filter((p) => (p.talk === "waiting" || p.talk === "call") && byId.has(p.adId)).sort((a, b) => a.day.localeCompare(b.day)).map((p) => {
    const ad = byId.get(p.adId);
    const day = dayWord(p.day);
    const what = p.how === "wrote" ? TILES.waiting.wrote(day) : TILES.waiting.number(day);
    return {
      personId: p.personId,
      threadId: p.threadId,
      adId: p.adId,
      ...adPersonWho(p.name),
      line: TILES.waiting.line({
        ad: ad ? ad.name : "",
        what,
        note: p.talk === "call" ? TILES.waiting.callNote : null
      }),
      since: daysWord(daysBetween(p.day, read.today)),
      open: p.threadId ? `inbox/${p.threadId}` : `clients/${p.personId}`,
      tip: p.threadId ? TILES.waiting.toThread : TILES.waiting.toPerson
    };
  });
}
function startingRow(ad, read) {
  const sentToday = ad.sentAt !== null && dayOfIso(ad.sentAt, read.timezone) === read.today;
  const why = ad.state === "setting-up" ? STATE.settingUpSecond(ad.platform) : ad.state === "couldnt-finish" ? STATE.couldntSecond(ad.platform) : ad.state === "needs-you" ? needsSecond(ad) : STATE.reviewSecond(ad.platform);
  return { adId: ad.id, when: sentToday ? [TILES.coming.today] : dayLines(ad.startDay), name: ad.name, said: "", why };
}
function leftWhy(ad, read, waits) {
  const left = leftOfAd(ad, totalsOf(ad, read));
  const total = totalOf(ad);
  if (left === null || total === null) return STATE.daily(perDayOf(ad.aboutADayMinor, ad.currency));
  if (waits) return TILES.coming.reading(PLATFORM_OWNER[ad.platform]);
  return `${moneyOf(left, ad.currency)} left of ${moneyOf(total, ad.currency)}`;
}
function endingRow(ad, read, waits) {
  const evening = ad.endsAt !== null && daysBetween(read.today, ad.endDay) <= 1;
  const why = leftWhy(ad, read, waits);
  return {
    adId: ad.id,
    when: dayLines(ad.endDay),
    name: ad.name,
    said: evening ? TILES.coming.endsEvening : TILES.coming.ends,
    why
  };
}
function comingOf(read, reading) {
  const waits = (ad) => reading.includes(ad.platform);
  const live = read.ads.filter((ad) => ad.state !== "ended" && ad.state !== "finished");
  const rows = live.map((ad, i) => ({ ad, i, key: started(ad) ? ad.endDay : ad.startDay })).sort((a, b) => a.key.localeCompare(b.key) || a.i - b.i).map(({ ad }) => started(ad) ? endingRow(ad, read, waits(ad)) : startingRow(ad, read));
  const capped = live.filter((ad) => totalOf(ad) !== null);
  const left = capped.map((ad) => ({
    minor: leftOfAd(ad, totalsOf(ad, read)) ?? 0,
    currency: ad.currency
  }));
  const daily = live.filter((ad) => totalOf(ad) === null).map((ad) => ({ minor: ad.aboutADayMinor, currency: ad.currency }));
  return {
    title: TILES.coming.title,
    rows,
    total: capped.some(waits) ? TILES.coming.totalReading : TILES.coming.total({ sum: sumMoney(left), ads: capped.length }),
    plus: daily.length > 0 ? TILES.coming.plus(`${sumMoney(daily)} a day`) : null
  };
}
function cameBackOf(read) {
  const c = read.cameBack;
  const w = appointmentWords(read.appointmentWord);
  const marked = TILES.cameBack.marked;
  const head = { title: TILES.cameBack.title, window: TILES.cameBack.window };
  if (!read.calendar.linked) {
    return {
      ...head,
      linked: false,
      headline: { label: TILES.cameBack.headline, n: 0 },
      rows: [],
      nudge: FIGURES.needsLink,
      unmatched: null,
      line: null
    };
  }
  return {
    ...head,
    linked: true,
    headline: { label: TILES.cameBack.headline, n: c.ahead + c.kept + c.missed + c.past },
    rows: [
      { id: "ahead", label: TILES.cameBack.ahead, n: c.ahead, note: null },
      { id: "kept", label: TILES.cameBack.kept, n: c.kept, note: marked },
      { id: "missed", label: TILES.cameBack.missed, n: c.missed, note: marked },
      { id: "past", label: TILES.cameBack.past, n: c.past, note: null }
    ],
    nudge: TILES.cameBack.nudge(w.one),
    unmatched: c.unmatched > 0 ? TILES.cameBack.unmatched(c.unmatched, w.many) : null,
    line: TILES.cameBack.line(c)
  };
}
export function tilesOf(read, reading = []) {
  return {
    waiting: { title: TILES.waiting.title, rows: waitingRows(read), empty: TILES.waiting.empty },
    coming: comingOf(read, reading),
    cameBack: cameBackOf(read)
  };
}
export function phoneOf(p, read, waiting, reading = []) {
  const spent = sumMoney(p.spent);
  const each = p.each === null ? null : moneyOf(p.each.minor, p.each.currency);
  const line1 = reading.length > 0 ? PHONE.line1Reading(p.touch, ownersOf(reading)) : read.calendar.linked ? PHONE.line1(spent, each) : PHONE.line1NoCalendar(p.touch, spent);
  const first = waiting.at(0);
  return {
    line1,
    needs: first ? LEDGER.waiting(waiting.length) : null,
    names: first ? PHONE.names(waiting.map((w) => w.name)) : null,
    since: first ? first.since : null,
    footnote: PHONE.footnote
  };
}
export function v0Of(read) {
  const rows = read.firstTouch ? read.firstTouch.rows : [];
  const unrecorded = rows.at(-1);
  const recorded = sum(rows.slice(0, -1).map((r) => r.n));
  const own = sum(rows.filter((r) => r.own).map((r) => r.n));
  const nobody = own === 0;
  return {
    lead: nobody ? null : V0.lead(own, recorded),
    muted: unrecorded && unrecorded.n > 0 && !nobody ? V0.more(unrecorded.n) : null,
    empty: nobody ? { lead: V0.emptyLead, line: V0.emptyLine } : null,
    rows: nobody ? [] : rows,
    notes: V0.notes,
    door: { words: V0.door, to: ADS_DOORS.people },
    platforms: PLATFORMS.map((id) => ({
      id,
      name: PLATFORM_WORD[id],
      line: V0.platforms[id],
      word: STANDING.off
    })),
    next: V0.next
  };
}
function blockedOf(read, door, platform) {
  const acct = adAccountOf(read, platform);
  const owner = PLATFORM_OWNER[platform];
  const mend = { words: SETTINGS_DOOR, to: ADS_DOORS.accounts };
  if (acct?.status === "choose") return null;
  if (!acct || acct.status === "not-connected") return { text: NO_ADS.connect(owner), door: mend };
  if (acct.status === "lapsed") return { text: NO_ADS.lapsed(owner), door: mend };
  const missing = firstMissing(acct, door, platform);
  return missing === null ? null : { text: NO_ADS.needs(checkFix(missing, platform)), door: mend };
}
function chooseOf(read) {
  return read.accounts.filter((a) => a.status === "choose").map((a) => ({
    platform: a.platform,
    title: CHOOSE.title(PLATFORM_OWNER[a.platform]),
    line: CHOOSE.line,
    use: CHOOSE.use,
    choices: a.choices.map((c) => ({
      externalId: c.externalId,
      label: CHOOSE.choice(c.name, c.currency),
      name: c.name
    }))
  }));
}
export function noAdsOf(read, config) {
  const door = firstReadyDoor(read);
  const platform = platformsFor(door).at(0) ?? "meta";
  const preset = smallestPreset(config);
  const currency = read.accounts.find((a) => a.platform === platform)?.currency ?? ADS_DEFAULT_CURRENCY;
  const line = preset ? NO_ADS.line({
    door: DOOR[door].label,
    perDay: perDayOf(preset.perDayMinor, currency),
    days: preset.days,
    total: moneyOf(preset.perDayMinor * preset.days, currency)
  }) : "";
  return {
    title: NO_ADS.title,
    line,
    press: NO_ADS.press,
    checklist: doorNeeds(read, door, platform),
    blocked: blockedOf(read, door, platform),
    choose: chooseOf(read)
  };
}
const runDays = (ad) => daysBetween(ad.startDay, ad.endDay) + 1;
function broughtEnough(ad, t) {
  return counted(ad) ? t.booked >= ADS_ASK_MIN : t.inTouch >= ADS_ASK_MIN_CALLS;
}
const running = (ad, today) => {
  const state = viewState(ad, today);
  return ad.madeHere && (state === "on" || state === "too-early");
};
function extendPlan(ad, total) {
  const rule = BUDGET_RULES[ad.platform];
  let days = Math.min(ADS_EXTEND_MAX_DAYS, runDays(ad));
  if (rule.totalMaxDays !== null) days = Math.min(days, rule.totalMaxDays - runDays(ad));
  if (rule.maxStep !== null && ad.aboutADayMinor > 0) {
    days = Math.min(days, Math.floor(total * rule.maxStep / ad.aboutADayMinor));
  }
  return days >= 1 ? { days, more: ad.aboutADayMinor * days } : null;
}
function extendAsk(ad, t, read) {
  const total = totalOf(ad);
  if (total === null) return null;
  const soon = daysBetween(read.today, ad.endDay);
  const plan = extendPlan(ad, total);
  if (soon < 0 || soon > ADS_ASK_SOON_DAYS || !broughtEnough(ad, t) || plan === null) return null;
  const end = addDays(ad.endDay, plan.days);
  const more = plan.more;
  const to = total + more;
  const owner = PLATFORM_OWNER[ad.platform];
  const when = endsWhenOf(ad, read.today);
  const brought = counted(ad) ? ASK.broughtPeople(t.booked) : ASK.broughtCalls(t.inTouch);
  const say = (minor) => moneyOf(minor, ad.currency);
  return {
    kind: "extend",
    adId: ad.id,
    text: ASK.extend({ name: ad.name, when, brought, end: dayWord(end), owner, from: say(total), to: say(to) }),
    short: ASK.extendShort(ad.name, when),
    press: ASK.extendPress(say(more)),
    dismiss: ASK.not,
    confirm: ASK.extendConfirm({
      name: ad.name,
      end: dayWord(end),
      perDay: perDayOf(ad.aboutADayMinor, ad.currency),
      owner,
      from: say(total),
      to: say(to),
      more: say(to - t.lifetimeMinor)
    }),
    toast: ASK.extendToast(ad.name, dayWord(end)),
    apply: { kind: "extend", adId: ad.id, endDay: end, totalMinor: to }
  };
}
function fixAsk(ad) {
  const why = askWhy(ad.needs ? ad.needs.code : null, PLATFORM_OWNER[ad.platform]);
  return {
    kind: "fix",
    adId: ad.id,
    text: ASK.fix(ad.name, why),
    short: ASK.fixShort(ad.name, why),
    press: ASK.open,
    dismiss: ASK.not,
    confirm: null,
    toast: "",
    apply: null
  };
}
function stepAllowed(ad) {
  const { maxStep } = BUDGET_RULES[ad.platform];
  return maxStep === null || ADS_MOVE_STEP_MINOR <= ad.aboutADayMinor * maxStep;
}
function moveAsk(read) {
  const pool = read.ads.filter((ad) => counted(ad) && running(ad, read.today) && runDays(ad) >= ADS_MOVE_DAYS).map((ad) => ({ ad, t: totalsOf(ad, read) })).filter((r) => r.t.booked >= ADS_ASK_MIN).map((r) => ({ ...r, cost: r.t.spentMinor / r.t.booked })).sort((a, b) => a.cost - b.cost);
  const cheap = pool.at(0);
  const dear = pool.at(-1);
  if (!cheap || !dear || cheap.ad.id === dear.ad.id || cheap.ad.currency !== dear.ad.currency) return null;
  const gap = Math.log(dear.cost / cheap.cost);
  if (gap <= ADS_CHANCE_Z * Math.sqrt(1 / cheap.t.booked + 1 / dear.t.booked)) return null;
  if (!stepAllowed(cheap.ad) || !stepAllowed(dear.ad) || dear.ad.aboutADayMinor <= ADS_MOVE_STEP_MINOR) return null;
  const currency = cheap.ad.currency;
  const say = (minor) => moneyOf(minor, currency);
  const amount = say(ADS_MOVE_STEP_MINOR);
  const end = dayShort(cheap.ad.endDay);
  return {
    kind: "move",
    adId: cheap.ad.id,
    text: ASK.move({
      cheap: cheap.ad.name,
      cheapEach: say(cheap.cost),
      cheapN: cheap.t.booked,
      dear: dear.ad.name,
      dearEach: say(dear.cost),
      dearN: dear.t.booked,
      amount,
      end,
      all: say(cheap.ad.aboutADayMinor + dear.ad.aboutADayMinor)
    }),
    short: ASK.moveShort(cheap.ad.name, countCtx(read).one),
    press: ASK.movePress(amount),
    dismiss: ASK.not,
    confirm: ASK.moveConfirm({ amount, dear: dear.ad.name, cheap: cheap.ad.name, end }),
    toast: ASK.moveToast(cheap.ad.name, amount),
    apply: {
      kind: "move",
      fromId: dear.ad.id,
      toId: cheap.ad.id,
      perDayMinor: ADS_MOVE_STEP_MINOR,
      untilDay: cheap.ad.endDay
    }
  };
}
export function pageAsk(read, reading) {
  const blocked = read.ads.find((ad) => ad.state === "needs-you");
  if (blocked) return fixAsk(blocked);
  if (reading) return null;
  const soon = read.ads.filter((ad) => running(ad, read.today)).map((ad) => extendAsk(ad, totalsOf(ad, read), read)).filter((a) => a !== null);
  return soon.at(0) ?? moveAsk(read);
}
