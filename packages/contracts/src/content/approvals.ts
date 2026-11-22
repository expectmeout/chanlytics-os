/**
 * An approval is of an exact thing (the content loop PRD's principle 3, section 5.3): what the owner pressed Approve on is
 * kept as a snapshot (the version of the piece, the bytes of each shape by checksum, where it goes, when, with which words),
 * with a hash over it. Right before the send the database builds the placement's part again from the post and its shape
 * as they stand, and checks the snapshot against its hash (00690 post_as_approved): anything that matters moved since,
 * and the post is held ("Changed since you approved it. Look again."). The hash is taken where the snapshot is kept, in
 * one language: SHA-256 of the snapshot's own text as the database writes it.
 */
import { z } from "zod";
import { isObjectRecord, recordOrEmpty } from "../shared/unknown";
import { DAY_KEY, shiftKey, zoneMidnight } from "../shared/zone/day-keys";
import type { PostKind, PostPlace } from "./posts";

/** The shapes a piece is drawn in for its places (PRD 5.3): a story or a reel, a portrait post, a square, a wide, Google's. */
export const RENDITION_SHAPES = ["9x16", "4x5", "1x1", "16x9", "google"] as const;
export type RenditionShape = (typeof RENDITION_SHAPES)[number];

/** What an approval can be of: a version of a piece and its placements, a week's plan (pass 3), an ad's Turn on. */
export const APPROVAL_SUBJECTS = ["piece_revision", "plan", "ad"] as const;

/** Why an approval stopped standing: the thing changed, a yes was taken back, a claim, the place, or the owner withdrew it. */
export const APPROVAL_VOID_WHYS = ["changed", "rights", "claim", "place", "owner"] as const;
export type ApprovalVoidWhy = (typeof APPROVAL_VOID_WHYS)[number];

/** Who made a version of a piece. */
export const REVISION_MADE_BY = ["ai", "owner", "operator"] as const;
export type RevisionMadeBy = (typeof REVISION_MADE_BY)[number];

/** What a version moved from the one before it. */
export const REVISION_CHANGES = ["caption", "trim", "order", "sound", "layout", "first"] as const;
export type RevisionChange = (typeof REVISION_CHANGES)[number];

/**
 * Why a piece exists, written by whoever drafts it, where its words lean on something that can change (PRD 6.1): the day
 * they are about, an offer they carry (as the owner's note says it, with its last day), a service they name. `goal` and
 * `opportunity_id` are the plan's (pass 3) and stay null until it exists.
 */
export interface PieceIntent {
  goal: string | null;
  opportunity_id: string | null;
  call_to_action: string | null;
  day: string | null;
  offer: { says: string; until: string | null } | null;
  service: string | null;
}

export const EMPTY_INTENT: PieceIntent = {
  goal: null,
  opportunity_id: null,
  call_to_action: null,
  day: null,
  offer: null,
  service: null,
};

/** Whether an intent leans on nothing that can change: a piece with no day, offer or service dates nothing. */
export const intentDates = (intent: PieceIntent | null): boolean =>
  !!intent && (intent.day !== null || intent.offer !== null || intent.service !== null);

/**
 * The last moment a placement is still worth sending (posts.good_until, PRD 5.2): the end of the day its words are about,
 * or of its offer's last day, whichever comes first, in the business's own zone. Null where nothing dates it.
 */
export function goodUntilOf(intent: PieceIntent | null, zone: string): string | null {
  const days = [intent?.day ?? null, intent?.offer?.until ?? null].filter(
    (d): d is string => d !== null && DAY_KEY.test(d),
  );
  if (days.length === 0) return null;
  const first = days.sort()[0] ?? "";
  return new Date(zoneMidnight(zone, shiftKey(first, 1)) - 1).toISOString();
}

/** One shape of the piece as it is sent: its made file, where its bytes are kept, and their checksum. */
export interface SnapshotRendition {
  shape: RenditionShape;
  file_id: string;
  path: string;
  checksum: string;
}

/** One placement as approved: where, as what, when, and with which words. */
export interface SnapshotPlacement {
  place: PostPlace;
  kind: PostKind;
  at: string;
  caption: string | null;
}

