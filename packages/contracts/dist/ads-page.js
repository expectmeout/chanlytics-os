// src/ads/rules.ts
var ADS_WINDOW_DAYS = 30;
var ADS_FRESH_DAYS = 3;
var ADS_SETTLE_DAYS = 14;
var TOO_EARLY_DAYS = 7;
var ADS_ASK_MIN = 10;
var ADS_ASK_MIN_CALLS = 20;
var ADS_ASK_SOON_DAYS = 3;
var ADS_EXTEND_MAX_DAYS = 30;
var ADS_MOVE_DAYS = 14;
var ADS_MOVE_STEP_MINOR = 500;
var ADS_CHANCE_Z = 1.96;
var ADS_OWN_DAYS = 14;
var ADS_OWN_START_MINOR = 1e3;
var ADS_DEFAULT_MILES = 5;
var ADS_TOTAL_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];
var ADS_DAILY_CHOICES_MINOR = [500, 1e3, 1500, 2500, 4e3];
var ADS_END_SHIFTS = [-7, 7, 14, 30];
var ADS_SPECIAL_MILES = 15;
var ADS_DISPLAY_NAME_MAX = 20;
var ADS_ZIP_DIGITS = 5;
var ADS_COPY_LIMITS = { headlineFacebook: 27, headlineInstagram: 40, textInstagram: 125, near: 0.8 };
var BUDGET_RULES = {
  meta: { maxStep: null, waitDays: 0, totalMaxDays: null, dailyIsAverage: true, changeRelearns: true },
  google: { maxStep: null, waitDays: 0, totalMaxDays: 90, dailyIsAverage: true, changeRelearns: true },
  tiktok: { maxStep: 0.3, waitDays: 2, totalMaxDays: null, dailyIsAverage: false, changeRelearns: true }
};
var SCHEDULE_NEEDS_TOTAL = { meta: true, google: false, tiktok: false };
var DOOR_NEEDS = {
  whatsapp: { meta: ["page-linked", "whatsapp-linked", "payment", "chanlytics-whatsapp"] },
  call: { google: ["account-active", "payment", "number-on-page", "call-reporting", "verification"] },
  form: {
    meta: ["page-linked", "payment", "lead-terms", "privacy-link", "yes-line"],
    tiktok: ["tiktok-linked", "payment", "identity", "privacy-link", "yes-line"]
  }
};
var STANDING_CHECKS = {
  meta: ["account-active", "payment", "page-linked", "whatsapp-linked", "instagram-linked", "chanlytics-whatsapp"],
  google: ["account-active", "payment", "number-on-page", "call-reporting"],
  tiktok: ["tiktok-linked", "payment", "privacy-link"]
};
var ADS_PERMISSION_WARN_DAYS = 7;
var ADS_SOFT_NEEDS = ["price-changed", "permission-lapsing"];
var countedDoor = (door) => door !== "call";
var ADS_GROUP_FROM = 7;
var ADS_AGE_FLOOR = 18;
var ADS_AGE_FLOOR_COSMETIC = 25;
var ADS_GOOGLE_HEADLINE_MAX = 30;
var ADS_GOOGLE_DESCRIPTION_MAX = 90;
var ADS_GOOGLE_NAME_MAX = 25;
var ADS_GOOGLE_DAILY = { day: 2, month: 30.4 };
var ADS_CALL_SECONDS = 60;
var ADS_LEAD_DAYS = 7;

// src/shared/time.ts
var MIN_MS = 6e4;
var HOUR_MS = 36e5;
var DAY_MS = 864e5;
var WEEK_MS = 7 * DAY_MS;
function formatterOnUse(locales, options) {
  let built = null;
  return { format: (date) => (built ??= new Intl.DateTimeFormat(locales, options)).format(date) };
}
var FORMATS_KEPT = 256;
var NUMBER_FORMATS = /* @__PURE__ */ new Map();
function formatterKept(cache, key, make) {
  const hit = cache.get(key);
  if (hit) return hit;
  const made = make();
  if (cache.size >= FORMATS_KEPT) cache.clear();
  cache.set(key, made);
  return made;
}
function numberFormat(locales, options) {
  return formatterKept(
    NUMBER_FORMATS,
    `${locales}|${JSON.stringify(options)}`,
    () => new Intl.NumberFormat(locales, options)
  );
}
var DATE_FMT = formatterOnUse([], { month: "short", day: "numeric" });
function isoMs(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

// src/ads/ads.ts
var MINOR_PER_UNIT = 100;
var atNoon = (iso) => Date.parse(`${iso}T12:00:00Z`);
function addDays(iso, n) {
  return new Date(atNoon(iso) + n * DAY_MS).toISOString().slice(0, 10);
}
var daysBetween = (a, b) => Math.round((atNoon(b) - atNoon(a)) / DAY_MS);
function aboutADayAfter(o) {
  const { ad, amountMinor, endDay, today } = o;
  if (ad.budget.mode === "daily") return amountMinor;
  const spent = ad.days.reduce((all, d) => all + d.spendMinor, 0);
  const daysLeft = Math.max(1, daysBetween(today, endDay) + 1);
  const units = Math.max(0, Math.round((amountMinor - spent) / daysLeft / MINOR_PER_UNIT));
  return units * MINOR_PER_UNIT;
}
function sameArea(a, b) {
  if (a.kind === "radius" && b.kind === "radius") return a.miles === b.miles;
  return a.kind === "zips" && b.kind === "zips" && a.zips.join(",") === b.zips.join(",");
}
var saidWords = (c) => JSON.stringify([c.headline, c.text, c.headlines, c.lines]);
function patchRestarts(ad, patch) {
  const offer = patch.serviceId !== void 0 && patch.serviceId !== ad.serviceId;
  const area = patch.area !== void 0 && !sameArea(patch.area, ad.area);
  const words = patch.copy !== void 0 && saidWords(patch.copy) !== saidWords(ad.copy);
  return offer || area || words || patch.photo === true || ad.needs?.code === "rejected";
}

// src/ads/money.ts
var ADS_DEFAULT_CURRENCY = "USD";
function shown(units, currency, digits) {
  return numberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(units);
}
function moneyOf(minor, currency) {
  const units = minor / MINOR_PER_UNIT;
  if (Number.isInteger(units) || units >= 10) return shown(Math.round(units), currency, 0);
  return shown(units, currency, 2);
}
var perDayOf = (minor, currency) => `${moneyOf(minor, currency)} a day`;
var leftOfMoney = (left, total, currency) => `${moneyOf(left, currency)} left of ${moneyOf(total, currency)}`;
function currencySymbol(currency) {
  const parts = numberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(
    0
  );
  return parts.find((p) => p.type === "currency")?.value ?? currency;
}
var minorOfUnits = (units) => units * MINOR_PER_UNIT;
function sumsOf(items) {
  const sums = /* @__PURE__ */ new Map();
  for (const i of items) sums.set(i.currency, (sums.get(i.currency) ?? 0) + i.minor);
  return [...sums].map(([currency, minor]) => ({ currency, minor }));
}
function sumMoney(items) {
  const sums = sumsOf(items);
  if (sums.length === 0) return moneyOf(0, ADS_DEFAULT_CURRENCY);
  return sums.map((s) => moneyOf(s.minor, s.currency)).join(" + ");
}

// src/shared/words.ts
var plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
var capitalize = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
var joinWords = (items) => items.length <= 1 ? items[0] ?? "" : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

// src/ads/words.ts
var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var dayParts = (iso) => {
  const d = /* @__PURE__ */ new Date(`${iso}T12:00:00Z`);
  return { dow: DOW[d.getUTCDay()] ?? "", mon: MON[d.getUTCMonth()] ?? "", date: d.getUTCDate() };
};
function dayWord(iso) {
  const p = dayParts(iso);
  return `${p.dow} ${p.date} ${p.mon}`;
}
function dayLines(iso) {
  const p = dayParts(iso);
  return [p.dow, `${p.date} ${p.mon}`];
}
function dayShort(iso) {
  const p = dayParts(iso);
  return `${p.date} ${p.mon}`;
}
var daysWord = (n) => n <= 0 ? "today" : plural(n, "day");
var peopleWord = (n) => plural(n, "person", "people");
var allWord = (n) => `All ${n}`;
function adPersonInitials(name) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("");
}
var ADS_DOORS = { accounts: "admin/integrations", people: "reports/people" };
var SETTINGS_DOOR = "Open Settings \u203A Connections";
var PLATFORM_WORD = {
  meta: "Facebook and Instagram",
  google: "Google",
  tiktok: "TikTok"
};
var PLATFORM_OWNER = { meta: "Meta", google: "Google", tiktok: "TikTok" };
var PLATFORM_SURFACE = {
  meta: "Facebook and Instagram",
  google: "Google Search",
  tiktok: "TikTok"
};
var REVIEW_WITHIN = {
  meta: "usually within a day",
  google: "usually within a business day",
  tiktok: "usually within a day"
};
var DOOR = {
  whatsapp: {
    label: "Message you on WhatsApp",
    line: "They tap the ad and a chat opens with your receptionist.",
    runsOn: "Runs on Facebook and Instagram.",
    glyph: "chat",
    unit: "wrote",
    did: "wrote",
    short: "WhatsApp",
    chip: "message you on WhatsApp"
  },
  call: {
    label: "Call you",
    line: "They tap Call and your phone rings. Your receptionist answers.",
    runsOn: "Runs on Google.",
    glyph: "phone",
    unit: "calls \xB7 Google's count",
    did: "called",
    short: "calls",
    chip: "call you"
  },
  form: {
    label: "Leave their number",
    line: "They fill in a short form. You get a name and a number to call back.",
    runsOn: "Runs on Facebook, Instagram or TikTok.",
    glyph: "list",
    unit: "left a number",
    did: "left a number",
    short: "a form",
    chip: "leave their number"
  }
};
var DOOR_ORDER = ["whatsapp", "call", "form"];
var CHECK_LABEL = {
  "account-active": "Ad account active",
  payment: "Payment method",
  "page-linked": "Facebook Page linked",
  "whatsapp-linked": "WhatsApp number linked to the Page",
  "instagram-linked": "Instagram account linked",
  "chanlytics-whatsapp": "Chanlytics WhatsApp connected",
  "number-on-page": "Your number is on your website as text",
  "call-reporting": "Call reporting on",
  verification: "Advertiser verification",
  "tiktok-linked": "TikTok account linked",
  "privacy-link": "Privacy page link added",
  "yes-line": "Your yes line approved",
  "lead-terms": "Lead ads terms accepted",
  identity: "TikTok identity linked",
  "post-permission": "Post permission",
  "manager-link": "Chanlytics linked as your manager"
};
var CHECK_LABEL_ON = {
  meta: { payment: "Payment method in Meta" },
  google: { "account-active": "Google Ads account active", payment: "A card added in Google Ads" },
  tiktok: { "account-active": "TikTok ad account active", payment: "Payment method in TikTok" }
};
function checkWords(id, platform) {
  return CHECK_LABEL_ON[platform][id] ?? CHECK_LABEL[id];
}
var CHECK_FIX = {
  "account-active": "Get your ad account active again",
  payment: "Add a payment method",
  "page-linked": "Link your Facebook Page",
  "whatsapp-linked": "Link your WhatsApp number to the Page",
  "instagram-linked": "Link your Instagram account",
  "chanlytics-whatsapp": "Connect Chanlytics WhatsApp",
  "number-on-page": "Put your number on your website as text",
  "call-reporting": "Turn call reporting on",
  verification: "Finish Google's advertiser verification",
  "tiktok-linked": "Link your TikTok account",
  "privacy-link": "Add your privacy page link",
  "yes-line": "Get your yes line approved",
  "lead-terms": "Accept the lead ads terms",
  identity: "Link your TikTok identity",
  "post-permission": "Renew your post permission",
  "manager-link": "Accept Chanlytics as your manager"
};
var PAYMENT_FIX = {
  meta: "Add a payment method in Meta",
  google: "Add a card in Google Ads",
  tiktok: "Add balance in TikTok"
};
var checkFix = (id, platform) => id === "payment" ? PAYMENT_FIX[platform] : CHECK_FIX[id];
var REACH_NOTE = {
  whatsapp: "WhatsApp linked",
  callChecking: "your number is being checked",
  callApproved: "your number is approved",
  form: { meta: "Page and number linked", google: "number linked", tiktok: "TikTok account linked" },
  /** When the last person got in touch, said by its day (`9:02 AM today`, `Fri 9 Oct`): a number on a form, a message on WhatsApp. */
  lastNumber: (when) => `last number arrived ${when}`,
  lastMessage: (when) => `last message arrived ${when}`
};
var STATE_WORD = {
  "setting-up": "Setting up",
  "couldnt-finish": "Couldn't finish",
  review: "In review",
  on: "On",
  paused: "Paused",
  "too-early": "Too early to judge",
  "needs-you": "Needs you",
  ended: "Ended",
  finished: "Finished"
};
var STATE = {
  reviewSecond: (p) => `${PLATFORM_OWNER[p]} is checking it, ${REVIEW_WITHIN[p]}`,
  settingUpSecond: (p) => `Chanlytics is making it on ${PLATFORM_OWNER[p]}, paused`,
  couldntSecond: (p) => `Paused on ${PLATFORM_OWNER[p]} \xB7 nothing spent`,
  /** When it ends: today, tomorrow (in the evening where the platform ends it at a time), or the day. */
  endsWhen: (o) => {
    if (o.kind === "later") return o.day;
    if (o.kind === "today") return o.evening ? "this evening" : "today";
    return o.evening ? "tomorrow evening" : "tomorrow";
  },
  ends: (when) => `Ends ${when}`,
  daily: (perDayText) => `No end date \xB7 about ${perDayText}`,
  endedSecond: (day, booked, each) => `Ended ${day} \xB7 ${booked} booked${each ? `, ${each} each` : ""}`,
  finishedSecond: (total) => `Spent its ${total}`,
  needsPayment: (p) => PAYMENT_FIX[p],
  needsRejected: (p) => `${PLATFORM_OWNER[p]} turned it down`,
  needsDefault: (p) => `${PLATFORM_OWNER[p]} needs something from you`,
  needsPaused: (p) => `Paused in ${PLATFORM_OWNER[p]}, not here`,
  needsPrice: "Your price changed in Services",
  needsPermission: (p) => `${PLATFORM_OWNER[p]}'s permission to use the post is ending`
};
var GATE = {
  turnOn: "turn on an ad",
  change: "change an ad",
  end: "end an ad",
  again: "run an ad again",
  resume: "turn an ad back on",
  pause: "pause an ad"
};
var REFUSED = {
  stale: "This ad changed since you opened it. Look again.",
  gone: "This ad isn't here any more.",
  adopted: "This ad was made on the platform itself. Here you can pause it and turn it back on.",
  maximum: "The most this can spend changed. Look again."
};
var SENTENCE = {
  show: "Show ",
  /** An ad that has ended reads in the past. */
  showed: "Showed ",
  soPast: {
    whatsapp: "messaged you on WhatsApp",
    call: "called you",
    form: "left their number"
  },
  on: " on ",
  /** What comes before the area chip. */
  reach: {
    meta: " to people within ",
    google: " to people who live or are within ",
    tiktok: " to people in "
  },
  of: (street) => ` of ${street}`,
  so: "so they ",
  upTo: "up to ",
  inAllUntil: " in all until ",
  about: "about ",
  untilStop: ", until you stop it",
  blank: "___",
  /** Shown once, above the sentence, the first time it is opened. */
  tapHint: "Tap any highlighted word to change it"
};
var ADS_EXAMPLES = [
  "running",
  "needs-you",
  "finished",
  "no-calendar",
  "setting-up",
  "no-ads",
  "choose",
  "v0",
  "reading",
  "failed"
];
var EXAMPLE = {
  /** The pill's word. */
  pill: "Example",
  note: "Example data. Nothing here is real.",
  label: "Choose the example",
  choices: {
    running: "Ads running",
    "needs-you": "Some ads need you",
    finished: "Finished and ended",
    "no-calendar": "No calendar link",
    "setting-up": "Turning on, and one that couldn't finish",
    "no-ads": "Connected, no ads yet",
    choose: "Choosing an ad account",
    v0: "Today, nothing connected (v0)",
    reading: "Reading the accounts",
    failed: "Could not read Meta"
  }
};

