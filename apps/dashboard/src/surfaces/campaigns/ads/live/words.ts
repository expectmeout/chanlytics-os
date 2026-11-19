/**
 * Every word the Ads page says once an account is connected (the Ads plan's 4.4, 4.5, 4.8 and 4.9, as the canvas draws
 * them: docs/2026-11-18-ads-connect-canvas). One word for each thing (docs/words.md): Meta is named where its bill,
 * its check or its own page is meant; AI is AI; nothing here is a system's word. The model (model.ts) chooses among
 * these and writes none of its own.
 */
import type { AdOpens } from "@chanlytics/contracts";

const people = (n: number): string => (n === 1 ? "1 person" : `${n} people`);

export const LIVE = {
  /** The head, with people counted: `26 of 114` in the ink, the rest beside it. */
  booked: (booked: number, came: number) => ({
    strong: `${booked} of ${came}`,
    rest: " new people from your ads have booked.",
  }),
  /** The head, before anyone has written from an ad. */
  inAccount: (ads: number) => ({
    strong: ads === 1 ? "1 ad" : `${ads} ads`,
    rest: ads === 1 ? " is in your Meta account." : " are in your Meta account.",
  }),
  noAds: { strong: null, rest: "Meta shows no ads in this ad account yet." },
  /** Who is charged, said once under the head. */
  money:
    "Charged to your card by Meta, never through Chanlytics. Pause an ad and it stops. Meta still bills what it already showed.",
  spent: (spent: string) => `${spent} spent`,
  each: (cost: string, soFar: boolean) => `${cost} for each person who booked${soFar ? " so far" : ""}`,
  updated: (when: string) => `Updated ${when}`,
  /** A read that failed keeps the last good numbers, and says so. */
  couldntUpdate: (when: string) => `Couldn't update · Updated ${when}. Chanlytics tries again by itself.`,
  list: "Your ads",
  results: "Results",
  /** What a tap on an ad opens, in a row's line and a drawer's head. */
  opens: {
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    messenger: "Messenger",
    call: "a call",
    form: "a form",
    website: "your website",
    other: "another page",
  } satisfies Record<AdOpens, string>,
  madeInMeta: "made in Meta",
  opensWord: (what: string) => `opens ${what}`,
  /** A row's first word, by where the ad stands. */
  state: {
    on: "On",
    paused: "Paused",
    review: "In review",
    "needs-you": "Needs you",
    ended: "Ended",
    finished: "Finished",
    "setting-up": "Setting up",
    "couldnt-finish": "Couldn't finish",
    draft: "Draft",
  },
  checking: "Meta is checking it, usually within a day",
  needs: {
    refused: "Not approved by Meta",
    unpaid: "Meta couldn't charge your card",
    troubled: "Meta found a problem with it",
    paused_at_platform: "Paused in Meta",
  },
  ends: (day: string) => `ends ${day}`,
  stillEnds: (day: string) => `it still ends ${day}`,
  ended: (day: string) => `Ended ${day}`,
  finished: "Finished · its total is spent",
  left: (money: string) => `${money} left`,
  aDay: (money: string) => `${money} a day`,
  noEnd: "no end date",
  pausing: "Pausing…",
  resuming: "Turning it back on…",
  /** A row while Chanlytics is signed out, and after a disconnect: what the ad was doing when it was last read. */
  wasOn: "Was on",
  wasPaused: "Was paused",
  wasChecking: "Meta was checking it",
  leftInMeta: "Left in Meta",
  leftWasOn: (day: string) => `was on ${day}`,
  leftWasPaused: "was paused",
  bookedCell: (n: number) => `${n} booked`,
  eachCell: (cost: string) => `${cost} each`,
  notCounted: "People not counted",
  /** Under the list. */
  adoptedNote:
    "An ad made in Meta can be paused here. It turns back on here when Meta holds a total and an end date for it.",
  notCountedNote: (what: string) =>
    `An ad that opens ${what} shows what Meta spent. Its people are counted only when they write to AI.`,
  unnamed: (came: number, booked: number) =>
    `${people(came)} came from an ad you run in Meta that Chanlytics can't name yet` +
    (booked > 0 ? `, and ${booked} of them ${booked === 1 ? "has" : "have"} booked.` : "."),
  /** The people of an ad in an ad account this workspace connected before this one: counted, on a line of their own. */
  elsewhere: (came: number, booked: number) =>
    `${people(came)} came from an ad in an ad account you connected before this one` +
    (booked > 0 ? `, and ${booked} of them ${booked === 1 ? "has" : "have"} booked.` : "."),
  /** Meta signed Chanlytics out (the plan's 4.8). */
  signedOut: {
    title: (day: string) => `Meta signed Chanlytics out on ${day}.`,
    wasOn: (names: string) =>
      `${names} was on then, and Meta charges while it runs. Chanlytics can't read or pause it until you connect again.`,
    wereOn: (names: string) =>
      `${names} were on then, and Meta charges while they run. Chanlytics can't read or pause them until you connect again.`,
    none: "Chanlytics can't read or pause your ads until you connect again.",
  },
  /** After a disconnect (the plan's 4.9, point 3). */
  disconnected: {
    title: (names: string, many: boolean) => `${names} ${many ? "were" : "was"} on when you disconnected`,
    body: (day: string, many: boolean) =>
      `That was ${day}. Meta charges while ${many ? "they run" : "it runs"}. ${many ? "They" : "It"} can only be paused in Meta now.`,
    /** Left on, and Meta was still checking it: it starts by itself once approved. */
    checkingTitle: (names: string) => `Meta was checking ${names} when you disconnected`,
    checkingBody: (day: string, many: boolean) =>
      `That was ${day}. If Meta approves ${many ? "them, they run" : "it, it runs"} and Meta charges. ${many ? "They" : "It"} can only be paused in Meta now.`,
    /** Some were running and Meta was checking others. */
    bothTitle: (names: string) => `${names} were left on when you disconnected`,
    bothBody: (day: string) =>
      `That was ${day}. Meta charges while an ad runs, and one it was checking starts when Meta approves it. They can only be paused in Meta now.`,
    openMeta: "Open Meta",
    again: "Connect to read and pause them here again.",
  },
} as const;

