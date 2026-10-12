/**
 * The words the Ads page, its drawer and New ad share: platforms and doors, days, states, the one sentence an ad is read
 * back as, what each check an account stands on is called, the roles' refusals and the Example menu. Page-only, like the
 * models that read them (`@chanlytics/contracts/ads-page`), after the glossary rows 'Ad', 'Ad account' and 'Runs on'.
 * Trade-neutral (Harbor Studio, never a trade's own words); the appointment word comes in as an argument, never written in.
 *
 * Words only, no data: the models make the values these take, and the pages draw what the models hand them. The page's
 * own sentences are words-page.ts, the drawer's words-drawer.ts, New ad's words-new.ts.
 */
import { plural } from "../shared/words";
import type { AdCheckId, AdDoor, AdPlatform, AdState } from "./ads";

// ---------------------------------------------------------------------------------------------------------------------
// Days and people

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dayParts = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return { dow: DOW[d.getUTCDay()] ?? "", mon: MON[d.getUTCMonth()] ?? "", date: d.getUTCDate() };
};

/** `Sat 31 Oct`. */
export function dayWord(iso: string): string {
  const p = dayParts(iso);
  return `${p.dow} ${p.date} ${p.mon}`;
}

/** `Sat 31 Oct` as two lines for a narrow column: the weekday, then the date. */
export function dayLines(iso: string): string[] {
  const p = dayParts(iso);
  return [p.dow, `${p.date} ${p.mon}`];
}

/** `31 Oct`. */
export function dayShort(iso: string): string {
  const p = dayParts(iso);
  return `${p.date} ${p.mon}`;
}

/** Days as a person says them: `today`, `1 day`, `6 days`. */
export const daysWord = (n: number): string => (n <= 0 ? "today" : plural(n, "day"));

/** `1 person`, `26 people`. */
export const peopleWord = (n: number): string => plural(n, "person", "people");

/** `All 96`. */
export const allWord = (n: number): string => `All ${n}`;

/** Two initials from `Jordan P.`: `JP`. */
export function adPersonInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

/** Where the doors go: Settings › Connections, and Reports › People. */
export const ADS_DOORS = { accounts: "admin/integrations", people: "reports/people" } as const;

/** A door that goes to Settings says so (it is not a platform's own page). */
export const SETTINGS_DOOR = "Open Settings › Connections";

// ---------------------------------------------------------------------------------------------------------------------
// Platforms and doors

/** A platform as the owner says it. "Meta" only where billing, an account or a review is meant (PLATFORM_OWNER). */
export const PLATFORM_WORD: Record<AdPlatform, string> = {
  meta: "Facebook and Instagram",
  google: "Google",
  tiktok: "TikTok",
};

/** The company that checks, charges and reads: where billing, an account or a review is meant. */
export const PLATFORM_OWNER: Record<AdPlatform, string> = { meta: "Meta", google: "Google", tiktok: "TikTok" };

/** Where the platform's ad shows, in the sentence. */
export const PLATFORM_SURFACE: Record<AdPlatform, string> = {
  meta: "Facebook and Instagram",
  google: "Google Search",
  tiktok: "TikTok",
};

/** How long a platform says a check takes. */
export const REVIEW_WITHIN: Record<AdPlatform, string> = {
  meta: "usually within a day",
  google: "usually within a business day",
  tiktok: "usually within a day",
};

/** The kit Icon names the doors are drawn with. */
export type Glyph = "chat" | "phone" | "list";

interface DoorWords {
  /** The door's verb, as step 1 and the group head say it. */
  label: string;
  /** The one plain line under it. */
  line: string;
  /** Where it runs. */
  runsOn: string;
  glyph: Glyph;
  /** What the number under a door is of: `wrote`, `calls · Google's count`, `left a number`. */
  unit: string;
  /** The verb a person did: `wrote`, `called`, `left a number`. */
  did: string;
  /** The phone row's word for the door. */
  short: string;
  /** The word after "so they" in the sentence. */
  chip: string;
}

export const DOOR: Record<AdDoor, DoorWords> = {
  whatsapp: {
    label: "Message you on WhatsApp",
    line: "They tap the ad and a chat opens with your receptionist.",
    runsOn: "Runs on Facebook and Instagram.",
    glyph: "chat",
    unit: "wrote",
    did: "wrote",
    short: "WhatsApp",
    chip: "message you on WhatsApp",
  },
  call: {
    label: "Call you",
    line: "They tap Call and your phone rings. Your receptionist answers.",
    runsOn: "Runs on Google.",
    glyph: "phone",
    unit: "calls · Google's count",
    did: "called",
    short: "calls",
    chip: "call you",
  },
  form: {
    label: "Leave their number",
    line: "They fill in a short form. You get a name and a number to call back.",
    runsOn: "Runs on Facebook, Instagram or TikTok.",
    glyph: "list",
    unit: "left a number",
    did: "left a number",
    short: "a form",
    chip: "leave their number",
  },
};

/** Doors in the order the ledger and step 1 list them. */
export const DOOR_ORDER: readonly AdDoor[] = ["whatsapp", "call", "form"];

// ---------------------------------------------------------------------------------------------------------------------
// What an account stands on

/** What each check is called, by id; the platforms that name it differently say so. */
const CHECK_LABEL: Record<AdCheckId, string> = {
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
  "manager-link": "Chanlytics linked as your manager",
};

const CHECK_LABEL_ON: Record<AdPlatform, Partial<Record<AdCheckId, string>>> = {
  meta: { payment: "Payment method in Meta" },
  google: { "account-active": "Google Ads account active", payment: "A card added in Google Ads" },
  tiktok: { "account-active": "TikTok ad account active", payment: "Payment method in TikTok" },
};

