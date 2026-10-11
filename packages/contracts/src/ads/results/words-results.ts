/**
 * Every sentence the Results sheet and Reports › Ads say (page-only): the head, the pane line, the lanes, the funnel, what came of
 * the appointments, the tables, what the platforms say, the Overview's one fact and the doors between the pages. Consts where a
 * sentence is one, small functions where it takes a value; the values are already said (money by money.ts, days by words.ts), and
 * the workspace's appointment word comes in as an argument, never written in (and never "booking", which the glossary keeps for
 * the act and the link). The four figures' own words are the page's (words-page.ts figureWords): the sheet, the lens and the page
 * say a number the same way. Words only, no data: results.ts makes the values these take, and the sheet and the lens draw what it
 * hands them.
 */
import { plural } from "../../shared/words";
import { peopleWord } from "../words";

export const RESULTS = {
  /** The sheet: the quiet line it opens under, and its name. */
  kicker: "Your ads · last 30 days",
  title: "What your ads brought",
  scope: { label: "Which ads", all: "All ads", platforms: "Where they run", ads: "One ad" },
  /** The foot's door, and the empty lens's door. */
  fullReport: "Full report",
  openAds: "Open Ads",

  /** Under the head: what the days cover, and when the numbers were read. */
  pane: (o: { dates: string; days: number; readAt: string | null }) =>
    `${o.dates} · ${plural(o.days, "day")}${o.readAt ? ` · read ${o.readAt}` : ""}`,

  /** What the head says the results are of: `your ads`, `your Google ads`, an ad's own name. */
  of: { all: "your ads", platform: (platform: string) => `your ${platform} ads`, ad: (name: string) => name },
  /** The head: the page's sentence, said of whatever the results are narrowed to. */
  head: {
    booked: (o: { booked: number; touch: number; of: string }) => ({
      strong: `${o.booked} of ${o.touch}`,
      rest: ` new people from ${o.of} have booked.`,
    }),
    touchOnly: (o: { touch: number; of: string }) => ({
      strong: `${o.touch}`,
      rest: ` new people got in touch through ${o.of}.`,
    }),
    /** Only Google's calls stand here: its count, and not people. */
    calls: (o: { calls: number; of: string }) => ({
      strong: `${o.calls}`,
      rest: ` ${o.calls === 1 ? "call" : "calls"} from ${o.of}, Google's count. Calls aren't matched to people yet.`,
    }),
    quiet: (o: { of: string }) => ({ strong: "", rest: `Nobody new has got in touch through ${o.of} yet.` }),
  },

  /** By day: two small charts, what was spent and who it brought. */
  days: {
    title: "By day",
    spent: "Spent",
    spentTitle: "Spent a day",
    peopleTitle: "New people a day",
    booked: "Booked since",
    waiting: "Not booked yet",
    peopleLine: "Dark part: booked since. People only: calls are Google's count and are left out.",
    spentAria: (o: { total: string; days: number }) => `${o.total} spent over ${plural(o.days, "day")}.`,
    peopleAria: (o: { people: number; booked: number; days: number }) =>
      `${peopleWord(o.people)} got in touch over ${plural(o.days, "day")}; ${o.booked} ${o.booked === 1 ? "has" : "have"} booked.`,
    /** A tooltip's line for a day still settling. */
    settlingDay: "Still settling: a person can still book.",
    /** `a` is the workspace's appointment word with its article: `an appointment`. */
    settling: (days: number, a: string) => `The last ${days} days are still settling, so ${a} can still land on them.`,
    callsNote: (n: number) => `${plural(n, "call")} Google counted aren't in the people chart: its count, not people.`,
    severalCurrencies:
      "These ads are paid in more than one currency, so what was spent isn't drawn as one chart. Each total is in its own currency.",
    columns: { day: "Day", spent: "Spent", people: "Got in touch", booked: "Booked", calls: "Calls (Google's count)" },
  },

  /** From first contact to booked: people only. */
  funnel: {
    title: "From got in touch to booked",
    line: "People only. Calls are Google's count and aren't in it.",
    touch: "Got in touch",
    reply: "Got a reply",
    booked: "Booked",
    columns: ["Step", "People"],
    /** The middle step is the receptionist's first reply, which is counted over the last 30 days. */
    replyWindow: "Replies are counted for the last 30 days only.",
    replyOf: "Your receptionist's first reply, to the people who wrote. A form leaves a number to call back instead.",
  },

  /** What came of the appointments: the page's own rows, when they are of the same people. */
  cameBack: {
    /** `many` is the workspace's appointment word, plural. */
    title: (many: string) => `What came of the ${many}`,
    forAll: "Counted for all your ads together, so it isn't split by platform or by ad.",
    forThirty: "Counted for the last 30 days, so it isn't shown for other days.",
    columns: ["What came of it", "Count"],
  },

  /** The tables. */
  byPlatform: { title: "By platform", line: "Each platform's own account, in its own currency." },
  byDoor: {
    title: "By what the ad asks",
    line: "A chat, a call and a form are counted in their own ways, so these are not set side by side in bars.",
  },
  byAd: { title: "By ad" },
  heads: {
    platform: "Platform",
    door: "Ask",
    ad: "Ad",
    ads: "Ads",
    spent: "Spent",
    touch: "In touch",
    booked: "Booked",
    each: "Each",
    state: "State",
  },
  /** The ads a row of the platform and door tables stands for. */
  adsCount: (n: number) => plural(n, "ad"),

  /** What the platforms say: one card each, never added together. */
  theirs: {
    title: "What the platforms say",
    line: "Each platform counts in its own way, so these are never added together or set against Chanlytics' count.",
    card: (owner: string) => `${owner}'s own numbers`,
    read: (time: string) => `Read ${time}.`,
    dash: "A dash is a number the platform didn't give.",
    window: "The platforms' own numbers are read for the last 30 days only.",
    ad: "Ad",
    columns: {
      meta: { seen: "Seen by", taps: "Taps", chats: "Chats started", leads: "Forms sent" },
      google: { clicks: "Clicks", calls: "Calls", longCalls: "Over 60 seconds" },
      tiktok: { seen: "Seen by", taps: "Taps", leads: "Forms sent" },
    },
  },

  /** Where there is nothing to draw (days with nothing in them say it in the lens registry's words). */
  empty: {
    noAds: { title: "No ads yet", body: "When you turn an ad on, what it spent and who it brought show here." },
  },

  /** The Overview's one fact: what the ads brought over the same days, and the door to them. */
  fact: {
    brought: (n: number) => `Your ads brought ${n === 1 ? "1 new person" : `${n} new people`}`,
    nobody: "Your ads haven't brought anyone new yet",
    sub: (o: { booked: number | null; spent: string }) =>
      o.booked === null
        ? `${o.spent} spent`
        : `${o.booked} ${o.booked === 1 ? "has" : "have"} booked · ${o.spent} spent`,
    door: "Open Ads",
  },
};
