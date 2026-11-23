/**
 * Every word New ad says (the Ads plan's 4.6, 5.1 and G7, G13; the canvas "Ads: connect, and what Meta asks for",
 * boards "Making an ad: one screen" and "what the plan added"). One word for each thing (docs/words.md): AI is AI,
 * Meta is named where its bill, its check or its own rule is meant, and nothing here is a system's word. The model
 * (model.ts) chooses among these and writes none of its own.
 */
import { WORKSPACE_PAUSED, type AdCardCheckId, type AdPictureIssue, type AdSpecialKind } from "@chanlytics/contracts";
import type { AdCantDraft, AdWordsFault } from "@/server/ads/draft-shape";

/** A line that stops the ad, or asks: what is so, what it means, and the words of its one act. */
interface LineWords {
  title: string;
  body: string;
}

const days = (n: number): string => (n === 1 ? "1 day" : `${n} days`);

export const NEW = {
  /** The sheet's line over the service's name. */
  kicker: "New ad · drafted by AI",
  /** A draft someone else left, as they left it. */
  kickerLeft: (name: string) => `New ad · left by ${name}`,
  /** Fix it's draft of an ad Meta turned down (the Ads plan's 4.5). */
  kickerFix: (name: string) => `New ad · fixing ${name}`,
  opening: "New ad",
  close: "Close",

  /** The one sentence, around its four words. */
  sentence: {
    show: "Show ",
    within: " to people within ",
    /** Before a city the ad is shown in, with Meta's least ring around it; before a state or a whole country. */
    inAround: " to people in and around ",
    across: " to people across ",
    so: ", so they message you on WhatsApp, up to ",
    until: " until ",
    end: ".",
    miles: (n: number) => (n === 1 ? "1 mile" : `${n} miles`),
    /** What a word is, to a screen reader: "The area: 5 miles". */
    word: { area: "The area", amount: "The amount", end: "The end date" },
    said: (word: string, value: string) => `${word}: ${value}`,
  },

  /** Why that amount: never a number of bookings. */
  why: {
    starting: "A starting amount. There is no history yet to say what a booking costs.",
    startingNoCalendar: "A starting amount. Without a calendar link, AI can't see your open times.",
    startingFull: (n: number) => `A starting amount. The calendar has no open time in the next ${days(n)}.`,
    booked: (open: number, n: number, cost: string) =>
      `${open === 1 ? "1 open time" : `${open} open times`} in the next ${days(n)}, and a booking from an ad has cost about ${cost}.`,
    heldToMost: (money: string) => `Kept to ${money}, the most you said an ad may cost.`,
    heldToLargest: (money: string) => `Kept to ${money}, the largest total of any ad you have run.`,
    heldToLeast: "Kept to the least Meta takes until you tell AI the most an ad may cost.",
    raisedToLeast: (n: number) => `Raised to the least Meta takes for ${days(n)}.`,
    aDay: (money: string, n: number) => `About ${money} a day for ${days(n)}.`,
    /** Fix it's draft: AI rewrote the words from Meta's reason, and turning it on ends the one Meta turned down. */
    fixing: (name: string) => `AI rewrote the words from Meta's reason. Turn this on and ${name} ends.`,
    mostBooked: "It offers what people booked most in the last 90 days.",
    /** Google says the business goes to its customers: the ad is shown across the place it serves. */
    goesToCustomers: "You go to your customers, so it shows across the place you serve. Tell AI to change it.",
    first: "It offers the first of your Services.",
  },

  /** A word of the sentence, tapped: changed in place. */
  edit: {
    amount: "Up to",
    amountLabel: "The most this ad can cost",
    amountHint: (aDay: string, least: string) => `about ${aDay} a day · Meta needs at least ${least} a day`,
    miles: "Within",
    milesUnit: "miles",
    milesLabel: "Miles around your business",
    milesHint: "From 1 to 50. Meta shows it to people who live there or were there lately.",
    end: "Until",
    endLabel: "The last day it runs",
    endHint: (n: number) => `${days(n)} · Meta needs at least a day`,
    done: "Done",
    change: (word: string, now: string) => `Change ${word}, now ${now}`,
    amountWord: "the amount",
    milesWord: "the area",
    endWord: "the end date",
  },

  /** The ad as it will look. */
  shown: {
    label: "The ad as it will look",
    faces: "Where it shows",
    feed: "Feed",
    story: "Story",
    reel: "Reel",
    version: (at: number, of: number) => `${at} of ${of} versions`,
    nextVersion: "Show the next version",
    coming: "3 versions coming",
    none: "No versions yet",
    writing: "AI is writing…",
    noWords: "No words yet",
    page: "Your Page",
    ad: "Ad",
    cta: "Send WhatsApp message",
    picture: (name: string) => `The ad's picture, ${name}`,
    video: (name: string) => `The ad's video, ${name}`,
    drawn: "Drawn by Chanlytics, not Meta's own preview. Your picture is shown whole, never cropped.",
    /** Meta's own preview, once the ad account is connected (the plan's 4.6), and the frame's name to a screen reader. */
    meta: "Meta's own preview, as people will see it on a phone.",
    metaFrame: (place: string) => `Meta's own preview of the ad, in the ${place.toLowerCase()}`,
    asking: "Asking Meta for its own preview…",
    /** Where Meta's own can't be had, Chanlytics' drawing stands in its place, and says why in one line. */
    not: {
      not_connected: "Drawn by Chanlytics: Meta shows its own preview once the ad account is connected.",
      signed_out: "Drawn by Chanlytics: Meta shows its own preview once the ad account is connected again.",
      video: "Drawn by Chanlytics: Meta's own preview is shown for a photo.",
      busy: "Drawn by Chanlytics: Meta didn't answer. New ad asks it again next time it opens.",
      refused: "Drawn by Chanlytics: Meta didn't show its own preview of this version.",
    },
  },

  /** Tell AI what to change. */
  tell: {
    label: "Tell AI what to change",
    send: "Send",
    changing: "AI is changing it…",
    changed: {
      words: "AI changed the words.",
      service: "AI changed the service. Its words are being written.",
      picture: "AI changed the picture.",
      area: "AI changed the area.",
      amount: "AI changed the amount.",
      end: "AI changed the end date.",
    },
    none: "AI can change the service, the words, the picture, the area, the amount or the end date. Nothing was changed.",
    fault: (rule: string) => `${rule}, and Meta turns that down. Nothing was changed.`,
    failed: "AI didn't answer, so nothing was changed. Try again.",
  },

  /** Who Meta charges, and what the press tells Meta. */
  facts: {
    charges: "Meta charges",
    account: (name: string, currency: string) => (name ? `${name} · ${currency}` : currency),
    tells: "You tell Meta",
    none: "Not a job, housing, finance, politics or gambling ad",
    waiting: "Waiting for your answer",
  },

  /** The press, and the line under it. */
  press: {
    turnOn: (money: string) => `Turn on · up to ${money}`,
    ready: "Made paused. Meta checks it first, usually within a day.",
    writing: "Turn on waits for the words.",
    noWords: "An ad with no words can't be turned on.",
    answer: "Turn on waits for your answer.",
    kind: (ad: string) => `${ad} can't be turned on here.`,
    check: "Turn on waits for the one thing above.",
    owner: "Only the owner can turn an ad on.",
    off: "Turning an ad on from here isn't on in this workspace yet. Nothing is made at Meta.",
    video: "Turn on sends a photo for now. Use the next picture to pick a photo.",
    turning: "Turning it on…",
    failed: "Couldn't reach Chanlytics, so nothing was made. Try again.",
  },

  /** After Turn on: the ad is being set up at Meta, and where to see it. */
  turnedOn: {
    title: "Setting it up at Meta",
    body: "Chanlytics makes it paused first, checks it against what you approved, then turns it on.",
    small: "Meta checks it before anyone sees it, usually within a day. It's on your Ads page now.",
    act: "See the ad",
  },

  /** Where the words can't be written. */
  couldnt: {
    title: "Couldn't write the words",
    body: "Nothing was sent to Meta. The amount and the dates are kept.",
    limit: " AI can write again tomorrow: today's AI limit is reached.",
    paused: " AI writes again once this workspace is active.",
    act: "Try again",
  },

  /** Where New ad itself could not be read. */
  failed: {
    title: "Couldn't open New ad",
    body: "Chanlytics didn't answer, so no ad was drafted. Nothing was changed.",
    act: "Try again",
  },

  rewrite: "Let AI rewrite it",
  takePriceOut: "Take the price out",
  nextPicture: "Use the next picture",
  setTo: (value: string) => `Use ${value}`,
  openMeta: "Open Meta",
} as const;

