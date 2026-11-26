/**
 * Every word the Ads page says once an account is connected (the Ads plan's 4.4, 4.5, 4.8 and 4.9, as the canvas draws
 * them: docs/2026-11-18-ads-connect-canvas). One word for each thing (docs/words.md): Meta is named where its bill,
 * its check or its own page is meant; AI is AI; nothing here is a system's word. The model (model.ts) chooses among
 * these and writes none of its own.
 */
import { AD_STATE_WORDS, type AdOpens, type AdPartLeft, type AdStopped } from "@chanlytics/contracts";

const peopleCount = (n: number): string => (n === 1 ? "1 person" : `${n} people`);

/** Meta's own names for the places an ad shows, as a drawer says them. */
const META_PLACE_WORDS: Readonly<Record<string, string>> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Audience Network",
  // screen-word: Meta's own app of that name, a place an ad shows, named as Meta names it
  threads: "Threads",
  whatsapp: "WhatsApp",
};

/** What a stopped launch left at Meta, said as a list: "campaign and ad set", "campaign, ad set and 3 ads". */
const PART_WORDS: Record<AdPartLeft, string> = { campaign: "campaign", set: "ad set", picture: "picture", ad: "ads" };
const partsSaid = (left: readonly AdPartLeft[]): string => {
  const words = left.map((part) => PART_WORDS[part]);
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1) ?? ""}`;
};

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
  /** The head while an account just connected has not been read: nothing is known of its ads yet. */
  reading: { strong: null, rest: "Reading your ads from Meta…" },
  /** An account is held and the page's own read is on its way, or did not come. */
  loading: "Loading your ads…",
  loadFailed: "Couldn't load your ads.",
  /** The head where its first read failed: what stood is nothing, and the clock asks again. */
  notReadYet: { strong: null, rest: "Couldn't read your ads from Meta yet. Chanlytics tries again by itself." },
  /** Who is charged, said once under the head. */
  money: "Meta charges your card, never Chanlytics. A paused ad stops, and Meta still bills what it already showed.",
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
  /** A row's first word, by where the ad stands: the one table, which a piece's Used in says too (contracts). */
  state: AD_STATE_WORDS,
  /** An ad made here, while Turn on's job makes it at Meta: nothing shows until Meta checks it. */
  settingUp: "Setting up · Meta checks it before anyone sees it",
  /** Its launch stopped part way: why, in a few words, and that nothing was spent. */
  couldntFinish: (reason: string) => `Couldn't finish · ${reason}. Nothing was spent`,
  /** Its last switch went unanswered, and no read has said since. */
  unconfirmed: "Couldn't confirm it's on · Meta didn't answer",
  /** Its owner cancelled it while it was set up, and the job has not stopped it yet: nothing is turned on. */
  cancelling: "Cancelling · nothing is turned on",
  /** Why a launch stopped, as a row says it. */
  stoppedWhy: {
    refused: "Meta turned it down",
    differs: "Meta held something other than what you approved",
    unanswered: "Meta didn't answer",
    ai_stopped: "AI was stopped",
    way_in: "AI couldn't answer the WhatsApp chat it opens",
    cancelled: "it was cancelled",
    disconnected: "the ad account was disconnected",
    signed_out: "Meta signed Chanlytics out",
    picture: "its picture couldn't be sent",
    business: "something it needs was missing",
    off: "turning ads on from here was switched off",
  } satisfies Record<AdStopped, string>,
  checking: "Meta is checking it, usually within a day",
  needs: {
    refused: "Not approved by Meta",
    unpaid: "Meta couldn't charge your card",
    troubled: "Meta found a problem with it",
    way_in: "AI can't answer the people it brings",
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
    `${peopleCount(came)} came from an ad you run in Meta that Chanlytics can't name yet` +
    (booked > 0 ? `, and ${booked} of them ${booked === 1 ? "has" : "have"} booked.` : "."),
  /** The people of an ad in an ad account this workspace connected before this one: counted, on a line of their own. */
  elsewhere: (came: number, booked: number) =>
    `${peopleCount(came)} came from an ad in an ad account you connected before this one` +
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
      `That was ${day}, and Meta charges while ${many ? "they run" : "it runs"}. ${many ? "They" : "It"} can only be paused in Meta now.`,
    /** Left on, and Meta was still checking it: it starts by itself once approved. */
    checkingTitle: (names: string) => `Meta was checking ${names} when you disconnected`,
    checkingBody: (day: string, many: boolean) =>
      `That was ${day}: if Meta approves ${many ? "them, they run" : "it, it runs"} and Meta charges. ${many ? "They" : "It"} can only be paused in Meta now.`,
    /** Some were running and Meta was checking others. */
    bothTitle: (names: string) => `${names} were left on when you disconnected`,
    bothBody: (day: string) =>
      `That was ${day}: Meta charges while they run, and one in review starts once approved. They can only be paused in Meta now.`,
    openMeta: "Open Meta",
    again: "Connect to read and pause them here again.",
  },
} as const;

