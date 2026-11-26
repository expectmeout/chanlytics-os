/**
 * AI's one line and who from an ad needs you (the Ads plan's 4.4 and 6.3; decision 0050, calls 11 and 12), as a model:
 * rules in code, no model asked, worked out from the page's read and nothing else, with the two rules the page's own model
 * (model.ts) reads beside them: whose people an ad's tap brings to Chanlytics, and where an account's first read stands.
 * Pure: the read and the clock are handed in.
 */
import { AD_DOORS_COUNTED, addressOf, daysBetween, newAdRoute, waitedSince } from "@chanlytics/contracts";
import type { AdLiveDto, AdsLiveDto, AppointmentWord } from "@chanlytics/contracts";
import { dayOfIso } from "../model/vm-base";
import { dayWord } from "../model/words";
import { ADS_MANAGER, AI_LINE, NEEDS_YOU_LINE } from "./words";

/** Whether Chanlytics counts the people of an ad: the tap ends in a message it receives. */
export const counted = (ad: Pick<AdLiveDto, "opens">): boolean => AD_DOORS_COUNTED.includes(ad.opens);

/** What the model reads beside the page's read: the zone its days are said in, and the moment a wait is said at. */
export interface LiveClock {
  timezone: string;
  nowMs: number;
  /** What this workspace calls a booking (surfaces/workspace-word.ts): an appointment where the page hands none. */
  word?: AppointmentWord;
}

/**
 * AI's one line (the Ads plan's 6.3): what it proposes, as a question its press answers. `first` opens New ad by its
 * address, where AI writes the ad and nothing runs until the owner turns it on; `extend` opens Meta's own page, where an
 * ad made there is kept going.
 */
export type AiLineVM =
  | { kind: "first"; text: string; route: string }
  | { kind: "extend"; text: string; href: string }
  /** An ad on whose chat AI can't answer: the line is its Pause, with the version it was drawn from. */
  | { kind: "way_in"; text: string; ad: { id: string; version: number } };

/** Who an ad brought and needs you now, as one amber line: how many, then who, and the press that opens them. */
export interface NeedsYouLineVM {
  title: string;
  who: string;
  /** The longest wait's conversation, which the Inbox opens in Needs you beside the rest. */
  open: string;
}

/**
 * Where an account's first read stands: `reading` while one just connected has not been read, `failed` where its first
 * read failed, null once it has been read (or where it is not connected). Until then nothing is known of its ads, and
 * the page never says Meta shows none.
 */
export function firstReadOf(account: AdsLiveDto["account"]): "reading" | "failed" | null {
  if (account.status !== "connected" || account.read_at !== null) return null;
  return account.read_failed ? "failed" : "reading";
}

/** AI offers to keep an ad going that ends within this many days and brought at least this many people (0050, call 12). */
const EXTEND_WHEN = { days: 3, people: 10 } as const;

/**
 * The ad AI offers to keep going: on, ending within days, having brought people; the soonest to end, then the most.
 * Only one made in Meta, which Meta's own page keeps going: an ad made here keeps going from its drawer (the plan's 4.5),
 * and until that press is there the line would offer what no press can do.
 */
function endingSoonOf(dto: AdsLiveDto, clock: LiveClock): { ad: AdLiveDto; day: string } | null {
  const soon = dto.ads.flatMap((ad) => {
    if (!ad.made_in_platform || ad.state !== "on" || ad.pending !== null) return [];
    if (!counted(ad) || ad.people < EXTEND_WHEN.people || ad.ends_at === null) return [];
    const end = dayOfIso(ad.ends_at, clock.timezone);
    const left = end === "" ? -1 : daysBetween(dto.today, end);
    return left >= 0 && left <= EXTEND_WHEN.days ? [{ ad, end }] : [];
  });
  const [first] = soon.sort((one, other) => one.end.localeCompare(other.end) || other.ad.people - one.ad.people);
  return first ? { ad: first.ad, day: dayWord(first.end) } : null;
}

/**
 * AI's one line (the Ads plan's 6.3; decision 0050, call 12): rules in code, no model asked, and it only proposes. It
 * speaks only on a connected account that has been read, and never while AI is stopped, when no ad is turned on and no
 * draft is written. First an ad spending while AI can't answer the people it brings (decision 0050, call 11), since
 * that money buys nothing, with its Pause, for the owner; then an ad worth keeping going, since its days run out; then,
 * on an account whose card is ready where no ad was made here yet, the first one. An ad Meta stopped is its own row's amber line, with Meta's
 * reason in its drawer, so AI does not say it again. A full calendar's pause waits for a read of the calendar the page
 * does not make.
 */
export function aiLineOf(dto: AdsLiveDto, clock: LiveClock): AiLineVM | null {
  if (dto.account.status !== "connected" || firstReadOf(dto.account) !== null || dto.stopped_at !== null) return null;
  const closed = dto.can_press ? dto.ads.find((ad) => ad.needs === "way_in" && ad.pending === null) : undefined;
  if (closed)
    return { kind: "way_in", text: AI_LINE.wayIn(closed.name), ad: { id: closed.id, version: closed.version } };
  const ending = endingSoonOf(dto, clock);
  if (ending)
    return {
      kind: "extend",
      text: AI_LINE.extend({ name: ending.ad.name, people: ending.ad.people, day: ending.day }),
      href: ADS_MANAGER,
    };
  if (!dto.account.ready || dto.ads.some((ad) => !ad.made_in_platform)) return null;
  return { kind: "first", text: AI_LINE.first(dto.ads.length > 0), route: newAdRoute() };
}

/** How long a person has waited, in the house's short form ("6d"); null where their wait has no moment kept. */
function waitedOf(since: string | null, nowMs: number): string | null {
  const at = since === null ? Number.NaN : Date.parse(since);
  return Number.isFinite(at) ? waitedSince(at, nowMs) : null;
}

/**
 * Who an ad brought and needs you now (the Ads plan's 4.4): how many, then each the read names (the longest waiting)
 * with how long, and how many more. The press opens the longest wait's conversation: the Inbox opens it in Needs you,
 * where the others are listed beside it, whichever list it last showed.
 */
export function needsYouLineOf(dto: AdsLiveDto, clock: LiveClock): NeedsYouLineVM | null {
  const { count, people } = dto.needs_you;
  const [longest] = people;
  if (count === 0 || !longest) return null;
  const rest = count - people.length;
  return {
    title: NEEDS_YOU_LINE.title(count),
    who: [
      ...people.map((person) => NEEDS_YOU_LINE.person(person.name, waitedOf(person.since, clock.nowMs))),
      ...(rest > 0 ? [NEEDS_YOU_LINE.more(rest)] : []),
    ].join(" · "),
    open: addressOf({ kind: "conversation", id: longest.conversation_id }),
  };
}
