import { appointmentWords } from "../../journey/appointment-word.js";
import { lensEmpty } from "../../reports/lenses.js";
import { addDays, daysBetween } from "../ads.js";
import { ADS_SCOPE_ALL, adsScopeKey } from "../address.js";
import { moneyOf, sumMoney } from "../money.js";
import { adsModel } from "../page.js";
import { pageTotals, tilesOf } from "../page-parts.js";
import { ADS_SETTLE_DAYS } from "../rules.js";
import { DASH, PLATFORMS, adAccountOf, counted, readTime, started, sum, timeOf, totalsOf } from "../vm-base.js";
import { DOOR, DOOR_ORDER, PLATFORM_OWNER, PLATFORM_WORD, dayShort, dayWord } from "../words.js";
import { NO_AD } from "../words-drawer.js";
import { FIGURES, LEDGER } from "../words-page.js";
import { RESULTS } from "./words-results.js";
function adsOf(read, scope) {
  if (scope.kind === "all") return read.ads;
  if (scope.kind === "platform") return read.ads.filter((ad) => ad.platform === scope.platform);
  const one = read.ads.find((ad) => ad.id === scope.id);
  return one ? [one] : null;
}
function scopesOf(read) {
  const choice = (scope, label) => ({
    key: adsScopeKey(scope),
    kind: scope.kind,
    scope,
    label
  });
  return [
    choice(ADS_SCOPE_ALL, RESULTS.scope.all),
    ...PLATFORMS.filter((p) => read.ads.some((ad) => ad.platform === p)).map(
      (p) => choice({ kind: "platform", platform: p }, PLATFORM_WORD[p])
    ),
    ...read.ads.map((ad) => choice({ kind: "ad", id: ad.id }, ad.name))
  ];
}
function ofWords(scope, ads) {
  if (scope.kind === "all") return RESULTS.of.all;
  return scope.kind === "platform" ? RESULTS.of.platform(PLATFORM_WORD[scope.platform]) : RESULTS.of.ad(ads[0]?.name ?? "");
}
function scopeWordOf(scope, ads) {
  if (scope.kind === "all") return RESULTS.scope.all;
  return scope.kind === "platform" ? PLATFORM_WORD[scope.platform] : ads[0]?.name ?? NO_AD.title;
}
const unitsOf = (minor) => minor / 100;
function resultDaysOf(ads, o) {
  const currencies = [...new Set(ads.map((ad) => ad.currency))];
  const one = currencies.length === 1 ? currencies[0] ?? null : null;
  const settleFrom = addDays(o.today, -ADS_SETTLE_DAYS);
  const rows = [];
  for (let day = o.from; day <= o.to; day = addDays(day, 1)) {
    const mine = ads.flatMap(
      (ad) => ad.days.filter((d) => d.day === day).map((d) => ({ ad, spendMinor: d.spendMinor, inTouch: d.inTouch, booked: d.booked }))
    );
    const people2 = mine.filter((r) => counted(r.ad));
    const inTouch = sum(people2.map((r) => r.inTouch));
    const booked = sum(people2.map((r) => r.booked));
    rows.push({
      day,
      label: dayWord(day),
      short: String(Number(day.slice(8, 10))),
      spent: one === null ? null : unitsOf(sum(mine.map((r) => r.spendMinor))),
      spentWords: sumMoney(mine.map((r) => ({ minor: r.spendMinor, currency: r.ad.currency }))),
      inTouch,
      booked,
      waiting: Math.max(0, inTouch - booked),
      calls: sum(mine.filter((r) => !counted(r.ad)).map((r) => r.inTouch)),
      settling: day >= settleFrom
    });
  }
  const calls = sum(rows.map((r) => r.calls));
  const settles = rows.some((r) => r.settling);
  const spent = sumMoney(
    ads.flatMap(
      (ad) => ad.days.filter((d) => d.day >= o.from && d.day <= o.to).map((d) => ({ minor: d.spendMinor, currency: ad.currency }))
    )
  );
  const people = sum(rows.map((r) => r.inTouch));
  return {
    rows,
    currency: one,
    spentAria: RESULTS.days.spentAria({ total: spent, days: rows.length }),
    peopleAria: RESULTS.days.peopleAria({ people, booked: sum(rows.map((r) => r.booked)), days: rows.length }),
    notes: [
      ...settles ? [RESULTS.days.settling(ADS_SETTLE_DAYS, o.a)] : [],
      ...calls > 0 ? [RESULTS.days.callsNote(calls)] : [],
      ...one === null ? [RESULTS.days.severalCurrencies] : []
    ]
  };
}
function funnelOf(o) {
  const { scoped } = o;
  const written = scoped.ads.filter((ad) => counted(ad) && ad.reply !== null);
  const replied = sum(written.map((ad) => ad.reply?.n ?? 0));
  const linked = scoped.calendar.linked;
  const step = (id, label, n, why) => ({
    id,
    label,
    n,
    display: n === null ? DASH : String(n),
    why
  });
  return [
    step("touch", RESULTS.funnel.touch, o.touch, null),
    ...written.length === 0 ? [] : [
      o.windowRead ? step("reply", RESULTS.funnel.reply, replied, RESULTS.funnel.replyOf) : step("reply", RESULTS.funnel.reply, null, RESULTS.funnel.replyWindow)
    ],
    linked ? step("booked", RESULTS.funnel.booked, o.booked, null) : step("booked", RESULTS.funnel.booked, null, FIGURES.needsLink)
  ];
}
function cameBackOf(o) {
  const { read } = o;
  const title = RESULTS.cameBack.title(appointmentWords(read.appointmentWord).many);
  if (!read.calendar.linked) return { title, why: FIGURES.needsLink };
  if (o.scope.kind !== "all") return { title, why: RESULTS.cameBack.forAll };
  return o.windowRead ? { title, tile: tilesOf(read).cameBack } : { title, why: RESULTS.cameBack.forThirty };
}
const cell = (value, unit = null, why = null) => ({ value, unit, why });
function unitOf(ads) {
  const doors = new Set(ads.map((ad) => ad.door));
  const only = doors.size === 1 ? [...doors][0] : void 0;
  return only ? DOOR[only].unit : null;
}
function resultsRowOf(subset, scoped, id, label) {
  const here = { ...scoped, ads: [...subset] };
  const p = pageTotals(here);
  const people = subset.filter(counted);
  const calls = sum(subset.filter((ad) => !counted(ad)).map((ad) => totalsOf(ad, here).inTouch));
  const base = { id, label, ads: subset.length, spent: sumMoney(p.spent) };
  if (!subset.some(started)) {
    const none = cell(DASH, null, LEDGER.notStarted);
    return { ...base, inTouch: none, booked: none, each: none };
  }
  const inTouch = people.length === 0 ? cell(String(calls), DOOR.call.unit) : cell(String(p.touch), unitOf(people));
  if (people.length === 0) {
    return {
      ...base,
      inTouch,
      booked: cell(DASH, LEDGER.notMatched, FIGURES.callsNotMatched),
      each: cell(DASH, null, FIGURES.callsNotMatched)
    };
  }
  if (!scoped.calendar.linked) {
    const why = FIGURES.needsLink;
    return { ...base, inTouch, booked: cell(DASH, null, why), each: cell(DASH, null, why) };
  }
  const each = p.each === null ? cell(DASH, p.booked === 0 ? LEDGER.noneYet : LEDGER.only(p.booked), LEDGER.tooFew) : cell(moneyOf(p.each.minor, p.each.currency));
  return { ...base, inTouch, booked: cell(String(p.booked)), each };
}
const byPlatformOf = (ads, scoped) => PLATFORMS.flatMap((p) => {
  const mine = ads.filter((ad) => ad.platform === p);
  return mine.length === 0 ? [] : [resultsRowOf(mine, scoped, p, PLATFORM_WORD[p])];
});
const byDoorOf = (ads, scoped) => DOOR_ORDER.flatMap((d) => {
  const mine = ads.filter((ad) => ad.door === d);
  return mine.length === 0 ? [] : [resultsRowOf(mine, scoped, d, DOOR[d].label)];
});
const resultsGrouped = (n) => n === null ? DASH : n.toLocaleString("en-US");
function theirsCells(t) {
  if (t.platform === "meta")
    return [resultsGrouped(t.reach), resultsGrouped(t.taps), resultsGrouped(t.chats), resultsGrouped(t.leads)];
  if (t.platform === "google") return [resultsGrouped(t.clicks), resultsGrouped(t.calls), resultsGrouped(t.longCalls)];
  return [resultsGrouped(t.reach), resultsGrouped(t.clicks), resultsGrouped(t.leads)];
}
const theirsColumns = (platform) => Object.values(RESULTS.theirs.columns[platform]);
function resultsTheirsOf(ads, read) {
  return PLATFORMS.flatMap((platform) => {
    const mine = ads.filter((ad) => ad.platform === platform && started(ad));
    if (mine.length === 0) return [];
    const acct = adAccountOf(read, platform);
    return [
      {
        platform,
        title: RESULTS.theirs.card(PLATFORM_OWNER[platform]),
        columns: theirsColumns(platform),
        rows: mine.map((ad) => ({ id: ad.id, name: ad.name, cells: theirsCells(ad.theirs) })),
        read: acct?.readAt ? RESULTS.theirs.read(timeOf(acct.readAt, acct.timezone)) : null
      }
    ];
  });
}
function resultsHeadOf(o) {
  if (o.peopleAds === 0 && o.calls > 0) return RESULTS.head.calls({ calls: o.calls, of: o.of });
  if (o.touch === 0) return RESULTS.head.quiet({ of: o.of });
  return o.linked ? RESULTS.head.booked({ booked: o.booked, touch: o.touch, of: o.of }) : RESULTS.head.touchOnly({ touch: o.touch, of: o.of });
}
const RESULTS_NOTHING = {
  days: null,
  funnel: null,
  cameBack: null,
  byPlatform: [],
  byDoor: [],
  byAd: [],
  figures: [],
  quiet: null
};
function resultsWindowOf(read, at) {
  const to = at.to < read.today ? at.to : addDays(read.today, -1);
  return { from: at.from, to, days: Math.max(0, daysBetween(at.from, to) + 1) };
}
function emptyOf(o) {
  if (o.read.ads.length === 0) return RESULTS.empty.noAds;
  if (o.ads === null) return { title: NO_AD.title, body: NO_AD.body };
  if (!o.quiet && o.window.days > 0) return null;
  const words = lensEmpty("ads", { since: dayShort(o.window.from), until: dayShort(o.window.to) });
  return { title: words.title, body: words.body };
}
export function adsResultsOf(read, config, at) {
  const window = resultsWindowOf(read, at);
  const ads = adsOf(read, at.scope);
  const scoped = {
    ...read,
    ads: ads ?? [],
    people: read.people.filter((p2) => ads?.some((ad) => ad.id === p2.adId)),
    window: { from: window.from, to: window.to }
  };
  const p = pageTotals(scoped);
  const people = scoped.ads.filter(counted);
  const calls = sum(scoped.ads.filter((ad) => !counted(ad)).map((ad) => totalsOf(ad, scoped).inTouch));
  const linked = read.calendar.linked;
  const quiet = p.touch === 0 && calls === 0 && sum(p.spent.map((m) => m.minor)) === 0;
  const windowRead = window.from === read.window.from && window.to === read.window.to;
  const unread = windowRead ? null : RESULTS.theirs.window;
  const base = {
    scope: at.scope,
    scopeKey: adsScopeKey(at.scope),
    scopeWord: scopeWordOf(at.scope, ads ?? []),
    scopes: scopesOf(read),
    window,
    pane: RESULTS.pane({
      dates: `${dayShort(window.from)} \u2013 ${dayShort(window.to)}`,
      days: window.days,
      readAt: readTime(read)
    }),
    totals: {
      spent: sumMoney(p.spent),
      spentAny: p.spent.some((m) => m.minor > 0),
      touch: p.touch,
      booked: linked ? p.booked : null,
      calls
    }
  };
  const empty = emptyOf({ read, ads, window, quiet });
  if (empty) return { ...base, ...RESULTS_NOTHING, empty, head: null, theirs: { cards: [], why: null } };
  const model = adsModel(scoped, config);
  return {
    ...base,
    empty: null,
    head: resultsHeadOf({
      of: ofWords(at.scope, scoped.ads),
      touch: p.touch,
      booked: p.booked,
      calls,
      peopleAds: people.length,
      linked
    }),
    figures: model.figures,
    quiet: model.counted?.quiet ?? null,
    days: resultDaysOf(scoped.ads, {
      from: window.from,
      to: window.to,
      today: read.today,
      a: appointmentWords(read.appointmentWord).a
    }),
    funnel: p.touch === 0 ? null : funnelOf({ scoped, touch: p.touch, booked: p.booked, windowRead }),
    cameBack: cameBackOf({ read, scope: at.scope, windowRead }),
    byPlatform: byPlatformOf(scoped.ads, scoped),
    byDoor: byDoorOf(scoped.ads, scoped),
    byAd: model.groups.flatMap((g) => g.rows),
    theirs: { cards: windowRead ? resultsTheirsOf(scoped.ads, read) : [], why: unread }
  };
}
export function adsFactOf(vm) {
  const t = vm.totals;
  if (vm.empty !== null || t.touch === 0 && !t.spentAny) return null;
  return {
    text: t.touch === 0 ? RESULTS.fact.nobody : RESULTS.fact.brought(t.touch),
    sub: RESULTS.fact.sub({ booked: t.touch === 0 ? null : t.booked, spent: t.spent })
  };
}