/** The words' faults, each as the line a draft says and as the clause "Tell AI" says of a change not made. */
export const WORDS_FAULT: Record<AdWordsFault, LineWords & { told: string }> = {
  about_reader: {
    title: "The words speak about the person reading",
    body: "Meta turns that down. An ad may describe the service, never the reader.",
    told: "That would speak about the person reading",
  },
  feel_bad: {
    title: "The words could make someone feel bad about how they look",
    body: "Meta turns that down.",
    told: "That could make someone feel bad about how they look",
  },
  sure_result: {
    title: "The words promise a sure result",
    body: "Meta turns that down.",
    told: "That would promise a sure result",
  },
  before_after: {
    title: "The words say before and after",
    body: "Meta turns that down for an ad about how someone looks.",
    told: "That would say before and after",
  },
  pressure: {
    title: "The words hurry the reader",
    body: "Meta turns that down unless the deadline is your own.",
    told: "That would hurry the reader",
  },
  other: {
    title: "The words need writing again",
    body: "They no longer fit this ad.",
    told: "Those words would not fit an ad",
  },
};

export const PRICE_FAULT: Record<"never" | "differs", LineWords> = {
  never: { title: "The ad says a price, and AI is set to never quote prices", body: "An ad says what AI would say." },
  differs: {
    title: "The ad says a price that isn't in Services",
    body: "An ad says the price Services says, or none.",
  },
};

