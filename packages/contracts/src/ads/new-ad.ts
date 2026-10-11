/**
 * New ad's model (page-only): what the five steps have chosen so far (`AdDraft`, pre-filled by `newAdDefaults` or by
 * `newAdFrom` an ad), the draft drawn as an ad in review (`draftAd`, so the sentence, the preview and the reach line are the
 * drawer's own derivation), and everything a step says that depends on a choice (`newAdModel`): the sentence, the presets, the
 * estimate, the forecast, the label of the one press, what stops it, the rows of "Checked before turning on". Pure, like the
 * rest of the models; nothing is sent. What the account and the door need is derived from the account's checks
 * (rules.ts DOOR_NEEDS), never typed per example; what is read from the account, the Services and the platform's rules
 * (who the ad is shown as, the age floor, the checks) is new-ad-parts.ts's.
 */
import { appointmentWords } from "../journey/appointment-word";
import type { AppointmentWord } from "../journey/appointment-word";
import type { AdBudget, AdCopy, AdDoor, AdMedia, AdPlatform, AdRead, AdTheirs, AdsConfig, AdsRead } from "./ads";
import { addDays } from "./ads";
import { ADS_DEFAULT_CURRENCY, currencySymbol, moneyOf, perDayOf } from "./money";
import { adModel } from "./drawer";
import type { AdDrawerVM } from "./drawer";
import { earlierCost } from "./page";
import { ADS_DEFAULT_MILES, ADS_OWN_DAYS, ADS_OWN_START_MINOR } from "./rules";
import {
  agesOf,
  blockedFrom,
  budgetLines,
  checkedOf,
  opensOf,
  opensUrlOf,
  pathOf,
  scheduleOf,
  scheduleVM,
  searchOf,
  searchThemesFor,
  setForOf,
  shownAsFor,
  shownAsOf,
} from "./new-ad-parts";
import type { AgesVM, CheckedVM, OpensVM, ScheduleVM, SearchVM, SetForVM, ShownAsVM } from "./new-ad-parts";
import {
  adAccountOf,
  adServiceOf,
  areaWord,
  doorNeeds,
  firstReadyDoor,
  accountRows,
  platformsFor,
  sentenceParts,
  smallestPreset,
} from "./vm-base";
import type { DoorVM, SentencePart, StandRowVM } from "./vm-base";
import { PLATFORM_OWNER, REVIEW_WITHIN, dayShort, dayWord } from "./words";
import { DRAWER, PREVIEW } from "./words-drawer";
import type { ReachSaid } from "./words-drawer";
import { GOOGLE_SEARCH, NEW_AD } from "./words-new";

type Post = AdsRead["posts"][number];
type Preset = AdsConfig["presets"][number];

/** What New ad has chosen so far. `newAdDefaults` fills it; every press in a step changes one field. */
export interface AdDraft {
  door: AdDoor;
  platform: AdPlatform;
  serviceId: string;
  /** The post the ad is made from, or null for a photo (or a video) of the owner's own. */
  postId: string | null;
  postMode: "as-is" | "new-words";
  /** Meta: a photo, or a vertical video for Reels and Stories. TikTok's is always a video; Google's shows neither. */
  format: "photo" | "video";
  areaMiles: number;
  /** Whether the ad is about a job, a loan or a home: asked per ad, never inferred. */
  special: boolean;
  /** `total` is "For a set number of days"; `daily` is "Until I stop it". */
  mode: "total" | "daily";
  presetId: Preset["id"] | "own";
  /** The daily amount of "Your own amount", in minor units. */
  ownPerDayMinor: number;
  startWith: "ready" | "questions";
  /** Words typed over the drafted ones (the photo path); null keeps the drafted words. */
  headline: string | null;
  text: string | null;
  /** A name typed over the drafted one; null keeps `First appointment · 12 Oct`. */
  name: string | null;
  /** Google: the page the ad opens, the hosted one or the business's own site. */
  opens: "page" | "site";
  /** Only while the business is open. Meta can keep to it only with a total (`scheduleAllowed`), Google's call button always does. */
  schedule: "always" | "open-hours";
  /** Meta: "Let Meta adjust my photo and wording"; off, so the photo and words stay the owner's. */
  adjust: boolean;
  /** A form: "Ask them to double-check before sending". */
  doubleCheck: boolean;
  /** A form: the thank-you line promises a message within minutes (else it says they will hear back). */
  thanks: boolean;
  /** Meta: "Also run on Google" was pressed; once this one is on, the Google one is set up from it (`adFollowOn`). */
  alsoGoogle: boolean;
}

