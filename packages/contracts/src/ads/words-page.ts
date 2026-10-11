/**
 * Every sentence the Ads page says (page-only): its head, the platforms' standing, the four figures and how they are counted,
 * the ledger, the Ask line, the three tiles, the phone page, the first-ad card and v0, nothing connected. Consts where a
 * sentence is one, small functions where it takes a value; the values are already said (money by money.ts, days by words.ts),
 * and the workspace's appointment word comes in as an argument. Words only, no data: page.ts makes the values these take,
 * and the page draws what it hands over.
 */
import { plural } from "../shared/words";
import type { AdDoor, AdNeedsCode, AdPlatform } from "./ads";
import { PLATFORM_OWNER, peopleWord } from "./words";

// ---------------------------------------------------------------------------------------------------------------------
// Head, pane line, standing

export const HEAD = {
  window: "Last 30 days",
  /** Under the head, desk and phone. */
  money: "Charged to your card by each platform, never through Chanlytics. Pause an ad and nothing more is spent.",
  noAds: "No ads yet.",
  v0Strong: "Ads",
  v0Rest: " bring new people to your receptionist.",
  booked: (booked: number, of: number) => ({
    strong: `${booked} of ${of}`,
    rest: " new people from your ads have booked.",
  }),
  /** With no calendar link, the booked half waits. */
  touchOnly: (n: number) => ({ strong: `${n}`, rest: " new people got in touch through your ads." }),
  read: (time: string) => `Last 30 days · read ${time}`,
  v0Read: (since: string) => `Last 30 days · counted from ${since}`,
  /** The pane line while an account is being read: `Reading Meta and Google…`. */
  reading: (list: string) => `Reading ${list}…`,
  accounts: "Accounts",
  newAd: "New ad",
  ask: "Ask",
};

/** The line under the pane line when an account could not be read, and the press that reads it again. */
export const ADS_READ = {
  failed: (owner: string, when: string | null) =>
    when === null ? `${owner}'s numbers could not be read` : `${owner}'s numbers could not be read · as of ${when}`,
  again: "Try again",
};

export const STANDING = {
  connected: "Connected",
  needsYou: "Needs you",
  off: "Not connected yet",
  /** An account that has to be chosen, and one whose access has lapsed. */
  choose: "Choose an account",
  lapsed: "Needs connecting again",
  account: (name: string, time: string) => `${name} · read ${time}`,
  reading: (name: string) => `${name} · reading now`,
  failed: (name: string, when: string) => `${name} · could not be read, last read ${when}`,
  charged: (p: AdPlatform) => `Charged to your card by ${PLATFORM_OWNER[p]}. Chanlytics never holds your ad money.`,
  door: "Open in Settings › Connections",
  /** The post permission turns amber 7 days before it lapses. */
  permission: (day: string) => `Post permission runs to ${day}`,
  /** An account that is connected but whose last read failed. */
  unread: "Could not be read",
};

// ---------------------------------------------------------------------------------------------------------------------
// Figures

export interface CountCtx {
  readAt: string;
  calendarRead: string;
  /** `an appointment`. */
  a: string;
  /** `appointment`. */
  one: string;
  /** `appointments`. */
  many: string;
}

/** The four figures' labels and definitions: the tooltip, and the sentences under "How this is counted". */
export function figureWords(c: CountCtx) {
  return {
    spent: {
      label: "Spent",
      def: `What Facebook and Instagram, Google and TikTok charged for these ads, as they report it. Read ${c.readAt}. Can change for a day or two.`,
    },
    touch: {
      label: "Got in touch",
      def: "New people who first wrote or left a number through one of these ads. A person is counted once, for the ad they first got in touch through. People you already knew are not counted. Calls are Google's count and are not included.",
    },
    booked: {
      label: "Booked",
      def: `Of those people, how many have ${c.a} on your calendar that starts after they first got in touch and is not cancelled (ahead, kept, missed or past). A later message never un-books them. Calendar read ${c.calendarRead}.`,
    },
    each: {
      label: "For each person who booked",
      def: `What the platforms charged on the days those people first got in touch, divided by the people who have since booked. Shown from 5 booked. Not counted: calls (Google's count, not matched to people yet), people you already knew, ${c.many} Chanlytics could not match to a person, and WhatsApp message fees, which WhatsApp bills you separately. The last two weeks are still settling, so this can only come down.`,
    },
  };
}

