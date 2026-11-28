/**
 * The recheck right before a place is asked anything (the content loop PRD's 6.2, third moment; 00611's recheck): one
 * reading for every place. Whoever approved it may still post for the business; the post was not deleted; everything is
 * not stopped; it still stands as approved (00681 post_as_approved: its words, its bytes, its version); and its reason
 * still stands (PRD 6.1). No yes is read, for a person or for a file. Anything moved holds the post in words and sends
 * nothing. A post whose last moment passed is let go (`pulled`, held_why `late`) and is never
 * sent late, by any road. The business's notes and services are read only where the piece's intent leans on one.
 *
 * A post that promises open time is never sent on a guess (00728): where the book cannot be read at the send, the
 * recheck says so (`unread`), and whoever sends asks again a minute on, a few times, then holds it with why
 * (askAgainOrHold). Every other post is asked nothing of the book, as before, and at making ready nothing hangs on it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MIN_MS,
  ON_INSTAGRAM,
  dayInZone,
  notesInForce,
  offersOf,
  parseTenantConfig,
  statedFactsOf,
  type AsApproved,
  type OwnerClaim,
  type PieceIntent,
  type TenantId,
  type PostHeldWhy,
  type PostStatus,
} from "@chanlytics/contracts";
import { evaluate, opportunitiesFrom, type PolicyFacts } from "@chanlytics/core";
import {
  findFileForWork,
  listClaims,
  mayStillPost,
  movePost,
  readPostAsApproved,
  type PostRow,
} from "@chanlytics/db/files";
import { findWorkspaceZone, getTenantConfig, isSendingStopped } from "@chanlytics/db/workspace";
import type { Database } from "@chanlytics/db/types";
import type { ClaimedJob } from "@chanlytics/jobs";
import { errField, logger } from "../shared/log.js";
import { readOpportunityFacts } from "../opportunities/book.js";
import { tellPostMoved } from "../files/post-told.js";

type Db = SupabaseClient<Database>;

/** Why a post may not go now, in the owner's words. */
export interface SendHold {
  held: string;
  why: PostHeldWhy;
}

/**
 * The open time a post promises could not be read at its send: nothing is sent on a guess. `unread` is the hold it
 * becomes once it has been asked again often enough.
 */
export interface SendUnread {
  unread: SendHold;
}

/** What a post sends: the approved bytes' path (null for one approved before approvals were kept), and how it was made. */
interface SendBytes {
  path: string | null;
  made: unknown;
}

const holdFor = (held: string, cause: PostHeldWhy): SendHold => ({ held, why: cause });

/** The reason's facts as they stand this moment; none for a post that dates nothing and leans on nothing. */
async function readReasonFacts(db: Db, post: PostRow, approved: AsApproved): Promise<PolicyFacts["reason"]> {
  const intent = approved.is === "stands" ? approved.intent : null;
  if (!post.good_until && !intent) return undefined;
  const zone = (await findWorkspaceZone(db, post.tenant_id)) ?? "UTC";
  const nowMs = Date.now();
  const today = dayInZone(zone, nowMs).key;
  const leans = !!intent?.offer || !!intent?.service || !!intent?.opportunity_id;
  const [config, claims] = leans
    ? await Promise.all([
        getTenantConfig(db, post.tenant_id).then((row) => row?.config ?? null),
        listClaims(db, post.tenant_id),
      ])
    : [null, []];
  const profile = parseTenantConfig(config)?.brain?.profile;
  const services = profile?.services ?? [];
  return {
    intent,
    goodUntil: post.good_until,
    atMs: nowMs,
    nowMs,
    zone,
    says: [
      ...notesInForce(profile?.notes, zone, new Date()).map((note) => `${note.title} ${note.text}`),
      ...services.map((service) => `${service.name} ${service.price_note ?? ""}`),
      // An offer the owner keeps (owner_claims, 00706) is one the business says.
      ...offersOf(claims, today).map((offer) => offer.says),
    ],
    services: services.map((service) => service.name),
    // A fact the owner stated: kept on an approval before pass 3, kept as their claim since.
    facts: [...(approved.is === "stands" ? approved.facts : []), ...statedFactsOf(claims, today)],
    opportunities: intent?.opportunity_id
      ? await readOpportunitiesNow(db, { tenantId: post.tenant_id, zone, config, claims, intent, nowMs })
      : null,
    moment: "send",
  };
}

/**
 * The reasons to post as they stand this moment, for the day a piece was made for (PRD 6.1: `reasonStands` reads
 * `opportunitiesOf` again right before the send). `unread` where they cannot be read: only a post that names one comes
 * here, and what it promises is then not known to stand (00728; before, it went as if it did).
 */