/** The newest post that can run on a platform as an ad: an Instagram post on Meta, a video on TikTok, none on Google. */
export function newestPostFor(posts: readonly Post[], platform: AdPlatform, kind?: Post["kind"]): Post | undefined {
  if (platform === "google") return undefined;
  return posts
    .filter((p) => p.platform === platform && (kind === undefined || p.kind === kind))
    .sort((a, b) => b.day.localeCompare(a.day))
    .at(0);
}

/** What a platform's ad shows to begin with: TikTok's is a video, Meta's a photo. */
const formatFor = (platform: AdPlatform): AdDraft["format"] => (platform === "tiktok" ? "video" : "photo");

/** The draft everything starts from: the top Service, the newest post that can run as an ad, 5 miles, the first door ready. */
function baseDraft(read: AdsRead): AdDraft {
  const door = firstReadyDoor(read);
  const platform = platformsFor(door).at(0) ?? "meta";
  const format = formatFor(platform);
  const post = newestPostFor(read.posts, platform, format);
  return {
    door,
    platform,
    serviceId: read.services.at(0)?.id ?? "",
    postId: post ? post.id : null,
    postMode: "as-is",
    format,
    areaMiles: ADS_DEFAULT_MILES,
    special: false,
    mode: "total",
    presetId: "own",
    ownPerDayMinor: ADS_OWN_START_MINOR,
    startWith: "ready",
    headline: null,
    text: null,
    name: null,
    opens: "page",
    schedule: "always",
    adjust: false,
    doubleCheck: true,
    thanks: false,
    alsoGoogle: false,
  };
}

/**
 * New ad opens already filled from the workspace: the top Service, the newest post that can run as an ad, 5 miles, the first
 * door whose needs are all met, and the smallest preset for a first ad.
 */
export function newAdDefaults(read: AdsRead, config: AdsConfig): AdDraft {
  const smallest = smallestPreset(config);
  return { ...baseDraft(read), presetId: smallest ? smallest.id : "own" };
}

/** The miles an ad's area is, where it is a circle. */
const milesOf = (ad: AdRead, fallback: number): number => (ad.area.kind === "radius" ? ad.area.miles : fallback);

/** What a copied ad shows: a video stays one, a post is what it was, else a photo. */
function formatOf(ad: AdRead, platform: AdPlatform, read: AdsRead): AdDraft["format"] {
  if (platform === "tiktok" || ad.media.kind === "video") return "video";
  const postId = ad.media.kind === "post" ? ad.media.postId : null;
  return read.posts.find((p) => p.id === postId)?.kind ?? "photo";
}

/**
 * New ad filled from an ad: a copy of it, to run it again once it has ended (both keep its door, platform, offer, area and
 * amount), or the same offer on Google's Call door (keeps its offer and area). The words of a copy are the ad's own, and the
 * name it opens with says where it came from.
 */
