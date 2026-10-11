/**
 * Every sentence an ad's drawer says (page-only): the sentence's tapped words and the lists they open, the Edit block, the
 * toasts of a press, the callout at the top, what it ran on, what it brought, the preview and the people. Consts where a
 * sentence is one, small functions where it takes a value; the values are already said (money by money.ts, days by words.ts)
 * and the workspace's appointment word comes in as an argument. Trade-neutral. Words only, no data: drawer.ts makes the
 * values these take, and the drawer draws what it hands over.
 */
import { plural } from "../shared/words";
import type { AdDoor, AdPlatform } from "./ads";
import type { ChipId } from "./vm-base";
import { PLATFORM_OWNER, REVIEW_WITHIN, allWord, checkFix, peopleWord } from "./words";

// ---------------------------------------------------------------------------------------------------------------------
// The sentence's tapped words, and the lists they open

/** A raise of spend names its most. */
const moreSpent = (more: string): string => `Up to ${more} more can be spent`;

/** The lists a tapped word opens. */
export const LIST = {
  /** What a chip is, to a screen reader: "The area: 5 miles". */
  chip: {
    offer: "The offer",
    area: "The area",
    amount: "The amount",
    end: "The end date",
    door: "What people do",
    platform: "Where it runs",
  } satisfies Record<ChipId, string>,
  chipSaid: (what: string, value: string) => `${what}: ${value}`,
  /** A dashed blank, to a screen reader. */
  blank: "not chosen yet",
  amountDaily: "Change the daily amount",
  inAll: (total: string) => `${total} in all`,
  /** The unit beside the box of "Your own amount": a daily amount, or a total. */
  unitDaily: "a day",
  unitTotal: "in all",
  /** A daily amount, said as the platform spends it: an average where it spends one (`about $15 a day, an average`). */
  dailyRow: (perDay: string, average: boolean) => (average ? `about ${perDay}, an average` : perDay),
  raiseDaily: (perDay: string, average: boolean) => `Raise to about ${perDay}${average ? ", an average" : ""}`,
  moreSpent,
  /** What a daily amount that moves does to a day (`about $10 a day more`): no most, so it says about. */
  dailyMore: (perDay: string) => `about ${perDay} more`,
  dailyMoreHead: (perDay: string) => `About ${perDay} more`,
  dailyLess: (perDay: string) => `about ${perDay} less`,
  /** What a choice does to a day, over the days left to the end. */
  perDayLeft: (perDay: string) => `About ${perDay} for the days left`,
  asItIs: (perDay: string) => `As it is: about ${perDay}`,
  endsSooner: (perDay: string) => `Ends sooner: about ${perDay} for the days left`,
  endsLater: (perDay: string) => `Ends later: about ${perDay} for the days left`,
  /** A raise's two facts on a line: the most it can spend, and what a day becomes. */
  raiseSub: (o: { more: string; perDay: string }) => `${moreSpent(o.more)} · about ${o.perDay}`,
  pickDay: "Pick another day",
  pickDayLabel: "Pick the day it ends",
  set: "Set",
};