/** A check's words, as a dot row says it: `Payment method in Meta`. */
export function checkWords(id: AdCheckId, platform: AdPlatform): string {
  return CHECK_LABEL_ON[platform][id] ?? CHECK_LABEL[id];
}

/** What to do when a check is not met, said as a step: `Add a payment method in Meta`. */
const CHECK_FIX: Record<AdCheckId, string> = {
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
  "manager-link": "Accept Chanlytics as your manager",
};

const PAYMENT_FIX: Record<AdPlatform, string> = {
  meta: "Add a payment method in Meta",
  google: "Add a card in Google Ads",
  tiktok: "Add balance in TikTok",
};

/** What to do about a check that is not met, as a step: `Add a card in Google Ads`. */
export const checkFix = (id: AdCheckId, platform: AdPlatform): string =>
  id === "payment" ? PAYMENT_FIX[platform] : CHECK_FIX[id];

/** What the reach line says last, by door: what the ad stands on, or when the last number arrived. */
export const REACH_NOTE = {
  whatsapp: "WhatsApp linked",
  callChecking: "your number is being checked",
  callApproved: "your number is approved",
  form: { meta: "Page and number linked", google: "number linked", tiktok: "TikTok account linked" } satisfies Record<
    AdPlatform,
    string
  >,
  /** When the last person got in touch, said by its day (`9:02 AM today`, `Fri 9 Oct`): a number on a form, a message on WhatsApp. */
  lastNumber: (when: string) => `last number arrived ${when}`,
  lastMessage: (when: string) => `last message arrived ${when}`,
};

// ---------------------------------------------------------------------------------------------------------------------
// States

/** The states an ad shows: its own, and `too-early`, which the fold reads and never stores. */
export const STATE_WORD: Record<AdState | "too-early", string> = {
  "setting-up": "Setting up",
  "couldnt-finish": "Couldn't finish",
  review: "In review",
  on: "On",
  paused: "Paused",
  "too-early": "Too early to judge",
  "needs-you": "Needs you",
  ended: "Ended",
  finished: "Finished",
};

export const STATE = {
  reviewSecond: (p: AdPlatform) => `${PLATFORM_OWNER[p]} is checking it, ${REVIEW_WITHIN[p]}`,
  settingUpSecond: (p: AdPlatform) => `Chanlytics is making it on ${PLATFORM_OWNER[p]}, paused`,
  couldntSecond: (p: AdPlatform) => `Paused on ${PLATFORM_OWNER[p]} · nothing spent`,
  /** When it ends: today, tomorrow (in the evening where the platform ends it at a time), or the day. */
  endsWhen: (o: { kind: "today" | "tomorrow" | "later"; evening: boolean; day: string }): string => {
    if (o.kind === "later") return o.day;
    if (o.kind === "today") return o.evening ? "this evening" : "today";
    return o.evening ? "tomorrow evening" : "tomorrow";
  },
  ends: (when: string) => `Ends ${when}`,
  daily: (perDayText: string) => `No end date · about ${perDayText}`,
  endedSecond: (day: string, booked: number, each: string | null) =>
    `Ended ${day} · ${booked} booked${each ? `, ${each} each` : ""}`,
  finishedSecond: (total: string) => `Spent its ${total}`,
  needsPayment: (p: AdPlatform) => PAYMENT_FIX[p],
  needsRejected: (p: AdPlatform) => `${PLATFORM_OWNER[p]} turned it down`,
  needsDefault: (p: AdPlatform) => `${PLATFORM_OWNER[p]} needs something from you`,
  needsPaused: (p: AdPlatform) => `Paused in ${PLATFORM_OWNER[p]}, not here`,
  needsPrice: "Your price changed in Services",
  needsPermission: (p: AdPlatform) => `${PLATFORM_OWNER[p]}'s permission to use the post is ending`,
};

/** What a role's refusal says the press would have done ("Your role can't turn on an ad"): the money presses are the owner's. */
export const GATE = {
  turnOn: "turn on an ad",
  change: "change an ad",
  end: "end an ad",
  again: "run an ad again",
  resume: "turn an ad back on",
  pause: "pause an ad",
};

/** Why a press was refused: the ad changed since it was drawn, is gone, or is not Chanlytics' to change. */
export const REFUSED = {
  stale: "This ad changed since you opened it. Look again.",
  gone: "This ad isn't here any more.",
  adopted: "This ad was made on the platform itself. Here you can pause it and turn it back on.",
  maximum: "The most this can spend changed. Look again.",
};

// ---------------------------------------------------------------------------------------------------------------------
// The sentence (drawer and New ad)

export const SENTENCE = {
  show: "Show ",
  /** An ad that has ended reads in the past. */
  showed: "Showed ",
  soPast: {
    whatsapp: "messaged you on WhatsApp",
    call: "called you",
    form: "left their number",
  } satisfies Record<AdDoor, string>,
  on: " on ",
  /** What comes before the area chip. */
  reach: {
    meta: " to people within ",
    google: " to people who live or are within ",
    tiktok: " to people in ",
  } satisfies Record<AdPlatform, string>,
  of: (street: string) => ` of ${street}`,
  so: "so they ",
  upTo: "up to ",
  inAllUntil: " in all until ",
  about: "about ",
  untilStop: ", until you stop it",
  blank: "___",
  /** Shown once, above the sentence, the first time it is opened. */
  tapHint: "Tap any highlighted word to change it",
};

// ---------------------------------------------------------------------------------------------------------------------
// The Example menu (the demo store's: nothing of it reaches a real workspace)

/** The examples the demo store draws, in the order the Example menu lists them. */
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
  "failed",
] as const;

export type AdsExample = (typeof ADS_EXAMPLES)[number];

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
    failed: "Could not read Meta",
  } satisfies Record<AdsExample, string>,
};
