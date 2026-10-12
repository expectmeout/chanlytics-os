/**
 * Every sentence New ad says (page-only): its five steps, the names of its controls, the lines of the variants (Google,
 * TikTok, a form), the rows of "Checked before turning on", and what stops Turn on. Consts where a sentence is one, small
 * functions where it takes a value; the values are already said (money by money.ts, days by words.ts). Owner and review
 * words come in as arguments (words.ts holds the platform tables). Trade-neutral. Words only, no data: new-ad.ts makes the
 * values these take, and New ad draws what it hands over.
 */
import { joinWords } from "../shared/words";
import type { AdDoor, AdPlatform } from "./ads";

export const NEW_AD = {
  kicker: "New ad",
  stepOf: (n: number) => `${n} of 5`,
  stepLabel: (n: number) => `Step ${n} of 5`,
  review: "Review",
  reviewTitle: "Everything is filled in. Skip to the last step.",
  /** The ad's name, to a screen reader. */
  nameLabel: "The ad's name",
  zip: "these ZIP codes",
  miles: (n: number) => `${n} miles`,
  endsAtGoogle: "11:59 pm",
  /** The name, drafted once the offer is chosen: `First appointment · 12 Oct`. */
  name: (offer: string, day: string) => `${offer} · ${day}`,
  /** The phone's sentence is clamped to two lines; this opens it. */
  sentenceMore: "Show the whole sentence",
  sentenceLess: "Show less",
  steps: ["What should people do?", "The ad", "Where and who", "Budget", "Review"] as const,
  back: "Back",
  cancel: "Cancel",
  next: ["Next: the ad", "Next: where and who", "Next: budget", "Next: review"] as const,
  say: "Nothing runs until you press Turn on.",
  sayFirst: "Nothing runs until you press Turn on in step 5.",
  turnOnTotal: (total: string) => `Turn on · up to ${total}`,
  turnOnDaily: (perDayText: string) => `Turn on · about ${perDayText}`,
  /** After the press: the toast, and what Undo does. */
  turnOnToast: (o: { owner: string; within: string }) =>
    `Sent to ${o.owner} to check, ${o.within}. It starts when ${o.owner} approves it.`,
  undone: "Paused. Nothing is spent.",
  /** What stops Turn on, said as a step; the door is Settings › Connections. */
  blocked: {
    need: (fix: string) => `${fix} to continue`,
    notConnected: (owner: string) => `Connect your ${owner} account to continue`,
    choose: (owner: string) => `Choose your ${owner} ad account to continue`,
    lapsed: (owner: string) => `Connect your ${owner} account again to continue`,
  },
  needs: "What this needs",
  /** New ad opened from an ad: the name it opens with says so. */
  from: {
    copy: (name: string) => `A copy of ${name}`,
    again: (name: string) => `${name}, again`,
    google: (name: string) => `${name} on Google`,
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
    path: (host: string) => `${host} › book`,
  },
  step1: {
    formNote: "To text or WhatsApp them first, they must tick the yes box on the form.",
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
    limit: (n: number, max: number, where: string) => `${n} of ${max} on ${where}`,
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
    googleMore: (o: { offer: string; business: string; price: string }) => ({
      headlines: [
        `Book ${o.offer}`,
        "Open times this week",
        `Call ${o.business}`,
        `Ask about ${o.offer}`,
        "Open Mon to Sat",
        `${o.offer} ${o.price}`.trim(),
        "Call to ask about times",
      ],
      descriptions: [`Call ${o.business} for open times. We'll go through them with you.`],
    }),
    count: (n: number, max: number) => `${n} of ${max}`,
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
    completions: ["We'll message you on WhatsApp", "Call us", "Nothing more"] as const,
    consentOn: "The yes box is on the form, unticked.",
    consentCounsel: "The yes line is counsel's wording. Chanlytics keeps it as it is.",
    /** The thank-you line a form ends on: whether it promises a message within minutes. */
    thanks: "Promise a message within minutes",
    thanksHint: (said: string) => `They read: ${said}`,
    thanksOnNote: "Chanlytics sends no first text yet. You would write to them yourself.",
    /** Who the ad is shown as: read from the connection, changed in Settings. */
    shownAs: {
      label: "Shown as",
      line: (name: string, handle: string | null) => (handle ? `${name} · ${handle}` : name),
      limit: (max: number) => `Up to ${max} characters`,
      door: "Change in Settings › Connections",
    },
    /** Meta: a photo or a vertical video. */
    media: {
      label: "What the ad shows",
      photo: "Photo",
      video: "Video",
      videoNote: "Vertical, for Reels and Stories",
      postsVideo: "Use one of my Instagram videos",
    },
    /** Google: what people search, grouped by Google. */
    search: {
      label: "What people search",
      note: "Google groups searches; you will see what people typed in the ad's Results.",
      leftOut: (list: readonly string[]) => `Left out for you: ${list.join(", ")}`,
    },
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
    areaTiktok: (zip: string) => `People in ${zip}`,
    areaPicker: "How far around your address",
    of: "of",
    regulars:
      "It may also show to people who already know you. Anyone already in People who writes is not counted as new.",
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
    ageLine: (floor: number) => `${floor} and over`,
    agesWhyDefault: (owner: string) => `${owner} shows ads like this to adults only.`,
    agesWhyCosmetic: "TikTok shows cosmetic ads to people 25 and over.",
    alsoGoogleNote: "After this one is on, you'll set up the Google one: same offer, its own amount.",
    /** What the platform looks for, by door. */
    who: (platform: AdPlatform, door: AdDoor) => {
      if (platform === "google") return "Google shows it to people searching for what you offer.";
      const owner = platform === "tiktok" ? "TikTok" : "Meta";
      return door === "whatsapp"
        ? `${owner} looks for people likely to message you.`
        : `${owner} looks for people likely to leave a number.`;
    },
  },
  step4: {
    mode: ["For a set number of days", "Until I stop it"] as const,
    modeLabel: "How the money runs",
    presetsLabel: "How much",
    /** `Steady · about $15 a day for 20 days · up to $300 · ends Sat 31 Oct`: the label, then the rest. */
    preset: (o: { perDay: string; days: number; total: string; end: string }) =>
      `about ${o.perDay} for ${o.days} days · up to ${o.total} · ends ${o.end}`,
    presetDaily: (o: { perDay: string }) => `about ${o.perDay}`,
    own: "Your own amount",
    ownLabel: "Amount a day",
    /** The unit beside the box: the currency's symbol, then a day. */
    ownUnit: (symbol: string) => `${symbol} a day`,
    ownNeeds: "Enter an amount a day.",
    fees: "WhatsApp message fees, if any, are billed by WhatsApp and are not in this number.",
    dailyAbout: (perDayText: string) => `About ${perDayText}`,
    estimate: (o: { lo: number; hi: number; days: number }) =>
      `About ${o.lo} to ${o.hi} chats over the ${o.days} days · Meta's estimate, not a promise.`,
    noEstimate: "Meta can't estimate this yet. The first days will tell us.",
    googleEstimate: (o: { clicks: readonly [number, number]; from: string; to: string }) =>
      `About ${o.clicks[0]} to ${o.clicks[1]} clicks a month at this amount, usually ${o.from} to ${o.to} a click · Google's estimate`,
    history: (each: string, people: number) =>
      `Your earlier ads cost about ${each} for each person who booked (${people} people).`,
    more: "More choices",
    /** Only while the business is open: the switch, and why it is off or not a switch. */
    openOnly: (hours: string) => `Only while you're open (${hours})`,
    openOnlyOn: "It shows only in those hours.",
    openOnlyOff: "Off: it can show at any hour.",
    openOnlyMeta: "Meta can keep to your hours only with a set number of days.",
    openOnlyGoogle: "The call button follows your hours anyway.",
    /** What each platform says about changing the amount once the ad is on. */
    tiktokChange: (maxStep: number, waitDays: number) =>
      `After it is on, TikTok lets you change the amount by up to ${Math.round(maxStep * 100)}% at a time, once every ${waitDays} days.`,
    googleAverage: (o: { day: number; month: number }) =>
      `A Google daily amount is an average: a day can spend up to ${o.day === 2 ? "twice" : `${o.day} times`} it, never more than ${o.month} times it in a month.`,
    relearn: "Changing the amount sends it back to learning for a few days.",
  },
  step5: {
    kicker: (door: string) => `New ad · ${door}`,
    readyLabel: "What the account stands on",
    ready: (parts: string) => `Ready · ${parts}`,
    /**
     * What the account stands on, in the words of each platform. The number on the page an ad opens is the ad's own check
     * (it follows "The ad opens", in Checked before turning on), never the account's.
     */
    readyParts: {
      meta: ["account active", "payment method in Meta", "Page and WhatsApp number linked"],
      google: ["Google Ads account active", "a card added in Google Ads", "call reporting on"],
      tiktok: ["TikTok account linked", "payment method in TikTok", "privacy page link added"],
    } satisfies Record<AdPlatform, string[]>,
    forecast: (o: { owner: string; within: string; perDay: string; total: string; end: string }) =>
      `${o.owner} checks it first, ${o.within}, then it starts. About ${o.perDay} · up to ${o.total} in all · ends ${o.end}.`,
    forecastDaily: (o: { owner: string; within: string; perDay: string }) =>
      `${o.owner} checks it first, ${o.within}, then it starts. About ${o.perDay} until you stop it.`,
    checked: "Checked before turning on",
    quiet: (owner: string) => `Counted by Chanlytics, not by ${owner}.`,
    quietCalls: "Calls are Google's count, not Chanlytics'.",
    fix: "Add it",
    noCalendar: "You will see who wrote, not who booked, until your calendar is connected.",
    /** "Checked before turning on" counts what is ready: `7 of 7 ready`. */
    count: (met: number, of: number) => `${met} of ${of} ready`,
    setFor: "What Chanlytics set for you",
    /** What each door's result is called in the lowest-cost line. */
    result: { whatsapp: "chat", call: "call", form: "number" } satisfies Record<AdDoor, string>,
  },
};

