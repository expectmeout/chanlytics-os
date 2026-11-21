/**
 * The tag every part Chanlytics makes at Meta carries in its name (decision 0050, call 6): `[cl:<8 letters>]`, so a
 * part whose make was never answered is found again by its name, and a read knows a part a launch made from one the
 * owner made. A launch tags each part with the first eight letters of its ad's own id; the paused-ad check tagged its
 * parts with eight of its own, after the words "paused check".
 *
 * The tag is Chanlytics' own and is never shown: no screen, tab, notice or report says it (the plan's step 4, 20
 * November 2026). The read keeps an ad's name as an owner reads it (shownNameOf), so every page, the bell and AI read a
 * name with no tag in it.
 */

/** A tag in a name, as the launch and the paused-ad check wrote it. */
const TAG = /\s*\[cl:([0-9a-z]{1,16})\]\s*/i;

/** What a launch writes before every name it gives a part, and what the paused-ad check wrote after the service. */
const MADE_BY = /^Chanlytics\s*·\s*/;
const CHECK_WORDS = /\s*·\s*paused check\s*$/i;
const VERSION_WORDS = /\s*·\s*\d of \d\s*$/;

/** The tag a launch gives every part of one ad: the first eight letters of the ad's own id. */
export const launchTagOf = (adId: string): string => adId.replace(/-/g, "").slice(0, 8).toLowerCase();

/** The tag a name carries, or null where it carries none. */
export function tagIn(name: string): string | null {
  const found = TAG.exec(name);
  return found?.[1] ? found[1].toLowerCase() : null;
}

/**
 * A part's name at Meta, as a launch gives it: who made it, the ad's own name, which version of the words it is where
 * it is an ad, and the tag. At most 400 characters, which is what Meta takes; the ad's own name is cut first.
 */
export function launchNameOf(ad: { id: string; name: string }, version?: { at: number; of: number }): string {
  const tail = `${version ? ` · ${version.at} of ${version.of}` : ""} [cl:${launchTagOf(ad.id)}]`;
  const head = "Chanlytics · ";
  return `${head}${ad.name.trim().slice(0, 400 - head.length - tail.length)}${tail}`;
}

/**
 * An ad's name as an owner reads it: its tag gone, and with it what only Chanlytics needs to find it (who made it, the
 * paused-ad check's words, which version it is). A name with no tag is the owner's own, and is kept as Meta holds it.
 */
export function shownNameOf(name: string): string {
  if (!TAG.test(name)) return name;
  const bare = name.replace(TAG, " ").trim().replace(MADE_BY, "").replace(CHECK_WORDS, "").replace(VERSION_WORDS, "");
  return bare.trim() || "An ad";
}