export const PICTURE_FAULT: Record<AdPictureIssue | "gone", LineWords> = {
  music: { title: "This video has music", body: "Music in an ad needs a licence of your own." },
  before_after: { title: "This picture sets a before beside an after", body: "Meta turns that down in many ads." },
  small: { title: "This picture is too small for an ad", body: "Meta needs it at least 600 pixels wide." },
  shape: {
    title: "This picture is the wrong shape for the feed",
    body: "Chanlytics never crops your picture, so it uses one that fits.",
  },
  length: { title: "This video is too long or too short for an ad", body: "A video in an ad runs 3 to 60 seconds." },
  gone: { title: "This picture is no longer in Files", body: "The ad needs another." },
};

export const AMOUNT_FAULT = {
  under_least: (least: string, n: number): LineWords => ({
    title: `Meta takes at least ${least} for ${days(n)}`,
    body: "A smaller amount would be refused.",
  }),
  over_most: (most: string): LineWords => ({ title: `That is over the most you said, ${most}`, body: "" }),
  not_whole: (): LineWords => ({ title: "The amount is a whole number", body: "Meta holds exactly what you approve." }),
};

export const END_FAULT: LineWords = { title: "An ad runs at least a day", body: "Meta refuses a shorter run." };
export const AREA_FAULT: LineWords = { title: "The area is from 1 to 50 miles", body: "Meta takes no other." };

/** The card's check, where the page has not read the card's own words for it yet. */
export const ACCOUNT_FAULT: Record<AdCardCheckId, LineWords> = {
  "account-active": { title: "Your ad account can't run ads right now", body: "Its card on the Ads page says why." },
  payment: { title: "Meta has no payment method for this ad account", body: "An ad made without one is never shown." },
  "page-linked": { title: "Meta shared no Page", body: "An ad runs as your Page." },
};

/** The special kinds of ad Meta asks to be declared: the question, its two answers, and what a yes means. */
export const KIND: Record<AdSpecialKind, { ask: string; yes: string; no: string; ad: string; undo: string }> = {
  employment: {
    ask: "Is this ad offering a job?",
    yes: "Yes, a job",
    no: "No, a service",
    ad: "A job ad",
    undo: "It isn't a job ad",
  },
  housing: {
    ask: "Is this ad offering a home to rent or buy?",
    yes: "Yes, a home",
    no: "No, a service",
    ad: "A housing ad",
    undo: "It isn't a housing ad",
  },
  financial: {
    ask: "Is this ad offering a loan, credit, insurance or investing?",
    yes: "Yes, it is",
    no: "No, a service",
    ad: "A financial ad",
    undo: "It isn't a financial ad",
  },
  politics: {
    ask: "Is this ad about an election or a political issue?",
    yes: "Yes, it is",
    no: "No, a service",
    ad: "A political ad",
    undo: "It isn't a political ad",
  },
  gambling: {
    ask: "Is this ad about gambling or betting?",
    yes: "Yes, it is",
    no: "No, a service",
    ad: "A gambling ad",
    undo: "It isn't a gambling ad",
  },
};

