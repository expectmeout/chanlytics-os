/**
 * One ad's drawer (page-only), in Option B's order: kicker, name, callout, what's left, the sentence, the reach line, the
 * results and the bar a day, the preview, the people it brought, what the tapped words change. Pure, like the rest of the
 * models: `adModel(ad, read, config)` reads an `AdRead` in the `AdsRead` it was read with, and the lists and blocks are
 * drawer-parts.ts's and drawer-edit.ts's (apart from this only for the file limit; this hands every name a page needs on).
 */
import type { AdNeeds, AdRead, AdsConfig, AdsRead } from "./ads";
import { daysBetween } from "./ads";
import { newAdFromRoute } from "./address";
import { moneyOf, leftOfMoney, perDayOf } from "./money";
import { ADS_PERMISSION_WARN_DAYS, ADS_SETTLE_DAYS, ADS_SOFT_NEEDS } from "./rules";
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
  needsSecond,
} from "./vm-base";
import type { AdTone, DoorVM, SentenceInput, SentencePart, StandRowVM, StateVM, Totals } from "./vm-base";
import { adBarsOf, adPeopleOf, adPreviewOf, quietOf, resultsOf } from "./drawer-parts";
import type { BarsVM, PeopleVM, PreviewVM, QuietVM, ResultsVM } from "./drawer-parts";
import { editOf } from "./drawer-edit";
import type { EditVM } from "./drawer-edit";
import { ADS_DOORS, DOOR, PLATFORM_OWNER, PLATFORM_WORD, REVIEW_WITHIN, SETTINGS_DOOR, STATE, dayWord } from "./words";
import { DRAWER } from "./words-drawer";
import type { ReachSaid } from "./words-drawer";

// ---------------------------------------------------------------------------------------------------------------------
// The drawer's view-model types

/** A press a callout offers. `again` asks the platform to look at a turned-down ad again; the ad stays as it is. */
export type CalloutActId = "resume" | "update" | "fix" | "again" | "fresh" | "retry" | "remove";

export interface CalloutVM {
  tone: AdTone;
  text: string;
  door: DoorVM | null;
  /** `done` is what the press says of itself once pressed, until the platform answers. */
  acts: { id: CalloutActId; label: string; done: string }[];
}

export interface ReachVM {
  tone: AdTone;
  /** `On`, `In review`, `Ended Sat 10 Oct`: the first word of the line, in the ink. */
  state: string;
  /** `Meta approved it Mon 14 Sep`, `last message arrived 8:41 AM today`: the reasons, dim. */
  parts: string[];
  rows: StandRowVM[];
  read: string;
}

/** A press in the foot. An ad the owner made on the platform itself has only Pause and Resume. */
export type FootAct = "pause" | "resume" | "edit" | "again";

export interface AdDrawerVM {
  id: string;
  kicker: string;
  name: string;
  state: StateVM;
  platform: AdRead["platform"];
  door: AdRead["door"];
  owner: string;
  /** `usually within a day`. */
  within: string;
  /** False for an ad the owner made on the platform itself: only Pause and Resume are here. */
  madeHere: boolean;
  /** `Made in Meta Ads Manager. Chanlytics can pause and resume it; change it in Meta.`; null for an ad made here. */
  adopted: string | null;
  /** The foot: Pause | Edit (running), Resume | Edit (paused), Run it again (done); fewer where the ad is not ours or not made. */
  mode: "running" | "paused" | "done";
  foot: FootAct[];
  callout: CalloutVM | null;
  /** `Runs to Sat 31 Oct · $308 left of $720 · about $15 a day`. */
  next: string;
  sentence: SentencePart[];
  reach: ReachVM;
  results: ResultsVM;
  bars: BarsVM;
  quiet: QuietVM;
  preview: PreviewVM;
  people: PeopleVM;
  edit: EditVM;
  endConfirm: string;
  /** The questions a callout's press asks first. */
  confirm: { update: string; remove: string };
  /** Where New ad opens from this ad: a copy of it, and to run it again. */
  go: { copy: string; again: string };
}

// ---------------------------------------------------------------------------------------------------------------------
// The callout

const connectionsDoor = (): DoorVM => ({ words: SETTINGS_DOOR, to: ADS_DOORS.accounts });
const renewDoor = (): DoorVM => ({ words: DRAWER.callout.renew, to: ADS_DOORS.accounts });

const plain = (text: string): CalloutVM => ({ tone: "plain", text, door: null, acts: [] });