// src/ads/words-page.ts
var HEAD = {
  window: "Last 30 days",
  /** Under the head, desk and phone. */
  money: "Charged to your card by each platform, never through Chanlytics. Pause an ad and nothing more is spent.",
  noAds: "No ads yet.",
  v0Strong: "Ads",
  v0Rest: " bring new people to your receptionist.",
  booked: (booked, of) => ({
    strong: `${booked} of ${of}`,
    rest: " new people from your ads have booked."
  }),
  /** With no calendar link, the booked half waits. */
  touchOnly: (n) => ({ strong: `${n}`, rest: " new people got in touch through your ads." }),
  read: (time) => `Last 30 days \xB7 read ${time}`,
  v0Read: (since) => `Last 30 days \xB7 counted from ${since}`,
  /** The pane line while an account is being read: `Reading Meta and Google…`. */
  reading: (list) => `Reading ${list}\u2026`,
  accounts: "Accounts",
  newAd: "New ad",
  ask: "Ask"
};
var ADS_READ = {
  failed: (owner, when) => when === null ? `${owner}'s numbers could not be read` : `${owner}'s numbers could not be read \xB7 as of ${when}`,
  again: "Try again"
};
var STANDING = {
  connected: "Connected",
  needsYou: "Needs you",
  off: "Not connected yet",
  /** An account that has to be chosen, and one whose access has lapsed. */
  choose: "Choose an account",
  lapsed: "Needs connecting again",
  account: (name, time) => `${name} \xB7 read ${time}`,
  reading: (name) => `${name} \xB7 reading now`,
  failed: (name, when) => `${name} \xB7 could not be read, last read ${when}`,
  charged: (p) => `Charged to your card by ${PLATFORM_OWNER[p]}. Chanlytics never holds your ad money.`,
  door: "Open in Settings \u203A Connections",
  /** The post permission turns amber 7 days before it lapses. */
  permission: (day) => `Post permission runs to ${day}`,
  /** An account that is connected but whose last read failed. */
  unread: "Could not be read"
};
function figureWords(c) {
  return {
    spent: {
      label: "Spent",
      def: `What Facebook and Instagram, Google and TikTok charged for these ads, as they report it. Read ${c.readAt}. Can change for a day or two.`
    },
    touch: {
      label: "Got in touch",
      def: "New people who first wrote or left a number through one of these ads. A person is counted once, for the ad they first got in touch through. People you already knew are not counted. Calls are Google's count and are not included."
    },
    booked: {
      label: "Booked",
      def: `Of those people, how many have ${c.a} on your calendar that starts after they first got in touch and is not cancelled (ahead, kept, missed or past). A later message never un-books them. Calendar read ${c.calendarRead}.`
    },
    each: {
      label: "For each person who booked",
      def: `What the platforms charged on the days those people first got in touch, divided by the people who have since booked. Shown from 5 booked. Not counted: calls (Google's count, not matched to people yet), people you already knew, ${c.many} Chanlytics could not match to a person, and WhatsApp message fees, which WhatsApp bills you separately. The last two weeks are still settling, so this can only come down.`
    }
  };
}
var FIGURES = {
  /** After the cost, while the last two weeks settle. */
  soFar: "so far",
  spentMeta: (ads) => `across ${plural(ads, "ad")} \xB7 as the platforms report it`,
  touchMeta: (wrote, left) => `${wrote} wrote \xB7 ${left} left a number`,
  bookedMeta: (of) => `of ${of} \xB7 counted by Chanlytics`,
  eachMeta: (spent, n) => `${spent} / ${peopleWord(n)} \xB7 calls not included`,
  /** No calendar link: Booked waits, and the cost falls back to people in touch. */
  needsLink: "Add a calendar link under Settings \u203A Business to see who booked.",
  eachInTouchLabel: "For each person in touch",
  eachInTouchMeta: (spent, n) => `${spent} / ${peopleWord(n)}`,
  callsNotMatched: "Calls aren't matched to people yet",
  /** Under a dash of Spent or of the cost for each person while a platform is read: `reading Meta and Google`. */
  reading: (list) => `reading ${list}`,
  /** Under Spent while a platform's last read failed: the sum holds its last numbers. */
  spentMetaStale: (ads, owner, when) => `across ${plural(ads, "ad")} \xB7 ${owner}${when === null ? "" : ` as of ${when}`}`,
  /** The door that mends a missing calendar link: the calendar is set under Settings › Business. */
  linkDoor: "Open Settings \u203A Business"
};
var COUNTED = {
  quiet: (time) => `Spend is as each platform reports it, read ${time}, and can change for a day or two.`,
  door: "How this is counted",
  title: "How this is counted",
  fees: "WhatsApp message fees are billed separately by WhatsApp and are not in these numbers.",
  calls: "Calls are Google's count and nothing more. They are left out of Got in touch, Booked and the cost for each person, because Chanlytics can't tell which calls came from an ad yet.",
  /** How long what is counted here is kept (decision 0049). */
  kept: "Chanlytics keeps each platform's daily numbers for 25 months, and the click that brought a person for 90 days.",
  /** While a platform is read, the line under the figures says so. */
  reading: "Spend and the cost for each person appear as each platform is read.",
  /** The door beside "How this is counted" that opens the Results sheet. */
  results: "Results"
};
var LEDGER = {
  heads: { ad: "Ad", spent: "Spent", touch: "In touch", booked: "Booked", each: "Each", state: "State" },
  none: "\u2014",
  /** Why a review ad's numbers are dashes. */
  notStarted: "Nothing is spent until it is approved.",
  notMatched: "not matched yet",
  only: (n) => `only ${n}`,
  noneYet: "none yet",
  tooFew: "too few to read a cost",
  hint: (o) => `${o.lead} \xB7 about ${o.perDay} \xB7 ${o.tail}`,
  since: (day) => `since ${day}`,
  /** Under an ad that has not run yet and is not in review: when it would start. */
  starts: (day) => `starts ${day}`,
  /** Under an ad the platform has: who it was sent to, and when (`today`, or the day). */
  sentTo: (owner, when) => `sent to ${owner} ${when}`,
  each: (cost) => `${cost} each`,
  booked: (n) => `${n} booked`,
  calls: (n) => plural(n, "call"),
  googleCount: "Google's count",
  waiting: (n) => `${peopleWord(n)} from your ads ${n === 1 ? "is" : "are"} waiting on you`,
  /** Under the spend of an ad on a platform whose last read failed: the number is the last one read. */
  asOf: (when) => `as of ${when}`,
  /** Why a number waits while its platform is read, and the short word under the dash. */
  reading: (owner) => `Reading ${owner} now.`,
  readingUnit: "reading",
  /** An ad the owner made on the platform itself leads its hint with where. */
  madeIn: {
    meta: "Made in Meta Ads Manager",
    google: "Made in Google Ads",
    tiktok: "Made in TikTok Ads Manager"
  }
};
var GROUP = {
  label: "Group",
  door: "By what they ask",
  platform: "By platform"
};
function groupMeta(o) {
  const ads = plural(o.ads, "ad");
  if (o.people === null || o.people === 0) return ads;
  if (o.door === "whatsapp") return `${ads} \xB7 ${o.people} new people wrote`;
  if (o.door === "call") return `${ads} \xB7 ${plural(o.people, "call")} \xB7 Google's count`;
  return `${ads} \xB7 ${o.people} left a number`;
}
function platformMeta(o) {
  const ads = plural(o.ads, "ad");
  if (o.people === null || o.people === 0) return ads;
  if (o.platform === "google") return `${ads} \xB7 ${plural(o.people, "call")} \xB7 Google's count`;
  return `${ads} \xB7 ${o.people} new people in touch`;
}
var ASK = {
  not: "Not now",
  /** The press on an ad that needs fixing opens it. */
  open: "Fix it",
  extendPress: (more) => `Keep it going \xB7 ${more} more`,
  extend: (o) => `${o.name} ends ${o.when}. ${o.brought} Keep it going to ${o.end}? ${o.owner}'s total for it goes from ${o.from} to ${o.to}.`,
  extendShort: (name, when) => `${name} ends ${when}. Keep it going?`,
  broughtPeople: (n) => `${peopleWord(n)} ${n === 1 ? "has" : "have"} booked from it.`,
  broughtCalls: (n) => `Google counted ${plural(n, "call")} from it.`,
  extendConfirm: (o) => `Keeps ${o.name} running to ${o.end}, about ${o.perDay}. ${o.owner}'s total for this ad goes from ${o.from} to ${o.to}, so up to ${o.more} more can be spent. Nothing else changes.`,
  extendToast: (name, end) => `${name} now runs to ${end}`,
  /** The ad's name, then what is wrong with it, said as the rest of a sentence (`ASK_WHY`). */
  fix: (name, why) => `${name} ${why}.`,
  fixShort: (name, why) => `${name} ${why}. Fix it?`,
  movePress: (amount) => `Move ${amount} a day`,
  move: (o) => `${o.cheap} books at ${o.cheapEach} (${o.cheapN} people), ${o.dear} at ${o.dearEach} (${o.dearN} people), a gap larger than chance would give. Move ${o.amount} a day to ${o.cheap} until ${o.end}? Your total stays ${o.all} a day.`,
  /** `one` is the workspace's appointment word: `appointment`. */
  moveShort: (cheap, one) => `${cheap} costs less for each ${one}. Move some money to it?`,
  moveConfirm: (o) => `Moves ${o.amount} a day from ${o.dear} to ${o.cheap} until ${o.end}. Neither ad's end date changes, and together they still spend the same each day.`,
  moveToast: (cheap, amount) => `Moved ${amount} a day to ${cheap}`
};
var ASK_WHY = {
  rejected: (owner) => `was turned down by ${owner}`,
  payment: (owner) => `stopped: ${owner} couldn't charge your card`,
  "paused-in-platform": (owner) => `is paused in ${owner}, not here`,
  "price-changed": () => "still says an old price",
  "permission-lapsing": (owner) => `will lose ${owner}'s permission to use its post`,
  "number-check": (owner) => `waits for ${owner} to check the number`,
  verification: (owner) => `waits for ${owner} to verify your business`,
  "lead-terms": (owner) => `needs ${owner}'s lead form terms accepted`,
  identity: () => "needs a name to be shown as",
  "out-of-budget": () => "has spent everything it was given"
};
var askWhy = (code, owner) => code === null ? `needs something from you in ${owner}` : ASK_WHY[code](owner);
var TILES = {
  waiting: {
    title: "Waiting on you",
    empty: "Nobody from an ad is waiting on you.",
    line: (o) => `${o.ad} \xB7 ${o.what}${o.note ? ` \xB7 ${o.note}` : ""}`,
    wrote: (day) => `wrote ${day}`,
    number: (day) => `left a number ${day}`,
    callNote: "a number to call",
    /** Where a row goes: their conversation where there is one, else their page. */
    toThread: "Open the conversation",
    toPerson: "Open their page"
  },
  coming: {
    title: "Coming",
    endsEvening: "ends that evening",
    ends: "ends",
    today: "Today",
    /** What is left of an ad's total waits while its platform is read. */
    reading: (owner) => `Reading what ${owner} has left`,
    totalReading: "Reading what is left to spend",
    /** The total across ads that stop at a platform total. */
    total: (o) => o.ads === 1 ? `Up to ${o.sum} more on this ad \xB7 stopped by a total set at its platform` : `Up to ${o.sum} more across the ${o.ads} ads \xB7 each stopped by a total set at its platform`,
    plus: (daily) => `plus about ${daily}, no end`
  },
  cameBack: {
    title: "What came back",
    window: "Last 30 days",
    /** The headline is this word and the number it counts, which stands large. */
    headline: "Booked",
    ahead: "Ahead on your calendar",
    kept: "Kept",
    missed: "Missed",
    past: "Past, not marked",
    marked: "marked by your team",
    nudge: (one) => `Mark who came to see what each ${one} cost.`,
    unmatched: (n, many) => `${n} ${many} couldn't be matched to a person, so they're in no ad's number.`,
    line: (o) => `Ahead ${o.ahead} \xB7 Kept ${o.kept} \xB7 Missed ${o.missed} \xB7 Past ${o.past}`
  }
};
var PHONE = {
  line1: (spent, each) => each ? `${spent} spent \xB7 ${each} for each person who booked so far` : `${spent} spent`,
  line1NoCalendar: (touch, spent) => `${touch} new people got in touch \xB7 ${spent} spent`,
  /** While a platform is read, the muted line says what waits instead of a spend it does not know. */
  line1Reading: (touch, list) => `${touch} new people got in touch \xB7 reading ${list}`,
  footnote: "Spend is as each platform reports it and can change for a day or two.",
  row: (platform, door) => `${platform} \xB7 ${door}`,
  /** The ad's line, with where its numbers were last read when the platform could not be read. */
  rowAsOf: (platform, door, when) => `${platform} \xB7 ${door} \xB7 as of ${when}`,
  /** The people waiting on the owner, said by name: two, then how many more. */
  names: (names) => names.length <= 2 ? names.join(" \xB7 ") : `${names.slice(0, 2).join(" \xB7 ")} \xB7 ${names.length - 2} more`,
  /** The door to the Results sheet, which the phone has no figures strip to carry. */
  results: "Results"
};
var V0 = {
  lead: (ad, of) => ({
    strong: `${ad} of the ${of}`,
    rest: " new people with a recorded way in first wrote from a WhatsApp ad."
  }),
  more: (n) => `${n} more have no way in recorded.`,
  emptyLead: "No one has written from an ad yet.",
  emptyLine: "When Meta names the ad in someone's first message, your receptionist answers and they are counted here.",
  notes: [
    "Ads that open WhatsApp are counted under An ad, not WhatsApp.",
    "When Meta names the ad in someone's first message, they're counted here. Calls and other ads aren't counted yet."
  ],
  door: "See them in Reports \u203A People",
  platforms: {
    meta: "Ads that open WhatsApp, and forms",
    google: "Ads that ring your phone",
    tiktok: "Short videos, with forms that collect a number"
  },
  next: "Connecting an ad account comes next, Facebook and Instagram first."
};
var NO_ADS = {
  title: "Your first ad",
  /** `Message you on WhatsApp · about $10 a day for 7 days · up to $70`. */
  line: (o) => `${o.door} \xB7 about ${o.perDay} for ${o.days} days \xB7 up to ${o.total}`,
  press: "Set up",
  /** What stops the first ad, said as a step. The press waits for it. */
  needs: (fix) => `${fix} to set up your first ad`,
  connect: (owner) => `Connect your ${owner} account to set up your first ad`,
  lapsed: (owner) => `Connect your ${owner} account again to set up your first ad`
};
var CHOOSE = {
  title: (owner) => `Choose your ${owner} ad account`,
  line: "Each account is in one currency, and ads on it are charged in that currency.",
  choice: (name, currency) => `${name} \xB7 ${currency}`,
  use: "Use this one",
  done: (name) => `Using ${name} for your ads`,
  /** The account was taken off the list (or never was) between the card being drawn and the press. */
  gone: "That account isn't on the list any more. Look again."
};

