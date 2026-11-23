/**
 * What a week's plan reads of a workspace (00706; the content loop PRD's 10.1, 10.2), under the service role: the
 * footage it could be made from, what went out in the last three weeks and why, the new reviews of four or five stars,
 * and the plans asked for. Each a narrow read with its bound; the reasons are worked out from them in core
 * (opportunities, content/plan), never here.
 */
import {
  DbFailure,
  isObjectRecord,
  listOrEmpty,
  nonBlankOrNull,
  pieceIntentOf,
  recordOrEmpty,
  type TenantId,
} from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** Where footage the business added came from: never a made file, and never one found on the web (PRD 6.1, rights). */
const OWN_SOURCES = ["upload", "drive", "instagram", "google_profile"] as const;

/** A photo or a clip the week could be made from, as the plan reads it. */
export interface FootageRow {
  id: string;
  kind: "image" | "video";
  name: string;
  at: string;
  /** The look's own words of what it shows: its line, what a post could use it for, its moments' words. */
  shows: string[];
  issues: string[];
  moments: { at: number; what: string }[];
  stock: boolean;
}

const footageOf = (row: {
  id: string;
  kind: string;
  name: string;
  created_at: string;
  look: unknown;
}): FootageRow | null => {
  if (row.kind !== "image" && row.kind !== "video") return null;
  const look = recordOrEmpty(row.look);
  const moments = listOrEmpty(look.moments).flatMap((m) =>
    isObjectRecord(m) && typeof m.at === "number" && typeof m.what === "string" ? [{ at: m.at, what: m.what }] : [],
  );
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    at: row.created_at,
    shows: [nonBlankOrNull(look.use), ...moments.map((m) => m.what), nonBlankOrNull(look.line)].filter(
      (s): s is string => !!s,
    ),
    issues: listOrEmpty(look.issues).filter((s): s is string => typeof s === "string"),
    moments,
    stock: look.looks_like_stock === true,
  };
};

/** The most footage a week reads: the newest of what the business added and kept. */
const FOOTAGE_MOST = 40;

/**
 * The footage the business added and kept, its look read, newest first: no made file, nothing found on the web, nothing
 * waiting for the owner's word or set aside, nothing away from the shelf, no stock.
 */
export async function listWeekFootage(db: Db, tenantId: TenantId, sinceIso: string): Promise<FootageRow[]> {
  const { data, error } = await db
    .from("files")
    .select("id, kind, name, created_at, look")
    .eq("tenant_id", tenantId)
    .eq("status", "filed")
    .is("removed_at", null)
    .eq("copy_state", "here")
    .eq("look_status", "done")
    .in("source", [...OWN_SOURCES])
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(FOOTAGE_MOST);
  if (error) throw new DbFailure(error, "week footage");
  return data.flatMap((row) => {
    const footage = footageOf(row);
    return footage && !footage.stock ? [footage] : [];
  });
}

/** What went out lately: the files posted, and the reasons the pieces were made for. */
export interface RecentlyPosted {
  files: Set<string>;
  reasons: Set<string>;
}

/** The posts set or up since a moment, under the service role: their files, and their pieces' reasons. */
export async function readRecentlyPosted(db: Db, tenantId: TenantId, sinceIso: string): Promise<RecentlyPosted> {
  const { data, error } = await db
    .from("posts")
    .select("file_id, piece_id, status")
    .eq("tenant_id", tenantId)
    .gte("created_at", sinceIso)
    .not("status", "in", "(pulled,failed)")
    // Three weeks of a business's posts: a few dozen at the cadence's most.
    .limit(200);
  if (error) throw new DbFailure(error, "posts lately");
  const rows = data;
  const pieceIds = [...new Set(rows.map((r) => r.piece_id).filter((id): id is string => !!id))];
  const reasons = new Set<string>();
  if (pieceIds.length > 0) {
    const { data: pieces, error: piecesError } = await db
      .from("pieces")
      .select("id, intent, file_id")
      .eq("tenant_id", tenantId)
      .in("id", pieceIds)
      .limit(pieceIds.length);
    if (piecesError) throw new DbFailure(piecesError, "pieces lately");
    for (const piece of pieces) {
      const reason = pieceIntentOf(piece.intent)?.opportunity_id;
      if (reason) reasons.add(reason);
    }
  }
  return { files: new Set(rows.map((r) => r.file_id)), reasons };
}

/** A new review as the plan reads it: the reviewer's first name and initial only, never their full name (PRD 10.5). */
export interface ReviewRow {
  id: string;
  rating: number;
  by: string | null;
  words: string;
  at: string;
}

/** "Ana Rodríguez" said as "Ana R.": a first name and an initial, never more. */
const firstNameAndInitial = (author: string | null): string | null => {
  const parts = (author ?? "").trim().split(/\s+/).filter(Boolean);
  const [first, ...rest] = parts;
  if (!first) return null;
  const last = rest.at(-1);
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
};

/** The reviews of four or five stars published since a moment, newest first, under the service role. */
export async function listNewReviews(db: Db, tenantId: TenantId, sinceIso: string): Promise<ReviewRow[]> {
  const { data, error } = await db
    .from("google_reviews")
    .select("review_id, rating, author, body, published_at")
    .eq("tenant_id", tenantId)
    .gte("rating", 4)
    .gte("published_at", sinceIso)
    .order("published_at", { ascending: false })
    // A fortnight's good reviews: a handful for a small business.
    .limit(20);
  if (error) throw new DbFailure(error, "new reviews");
  return data.flatMap((row) =>
    row.rating !== null && row.body && row.published_at
      ? [
          {
            id: row.review_id,
            rating: row.rating,
            by: firstNameAndInitial(row.author),
            words: row.body,
            at: row.published_at,
          },
        ]
      : [],
  );
}
