/**
 * A take-down its place has not answered about (00682; the content loop PRD's 8.3): after how long it is Chanlytics's
 * to chase, and the one sentence that says so, on the piece's line and on Today. A leaf, apart from the take-down's
 * other words (take-down.ts): Today reads it on every page's first load, and carries nothing else of a take-down.
 */
import { DAY_MS } from "../../shared/time";
import { POST_PLACE_SAID, type PostPlace } from "../posts";

/** After this long with no answer from a place, a take-down is Chanlytics's to chase, and the piece says so. */
export const TAKE_DOWN_UNCONFIRMED_MS = DAY_MS;

/** "Instagram hasn't confirmed it's gone · Chanlytics is on it": nothing is asked of the owner. */
export const takeDownUnconfirmedSaid = (place: PostPlace): string =>
  `${POST_PLACE_SAID[place]} hasn't confirmed it's gone · Chanlytics is on it`;
