/**
 * What the credit rule is handed (00696; the content loop PRD's 9.3, Appendix A.6, A.7): visits as creditOf reads them,
 * each with what it answered when it was asked for (appointments.through_type, through_id), and a post's one link with
 * its opens. Bounded by window and workspace; a read that fails THROWS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  APPOINTMENT_SOURCES,
  APPOINTMENT_STATUSES,
  DbFailure,
  isOneOf,
  LINK_LANDS,
  recordOrEmpty,
  TOUCH_SUBJECTS,
  type CreditVisit,
  type LinkLands,
  type ContactId,
  type TenantId,
} from "@chanlytics/contracts";
import { tenantDb } from "../../shared/tenant-db";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** The most visits one read answers. */
const VISITS_READ_MAX = 2000;

/** A visit as the credit rule reads it, with what a page names it by. */
export interface VisitForCredit extends CreditVisit {
  id: string;
  starts_at: string;
  service: string | null;
}

const VISIT_COLUMNS = "id, contact_id, status, source, created_at, through_type, through_id, starts_at, service";

type VisitRow = Pick<
  Database["public"]["Tables"]["appointments"]["Row"],
  "id" | "contact_id" | "status" | "source" | "created_at" | "through_type" | "through_id" | "starts_at" | "service"
>;

function creditVisitOf(row: VisitRow): VisitForCredit | null {
  if (!isOneOf(APPOINTMENT_STATUSES, row.status) || !isOneOf(APPOINTMENT_SOURCES, row.source)) return null;
  const through = row.through_type && isOneOf(TOUCH_SUBJECTS, row.through_type) ? row.through_type : null;
  return {
    id: row.id,
    contact_id: row.contact_id,
    status: row.status,
    source: row.source,
    created_at: row.created_at,
    through_type: through,
    through_id: through ? row.through_id : null,
    starts_at: row.starts_at,
    service: row.service,
  };
}

/** These people's visits whose row was written since a moment (what their touches may be put down to). */
export async function listVisitsOf(
  db: Db,
  tenantId: TenantId,
  of: { contactIds: readonly ContactId[]; since: string },
): Promise<VisitForCredit[]> {
  const contactIds = [...new Set(of.contactIds)].slice(0, 500);
  if (contactIds.length === 0) return [];
  const { data, error } = await tenantDb(db, tenantId)
    .from("appointments")
    .select(VISIT_COLUMNS)
    .in("contact_id", contactIds)
    .gte("created_at", of.since)
    .order("created_at", { ascending: false })
    .limit(VISITS_READ_MAX);
  if (error) throw new DbFailure(error, "appointments");
  return data.flatMap((row) => creditVisitOf(row) ?? []);
}

/** A workspace's visits whose row was written in a window (Reports' total, each counted once). */
export async function listVisitsMadeIn(
  db: Db,
  tenantId: TenantId,
  window: { since: string; until: string },
): Promise<VisitForCredit[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("appointments")
    .select(VISIT_COLUMNS)
    .gte("created_at", window.since)
    .lt("created_at", window.until)
    .not("contact_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(VISITS_READ_MAX);
  if (error) throw new DbFailure(error, "appointments");
  return data.flatMap((row) => creditVisitOf(row) ?? []);
}

/** A post's one link: its code, where it lands, whether it was stopped, and how often it was opened in all. */
export interface PostLinkRead {
  linkId: string;
  code: string;
  lands: LinkLands;
  stopped: boolean;
  opens: number;
}

function postLinkOf(value: unknown): PostLinkRead | null {
  const row = recordOrEmpty(value);
  if (typeof row.link_id !== "string" || typeof row.code !== "string" || !isOneOf(LINK_LANDS, row.lands)) return null;
  return {
    linkId: row.link_id,
    code: row.code,
    lands: row.lands,
    stopped: row.stopped === true,
    opens: typeof row.opens === "number" ? row.opens : Number(row.opens ?? 0) || 0,
  };
}

/** A post's one link, made on first ask (post_link_make, a member who may act, on their own client). */
export async function makePostLink(db: Db, tenantId: TenantId, postId: string): Promise<PostLinkRead | null> {
  const { data, error } = await db.rpc("post_link_make", { p_tenant_id: tenantId, p_post_id: postId });
  if (error) throw new DbFailure(error, "post_link_make");
  return postLinkOf(data);
}

/** The links of these posts that exist, with their opens in all; a post with none is absent. */
export async function readPostLinks(
  db: Db,
  tenantId: TenantId,
  postIds: readonly string[],
): Promise<Map<string, PostLinkRead>> {
  const ids = [...new Set(postIds)].slice(0, 200);
  const out = new Map<string, PostLinkRead>();
  if (ids.length === 0) return out;
  const { data, error } = await tenantDb(db, tenantId)
    .from("links")
    .select("id, code, lands, stopped_at, subject_id, link_days(opens)")
    .eq("subject_type", "post")
    .in("subject_id", ids)
    .limit(ids.length);
  if (error) throw new DbFailure(error, "links");
  for (const row of data) {
    if (!isOneOf(LINK_LANDS, row.lands)) continue;
    out.set(row.subject_id, {
      linkId: row.id,
      code: row.code,
      lands: row.lands,
      stopped: row.stopped_at !== null,
      opens: row.link_days.reduce((sum, day) => sum + day.opens, 0),
    });
  }
  return out;
}
