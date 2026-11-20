/**
 * Every word New ad says (the Ads plan's 4.6, 5.1 and G7, G13; the canvas "Ads: connect, and what Meta asks for",
 * boards "Making an ad: one screen" and "what the plan added"). One word for each thing (docs/words.md): AI is AI,
 * Meta is named where its bill, its check or its own rule is meant, and nothing here is a system's word. The model
 * (model.ts) chooses among these and writes none of its own.
 */
import type { AdCardCheckId, AdPictureIssue, AdSpecialKind } from "@chanlytics/contracts";
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
  kickerSample: "New ad · an example",
  opening: "New ad",
  close: "Close",

  /** The one sentence, around its four words. */
  sentence: {
    show: "Show ",
    within: " to people within ",
    so: ", so they message you on WhatsApp, up to ",
    until: " until ",
    end: ".",
    miles: (n: number) => (n === 1 ? "1 mile" : `${n} miles`),
  },

  /** Why that amount. */
  why: {
    starting: "A starting amount. There is no history yet to say what a booking costs.",
    startingKnown: (n: number) => `A starting amount: the least Meta takes for ${days(n)}.`,
    aDay: (money: string, n: number) => `About ${money} a day for ${days(n)}.`,
    mostBooked: "It offers what people booked most in the last 90 days.",
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
    sample: "This is an example: AI changes a real draft once your ad account is connected.",
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
    notYet: "Chanlytics can't turn an ad on yet. Nothing is made at Meta, and nothing is spent.",
    sample: "This is an example: nothing is made at Meta, and nothing is spent.",
    sampleDone: "An example: nothing was made at Meta, and nothing was spent.",
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
  person: {
    title: "This picture shows a person who hasn't said yes to ads",
    body: "A yes for posts doesn't cover an ad.",
  },
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
  "whatsapp-linked": { title: "Your Page isn't linked to a WhatsApp number", body: "A tap on the ad opens WhatsApp." },
  "chanlytics-whatsapp": {
    title: "AI doesn't answer a WhatsApp number yet",
    body: "A tap on the ad opens a chat AI answers.",
  },
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
  picture: {
    title: "First, a picture that can run as an ad",
    body: "An ad shows a photo or a video, and none of yours can run as an ad yet.",
    small:
      "For now an ad shows a picture with nobody in it, or a video with no music. AI drafts the ad as soon as there is one.",
    act: "Open Content",
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
