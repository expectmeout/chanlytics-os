/**
 * The sentences the Ads page says before an account is held (page-only): its head and the page with nothing connected,
 * v0. Consts where a sentence is one, small functions where it takes a value; the values are already said (days by
 * words.ts). Words only, no data: page-v0.ts makes the values these take, and the page draws what it hands over.
 */
import { peopleWord } from "./words";

export const HEAD = {
  v0Strong: "Ads",
  v0Rest: " bring new people to AI.",
  /** Nothing connected: the counts' window, with its first day once they are read. No time, for a page that may not have read them. */
  v0Read: (since: string | null) => (since === null ? "Last 30 days" : `Last 30 days · counted from ${since}`),
  newAd: "New ad",
  ask: "Ask",
  /** Over the connected page's sentence, now that Ads is a view of Content's Made: what is paid for, and the days it covers. */
  paid: (days: number) => `Paid · from your Meta account · last ${days} days`,
};

export const V0 = {
  lead: (ad: number, of: number) => ({
    strong: `${ad} of the ${of}`,
    rest: " new people with a recorded way in first wrote from an ad.",
  }),
  more: (n: number) => `${n} more have no way in recorded.`,
  /** Which ads they came through, under the lead: `5 people from Spring colour offer and 2 people from an ad you run in Meta.` */
  byAd: (list: string) => `${list}.`,
  fromAd: (n: number, ad: string) => `${peopleWord(n)} from ${ad}`,
  /** An ad Chanlytics cannot name yet: by whose account it runs in, where that is known. */
  unnamedAd: (owner: string | null) => (owner ? `an ad you run in ${owner}` : "an ad you run"),
  /** The ads after the first few, together. */
  otherAds: (n: number, ads: number) => `${peopleWord(n)} from ${ads} other ${ads === 1 ? "ad" : "ads"}`,
  emptyLead: "No one has written from an ad yet.",
  emptyLine: "When Meta names the ad in someone's first message, AI answers and they are counted here.",
  /** Read, and nobody at all: People's own answer for these days. */
  nobodyNew: "Nobody new has reached you in the last 30 days.",
  reading: "Counting how new people first reached you…",
  notRead: "How new people first reached you couldn't be read.",
  again: "Try again",
  notes: [
    "Ads that open WhatsApp or Instagram are counted under An ad, not under either.",
    "Someone counts here when Meta names the ad in their first message. Call ads and ads elsewhere don't count yet.",
  ],
  /** Under the empty lead, which has already said when someone is counted. */
  emptyNotes: ["Ads that ring your phone and ads elsewhere aren't counted yet."],
  door: "See them in Reports › People",
  /** With nobody to see. */
  doorNobody: "See Reports › People",
};
