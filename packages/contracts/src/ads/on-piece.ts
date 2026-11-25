/**
 * An ad made from a piece, as the piece says it (the content loop's pass 6; the content canvas's Loop2, approved by Ruben
 * on 24 Nov 2026; the Ads plan's 6.8, join 8): one more line under Where it goes, in Ads' own words, opening the ad; and
 * what it brought apart from what the post brought, with what a booking cost. A post's numbers and an ad's are never
 * added together. Ads' words: Content's piece reads them, as it opens Ads' address, and Content is never imported here.
 *
 * Pure: the ad as the Ads page reads it (readers/ads-page.ts), and the business's zone.
 */
import type { AdState } from "./ads";
import type { AdPausedBy } from "./live";
import { exactMoney } from "./money";

/** An ad made from a piece: its badge, money and days as the Ads page reads them, and who it brought. */
export interface PieceAdDto {
  id: string;
  state: AdState | "draft";
  shown_on: string[] | null;
  spend_minor: number;
  /** What it may spend in all, and in which money; null where it runs on an amount a day or none was read. */
  total_minor: number | null;
  currency: string | null;
  ends_at: string | null;
  paused_by: AdPausedBy | null;
  /** The version a press on it carries, so one drawn from an old read is refused (decision 0050). */
  version: number;
  /** People who first wrote from it, and those of them who booked since (Ads' own counts). */
  people: number;
  booked: number;
}

/** How the ad's line stands, as Where it goes tones a line. */
export type PieceAdTone = "moving" | "ok" | "gone" | "needs";

/** The ad's line under Where it goes: where it shows, its state in a few words, and whether it opens the ad. */
export interface PieceAdLine {
  title: string;
  said: string;
  tone: PieceAdTone;
  opens: boolean;
  /** A second, quieter sentence, where its post was removed at its place while it runs; null otherwise. */
  note: string | null;
  /** Whether the line offers the one press that pauses the ad. */
  pause: boolean;
}

/**
 * A post removed at its place while its ad runs (the content status review of 24 Nov 2026, B5 and D3). A take-down
 * from here pauses the piece's ads; a removal on the place itself does not, and nothing said so. It is said, with the
 * one press that pauses the ad, and never paused by itself: the removal was not the owner's press here.
 */
export const PIECE_AD_WORDS = {
  /** Under the running ad's line: what happened to its post, by the place's own name, and that the ad goes on. */
  postRemoved: (placeNamed: string) => `Its post was removed on ${placeNamed}. The ad is still running.`,
  pause: "Pause the ad",
} as const;

const adDayOf = (iso: string, tz: string): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(iso));

/** Where it shows, by the platform's own names: Facebook alone for an ad made here today. */
const shownTitleOf = (shown: readonly string[] | null): string =>
  shown?.includes("instagram") && shown.includes("facebook")
    ? "Ad on Facebook and Instagram"
    : shown?.includes("instagram")
      ? "Ad on Instagram"
      : "Ad on Facebook";

const adMoneyOf = (ad: PieceAdDto, minor: number): string => exactMoney(minor, ad.currency ?? "USD");

/**
 * The ad's line under Where it goes. `removedOn`: the place a post of the piece was removed at itself, by its name
 * ("Instagram"), or null: while the ad is on, the line needs its owner, says so, and offers the press that pauses it.
 */
export function pieceAdLineOf(ad: PieceAdDto, tz: string, removedOn: string | null): PieceAdLine {
  const line = adLineSaid(ad, tz);
  if (removedOn === null || ad.state !== "on") return { ...line, note: null, pause: false };
  return { ...line, tone: "needs", note: PIECE_AD_WORDS.postRemoved(removedOn), pause: true };
}

/** The ad's line, in the canvas's four states and Ads' others. */
function adLineSaid(ad: PieceAdDto, tz: string): Omit<PieceAdLine, "note" | "pause"> {
  const title = shownTitleOf(ad.shown_on);
  if (ad.state === "setting-up" || ad.state === "review" || ad.state === "unconfirmed" || ad.state === "draft")
    return { title, said: "Meta is checking it · usually within a day", tone: "moving", opens: false };
  if (ad.state === "on") {
    const of = ad.total_minor === null ? "" : ` of ${adMoneyOf(ad, ad.total_minor)}`;
    const until = ad.ends_at ? ` · until ${adDayOf(ad.ends_at, tz)}` : "";
    return { title, said: `Running as an ad · ${adMoneyOf(ad, ad.spend_minor)}${of}${until}`, tone: "ok", opens: true };
  }
  if (ad.state === "ended" || ad.state === "finished") {
    const ended = ad.ends_at ? ` · ended ${adDayOf(ad.ends_at, tz)}` : "";
    return { title, said: `Ran as an ad · ${adMoneyOf(ad, ad.spend_minor)}${ended}`, tone: "gone", opens: true };
  }
  if (ad.state === "paused")
    return {
      title,
      said: ad.paused_by === "remediation" ? "Paused when you took the post down" : "Paused",
      tone: "gone",
      opens: true,
    };
  if (ad.state === "couldnt-finish")
    return { title, said: "Couldn't finish setting it up", tone: "needs", opens: true };
  return { title, said: "Needs you in Ads", tone: "needs", opens: true };
}

/** What an ad brought, apart from the post: its head with what it spent, and its line with what a booking cost. */
export function pieceAdBroughtOf(ad: PieceAdDto): { head: string; line: string } {
  const people = `${ad.people.toLocaleString("en-US")} ${ad.people === 1 ? "conversation" : "conversations"}`;
  const booked = ad.booked > 0 ? ` · ${ad.booked.toLocaleString("en-US")} booked from the ad` : "";
  const each =
    ad.booked > 0 && ad.spend_minor > 0
      ? ` · about ${adMoneyOf(ad, Math.round(ad.spend_minor / ad.booked))} a booking`
      : "";
  return { head: `From the ad · ${adMoneyOf(ad, ad.spend_minor)}`, line: `${people}${booked}${each}` };
}
