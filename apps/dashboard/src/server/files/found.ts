import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HOUR_MS,
  filmShotsOf,
  valueAt,
  type ContentSourceDto,
  type ContentSourceSeen,
  type ContentSourcesDto,
  type TenantId,
} from "@chanlytics/contracts";
import { listFoundFileKinds } from "@chanlytics/db/files";
import { findLinkedPlace, listBusinessReads, listImports, type ImportLedgerRow } from "@chanlytics/db/imports";
import type { Database } from "@chanlytics/db/types";
import { getStoredConfig } from "../workspace/config-row";

type Db = SupabaseClient<Database>;

/** What a website's read saw on its pages (business_reads.facts.media, 00626's read), or null for a read before it. */
function seenOf(facts: unknown): ContentSourceSeen | null {
  const n = (k: string): number => {
    const v = valueAt(facts, "media", k);
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };
  return valueAt(facts, "media") ? { photos: n("photos"), videos: n("videos"), embedded: n("embedded") } : null;
}

/** How long a run is believed: one that stopped saying anything for longer than this died, and the page stops saying "Looking". */
const RUN_BELIEVED_MS = HOUR_MS / 2;

/**
 * Whether a road's run is going now, as the ledger says and not older than it can be, and until when it is believed: the page
 * reads itself again then, where the run ends with nothing told.
 */
function runBelievedOf(
  row: ImportLedgerRow | undefined,
  now: number,
): Pick<ContentSourceDto, "reading" | "reading_until"> {
  const until = row && ON_ITS_WAY.has(row.state) ? Date.parse(row.started_at ?? "") + RUN_BELIEVED_MS : Number.NaN;
  return until > now
    ? { reading: true, reading_until: new Date(until).toISOString() }
    : { reading: false, reading_until: null };
}

/** An import's states while it is on its way: queued, or running. */
const ON_ITS_WAY: ReadonlySet<string> = new Set(["queued", "running"]);

/** What a road's last read left behind, as its ledger's line counted it (00643); zeros for a road with no line. */
function leftBy(
  row: ImportLedgerRow | undefined,
): Pick<ContentSourceDto, "left_videos" | "long_videos" | "left_files"> {
  return {
    left_videos: row?.counts.left_videos ?? 0,
    long_videos: row?.counts.long_videos ?? 0,
    left_files: row?.counts.left_files ?? 0,
  };
}

/** What came in from one road, still here: photos and videos. */
function cameFrom(found: readonly { source: string; kind: string }[], roads: readonly string[]) {
  const mine = found.filter((f) => roads.includes(f.source));
  return {
    photos: mine.filter((f) => f.kind !== "video").length,
    videos: mine.filter((f) => f.kind === "video").length,
  };
}

/**
 * Where Ask looks for a business's photos and videos, and what came of each (contracts content/sources.ts), as the member's
 * session reads it: the website (its address in the settings or its last read, the read's own words, what its pages showed,
 * and the ledger's run of its photos and videos), the linked Google listing (and a connected profile's photos with it), and
 * the Instagram a pasted link named (the ledger's run, its handle). Read with Content's page while nothing is kept.
 */
export async function readContentSources(db: Db, tenantId: TenantId, now: number): Promise<ContentSourcesDto> {
  const [reads, place, imports, found, config] = await Promise.all([
    listBusinessReads(db, tenantId),
    findLinkedPlace(db, tenantId),
    listImports(db, tenantId),
    listFoundFileKinds(db, tenantId),
    getStoredConfig(db, tenantId),
  ]);
  const site = reads.find((r) => r.source === "website");
  const named = valueAt(config, "brain", "profile", "website");
  const siteRun = imports.find((r) => r.source === "website_media");
  const instagramRun = imports.find((r) => r.source === "instagram");
  const photosRun = imports.find((r) => r.source === "google_photos");
  // A read that looked for photos says what its pages showed; one before 00626, or a lead's preview, looked for none, so it is
  // no read of the photos at all. A read the model found nothing in is still a read: only a site that could not be read is
  // unread, as the ledger's run says.
  const seen = seenOf(site?.facts);
  const website: ContentSourceDto = {
    place: "website",
    address: (typeof named === "string" && named.trim()) || site?.read_from || null,
    ...runBelievedOf(siteRun, now),
    read_at: siteRun?.finished_at ?? (seen ? (site?.read_at ?? null) : null),
    ...cameFrom(found, ["website"]),
    seen,
    unread: siteRun?.state === "failed" ? siteRun.last_error : null,
    ...leftBy(siteRun),
  };
  const listing: ContentSourceDto = {
    place: "google_listing",
    address: place || photosRun ? "listing" : null,
    ...runBelievedOf(photosRun, now),
    read_at: photosRun?.finished_at ?? (place ? (site?.read_at ?? null) : null),
    ...cameFrom(found, ["google_listing", "google_profile"]),
    seen: null,
    unread: photosRun?.state === "failed" ? photosRun.last_error : null,
    ...leftBy(undefined),
  };
  const instagram: ContentSourceDto = {
    place: "instagram",
    address: instagramRun?.via ?? null,
    ...runBelievedOf(instagramRun, now),
    read_at: instagramRun?.finished_at ?? null,
    ...cameFrom(found, ["instagram"]),
    seen: null,
    unread: instagramRun?.state === "failed" ? instagramRun.last_error : null,
    ...leftBy(instagramRun),
  };
  return { places: [website, listing, instagram], film: filmShotsOf(site?.facts) };
}