/** Google: what the draft's searches are made of, and what is left out for the owner. Derived in the fold, never typed in a step. */
export const GOOGLE_SEARCH = {
  themes: (o: { offer: string; a: string }): string[] => [
    `${o.offer.toLowerCase()} near me`,
    `book ${o.a}`,
    "open times this week",
  ],
  leftOut: ["jobs", "free", "courses", "how to"] as readonly string[],
};

/** What Chanlytics set for the owner on each platform, one list each: read-only, in owner words. */
export const SET_FOR_YOU = {
  meta: (o: { age: number; result: string; hours: string | null; adjust: boolean }): string[] => [
    "Feeds, Stories and Reels, not WhatsApp Status or the Audience Network",
    `People who live in or were recently in the area, ${o.age} and over`,
    o.adjust ? "Meta may adjust your photo and wording, as you chose" : "Meta's automatic style changes are off",
    `The lowest cost for each ${o.result}`,
    o.hours === null ? "All hours" : `Only while you're open (${o.hours})`,
  ],
  google: (o: {
    headlines: number;
    descriptions: number;
    hours: string;
    seconds: number;
    leftOut: readonly string[];
  }): string[] => [
    "Search only, with search partners off",
    "People in the area",
    `${o.headlines} headlines and ${o.descriptions} descriptions, written from your Services`,
    `The call button follows your hours (${o.hours})`,
    `A call counts past ${o.seconds} seconds`,
    "Most clicks to start",
    `Searches for ${joinWords(o.leftOut)} left out`,
  ],
  tiktok: (o: { age: number; confirm: boolean; days: number; hours: string | null }): string[] => [
    "TikTok and its partner apps",
    `${o.age} and over`,
    o.confirm ? "Name and phone, with a confirm step" : "Name and phone",
    "The most results for the amount",
    `A lead counts within ${o.days} days of a tap, and views are not counted`,
    ...(o.hours === null ? [] : [`Only while you're open (${o.hours})`]),
  ],
};

