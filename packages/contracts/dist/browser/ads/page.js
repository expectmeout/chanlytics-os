import { REPORT_MIN_N } from "../reports/report-tiles.js";
import { CALENDAR_SETTING_ROUTE } from "../setup/calendar-source.js";
import { daysBetween } from "./ads.js";
import { adRoute } from "./address.js";
import { moneyOf, perDayOf, sumMoney } from "./money.js";
import {
  noAdsOf,
  ownersOf,
  pageAsk,
  pageTotals,
  phoneOf,
  platformsRead,
  tilesOf,
  v0Of,
  eachInTouch
} from "./page-parts.js";
import { ADS_ASK_MIN, ADS_GROUP_FROM } from "./rules.js";
import {
  DASH,
  PLATFORMS,
  adAccountOf,
  adStateOf,
  costEach,
  countCtx,
  counted,
  dayOfIso,
  leadOf,
  needsSecond,
  accountRows,
  readTime,
  settling,
  started,
  sum,
  timeOf,
  totalsOf,
  viewState
} from "./vm-base.js";
import { ADS_DOORS, DOOR, DOOR_ORDER, PLATFORM_OWNER, PLATFORM_WORD, dayLines, dayShort, dayWord } from "./words.js";
import {
  COUNTED,
  FIGURES,
  GROUP,
  HEAD,
  LEDGER,
  PHONE,
  ADS_READ,
  STANDING,
  figureWords,
  groupMeta,
  platformMeta
} from "./words-page.js";
const cell = (value, unit = null, why = null) => ({ value, unit, why });
function eachCell(t, ad) {
  const cost = costEach(t.spentMinor, t.booked);
  if (cost !== null) return cell(moneyOf(cost, ad.currency));
  return cell(DASH, t.booked === 0 ? LEDGER.noneYet : LEDGER.only(t.booked), LEDGER.tooFew);
}
function stampOf(acct, today) {
  if (acct.readAt === null) return null;
  const day = dayOfIso(acct.readAt, acct.timezone);
  const time = timeOf(acct.readAt, acct.timezone).replace(/:00(?= [AP]M$)/, "");
  const ago = daysBetween(day, today);
  const when = ago <= 0 ? "today" : ago < 7 ? dayLines(day).at(0) ?? day : dayShort(day);
  return `${when} ${time}`;
}
function readViewOf(read) {
  const failed = platformsRead(read, "failed");
  const asOf = {};
  for (const platform of failed) {
    const acct = adAccountOf(read, platform);
    asOf[platform] = acct ? stampOf(acct, read.today) : null;
  }
  return { reading: platformsRead(read, "reading"), failed, asOf };
}
const waitingOn = (read, rv, only = () => true) => rv.reading.filter((platform) => read.ads.some((ad) => ad.platform === platform && only(ad)));
function cellsOf(ad, t, read, rv) {
  if (!started(ad)) {
    const none = cell(DASH, null, LEDGER.notStarted);
    return { spent: none, inTouch: none, booked: none, each: none };
  }
  const waits = cell(DASH, LEDGER.readingUnit, LEDGER.reading(PLATFORM_OWNER[ad.platform]));
  const reading = rv.reading.includes(ad.platform);
  const stamp = rv.asOf[ad.platform];
  const spent = reading ? waits : cell(moneyOf(t.spentMinor, ad.currency), stamp ? LEDGER.asOf(stamp) : null);
  if (!counted(ad)) {
    const why = FIGURES.callsNotMatched;
    const calls = reading ? waits : cell(String(t.inTouch), DOOR[ad.door].unit);
    return { spent, inTouch: calls, booked: cell(DASH, LEDGER.notMatched, why), each: cell(DASH, null, why) };
  }
  const inTouch = cell(String(t.inTouch), DOOR[ad.door].unit);
  if (!read.calendar.linked) {
    const why = FIGURES.needsLink;
    return { spent, inTouch, booked: cell(DASH, null, why), each: cell(DASH, null, why) };
  }
  const costWaits = reading && costEach(t.spentMinor, t.booked) !== null;
  return { spent, inTouch, booked: cell(String(t.booked)), each: costWaits ? waits : eachCell(t, ad) };
}
function phoneEndOf(ad, t, read, rv) {
  if (!started(ad) || counted(ad) && !read.calendar.linked) return { endTop: DASH, endSub: null };
  const reading = rv.reading.includes(ad.platform);
  if (!counted(ad)) {
    return reading ? { endTop: DASH, endSub: LEDGER.readingUnit } : { endTop: LEDGER.calls(t.inTouch), endSub: LEDGER.googleCount };
  }
  const cost = costEach(t.spentMinor, t.booked);
  const sub = cost !== null ? LEDGER.each(moneyOf(cost, ad.currency)) : t.booked === 0 ? LEDGER.noneYet : LEDGER.only(t.booked);
  return { endTop: LEDGER.booked(t.booked), endSub: reading && cost !== null ? LEDGER.readingUnit : sub };
}
function hintTail(ad, read) {
  if (started(ad)) return LEDGER.since(dayShort(ad.startDay));
  const waiting = ad.state === "review" || ad.state === "needs-you";
  if (!waiting || ad.sentAt === null) return LEDGER.starts(dayShort(ad.startDay));
  const day = dayOfIso(ad.sentAt, read.timezone);
  return LEDGER.sentTo(PLATFORM_OWNER[ad.platform], day === read.today ? "today" : dayShort(day));
}
const leadFor = (ad) => ad.madeHere ? leadOf({ platform: ad.platform, door: ad.door, area: ad.area }) : LEDGER.madeIn[ad.platform];
function hintOf(ad, read) {
  const tail = hintTail(ad, read);
  return LEDGER.hint({ lead: leadFor(ad), perDay: perDayOf(ad.aboutADayMinor, ad.currency), tail });
}
function phoneLineOf(ad, rv) {
  const where = ad.madeHere ? PLATFORM_WORD[ad.platform] : LEDGER.madeIn[ad.platform];
  const stamp = started(ad) ? rv.asOf[ad.platform] : null;
  return stamp ? PHONE.rowAsOf(where, DOOR[ad.door].short, stamp) : PHONE.row(where, DOOR[ad.door].short);
}
function adRowOf(ad, read, rv) {
  const t = totalsOf(ad, read);
  const base = adStateOf(ad, t, read);
  const alert = ad.state === "on" && ad.needs !== null;
  const state = alert ? { ...base, second: needsSecond(ad) } : base;
  const cells = cellsOf(ad, t, read, rv);
  const end = phoneEndOf(ad, t, read, rv);
  return {
    id: ad.id,
    name: ad.name,
    hint: hintOf(ad, read),
    door: ad.door,
    glyph: DOOR[ad.door].glyph,
    tone: state.tone,
    ...cells,
    state,
    alert,
    fold: cells.inTouch.unit ? { value: cells.inTouch.value, unit: cells.inTouch.unit } : null,
    open: adRoute(ad.id),
    phone: { line: phoneLineOf(ad, rv), ...end }
  };
}
const RANK = {
  "couldnt-finish": 0,
  "needs-you": 0,
  on: 1,
  "too-early": 1,
  "setting-up": 2,
  review: 2,
  paused: 3,
  finished: 4,
  ended: 5
};
const PLATFORM_GLYPH = { meta: "users", google: "search", tiktok: "video" };
function peopleIn(list, rv) {
  if (list.some((e) => !counted(e.ad) && rv.reading.includes(e.ad.platform))) return null;
  return sum(list.map((e) => e.t.inTouch));
}
function groupsOf(read, by, rv) {
  const entries = read.ads.map((ad) => ({ ad, t: totalsOf(ad, read) })).sort(
    (a, b) => RANK[viewState(a.ad, read.today)] - RANK[viewState(b.ad, read.today)] || b.t.spentMinor - a.t.spentMinor
  );
  const rowsOf = (list) => list.map((e) => adRowOf(e.ad, read, rv));
  if (by === "platform") {
    return PLATFORMS.flatMap((platform) => {
      const mine = entries.filter((e) => e.ad.platform === platform);
      if (mine.length === 0) return [];
      const people = peopleIn(mine, rv);
      const meta = platformMeta({ platform, ads: mine.length, people });
      return [
        { key: platform, glyph: PLATFORM_GLYPH[platform], caps: PLATFORM_WORD[platform], meta, rows: rowsOf(mine) }
      ];
    });
  }
  return DOOR_ORDER.flatMap((door) => {
    const mine = entries.filter((e) => e.ad.door === door);
    if (mine.length === 0) return [];
    const meta = groupMeta({ door, ads: mine.length, people: peopleIn(mine, rv) });
    return [{ key: door, glyph: DOOR[door].glyph, caps: DOOR[door].label, meta, rows: rowsOf(mine) }];
  });
}
function waitingFigure(id, label, def, waits) {
  return {
    id,
    label,
    value: DASH,
    change: null,
    meta: FIGURES.reading(ownersOf(waits)),
    definition: def,
    n: null,
    minN: REPORT_MIN_N
  };
}
function eachFigure(p, read, def, waits) {
  const so = settling(read.ads, read.today);
  if (!read.calendar.linked) {
    const cost = eachInTouch(p);
    if (cost !== null && waits.length > 0) return waitingFigure("each", FIGURES.eachInTouchLabel, def, waits);
    return {
      id: "each",
      label: FIGURES.eachInTouchLabel,
      value: cost === null ? DASH : moneyOf(cost.minor, cost.currency),
      change: so ? FIGURES.soFar : null,
      meta: FIGURES.eachInTouchMeta(sumMoney(p.eachSpend), p.touch),
      definition: def,
      n: p.touch,
      minN: REPORT_MIN_N
    };
  }
  const label = figureWords(countCtx(read)).each.label;
  if (p.each !== null && waits.length > 0) return waitingFigure("each", label, def, waits);
  return {
    id: "each",
    label,
    value: p.each === null ? DASH : moneyOf(p.each.minor, p.each.currency),
    change: p.each !== null && so ? FIGURES.soFar : null,
    meta: p.each === null ? null : FIGURES.eachMeta(sumMoney(p.eachSpend), p.booked),
    definition: def,
    n: p.booked,
    minN: REPORT_MIN_N
  };
}
function spentFigure(p, read, rv, def) {
  const waits = waitingOn(read, rv);
  if (waits.length > 0) return waitingFigure("spent", def.label, def.def, waits);
  const stale = rv.failed.find((platform) => read.ads.some((ad) => ad.platform === platform));
  return {
    id: "spent",
    label: def.label,
    value: sumMoney(p.spent),
    change: null,
    meta: stale === void 0 ? FIGURES.spentMeta(p.spentAds) : FIGURES.spentMetaStale(p.spentAds, PLATFORM_OWNER[stale], rv.asOf[stale] ?? null),
    definition: def.def,
    n: null,
    minN: REPORT_MIN_N
  };
}
function figuresOf(p, read, rv) {
  const w = figureWords(countCtx(read));
  const linked = read.calendar.linked;
  const plain = { change: null, n: null, minN: REPORT_MIN_N };
  return [
    spentFigure(p, read, rv, w.spent),
    {
      ...plain,
      id: "touch",
      label: w.touch.label,
      value: String(p.touch),
      meta: FIGURES.touchMeta(p.wrote, p.left),
      definition: w.touch.def
    },
    {
      ...plain,
      id: "booked",
      label: w.booked.label,
      value: linked ? String(p.booked) : DASH,
      meta: linked ? FIGURES.bookedMeta(p.touch) : FIGURES.needsLink,
      definition: w.booked.def
    },
    eachFigure(p, read, w.each.def, waitingOn(read, rv, counted))
  ];
}
function countedOf(read, reading) {
  const w = figureWords(countCtx(read));
  return {
    quiet: reading ? COUNTED.reading : COUNTED.quiet(readTime(read)),
    door: COUNTED.door,
    title: COUNTED.title,
    items: [
      { label: w.spent.label, text: w.spent.def },
      { label: w.touch.label, text: w.touch.def },
      { label: w.booked.label, text: w.booked.def },
      { label: w.each.label, text: w.each.def },
      { label: null, text: COUNTED.fees },
      { label: null, text: COUNTED.calls },
      { label: null, text: COUNTED.kept }
    ]
  };
}
function pageModeOf(read) {
  if (read.ads.length > 0) return "ads";
  return read.accounts.some((a) => a.status !== "not-connected") ? "none" : "v0";
}
function pageHead(mode, p, read) {
  if (mode === "v0") return { strong: HEAD.v0Strong, rest: HEAD.v0Rest, money: null };
  if (mode === "none") return { strong: "", rest: HEAD.noAds, money: HEAD.money };
  const said = read.calendar.linked ? HEAD.booked(p.booked, p.touch) : HEAD.touchOnly(p.touch);
  return { ...said, money: HEAD.money };
}
function accountLine(read, platform) {
  const acct = adAccountOf(read, platform);
  if (!acct || acct.name === null || acct.status === "not-connected" || acct.status === "choose") return null;
  const at = acct.readAt ? `${dayWord(dayOfIso(acct.readAt, acct.timezone))}, ${timeOf(acct.readAt, acct.timezone)}` : "";
  if (acct.read === "reading") return STANDING.reading(acct.name);
  if (acct.read === "failed") return STANDING.failed(acct.name, at);
  return acct.readAt ? STANDING.account(acct.name, timeOf(acct.readAt, acct.timezone)) : acct.name;
}
function standingState(read, platform, rows) {
  const acct = adAccountOf(read, platform);
  const status = acct?.status ?? "not-connected";
  if (status === "not-connected") return "off";
  if (status !== "connected" || acct?.read === "failed") return "warn";
  return rows.some((r) => r.tone === "warn") ? "warn" : "ok";
}
function standingWord(acct, state) {
  const status = acct?.status ?? "not-connected";
  if (status === "choose") return STANDING.choose;
  if (status === "lapsed") return STANDING.lapsed;
  if (status === "connected" && acct?.read === "failed") return STANDING.unread;
  return state === "off" ? STANDING.off : state === "warn" ? STANDING.needsYou : STANDING.connected;
}
function pageStanding(read) {
  return PLATFORMS.map((id) => {
    const rows = accountRows(read, id);
    const state = standingState(read, id, rows);
    const door = { words: STANDING.door, to: ADS_DOORS.accounts };
    return {
      id,
      name: PLATFORM_WORD[id],
      state,
      word: standingWord(adAccountOf(read, id), state),
      account: accountLine(read, id),
      rows,
      note: STANDING.charged(id),
      door
    };
  });
}
export function earlierCost(read) {
  const p = pageTotals(read);
  return p.each !== null && p.booked >= ADS_ASK_MIN ? { each: moneyOf(p.each.minor, p.each.currency), people: p.booked } : null;
}
const failedOf = (rv) => rv.failed.map((platform) => ({
  platform,
  line: ADS_READ.failed(PLATFORM_OWNER[platform], rv.asOf[platform] ?? null),
  again: ADS_READ.again
}));
const groupByOf = (read, by) => read.ads.length < ADS_GROUP_FROM ? null : {
  label: GROUP.label,
  value: by,
  options: [
    { value: "door", label: GROUP.door },
    { value: "platform", label: GROUP.platform }
  ]
};
export function adsModel(read, config, by = "door") {
  const mode = pageModeOf(read);
  const p = pageTotals(read);
  const rv = readViewOf(read);
  const reading = rv.reading.length > 0;
  const since = read.firstTouch ? dayShort(read.firstTouch.since) : null;
  const groupBy = groupByOf(read, by);
  const base = {
    mode,
    head: pageHead(mode, p, read),
    pane: reading ? HEAD.reading(ownersOf(rv.reading)) : mode === "v0" && since !== null ? HEAD.v0Read(since) : HEAD.read(readTime(read)),
    standing: pageStanding(read),
    figures: [],
    counted: null,
    ask: null,
    failed: failedOf(rv),
    reading,
    link: null,
    groupBy: null,
    groups: [],
    tiles: null,
    phone: null,
    v0: null,
    noAds: null
  };
  if (mode === "v0") return { ...base, v0: v0Of(read) };
  if (mode === "none") return { ...base, noAds: noAdsOf(read, config) };
  const tiles = tilesOf(read, rv.reading);
  return {
    ...base,
    figures: figuresOf(p, read, rv),
    counted: countedOf(read, reading),
    ask: pageAsk(read, reading),
    link: read.calendar.linked ? null : { words: FIGURES.linkDoor, to: CALENDAR_SETTING_ROUTE },
    groupBy,
    groups: groupsOf(read, groupBy ? by : "door", rv),
    tiles,
    phone: phoneOf(p, read, tiles.waiting.rows, rv.reading)
  };
}