/** A fact the owner said themselves ("Thursday still has openings"), kept as theirs until its day ends (PRD 6.1). */
export interface OwnersFact {
  says: string;
  until: string;
}

/** What one approval of a piece is of (PRD 5.3). Its hash is snapshot_hash. */
export interface PieceApprovalSnapshot {
  revision: { piece_id: string; n: number };
  renditions: SnapshotRendition[];
  placements: SnapshotPlacement[];
  uses: "post"[];
  spend: null;
  facts: OwnersFact[];
}

/** The shape a placement sends: a story or a reel stands up, a post is a portrait, Google takes its own. */
export function renditionShapeOf(place: PostPlace, kind: PostKind): RenditionShape {
  if (place === "google") return "google";
  return kind === "picture" ? "4x5" : "9x16";
}

/**
 * Whether a placement still stands as it was approved, as the database answers it right before the send (00690
 * post_as_approved): it stands, with the path of the exact bytes approved; it was approved before approvals were kept
 * (read as before); or something that matters changed since.
 */
export type AsApproved =
  | { is: "stands"; path: string; intent: PieceIntent | null; facts: OwnersFact[] }
  /** A person in its file has no yes for posts that stands, or the owner is not sure who is in it (00691). */
  | { is: "rights"; name: string | null }
  | { is: "before" }
  | { is: "changed" };

const textOrNull = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

const DAY = z.string().regex(DAY_KEY);

/**
 * What a press's words are about, as AI's card hands it to the approval (the PRD's 6.1): the day, an offer with its last
 * day, a service. Each part optional; the approval keeps it as the piece's intent.
 */
export const PostAboutSchema = z.object({
  day: DAY.nullish(),
  offer: z.object({ says: z.string().trim().min(1).max(120), until: DAY.nullish() }).nullish(),
  service: z.string().trim().min(1).max(120).nullish(),
  /** AI's own word that the words date nothing (a standing "Open Thursday to Saturday"). */
  nothing: z.literal(true).nullish(),
});
export type PostAbout = z.infer<typeof PostAboutSchema>;

/** A fact the owner stated on the card, kept on the approval until its day ends. */
export const OwnersFactSchema = z.object({ says: z.string().trim().min(1).max(200), until: DAY });

/** The intent an approval keeps for what a press said its words are about; null where they are about nothing. */
export function intentOfAbout(about: PostAbout | undefined): PieceIntent | null {
  if (!about) return null;
  const intent: PieceIntent = {
    ...EMPTY_INTENT,
    day: about.day ?? null,
    offer: about.offer ? { says: about.offer.says, until: about.offer.until ?? null } : null,
    service: about.service ?? null,
  };
  return intentDates(intent) ? intent : null;
}

/** A piece's intent as the database keeps it (pieces.intent); null where it keeps none it can read. */
export function pieceIntentOf(value: unknown): PieceIntent | null {
  if (!isObjectRecord(value)) return null;
  const kept = value;
  const offer = isObjectRecord(kept.offer) ? kept.offer : null;
  const says = textOrNull(offer?.says);
  return {
    goal: textOrNull(kept.goal),
    opportunity_id: textOrNull(kept.opportunity_id),
    call_to_action: textOrNull(kept.call_to_action),
    day: textOrNull(kept.day),
    offer: says ? { says, until: textOrNull(offer?.until) } : null,
    service: textOrNull(kept.service),
  };
}

/** Who stands between a file and a use (00691 file_rights_gap): nobody, nobody sure who is in it, or a person by name. */
export type RightsGap = { is: "ok" } | { is: "unsure" } | { is: "person"; name: string };

/** The gap as the database answers it; anything it cannot read stands in the way as "unsure", never as nobody. */
export function rightsGapOf(value: unknown): RightsGap {
  const kept = recordOrEmpty(value);
  if (kept.is === "ok") return { is: "ok" };
  const name = textOrNull(kept.name);
  return kept.is === "person" && name ? { is: "person", name } : { is: "unsure" };
}

/** The facts an approval kept the owner saying, as the database keeps them. */
export function ownersFactsOf(value: unknown): OwnersFact[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((fact) => {
    const kept = recordOrEmpty(fact);
    const says = textOrNull(kept.says);
    const until = textOrNull(kept.until);
    return says && until ? [{ says, until }] : [];
  });
}