/** A fourth door, quiet and not pressable, last in step 1. */
export const BOOK_ONLINE =
  "Book online comes later. Chanlytics can't see inside your booking tool, so it couldn't count who booked.";

/** The rows of "Checked before turning on", in owner words. */
export const CHECKS = {
  words: "Your words say what you offer, not something about the reader",
  promises: "No promises like guaranteed or in 3 days",
  price: "Price and hours match your Services and Hours",
  priceQuote: "The ad quotes a price and your receptionist is set to never quote prices",
  rating: (line: string) => `Rating line: ${line}`,
  post: "The caption of the post was checked as ad words",
  special: "Not a job, loan or home ad",
  privacy: "Privacy page link added",
  yes: "Your yes line saved with each number",
  noHealth: "No health question",
  businessName: "The first words of the call are your business name",
  /** The words fit the platform's limits, or which one does not. */
  fits: "Your words fit the platform's limits",
  headlineLong: (o: { n: number; max: number; where: string }) =>
    `The headline is ${o.n} characters. ${o.where} shows the first ${o.max}.`,
  textLong: (o: { n: number; max: number; where: string }) =>
    `The text is ${o.n} characters. ${o.where} shows the first ${o.max}.`,
  googleLong: (o: { n: number; max: number; what: string }) =>
    `A Google ${o.what} is ${o.n} characters. Google allows ${o.max}.`,
  /** The ad says a price that Services does not. */
  priceDiffers: (o: { said: string; note: string }) => `The ad says ${o.said}. Services says ${o.note}.`,
  /** A platform account that is not ready, as a row: it stops Turn on until it is. */
  account: {
    "not-connected": (owner: string) => `${owner} account connected`,
    choose: (owner: string) => `${owner} ad account chosen`,
    lapsed: (owner: string) => `${owner} account connected again`,
  },
};

/** `4.9 on Google · 128 reviews · as of 11 Oct`. */
export const ratingLine = (o: { stars: string; reviews: number; day: string }): string =>
  `${o.stars} on Google · ${o.reviews} reviews · as of ${o.day}`;
