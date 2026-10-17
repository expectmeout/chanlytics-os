import { plural } from "../shared/words.js";
import { PLATFORM_OWNER, REVIEW_WITHIN, allWord, checkFix, peopleWord } from "./words.js";
const moreSpent = (more) => `Up to ${more} more can be spent`;
export const LIST = {
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
  /** On a phone a list's first note stands under its choices, and the rest fold under this (the fitted sheets). */
  how: "How this works",
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
export const CHIPS = {
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
export const ZIPS = {
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
export const EDIT = {
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
export const CHANGED = {
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
export const NO_AD = {
  title: "This ad isn't here any more",
  body: "It may have been ended and cleared away."
};
export const PEOPLE_TAB = { everyone: "Everyone", none: "Nobody yet." };
export const SHOWN = {
  frameLabel: "Where it shows",
  photo: "Your photo goes here",
  video: "Your video goes here",
  adWord: "Ad",
  consentBox: "Not ticked",
  formRows: "What they fill in",
  reach: "What this ad runs on"
};
const MADE_IN = {
  meta: "Meta Ads Manager",
  google: "Google Ads",
  tiktok: "TikTok Ads Manager"
};
const CHANGE_IN = { meta: "Meta", google: "Google Ads", tiktok: "TikTok" };
const MADE_PARTS = "the campaign and who it shows to";
const paymentLead = (p) => p === "meta" ? "Meta couldn't charge your card. Update it in Meta" : checkFix("payment", p);
export const DRAWER = {
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
export const PREVIEW = {
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