/** The day TikTok's permission to use the ad's post ends, when it ends within a week and the ad is made of a post. */
function lapsingDay(ad: AdRead, read: AdsRead): string | null {
  const end = adAccountOf(read, ad.platform)?.permissionEnd ?? null;
  if (ad.platform !== "tiktok" || ad.media.kind !== "post" || end === null) return null;
  return daysBetween(read.today, end) <= ADS_PERMISSION_WARN_DAYS ? end : null;
}

function lapsingCallout(day: string | null): CalloutVM {
  return {
    tone: "plain",
    text: DRAWER.callout.lapsing(day === null ? null : dayWord(day)),
    door: renewDoor(),
    acts: [],
  };
}

function rejectedCallout(ad: AdRead, needs: AdNeeds): CalloutVM {
  const owner = PLATFORM_OWNER[ad.platform];
  const x = DRAWER.callout.rejectedExits;
  return {
    tone: "warn",
    text: DRAWER.callout.rejected({ owner, why: needs.platformWords ?? "" }),
    door: null,
    acts: [
      { id: "fix", label: x.fix, done: x.fix },
      { id: "again", label: x.again(owner), done: DRAWER.callout.done.again(owner) },
      { id: "fresh", label: x.fresh, done: x.fresh },
    ],
  };
}