/** An ad's drawer (the plan's 4.5). */
export const SHEET = {
  platform: "Facebook and Instagram",
  madeInMeta: "Made in Meta Ads Manager. Change it in Meta.",
  metasReason: "Meta's reason",
  neverRan: "It never ran, so Meta charged nothing for it.",
  fixInMeta: "Fix it in Meta",
  /** Chanlytics' half, and Meta's, each labelled as whose it is. */
  ours: "Counted by Chanlytics · last 30 days",
  cameLabel: "Wrote to AI",
  bookedLabel: "Booked",
  eachLabel: "For each who booked",
  only: (n: number) => `only ${n}`,
  theirs: "Meta's numbers · last 30 days",
  spentLabel: "Spent",
  shownLabel: "Times shown",
  tapsLabel: "Taps",
  chatsLabel: "Chats Meta counted",
  formsLabel: "Forms Meta counted",
  theirsNote: "Meta's count includes someone who tapped twice. It is never added to Chanlytics' people.",
  people: "People it brought",
  nobody: "No one has written from this ad in the last 30 days.",
  bookedMark: "Booked",
  more: "Show more",
  peopleFailed: "Couldn't read who it brought. Try again.",
  pause: "Pause",
  pauseBody: "It stops showing. Meta still bills what it already showed.",
  resumeAsk: (name: string) => `Turn ${name} back on?`,
  resumeBody: (o: { total: string; left: string; day: string }) =>
    `Meta holds a ${o.total} total for this ad and stops at it itself. ${o.left} is left, until ${o.day}.`,
  resume: (o: { left: string; day: string }) => `Turn back on · up to ${o.left} left, ends ${o.day}`,
  keepPaused: "Keep paused",
  inMeta: "Turn it back on in Meta",
  /** Why an ad made in Meta is turned back on in Meta: a head and a line, each. */
  cant: {
    no_total: {
      head: "No total and no end date",
      body: "So there is no most to name here. This ad is turned back on in Meta, where its amount is set.",
    },
    no_end: {
      head: "No end date",
      body: "So there is no last day to name here. This ad is turned back on in Meta, where its dates are set.",
    },
    shared: {
      head: "Other ads spend from the same budget",
      body: "So what is left is not this ad's alone. It is turned back on in Meta, where that budget is set.",
    },
    not_paused: {
      head: "Paused in Meta by what it sits in",
      body: "Its campaign or its ad set is paused in Meta, so turning the ad on here would start nothing. Turn it back on in Meta.",
    },
    nothing_left: {
      head: "Its total is spent",
      body: "Nothing is left of the total Meta holds for it. Raise it in Meta to run it again.",
    },
    ended: {
      head: "Its end date has passed",
      body: "Meta stopped it on its last day. Give it a new end date in Meta to run it again.",
    },
    made_here: { head: "", body: "" },
  },
  ownerOnly: "Only the owner can pause an ad or turn one back on.",
  signedOut: "Chanlytics is signed out of Meta, so it can't pause this ad. Connect again, or pause it in Meta.",
  leftInMeta: "This ad was left in Meta when you disconnected. It can only be changed there.",
  readOnly: "Chanlytics may read your ads, and Meta didn't allow it to pause them. Connect again to allow it.",
  paused: (name: string) => `${name} is paused.`,
  pausedSoon: (name: string) => `${name} will pause as soon as Meta takes the change.`,
  resumed: (name: string) => `${name} is back on.`,
  resumedSoon: (name: string) => `${name} will turn back on as soon as Meta takes the change.`,
  /** Meta gave no answer to a change: whether it took it is not known yet, and Chanlytics reads what stands. */
  pauseUnsure: (name: string) =>
    `Meta didn't answer, so ${name} may still be on. Chanlytics is checking, and this page shows what Meta did in a few minutes.`,
  resumeUnsure: (name: string) =>
    `Meta didn't answer, so ${name} may still be paused. Chanlytics is checking, and this page shows what Meta did in a few minutes.`,
  failed: "Couldn't reach Meta just now. Nothing was changed. Try again.",
} as const;

/** Meta Ads Manager, where an ad made in Meta is changed. */
export const ADS_MANAGER = "https://adsmanager.facebook.com/adsmanager/manage/ads";

/** Reports › Ads, in its first form: the page's numbers as figures and a table. */
export const LENS = {
  window: "Last 30 days · the same days Campaigns › Ads counts",
  came: "New people from your ads",
  booked: "Booked since",
  each: "For each who booked",
  spent: "Spent · Meta's number",
  heads: { ad: "Ad", came: "Wrote to AI", booked: "Booked", each: "Each", spent: "Spent (Meta)" },
  unnamed: "An ad you run in Meta that Chanlytics can't name yet",
  elsewhere: "Ads in an ad account you connected before this one",
  counted:
    "A person is counted once, for the ad they first wrote from. Booked means something on your calendar after that first message that wasn't cancelled.",
  open: "Open Ads",
} as const;
