/**
 * The days the home says (the content canvas): the day a piece went up under its tile ("On Instagram · Monday"), when a post
 * went up on Posted's line ("Google · today, 9:12 AM"), and the day Scheduled's posts wait for ("Tomorrow · Thu, Nov 12"),
 * each by the business's own clock. A day is said as the open piece says it (viewer-line.ts viewerDayOf), so a tile, its
 * line and its viewer never tell one day two ways. Pure: the zone and now are handed in.
 */
import { CONTENT_WORDS, clockNear, clockTime, localDaysBetween } from "@chanlytics/contracts";
import { viewerDayOf } from "./viewer-line";

/** The day a piece went up, under its tile: "today", "yesterday", "Monday", "Oct 30". */
export const tileDayOf = (at: string, zone: string, now: number): string => viewerDayOf(Date.parse(at), zone, now);

/** When a post went up, on Posted's line: today with its time ("today, 9:12 AM"), any other day as its tile says it. */
export function postedWhenOf(atMs: number, zone: string, now: number): string {
  if (localDaysBetween(now, atMs, zone) !== 0) return viewerDayOf(atMs, zone, now);
  return CONTENT_WORDS.viewer.at(clockNear(atMs, zone, now), clockTime(atMs, zone));
}

/** The day over Scheduled's posts: "Today · Wed, Nov 11", "Tomorrow · Thu, Nov 12", then its date alone ("Sat, Nov 14"). */
export function aheadDayOf(atMs: number, zone: string, now: number): string {
  const gap = localDaysBetween(now, atMs, zone);
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(atMs));
  return CONTENT_WORDS.views.dayHead(gap === 0 || gap === 1 ? clockNear(atMs, zone, now) : null, date);
}