/** What each tapped word says it changes. */
export const CHIPS = {
  offer: (p: AdPlatform) =>
    `Changing the offer, photo or words sends the ad back to ${PLATFORM_OWNER[p]} for checking, ${REVIEW_WITHIN[p]}.`,
  areaMiles: "Miles around your address",
  areaPeople: (lo: number, hi: number) =>
    `About ${lo.toLocaleString("en-US")} to ${hi.toLocaleString("en-US")} people · Meta's estimate`,
  areaSmall: "Small areas can be slow to start.",
  areaMeta: "Changing the area sends the ad back for checking.",
  areaGoogle:
    "People who live or are in this area. People who only search about it won't see it. Fewer people, a better fit.",
  areaTiktok: "TikTok targets these ZIP codes. There is no radius.",
  amountTitle: "Change the total",
  own: "Your own amount",
  /** What a platform needs a day (`floor`, already said), or for Google's total how long it may run. */
  floor: (p: AdPlatform, floor: string | null, totalMaxDays: number | null) => {
    if (p === "google") return `Google total budgets run 3 to ${totalMaxDays ?? 90} days.`;
    return `${PLATFORM_OWNER[p]} needs at least ${floor} a day for this.`;
  },
  belowSpent: (spent: string) => `It can't go below what is spent, ${spent}.`,
  stops: (p: AdPlatform) =>
    p === "google"
      ? "Google will not charge more than the total."
      : `${PLATFORM_OWNER[p]} stops at this amount itself, even if Chanlytics is offline.`,
  noRestart: "A change of amount does not send it back for checking.",
  dailyOver: "Some days Meta spends up to a quarter more. Over a week it never goes above 7 times the daily amount.",
  dailyOverGoogle: "Google spends a daily amount as an average: some days up to twice it.",
  /** A change of TikTok's amount: at most this share, and not within this many days of the last. */
  tiktokChange: (maxStep: number, waitDays: number) =>
    `A change can be ${Math.round(maxStep * 100)}% at most, and not within ${waitDays} days of the last.`,
  /** Why TikTok will not take an amount: too far from the one now, or too soon after the last change. */
  tiktokStepOut: (maxStep: number) => `TikTok lets you change it by up to ${Math.round(maxStep * 100)}% at a time`,
  tiktokWait: (day: string) => `TikTok lets you change it again on ${day}`,
  tiktokRange: (o: { lo: string; hi: string; maxStep: number }) =>
    `Between ${o.lo} and ${o.hi}: TikTok lets you change it by up to ${Math.round(o.maxStep * 100)}% at a time.`,
  endTitle: "Change the end date",
  endLater: "A later end date lets it spend up to the total. It does not go back for checking.",
  endGoogle: (day: string, at: string) => `Ends the evening of ${day} (${at}, your account's time zone).`,
  /** Google's total budgets run this many days at most: the date list stops at the last day. */
  googleLastDay: (o: { days: number; day: string }) =>
    `Google total budgets run up to ${o.days} days, so the last day for this ad is ${o.day}.`,
  /** A raise of spend is the only press that names its maximum; lowering, pausing and renaming are free. */
  raise: (total: string) => `Raise to ${total} in all`,
  lockedWhy: "To change how the chat starts, Chanlytics makes a copy of the ad.",
  formNew: "Changing the form makes a new form.",
  googleWait: "Changing it now restarts the wait.",
};

/** TikTok's area: ZIP codes, as chips that come out and a box that takes one more. */
export const ZIPS = {
  title: "ZIP codes",
  add: "Add a ZIP code",
  addPress: "Add",
  placeholder: (digits: number) => `${digits} digits`,
  remove: (zip: string) => `Take out ${zip}`,
  bad: (digits: number) => `A ZIP code is ${digits} digits.`,
  already: (zip: string) => `${zip} is already in the list.`,
  none: "Keep at least one ZIP code.",
  save: "Save ZIP codes",
  /** What the list says it holds, to a screen reader. */
  held: (n: number) => `${plural(n, "ZIP code")} in the area`,
};

// ---------------------------------------------------------------------------------------------------------------------
// Edit, and the toasts of a press

/** The Edit block: the photo and the words, which a sentence's chips do not hold. */
export const EDIT = {
  title: "Photo and words",
  photo: "Photo",
  changePhoto: "Change photo",
  photoNew: "A new photo is chosen",
  headlineN: (n: number) => `Headline ${n}`,
  descriptionN: (n: number) => `Description ${n}`,
  noChanges: "Nothing changed yet",
  /** How the chat starts, fixed on a running ad: `How the chat starts: They send a message you wrote for them`. */
  chatNow: (what: string, now: string) => `${what}: ${now}`,
  /** The foot's line while the changes are being made. */
  tapHint: "Tap a highlighted word to change it",
};