export const FIGURES = {
  /** After the cost, while the last two weeks settle. */
  soFar: "so far",
  spentMeta: (ads: number) => `across ${plural(ads, "ad")} · as the platforms report it`,
  touchMeta: (wrote: number, left: number) => `${wrote} wrote · ${left} left a number`,
  bookedMeta: (of: number) => `of ${of} · counted by Chanlytics`,
  eachMeta: (spent: string, n: number) => `${spent} / ${peopleWord(n)} · calls not included`,
  /** No calendar link: Booked waits, and the cost falls back to people in touch. */
  needsLink: "Add a calendar link under Settings › Business to see who booked.",
  eachInTouchLabel: "For each person in touch",
  eachInTouchMeta: (spent: string, n: number) => `${spent} / ${peopleWord(n)}`,
  callsNotMatched: "Calls aren't matched to people yet",
  /** Under a dash of Spent or of the cost for each person while a platform is read: `reading Meta and Google`. */
  reading: (list: string) => `reading ${list}`,
  /** Under Spent while a platform's last read failed: the sum holds its last numbers. */
  spentMetaStale: (ads: number, owner: string, when: string | null) =>
    `across ${plural(ads, "ad")} · ${owner}${when === null ? "" : ` as of ${when}`}`,
  /** The door that mends a missing calendar link: the calendar is set under Settings › Business. */
  linkDoor: "Open Settings › Business",
};

/** The quiet line under the figures, and the door that opens the four definitions, the fee and the calls. */
export const COUNTED = {
  quiet: (time: string) => `Spend is as each platform reports it, read ${time}, and can change for a day or two.`,
  door: "How this is counted",
  title: "How this is counted",
  fees: "WhatsApp message fees are billed separately by WhatsApp and are not in these numbers.",
  calls:
    "Calls are Google's count and nothing more. They are left out of Got in touch, Booked and the cost for each person, because Chanlytics can't tell which calls came from an ad yet.",
  /** How long what is counted here is kept (decision 0049). */
  kept: "Chanlytics keeps each platform's daily numbers for 25 months, and the click that brought a person for 90 days.",
  /** While a platform is read, the line under the figures says so. */
  reading: "Spend and the cost for each person appear as each platform is read.",
  /** The door beside "How this is counted" that opens the Results sheet. */
  results: "Results",
};

// ---------------------------------------------------------------------------------------------------------------------
// Ledger

export const LEDGER = {
  heads: { ad: "Ad", spent: "Spent", touch: "In touch", booked: "Booked", each: "Each", state: "State" },
  none: "—",
  /** Why a review ad's numbers are dashes. */
  notStarted: "Nothing is spent until it is approved.",
  notMatched: "not matched yet",
  only: (n: number) => `only ${n}`,
  noneYet: "none yet",
  tooFew: "too few to read a cost",
  hint: (o: { lead: string; perDay: string; tail: string }) => `${o.lead} · about ${o.perDay} · ${o.tail}`,
  since: (day: string) => `since ${day}`,
  /** Under an ad that has not run yet and is not in review: when it would start. */
  starts: (day: string) => `starts ${day}`,
  /** Under an ad the platform has: who it was sent to, and when (`today`, or the day). */
  sentTo: (owner: string, when: string) => `sent to ${owner} ${when}`,
  each: (cost: string) => `${cost} each`,
  booked: (n: number) => `${n} booked`,
  calls: (n: number) => plural(n, "call"),
  googleCount: "Google's count",
  waiting: (n: number) => `${peopleWord(n)} from your ads ${n === 1 ? "is" : "are"} waiting on you`,
  /** Under the spend of an ad on a platform whose last read failed: the number is the last one read. */
  asOf: (when: string) => `as of ${when}`,
  /** Why a number waits while its platform is read, and the short word under the dash. */
  reading: (owner: string) => `Reading ${owner} now.`,
  readingUnit: "reading",
  /** An ad the owner made on the platform itself leads its hint with where. */
  madeIn: {
    meta: "Made in Meta Ads Manager",
    google: "Made in Google Ads",
    tiktok: "Made in TikTok Ads Manager",
  } satisfies Record<AdPlatform, string>,
};

/** How the ledger can be grouped, and the quiet line that offers it. */
export const GROUP = {
  label: "Group",
  door: "By what they ask",
  platform: "By platform",
};

/** What a door's group says of itself: `1 ad · 96 new people wrote`. `people` is null while the numbers it counts are read. */
export function groupMeta(o: { door: AdDoor; ads: number; people: number | null }): string {
  const ads = plural(o.ads, "ad");
  if (o.people === null || o.people === 0) return ads;
  if (o.door === "whatsapp") return `${ads} · ${o.people} new people wrote`;
  if (o.door === "call") return `${ads} · ${plural(o.people, "call")} · Google's count`;
  return `${ads} · ${o.people} left a number`;
}

