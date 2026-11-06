/**
 * A connected Business Profile's own photos brought into Files (decision 0099), a page at a time on the imports ledger:
 * the owner's account, the owner's pictures, so they land filed. What Google calls each one is where it starts on the
 * shelves, until the look reads it. A photo already kept is not kept twice (00551 file_found), so a run can stop, or be
 * tried again, anywhere. A profile is better word than a public listing: a photo on both takes over from it, and what the
 * listing alone offered and nobody kept goes aside when the profile has come in.
 */
import { IMPORT_STOPPED_WORDS, recordOrNull, type FileShows } from "@chanlytics/contracts";
import { listMedia, reviewParent, type GbpPhoto } from "@chanlytics/channels";
import { fileListingAside, importCursorOf, noteImport } from "@chanlytics/db";
import { keepFoundFile, type FoundFile } from "../files/found.js";
import { connectionOf, type Db } from "../google/google-rows.js";
import { tokenFor } from "../google/profile-credentials.js";
import { http } from "../google/places.js";
import type { Part, PartOutcome } from "./history-import.js";

/** The most a profile brings. Google documents no order, so this is a bound on the work and no judgement of the photos. */
const PHOTOS_MAX = 200;
/** How many are read at once. */
const PHOTOS_AT_ONCE = 4;

/** What Google files a photo under, as a shelf. The two that say nothing of what it shows (COVER, ADDITIONAL) start on none. */
const SHOWS_OF: Readonly<Record<string, FileShows>> = {
  EXTERIOR: "storefront",
  INTERIOR: "interior",
  COMMON_AREA: "interior",
  ROOMS: "interior",
  AT_WORK: "work",
  TEAMS: "team",
  PRODUCT: "product",
  FOOD_AND_DRINK: "product",
  MENU: "menu",
  LOGO: "logo",
  PROFILE: "logo",
};

const foundOf = (p: GbpPhoto): FoundFile => ({
  url: p.url,
  ref: p.name,
  shows: (p.category && SHOWS_OF[p.category]) || null,
  name: p.category ? p.category.replaceAll("_", " ").toLowerCase() : "google photo",
});

interface Place {
  page: string | null;
  read: number;
}

function photosPlaceOf(cursor: unknown): Place {
  const o = recordOrNull(cursor);
  return {
    page: typeof o?.page === "string" ? o.page : null,
    read: typeof o?.read === "number" ? o.read : 0,
  };
}

async function stopped(db: Db, part: Part, error: string, photos = 0): Promise<PartOutcome> {
  await noteImport(db, {
    tenantId: part.tenantId,
    source: "google_photos",
    state: "failed",
    error,
    add: true,
    ...(photos ? { counts: { photos } } : {}),
  });
  return { more: false };
}

export async function googlePhotosPart(db: Db, part: Part): Promise<PartOutcome> {
  const conn = await connectionOf(db, part.tenantId);
  if (!conn?.account_name || !conn.location_name) return stopped(db, part, IMPORT_STOPPED_WORDS.googleGone);
  const t = await tokenFor(db, part.tenantId, Date.now());
  if (!t.ok) return stopped(db, part, IMPORT_STOPPED_WORDS.googleSignedOut);
  await noteImport(db, {
    tenantId: part.tenantId,
    source: "google_photos",
    state: "running",
    via: "google",
    add: true,
  });

  const parent = reviewParent(conn.account_name, conn.location_name);
  let place = photosPlaceOf(await importCursorOf(db, part.tenantId, "google_photos"));
  // What the profile has in Files, counted a whole page at a time: a page read again is not counted twice, and a reconnect
  // that finds them all here already says how many there are, not none.
  let brought = 0;
  let done = false;
  while (Date.now() < part.until) {
    const got = await listMedia(http, t.token, parent, place.page);
    // A page is brought whole before the cursor moves past it: run again, a photo already kept is passed over. A bad address
    // is only passed over (keepFoundFile); Storage or the database failing throws, so the ledger tries the part again and a
    // run that cannot finish ends stopped, with Try again, rather than done with photos missing.
    let at = 0;
    let onPage = 0;
    let full = false;
    for (; at < got.photos.length && Date.now() < part.until && !full; at += PHOTOS_AT_ONCE) {
      const fates = await Promise.all(
        got.photos
          .slice(at, at + PHOTOS_AT_ONCE)
          .map((p) =>
            keepFoundFile(db, part.tenantId, { source: "google_profile", status: "filed", file: foundOf(p) }),
          ),
      );
      onPage += fates.filter((f) => f === "kept" || f === "here").length;
      full = fates.includes("full");
    }
    // No room: what came is kept, and it stops in words, not on a count that says more came than did.
    if (full) return stopped(db, part, IMPORT_STOPPED_WORDS.filesFull, brought + onPage);
    if (at < got.photos.length) break;
    brought += onPage;
    place = { page: got.next_page_token, read: place.read + got.photos.length };
    if (!place.page || place.read >= PHOTOS_MAX) {
      done = true;
      break;
    }
  }
  if (done && place.read > 0) await fileListingAside(db, part.tenantId);
  await noteImport(db, {
    tenantId: part.tenantId,
    source: "google_photos",
    state: done ? "done" : "running",
    counts: { photos: brought },
    add: true,
    partsDone: part.n,
    via: "google",
    cursor: { page: place.page, read: place.read },
  });
  return { more: !done };
}
