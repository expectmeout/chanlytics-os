import { plural } from "../shared/words.js";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayParts = (iso) => {
  const d = /* @__PURE__ */ new Date(`${iso}T12:00:00Z`);
  return { dow: DOW[d.getUTCDay()] ?? "", mon: MON[d.getUTCMonth()] ?? "", date: d.getUTCDate() };
};
export function dayWord(iso) {
  const p = dayParts(iso);
  return `${p.dow} ${p.date} ${p.mon}`;
}
export function dayLines(iso) {
  const p = dayParts(iso);
  return [p.dow, `${p.date} ${p.mon}`];
}
export function dayShort(iso) {
  const p = dayParts(iso);
  return `${p.date} ${p.mon}`;
}
export const daysWord = (n) => n <= 0 ? "today" : plural(n, "day");
export const peopleWord = (n) => plural(n, "person", "people");
export const allWord = (n) => `All ${n}`;
export function adPersonInitials(name) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("");
}
export const ADS_DOORS = { accounts: "admin/integrations", people: "reports/people" };
export const SETTINGS_DOOR = "Open Settings \u203A Connections";
export const PLATFORM_WORD = {
  meta: "Facebook and Instagram",
  google: "Google",
  tiktok: "TikTok"
};
export const PLATFORM_OWNER = { meta: "Meta", google: "Google", tiktok: "TikTok" };
export const PLATFORM_SURFACE = {
  meta: "Facebook and Instagram",
  google: "Google Search",
  tiktok: "TikTok"
};
export const REVIEW_WITHIN = {
  meta: "usually within a day",
  google: "usually within a business day",
  tiktok: "usually within a day"
};
export const DOOR = {
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
export const DOOR_ORDER = ["whatsapp", "call", "form"];
const CHECK_LABEL = {
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
const CHECK_LABEL_ON = {
  meta: { payment: "Payment method in Meta" },
  google: { "account-active": "Google Ads account active", payment: "A card added in Google Ads" },
  tiktok: { "account-active": "TikTok ad account active", payment: "Payment method in TikTok" }
};
export function checkWords(id, platform) {
  return CHECK_LABEL_ON[platform][id] ?? CHECK_LABEL[id];
}
const CHECK_FIX = {
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
const PAYMENT_FIX = {
  meta: "Add a payment method in Meta",
  google: "Add a card in Google Ads",
  tiktok: "Add balance in TikTok"
};
export const checkFix = (id, platform) => id === "payment" ? PAYMENT_FIX[platform] : CHECK_FIX[id];
export const REACH_NOTE = {
  whatsapp: "WhatsApp linked",
  callChecking: "your number is being checked",
  callApproved: "your number is approved",
  form: { meta: "Page and number linked", google: "number linked", tiktok: "TikTok account linked" },
  /** When the last person got in touch, said by its day (`9:02 AM today`, `Fri 9 Oct`): a number on a form, a message on WhatsApp. */
  lastNumber: (when) => `last number arrived ${when}`,
  lastMessage: (when) => `last message arrived ${when}`
};
export const STATE_WORD = {
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
export const STATE = {
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
export const GATE = {
  turnOn: "turn on an ad",
  change: "change an ad",
  end: "end an ad",
  again: "run an ad again",
  resume: "turn an ad back on",
  pause: "pause an ad"
};
export const REFUSED = {
  stale: "This ad changed since you opened it. Look again.",
  gone: "This ad isn't here any more.",
  adopted: "This ad was made on the platform itself. Here you can pause it and turn it back on.",
  maximum: "The most this can spend changed. Look again."
};
export const SENTENCE = {
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
export const ADS_EXAMPLES = [
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
export const EXAMPLE = {
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