// src/ads/words-drawer.ts
var moreSpent = (more) => `Up to ${more} more can be spent`;
var LIST = {
  /** What a chip is, to a screen reader: "The area: 5 miles". */
  chip: {
    offer: "The offer",
    area: "The area",
    amount: "The amount",
    end: "The end date",
    door: "What people do",
    platform: "Where it runs"
  },
  chipSaid: (what, value) => `${what}: ${value}`,
  /** A dashed blank, to a screen reader. */
  blank: "not chosen yet",
  amountDaily: "Change the daily amount",
  inAll: (total) => `${total} in all`,
  /** The unit beside the box of "Your own amount": a daily amount, or a total. */
  unitDaily: "a day",
  unitTotal: "in all",
  /** A daily amount, said as the platform spends it: an average where it spends one (`about $15 a day, an average`). */
  dailyRow: (perDay, average) => average ? `about ${perDay}, an average` : perDay,
  raiseDaily: (perDay, average) => `Raise to about ${perDay}${average ? ", an average" : ""}`,
  moreSpent,
  /** What a daily amount that moves does to a day (`about $10 a day more`): no most, so it says about. */
  dailyMore: (perDay) => `about ${perDay} more`,
  dailyMoreHead: (perDay) => `About ${perDay} more`,
  dailyLess: (perDay) => `about ${perDay} less`,
  /** What a choice does to a day, over the days left to the end. */
  perDayLeft: (perDay) => `About ${perDay} for the days left`,
  asItIs: (perDay) => `As it is: about ${perDay}`,
  endsSooner: (perDay) => `Ends sooner: about ${perDay} for the days left`,
  endsLater: (perDay) => `Ends later: about ${perDay} for the days left`,
  /** A raise's two facts on a line: the most it can spend, and what a day becomes. */
  raiseSub: (o) => `${moreSpent(o.more)} \xB7 about ${o.perDay}`,
  pickDay: "Pick another day",
  pickDayLabel: "Pick the day it ends",
  set: "Set"
};
var CHIPS = {
  offer: (p) => `Changing the offer, photo or words sends the ad back to ${PLATFORM_OWNER[p]} for checking, ${REVIEW_WITHIN[p]}.`,
  areaMiles: "Miles around your address",
  areaPeople: (lo, hi) => `About ${lo.toLocaleString("en-US")} to ${hi.toLocaleString("en-US")} people \xB7 Meta's estimate`,
  areaSmall: "Small areas can be slow to start.",
  areaMeta: "Changing the area sends the ad back for checking.",
  areaGoogle: "People who live or are in this area. People who only search about it won't see it. Fewer people, a better fit.",
  areaTiktok: "TikTok targets these ZIP codes. There is no radius.",
  amountTitle: "Change the total",
  own: "Your own amount",
  /** What a platform needs a day (`floor`, already said), or for Google's total how long it may run. */
  floor: (p, floor, totalMaxDays) => {
    if (p === "google") return `Google total budgets run 3 to ${totalMaxDays ?? 90} days.`;
    return `${PLATFORM_OWNER[p]} needs at least ${floor} a day for this.`;
  },
  belowSpent: (spent) => `It can't go below what is spent, ${spent}.`,
  stops: (p) => p === "google" ? "Google will not charge more than the total." : `${PLATFORM_OWNER[p]} stops at this amount itself, even if Chanlytics is offline.`,
  noRestart: "A change of amount does not send it back for checking.",
  dailyOver: "Some days Meta spends up to a quarter more. Over a week it never goes above 7 times the daily amount.",
  dailyOverGoogle: "Google spends a daily amount as an average: some days up to twice it.",
  /** A change of TikTok's amount: at most this share, and not within this many days of the last. */
  tiktokChange: (maxStep, waitDays) => `A change can be ${Math.round(maxStep * 100)}% at most, and not within ${waitDays} days of the last.`,
  /** Why TikTok will not take an amount: too far from the one now, or too soon after the last change. */
  tiktokStepOut: (maxStep) => `TikTok lets you change it by up to ${Math.round(maxStep * 100)}% at a time`,
  tiktokWait: (day) => `TikTok lets you change it again on ${day}`,
  tiktokRange: (o) => `Between ${o.lo} and ${o.hi}: TikTok lets you change it by up to ${Math.round(o.maxStep * 100)}% at a time.`,
  endTitle: "Change the end date",
  endLater: "A later end date lets it spend up to the total. It does not go back for checking.",
  endGoogle: (day, at) => `Ends the evening of ${day} (${at}, your account's time zone).`,
  /** Google's total budgets run this many days at most: the date list stops at the last day. */
  googleLastDay: (o) => `Google total budgets run up to ${o.days} days, so the last day for this ad is ${o.day}.`,
  /** A raise of spend is the only press that names its maximum; lowering, pausing and renaming are free. */
  raise: (total) => `Raise to ${total} in all`,
  lockedWhy: "To change how the chat starts, Chanlytics makes a copy of the ad.",
  formNew: "Changing the form makes a new form.",
  googleWait: "Changing it now restarts the wait."
};
var ZIPS = {
  title: "ZIP codes",
  add: "Add a ZIP code",
  addPress: "Add",
  placeholder: (digits) => `${digits} digits`,
  remove: (zip) => `Take out ${zip}`,
  bad: (digits) => `A ZIP code is ${digits} digits.`,
  already: (zip) => `${zip} is already in the list.`,
  none: "Keep at least one ZIP code.",
  save: "Save ZIP codes",
  /** What the list says it holds, to a screen reader. */
  held: (n) => `${plural(n, "ZIP code")} in the area`
};
var EDIT = {
  title: "Photo and words",
  photo: "Photo",
  changePhoto: "Change photo",
  photoNew: "A new photo is chosen",
  headlineN: (n) => `Headline ${n}`,
  descriptionN: (n) => `Description ${n}`,
  noChanges: "Nothing changed yet",
  /** How the chat starts, fixed on a running ad: `How the chat starts: They send a message you wrote for them`. */
  chatNow: (what, now) => `${what}: ${now}`,
  /** The foot's line while the changes are being made. */
  tapHint: "Tap a highlighted word to change it"
};
var CHANGED = {
  ends: (name, day) => `${name} now ends ${day}`,
  total: (name, total) => `${name}'s total is now ${total}`,
  daily: (name, amount) => `${name}'s daily amount is now ${amount}`,
  area: (name, area, owner) => `${name} now reaches ${area}. Back with ${owner} for checking.`,
  renamed: (name) => `Renamed to ${name}`,
  saved: (name) => `${name} saved`,
  savedChecking: (o) => `${o.name} saved. Back with ${o.owner} for checking, ${o.within}.`,
  updated: (o) => `${o.name} is back with ${o.owner} with your new price, ${o.within}.`,
  /** A second look is asked of the platform; the ad stays as it is until it answers. */
  asked: (o) => `Asked ${o.owner} to look again. ${o.within.charAt(0).toUpperCase()}${o.within.slice(1)}.`,
  retrying: (owner) => `Trying again on ${owner}. This takes a minute.`,
  removing: (owner) => `Removing what was made on ${owner}.`,
  pausedTotal: (name, day) => `${name} paused. Nothing more is spent while it is paused. It still ends ${day}.`
};
var NO_AD = {
  title: "This ad isn't here any more",
  body: "It may have been ended and cleared away."
};
var PEOPLE_TAB = { everyone: "Everyone", none: "Nobody yet." };
var SHOWN = {
  frameLabel: "Where it shows",
  photo: "Your photo goes here",
  video: "Your video goes here",
  adWord: "Ad",
  consentBox: "Not ticked",
  formRows: "What they fill in",
  reach: "What this ad runs on"
};
var MADE_IN = {
  meta: "Meta Ads Manager",
  google: "Google Ads",
  tiktok: "TikTok Ads Manager"
};
var CHANGE_IN = { meta: "Meta", google: "Google Ads", tiktok: "TikTok" };
var MADE_PARTS = "the campaign and who it shows to";
var paymentLead = (p) => p === "meta" ? "Meta couldn't charge your card. Update it in Meta" : checkFix("payment", p);
var DRAWER = {
  /** The kicker: `Facebook and Instagram · Message you on WhatsApp`. */
  kicker: (platform, door) => `${platform} \xB7 ${door}`,
  next: {
    runs: (o) => `Runs to ${o.day} \xB7 ${o.left}${o.perDay ? ` \xB7 about ${o.perDay}` : ""}`,
    runsDaily: (perDayText) => `Runs until you stop it \xB7 about ${perDayText}`,
    review: (o) => `Would run ${o.from} to ${o.to} \xB7 up to ${o.total} in all \xB7 about ${o.perDay}`,
    reviewDaily: (o) => `Would start ${o.from} \xB7 about ${o.perDay} until you stop it`,
    paused: (o) => `Paused \xB7 it still ends ${o.day} \xB7 ${o.left}`,
    pausedDaily: (perDayText) => `Paused \xB7 about ${perDayText} when it runs`,
    ended: (o) => `Ended ${o.day} \xB7 ${o.spent} spent`,
    finished: (total) => `Spent its ${total} and stopped`
  },
  reach: {
    running: (o) => ({
      state: "On",
      parts: [`${o.owner} approved it ${o.day}`, o.note]
    }),
    review: (o) => ({
      state: "In review",
      parts: [`sent to ${o.owner} ${o.when}`, o.note]
    }),
    /** When it was sent: `today 9:02 AM` on the day, else the day. */
    sentWhen: (o) => o.today ? `today ${o.time}` : `${o.day} ${o.time}`,
    paused: (note) => ({ state: "Paused", parts: [note] }),
    needs: (first) => ({ state: "Needs you", parts: [first] }),
    ended: (day) => ({ state: `Ended ${day}`, parts: [] }),
    read: (time) => `Read ${time}`
  },
  results: {
    header: "Last 30 days",
    /** The door to this ad's numbers in Reports. */
    report: "Report",
    wrote: "Wrote",
    calls: "Calls",
    leftNumber: "Left a number",
    defWrote: "People who first wrote through this ad. A person is counted once, for the ad they first got in touch through.",
    defCalls: "Calls Google counted from this ad, by the day of the click. Google's count, not Chanlytics'.",
    defNumber: "People who left a number through this ad's form. A person is counted once.",
    countWrote: (wrote, booked) => `${wrote} wrote \xB7 ${booked} booked`,
    countCalls: (calls) => `${plural(calls, "call")} \xB7 Google's count`,
    countNumber: (n, booked) => `${n} left a number \xB7 ${booked} booked`,
    perPerson: (spent, n) => `${spent} / ${peopleWord(n)}`,
    /** A counted zero is said in words. */
    zero: (o) => `${o.inTouch} ${o.did} so far, nobody has booked yet. ${o.spent} spent.`,
    quietStart: (spent) => `${spent} spent, nobody has written yet.`,
    /** Its first words are the word that opens what each platform says about it (`many` is the appointment word, plural). */
    tooEarly: (many) => ({
      word: "Too early to judge",
      rest: `. Most ads need about a week and a handful of ${many} before the cost means anything.`
    }),
    tooEarlySheet: {
      meta: "This is Chanlytics' reading, not a Meta status. Meta usually needs about 50 results after your last big change.",
      tiktok: "This is Chanlytics' reading, not a TikTok status. TikTok says its ads settle after about 25 results or a week.",
      google: "This is Chanlytics' reading, not a Google status. Google needs a few days of calls."
    },
    soFarToday: (time) => `so far today, ${time}`
  },
  bars: {
    legend: (did) => `Each bar is a day: people who first ${did}. Dark part: booked since. Lighter days are still counting.`,
    legendCalls: "Each bar is a day: calls Google counted, by the day of the click. Lighter days are still counting.",
    aria: (o) => `${peopleWord(o.n)} first ${o.did} over ${plural(o.days, "day")}; ${o.booked} ${o.booked === 1 ? "has" : "have"} booked.`,
    ariaCalls: (o) => `${plural(o.n, "call")} over ${plural(o.days, "day")}, Google's count.`,
    ariaNone: "Nothing yet: it has not started."
  },
  quiet: {
    reply: (median, n) => `Median first reply ${median} \xB7 ${plural(n, "reply", "replies")}`,
    provenance: (owner) => `Counted by Chanlytics, not by ${owner}. ${owner}'s own numbers can differ and settle after a day or two.`,
    provenanceCalls: "Calls are Google's count, not Chanlytics'. Google's own numbers can differ and settle after a day or two.",
    /** The platform's own numbers, one press away: a list by name, each "not read yet" where the platform returned none. */
    theirsDoor: (owner) => `${owner}'s numbers`,
    theirsNote: (owner) => `These are ${owner}'s counts. Chanlytics counts people once.`,
    notRead: "Not read yet",
    theirs: {
      saw: "People who saw it",
      reached: "People reached",
      impressions: "Impressions",
      taps: "Taps",
      clicks: "Clicks",
      chats: "Chats started",
      numbers: "Numbers left",
      calls: "Calls",
      longCalls: "Calls over 60 seconds"
    },
    googleExtra: "Google counts calls by the day of the click, so recent days can still change.",
    /** What people searched on Google, as it groups them, and the searches left out for the owner. */
    typedDoor: "What people typed",
    typedNote: "Google groups what people searched into themes and shows these.",
    leftOut: {
      title: "Left out for you",
      note: "Google won't show the ad for searches with these words."
    }
  },
  people: {
    title: "People it brought",
    booked: "Booked",
    notYet: "Not yet",
    /** The door to everyone it brought: People cannot be cut by ad yet, so it says where it goes. */
    all: (n) => `${allWord(n)} in Reports \u203A People`,
    wrote: (day) => `Wrote ${day}`,
    wroteToday: (time) => `Wrote today ${time}`,
    number: (day) => `Left a number ${day}`,
    waiting: (days) => `Waiting for you \xB7 ${days}`,
    callNumber: "A number to call",
    talking: "Talking",
    quietSince: (day) => `Quiet since ${day}`,
    nothing: "Nothing on your calendar",
    ahead: (day, time) => `Booked ${day}, ${time}`,
    kept: (day) => `Kept ${day}`,
    missed: (day) => `Missed ${day}`,
    past: (day) => `Was booked ${day}`,
    marked: "Marked by your team",
    notMarked: "Not marked yet",
    emptyCalls: "Calls aren't matched to people yet.",
    emptyReview: "Nobody yet. Nothing is spent until the platform approves it.",
    emptyQuiet: "Nobody yet.",
    /** Where a row goes, said in its tip: the person's page, or the conversation that waits on the owner. */
    tipPerson: (name) => `Opens ${name}`,
    tipConversation: (name) => `Opens your conversation with ${name}`
  },
  foot: {
    pause: "Pause",
    resume: "Resume",
    edit: "Edit",
    again: "Run it again",
    cancel: "Cancel",
    save: "Save changes",
    /** The one press that raises what can be spent names its most. */
    saveRaise: (total) => `Save \xB7 raise to ${total}`,
    saveRaiseDaily: (perDay) => `Save \xB7 raise to about ${perDay}`,
    paused: (name, day) => `${name} paused. Nothing more is spent while it is paused. It still ends ${day}. Meta may need a few days to find people again when you turn it back on.`,
    pausedDaily: (name) => `${name} paused. Nothing more is spent while it is paused.`,
    resumed: (name) => `${name} is on again`,
    /** The edit foot: what the changes do. */
    changes: (o) => o.restarts ? `${plural(o.n, "change")} \xB7 back with ${o.owner} for checking, ${o.within}` : `${plural(o.n, "change")} \xB7 starts right away`
  },
  menu: {
    label: "More about this ad",
    ask: "Ask about this ad",
    copy: "Make a copy",
    end: "End this ad",
    endConfirm: (name) => `End ${name}? It stops today. What was spent stays spent.`,
    endPress: "End it",
    keep: "Keep it",
    ended: (name) => `${name} ended`,
    copied: (name) => `A copy of ${name} is ready to turn on`
  },
  /** The questions a callout's press asks first, in the foot. */
  confirm: {
    update: (o) => `Update the ad? Its words are drafted again from Services with the new price, and it goes back to ${o.owner} for checking, ${o.within}.`,
    updateYes: "Update it",
    updateNo: "Not now",
    remove: (owner) => `Remove what was made on ${owner}? It is deleted there. Nothing was spent.`,
    removeYes: "Remove it",
    removeNo: "Keep it"
  },
  /** An ad the owner made on the platform itself: Chanlytics can pause and resume it, and nothing else. */
  adopted: (p) => `Made in ${MADE_IN[p]}. Chanlytics can pause and resume it; change it in ${CHANGE_IN[p]}.`,
  callout: {
    review: (p) => `${PLATFORM_OWNER[p]} is checking your ad, ${REVIEW_WITHIN[p]}. Nothing is spent until it is approved. We'll tell you here.`,
    /** An ad sent back for checking after a change: its results stay where they are. */
    recheck: (o) => `${o.owner} is checking your changes, ${o.within}. Your results stay here.`,
    settingUp: (p) => `Setting it up on ${PLATFORM_OWNER[p]}, paused. This takes a minute.`,
    couldntFinish: (p) => `Chanlytics couldn't finish setting this up. What was made is paused on ${PLATFORM_OWNER[p]}: ${MADE_PARTS}. Nothing was spent.`,
    couldntExits: { retry: "Try again", remove: "Remove what was made" },
    pausedInPlatform: (p) => `Paused in ${PLATFORM_OWNER[p]}, not here. Turn it back on?`,
    resume: "Resume",
    /** The price the ad says and the one Services says now; either may be missing from what was read. */
    priceChanged: (o) => {
      if (o.was && o.now) return `Your price changed in Services: the ad says ${o.was}, Services now say ${o.now}.`;
      return o.was ? `Your price changed in Services. This ad still says ${o.was}.` : "Your price changed in Services.";
    },
    updateAd: "Update the ad",
    /** The platform's own words, verbatim, in quotes. */
    rejected: (o) => `${o.owner} turned this ad down: \u201C${o.why}\u201D`,
    rejectedExits: {
      fix: "Fix it",
      again: (owner) => `Ask ${owner} to look again`,
      fresh: "Make a new one"
    },
    /** The line is the platform's own payment step: `Add a card in Google Ads`. */
    payment: (p) => `${paymentLead(p)} so your ad can run. Chanlytics never holds your ad money.`,
    lapsing: (day) => day ? `TikTok's permission to use this post ends ${day}.` : "TikTok's permission to use this post ends soon.",
    renew: "Renew in Settings \u203A Connections",
    /** After a press, until the platform answers: the press says what it did and cannot be pressed again. */
    done: { again: (owner) => `Asked ${owner}`, retry: "Trying again", remove: "Removing" },
    ended: (day) => `Ended ${day}.`,
    settling: (days) => `Numbers settle for ${days} days: these may still change.`,
    settled: (days) => `Settled: ${days} days have passed.`,
    finished: (o) => `${o.name} spent its ${o.total} and stopped.`,
    finishedBooked: (booked) => `${peopleWord(booked)} booked from it.`,
    finishedCalls: (calls) => `Google counted ${plural(calls, "call")} from it.`,
    quiet: "Quiet so far is normal. Give it about a week before you judge it."
  },
  edit: { pen: "Rename this ad", namePlaceholder: "Name this ad" }
};
var PREVIEW = {
  fold: "How it reads",
  frames: ["Feed", "Story", "Reel"],
  /** The capsule under the ad, in the platform's wording where it can differ by locale. */
  cta: { whatsapp: "Send WhatsApp message", call: "Call us", form: "Sign up" },
  tap: "When they tap",
  call: "When they call",
  form: "When they send the form",
  drawn: (owner) => `Drawn by Chanlytics. When you turn it on, ${owner} also shows its own preview.`,
  receptionistWrites: "Your receptionist writes the real reply when someone writes.",
  replyLabel: "Example reply, written from your Services and Hours:",
  googleCaption: (line) => `Google shows its own number on the ad and passes the call to ${line}. On phones the button calls; on computers it shows the number.`,
  answers: (business) => `Your receptionist answers, starting with: ${business}, how can I help?`,
  formFilled: "Filled in for them",
  formName: "Name",
  formPhone: "Phone",
  consentTitle: "Draft for counsel, not final wording",
  consent: (business) => `Yes, ${business} may text or WhatsApp me at this number, using automated technology, with offers and reminders. Not required to book. Message frequency varies. Message and data rates may apply. Reply STOP to opt out.`,
  privacy: (site) => `Privacy policy: ${site}/privacy`,
  formNotice: "We'll message you about this request.",
  layout: "A standard form: the card layout is not available with a consent line",
  /** Drawn by the drawer and New ad's thank-you switch (owed). */
  thanksOn: "We'll message you within a few minutes",
  thanksOff: "We'll get back to you",
  neverQuote: "Your receptionist is set to never quote prices, so it will say the price is quoted at a consult. Take the price out of the ad, or change that setting.",
  excerpt: (text, cta) => `${text} \xB7 ${cta}`
};