export function newAdFrom(ad: AdRead, how: "copy" | "again" | "google", read: AdsRead): AdDraft {
  const base = baseDraft(read);
  const service = adServiceOf(read, ad.serviceId);
  const onGoogle = how === "google";
  const platform: AdPlatform = onGoogle ? "google" : ad.platform;
  const postId = !onGoogle && ad.media.kind === "post" ? ad.media.postId : null;
  return {
    ...base,
    door: onGoogle ? "call" : ad.door,
    platform,
    serviceId: service ? service.id : base.serviceId,
    postId,
    format: onGoogle ? "photo" : formatOf(ad, platform, read),
    areaMiles: milesOf(ad, base.areaMiles),
    mode: onGoogle ? "total" : ad.budget.mode,
    presetId: "own",
    ownPerDayMinor: ad.aboutADayMinor,
    startWith: ad.copy.startWith,
    headline: onGoogle ? null : ad.copy.headline,
    text: onGoogle ? null : ad.copy.text,
    name: NEW_AD.from[how](ad.name),
    opens: ad.opensUrl !== null && ad.opensUrl === read.business.site ? "site" : "page",
    schedule: onGoogle ? "always" : ad.schedule,
    thanks: ad.copy.thanks === PREVIEW.thanksOn,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The draft as an ad

/** Every word an ad says of itself: its headline, text, chat, reply and thank-you, drafted from one Service and the business. */
export function starterCopy(o: {
  service: string;
  price: string;
  business: Pick<AdsRead["business"], "name" | "address" | "site" | "hours">;
  door: AdDoor;
  word: AppointmentWord;
}): AdCopy {
  const { service, price, business, door } = o;
  const w = appointmentWords(o.word);
  const priced = `${service}, ${price}`;
  const text: Record<AdDoor, string> = {
    whatsapp: `Book your first ${w.one} at ${business.name}. Message us on WhatsApp and we'll send you open times.`,
    call: `Call ${business.name} and we'll go through the open times.`,
    form: `Leave your number and ${business.name} will call you back with open times.`,
  };
  return {
    headline: priced,
    text: text[door],
    headlines: [priced, business.name, "Call to book"],
    lines: [
      `${service} at ${business.name}. Call and we'll go through the open times.`,
      `Open ${business.hours}. ${business.address}.`,
    ],
    path: `${business.site} › book`,
    greeting: `Hi! Thanks for getting in touch with ${business.name}. How can we help?`,
    ready: `Hi, I'd like to know more about ${service}`,
    questions: ["What is open this week?", `How much is ${service}?`, "Where are you?"],
    startWith: "ready",
    reply: `Hi, thanks for writing. First ${w.many} are open this week. Would Thursday or Friday suit you?`,
    thanks: PREVIEW.thanksOn,
  };
}

interface Plan {
  budget: AdBudget;
  perDayMinor: number;
  days: number;
  startDay: string;
  endDay: string;
}

/** The money and the days a draft says: it starts tomorrow, once the platform has checked it. */
function draftPlan(draft: AdDraft, read: AdsRead, config: AdsConfig): Plan {
  const preset = config.presets.find((p) => p.id === draft.presetId);
  const daily = preset ? preset.perDayMinor : draft.ownPerDayMinor;
  const days = preset ? preset.days : ADS_OWN_DAYS;
  const startDay = addDays(read.today, 1);
  const budget: AdBudget =
    draft.mode === "total" ? { mode: "total", amountMinor: daily * days } : { mode: "daily", amountMinor: daily };
  return { budget, perDayMinor: daily, days, startDay, endDay: addDays(startDay, days - 1) };
}

const draftService = (draft: AdDraft, read: AdsRead): AdsRead["services"][number] =>
  adServiceOf(read, draft.serviceId) ?? read.services.at(0) ?? { id: "", name: "", note: "" };

/** The ad's words, drafted from the Service; a post used as it is brings its own caption, a Google ad's path follows its page. */
function copyOf(draft: AdDraft, read: AdsRead, service: AdsRead["services"][number]): AdCopy {
  const base = starterCopy({
    service: service.name,
    price: service.note,
    business: read.business,
    door: draft.door,
    word: read.appointmentWord,
  });
  const post = read.posts.find((p) => p.id === draft.postId);
  const caption = post && draft.postMode === "as-is" ? post.caption : null;
  return {
    ...base,
    headline: draft.headline ?? base.headline,
    text: caption ?? draft.text ?? base.text,
    path: draft.platform === "google" ? pathOf(opensUrlOf(read, draft.opens)) : base.path,
    startWith: draft.startWith,
    thanks: draft.thanks ? PREVIEW.thanksOn : PREVIEW.thanksOff,
  };
}

/** The platform's own numbers of an ad that has not run: none read. */
function noTheirs(platform: AdPlatform): AdTheirs {
  if (platform === "google") return { platform, impressions: null, clicks: null, calls: null, longCalls: null };
  if (platform === "tiktok") return { platform, impressions: null, reach: null, clicks: null, leads: null };
  return { platform, impressions: null, reach: null, taps: null, chats: null, leads: null };
}

function mediaOf(draft: AdDraft): AdMedia {
  if (draft.platform === "google") return { kind: "none" };
  if (draft.postId !== null) return { kind: "post", postId: draft.postId };
  return draft.format === "video" ? { kind: "video", label: "", vertical: true } : { kind: "photo", label: "" };
}

/**
 * The draft as an ad in review, sent to the platform at the moment the page was read: what the ledger draws when Turn on is
 * pressed. Its id is the caller's (the composer's is a placeholder, the store gives the row its own).
 */
export function draftAd(draft: AdDraft, read: AdsRead, config: AdsConfig, id: string): AdRead {
  const plan = draftPlan(draft, read, config);
  const service = draftService(draft, read);
  const account = adAccountOf(read, draft.platform);
  const typed = draft.name === null ? "" : draft.name.trim();
  const google = draft.platform === "google";
  return {
    id,
    externalId: null,
    version: 1,
    name: typed || NEW_AD.name(service.name, dayShort(plan.startDay)),
    offer: service.name,
    serviceId: service.id,
    platform: draft.platform,
    door: draft.door,
    state: "review",
    needs: null,
    madeHere: true,
    startDay: plan.startDay,
    endDay: plan.endDay,
    endsAt: google ? NEW_AD.endsAtGoogle : null,
    budget: plan.budget,
    currency: account ? account.currency : ADS_DEFAULT_CURRENCY,
    aboutADayMinor: plan.perDayMinor,
    area: draft.platform === "tiktok" ? { kind: "zips", zips: [] } : { kind: "radius", miles: draft.areaMiles },
    schedule: scheduleOf(draft),
    shownAs: shownAsFor(read, draft.platform),
    media: mediaOf(draft),
    opensUrl: google ? opensUrlOf(read, draft.opens) : null,
    searchThemes: google ? searchThemesFor(service.name, read.appointmentWord) : [],
    leftOut: google ? [...GOOGLE_SEARCH.leftOut] : [],
    approvedDay: null,
    sentAt: read.readAt,
    theirs: noTheirs(draft.platform),
    reply: null,
    todaySoFar: 0,
    lastArrivalAt: null,
    copy: copyOf(draft, read, service),
    days: [],
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// What the steps say

/** One preset row of step 4. */
export interface PresetVM {
  id: Preset["id"];
  label: string;
  /** `about $15 a day for 20 days · up to $300 · ends Sat 31 Oct`; in "Until I stop it", without the days and the total. */
  rest: string;
  perDayMinor: number;
  days: number;
  totalMinor: number;
  endDay: string;
}

export interface NewAdVM {
  /** The draft as an ad in review. */
  ad: AdRead;
  /** The same ad as the drawer reads it: the preview, the forecast. A Meta video is drawn in the vertical frame. */
  drawer: AdDrawerVM;
  /** `First appointment · 12 Oct`: the name drafted, which a typed one replaces. */
  name: string;
  /** The ad as one sentence, filled in from the first step. */
  sentence: SentencePart[];
  presets: PresetVM[];
  /** What "Your own amount" would run as, once chosen (a preset's line without its label); null with no amount. */
  ownRest: string | null;
  /** The unit beside the box of "Your own amount": `$ a day`. */
  ownUnit: string;
  /** Under the presets: Meta's estimate (or that it can't give one yet), Google's; null for TikTok. */
  estimate: string | null;
  /** The earlier ads' cost, where 10 or more booked from them. */
  history: string | null;
  /** The budget step's quiet lines, from the platform. */
  lines: string[];
  /** Step 5's forecast: when it starts and what it can spend. */
  forecast: string;
  /** The foot's one press: `Turn on · up to $300`. */
  turnOn: string;
  /** What the door needs on the platform it runs on (step 1), derived from the account's checks. */
  needs: StandRowVM[];
  /** Step 2 on the Call door: where the ad opens. */
  opens: OpensVM | null;
  /** Step 2, under the preview: who the ad is shown as, and the door to change it. */
  shownAs: ShownAsVM;
  /** Step 2 on the Call door: what people search, and what is left out for the owner. */
  search: SearchVM | null;
  /** Step 3: the age floor, locked, with its why; null where the platform sets none (Google). */
  ages: AgesVM | null;
  /** Step 4, behind "More choices": only while the business is open. */
  schedule: ScheduleVM;
  /** What stops Turn on: an account not ready, or a need not met, with the door that mends it; null where nothing does. */
  blocked: { text: string; door: DoorVM } | null;
  ready: { tone: "ok" | "warn"; said: string; rows: StandRowVM[] };
  /** Step 5: "Checked before turning on" with its count. */
  checked: CheckedVM;
  /** Step 5: what Chanlytics set for the owner on this platform. */
  setFor: SetForVM;
  /** The most it can spend, in minor units; null with a daily amount. */
  totalMinor: number | null;
  perDayMinor: number;
  currency: string;
  days: number;
  startDay: string;
  endDay: string;
}

function presetsOf(draft: AdDraft, config: AdsConfig, o: { startDay: string; currency: string }): PresetVM[] {
  return config.presets.map((p): PresetVM => {
    const totalMinor = p.perDayMinor * p.days;
    const endDay = addDays(o.startDay, p.days - 1);
    const perDay = perDayOf(p.perDayMinor, o.currency);
    const rest =
      draft.mode === "total"
        ? NEW_AD.step4.preset({ perDay, days: p.days, total: moneyOf(totalMinor, o.currency), end: dayWord(endDay) })
        : NEW_AD.step4.presetDaily({ perDay });
    return { id: p.id, label: p.label, rest, perDayMinor: p.perDayMinor, days: p.days, totalMinor, endDay };
  });
}

/** What "Your own amount" runs as, said as a preset is. */
function ownRestOf(plan: Plan, currency: string): string | null {
  if (plan.perDayMinor <= 0) return null;
  const perDay = perDayOf(plan.perDayMinor, currency);
  if (plan.budget.mode === "daily") return NEW_AD.step4.presetDaily({ perDay });
  const total = moneyOf(plan.budget.amountMinor, currency);
  return NEW_AD.step4.preset({ perDay, days: plan.days, total, end: dayWord(plan.endDay) });
}

/** Meta's estimate of chats (or that it can't give one yet), Google's of clicks; TikTok gives none. */
function estimateOf(draft: AdDraft, config: AdsConfig, currency: string): string | null {
  if (draft.platform === "tiktok") return null;
  if (draft.platform === "google") {
    const g = config.googleEstimate;
    const [from, to] = g.perClickMinor;
    return NEW_AD.step4.googleEstimate({ clicks: g.clicks, from: moneyOf(from, currency), to: moneyOf(to, currency) });
  }
  const preset = config.presets.find((p) => p.id === draft.presetId);
  if (draft.mode !== "total" || !preset || !preset.estimate) return NEW_AD.step4.noEstimate;
  return NEW_AD.step4.estimate({ lo: preset.estimate[0], hi: preset.estimate[1], days: preset.days });
}

const reachLine = (said: ReachSaid): string => [said.state, ...said.parts].join(" · ");

function draftReady(draft: AdDraft, read: AdsRead, needs: readonly StandRowVM[]): NewAdVM["ready"] {
  const rows = accountRows(read, draft.platform);
  const bad = needs.find((r) => r.tone === "warn") ?? rows.find((r) => r.tone === "warn");
  if (bad) return { tone: "warn", said: reachLine(DRAWER.reach.needs(bad.text)), rows };
  return { tone: "ok", said: NEW_AD.step5.ready(NEW_AD.step5.readyParts[draft.platform].join(" · ")), rows };
}

/** The drawer's preview, with a Meta video drawn in the vertical frame (the platform's feed shapes are for a photo). */
function drawerOf(draft: AdDraft, ad: AdRead, read: AdsRead, config: AdsConfig): AdDrawerVM {
  const drawer = adModel(ad, read, config);
  if (draft.platform !== "meta" || draft.format !== "video") return drawer;
  return { ...drawer, preview: { ...drawer.preview, frame: "video", frames: [] } };
}

/** Everything the steps say that depends on what has been chosen. */
export function newAdModel(draft: AdDraft, read: AdsRead, config: AdsConfig): NewAdVM {
  const plan = draftPlan(draft, read, config);
  const ad = draftAd(draft, read, config, "new-ad");
  const owner = PLATFORM_OWNER[draft.platform];
  const within = REVIEW_WITHIN[draft.platform];
  const totalMinor = plan.budget.mode === "total" ? plan.budget.amountMinor : null;
  const say = (minor: number) => moneyOf(minor, ad.currency);
  const perDay = perDayOf(plan.perDayMinor, ad.currency);
  const earlier = earlierCost(read);
  const needs = doorNeeds(read, draft.door, draft.platform, {
    opens: draft.platform === "google" ? draft.opens : undefined,
    post: draft.platform === "tiktok" ? draft.postId !== null : undefined,
  });
  const ages = agesOf(draft, draftService(draft, read));
  const checked = checkedOf({ draft, ad, read, needs });
  return {
    ad,
    drawer: drawerOf(draft, ad, read, config),
    name: NEW_AD.name(ad.offer, dayShort(plan.startDay)),
    sentence: sentenceParts({
      offer: ad.offer,
      platform: draft.platform,
      door: draft.door,
      area: areaWord(ad.area),
      street: read.business.street,
      budget: plan.budget,
      currency: ad.currency,
      endDay: totalMinor === null ? null : plan.endDay,
      chips: "new",
    }),
    presets: presetsOf(draft, config, { startDay: plan.startDay, currency: ad.currency }),
    ownRest: ownRestOf(plan, ad.currency),
    ownUnit: NEW_AD.step4.ownUnit(currencySymbol(ad.currency)),
    estimate: estimateOf(draft, config, ad.currency),
    history: earlier ? NEW_AD.step4.history(earlier.each, earlier.people) : null,
    lines: budgetLines(draft, config, { perDay, currency: ad.currency }),
    forecast:
      totalMinor === null
        ? NEW_AD.step5.forecastDaily({ owner, within, perDay })
        : NEW_AD.step5.forecast({ owner, within, perDay, total: say(totalMinor), end: dayWord(plan.endDay) }),
    turnOn: totalMinor === null ? NEW_AD.turnOnDaily(perDay) : NEW_AD.turnOnTotal(say(totalMinor)),
    needs,
    opens: opensOf(draft, read),
    shownAs: shownAsOf(read, draft.platform),
    search: searchOf(ad, draft.platform),
    ages,
    schedule: scheduleVM(draft, read),
    blocked: blockedFrom(checked.rows),
    ready: draftReady(draft, read, needs),
    checked,
    setFor: setForOf({ draft, ad, read, ages }),
    totalMinor,
    perDayMinor: plan.perDayMinor,
    currency: ad.currency,
    days: plan.days,
    startDay: plan.startDay,
    endDay: plan.endDay,
  };
}