async function readOpportunitiesNow(
  db: Db,
  at: {
    tenantId: TenantId;
    zone: string;
    config: unknown;
    claims: readonly OwnerClaim[];
    intent: PieceIntent;
    nowMs: number;
  },
): Promise<{ key: string }[] | "unread"> {
  const day = at.intent.day ?? dayInZone(at.zone, at.nowMs).key;
  try {
    const facts = await readOpportunityFacts(
      db,
      { tenantId: at.tenantId, zone: at.zone, config: at.config, claims: at.claims, newServices: [] },
      { from: day, to: day, nowMs: at.nowMs },
    );
    return opportunitiesFrom(facts).map((o) => ({ key: o.key }));
  } catch (e) {
    logger({ tenant_id: at.tenantId }).error("reason_unread", { error: errField(e) });
    return "unread";
  }
}

/**
 * The recheck: why the post may not go now, or the bytes it sends. `approver` is asked at the send, not at making
 * ready. An opening that could not be read is `unread` at the send, and nothing at making ready: the send asks again.
 */
export function readSendRecheck(db: Db, post: PostRow, ask: { approver: false }): Promise<SendHold | SendBytes>;
export function readSendRecheck(
  db: Db,
  post: PostRow,
  ask: { approver: true },
): Promise<SendHold | SendUnread | SendBytes>;
export async function readSendRecheck(
  db: Db,
  post: PostRow,
  ask: { approver: boolean },
): Promise<SendHold | SendUnread | SendBytes> {
  if (ask.approver && (!post.approved_by || !(await mayStillPost(db, post.tenant_id, post.approved_by))))
    return holdFor(ON_INSTAGRAM.held.approver, "approver");
  const file = await findFileForWork(db, post.tenant_id, post.file_id);
  if (!file || file.removed_at) return holdFor(ON_INSTAGRAM.held.removed, "removed");
  // Stop everything: it stays down, and is its owner's to post again once they resume.
  if (await isSendingStopped(db, post.tenant_id)) return holdFor(ON_INSTAGRAM.held.stopped, "stopped");
  const approved = await readPostAsApproved(db, post.id);
  if (approved.is === "changed") return holdFor(ON_INSTAGRAM.held.changed, "changed");
  const reason = await readReasonFacts(db, post, approved);
  const verdict = reason ? evaluate({ reason }) : null;
  const [first] = !verdict || verdict.ok ? [] : verdict.refusals;
  if (first?.code === "reason_unread") {
    if (ask.approver) return { unread: holdFor(first.words, first.code) };
  } else if (first) return holdFor(first.words, first.code);
  return { path: approved.is === "stands" ? approved.path : null, made: file.made };
}

/** How long a send waits before it asks again for an opening it could not read, and how many times it asks. */
export const OPENING_ASK_MS = MIN_MS;
const OPENING_ASKS_MOST = 3;

/**
 * A send whose post promises open time that could not be read (00728): asked again a minute on, through the sender's
 * own job (`again`, handed which ask this is), as a send waits for a version being drawn; once it has asked enough, the
 * post is held from where it stood with why and words, and the bell says so. Each ask runs the whole recheck first, so
 * a post whose last moment passes meanwhile is still let go as late.
 */
export async function askAgainOrHold(
  db: Db,
  post: PostRow,
  job: Pick<ClaimedJob, "payload">,
  at: SendUnread & { from: readonly PostStatus[]; again: (ask: string) => Promise<unknown> },
): Promise<{ skipped: string }> {
  const asksMade = Number(job.payload.unread ?? 0) || 0;
  if (asksMade >= OPENING_ASKS_MOST) return holdPlacement(db, post, { ...at.unread, from: at.from });
  await at.again(String(asksMade + 1));
  return { skipped: "opening" };
}

/**
 * The post held from where it stood, in words and why, with nothing sent, and the bell says so (00616). One whose last
 * moment passed is let go instead: it is never sent late, and nothing is left to post again.
 */
export async function holdPlacement(
  db: Db,
  post: PostRow,
  at: SendHold & { from: readonly PostStatus[] },
): Promise<{ skipped: string }> {
  const late = at.why === "late";
  const moved = await movePost(db, {
    postId: post.id,
    from: at.from,
    to: late ? "pulled" : "held",
    patch: { held_reason: at.held, held_why: at.why },
  });
  logger({ tenant_id: post.tenant_id }).info(late ? "placement_late" : "post_held", { post_id: post.id, why: at.why });
  if (moved) await tellPostMoved(db, post, { is: "held", why: at.held });
  return { skipped: late ? "late" : "held" };
}