/** The toasts a press says, each with Undo where it can be undone. */
export const CHANGED = {
  ends: (name: string, day: string) => `${name} now ends ${day}`,
  total: (name: string, total: string) => `${name}'s total is now ${total}`,
  daily: (name: string, amount: string) => `${name}'s daily amount is now ${amount}`,
  area: (name: string, area: string, owner: string) => `${name} now reaches ${area}. Back with ${owner} for checking.`,
  renamed: (name: string) => `Renamed to ${name}`,
  saved: (name: string) => `${name} saved`,
  savedChecking: (o: { name: string; owner: string; within: string }) =>
    `${o.name} saved. Back with ${o.owner} for checking, ${o.within}.`,
  updated: (o: { name: string; owner: string; within: string }) =>
    `${o.name} is back with ${o.owner} with your new price, ${o.within}.`,
  /** A second look is asked of the platform; the ad stays as it is until it answers. */
  asked: (o: { owner: string; within: string }) =>
    `Asked ${o.owner} to look again. ${o.within.charAt(0).toUpperCase()}${o.within.slice(1)}.`,
  retrying: (owner: string) => `Trying again on ${owner}. This takes a minute.`,
  removing: (owner: string) => `Removing what was made on ${owner}.`,
  pausedTotal: (name: string, day: string) =>
    `${name} paused. Nothing more is spent while it is paused. It still ends ${day}.`,
};

export const NO_AD = {
  title: "This ad isn't here any more",
  body: "It may have been ended and cleared away.",
};

export const PEOPLE_TAB = { everyone: "Everyone", none: "Nobody yet." };

/** The preview and the reach line. */
export const SHOWN = {
  frameLabel: "Where it shows",
  photo: "Your photo goes here",
  video: "Your video goes here",
  adWord: "Ad",
  consentBox: "Not ticked",
  formRows: "What they fill in",
  reach: "What this ad runs on",
};

// ---------------------------------------------------------------------------------------------------------------------
// The drawer

/** A reach line: its first word is the state, in the ink; the rest is the reasons, dim. */
export interface ReachSaid {
  state: string;
  parts: string[];
}

/** Where an ad was made when the owner made it on the platform itself, and where it is changed. */
const MADE_IN: Record<AdPlatform, string> = {
  meta: "Meta Ads Manager",
  google: "Google Ads",
  tiktok: "TikTok Ads Manager",
};
const CHANGE_IN: Record<AdPlatform, string> = { meta: "Meta", google: "Google Ads", tiktok: "TikTok" };

/**
 * What a platform makes first and an ad that could not be finished leaves paused there, in the owner's words: Meta's ad
 * set and Google's and TikTok's ad group are each "who it shows to" (the v3 spec's words, never the platform's).
 */
const MADE_PARTS = "the campaign and who it shows to";

/**
 * What an ad that needs a card or a balance says, in the platform's own step: Meta turned the card down; Google and TikTok
 * have none, which is the step the account's own check names (words.ts checkFix), not retyped here.
 */
const paymentLead = (p: AdPlatform): string =>
  p === "meta" ? "Meta couldn't charge your card. Update it in Meta" : checkFix("payment", p);

