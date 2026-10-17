import { appointmentWords } from "../journey/appointment-word.js";
import { addDays } from "./ads.js";
import { ADS_DEFAULT_CURRENCY, currencySymbol, moneyOf, perDayOf } from "./money.js";
import { adModel } from "./drawer.js";
import { earlierCost } from "./page.js";
import { ADS_DEFAULT_MILES, ADS_OWN_DAYS, ADS_OWN_START_MINOR } from "./rules.js";
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
  shownAsOf
} from "./new-ad-parts.js";
import {
  adAccountOf,
  adServiceOf,
  areaWord,
  doorNeeds,
  firstReadyDoor,
  accountRows,
  platformsFor,
  sentenceParts,
  smallestPreset
} from "./vm-base.js";
import { PLATFORM_OWNER, REVIEW_WITHIN, dayShort, dayWord } from "./words.js";
import { DRAWER, PREVIEW } from "./words-drawer.js";
import { GOOGLE_SEARCH, NEW_AD } from "./words-new.js";
export function newestPostFor(posts, platform, kind) {
  if (platform === "google") return void 0;
  return posts.filter((p) => p.platform === platform && (kind === void 0 || p.kind === kind)).sort((a, b) => b.day.localeCompare(a.day)).at(0);
}
const formatFor = (platform) => platform === "tiktok" ? "video" : "photo";
function baseDraft(read) {
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
    alsoGoogle: false
  };
}
export function newAdDefaults(read, config) {
  const smallest = smallestPreset(config);
  return { ...baseDraft(read), presetId: smallest ? smallest.id : "own" };
}
const milesOf = (ad, fallback) => ad.area.kind === "radius" ? ad.area.miles : fallback;
function formatOf(ad, platform, read) {
  if (platform === "tiktok" || ad.media.kind === "video") return "video";
  const postId = ad.media.kind === "post" ? ad.media.postId : null;
  return read.posts.find((p) => p.id === postId)?.kind ?? "photo";
}
export function newAdFrom(ad, how, read) {
  const base = baseDraft(read);
  const service = adServiceOf(read, ad.serviceId);
  const onGoogle = how === "google";
  const platform = onGoogle ? "google" : ad.platform;
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
    thanks: ad.copy.thanks === PREVIEW.thanksOn
  };
}
export function starterCopy(o) {
  const { service, price, business, door } = o;
  const w = appointmentWords(o.word);
  const priced = `${service}, ${price}`;
  const text = {
    whatsapp: `Book your first ${w.one} at ${business.name}. Message us on WhatsApp and we'll send you open times.`,
    call: `Call ${business.name} and we'll go through the open times.`,
    form: `Leave your number and ${business.name} will call you back with open times.`
  };
  return {
    headline: priced,
    text: text[door],
    headlines: [priced, business.name, "Call to book"],
    lines: [
      `${service} at ${business.name}. Call and we'll go through the open times.`,
      `Open ${business.hours}. ${business.address}.`
    ],
    path: `${business.site} \u203A book`,
    greeting: `Hi! Thanks for getting in touch with ${business.name}. How can we help?`,
    ready: `Hi, I'd like to know more about ${service}`,
    questions: ["What is open this week?", `How much is ${service}?`, "Where are you?"],
    startWith: "ready",
    reply: `Hi, thanks for writing. First ${w.many} are open this week. Would Thursday or Friday suit you?`,
    thanks: PREVIEW.thanksOn
  };
}
function draftPlan(draft, read, config) {
  const preset = config.presets.find((p) => p.id === draft.presetId);
  const daily = preset ? preset.perDayMinor : draft.ownPerDayMinor;
  const days = preset ? preset.days : ADS_OWN_DAYS;
  const startDay = addDays(read.today, 1);
  const budget = draft.mode === "total" ? { mode: "total", amountMinor: daily * days } : { mode: "daily", amountMinor: daily };
  return { budget, perDayMinor: daily, days, startDay, endDay: addDays(startDay, days - 1) };
}
const draftService = (draft, read) => adServiceOf(read, draft.serviceId) ?? read.services.at(0) ?? { id: "", name: "", note: "" };
function copyOf(draft, read, service) {
  const base = starterCopy({
    service: service.name,
    price: service.note,
    business: read.business,
    door: draft.door,
    word: read.appointmentWord
  });
  const post = read.posts.find((p) => p.id === draft.postId);
  const caption = post && draft.postMode === "as-is" ? post.caption : null;
  return {
    ...base,
    headline: draft.headline ?? base.headline,
    text: caption ?? draft.text ?? base.text,
    path: draft.platform === "google" ? pathOf(opensUrlOf(read, draft.opens)) : base.path,
    startWith: draft.startWith,
    thanks: draft.thanks ? PREVIEW.thanksOn : PREVIEW.thanksOff
  };
}
function noTheirs(platform) {
  if (platform === "google") return { platform, impressions: null, clicks: null, calls: null, longCalls: null };
  if (platform === "tiktok") return { platform, impressions: null, reach: null, clicks: null, leads: null };
  return { platform, impressions: null, reach: null, taps: null, chats: null, leads: null };
}
function mediaOf(draft) {
  if (draft.platform === "google") return { kind: "none" };
  if (draft.postId !== null) return { kind: "post", postId: draft.postId };
  return draft.format === "video" ? { kind: "video", label: "", vertical: true } : { kind: "photo", label: "" };
}
export function draftAd(draft, read, config, id) {
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
    days: []
  };
}
function presetsOf(draft, config, o) {
  return config.presets.map((p) => {
    const totalMinor = p.perDayMinor * p.days;
    const endDay = addDays(o.startDay, p.days - 1);
    const perDay = perDayOf(p.perDayMinor, o.currency);
    const rest = draft.mode === "total" ? NEW_AD.step4.preset({ perDay, days: p.days, total: moneyOf(totalMinor, o.currency), end: dayWord(endDay) }) : NEW_AD.step4.presetDaily({ perDay });
    return { id: p.id, label: p.label, rest, perDayMinor: p.perDayMinor, days: p.days, totalMinor, endDay };
  });
}
function ownRestOf(plan, currency) {
  if (plan.perDayMinor <= 0) return null;
  const perDay = perDayOf(plan.perDayMinor, currency);
  if (plan.budget.mode === "daily") return NEW_AD.step4.presetDaily({ perDay });
  const total = moneyOf(plan.budget.amountMinor, currency);
  return NEW_AD.step4.preset({ perDay, days: plan.days, total, end: dayWord(plan.endDay) });
}
function estimateOf(draft, config, currency) {
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
const reachLine = (said) => [said.state, ...said.parts].join(" \xB7 ");
function draftReady(draft, read, needs) {
  const rows = accountRows(read, draft.platform);
  const bad = needs.find((r) => r.tone === "warn") ?? rows.find((r) => r.tone === "warn");
  if (bad) return { tone: "warn", said: reachLine(DRAWER.reach.needs(bad.text)), rows };
  return { tone: "ok", said: NEW_AD.step5.ready(NEW_AD.step5.readyParts[draft.platform].join(" \xB7 ")), rows };
}
function drawerOf(draft, ad, read, config) {
  const drawer = adModel(ad, read, config);
  if (draft.platform !== "meta" || draft.format !== "video") return drawer;
  return { ...drawer, preview: { ...drawer.preview, frame: "video", frames: [] } };
}
export function newAdModel(draft, read, config) {
  const plan = draftPlan(draft, read, config);
  const ad = draftAd(draft, read, config, "new-ad");
  const owner = PLATFORM_OWNER[draft.platform];
  const within = REVIEW_WITHIN[draft.platform];
  const totalMinor = plan.budget.mode === "total" ? plan.budget.amountMinor : null;
  const say = (minor) => moneyOf(minor, ad.currency);
  const perDay = perDayOf(plan.perDayMinor, ad.currency);
  const earlier = earlierCost(read);
  const needs = doorNeeds(read, draft.door, draft.platform, {
    opens: draft.platform === "google" ? draft.opens : void 0,
    post: draft.platform === "tiktok" ? draft.postId !== null : void 0
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
      chips: "new"
    }),
    presets: presetsOf(draft, config, { startDay: plan.startDay, currency: ad.currency }),
    ownRest: ownRestOf(plan, ad.currency),
    ownUnit: NEW_AD.step4.ownUnit(currencySymbol(ad.currency)),
    estimate: estimateOf(draft, config, ad.currency),
    history: earlier ? NEW_AD.step4.history(earlier.each, earlier.people) : null,
    lines: budgetLines(draft, config, { perDay, currency: ad.currency }),
    forecast: totalMinor === null ? NEW_AD.step5.forecastDaily({ owner, within, perDay }) : NEW_AD.step5.forecast({ owner, within, perDay, total: say(totalMinor), end: dayWord(plan.endDay) }),
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
    endDay: plan.endDay
  };
}
