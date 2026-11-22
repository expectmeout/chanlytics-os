/**
 * The reason, asked again right before a send (the content loop PRD's 6.1 and 8.2): whatever the place, a post whose
 * last moment passed is let go (`pulled`, held_why `late`) and is never sent, by any road; one whose offer ended or whose
 * service is no longer offered is held in words with the three ways on. The business's notes and services are read only
 * where the piece's intent leans on one.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { notesInForce, parseTenantConfig, type OwnersFact, type PieceIntent } from "@chanlytics/contracts";
import { reasonStands, type PolicyRefusal } from "@chanlytics/core";
import { findWorkspaceNameAndConfig } from "@chanlytics/db/campaigns";
import { findWorkspaceZone } from "@chanlytics/db/workspace";
import { movePost, type PostRow } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { logger } from "../shared/log.js";
import { tellPostMoved } from "../files/post-told.js";

type Db = SupabaseClient<Database>;

/** The business's notes in force and its services, read only when the intent names an offer or a service. */
async function readBusinessFacts(db: Db, post: PostRow, intent: PieceIntent | null, zone: string) {
  if (!intent?.offer && !intent?.service) return { notes: [], services: [] };
  const profile = parseTenantConfig((await findWorkspaceNameAndConfig(db, post.tenant_id)).config)?.brain?.profile;
  return {
    notes: notesInForce(profile?.notes, zone, new Date()).map((n) => `${n.title} ${n.text}`),
    services: (profile?.services ?? []).map((s) => s.name),
  };
}

/** Whether this post's reason still stands right now; its refusal where it does not. */
export async function readReasonNow(
  db: Db,
  post: PostRow,
  approved: { intent: PieceIntent | null; facts: readonly OwnersFact[] },
): Promise<PolicyRefusal | null> {
  if (!post.good_until && !approved.intent) return null;
  const zone = (await findWorkspaceZone(db, post.tenant_id)) ?? "UTC";
  const business = await readBusinessFacts(db, post, approved.intent, zone);
  return reasonStands({
    intent: approved.intent,
    goodUntil: post.good_until,
    nowMs: Date.now(),
    zone,
    notes: business.notes,
    services: business.services,
    facts: approved.facts,
    words: post.caption ?? "",
    moment: "send",
  });
}

/** Too late to go: let go before anything is sent, in words, and the bell says so. Never sent late, by any road. */
export async function letGoLate(db: Db, post: PostRow, words: string): Promise<{ skipped: string }> {
  const moved = await movePost(db, {
    postId: post.id,
    from: ["queued", "preparing", "held", "failed"],
    to: "pulled",
    patch: { held_reason: words, held_why: "late" },
  });
  logger({ tenant_id: post.tenant_id }).info("placement_late", { post_id: post.id, place: post.place });
  if (moved) await tellPostMoved(db, post, { is: "held", why: words });
  return { skipped: "late" };
}