export const DRAWER = {
  /** The kicker: `Facebook and Instagram · Message you on WhatsApp`. */
  kicker: (platform: string, door: string) => `${platform} · ${door}`,
  next: {
    runs: (o: { day: string; left: string; perDay: string | null }) =>
      `Runs to ${o.day} · ${o.left}${o.perDay ? ` · about ${o.perDay}` : ""}`,
    runsDaily: (perDayText: string) => `Runs until you stop it · about ${perDayText}`,
    review: (o: { from: string; to: string; total: string; perDay: string }) =>
      `Would run ${o.from} to ${o.to} · up to ${o.total} in all · about ${o.perDay}`,
    reviewDaily: (o: { from: string; perDay: string }) => `Would start ${o.from} · about ${o.perDay} until you stop it`,
    paused: (o: { day: string; left: string }) => `Paused · it still ends ${o.day} · ${o.left}`,
    pausedDaily: (perDayText: string) => `Paused · about ${perDayText} when it runs`,
    ended: (o: { day: string; spent: string }) => `Ended ${o.day} · ${o.spent} spent`,
    finished: (total: string) => `Spent its ${total} and stopped`,
  },
  reach: {
    running: (o: { owner: string; day: string; note: string }): ReachSaid => ({
      state: "On",
      parts: [`${o.owner} approved it ${o.day}`, o.note],
    }),
    review: (o: { owner: string; when: string; note: string }): ReachSaid => ({
      state: "In review",
      parts: [`sent to ${o.owner} ${o.when}`, o.note],
    }),
    /** When it was sent: `today 9:02 AM` on the day, else the day. */
    sentWhen: (o: { today: boolean; day: string; time: string }) =>
      o.today ? `today ${o.time}` : `${o.day} ${o.time}`,
    paused: (note: string): ReachSaid => ({ state: "Paused", parts: [note] }),
    needs: (first: string): ReachSaid => ({ state: "Needs you", parts: [first] }),
    ended: (day: string): ReachSaid => ({ state: `Ended ${day}`, parts: [] }),
    read: (time: string) => `Read ${time}`,
  },
  results: {
    header: "Last 30 days",
    /** The door to this ad's numbers in Reports. */
    report: "Report",
    wrote: "Wrote",
    calls: "Calls",
    leftNumber: "Left a number",
    defWrote:
      "People who first wrote through this ad. A person is counted once, for the ad they first got in touch through.",
    defCalls: "Calls Google counted from this ad, by the day of the click. Google's count, not Chanlytics'.",
    defNumber: "People who left a number through this ad's form. A person is counted once.",
    countWrote: (wrote: number, booked: number) => `${wrote} wrote · ${booked} booked`,
    countCalls: (calls: number) => `${plural(calls, "call")} · Google's count`,
    countNumber: (n: number, booked: number) => `${n} left a number · ${booked} booked`,
    perPerson: (spent: string, n: number) => `${spent} / ${peopleWord(n)}`,
    /** A counted zero is said in words. */
    zero: (o: { inTouch: number; did: string; spent: string }) =>
      `${o.inTouch} ${o.did} so far, nobody has booked yet. ${o.spent} spent.`,
    quietStart: (spent: string) => `${spent} spent, nobody has written yet.`,
    /** Its first words are the word that opens what each platform says about it (`many` is the appointment word, plural). */
    tooEarly: (many: string) => ({
      word: "Too early to judge",
      rest: `. Most ads need about a week and a handful of ${many} before the cost means anything.`,
    }),
    tooEarlySheet: {
      meta: "This is Chanlytics' reading, not a Meta status. Meta usually needs about 50 results after your last big change.",
      tiktok:
        "This is Chanlytics' reading, not a TikTok status. TikTok says its ads settle after about 25 results or a week.",
      google: "This is Chanlytics' reading, not a Google status. Google needs a few days of calls.",
    } satisfies Record<AdPlatform, string>,
    soFarToday: (time: string) => `so far today, ${time}`,
  },
  bars: {
    legend: (did: string) =>
      `Each bar is a day: people who first ${did}. Dark part: booked since. Lighter days are still counting.`,
    legendCalls: "Each bar is a day: calls Google counted, by the day of the click. Lighter days are still counting.",
    aria: (o: { n: number; did: string; days: number; booked: number }) =>
      `${peopleWord(o.n)} first ${o.did} over ${plural(o.days, "day")}; ${o.booked} ${o.booked === 1 ? "has" : "have"} booked.`,
    ariaCalls: (o: { n: number; days: number }) =>
      `${plural(o.n, "call")} over ${plural(o.days, "day")}, Google's count.`,
    ariaNone: "Nothing yet: it has not started.",
  },
  quiet: {
    reply: (median: string, n: number) => `Median first reply ${median} · ${plural(n, "reply", "replies")}`,
    provenance: (owner: string) =>
      `Counted by Chanlytics, not by ${owner}. ${owner}'s own numbers can differ and settle after a day or two.`,
    provenanceCalls:
      "Calls are Google's count, not Chanlytics'. Google's own numbers can differ and settle after a day or two.",
    /** The platform's own numbers, one press away: a list by name, each "not read yet" where the platform returned none. */
    theirsDoor: (owner: string) => `${owner}'s numbers`,
    theirsNote: (owner: string) => `These are ${owner}'s counts. Chanlytics counts people once.`,
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
      longCalls: "Calls over 60 seconds",
    },
    googleExtra: "Google counts calls by the day of the click, so recent days can still change.",
    /** What people searched on Google, as it groups them, and the searches left out for the owner. */
    typedDoor: "What people typed",
    typedNote: "Google groups what people searched into themes and shows these.",
    leftOut: {
      title: "Left out for you",
      note: "Google won't show the ad for searches with these words.",
    },
  },
  people: {
    title: "People it brought",
    booked: "Booked",
    notYet: "Not yet",
    /** The door to everyone it brought: People cannot be cut by ad yet, so it says where it goes. */
    all: (n: number) => `${allWord(n)} in Reports › People`,
    wrote: (day: string) => `Wrote ${day}`,
    wroteToday: (time: string) => `Wrote today ${time}`,
    number: (day: string) => `Left a number ${day}`,
    waiting: (days: string) => `Waiting for you · ${days}`,
    callNumber: "A number to call",
    talking: "Talking",
    quietSince: (day: string) => `Quiet since ${day}`,
    nothing: "Nothing on your calendar",
    ahead: (day: string, time: string) => `Booked ${day}, ${time}`,
    kept: (day: string) => `Kept ${day}`,
    missed: (day: string) => `Missed ${day}`,
    past: (day: string) => `Was booked ${day}`,
    marked: "Marked by your team",
    notMarked: "Not marked yet",
    emptyCalls: "Calls aren't matched to people yet.",
    emptyReview: "Nobody yet. Nothing is spent until the platform approves it.",
    emptyQuiet: "Nobody yet.",
    /** Where a row goes, said in its tip: the person's page, or the conversation that waits on the owner. */
    tipPerson: (name: string) => `Opens ${name}`,
    tipConversation: (name: string) => `Opens your conversation with ${name}`,
  },
  foot: {
    pause: "Pause",
    resume: "Resume",
    edit: "Edit",
    again: "Run it again",
    cancel: "Cancel",
    save: "Save changes",
    /** The one press that raises what can be spent names its most. */
    saveRaise: (total: string) => `Save · raise to ${total}`,
    saveRaiseDaily: (perDay: string) => `Save · raise to about ${perDay}`,
    paused: (name: string, day: string) =>
      `${name} paused. Nothing more is spent while it is paused. It still ends ${day}. Meta may need a few days to find people again when you turn it back on.`,
    pausedDaily: (name: string) => `${name} paused. Nothing more is spent while it is paused.`,
    resumed: (name: string) => `${name} is on again`,
    /** The edit foot: what the changes do. */
    changes: (o: { n: number; restarts: boolean; owner: string; within: string }) =>
      o.restarts
        ? `${plural(o.n, "change")} · back with ${o.owner} for checking, ${o.within}`
        : `${plural(o.n, "change")} · starts right away`,
  },
  menu: {
    label: "More about this ad",
    ask: "Ask about this ad",
    copy: "Make a copy",
    end: "End this ad",
    endConfirm: (name: string) => `End ${name}? It stops today. What was spent stays spent.`,
    endPress: "End it",
    keep: "Keep it",
    ended: (name: string) => `${name} ended`,
    copied: (name: string) => `A copy of ${name} is ready to turn on`,
  },
  /** The questions a callout's press asks first, in the foot. */
  confirm: {
    update: (o: { owner: string; within: string }) =>
      `Update the ad? Its words are drafted again from Services with the new price, and it goes back to ${o.owner} for checking, ${o.within}.`,
    updateYes: "Update it",
    updateNo: "Not now",
    remove: (owner: string) => `Remove what was made on ${owner}? It is deleted there. Nothing was spent.`,
    removeYes: "Remove it",
    removeNo: "Keep it",
  },
  /** An ad the owner made on the platform itself: Chanlytics can pause and resume it, and nothing else. */
  adopted: (p: AdPlatform) =>
    `Made in ${MADE_IN[p]}. Chanlytics can pause and resume it; change it in ${CHANGE_IN[p]}.`,
  callout: {
    review: (p: AdPlatform) =>
      `${PLATFORM_OWNER[p]} is checking your ad, ${REVIEW_WITHIN[p]}. Nothing is spent until it is approved. We'll tell you here.`,
    /** An ad sent back for checking after a change: its results stay where they are. */
    recheck: (o: { owner: string; within: string }) =>
      `${o.owner} is checking your changes, ${o.within}. Your results stay here.`,
    settingUp: (p: AdPlatform) => `Setting it up on ${PLATFORM_OWNER[p]}, paused. This takes a minute.`,
    couldntFinish: (p: AdPlatform) =>
      `Chanlytics couldn't finish setting this up. What was made is paused on ${PLATFORM_OWNER[p]}: ${MADE_PARTS}. Nothing was spent.`,
    couldntExits: { retry: "Try again", remove: "Remove what was made" },
    pausedInPlatform: (p: AdPlatform) => `Paused in ${PLATFORM_OWNER[p]}, not here. Turn it back on?`,
    resume: "Resume",
    /** The price the ad says and the one Services says now; either may be missing from what was read. */
    priceChanged: (o: { was: string | null; now: string | null }) => {
      if (o.was && o.now) return `Your price changed in Services: the ad says ${o.was}, Services now say ${o.now}.`;
      return o.was ? `Your price changed in Services. This ad still says ${o.was}.` : "Your price changed in Services.";
    },
    updateAd: "Update the ad",
    /** The platform's own words, verbatim, in quotes. */
    rejected: (o: { owner: string; why: string }) => `${o.owner} turned this ad down: “${o.why}”`,
    rejectedExits: {
      fix: "Fix it",
      again: (owner: string) => `Ask ${owner} to look again`,
      fresh: "Make a new one",
    },
    /** The line is the platform's own payment step: `Add a card in Google Ads`. */
    payment: (p: AdPlatform) => `${paymentLead(p)} so your ad can run. Chanlytics never holds your ad money.`,
    lapsing: (day: string | null) =>
      day ? `TikTok's permission to use this post ends ${day}.` : "TikTok's permission to use this post ends soon.",
    renew: "Renew in Settings › Connections",
    /** After a press, until the platform answers: the press says what it did and cannot be pressed again. */
    done: { again: (owner: string) => `Asked ${owner}`, retry: "Trying again", remove: "Removing" },
    ended: (day: string) => `Ended ${day}.`,
    settling: (days: number) => `Numbers settle for ${days} days: these may still change.`,
    settled: (days: number) => `Settled: ${days} days have passed.`,
    finished: (o: { name: string; total: string }) => `${o.name} spent its ${o.total} and stopped.`,
    finishedBooked: (booked: number) => `${peopleWord(booked)} booked from it.`,
    finishedCalls: (calls: number) => `Google counted ${plural(calls, "call")} from it.`,
    quiet: "Quiet so far is normal. Give it about a week before you judge it.",
  },
  edit: { pen: "Rename this ad", namePlaceholder: "Name this ad" },
};