/**
 * AI's one line on the page (the Ads plan's 6.3; decision 0050, call 12): when it speaks is the model's rules, with no
 * model asked, and it only proposes. Each sentence is a question its press answers.
 */
export const AI_LINE = {
  /** An account ready and no ad made here yet: the first, opening New ad, where AI writes it. */
  first: (inMeta: boolean) =>
    `Make your first ad${inMeta ? " here" : ""}? AI writes it, and nothing runs until you turn it on.`,
  /** An ad on that AI can't answer the people of (call 11): it spends for nothing, so AI proposes the pause. */
  wayIn: (name: string) => `${name} is on, and AI can't answer the people it brings. Pause it?`,
  /** An ad made in Meta that brought people and ends within days: keep it going, in Meta, where it is changed. */
  extend: (ending: { name: string; people: number; day: string }) =>
    `${ending.name} brought ${peopleCount(ending.people)} and ends ${ending.day}. Keep it going in Meta?`,
} as const;

/**
 * Who an ad brought and needs you now (the Ads plan's 4.4): one amber line, how many first, then who, each with how long
 * they have waited, and how many more. It opens the longest wait's conversation, in the Inbox's Needs you.
 */
export const NEEDS_YOU_LINE = {
  title: (count: number) =>
    count === 1 ? "1 person from your ads needs you." : `${count} people from your ads need you.`,
  /** A person and how long they have waited: "Jordan Price 6d". */
  person: (name: string, waited: string | null) => (waited ? `${name} ${waited}` : name),
  more: (count: number) => `${count} more`,
} as const;