/** What a platform's group says of itself: `2 ads · 96 new people in touch`; a Google group's people are calls. */
export function platformMeta(o: { platform: AdPlatform; ads: number; people: number | null }): string {
  const ads = plural(o.ads, "ad");
  if (o.people === null || o.people === 0) return ads;
  if (o.platform === "google") return `${ads} · ${plural(o.people, "call")} · Google's count`;
  return `${ads} · ${o.people} new people in touch`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Ask line (proposals only: fix, extend, move money)

export const ASK = {
  not: "Not now",
  /** The press on an ad that needs fixing opens it. */
  open: "Fix it",
  extendPress: (more: string) => `Keep it going · ${more} more`,
  extend: (o: { name: string; when: string; brought: string; end: string; owner: string; from: string; to: string }) =>
    `${o.name} ends ${o.when}. ${o.brought} Keep it going to ${o.end}? ${o.owner}'s total for it goes from ${o.from} to ${o.to}.`,
  extendShort: (name: string, when: string) => `${name} ends ${when}. Keep it going?`,
  broughtPeople: (n: number) => `${peopleWord(n)} ${n === 1 ? "has" : "have"} booked from it.`,
  broughtCalls: (n: number) => `Google counted ${plural(n, "call")} from it.`,
  extendConfirm: (o: {
    name: string;
    end: string;
    perDay: string;
    owner: string;
    from: string;
    to: string;
    more: string;
  }) =>
    `Keeps ${o.name} running to ${o.end}, about ${o.perDay}. ${o.owner}'s total for this ad goes from ${o.from} to ${o.to}, so up to ${o.more} more can be spent. Nothing else changes.`,
  extendToast: (name: string, end: string) => `${name} now runs to ${end}`,
  /** The ad's name, then what is wrong with it, said as the rest of a sentence (`ASK_WHY`). */
  fix: (name: string, why: string) => `${name} ${why}.`,
  fixShort: (name: string, why: string) => `${name} ${why}. Fix it?`,
  movePress: (amount: string) => `Move ${amount} a day`,
  move: (o: {
    cheap: string;
    cheapEach: string;
    cheapN: number;
    dear: string;
    dearEach: string;
    dearN: number;
    amount: string;
    end: string;
    all: string;
  }) =>
    `${o.cheap} books at ${o.cheapEach} (${o.cheapN} people), ${o.dear} at ${o.dearEach} (${o.dearN} people), a gap larger than chance would give. Move ${o.amount} a day to ${o.cheap} until ${o.end}? Your total stays ${o.all} a day.`,
  /** `one` is the workspace's appointment word: `appointment`. */
  moveShort: (cheap: string, one: string) => `${cheap} costs less for each ${one}. Move some money to it?`,
  moveConfirm: (o: { amount: string; dear: string; cheap: string; end: string }) =>
    `Moves ${o.amount} a day from ${o.dear} to ${o.cheap} until ${o.end}. Neither ad's end date changes, and together they still spend the same each day.`,
  moveToast: (cheap: string, amount: string) => `Moved ${amount} a day to ${cheap}`,
};

const ASK_WHY: Record<AdNeedsCode, (owner: string) => string> = {
  rejected: (owner) => `was turned down by ${owner}`,
  payment: (owner) => `stopped: ${owner} couldn't charge your card`,
  "paused-in-platform": (owner) => `is paused in ${owner}, not here`,
  "price-changed": () => "still says an old price",
  "permission-lapsing": (owner) => `will lose ${owner}'s permission to use its post`,
  "number-check": (owner) => `waits for ${owner} to check the number`,
  verification: (owner) => `waits for ${owner} to verify your business`,
  "lead-terms": (owner) => `needs ${owner}'s lead form terms accepted`,
  identity: () => "needs a name to be shown as",
  "out-of-budget": () => "has spent everything it was given",
};

/** What is wrong with an ad that needs the owner, as the rest of the fix proposal's sentence: `was turned down by Meta`. */
export const askWhy = (code: AdNeedsCode | null, owner: string): string =>
  code === null ? `needs something from you in ${owner}` : ASK_WHY[code](owner);

// ---------------------------------------------------------------------------------------------------------------------
// Tiles and the phone page

export const TILES = {
  waiting: {
    title: "Waiting on you",
    empty: "Nobody from an ad is waiting on you.",
    line: (o: { ad: string; what: string; note: string | null }) =>
      `${o.ad} · ${o.what}${o.note ? ` · ${o.note}` : ""}`,
    wrote: (day: string) => `wrote ${day}`,
    number: (day: string) => `left a number ${day}`,
    callNote: "a number to call",
    /** Where a row goes: their conversation where there is one, else their page. */
    toThread: "Open the conversation",
    toPerson: "Open their page",
  },
  coming: {
    title: "Coming",
    endsEvening: "ends that evening",
    ends: "ends",
    today: "Today",
    /** What is left of an ad's total waits while its platform is read. */
    reading: (owner: string) => `Reading what ${owner} has left`,
    totalReading: "Reading what is left to spend",
    /** The total across ads that stop at a platform total. */
    total: (o: { sum: string; ads: number }) =>
      o.ads === 1
        ? `Up to ${o.sum} more on this ad · stopped by a total set at its platform`
        : `Up to ${o.sum} more across the ${o.ads} ads · each stopped by a total set at its platform`,
    plus: (daily: string) => `plus about ${daily}, no end`,
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
    nudge: (one: string) => `Mark who came to see what each ${one} cost.`,
    unmatched: (n: number, many: string) =>
      `${n} ${many} couldn't be matched to a person, so they're in no ad's number.`,
    line: (o: { ahead: number; kept: number; missed: number; past: number }) =>
      `Ahead ${o.ahead} · Kept ${o.kept} · Missed ${o.missed} · Past ${o.past}`,
  },
};

export const PHONE = {
  line1: (spent: string, each: string | null) =>
    each ? `${spent} spent · ${each} for each person who booked so far` : `${spent} spent`,
  line1NoCalendar: (touch: number, spent: string) => `${touch} new people got in touch · ${spent} spent`,
  /** While a platform is read, the muted line says what waits instead of a spend it does not know. */
  line1Reading: (touch: number, list: string) => `${touch} new people got in touch · reading ${list}`,
  footnote: "Spend is as each platform reports it and can change for a day or two.",
  row: (platform: string, door: string) => `${platform} · ${door}`,
  /** The ad's line, with where its numbers were last read when the platform could not be read. */
  rowAsOf: (platform: string, door: string, when: string) => `${platform} · ${door} · as of ${when}`,
  /** The people waiting on the owner, said by name: two, then how many more. */
  names: (names: readonly string[]) =>
    names.length <= 2 ? names.join(" · ") : `${names.slice(0, 2).join(" · ")} · ${names.length - 2} more`,
  /** The door to the Results sheet, which the phone has no figures strip to carry. */
  results: "Results",
};

// ---------------------------------------------------------------------------------------------------------------------
// v0 (nothing connected), and connected with no ads yet

export const V0 = {
  lead: (ad: number, of: number) => ({
    strong: `${ad} of the ${of}`,
    rest: " new people with a recorded way in first wrote from a WhatsApp ad.",
  }),
  more: (n: number) => `${n} more have no way in recorded.`,
  emptyLead: "No one has written from an ad yet.",
  emptyLine: "When Meta names the ad in someone's first message, your receptionist answers and they are counted here.",
  notes: [
    "Ads that open WhatsApp are counted under An ad, not WhatsApp.",
    "When Meta names the ad in someone's first message, they're counted here. Calls and other ads aren't counted yet.",
  ],
  door: "See them in Reports › People",
  platforms: {
    meta: "Ads that open WhatsApp, and forms",
    google: "Ads that ring your phone",
    tiktok: "Short videos, with forms that collect a number",
  } satisfies Record<AdPlatform, string>,
  next: "Connecting an ad account comes next, Facebook and Instagram first.",
};

export const NO_ADS = {
  title: "Your first ad",
  /** `Message you on WhatsApp · about $10 a day for 7 days · up to $70`. */
  line: (o: { door: string; perDay: string; days: number; total: string }) =>
    `${o.door} · about ${o.perDay} for ${o.days} days · up to ${o.total}`,
  press: "Set up",
  /** What stops the first ad, said as a step. The press waits for it. */
  needs: (fix: string) => `${fix} to set up your first ad`,
  connect: (owner: string) => `Connect your ${owner} account to set up your first ad`,
  lapsed: (owner: string) => `Connect your ${owner} account again to set up your first ad`,
};

/** An account that has to be chosen: the card that lists the choices, each with its currency. */
export const CHOOSE = {
  title: (owner: string) => `Choose your ${owner} ad account`,
  line: "Each account is in one currency, and ads on it are charged in that currency.",
  choice: (name: string, currency: string) => `${name} · ${currency}`,
  use: "Use this one",
  done: (name: string) => `Using ${name} for your ads`,
  /** The account was taken off the list (or never was) between the card being drawn and the press. */
  gone: "That account isn't on the list any more. Look again.",
};