// ---------------------------------------------------------------------------------------------------------------------
// The preview (drawer and New ad)

export const PREVIEW = {
  fold: "How it reads",
  frames: ["Feed", "Story", "Reel"] as const,
  /** The capsule under the ad, in the platform's wording where it can differ by locale. */
  cta: { whatsapp: "Send WhatsApp message", call: "Call us", form: "Sign up" } satisfies Record<AdDoor, string>,
  tap: "When they tap",
  call: "When they call",
  form: "When they send the form",
  drawn: (owner: string) => `Drawn by Chanlytics. When you turn it on, ${owner} also shows its own preview.`,
  receptionistWrites: "Your receptionist writes the real reply when someone writes.",
  replyLabel: "Example reply, written from your Services and Hours:",
  googleCaption: (line: string) =>
    `Google shows its own number on the ad and passes the call to ${line}. On phones the button calls; on computers it shows the number.`,
  answers: (business: string) => `Your receptionist answers, starting with: ${business}, how can I help?`,
  formFilled: "Filled in for them",
  formName: "Name",
  formPhone: "Phone",
  consentTitle: "Draft for counsel, not final wording",
  consent: (business: string) =>
    `Yes, ${business} may text or WhatsApp me at this number, using automated technology, with offers and reminders. Not required to book. Message frequency varies. Message and data rates may apply. Reply STOP to opt out.`,
  privacy: (site: string) => `Privacy policy: ${site}/privacy`,
  formNotice: "We'll message you about this request.",
  layout: "A standard form: the card layout is not available with a consent line",
  /** Drawn by the drawer and New ad's thank-you switch (owed). */
  thanksOn: "We'll message you within a few minutes",
  thanksOff: "We'll get back to you",
  neverQuote:
    "Your receptionist is set to never quote prices, so it will say the price is quoted at a consult. Take the price out of the ad, or change that setting.",
  excerpt: (text: string, cta: string) => `${text} · ${cta}`,
};