/** An ad's drawer (the plan's 4.5). */
export const SHEET = {
  /** The handle's names on a phone, where an ad opens on the whole screen as a piece does (Campaigns in three tabs). */
  whole: "Show all of the ad",
  less: "Show less of the ad",
  /** The piece of Content an ad made here shows, one press back to it, or that it has gone from Made (its ads paused). */
  madeFrom: "Made from",
  fromGone: "a piece removed from Made",
  /** Where an ad shows, by Meta's own names for its places; "Meta" where that is not known yet. */
  platform: "Meta",
  places: META_PLACE_WORDS,
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
  /** Meta's count beside the messages that reached Chanlytics, up to the last day Meta has settled (tracking plan T2). */
  chatsKept: (o: { meta: number; kept: number; through: string }) =>
    `Meta counted ${o.meta} chats from this ad up to ${o.through}. ${o.kept} reached Chanlytics.`,
  /** When the two part: what is happening is the line above; nothing of the ad is affected, and nothing is asked. */
  chatsParted: "The ad and AI's replies aren't affected. Chanlytics is looking into it.",
  /** The people an ad brought back (T3): on a line of its own, never in the figures. */
  back: (o: { people: string; booked: number; from: "this ad" | "an ad" }) =>
    `${o.people} you already knew wrote again from ${o.from}. ${o.booked > 0 ? `${o.booked} booked after.` : "None booked after yet."}`,
  /**
   * What the bookings are worth beside what was spent (the tracking plan's T6), on one line: a sum a currency, said
   * side by side and never added; a dash under five booked, as the cost of a booked person is.
   */
  worth: (o: { booked: readonly string[] | null; spent: string; soFar: boolean }) =>
    `${o.booked === null ? "—" : `About ${o.booked.join(" and ")}`} booked for ${o.spent} spent${o.soFar ? " so far" : ""}`,
  /**
   * The visits the worth leaves out, and why, in the workspace's own word for one (docs/words.md: never a fixed
   * "visit"): the owner gives a service its amount in Settings.
   */
  worthLeftOut: (n: number, word: { one: string; many: string }) =>
    n === 1
      ? `1 ${word.one} is left out: its service has no amount yet.`
      : `${n} ${word.many} are left out: their service has no amount yet.`,
  worthDoor: "Set amounts",
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
    picture: {
      head: "Its picture can't run any more",
      body: "So Chanlytics paused it, and it runs again only with another picture. Make a new ad from New ad.",
    },
  },
  /** An ad made here, while it is set up: what happens, and that nothing is asked of the owner. */
  settingUp:
    "Chanlytics is making it at Meta, paused, then checking it against what you approved before turning it on.",
  /** The owner's Cancel while it is set up (the plan's 4.7, point 8). */
  cancel: "Cancel",
  cancelBody: "It stops before it runs. What Chanlytics made at Meta is removed, and nothing is spent.",
  cancelling: "Cancelling. Chanlytics removes what it made at Meta, and nothing is turned on.",
  cancelled: (name: string) => `${name} won't run. Chanlytics removes what it made at Meta.`,
  /** The Cancel came as its last switch went: the ad is made, and paused at once. */
  cancelledLate: (name: string) => `${name} was made just as you cancelled, so Chanlytics is pausing it now.`,
  /** Its owner has it on and AI can't answer the people it brings (call 11): why, and the press that stops the spend. */
  wayIn: (reason: string) => `${reason} Pause it, and Meta stops charging while nobody answers.`,
  /** Its launch stopped part way: what Meta was left holding, or that nothing was. */
  couldntFinish: (left: readonly AdPartLeft[]) =>
    left.length === 0
      ? "Nothing of it was left at Meta, and nothing was spent. Make it again from New ad."
      : `Its ${partsSaid(left)} ${left.length === 1 ? "is" : "are"} left in Meta, paused, so nothing runs or is spent. Remove ${left.length === 1 ? "it" : "them"} in Meta.`,
  openMeta: "Open Meta",
  /** Its last switch went unanswered: what is known, and the one thing to do. */
  unconfirmed: "Meta didn't answer when Chanlytics turned it on, so it may be on or still paused. Check asks Meta now.",
  check: "Check",
  checked: "Chanlytics asked Meta. This page shows what Meta says in a minute or two.",
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
    `Meta didn't answer, so ${name} may still be paused. Chanlytics checks, and this page shows the answer in a few minutes.`,
  failed: "Couldn't reach Meta just now, and nothing was changed. Try again.",
  /** A paused ad, while AI is stopped: nothing is turned on until AI runs again. */
  stopped: "AI is stopped, so this ad stays paused until AI runs again.",
} as const;

const adsCount = (n: number): string => (n === 1 ? "1 ad" : `${n} ads`);

/**
 * AI stopped (the content loop PRD's 14.1, call 21, reversing the Ads plan's G17): the stop paused the ads made here
 * itself, and the page and the card say so; an ad made in Meta is told of, with the owner's one press that pauses them.
 * What Meta still bills is said where it is pressed.
 */