/** What an ad that needs the owner says: a press to mend it where there is one, a door where it is Settings'. */
function needsCallout(ad: AdRead, needs: AdNeeds, read: AdsRead): CalloutVM {
  switch (needs.code) {
    case "paused-in-platform": {
      const resume = DRAWER.callout.resume;
      return {
        ...plain(DRAWER.callout.pausedInPlatform(ad.platform)),
        acts: [{ id: "resume", label: resume, done: resume }],
      };
    }
    case "price-changed": {
      const update = DRAWER.callout.updateAd;
      return {
        ...plain(DRAWER.callout.priceChanged({ was: needs.was, now: needs.now })),
        acts: [{ id: "update", label: update, done: update }],
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
        acts: [],
      };
  }
}

/** An ad that could not be made: what was made stays paused there, and the owner chooses to try again or to take it away. */
function couldntFinishCallout(ad: AdRead): CalloutVM {
  const x = DRAWER.callout.couldntExits;
  const d = DRAWER.callout.done;
  return {
    tone: "warn",
    text: DRAWER.callout.couldntFinish(ad.platform),
    door: null,
    acts: [
      { id: "retry", label: x.retry, done: d.retry },
      { id: "remove", label: x.remove, done: d.remove },
    ],
  };
}

/** Whether the numbers of an ad that ended are still settling, said once for the ad that ended and the one that spent its total. */
function settleWords(ad: AdRead, read: AdsRead): string {
  return settling([ad], read.today)
    ? DRAWER.callout.settling(ADS_SETTLE_DAYS)
    : DRAWER.callout.settled(ADS_SETTLE_DAYS);
}

/** An ad that spent its total and stopped: what it brought (Google's calls are Google's count, never a number of people booked). */
function finishedCallout(ad: AdRead, t: Totals, read: AdsRead): CalloutVM {
  const said = DRAWER.callout.finished({ name: ad.name, total: moneyOf(totalOf(ad) ?? t.lifetimeMinor, ad.currency) });
  const brought =
    ad.door === "call" ? DRAWER.callout.finishedCalls(t.inTouch) : DRAWER.callout.finishedBooked(t.booked);
  return plain(`${said} ${brought} ${settleWords(ad, read)}`);
}

/** What an ad that is not waiting on a need says of its state. */
function stateCallout(ad: AdRead, t: Totals, read: AdsRead): CalloutVM | null {
  switch (ad.state) {
    case "setting-up":
      return plain(DRAWER.callout.settingUp(ad.platform));
    case "couldnt-finish":
      return couldntFinishCallout(ad);
    case "review":
      return started(ad)
        ? plain(DRAWER.callout.recheck({ owner: PLATFORM_OWNER[ad.platform], within: REVIEW_WITHIN[ad.platform] }))
        : plain(DRAWER.callout.review(ad.platform));
    case "ended":
      return plain(`${DRAWER.callout.ended(dayWord(ad.endDay))} ${settleWords(ad, read)}`);
    case "finished":
      return finishedCallout(ad, t, read);
    case "on":
    case "paused": {
      const lapsing = lapsingDay(ad, read);
      if (lapsing !== null) return lapsingCallout(lapsing);
      return ad.state === "on" && t.spentMinor > 0 && t.inTouch === 0 ? plain(DRAWER.callout.quiet) : null;
    }
    default:
      return null;
  }
}

/**
 * The line at the top of the drawer, only when something blocks or waits. An ad the owner made on the platform itself can only
 * be paused and resumed here (or its platform asked again), so its callout offers no more than that.
 */
function calloutOf(ad: AdRead, t: Totals, read: AdsRead): CalloutVM | null {
  const callout = ad.needs ? needsCallout(ad, ad.needs, read) : stateCallout(ad, t, read);
  if (callout === null || ad.madeHere) return callout;
  return { ...callout, acts: callout.acts.filter((a) => a.id === "resume" || a.id === "again") };
}

// ---------------------------------------------------------------------------------------------------------------------
// What is left, and what it runs on

function drawerNext(ad: AdRead, t: Totals): string {
  const total = totalOf(ad);
  const left = total === null ? null : Math.max(0, total - t.lifetimeMinor);
  const day = dayWord(ad.endDay);
  const pd = perDayOf(ad.aboutADayMinor, ad.currency);
  const unmade = ad.state === "setting-up" || ad.state === "couldnt-finish" || (ad.state === "review" && !started(ad));
  if (unmade) {
    return total === null
      ? DRAWER.next.reviewDaily({ from: dayWord(ad.startDay), perDay: pd })
      : DRAWER.next.review({ from: dayWord(ad.startDay), to: day, total: moneyOf(total, ad.currency), perDay: pd });
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

/** When it was sent to the platform, said by its day: `today 9:02 AM`, or `Sat 10 Oct 4:30 PM`. */
function sentWhen(sentAt: string | null, read: AdsRead): string {
  if (sentAt === null) return "";
  const day = dayOfIso(sentAt, read.timezone);
  return DRAWER.reach.sentWhen({
    today: day === read.today,
    day: day === "" ? "" : dayWord(day),
    time: timeOf(sentAt, read.timezone),
  });
}

function reachSaid(ad: AdRead, read: AdsRead, firstBad: string | null): { tone: AdTone; said: ReachSaid } {
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
        said: DRAWER.reach.running({ owner, day: ad.approvedDay ? dayWord(ad.approvedDay) : "", note }),
      };
  }
}

function drawerReach(ad: AdRead, read: AdsRead): ReachVM {
  const rows = accountRows(read, ad.platform);
  const bad = rows.find((r) => r.tone === "warn");
  const { tone, said } = reachSaid(ad, read, bad ? bad.text : null);
  return { tone, state: said.state, parts: said.parts, rows, read: DRAWER.reach.read(readTime(read)) };
}

/** Done once it ended; paused once it is, here or on the platform; else running. */
function drawerModeOf(ad: AdRead): AdDrawerVM["mode"] {
  if (ad.state === "ended" || ad.state === "finished") return "done";
  return ad.state === "paused" || ad.needs?.code === "paused-in-platform" ? "paused" : "running";
}

/** The foot's presses: none while an ad is being made; Run it again only for an ad made here; an adopted ad's two. */
function footOf(ad: AdRead, mode: AdDrawerVM["mode"]): FootAct[] {
  if (ad.state === "setting-up" || ad.state === "couldnt-finish") return [];
  if (mode === "done") return ad.madeHere ? ["again"] : [];
  const first: FootAct = mode === "paused" ? "resume" : "pause";
  return ad.madeHere ? [first, "edit"] : [first];
}

/** This ad's numbers in Reports: the Ads lens over the same 30 days, on this ad. */
const reportRoute = (ad: AdRead, read: AdsRead): string =>
  `reports/ads:${read.window.from}~${read.window.to}:ad:${ad.id}`;

/**
 * One ad's drawer, in Option B's order: kicker, name, callout, what's left, the sentence, the reach line, results, preview,
 * people. `ad` is the ad as it would be (an Edit draft applied); `saved` is the ad as the platform has it, which what the
 * platform takes of an amount is measured from (it is `ad` where nothing is being edited).
 */
export function adModel(ad: AdRead, read: AdsRead, config: AdsConfig, saved?: AdRead): AdDrawerVM {
  const t = totalsOf(ad, read);
  const state = viewState(ad, read.today);
  const mode = drawerModeOf(ad);
  const owner = PLATFORM_OWNER[ad.platform];
  const sentence: SentenceInput = {
    offer: ad.offer,
    platform: ad.platform,
    door: ad.door,
    area: areaWord(ad.area),
    street: read.business.street,
    budget: ad.budget,
    currency: ad.currency,
    endDay: ad.budget.mode === "total" ? ad.endDay : null,
    chips: "running",
    past: mode === "done",
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
      remove: DRAWER.confirm.remove(owner),
    },
    go: { copy: newAdFromRoute("copy", ad.id), again: newAdFromRoute("again", ad.id) },
  };
}
