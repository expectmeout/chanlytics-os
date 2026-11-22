/**
 * An approval is of an exact thing (the content loop PRD's principle 3, section 5.3): what the owner pressed Approve on is
 * kept as a snapshot (the version of the piece, the bytes of each shape by checksum, where it goes, when, with which words),
 * with a hash over it. Right before the send the database builds the placement's part again from the post and its shape
 * as they stand, and checks the snapshot against its hash (00680 post_as_approved): anything that matters moved since,
 * and the post is held ("Changed since you approved it. Look again."). The hash is taken where the snapshot is kept, in
 * one language: SHA-256 of the snapshot's own text as the database writes it.
 */
import { isObjectRecord, nonBlankOrNull, recordOrEmpty } from "../../shared/unknown";
import { DAY_KEY, shiftKey, zoneMidnight } from "../../shared/zone/day-keys";
import type { PostKind, PostPlace } from "../posts";
import type { RenditionShape } from "./sets";

/** What a version moved from the one before it. */
export type RevisionChange = "caption" | "trim" | "order" | "sound" | "layout" | "first";

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

const EMPTY_INTENT: PieceIntent = {
  goal: null,
  opportunity_id: null,
  call_to_action: null,
  day: null,
  offer: null,
  service: null,
};

/** Whether an intent leans on nothing that can change: a piece with no day, offer or service dates nothing. */
const intentDates = (intent: PieceIntent | null): boolean =>
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
 * Whether a placement still stands as it was approved, as the database answers it right before the send (00680
 * post_as_approved): it stands, with the path of the exact bytes approved; it was approved before approvals were kept
 * (read as before); or something that matters changed since.
 */
export type AsApproved =
  | { is: "stands"; path: string; intent: PieceIntent | null; facts: OwnersFact[] }
  /** A person in its file has no yes for posts that stands, or the owner is not sure who is in it (00681). */
  | { is: "rights"; name: string | null }
  | { is: "before" }
  | { is: "changed" };

/**
 * What a press's words are about, as AI's card hands it to the approval (the PRD's 6.1): the day, an offer with its last
 * day, a service, or AI's own word that they date nothing (a standing "Open Thursday to Saturday"). Each part optional;
 * the approval keeps it as the piece's intent. Its request schema is content/approval-schemas.ts (the server's).
 */
export interface PostAbout {
  day?: string | null | undefined;
  offer?: { says: string; until?: string | null | undefined } | null | undefined;
  service?: string | null | undefined;
  nothing?: true | null | undefined;
}

/** What a card's payload says its words are about, read back; null where it says nothing it can read. */
export function postAboutOf(value: unknown): PostAbout | null {
  if (!isObjectRecord(value)) return null;
  const offer = isObjectRecord(value.offer) ? value.offer : null;
  const says = nonBlankOrNull(offer?.says);
  const day = nonBlankOrNull(value.day);
  const about: PostAbout = {
    ...(day && DAY_KEY.test(day) ? { day } : {}),
    ...(says ? { offer: { says, until: nonBlankOrNull(offer?.until) } } : {}),
    ...(nonBlankOrNull(value.service) ? { service: nonBlankOrNull(value.service) } : {}),
    ...(value.nothing === true ? { nothing: true as const } : {}),
  };
  return Object.keys(about).length > 0 ? about : null;
}

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
  const says = nonBlankOrNull(offer?.says);
  return {
    goal: nonBlankOrNull(kept.goal),
    opportunity_id: nonBlankOrNull(kept.opportunity_id),
    call_to_action: nonBlankOrNull(kept.call_to_action),
    day: nonBlankOrNull(kept.day),
    offer: says ? { says, until: nonBlankOrNull(offer?.until) } : null,
    service: nonBlankOrNull(kept.service),
  };
}

/** Who stands between a file and a use (00681 file_rights_gap): nobody, nobody sure who is in it, or a person by name. */
export type RightsGap = { is: "ok" } | { is: "unsure" } | { is: "person"; name: string };

/** The gap as the database answers it; anything it cannot read stands in the way as "unsure", never as nobody. */
export function rightsGapOf(value: unknown): RightsGap {
  const kept = recordOrEmpty(value);
  if (kept.is === "ok") return { is: "ok" };
  const name = nonBlankOrNull(kept.name);
  return kept.is === "person" && name ? { is: "person", name } : { is: "unsure" };
}

/** The facts an approval kept the owner saying, as the database keeps them. */
export function ownersFactsOf(value: unknown): OwnersFact[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((fact) => {
    const kept = recordOrEmpty(fact);
    const says = nonBlankOrNull(kept.says);
    const until = nonBlankOrNull(kept.until);
    // A fact stands until a day: one kept with anything else for its last day is no fact to check words against.
    return says && until && DAY_KEY.test(until) ? [{ says, until }] : [];
  });
}