export const STOP = {
  title: "AI is stopped",
  /** What the stop paused itself: the ads made here that were on. */
  pausedHere: (n: number) =>
    n === 1
      ? "Chanlytics paused 1 ad made here, so nothing is spent while nobody answers."
      : `Chanlytics paused ${n} ads made here, so nothing is spent while nobody answers.`,
  /** Still on: made in Meta's own tools (never paused by the stop), or any whose pause could not be kept. */
  on: (count: number, inMeta: boolean) => {
    const onesOn = inMeta
      ? count === 1
        ? "1 ad made in Meta is"
        : `${count} ads made in Meta are`
      : count === 1
        ? "1 ad is"
        : `${count} ads are`;
    return count === 1
      ? `${onesOn} still on, and Meta keeps charging for it while it runs.`
      : `${onesOn} still on, and Meta keeps charging for them while they run.`;
  },
  pausing: (n: number) => `Pausing ${adsCount(n)}…`,
  press: (n: number) => `Pause ${adsCount(n)}`,
  ownerOnly: "Only the owner can pause them.",
  /** What the press came to. */
  paused: (n: number) =>
    n === 1
      ? "1 ad is paused. Meta still bills what it already showed."
      : `${n} ads are paused. Meta still bills what they already showed.`,
  pausedSoon: (n: number) =>
    `${adsCount(n)} will pause as soon as Meta takes the change. Meta still bills what they already showed.`,
  /** No answer came to the press: whether the pauses were kept is not known yet, and the page reads what stands. */
  notKnown: (n: number) =>
    `No answer came, so ${adsCount(n)} may still be on. This page shows what stands in a moment.`,
  /** Every ad of the press refused on its own (changed since the page was read): the page has read them again. */
  notTaken: "Nothing was paused: the ads changed since the page was read. Press again.",
  partly: (done: number, of: number) => `${done} of ${of} ads are paused, and the rest couldn't be. Press again.`,
} as const;

/**
 * After a Resume (call 21): the ads the stop paused stay paused, since turning an ad on spends, and the owner's own press
 * turns them back on, naming how many.
 */
export const STOPPED_ADS = {
  title: "AI runs again",
  body: (n: number) =>
    n === 1
      ? "1 ad was paused when AI was stopped, and stays paused until you turn it back on."
      : `${n} ads were paused when AI was stopped, and stay paused until you turn them back on.`,
  press: (n: number) => (n === 1 ? "Turn it back on" : `Turn ${n} ads back on`),
  ownerOnly: "Only the owner can turn them back on.",
  /** What the press came to. */
  resumed: (n: number) =>
    n === 1
      ? "1 ad will turn back on as soon as Meta takes the change."
      : `${n} ads will turn back on as soon as Meta takes the change.`,
  notKnown: (n: number) =>
    `No answer came, so ${adsCount(n)} may still be paused. This page shows what stands in a moment.`,
  notTaken: "Nothing was turned back on: the ads changed since the page was read. Look again, then press.",
} as const;

/** Meta Ads Manager, where an ad made in Meta is changed. */
export const ADS_MANAGER = "https://adsmanager.facebook.com/adsmanager/manage/ads";

/** A page of Meta's opens in a tab of its own: the owner comes back to this one, and the page looks again. */
export const META_TAB = { target: "_blank", rel: "noopener noreferrer" } as const;

/** Reports › Ads, in its first form: the page's numbers as figures and a table. */
export const LENS = {
  window: "Last 30 days · the same days Ads counts",
  came: "New people from your ads",
  booked: "Booked since",
  each: "For each who booked",
  spent: "Spent · Meta's number",
  heads: { ad: "Ad", came: "Wrote to AI", booked: "Booked", each: "Each", spent: "Spent (Meta)" },
  unnamed: "An ad you run in Meta that Chanlytics can't name yet",
  elsewhere: "Ads in an ad account you connected before this one",
  counted:
    "A person counts once, for the ad they first wrote from. Booked: on your calendar after that, and not cancelled.",
  open: "Open Ads",
  /** No ad account was ever connected here. */
  none: {
    title: "No ad account is connected",
    body: "Connect Facebook and Instagram, and what your ads bring is counted here.",
  },
  notRead: {
    title: "Your ads couldn't be read just now",
    body: "Nothing changed at Meta. Open Ads to read them again.",
  },
} as const;