// src/ads/words-new.ts
var NEW_AD = {
  kicker: "New ad",
  stepOf: (n) => `${n} of 5`,
  stepLabel: (n) => `Step ${n} of 5`,
  review: "Review",
  reviewTitle: "Everything is filled in. Skip to the last step.",
  /** The ad's name, to a screen reader. */
  nameLabel: "The ad's name",
  zip: "these ZIP codes",
  miles: (n) => `${n} miles`,
  endsAtGoogle: "11:59 pm",
  /** The name, drafted once the offer is chosen: `First appointment · 12 Oct`. */
  name: (offer, day) => `${offer} \xB7 ${day}`,
  /** The phone's sentence is clamped to two lines; this opens it. */
  sentenceMore: "Show the whole sentence",
  sentenceLess: "Show less",
  steps: ["What should people do?", "The ad", "Where and who", "Budget", "Review"],
  back: "Back",
  cancel: "Cancel",
  next: ["Next: the ad", "Next: where and who", "Next: budget", "Next: review"],
  say: "Nothing runs until you press Turn on.",
  sayFirst: "Nothing runs until you press Turn on in step 5.",
  turnOnTotal: (total) => `Turn on \xB7 up to ${total}`,
  turnOnDaily: (perDayText) => `Turn on \xB7 about ${perDayText}`,
  /** After the press: the toast, and what Undo does. */
  turnOnToast: (o) => `Sent to ${o.owner} to check, ${o.within}. It starts when ${o.owner} approves it.`,
  undone: "Paused. Nothing is spent.",
  /** What stops Turn on, said as a step; the door is Settings › Connections. */
  blocked: {
    need: (fix) => `${fix} to continue`,
    notConnected: (owner) => `Connect your ${owner} account to continue`,
    choose: (owner) => `Choose your ${owner} ad account to continue`,
    lapsed: (owner) => `Connect your ${owner} account again to continue`
  },
  needs: "What this needs",
  /** New ad opened from an ad: the name it opens with says so. */
  from: {
    copy: (name) => `A copy of ${name}`,
    again: (name) => `${name}, again`,
    google: (name) => `${name} on Google`
  },
  /** A member who is not the owner can draft an ad; the owner turns it on. */
  askOwner: "Ask the owner to turn it on",
  askOwnerSent: "Sent to the owner. They'll see it in their bell.",
  /** Google: the page the ad opens. */
  opens: {
    label: "The ad opens",
    group: "Where the ad opens",
    page: "Your Chanlytics page",
    site: "Your website",
    pageNote: "Chanlytics puts your number on it, as text. There is nothing to do.",
    siteNote: "Your number has to be on that page as text, or the call button will not run.",
    numberOnPage: "Your number is on the page it opens, as text",
    hostedNote: "Chanlytics puts it there",
    /** The display path under the headline: the page's address, then where on it. */
    path: (host) => `${host} \u203A book`
  },
  step1: {
    formNote: "To text or WhatsApp them first, they must tick the yes box on the form."
  },
  step2: {
    about: "What it's about",
    aboutLabel: "What the ad is about",
    aboutCaption: "From your Services. Change it, or pick another.",
    quoted: "Quoted at a consult",
    photo: "The photo or post",
    postsLabel: { meta: "Use one of my Instagram posts", tiktok: "Use one of my TikTok videos" },
    addPhoto: "Add a photo",
    addVideo: "Add a video",
    photoHint: "Upright 4:5, at least 1440 x 1800 suggested",
    postUse: "How the post is used",
    asIs: "Use the post as it is",
    newWords: "Use its photo with new words",
    words: "The words",
    headline: "Headline",
    text: "Text",
    limit: (n, max, where) => `${n} of ${max} on ${where}`,
    /** The names the limit lines use for where Meta shows the words. */
    where: { facebook: "Facebook", instagram: "Instagram" },
    chat: "How the chat starts",
    chatReady: "They send a message you wrote for them",
    chatQuestions: "They pick a question",
    chatLocked: "They can't have both. To change this later, Chanlytics makes a copy of the ad.",
    chatShort: "About 80 characters",
    adjust: "Let Meta adjust my photo and wording",
    adjustWhat: "Crop, wording variations, relevant comments",
    adjustOff: "Off: the photo and words stay yours.",
    frameLabel: "How the ad is shown",
    headlines: "Headlines",
    descriptions: "Descriptions",
    googleFold: "We wrote 10 headlines and 3 descriptions so Google can try different wordings",
    googleShown: "As Google will show them",
    /** The other wordings Google tries, so the fold's "10 headlines and 3 descriptions" are all there. */
    googleMore: (o) => ({
      headlines: [
        `Book ${o.offer}`,
        "Open times this week",
        `Call ${o.business}`,
        `Ask about ${o.offer}`,
        "Open Mon to Sat",
        `${o.offer} ${o.price}`.trim(),
        "Call to ask about times"
      ],
      descriptions: [`Call ${o.business} for open times. We'll go through them with you.`]
    }),
    count: (n, max) => `${n} of ${max}`,
    video: "A short vertical video, 5 to 60 seconds. A still photo alone will not run on TikTok.",
    /** A TikTok post used as an ad: its music has to be cleared for ads. */
    sound: "If this video has a song in it, TikTok may turn the ad down unless the song is cleared for ads.",
    newWordsVideo: "Use its video with new words",
    formFields: "The form",
    formFilled: "Name and phone, filled in for them.",
    askService: "Let them pick a service",
    askServiceHint: "A short list of your own services.",
    doubleCheck: "Ask them to double-check before sending",
    privacyLink: "Privacy page link",
    privacyHint: "Your own page. If you have none, Chanlytics hosts one for your business.",
    privacyPlaceholder: "https://",
    privacyNeeded: "Add your privacy page link to continue",
    completion: "When they send it",
    completions: ["We'll message you on WhatsApp", "Call us", "Nothing more"],
    consentOn: "The yes box is on the form, unticked.",
    consentCounsel: "The yes line is counsel's wording. Chanlytics keeps it as it is.",
    /** The thank-you line a form ends on: whether it promises a message within minutes. */
    thanks: "Promise a message within minutes",
    thanksHint: (said) => `They read: ${said}`,
    thanksOnNote: "Chanlytics sends no first text yet. You would write to them yourself.",
    /** Who the ad is shown as: read from the connection, changed in Settings. */
    shownAs: {
      label: "Shown as",
      line: (name, handle) => handle ? `${name} \xB7 ${handle}` : name,
      limit: (max) => `Up to ${max} characters`,
      door: "Change in Settings \u203A Connections"
    },
    /** Meta: a photo or a vertical video. */
    media: {
      label: "What the ad shows",
      photo: "Photo",
      video: "Video",
      videoNote: "Vertical, for Reels and Stories",
      postsVideo: "Use one of my Instagram videos"
    },
    /** Google: what people search, grouped by Google. */
    search: {
      label: "What people search",
      note: "Google groups searches; you will see what people typed in the ad's Results.",
      leftOut: (list) => `Left out for you: ${list.join(", ")}`
    }
  },
  step3: {
    runsOn: "Runs on",
    platformLabel: "Where it runs",
    alsoGoogle: "Also run on Google",
    placementsMeta: "Facebook and Instagram feeds, stories and reels.",
    placementsOff: "Chats from Status ads can't be tied back to the ad.",
    placementsTiktok: "TikTok and its partner apps",
    placementsGoogle: "Google Search results.",
    area: "People within",
    areaGoogle: "People who live or are within",
    areaTiktok: (zip) => `People in ${zip}`,
    areaPicker: "How far around your address",
    of: "of",
    regulars: "It may also show to people who already know you. Anyone already in People who writes is not counted as new.",
    /** Drawn by New ad's area step (owed). */
    googleSmall: "The ad may show only now and then.",
    special: "Is this ad about a job you're hiring for, a loan or financing offer, or a home to sell or rent?",
    no: "No",
    yes: "Yes",
    yesNote: "Meta limits this: an area of at least 15 miles (25 km), no age or gender choice.",
    /** Drawn by New ad's area step (owed): the age lock a special category brings. */
    ages: "Ages 18 and over",
    agesWhy: "Meta limits this kind of ad to adults.",
    agesLabel: "Ages",
    ageLine: (floor) => `${floor} and over`,
    agesWhyDefault: (owner) => `${owner} shows ads like this to adults only.`,
    agesWhyCosmetic: "TikTok shows cosmetic ads to people 25 and over.",
    alsoGoogleNote: "After this one is on, you'll set up the Google one: same offer, its own amount.",
    /** What the platform looks for, by door. */
    who: (platform, door) => {
      if (platform === "google") return "Google shows it to people searching for what you offer.";
      const owner = platform === "tiktok" ? "TikTok" : "Meta";
      return door === "whatsapp" ? `${owner} looks for people likely to message you.` : `${owner} looks for people likely to leave a number.`;
    }
  },
  step4: {
    mode: ["For a set number of days", "Until I stop it"],
    modeLabel: "How the money runs",
    presetsLabel: "How much",
    /** `Steady · about $15 a day for 20 days · up to $300 · ends Sat 31 Oct`: the label, then the rest. */
    preset: (o) => `about ${o.perDay} for ${o.days} days \xB7 up to ${o.total} \xB7 ends ${o.end}`,
    presetDaily: (o) => `about ${o.perDay}`,
    own: "Your own amount",
    ownLabel: "Amount a day",
    /** The unit beside the box: the currency's symbol, then a day. */
    ownUnit: (symbol) => `${symbol} a day`,
    ownNeeds: "Enter an amount a day.",
    fees: "WhatsApp message fees, if any, are billed by WhatsApp and are not in this number.",
    dailyAbout: (perDayText) => `About ${perDayText}`,
    estimate: (o) => `About ${o.lo} to ${o.hi} chats over the ${o.days} days \xB7 Meta's estimate, not a promise.`,
    noEstimate: "Meta can't estimate this yet. The first days will tell us.",
    googleEstimate: (o) => `About ${o.clicks[0]} to ${o.clicks[1]} clicks a month at this amount, usually ${o.from} to ${o.to} a click \xB7 Google's estimate`,
    history: (each, people) => `Your earlier ads cost about ${each} for each person who booked (${people} people).`,
    more: "More choices",
    /** Only while the business is open: the switch, and why it is off or not a switch. */
    openOnly: (hours) => `Only while you're open (${hours})`,
    openOnlyOn: "It shows only in those hours.",
    openOnlyOff: "Off: it can show at any hour.",
    openOnlyMeta: "Meta can keep to your hours only with a set number of days.",
    openOnlyGoogle: "The call button follows your hours anyway.",
    /** What each platform says about changing the amount once the ad is on. */
    tiktokChange: (maxStep, waitDays) => `After it is on, TikTok lets you change the amount by up to ${Math.round(maxStep * 100)}% at a time, once every ${waitDays} days.`,
    googleAverage: (o) => `A Google daily amount is an average: a day can spend up to ${o.day === 2 ? "twice" : `${o.day} times`} it, never more than ${o.month} times it in a month.`,
    relearn: "Changing the amount sends it back to learning for a few days."
  },
  step5: {
    kicker: (door) => `New ad \xB7 ${door}`,
    readyLabel: "What the account stands on",
    ready: (parts) => `Ready \xB7 ${parts}`,
    /**
     * What the account stands on, in the words of each platform. The number on the page an ad opens is the ad's own check
     * (it follows "The ad opens", in Checked before turning on), never the account's.
     */
    readyParts: {
      meta: ["account active", "payment method in Meta", "Page and WhatsApp number linked"],
      google: ["Google Ads account active", "a card added in Google Ads", "call reporting on"],
      tiktok: ["TikTok account linked", "payment method in TikTok", "privacy page link added"]
    },
    forecast: (o) => `${o.owner} checks it first, ${o.within}, then it starts. About ${o.perDay} \xB7 up to ${o.total} in all \xB7 ends ${o.end}.`,
    forecastDaily: (o) => `${o.owner} checks it first, ${o.within}, then it starts. About ${o.perDay} until you stop it.`,
    checked: "Checked before turning on",
    quiet: (owner) => `Counted by Chanlytics, not by ${owner}.`,
    quietCalls: "Calls are Google's count, not Chanlytics'.",
    fix: "Add it",
    noCalendar: "You will see who wrote, not who booked, until your calendar is connected.",
    /** "Checked before turning on" counts what is ready: `7 of 7 ready`. */
    count: (met, of) => `${met} of ${of} ready`,
    setFor: "What Chanlytics set for you",
    /** What each door's result is called in the lowest-cost line. */
    result: { whatsapp: "chat", call: "call", form: "number" }
  }
};
var GOOGLE_SEARCH = {
  themes: (o) => [
    `${o.offer.toLowerCase()} near me`,
    `book ${o.a}`,
    "open times this week"
  ],
  leftOut: ["jobs", "free", "courses", "how to"]
};
var SET_FOR_YOU = {
  meta: (o) => [
    "Feeds, Stories and Reels, not WhatsApp Status or the Audience Network",
    `People who live in or were recently in the area, ${o.age} and over`,
    o.adjust ? "Meta may adjust your photo and wording, as you chose" : "Meta's automatic style changes are off",
    `The lowest cost for each ${o.result}`,
    o.hours === null ? "All hours" : `Only while you're open (${o.hours})`
  ],
  google: (o) => [
    "Search only, with search partners off",
    "People in the area",
    `${o.headlines} headlines and ${o.descriptions} descriptions, written from your Services`,
    `The call button follows your hours (${o.hours})`,
    `A call counts past ${o.seconds} seconds`,
    "Most clicks to start",
    `Searches for ${joinWords(o.leftOut)} left out`
  ],
  tiktok: (o) => [
    "TikTok and its partner apps",
    `${o.age} and over`,
    o.confirm ? "Name and phone, with a confirm step" : "Name and phone",
    "The most results for the amount",
    `A lead counts within ${o.days} days of a tap, and views are not counted`,
    ...o.hours === null ? [] : [`Only while you're open (${o.hours})`]
  ]
};
var BOOK_ONLINE = "Book online comes later. Chanlytics can't see inside your booking tool, so it couldn't count who booked.";
var CHECKS = {
  words: "Your words say what you offer, not something about the reader",
  promises: "No promises like guaranteed or in 3 days",
  price: "Price and hours match your Services and Hours",
  priceQuote: "The ad quotes a price and your receptionist is set to never quote prices",
  rating: (line) => `Rating line: ${line}`,
  post: "The caption of the post was checked as ad words",
  special: "Not a job, loan or home ad",
  privacy: "Privacy page link added",
  yes: "Your yes line saved with each number",
  noHealth: "No health question",
  businessName: "The first words of the call are your business name",
  /** The words fit the platform's limits, or which one does not. */
  fits: "Your words fit the platform's limits",
  headlineLong: (o) => `The headline is ${o.n} characters. ${o.where} shows the first ${o.max}.`,
  textLong: (o) => `The text is ${o.n} characters. ${o.where} shows the first ${o.max}.`,
  googleLong: (o) => `A Google ${o.what} is ${o.n} characters. Google allows ${o.max}.`,
  /** The ad says a price that Services does not. */
  priceDiffers: (o) => `The ad says ${o.said}. Services says ${o.note}.`,
  /** A platform account that is not ready, as a row: it stops Turn on until it is. */
  account: {
    "not-connected": (owner) => `${owner} account connected`,
    choose: (owner) => `${owner} ad account chosen`,
    lapsed: (owner) => `${owner} account connected again`
  }
};
var ratingLine = (o) => `${o.stars} on Google \xB7 ${o.reviews} reviews \xB7 as of ${o.day}`;

// src/journey/appointment-word.ts
var FORMS = {
  appointment: {
    a: "an appointment",
    has: "has an appointment",
    have: "have an appointment",
    had: "had an appointment"
  },
  visit: { a: "a visit", has: "visits", have: "visit", had: "visited" },
  // trade-word: the word's own forms, said once
  meeting: { a: "a meeting", has: "has a meeting", have: "have a meeting", had: "had a meeting" },
  session: { a: "a session", has: "has a session", have: "have a session", had: "had a session" },
  lesson: { a: "a lesson", has: "has a lesson", have: "have a lesson", had: "had a lesson" }
};
function appointmentWords(word) {
  const f = FORMS[word];
  const Title = capitalize(word);
  const many = `${word}s`;
  const people = (n) => plural(n, "person", "people");
  return {
    word,
    one: word,
    many,
    a: f.a,
    Title,
    before: { caps: `${Title} tomorrow`, name: `${Title} reminder`, hint: `The day before ${f.a} on the calendar` },
    after: { caps: `After the ${word}`, hint: `The day after ${f.a}, when nothing is booked next` },
    lapsedHint: `No ${word} in 45 days, and nothing booked`,
    tomorrowWho: `everyone with ${f.a} tomorrow`,
    yesterdayWho: `everyone who ${f.had} yesterday`,
    withTomorrow: `with ${f.a} tomorrow`,
    whoYesterday: `who ${f.had} yesterday`,
    eachTomorrow: `each has ${f.a} tomorrow on the calendar`,
    eachYesterday: `each ${f.had} yesterday and has nothing booked next`,
    offTomorrow: (n) => `Off \xB7 ${people(n)} ${n === 1 ? f.has : f.have} tomorrow`,
    offYesterday: (n) => `Off \xB7 ${people(n)} ${f.had} yesterday`,
    startsWith: `${f.a} tomorrow, ${f.a} yesterday`,
    byMany: `by ${many}`,
    needsCalendar: `${capitalize(many)} are read from your calendar, and none is connected. Connect one under Settings \u203A Business.`
  };
}

