/**
 * What AI knows of a business when it answers under one of its posts (00699; the content loop PRD's 12.4): its name, its
 * tone and languages, its services, and what the owner has said is theirs to say (contracts ownersSayings), the only
 * prices and offers an answer may name. One read for the two writers of an answer: the job's draft (comment_reply) and
 * the owner's "Tell AI what to change". On the client it is handed: the service role's on the edge, the member's own
 * session in the dashboard. A read that fails throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DbFailure,
  ownersSayings,
  parseTenantConfig,
  type CommentAnswerFacts,
  type TenantId,
} from "@chanlytics/contracts";
import { findConfigRow, findWorkspaceName } from "../workspace/rows";
import { findWorkspaceZone } from "../workspace/control-plane/capabilities";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** The business as an answer under its post is written for it, at `now`. */
export async function readAnswerFacts(db: Db, tenantId: TenantId, now: Date): Promise<CommentAnswerFacts> {
  const [named, row, zone] = await Promise.all([
    findWorkspaceName(db, tenantId),
    findConfigRow(db, tenantId),
    findWorkspaceZone(db, tenantId),
  ]);
  if (named.error) throw new DbFailure(named.error, "workspace name");
  if (row.error) throw new DbFailure(row.error, "workspace config");
  const brain = parseTenantConfig(row.data?.config)?.brain ?? null;
  const profile = brain?.profile;
  return {
    name: brain?.business_name || named.data?.name || "the business",
    tone: profile?.tone?.trim() || null,
    languages: profile?.languages ?? [],
    services: (profile?.services ?? []).map((service) => service.name),
    says: ownersSayings(brain, zone, now),
  };
}
