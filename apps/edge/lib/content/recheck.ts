/**
 * The recheck right before a place is asked anything (the content loop PRD's 6.2, third moment; 00611's recheck): one
 * reading for every place. Whoever approved it may still post for the business; the post was not deleted; everything is
 * not stopped; it still stands as approved (00681 post_as_approved: its words, its bytes, its version); and its reason
 * still stands (PRD 6.1). No yes is read, for a person or for a file. Anything moved holds the post in words and sends
 * nothing. A post whose last moment passed is let go (`pulled`, held_why `late`) and is never
 * sent late, by any road. The business's notes and services are read only where the piece's intent leans on one.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ON_INSTAGRAM,
  notesInForce,
  parseTenantConfig,
  type AsApproved,
  type PostHeldWhy,
  type PostStatus,
} from "@chanlytics/contracts";
import { evaluate, type PolicyFacts } from "@chanlytics/core";
import { findFileForWork, mayStillPost, movePost, readPostAsApproved, type PostRow } from "@chanlytics/db/files";
import { findWorkspaceZone, getTenantConfig, isSendingStopped } from "@chanlytics/db/workspace";
import type { Database } from "@chanlytics/db/types";
import { logger } from "../shared/log.js";
import { tellPostMoved } from "../files/post-told.js";

type Db = SupabaseClient<Database>;

/** Why a post may not go now, in the owner's words. */
export interface SendHold {
  held: string;
  why: PostHeldWhy;
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
  const leans = !!intent?.offer || !!intent?.service;
  const profile = leans ? parseTenantConfig((await getTenantConfig(db, post.tenant_id))?.config)?.brain?.profile : null;
  const services = profile?.services ?? [];
  const nowMs = Date.now();
  return {
    intent,
    goodUntil: post.good_until,
    atMs: nowMs,
    nowMs,
    zone,
    says: [
      ...notesInForce(profile?.notes, zone, new Date()).map((note) => `${note.title} ${note.text}`),
      ...services.map((service) => `${service.name} ${service.price_note ?? ""}`),
    ],
    services: services.map((service) => service.name),
    facts: approved.is === "stands" ? approved.facts : [],
    moment: "send",
  };
}

/** The recheck: why the post may not go now, or the bytes it sends. `approver` is asked at the send, not at making ready. */
export async function readSendRecheck(
  db: Db,
  post: PostRow,
  ask: { approver: boolean },
): Promise<SendHold | SendBytes> {
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
  if (first) return holdFor(first.words, first.code);
  return { path: approved.is === "stands" ? approved.path : null, made: file.made };
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