// src/shared/clock.ts
var FORMATS = /* @__PURE__ */ new Map();
function formatsFor(tz) {
  const hit = FORMATS.get(tz);
  if (hit) return hit;
  let zone = tz || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  const made = {
    zone,
    time: new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }),
    date: new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric" }),
    dateYear: new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric", year: "numeric" }),
    weekday: new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short" }),
    parts: new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    })
  };
  FORMATS.set(tz, made);
  return made;
}
var WALLS = /* @__PURE__ */ new Map();
var WALLS_MAX = 2048;
function wall(atMs, tz) {
  const id = `${tz}|${atMs}`;
  const hit = WALLS.get(id);
  if (hit) return hit;
  const p = {};
  for (const x of formatsFor(tz).parts.formatToParts(new Date(atMs))) p[x.type] = x.value;
  const made = {
    key: `${p.year}-${p.month}-${p.day}`,
    year: Number(p.year),
    hh: Number(p.hour) % 24,
    mm: Number(p.minute)
  };
  if (WALLS.size >= WALLS_MAX) WALLS.clear();
  WALLS.set(id, made);
  return made;
}
function zoneDayKey(atMs, tz) {
  return wall(atMs, tz).key;
}
function clockTime(atMs, tz) {
  return formatsFor(tz).time.format(new Date(atMs));
}
function durationWords(seconds) {
  const v = Math.max(0, Math.round(seconds));
  if (v < 60) return `${v}s`;
  if (v < 600) {
    const m2 = Math.floor(v / 60);
    const r = v % 60;
    return r ? `${m2}m ${r}s` : `${m2}m`;
  }
  const minutes = Math.round(v / 60);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// src/reports/report-tiles.ts
var REPORT_MIN_N = 5;

// src/ads/vm-base.ts
var DASH = LEDGER.none;
var PLATFORMS = ["meta", "google", "tiktok"];
var sum = (xs) => xs.reduce((a, b) => a + b, 0);
var adAccountOf = (read, platform) => read.accounts.find((a) => a.platform === platform);
var isConnected = (read, platform) => adAccountOf(read, platform)?.status === "connected";
var checkOk = (acct, id) => acct !== void 0 && acct.checks.some((c) => c.id === id && c.ok);
var counted = (ad) => countedDoor(ad.door);
var started = (ad) => ad.approvedDay !== null;
function viewState(ad, today) {
  return ad.state === "on" && daysBetween(ad.startDay, today) < TOO_EARLY_DAYS ? "too-early" : ad.state;
}
var plainSpaces = (text) => text.replace(/\s/g, " ");
function timeOf(iso, timezone) {
  const ms = isoMs(iso);
  return ms === null ? "" : plainSpaces(clockTime(ms, timezone));
}
function dayOfIso(iso, timezone) {
  const ms = isoMs(iso);
  return ms === null ? "" : zoneDayKey(ms, timezone);
}
var readTime = (read) => timeOf(read.readAt, read.timezone);
var adPersonWho = (name) => ({
  name,
  initials: adPersonInitials(name)
});
var adServiceOf = (read, id) => read.services.find((s) => s.id === id);
var areaWord = (area) => area.kind === "radius" ? NEW_AD.miles(area.miles) : NEW_AD.zip;
var platformsFor = (door) => door === "whatsapp" ? ["meta"] : door === "call" ? ["google"] : ["meta", "tiktok"];
function leadOf(o) {
  if (o.platform === "google") return `${PLATFORM_SURFACE.google} within ${areaWord(o.area)}`;
  const form = o.door === "form" ? ` \xB7 ${DOOR.form.short}` : "";
  return `${PLATFORM_WORD[o.platform]}${form}`;
}
var totalOf = (ad) => ad.budget.mode === "total" ? ad.budget.amountMinor : null;
var costEach = (spentMinor, booked) => booked >= REPORT_MIN_N ? spentMinor / booked : null;
function totalsOf(ad, read) {
  const { from, to } = read.window;
  const rows = ad.days.filter((d) => d.day >= from && d.day <= to);
  return {
    spentMinor: sum(rows.map((d) => d.spendMinor)),
    inTouch: sum(rows.map((d) => d.inTouch)),
    booked: counted(ad) ? sum(rows.map((d) => d.booked)) : 0,
    days: rows.length,
    lifetimeMinor: sum(ad.days.filter((d) => d.day < read.today).map((d) => d.spendMinor))
  };
}
var leftOfAd = (ad, t) => {
  const total = totalOf(ad);
  return total === null ? null : Math.max(0, total - t.lifetimeMinor);
};
var settling = (ads, today) => ads.some((ad) => ad.days.some((d) => d.day >= addDays(today, -ADS_SETTLE_DAYS)));
function endsKind(ad, today) {
  const d = daysBetween(today, ad.endDay);
  if (d <= 0) return "today";
  return d === 1 ? "tomorrow" : "later";
}
var endsWhenOf = (ad, today) => STATE.endsWhen({ kind: endsKind(ad, today), evening: ad.endsAt !== null, day: dayWord(ad.endDay) });
function endsLine(ad, t, today) {
  const left = leftOfAd(ad, t);
  const total = totalOf(ad);
  if (left === null || total === null) return STATE.daily(perDayOf(ad.aboutADayMinor, ad.currency));
  return `${STATE.ends(endsWhenOf(ad, today))} \xB7 ${leftOfMoney(left, total, ad.currency)}`;
}
function needsSecond(ad) {
  const code = ad.needs ? ad.needs.code : null;
  if (code === "payment") return STATE.needsPayment(ad.platform);
  if (code === "paused-in-platform") return STATE.needsPaused(ad.platform);
  if (code === "price-changed") return STATE.needsPrice;
  if (code === "permission-lapsing") return STATE.needsPermission(ad.platform);
  return code === "rejected" ? STATE.needsRejected(ad.platform) : STATE.needsDefault(ad.platform);
}
function secondOf(ad, t, read) {
  switch (ad.state) {
    case "setting-up":
      return STATE.settingUpSecond(ad.platform);
    case "couldnt-finish":
      return STATE.couldntSecond(ad.platform);
    case "review":
      return STATE.reviewSecond(ad.platform);
    case "needs-you":
      return needsSecond(ad);
    case "ended": {
      const cost = counted(ad) ? costEach(t.spentMinor, t.booked) : null;
      return STATE.endedSecond(dayWord(ad.endDay), t.booked, cost === null ? null : moneyOf(cost, ad.currency));
    }
    case "finished":
      return STATE.finishedSecond(moneyOf(totalOf(ad) ?? t.lifetimeMinor, ad.currency));
    default:
      return endsLine(ad, t, read.today);
  }
}
function adStateOf(ad, t, read) {
  const state = viewState(ad, read.today);
  const warn = state === "needs-you" || state === "couldnt-finish";
  return {
    word: STATE_WORD[state],
    tone: state === "on" ? "ok" : warn ? "warn" : "plain",
    second: secondOf(ad, t, read)
  };
}
function countCtx(read) {
  const w = appointmentWords(read.appointmentWord);
  const calendarRead = read.calendar.readAt ? timeOf(read.calendar.readAt, read.timezone) : "";
  return { readAt: readTime(read), calendarRead, a: w.a, one: w.one, many: w.many };
}
var fixDoor = () => ({ words: SETTINGS_DOOR, to: ADS_DOORS.accounts });
function checkRow(acct, id, platform) {
  const ok = checkOk(acct, id);
  return {
    text: checkWords(id, platform),
    tone: ok ? "ok" : "warn",
    door: ok ? null : fixDoor(),
    fix: ok ? null : checkFix(id, platform)
  };
}
function permissionRow(acct, today) {
  if (!acct || !acct.permissionEnd) return null;
  const soon = daysBetween(today, acct.permissionEnd) <= ADS_PERMISSION_WARN_DAYS;
  return { text: STANDING.permission(dayWord(acct.permissionEnd)), tone: soon ? "warn" : "ok", door: null };
}
function accountRows(read, platform) {
  const acct = adAccountOf(read, platform);
  if (!acct || acct.status !== "connected") return [];
  const rows = STANDING_CHECKS[platform].map((id) => checkRow(acct, id, platform));
  const permission = permissionRow(acct, read.today);
  return permission ? [...rows, permission] : rows;
}
function needIds(door, platform, choice) {
  const ids = [...DOOR_NEEDS[door][platform] ?? []];
  if (!choice.post || platform !== "tiktok" || ids.includes("post-permission")) return ids;
  const at = ids.indexOf("identity");
  ids.splice(at < 0 ? ids.length : at + 1, 0, "post-permission");
  return ids;
}
function numberRow(acct, opens) {
  const text = NEW_AD.opens.numberOnPage;
  if (opens === "page") return { text, tone: "ok", door: null, note: NEW_AD.opens.hostedNote };
  const ok = checkOk(acct, "number-on-page");
  return {
    text,
    tone: ok ? "ok" : "warn",
    door: ok ? null : fixDoor(),
    fix: ok ? null : checkFix("number-on-page", "google")
  };
}
function doorNeeds(read, door, platform, choice = {}) {
  const acct = adAccountOf(read, platform);
  const opens = choice.opens;
  const rows = needIds(door, platform, choice).map(
    (id) => id === "number-on-page" && opens !== void 0 ? numberRow(acct, opens) : checkRow(acct, id, platform)
  );
  const permission = door === "form" && platform === "tiktok" && choice.post !== false ? permissionRow(acct, read.today) : null;
  return permission ? [...rows, permission] : rows;
}
function firstMissing(acct, door, platform) {
  return (DOOR_NEEDS[door][platform] ?? []).find((id) => !checkOk(acct, id)) ?? null;
}
var doorReady = (read, door) => platformsFor(door).some((p) => isConnected(read, p) && firstMissing(adAccountOf(read, p), door, p) === null);
var firstReadyDoor = (read) => DOOR_ORDER.find((d) => doorReady(read, d)) ?? "whatsapp";
var smallestPreset = (config) => [...config.presets].sort((a, b) => a.perDayMinor * a.days - b.perDayMinor * b.days).at(0);
function reachNoteOf(ad, read) {
  if (ad.door === "call") return ad.state === "review" ? REACH_NOTE.callChecking : REACH_NOTE.callApproved;
  const at = ad.lastArrivalAt;
  const day = at === null ? "" : dayOfIso(at, read.timezone);
  const when = at === null || day === "" ? null : day === read.today ? `${timeOf(at, read.timezone)} today` : dayWord(day);
  if (ad.door === "whatsapp") return when === null ? REACH_NOTE.whatsapp : REACH_NOTE.lastMessage(when);
  return when === null ? REACH_NOTE.form[ad.platform] : REACH_NOTE.lastNumber(when);
}
var quotesPrice = (text) => /[$£€]\s?\d/.test(text);
function adQuotes(copy, priceNote) {
  const named = priceNote !== "" && (copy.headline.includes(priceNote) || copy.text.includes(priceNote));
  return named || quotesPrice(copy.headline);
}
var chipOf = (chip, id, value) => ({ chip, id, value, blank: false });
function platformParts(i) {
  if (i.platform === null) return [];
  if (i.chips === "running") return [{ text: SENTENCE.on + PLATFORM_SURFACE[i.platform] }];
  return [{ text: SENTENCE.on }, chipOf(PLATFORM_SURFACE[i.platform], "platform", i.platform)];
}
function areaParts(i) {
  if (i.platform === null || i.area === null) return [];
  const parts = [{ text: SENTENCE.reach[i.platform] }, chipOf(i.area, "area", i.area)];
  return i.platform === "google" ? [...parts, { text: SENTENCE.of(i.street) }] : parts;
}
function doorParts(i) {
  const lead = { text: `${i.platform === null ? " " : ", "}${SENTENCE.so}` };
  const word = i.past === true ? SENTENCE.soPast[i.door] : DOOR[i.door].chip;
  return [lead, i.chips === "running" ? { text: word } : chipOf(word, "door", i.door)];
}
function budgetParts(i) {
  const b = i.budget;
  if (b === null) return [{ text: "." }];
  const amount = String(b.amountMinor);
  if (b.mode === "daily") {
    return [
      { text: `, ${SENTENCE.about}` },
      chipOf(perDayOf(b.amountMinor, i.currency), "amount", amount),
      { text: i.past === true ? "." : `${SENTENCE.untilStop}.` }
    ];
  }
  const parts = [
    { text: `, ${SENTENCE.upTo}` },
    chipOf(moneyOf(b.amountMinor, i.currency), "amount", amount)
  ];
  if (i.endDay === null) return [...parts, { text: "." }];
  return [...parts, { text: SENTENCE.inAllUntil }, chipOf(dayWord(i.endDay), "end", i.endDay), { text: "." }];
}
function sentenceParts(i) {
  const offer = i.offer === null ? { chip: SENTENCE.blank, id: "offer", value: "", blank: true } : chipOf(i.offer, "offer", i.offer);
  const show = { text: i.past === true ? SENTENCE.showed : SENTENCE.show };
  return [show, offer, ...platformParts(i), ...areaParts(i), ...doorParts(i), ...budgetParts(i)];
}

// src/ads/words-connect.ts
var MANAGER = {
  meta: "Meta Ads Manager",
  google: "Google Ads",
  tiktok: "TikTok Ads Manager"
};
var ICON = { meta: "globe", google: "search", tiktok: "video" };
var zoneCity = (zone) => (zone.split("/").at(-1) ?? zone).replace(/_/g, " ");
var CONNECT = {
  title: "Ad accounts",
  /** The card's second line while the page draws the Ads fixtures. */
  sub: EXAMPLE.note,
  off: "Not connected",
  connect: "Connect",
  disconnect: "Disconnect",
  change: "Change account",
  use: "Use this account",
  cancel: "Cancel",
  /** Not connected: what connecting does, and who bills. */
  line: (p) => `Chanlytics reads your ads and can make new ones. ${PLATFORM_OWNER[p]} bills you; Chanlytics never holds your ad money.`,
  /** The press of Connect in the demo: it says nothing was connected. */
  signIn: (p) => `This opens ${PLATFORM_OWNER[p]}'s sign-in in the real app. Nothing was connected.`,
  /** `USD · New York time · set by the account`: the account's own, which Chanlytics follows and cannot change. */
  facts: (currency, zone) => `${currency} \xB7 ${zoneCity(zone)} time \xB7 set by the account`,
  read: (time) => `Read ${time}`,
  reading: "Reading now",
  readFailed: (when) => `Could not be read \xB7 last read ${when}`,
  ready: "What's ready",
  allReady: "all in order",
  needYou: (n) => `${n} ${n === 1 ? "needs" : "need"} you`,
  managerOk: "Chanlytics' access: accepted",
  managerNot: "Chanlytics' access: not accepted yet",
  /** TikTok's post permission, a day it runs until. */
  permission: (day) => `Post permission until ${day}`,
  /** Ads the owner made on the platform itself, shown in Ads and read-only there (decision 7). */
  adopted: (p, n) => `${plural(n, "ad")} made in ${MANAGER[p]} ${n === 1 ? "is" : "are"} shown in Ads, read-only.`,
  /** Disconnect while an ad runs is refused (decision 8). */
  refused: (n) => `Pause or end your ads first: ${n} ${n === 1 ? "is" : "are"} on.`,
  refusedDoor: "See your ads",
  refusedOk: "Ok",
  disconnectQ: (p) => `Disconnect ${PLATFORM_WORD[p]}?`,
  disconnectDetail: "Chanlytics stops reading your ads and can't make new ones.",
  disconnectYes: "Yes, disconnect",
  disconnectNo: "Keep it connected",
  disconnected: (p) => `${PLATFORM_WORD[p]} is disconnected.`,
  /** The choice of an account: its question, and the toast of choosing one. */
  which: (p) => `Which ${PLATFORM_OWNER[p]} account should Chanlytics use?`,
  using: (p, name) => `${PLATFORM_WORD[p]} now uses ${name}.`,
  /** Decision 9: the owner's setting that pauses ads, off unless chosen. */
  pause: {
    label: "Pause my ads when the way in closes",
    line: "If WhatsApp or your line stops working, Chanlytics pauses your ads instead of only telling you.",
    on: "If the way in closes, Chanlytics will pause your ads.",
    off: "If the way in closes, Chanlytics will tell you."
  },
  /** What a role that may not press says it would have done. */
  gate: {
    connect: "connect an ad account",
    change: "change the ad account",
    disconnect: "disconnect an ad account",
    pause: "change when ads pause"
  }
};
var RUNNING = ["on", "review", "setting-up"];
var CHECKS2 = {
  meta: STANDING_CHECKS.meta,
  google: ["manager-link", ...STANDING_CHECKS.google],
  tiktok: STANDING_CHECKS.tiktok
};
function readyRow(acct, id) {
  const ok = checkOk(acct, id);
  const manager = id === "manager-link";
  const text = manager ? ok ? CONNECT.managerOk : CONNECT.managerNot : checkWords(id, acct.platform);
  return { id, text, tone: ok ? "ok" : "warn", fix: ok ? null : checkFix(id, acct.platform) };
}
function permissionRow2(acct, today) {
  if (!acct.permissionEnd) return null;
  const soon = daysBetween(today, acct.permissionEnd) <= ADS_PERMISSION_WARN_DAYS;
  const id = "post-permission";
  return {
    id,
    text: CONNECT.permission(dayWord(acct.permissionEnd)),
    tone: soon ? "warn" : "ok",
    fix: soon ? checkFix(id, acct.platform) : null
  };
}
function connectReadyOf(acct, today) {
  const rows = CHECKS2[acct.platform].map((id) => readyRow(acct, id));
  const permission = permissionRow2(acct, today);
  return permission ? [...rows, permission] : rows;
}
function readOf(acct) {
  if (acct.read === "reading") return CONNECT.reading;
  if (acct.read === "failed") {
    const at = acct.readAt ? `${dayWord(dayOfIso(acct.readAt, acct.timezone))}, ${timeOf(acct.readAt, acct.timezone)}` : "";
    return CONNECT.readFailed(at);
  }
  return acct.readAt ? CONNECT.read(timeOf(acct.readAt, acct.timezone)) : null;
}
function connectStateOf(status, ready) {
  if (status === "choose") return { tone: "info", words: STANDING.choose };
  if (status === "lapsed") return { tone: "warn", words: STANDING.lapsed };
  if (status === "not-connected") return { tone: "plain", words: CONNECT.off };
  return ready.some((r) => r.tone === "warn") ? { tone: "warn", words: STANDING.needsYou } : { tone: "ok", words: STANDING.connected };
}
function connectRowOf(platform, acct, ads, today) {
  const status = acct?.status ?? "not-connected";
  const connected = acct !== void 0 && status === "connected";
  const ready = connected ? connectReadyOf(acct, today) : [];
  const here = ads.filter((ad) => ad.platform === platform);
  const adopted = here.filter((ad) => !ad.madeHere).length;
  const state = connectStateOf(status, ready);
  const bad = ready.filter((r) => r.tone === "warn").length;
  return {
    id: platform,
    title: PLATFORM_WORD[platform],
    detail: acct?.name ?? null,
    icon: ICON[platform],
    status,
    tone: state.tone,
    stateWords: state.words,
    facts: connected ? CONNECT.facts(acct.currency, acct.timezone) : null,
    read: connected ? readOf(acct) : null,
    ready,
    readyMark: bad > 0 ? CONNECT.needYou(bad) : CONNECT.allReady,
    line: status === "not-connected" || status === "lapsed" ? CONNECT.line(platform) : null,
    adopted: connected && adopted > 0 ? CONNECT.adopted(platform, adopted) : null,
    choices: (acct?.choices ?? []).map((c) => ({ value: c.externalId, label: c.name, hint: c.currency })),
    chosen: acct?.externalId ?? null,
    running: here.filter((ad) => RUNNING.includes(ad.state)).length
  };
}
function connectModel(input) {
  return PLATFORMS.map(
    (platform) => connectRowOf(
      platform,
      input.accounts.find((a) => a.platform === platform),
      input.ads,
      input.today
    )
  );
}

// src/shared/email-address.ts
var LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
var LOCAL = "[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*";
var SHAPE = new RegExp(`^(${LOCAL})@(${LABEL}(?:\\.${LABEL})+)$`);

// src/calendar/booking-notice.ts
var NOTICE_LENGTH_MAX_MS = 12 * HOUR_MS;
var NOTICE_TIME_REACH_MS = 400 * DAY_MS;
var SAME_VISIT_MS = 15 * MIN_MS;

// src/config/no-booking-link.ts
var NO_LINK_DETAILS = "their name, what they need, and where and when";
var NO_WAY_TO_SEND_LINK = `Booking: the booking link can only be sent by WhatsApp, and this business has no WhatsApp line, so never use send_booking_link and never promise a link or a message. When the caller wants to book, change or cancel a booking, take ${NO_LINK_DETAILS}, and say the team will follow up. If they would rather book themselves and a website is listed above, they can book there.`;

// src/calendar/calendar-words.ts
var SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
var LONG = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });

