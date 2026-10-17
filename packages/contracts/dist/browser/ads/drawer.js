import { daysBetween } from "./ads.js";
import { newAdFromRoute } from "./address.js";
import { moneyOf, leftOfMoney, perDayOf } from "./money.js";
import { ADS_PERMISSION_WARN_DAYS, ADS_SETTLE_DAYS, ADS_SOFT_NEEDS } from "./rules.js";
import {
  adAccountOf,
  adStateOf,
  areaWord,
  accountRows,
  dayOfIso,
  reachNoteOf,
  readTime,
  sentenceParts,
  settling,
  started,
  timeOf,
  totalOf,
  totalsOf,
  viewState,
  needsSecond
} from "./vm-base.js";
import { adBarsOf, adPeopleOf, adPreviewOf, quietOf, resultsOf } from "./drawer-parts.js";
import { editOf } from "./drawer-edit.js";
import { ADS_DOORS, DOOR, PLATFORM_OWNER, PLATFORM_WORD, REVIEW_WITHIN, SETTINGS_DOOR, STATE, dayWord } from "./words.js";
import { DRAWER } from "./words-drawer.js";
const connectionsDoor = () => ({ words: SETTINGS_DOOR, to: ADS_DOORS.accounts });
const renewDoor = () => ({ words: DRAWER.callout.renew, to: ADS_DOORS.accounts });
const plainPart = (text) => ({ tone: "plain", text, door: null, acts: [] });
function lapsingDay(ad, read) {
  const end = adAccountOf(read, ad.platform)?.permissionEnd ?? null;
  if (ad.platform !== "tiktok" || ad.media.kind !== "post" || end === null) return null;
  return daysBetween(read.today, end) <= ADS_PERMISSION_WARN_DAYS ? end : null;
}
function lapsingCallout(day) {
  return {
    tone: "plain",
    text: DRAWER.callout.lapsing(day === null ? null : dayWord(day)),
    door: renewDoor(),
    acts: []
  };
}
function rejectedCallout(ad, needs) {
  const owner = PLATFORM_OWNER[ad.platform];
  const x = DRAWER.callout.rejectedExits;
  return {
    tone: "warn",
    text: DRAWER.callout.rejected({ owner, why: needs.platformWords ?? "" }),
    door: null,
    acts: [
      { id: "fix", label: x.fix, done: x.fix },
      { id: "again", label: x.again(owner), done: DRAWER.callout.done.again(owner) },
      { id: "fresh", label: x.fresh, done: x.fresh }
    ]
  };
}
function needsCallout(ad, needs, read) {
  switch (needs.code) {
    case "paused-in-platform": {
      const resume = DRAWER.callout.resume;
      return {
        ...plainPart(DRAWER.callout.pausedInPlatform(ad.platform)),
        acts: [{ id: "resume", label: resume, done: resume }]
      };
    }
    case "price-changed": {
      const update = DRAWER.callout.updateAd;
      return {
        ...plainPart(DRAWER.callout.priceChanged({ was: needs.was, now: needs.now })),
        acts: [{ id: "update", label: update, done: update }]
      };
    }
    case "rejected":
      return rejectedCallout(ad, needs);
    case "payment":
      return { tone: "warn", text: DRAWER.callout.payment(ad.platform), door: connectionsDoor(), acts: [] };
    case "permission-lapsing":
      return lapsingCallout(adAccountOf(read, ad.platform)?.permissionEnd ?? null);
    default:
      return {
        tone: ADS_SOFT_NEEDS.includes(needs.code) ? "plain" : "warn",
        text: needs.platformWords ?? STATE.needsDefault(ad.platform),
        door: connectionsDoor(),
        acts: []
      };
  }
}
function couldntFinishCallout(ad) {
  const x = DRAWER.callout.couldntExits;
  const d = DRAWER.callout.done;
  return {
    tone: "warn",
    text: DRAWER.callout.couldntFinish(ad.platform),
    door: null,
    acts: [
      { id: "retry", label: x.retry, done: d.retry },
      { id: "remove", label: x.remove, done: d.remove }
    ]
  };
}
function settleWords(ad, read) {
  return settling([ad], read.today) ? DRAWER.callout.settling(ADS_SETTLE_DAYS) : DRAWER.callout.settled(ADS_SETTLE_DAYS);
}
function finishedCallout(ad, t, read) {
  const said = DRAWER.callout.finished({ name: ad.name, total: moneyOf(totalOf(ad) ?? t.lifetimeMinor, ad.currency) });
  const brought = ad.door === "call" ? DRAWER.callout.finishedCalls(t.inTouch) : DRAWER.callout.finishedBooked(t.booked);
  return plainPart(`${said} ${brought} ${settleWords(ad, read)}`);
}
function stateCallout(ad, t, read) {
  switch (ad.state) {
    case "setting-up":
      return plainPart(DRAWER.callout.settingUp(ad.platform));
    case "couldnt-finish":
      return couldntFinishCallout(ad);
    case "review":
      return started(ad) ? plainPart(DRAWER.callout.recheck({ owner: PLATFORM_OWNER[ad.platform], within: REVIEW_WITHIN[ad.platform] })) : plainPart(DRAWER.callout.review(ad.platform));
    case "ended":
      return plainPart(`${DRAWER.callout.ended(dayWord(ad.endDay))} ${settleWords(ad, read)}`);
    case "finished":
      return finishedCallout(ad, t, read);
    case "on":
    case "paused": {
      const lapsing = lapsingDay(ad, read);
      if (lapsing !== null) return lapsingCallout(lapsing);
      return ad.state === "on" && t.spentMinor > 0 && t.inTouch === 0 ? plainPart(DRAWER.callout.quiet) : null;
    }
    default:
      return null;
  }
}
function calloutOf(ad, t, read) {
  const callout = ad.needs ? needsCallout(ad, ad.needs, read) : stateCallout(ad, t, read);
  if (callout === null || ad.madeHere) return callout;
  return { ...callout, acts: callout.acts.filter((a) => a.id === "resume" || a.id === "again") };
}
function drawerNext(ad, t) {
  const total = totalOf(ad);
  const left = total === null ? null : Math.max(0, total - t.lifetimeMinor);
  const day = dayWord(ad.endDay);
  const pd = perDayOf(ad.aboutADayMinor, ad.currency);
  const unmade = ad.state === "setting-up" || ad.state === "couldnt-finish" || ad.state === "review" && !started(ad);
  if (unmade) {
    return total === null ? DRAWER.next.reviewDaily({ from: dayWord(ad.startDay), perDay: pd }) : DRAWER.next.review({ from: dayWord(ad.startDay), to: day, total: moneyOf(total, ad.currency), perDay: pd });
  }
  if (ad.state === "ended") return DRAWER.next.ended({ day, spent: moneyOf(t.lifetimeMinor, ad.currency) });
  if (ad.state === "finished") return DRAWER.next.finished(moneyOf(total ?? t.lifetimeMinor, ad.currency));
  if (total === null || left === null) {
    return ad.state === "paused" ? DRAWER.next.pausedDaily(pd) : DRAWER.next.runsDaily(pd);
  }
  const leftSaid = leftOfMoney(left, total, ad.currency);
  if (ad.state === "paused") return DRAWER.next.paused({ day, left: leftSaid });
  return DRAWER.next.runs({ day, left: leftSaid, perDay: pd });
}
function sentWhen(sentAt, read) {
  if (sentAt === null) return "";
  const day = dayOfIso(sentAt, read.timezone);
  return DRAWER.reach.sentWhen({
    today: day === read.today,
    day: day === "" ? "" : dayWord(day),
    time: timeOf(sentAt, read.timezone)
  });
}
function reachSaid(ad, read, firstBad) {
  const owner = PLATFORM_OWNER[ad.platform];
  const note = reachNoteOf(ad, read);
  switch (ad.state) {
    case "review":
      return { tone: "plain", said: DRAWER.reach.review({ owner, when: sentWhen(ad.sentAt, read), note }) };
    case "needs-you":
      return { tone: "warn", said: DRAWER.reach.needs(firstBad ?? needsSecond(ad)) };
    case "paused":
    case "setting-up":
    case "couldnt-finish":
      return { tone: "plain", said: DRAWER.reach.paused(note) };
    case "ended":
    case "finished":
      return { tone: "plain", said: DRAWER.reach.ended(dayWord(ad.endDay)) };
    default:
      return {
        tone: firstBad ? "warn" : "ok",
        said: DRAWER.reach.running({ owner, day: ad.approvedDay ? dayWord(ad.approvedDay) : "", note })
      };
  }
}
function drawerReach(ad, read) {
  const rows = accountRows(read, ad.platform);
  const bad = rows.find((r) => r.tone === "warn");
  const { tone, said } = reachSaid(ad, read, bad ? bad.text : null);
  return { tone, state: said.state, parts: said.parts, rows, read: DRAWER.reach.read(readTime(read)) };
}
function drawerModeOf(ad) {
  if (ad.state === "ended" || ad.state === "finished") return "done";
  return ad.state === "paused" || ad.needs?.code === "paused-in-platform" ? "paused" : "running";
}
function footOf(ad, mode) {
  if (ad.state === "setting-up" || ad.state === "couldnt-finish") return [];
  if (mode === "done") return ad.madeHere ? ["again"] : [];
  const first = mode === "paused" ? "resume" : "pause";
  return ad.madeHere ? [first, "edit"] : [first];
}
const reportRoute = (ad, read) => `reports/ads:${read.window.from}~${read.window.to}:ad:${ad.id}`;
export function adModel(ad, read, config, saved) {
  const t = totalsOf(ad, read);
  const state = viewState(ad, read.today);
  const mode = drawerModeOf(ad);
  const owner = PLATFORM_OWNER[ad.platform];
  const sentence = {
    offer: ad.offer,
    platform: ad.platform,
    door: ad.door,
    area: areaWord(ad.area),
    street: read.business.street,
    budget: ad.budget,
    currency: ad.currency,
    endDay: ad.budget.mode === "total" ? ad.endDay : null,
    chips: "running",
    past: mode === "done"
  };
  return {
    id: ad.id,
    kicker: DRAWER.kicker(PLATFORM_WORD[ad.platform], DOOR[ad.door].label),
    name: ad.name,
    state: adStateOf(ad, t, read),
    platform: ad.platform,
    door: ad.door,
    owner,
    within: REVIEW_WITHIN[ad.platform],
    madeHere: ad.madeHere,
    adopted: ad.madeHere ? null : DRAWER.adopted(ad.platform),
    mode,
    foot: footOf(ad, mode),
    callout: calloutOf(ad, t, read),
    next: drawerNext(ad, t),
    sentence: sentenceParts(sentence),
    reach: drawerReach(ad, read),
    results: resultsOf(ad, t, { read, tooEarly: state === "too-early", reportTo: reportRoute(ad, read) }),
    bars: adBarsOf(ad, t, read),
    quiet: quietOf(ad),
    preview: adPreviewOf(ad, read),
    people: adPeopleOf(ad, t, { read, peopleTo: ADS_DOORS.people }),
    edit: editOf(ad, t, { read, config, saved }),
    endConfirm: DRAWER.menu.endConfirm(ad.name),
    confirm: {
      update: DRAWER.confirm.update({ owner, within: REVIEW_WITHIN[ad.platform] }),
      remove: DRAWER.confirm.remove(owner)
    },
    go: { copy: newAdFromRoute("copy", ad.id), again: newAdFromRoute("again", ad.id) }
  };
}