export const KIND_ASK = {
  body: (service: string) => `Meta has its own rules for these ads. AI couldn't tell from “${service}”.`,
  yesTitle: (ad: string) => `${ad} is made in Meta`,
  yesBody: "Meta takes away the area and age choices this draft rests on. Nothing was made here.",
};

/** + New, where a draft can't be written yet: the one thing missing, and the press that opens it (the plan's G13). */
export const MISSING: Record<AdCantDraft, LineWords & { small: string; act: string }> = {
  service: {
    title: "First, a service to offer",
    body: "An ad offers one of your Services. There is none to offer yet, or each already has an ad running.",
    small: "AI drafts the ad as soon as there is one.",
    act: "Open Settings",
  },
  address: {
    title: "First, your address",
    body: "An ad is shown to people near your business, so it needs your address.",
    small: "Everything else is ready. AI drafts the ad as soon as it is in.",
    act: "Open Settings",
  },
  whatsapp: {
    title: "First, WhatsApp",
    body: "A tap on the ad opens a WhatsApp chat that AI answers. No WhatsApp number is connected yet.",
    small: "AI drafts the ad as soon as one is.",
    act: "Open Connections",
  },
  whatsapp_unread: {
    title: "WhatsApp hasn't said if your number can answer",
    body: "A tap on the ad opens a WhatsApp chat that AI answers. Chanlytics asks WhatsApp first, and no answer is in yet.",
    small: "AI drafts the ad as soon as WhatsApp says it can.",
    act: "Check again",
  },
  whatsapp_blocked: {
    title: "WhatsApp can't send from your number",
    body: "A tap on the ad opens a WhatsApp chat, and WhatsApp isn't letting your number answer it right now.",
    small: "Connections says why and what to do. AI drafts the ad as soon as it can send again.",
    act: "Open Connections",
  },
  paused: {
    title: "This workspace is paused",
    body: `A tap on the ad opens a WhatsApp chat. While the workspace is paused, ${WORKSPACE_PAUSED.gets}.`,
    small: "AI drafts the ad once the workspace is on again.",
    act: "Open Billing",
  },
  picture_none: {
    title: "First, a photo or a video",
    body: "An ad shows one of your own photos or videos, and the Library holds none yet.",
    small: "AI drafts the ad as soon as there is one.",
    act: "Open Library",
  },
  picture_music: {
    title: "First, a video with no music",
    body: "Music in an ad needs a licence of your own, and a video is heard before it can run.",
    small: "Add a photo, or a video with no music. AI drafts the ad as soon as one is in.",
    act: "Open Library",
  },
  picture_gone: {
    title: "That piece is no longer in Content",
    body: "It was deleted or set aside after Run as an ad was pressed.",
    small: "Open another piece there, and run that one as an ad.",
    act: "Open Content",
  },
  picture: {
    title: "First, a picture that fits an ad",
    body: "An ad shows a photo or a video at least 600 pixels wide, from square to wide. None of yours fits yet.",
    small: "Chanlytics never crops your picture. AI drafts the ad as soon as one fits.",
    act: "Open Library",
  },
  account: {
    title: "First, your ad account",
    body: "An ad runs from your own ad account at Meta, and none is connected.",
    small: "Connect it on the Ads page.",
    act: "Back to Ads",
  },
  account_reading: {
    title: "Chanlytics is still reading your ad account",
    body: "This takes a minute or two after you connect. AI drafts your ad as soon as it is read.",
    small: "Nothing is needed from you.",
    act: "Look again",
  },
  stopped: {
    title: "AI is stopped",
    body: "While AI is stopped, no ad is written or turned on.",
    small: "Start AI again where you stopped it, then open New ad.",
    act: "Back to Ads",
  },
};