// src/setup/calendar-source.ts
var CALENDAR_SETTING_ROUTE = "admin/workspace/calendar";
var FORWARD_CONFIRM_SHOWN_MS = 3 * DAY_MS;

// src/ads/address.ts
var ADS_ROUTE = "campaigns/ads";
var adRoute = (id) => `${ADS_ROUTE}:ad:${id}`;
var newAdFromRoute = (how, id) => `${ADS_ROUTE}:new:${how}:${id}`;
var ADS_SCOPE_ALL = { kind: "all" };
function adsScopeKey(scope) {
  if (scope.kind === "all") return "all";
  return scope.kind === "platform" ? `platform:${scope.platform}` : `ad:${scope.id}`;
}

// src/ads/page-parts.ts
var platformsRead = (read, how) => PLATFORMS.filter((p) => {
  const acct = adAccountOf(read, p);
  return acct !== void 0 && acct.status === "connected" && acct.read === how;
});
var ownersOf = (platforms) => joinWords(platforms.map((p) => PLATFORM_OWNER[p]));
function perHead(items, n, enough) {
  const sums = sumsOf(items);
  const one = sums.length === 1 ? sums[0] : void 0;
  if (!one || n <= 0 || !enough(n)) return null;
  return { minor: one.minor / n, currency: one.currency };
}
function pageTotals(read) {
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
var eachInTouch = (p) => perHead(p.eachSpend, p.touch, () => true);
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
function tilesOf(read, reading = []) {
  return {
    waiting: { title: TILES.waiting.title, rows: waitingRows(read), empty: TILES.waiting.empty },
    coming: comingOf(read, reading),
    cameBack: cameBackOf(read)
  };
}
function phoneOf(p, read, waiting, reading = []) {
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
function v0Of(read) {
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
function noAdsOf(read, config) {
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
var runDays = (ad) => daysBetween(ad.startDay, ad.endDay) + 1;
function broughtEnough(ad, t) {
  return counted(ad) ? t.booked >= ADS_ASK_MIN : t.inTouch >= ADS_ASK_MIN_CALLS;
}
var running = (ad, today) => {
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
function pageAsk(read, reading) {
  const blocked = read.ads.find((ad) => ad.state === "needs-you");
  if (blocked) return fixAsk(blocked);
  if (reading) return null;
  const soon = read.ads.filter((ad) => running(ad, read.today)).map((ad) => extendAsk(ad, totalsOf(ad, read), read)).filter((a) => a !== null);
  return soon.at(0) ?? moveAsk(read);
}

// src/ads/page.ts
var cell = (value, unit = null, why = null) => ({ value, unit, why });
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
var waitingOn = (read, rv, only = () => true) => rv.reading.filter((platform) => read.ads.some((ad) => ad.platform === platform && only(ad)));
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
var leadFor = (ad) => ad.madeHere ? leadOf({ platform: ad.platform, door: ad.door, area: ad.area }) : LEDGER.madeIn[ad.platform];
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
var RANK = {
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
var PLATFORM_GLYPH = { meta: "users", google: "search", tiktok: "video" };
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
function earlierCost(read) {
  const p = pageTotals(read);
  return p.each !== null && p.booked >= ADS_ASK_MIN ? { each: moneyOf(p.each.minor, p.each.currency), people: p.booked } : null;
}
var failedOf = (rv) => rv.failed.map((platform) => ({
  platform,
  line: ADS_READ.failed(PLATFORM_OWNER[platform], rv.asOf[platform] ?? null),
  again: ADS_READ.again
}));
var groupByOf = (read, by) => read.ads.length < ADS_GROUP_FROM ? null : {
  label: GROUP.label,
  value: by,
  options: [
    { value: "door", label: GROUP.door },
    { value: "platform", label: GROUP.platform }
  ]
};
function adsModel(read, config, by = "door") {
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

// src/ads/drawer-parts.ts
var FACT_LABEL = {
  whatsapp: DRAWER.results.wrote,
  call: DRAWER.results.calls,
  form: DRAWER.results.leftNumber
};
var FACT_DEF = {
  whatsapp: DRAWER.results.defWrote,
  call: DRAWER.results.defCalls,
  form: DRAWER.results.defNumber
};
function drawerFacts(ad, t, read) {
  const w = figureWords(countCtx(read));
  const cost = counted(ad) ? costEach(t.spentMinor, t.booked) : null;
  const dash = (id, label, def, meta = null) => ({
    id,
    label,
    value: DASH,
    change: null,
    meta,
    definition: def,
    n: null,
    minN: REPORT_MIN_N
  });
  if (!started(ad)) {
    return [
      dash("spent", w.spent.label, w.spent.def),
      dash("touch", FACT_LABEL[ad.door], FACT_DEF[ad.door]),
      dash("booked", w.booked.label, w.booked.def),
      dash("each", w.each.label, w.each.def)
    ];
  }
  const spent = { ...dash("spent", w.spent.label, w.spent.def), value: moneyOf(t.spentMinor, ad.currency) };
  const touch = {
    ...dash("touch", FACT_LABEL[ad.door], FACT_DEF[ad.door], counted(ad) ? null : LEDGER.googleCount),
    value: String(t.inTouch)
  };
  if (!counted(ad)) {
    return [
      spent,
      touch,
      dash("booked", w.booked.label, w.booked.def, FIGURES.callsNotMatched),
      dash("each", w.each.label, w.each.def, FIGURES.callsNotMatched)
    ];
  }
  const each = {
    ...dash("each", w.each.label, w.each.def),
    value: cost === null ? DASH : moneyOf(cost, ad.currency),
    change: cost !== null && settling([ad], read.today) ? FIGURES.soFar : null,
    meta: cost === null ? null : DRAWER.results.perPerson(moneyOf(t.spentMinor, ad.currency), t.booked),
    n: t.booked
  };
  return [spent, touch, { ...dash("booked", w.booked.label, w.booked.def), value: String(t.booked) }, each];
}
function drawerCount(ad, t) {
  if (ad.door === "call") return DRAWER.results.countCalls(t.inTouch);
  return ad.door === "form" ? DRAWER.results.countNumber(t.inTouch, t.booked) : DRAWER.results.countWrote(t.inTouch, t.booked);
}
function judgeOf(ad, t, o) {
  if (!started(ad)) return null;
  if (o.tooEarly) {
    const line = DRAWER.results.tooEarly(o.many);
    return { word: line.word, rest: line.rest, sheet: DRAWER.results.tooEarlySheet[ad.platform] };
  }
  const plain = (rest) => ({ word: null, rest, sheet: null });
  if (ad.state === "on" && t.spentMinor > 0 && t.inTouch === 0) {
    return plain(DRAWER.results.quietStart(moneyOf(t.spentMinor, ad.currency)));
  }
  if (counted(ad) && t.inTouch > 0 && t.booked === 0) {
    return plain(
      DRAWER.results.zero({ inTouch: t.inTouch, did: DOOR[ad.door].did, spent: moneyOf(t.spentMinor, ad.currency) })
    );
  }
  return null;
}
function resultsOf(ad, t, o) {
  const on = started(ad);
  return {
    header: DRAWER.results.header,
    count: on ? drawerCount(ad, t) : "",
    // The door to this ad's numbers in Reports: nothing has been counted until the platform has approved it.
    all: on ? { words: DRAWER.results.report, to: o.reportTo } : null,
    facts: drawerFacts(ad, t, o.read),
    line: judgeOf(ad, t, { tooEarly: o.tooEarly, many: appointmentWords(o.read.appointmentWord).many })
  };
}
function drawerDays(ad, today) {
  const first = addDays(today, -ADS_WINDOW_DAYS);
  const byDay = new Map(ad.days.map((d) => [d.day, d]));
  const cols = Array.from({ length: ADS_WINDOW_DAYS + 1 }, (_, i) => addDays(first, i));
  const busiest = Math.max(1, ad.todaySoFar, ...ad.days.map((d) => d.inTouch));
  return cols.map((day) => {
    const row = byDay.get(day);
    const isToday = day === today;
    const inTouch = isToday ? ad.todaySoFar : row ? row.inTouch : 0;
    const booked = row && counted(ad) ? row.booked : 0;
    return {
      day,
      label: dayWord(day),
      inTouch,
      booked,
      before: day < ad.startDay,
      fresh: !isToday && day >= addDays(today, -ADS_FRESH_DAYS),
      today: isToday,
      h: inTouch / busiest,
      f: inTouch > 0 ? booked / inTouch : 0
    };
  });
}
function adBarsOf(ad, t, read) {
  const did = DOOR[ad.door].did;
  let aria = DRAWER.bars.ariaNone;
  if (started(ad)) {
    aria = ad.door === "call" ? DRAWER.bars.ariaCalls({ n: t.inTouch, days: t.days }) : DRAWER.bars.aria({ n: t.inTouch, did, days: t.days, booked: t.booked });
  }
  return {
    days: drawerDays(ad, read.today),
    legend: ad.door === "call" ? DRAWER.bars.legendCalls : DRAWER.bars.legend(did),
    aria,
    todayNote: DRAWER.results.soFarToday(timeOf(read.readAt, read.timezone))
  };
}
var drawerGrouped = (n) => n.toLocaleString("en-US");
function theirCounts(ad) {
  const x = ad.theirs;
  const L = DRAWER.quiet.theirs;
  switch (x.platform) {
    case "meta":
      return [[L.saw, x.reach], [L.taps, x.taps], ad.door === "form" ? [L.numbers, x.leads] : [L.chats, x.chats]];
    case "google":
      return [
        [L.impressions, x.impressions],
        [L.clicks, x.clicks],
        [L.calls, x.calls],
        [L.longCalls, x.longCalls]
      ];
    default:
      return [
        [L.impressions, x.impressions],
        [L.reached, x.reach],
        [L.clicks, x.clicks],
        [L.numbers, x.leads]
      ];
  }
}
function drawerTheirsOf(ad) {
  if (!started(ad)) return null;
  const owner = PLATFORM_OWNER[ad.platform];
  return {
    door: DRAWER.quiet.theirsDoor(owner),
    rows: theirCounts(ad).map(([label, n]) => ({
      label,
      value: n === null ? DRAWER.quiet.notRead : drawerGrouped(n),
      known: n !== null
    })),
    note: DRAWER.quiet.theirsNote(owner)
  };
}
function typedOf(ad) {
  if (ad.platform !== "google" || !started(ad) || ad.searchThemes.length === 0) return null;
  const out = DRAWER.quiet.leftOut;
  return {
    door: DRAWER.quiet.typedDoor,
    themes: [...ad.searchThemes],
    note: DRAWER.quiet.typedNote,
    left: ad.leftOut.length > 0 ? { title: out.title, terms: [...ad.leftOut], note: out.note } : null
  };
}
function replyTime(seconds) {
  return seconds < 60 ? `${seconds} seconds` : durationWords(seconds);
}
function quietOf(ad) {
  const owner = PLATFORM_OWNER[ad.platform];
  return {
    reply: ad.reply ? DRAWER.quiet.reply(replyTime(ad.reply.medianSeconds), ad.reply.n) : null,
    replyGrey: ad.reply !== null && ad.reply.n < REPORT_MIN_N,
    provenance: ad.door === "call" ? DRAWER.quiet.provenanceCalls : DRAWER.quiet.provenance(owner),
    theirs: drawerTheirsOf(ad),
    typed: typedOf(ad),
    extra: ad.platform === "google" ? DRAWER.quiet.googleExtra : null
  };
}
function adThreadOf(ad, read) {
  const b = read.business;
  const c = ad.copy;
  if (ad.door === "call") return { kind: "call", title: PREVIEW.call, line: PREVIEW.answers(b.name) };
  if (ad.door === "whatsapp") {
    const asks = c.startWith === "questions";
    return {
      kind: "chat",
      title: PREVIEW.tap,
      greeting: c.greeting,
      ready: asks ? null : c.ready,
      questions: asks ? c.questions : [],
      reply: c.reply,
      replyLabel: PREVIEW.replyLabel,
      note: PREVIEW.receptionistWrites
    };
  }
  return {
    kind: "form",
    title: PREVIEW.form,
    fields: [
      { label: PREVIEW.formName, note: PREVIEW.formFilled },
      { label: PREVIEW.formPhone, note: PREVIEW.formFilled }
    ],
    consent: { title: PREVIEW.consentTitle, text: PREVIEW.consent(b.name) },
    privacy: PREVIEW.privacy(b.site),
    notice: PREVIEW.formNotice,
    layout: ad.platform === "tiktok" ? PREVIEW.layout : null,
    thanks: c.thanks
  };
}
function adPreviewOf(ad, read) {
  const b = read.business;
  const c = ad.copy;
  const cta = PREVIEW.cta[ad.door];
  const search = ad.platform === "google";
  const frame = search ? "search" : ad.platform === "tiktok" ? "video" : "feed";
  const headline = search ? c.headlines.join(" | ") : c.headline;
  const note = adServiceOf(read, ad.serviceId)?.note ?? "";
  return {
    frame,
    platform: ad.platform,
    door: ad.door,
    fold: PREVIEW.fold,
    excerpt: PREVIEW.excerpt(search ? c.lines.at(0) ?? headline : c.text, cta),
    business: ad.shownAs.name,
    headline,
    headlines: c.headlines,
    text: c.text,
    lines: c.lines,
    path: c.path,
    cta,
    caption: search ? PREVIEW.googleCaption(b.line) : PREVIEW.drawn(PLATFORM_OWNER[ad.platform]),
    frames: frame === "feed" ? [...PREVIEW.frames] : [],
    thread: adThreadOf(ad, read),
    warn: read.neverQuotePrices && adQuotes({ ...c, headline }, note) ? PREVIEW.neverQuote : null
  };
}
function personRank(p) {
  if (p.talk === "waiting" || p.talk === "call") return 0;
  if (p.cal.kind !== "none") return 1;
  return p.talk === "talking" ? 2 : 3;
}
function talkOf(p, today) {
  switch (p.talk) {
    case "waiting":
      return { text: DRAWER.people.waiting(daysWord(daysBetween(p.day, today))), tone: "warn" };
    case "call":
      return { text: DRAWER.people.callNumber, tone: "warn" };
    case "talking":
      return { text: DRAWER.people.talking, tone: "plain" };
    default:
      return { text: DRAWER.people.quietSince(dayShort(p.quietSince ?? p.day)), tone: "plain" };
  }
}
function calOf(p) {
  const c = p.cal;
  switch (c.kind) {
    case "ahead":
      return { text: DRAWER.people.ahead(dayWord(c.day), c.time), tone: "plain", note: null };
    case "kept":
      return { text: DRAWER.people.kept(dayWord(c.day)), tone: "plain", note: DRAWER.people.marked };
    case "missed":
      return { text: DRAWER.people.missed(dayWord(c.day)), tone: "plain", note: DRAWER.people.marked };
    case "past":
      return { text: DRAWER.people.past(dayWord(c.day)), tone: "plain", note: DRAWER.people.notMarked };
    default:
      return { text: DRAWER.people.nothing, tone: "plain", note: null };
  }
}
function drawerDoorOf(p) {
  const waits = p.talk === "waiting" || p.talk === "call";
  if (waits && p.threadId !== null) return { to: `inbox/${p.threadId}`, tip: DRAWER.people.tipConversation(p.name) };
  return { to: `clients/${p.personId}`, tip: DRAWER.people.tipPerson(p.name) };
}
function personRow(p, read) {
  const booked = p.cal.kind !== "none";
  const wrote = p.at !== null && p.day === read.today ? DRAWER.people.wroteToday(timeOf(p.at, read.timezone)) : null;
  const day = dayWord(p.day);
  return {
    personId: p.personId,
    threadId: p.threadId,
    ...adPersonWho(p.name),
    when: wrote ?? (p.how === "wrote" ? DRAWER.people.wrote(day) : DRAWER.people.number(day)),
    said: p.said,
    talk: booked ? null : talkOf(p, read.today),
    cal: calOf(p),
    booked,
    door: drawerDoorOf(p)
  };
}
function adPeopleOf(ad, t, o) {
  const mine = o.read.people.filter((p) => p.adId === ad.id);
  const rows = mine.map((p, i) => ({ p, i })).sort((a, b) => personRank(a.p) - personRank(b.p) || a.i - b.i).map(({ p }) => personRow(p, o.read));
  const total = counted(ad) ? t.inTouch : 0;
  let empty = null;
  if (!counted(ad)) empty = DRAWER.people.emptyCalls;
  else if (!started(ad)) empty = DRAWER.people.emptyReview;
  else if (rows.length === 0) empty = DRAWER.people.emptyQuiet;
  return {
    title: DRAWER.people.title,
    total,
    filters: [
      { id: "booked", label: DRAWER.people.booked, n: t.booked },
      { id: "not-yet", label: DRAWER.people.notYet, n: Math.max(0, total - t.booked) }
    ],
    rows,
    all: total > 0 ? { words: DRAWER.people.all(total), to: o.peopleTo } : null,
    empty
  };
}

// src/ads/drawer-edit.ts
var ZIPS_PREFIX = "zips:";
var areaValueOf = (area) => area.kind === "radius" ? String(area.miles) : `${ZIPS_PREFIX}${area.zips.join(",")}`;
function areaOfValue(value) {
  if (value.startsWith(ZIPS_PREFIX)) {
    return { kind: "zips", zips: value.slice(ZIPS_PREFIX.length).split(",").filter(Boolean) };
  }
  return { kind: "radius", miles: Number(value) };
}
function zipIssue(text, have) {
  const zip = text.trim();
  if (!new RegExp(`^\\d{${ADS_ZIP_DIGITS}}$`).test(zip)) return ZIPS.bad(ADS_ZIP_DIGITS);
  return have.includes(zip) ? ZIPS.already(zip) : null;
}
var ROUND_TO_MINOR = 10 * MINOR_PER_UNIT;
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
  const pct2 = rule.maxStep === null ? 0 : Math.round(rule.maxStep * 100);
  const last = saved.budgetChangedDay ?? null;
  const next = rule.waitDays > 0 && last !== null ? addDays(last, rule.waitDays) : null;
  return {
    savedMinor: now,
    step: rule.maxStep === null ? null : { lo: Math.ceil(now * (100 - pct2) / 100), hi: Math.floor(now * (100 + pct2) / 100), share: rule.maxStep },
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
function editOf(ad, t, o) {
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
function raiseOf(ad, next) {
  const by = next.budget.amountMinor - ad.budget.amountMinor;
  return by > 0 ? { total: ad.budget.mode === "total", to: next.budget.amountMinor, by } : null;
}
function editFootOf(o) {
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

// src/ads/drawer.ts
var connectionsDoor = () => ({ words: SETTINGS_DOOR, to: ADS_DOORS.accounts });
var renewDoor = () => ({ words: DRAWER.callout.renew, to: ADS_DOORS.accounts });
var plainPart = (text) => ({ tone: "plain", text, door: null, acts: [] });
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
var reportRoute = (ad, read) => `reports/ads:${read.window.from}~${read.window.to}:ad:${ad.id}`;
function adModel(ad, read, config, saved) {
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

// src/ads/new-ad-parts.ts
var settingsDoor = () => ({ words: SETTINGS_DOOR, to: ADS_DOORS.accounts });
var NAME_MAX = {
  meta: null,
  google: ADS_GOOGLE_NAME_MAX,
  tiktok: ADS_DISPLAY_NAME_MAX
};
function shownAsFor(read, platform) {
  const last = read.ads.filter((a) => a.platform === platform && a.madeHere).sort((a, b) => b.startDay.localeCompare(a.startDay)).at(0);
  const max = NAME_MAX[platform];
  const name = last ? last.shownAs.name : read.business.name;
  return {
    name: max === null ? name : name.slice(0, max).trimEnd(),
    handle: platform === "meta" && last ? last.shownAs.handle : null
  };
}
function shownAsOf(read, platform) {
  const s = shownAsFor(read, platform);
  const max = NAME_MAX[platform];
  const w = NEW_AD.step2.shownAs;
  return {
    label: w.label,
    line: w.line(s.name, s.handle),
    limit: max === null ? null : w.limit(max),
    door: { words: w.door, to: ADS_DOORS.accounts }
  };
}
var opensUrlOf = (read, opens) => opens === "page" ? read.business.page : read.business.site;
var hostOf = (url) => url.replace(/^[a-z]+:\/\//i, "").split("/")[0] ?? url;
var pathOf = (url) => NEW_AD.opens.path(hostOf(url));
function opensOf(draft, read) {
  if (draft.platform !== "google") return null;
  const w = NEW_AD.opens;
  return {
    label: w.label,
    group: w.group,
    picked: draft.opens,
    choices: [
      { id: "page", label: w.page, address: read.business.page },
      { id: "site", label: w.site, address: read.business.site }
    ],
    note: draft.opens === "page" ? w.pageNote : w.siteNote
  };
}
var searchThemesFor = (offer, word) => GOOGLE_SEARCH.themes({ offer, a: appointmentWords(word).a });
function searchOf(ad, platform) {
  if (platform !== "google") return null;
  const w = NEW_AD.step2.search;
  return { label: w.label, themes: ad.searchThemes, leftOut: w.leftOut(ad.leftOut), note: w.note };
}
var scheduleAllowed = (draft) => !SCHEDULE_NEEDS_TOTAL[draft.platform] || draft.mode === "total";
var scheduleOf = (draft) => draft.platform !== "google" && scheduleAllowed(draft) ? draft.schedule : "always";
function scheduleVM(draft, read) {
  if (draft.platform === "google") return { kind: "line", text: NEW_AD.step4.openOnlyGoogle };
  const allowed = scheduleAllowed(draft);
  const on = scheduleOf(draft) === "open-hours";
  const hint = !allowed ? NEW_AD.step4.openOnlyMeta : on ? NEW_AD.step4.openOnlyOn : NEW_AD.step4.openOnlyOff;
  return { kind: "switch", label: NEW_AD.step4.openOnly(read.business.hours), hint, on, locked: !allowed };
}
function budgetLines(draft, config, o) {
  const p = draft.platform;
  const rule = BUDGET_RULES[p];
  const floor = config.minPerDayMinor[p];
  const floorSaid = CHIPS.floor(p, floor === null ? null : moneyOf(floor, o.currency), rule.totalMaxDays);
  const lines = [];
  if (draft.mode === "total") {
    lines.push(floorSaid, CHIPS.stops(p));
  } else {
    lines.push(NEW_AD.step4.dailyAbout(o.perDay));
    if (floor !== null) lines.push(floorSaid);
    if (p === "meta") lines.push(CHIPS.dailyOver);
    if (p === "google" && rule.dailyIsAverage) lines.push(NEW_AD.step4.googleAverage(ADS_GOOGLE_DAILY));
  }
  if (p === "meta" && rule.changeRelearns) lines.push(NEW_AD.step4.relearn);
  if (rule.maxStep !== null) lines.push(NEW_AD.step4.tiktokChange(rule.maxStep, rule.waitDays));
  if (draft.door === "whatsapp") lines.push(NEW_AD.step4.fees);
  return lines;
}
var COSMETIC = /\bcosmetic/i;
var isCosmetic = (service) => service !== void 0 && (service.cosmetic === true || COSMETIC.test(service.name));
function agesOf(draft, service) {
  const p = draft.platform;
  if (p === "google") return null;
  const cosmetic = p === "tiktok" && isCosmetic(service);
  const w = NEW_AD.step3;
  let why = w.agesWhyDefault(PLATFORM_OWNER[p]);
  if (cosmetic) why = w.agesWhyCosmetic;
  else if (draft.special && p === "meta") why = w.agesWhy;
  const floor = cosmetic ? ADS_AGE_FLOOR_COSMETIC : ADS_AGE_FLOOR;
  return { label: w.agesLabel, line: w.ageLine(floor), why, floor };
}
function setForOf(o) {
  const { draft, ad, read } = o;
  const age = o.ages ? o.ages.floor : ADS_AGE_FLOOR;
  const hours = ad.schedule === "open-hours" ? read.business.hours : null;
  let rows;
  if (draft.platform === "google") {
    const more = NEW_AD.step2.googleMore({
      offer: ad.offer,
      business: read.business.name,
      price: adServiceOf(read, ad.serviceId)?.note ?? ""
    });
    rows = SET_FOR_YOU.google({
      headlines: ad.copy.headlines.length + more.headlines.length,
      descriptions: ad.copy.lines.length + more.descriptions.length,
      hours: read.business.hours,
      seconds: ADS_CALL_SECONDS,
      leftOut: ad.leftOut
    });
  } else if (draft.platform === "tiktok") {
    rows = SET_FOR_YOU.tiktok({ age, confirm: draft.doubleCheck, days: ADS_LEAD_DAYS, hours });
  } else {
    rows = SET_FOR_YOU.meta({ age, result: NEW_AD.step5.result[draft.door], hours, adjust: draft.adjust });
  }
  return { label: NEW_AD.step5.setFor, rows };
}
var plainRow = (text, tone = "ok") => ({
  text,
  tone,
  note: null,
  door: null,
  block: null
});
var AD_NOT_READY = { "not-connected": "notConnected", choose: "choose", lapsed: "lapsed" };
function needRow(r) {
  const unmet = r.tone === "warn" && r.door !== null;
  return {
    text: r.text,
    tone: unmet ? "fail" : r.tone,
    note: r.note ?? null,
    door: r.door,
    block: unmet ? NEW_AD.blocked.need(r.fix ?? r.text) : null
  };
}
function accountRowsOf(draft, read, needs) {
  const status = adAccountOf(read, draft.platform)?.status ?? "not-connected";
  if (status === "connected") return needs.map(needRow);
  const owner = PLATFORM_OWNER[draft.platform];
  return [
    {
      text: CHECKS.account[status](owner),
      tone: "fail",
      note: null,
      door: settingsDoor(),
      block: NEW_AD.blocked[AD_NOT_READY[status]](owner)
    }
  ];
}
var PRICE = /[$£€]\s?\d+(?:,\d{3})*(?:\.\d+)?/g;
var pricesIn = (text) => text.match(PRICE) ?? [];
function fitRows(ad, read) {
  const w = NEW_AD.step2.where;
  const rows = [];
  if (ad.platform === "meta") {
    const { headline, text } = ad.copy;
    if (headline.length > ADS_COPY_LIMITS.headlineFacebook) {
      const n = headline.length;
      rows.push(plainRow(CHECKS.headlineLong({ n, max: ADS_COPY_LIMITS.headlineFacebook, where: w.facebook }), "warn"));
    }
    if (text.length > ADS_COPY_LIMITS.textInstagram) {
      const n = text.length;
      rows.push(plainRow(CHECKS.textLong({ n, max: ADS_COPY_LIMITS.textInstagram, where: w.instagram }), "warn"));
    }
  }
  if (ad.platform === "google") {
    const price = adServiceOf(read, ad.serviceId)?.note ?? "";
    const more = NEW_AD.step2.googleMore({ offer: ad.offer, business: read.business.name, price });
    const heads = [...ad.copy.headlines, ...more.headlines];
    const descs = [...ad.copy.lines, ...more.descriptions];
    const longHead = heads.find((h) => h.length > ADS_GOOGLE_HEADLINE_MAX);
    const longDesc = descs.find((d) => d.length > ADS_GOOGLE_DESCRIPTION_MAX);
    if (longHead !== void 0) {
      const o = { n: longHead.length, max: ADS_GOOGLE_HEADLINE_MAX, what: "headline" };
      rows.push(plainRow(CHECKS.googleLong(o), "warn"));
    }
    if (longDesc !== void 0) {
      const o = { n: longDesc.length, max: ADS_GOOGLE_DESCRIPTION_MAX, what: "description" };
      rows.push(plainRow(CHECKS.googleLong(o), "warn"));
    }
  }
  return rows.length > 0 ? rows : [plainRow(CHECKS.fits)];
}
function priceRows(ad, read) {
  const note = adServiceOf(read, ad.serviceId)?.note ?? "";
  const known = pricesIn(note);
  const wrong = pricesIn(`${ad.copy.headline} ${ad.copy.text}`).filter((p) => !known.includes(p));
  const rows = [];
  if (read.neverQuotePrices && adQuotes(ad.copy, note)) rows.push(plainRow(CHECKS.priceQuote, "warn"));
  const first = wrong.at(0);
  if (first !== void 0) {
    rows.push(plainRow(CHECKS.priceDiffers({ said: first, note: note || NEW_AD.step2.quoted }), "warn"));
  }
  return rows.length > 0 ? rows : [plainRow(CHECKS.price)];
}
function adRowsOf(draft, ad, read) {
  const rows = [plainRow(CHECKS.words), plainRow(CHECKS.promises)];
  rows.push(...fitRows(ad, read), ...priceRows(ad, read));
  if (read.rating && draft.door === "whatsapp") {
    const r = read.rating;
    rows.push(plainRow(CHECKS.rating(ratingLine({ stars: r.stars, reviews: r.reviews, day: dayShort(r.asOf) }))));
  }
  if (draft.postId !== null && draft.postMode === "as-is") rows.push(plainRow(CHECKS.post));
  if (!draft.special) rows.push(plainRow(CHECKS.special));
  if (draft.door === "form") rows.push(plainRow(CHECKS.privacy), plainRow(CHECKS.yes), plainRow(CHECKS.noHealth));
  if (draft.door === "call") rows.push(plainRow(CHECKS.businessName));
  return rows;
}
function checkedOf(o) {
  const rows = [...accountRowsOf(o.draft, o.read, o.needs), ...adRowsOf(o.draft, o.ad, o.read)];
  const met = rows.filter((r) => r.tone === "ok").length;
  return { said: NEW_AD.step5.count(met, rows.length), met, of: rows.length, rows };
}
function blockedFrom(rows) {
  const bad = rows.find((r) => r.tone === "fail");
  return bad && bad.block !== null && bad.door !== null ? { text: bad.block, door: bad.door } : null;
}
var adFollowOn = (draft, id) => draft.alsoGoogle && draft.platform === "meta" ? newAdFromRoute("google", id) : null;

// src/ads/new-ad.ts
function newestPostFor(posts, platform, kind) {
  if (platform === "google") return void 0;
  return posts.filter((p) => p.platform === platform && (kind === void 0 || p.kind === kind)).sort((a, b) => b.day.localeCompare(a.day)).at(0);
}
var formatFor = (platform) => platform === "tiktok" ? "video" : "photo";
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
function newAdDefaults(read, config) {
  const smallest = smallestPreset(config);
  return { ...baseDraft(read), presetId: smallest ? smallest.id : "own" };
}
var milesOf = (ad, fallback) => ad.area.kind === "radius" ? ad.area.miles : fallback;
function formatOf(ad, platform, read) {
  if (platform === "tiktok" || ad.media.kind === "video") return "video";
  const postId = ad.media.kind === "post" ? ad.media.postId : null;
  return read.posts.find((p) => p.id === postId)?.kind ?? "photo";
}
function newAdFrom(ad, how, read) {
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
function starterCopy(o) {
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
var draftService = (draft, read) => adServiceOf(read, draft.serviceId) ?? read.services.at(0) ?? { id: "", name: "", note: "" };
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
function draftAd(draft, read, config, id) {
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
var reachLine = (said) => [said.state, ...said.parts].join(" \xB7 ");
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
function newAdModel(draft, read, config) {
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

// src/reports/reports.ts
var REPORT_RANGES = [
  { days: 7, id: "7d", label: "7 days" },
  { days: 30, id: "30d", label: "30 days" },
  { days: 90, id: "90d", label: "90 days" },
  { days: null, id: "month", label: "Month" }
];

// src/reports/report-periods.ts
var REPORT_PERIOD_IDS = REPORT_RANGES.map((r) => r.id);
var MOST_DAYS = Math.max(...REPORT_RANGES.map((r) => r.days ?? 0));
var reportRangeKey = (range) => typeof range === "string" ? range : `${range.from}~${range.to}`;

// src/reports/lenses.ts
var NOTHING_CAME_IN = (r) => ({
  title: "Nothing came in",
  body: `Nobody wrote or called between ${r.since} and ${r.until}.`,
  door: null
});
var REPORT_LENSES = [
  {
    id: "overview",
    label: "Overview",
    sub: "how the period went, and what needs a look",
    shownWhen: "always",
    role: "viewer",
    empty: NOTHING_CAME_IN
  },
  {
    id: "receptionist",
    label: "Receptionist",
    sub: "who answered, how fast, and why it stopped",
    shownWhen: "always",
    role: "viewer",
    empty: NOTHING_CAME_IN
  },
  {
    id: "people",
    label: "People",
    sub: "who reached you, whether you can reach them, and who is slipping away",
    shownWhen: "always",
    role: "viewer",
    empty: NOTHING_CAME_IN
  },
  {
    id: "pipeline",
    label: "Pipeline",
    sub: "proposals, and what became of them",
    shownWhen: "deals_on",
    role: "viewer",
    empty: () => ({
      title: "No proposals to report",
      body: "Proposals you send, and what became of them, show here. Where your customers book directly, there is nothing to report.",
      door: { label: "Open Settings", to: "admin/workspace" }
    })
  },
  {
    id: "campaigns",
    label: "Campaigns",
    sub: "did your messages reach people, did they answer, and what is stuck",
    shownWhen: "always",
    role: "viewer",
    empty: (r) => ({
      title: "Nothing went out",
      body: `No broadcast or campaign run reached anyone between ${r.since} and ${r.until}, and nobody said yes or asked to stop.`,
      door: { label: "Open Sent", to: "broadcasts" }
    })
  },
  {
    id: "ads",
    label: "Ads",
    sub: "what your ads cost, who they brought, and who booked",
    shownWhen: "ads_on",
    role: "viewer",
    empty: (r) => ({
      title: "No ads in this period",
      body: `Nothing was spent on ads, and nobody got in touch through one, between ${r.since} and ${r.until}.`,
      door: { label: "Open Ads", to: ADS_ROUTE }
    })
  },
  {
    id: "reviews",
    label: "Reviews",
    sub: "what customers say on Google",
    shownWhen: "always",
    role: "viewer",
    empty: () => ({
      title: "Find your business on Google once.",
      body: "Its rating, its count and its newest reviews show here for the period, with a line on Today and a row on the bell when one lands.",
      door: { label: "Find it", to: "start/find" }
    })
  }
];
var lensRoute = (id, days = null, scope = null) => {
  const narrowed = id === "ads" && scope !== null && scope.kind !== "all" ? adsScopeKey(scope) : null;
  if (days === null && narrowed === null) return id === "overview" ? "reports" : `reports/${id}`;
  const rest = [days === null ? null : reportRangeKey(days), narrowed].filter((w) => w !== null).join(":");
  return id === "overview" ? `reports/${rest}` : `reports/${id}:${rest}`;
};
var LENS_ROUTES = REPORT_LENSES.map((l) => lensRoute(l.id));
function lensOf(id) {
  const found = REPORT_LENSES.find((l) => l.id === id);
  if (!found) throw new Error(`Reports has no lens ${id}`);
  return found;
}
var lensEmpty = (id, range) => lensOf(id).empty(range);

// src/ads/results/words-results.ts
var RESULTS = {
  /** The sheet: the quiet line it opens under, and its name. */
  kicker: "Your ads \xB7 last 30 days",
  title: "What your ads brought",
  scope: { label: "Which ads", all: "All ads", platforms: "Where they run", ads: "One ad" },
  /** The foot's door, and the empty lens's door. */
  fullReport: "Full report",
  openAds: "Open Ads",
  /** Under the head: what the days cover, and when the numbers were read. */
  pane: (o) => `${o.dates} \xB7 ${plural(o.days, "day")}${o.readAt ? ` \xB7 read ${o.readAt}` : ""}`,
  /** What the head says the results are of: `your ads`, `your Google ads`, an ad's own name. */
  of: { all: "your ads", platform: (platform) => `your ${platform} ads`, ad: (name) => name },
  /** The head: the page's sentence, said of whatever the results are narrowed to. */
  head: {
    booked: (o) => ({
      strong: `${o.booked} of ${o.touch}`,
      rest: ` new people from ${o.of} have booked.`
    }),
    touchOnly: (o) => ({
      strong: `${o.touch}`,
      rest: ` new people got in touch through ${o.of}.`
    }),
    /** Only Google's calls stand here: its count, and not people. */
    calls: (o) => ({
      strong: `${o.calls}`,
      rest: ` ${o.calls === 1 ? "call" : "calls"} from ${o.of}, Google's count. Calls aren't matched to people yet.`
    }),
    quiet: (o) => ({ strong: "", rest: `Nobody new has got in touch through ${o.of} yet.` })
  },
  /** By day: two small charts, what was spent and who it brought. */
  days: {
    title: "By day",
    spent: "Spent",
    spentTitle: "Spent a day",
    peopleTitle: "New people a day",
    booked: "Booked since",
    waiting: "Not booked yet",
    peopleLine: "Dark part: booked since. People only: calls are Google's count and are left out.",
    spentAria: (o) => `${o.total} spent over ${plural(o.days, "day")}.`,
    peopleAria: (o) => `${peopleWord(o.people)} got in touch over ${plural(o.days, "day")}; ${o.booked} ${o.booked === 1 ? "has" : "have"} booked.`,
    /** A tooltip's line for a day still settling. */
    settlingDay: "Still settling: a person can still book.",
    /** `a` is the workspace's appointment word with its article: `an appointment`. */
    settling: (days, a) => `The last ${days} days are still settling, so ${a} can still land on them.`,
    callsNote: (n) => `${plural(n, "call")} Google counted aren't in the people chart: its count, not people.`,
    severalCurrencies: "These ads are paid in more than one currency, so what was spent isn't drawn as one chart. Each total is in its own currency.",
    columns: { day: "Day", spent: "Spent", people: "Got in touch", booked: "Booked", calls: "Calls (Google's count)" }
  },
  /** From first contact to booked: people only. */
  funnel: {
    title: "From got in touch to booked",
    line: "People only. Calls are Google's count and aren't in it.",
    touch: "Got in touch",
    reply: "Got a reply",
    booked: "Booked",
    columns: ["Step", "People"],
    /** The middle step is the receptionist's first reply, which is counted over the last 30 days. */
    replyWindow: "Replies are counted for the last 30 days only.",
    replyOf: "Your receptionist's first reply, to the people who wrote. A form leaves a number to call back instead."
  },
  /** What came of the appointments: the page's own rows, when they are of the same people. */
  cameBack: {
    /** `many` is the workspace's appointment word, plural. */
    title: (many) => `What came of the ${many}`,
    forAll: "Counted for all your ads together, so it isn't split by platform or by ad.",
    forThirty: "Counted for the last 30 days, so it isn't shown for other days.",
    columns: ["What came of it", "Count"]
  },
  /** The tables. */
  byPlatform: { title: "By platform", line: "Each platform's own account, in its own currency." },
  byDoor: {
    title: "By what the ad asks",
    line: "A chat, a call and a form are counted in their own ways, so these are not set side by side in bars."
  },
  byAd: { title: "By ad" },
  heads: {
    platform: "Platform",
    door: "Ask",
    ad: "Ad",
    ads: "Ads",
    spent: "Spent",
    touch: "In touch",
    booked: "Booked",
    each: "Each",
    state: "State"
  },
  /** The ads a row of the platform and door tables stands for. */
  adsCount: (n) => plural(n, "ad"),
  /** What the platforms say: one card each, never added together. */
  theirs: {
    title: "What the platforms say",
    line: "Each platform counts in its own way, so these are never added together or set against Chanlytics' count.",
    card: (owner) => `${owner}'s own numbers`,
    read: (time) => `Read ${time}.`,
    dash: "A dash is a number the platform didn't give.",
    window: "The platforms' own numbers are read for the last 30 days only.",
    ad: "Ad",
    columns: {
      meta: { seen: "Seen by", taps: "Taps", chats: "Chats started", leads: "Forms sent" },
      google: { clicks: "Clicks", calls: "Calls", longCalls: "Over 60 seconds" },
      tiktok: { seen: "Seen by", taps: "Taps", leads: "Forms sent" }
    }
  },
  /** Where there is nothing to draw (days with nothing in them say it in the lens registry's words). */
  empty: {
    noAds: { title: "No ads yet", body: "When you turn an ad on, what it spent and who it brought show here." }
  },
  /** The Overview's one fact: what the ads brought over the same days, and the door to them. */
  fact: {
    brought: (n) => `Your ads brought ${n === 1 ? "1 new person" : `${n} new people`}`,
    nobody: "Your ads haven't brought anyone new yet",
    sub: (o) => o.booked === null ? `${o.spent} spent` : `${o.booked} ${o.booked === 1 ? "has" : "have"} booked \xB7 ${o.spent} spent`,
    door: "Open Ads"
  }
};

// src/ads/results/results.ts
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
var unitsOf = (minor) => minor / 100;
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
function cameBackOf2(o) {
  const { read } = o;
  const title = RESULTS.cameBack.title(appointmentWords(read.appointmentWord).many);
  if (!read.calendar.linked) return { title, why: FIGURES.needsLink };
  if (o.scope.kind !== "all") return { title, why: RESULTS.cameBack.forAll };
  return o.windowRead ? { title, tile: tilesOf(read).cameBack } : { title, why: RESULTS.cameBack.forThirty };
}
var cell2 = (value, unit = null, why = null) => ({ value, unit, why });
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
    const none = cell2(DASH, null, LEDGER.notStarted);
    return { ...base, inTouch: none, booked: none, each: none };
  }
  const inTouch = people.length === 0 ? cell2(String(calls), DOOR.call.unit) : cell2(String(p.touch), unitOf(people));
  if (people.length === 0) {
    return {
      ...base,
      inTouch,
      booked: cell2(DASH, LEDGER.notMatched, FIGURES.callsNotMatched),
      each: cell2(DASH, null, FIGURES.callsNotMatched)
    };
  }
  if (!scoped.calendar.linked) {
    const why = FIGURES.needsLink;
    return { ...base, inTouch, booked: cell2(DASH, null, why), each: cell2(DASH, null, why) };
  }
  const each = p.each === null ? cell2(DASH, p.booked === 0 ? LEDGER.noneYet : LEDGER.only(p.booked), LEDGER.tooFew) : cell2(moneyOf(p.each.minor, p.each.currency));
  return { ...base, inTouch, booked: cell2(String(p.booked)), each };
}
var byPlatformOf = (ads, scoped) => PLATFORMS.flatMap((p) => {
  const mine = ads.filter((ad) => ad.platform === p);
  return mine.length === 0 ? [] : [resultsRowOf(mine, scoped, p, PLATFORM_WORD[p])];
});
var byDoorOf = (ads, scoped) => DOOR_ORDER.flatMap((d) => {
  const mine = ads.filter((ad) => ad.door === d);
  return mine.length === 0 ? [] : [resultsRowOf(mine, scoped, d, DOOR[d].label)];
});
var resultsGrouped = (n) => n === null ? DASH : n.toLocaleString("en-US");
function theirsCells(t) {
  if (t.platform === "meta") return [resultsGrouped(t.reach), resultsGrouped(t.taps), resultsGrouped(t.chats), resultsGrouped(t.leads)];
  if (t.platform === "google") return [resultsGrouped(t.clicks), resultsGrouped(t.calls), resultsGrouped(t.longCalls)];
  return [resultsGrouped(t.reach), resultsGrouped(t.clicks), resultsGrouped(t.leads)];
}
var theirsColumns = (platform) => Object.values(RESULTS.theirs.columns[platform]);
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
var RESULTS_NOTHING = {
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
function adsResultsOf(read, config, at) {
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
    cameBack: cameBackOf2({ read, scope: at.scope, windowRead }),
    byPlatform: byPlatformOf(scoped.ads, scoped),
    byDoor: byDoorOf(scoped.ads, scoped),
    byAd: model.groups.flatMap((g) => g.rows),
    theirs: { cards: windowRead ? resultsTheirsOf(scoped.ads, read) : [], why: unread }
  };
}
function adsFactOf(vm) {
  const t = vm.totals;
  if (vm.empty !== null || t.touch === 0 && !t.spentAny) return null;
  return {
    text: t.touch === 0 ? RESULTS.fact.nobody : RESULTS.fact.brought(t.touch),
    sub: RESULTS.fact.sub({ booked: t.touch === 0 ? null : t.booked, spent: t.spent })
  };
}
export {
  ADS_ASK_MIN,
  ADS_ASK_MIN_CALLS,
  ADS_ASK_SOON_DAYS,
  ADS_CHANCE_Z,
  ADS_COPY_LIMITS,
  ADS_DAILY_CHOICES_MINOR,
  ADS_DEFAULT_CURRENCY,
  ADS_DEFAULT_MILES,
  ADS_DISPLAY_NAME_MAX,
  ADS_DOORS,
  ADS_END_SHIFTS,
  ADS_EXAMPLES,
  ADS_EXTEND_MAX_DAYS,
  ADS_FRESH_DAYS,
  ADS_GROUP_FROM,
  ADS_MOVE_DAYS,
  ADS_MOVE_STEP_MINOR,
  ADS_OWN_DAYS,
  ADS_OWN_START_MINOR,
  ADS_PERMISSION_WARN_DAYS,
  ADS_READ,
  ADS_SETTLE_DAYS,
  ADS_SOFT_NEEDS,
  ADS_SPECIAL_MILES,
  ADS_TOTAL_STEPS,
  ADS_WINDOW_DAYS,
  ADS_ZIP_DIGITS,
  ASK,
  BOOK_ONLINE,
  BUDGET_RULES,
  CHANGED,
  CHECKS,
  CHIPS,
  CHOOSE,
  CONNECT,
  COUNTED,
  DASH,
  DOOR,
  DOOR_NEEDS,
  DOOR_ORDER,
  DRAWER,
  EDIT,
  EXAMPLE,
  FIGURES,
  GATE,
  GROUP,
  HEAD,
  LEDGER,
  LIST,
  NEW_AD,
  NO_AD,
  NO_ADS,
  PEOPLE_TAB,
  PHONE,
  PLATFORMS,
  PLATFORM_OWNER,
  PLATFORM_SURFACE,
  PLATFORM_WORD,
  PREVIEW,
  REACH_NOTE,
  REFUSED,
  RESULTS,
  REVIEW_WITHIN,
  SCHEDULE_NEEDS_TOTAL,
  SENTENCE,
  SETTINGS_DOOR,
  SHOWN,
  STANDING,
  STANDING_CHECKS,
  STATE,
  STATE_WORD,
  TILES,
  TOO_EARLY_DAYS,
  V0,
  ZIPS,
  accountRows,
  adAccountOf,
  adBarsOf,
  adFollowOn,
  adModel,
  adPeopleOf,
  adPersonInitials,
  adPersonWho,
  adPreviewOf,
  adQuotes,
  adServiceOf,
  adStateOf,
  adsFactOf,
  adsModel,
  adsResultsOf,
  allWord,
  areaOfValue,
  areaValueOf,
  areaWord,
  askWhy,
  checkFix,
  checkOk,
  checkWords,
  connectModel,
  costEach,
  countCtx,
  counted,
  countedDoor,
  currencySymbol,
  dayLines,
  dayOfIso,
  dayShort,
  dayWord,
  daysWord,
  doorNeeds,
  draftAd,
  eachInTouch,
  earlierCost,
  editFootOf,
  editOf,
  endsWhenOf,
  figureWords,
  firstMissing,
  firstReadyDoor,
  groupMeta,
  isConnected,
  leadOf,
  leftOfAd,
  leftOfMoney,
  minorOfUnits,
  moneyOf,
  needsSecond,
  newAdDefaults,
  newAdFrom,
  newAdModel,
  newestPostFor,
  noAdsOf,
  pageTotals,
  peopleWord,
  perDayOf,
  phoneOf,
  platformMeta,
  platformsFor,
  quietOf,
  quotesPrice,
  raiseOf,
  ratingLine,
  reachNoteOf,
  readTime,
  resultsOf,
  sentenceParts,
  settling,
  smallestPreset,
  started,
  starterCopy,
  sum,
  sumMoney,
  sumsOf,
  tilesOf,
  timeOf,
  totalOf,
  totalsOf,
  v0Of,
  viewState,
  zipIssue
};
