/**
 * The shared record's links (00680; the content loop PRD's Appendix A): a short code for one place a thing of the
 * business's is shared, and its opens counted by day. A form's links are made, renamed and stopped by a member who may
 * act, on their own client, under the table's row rules; a visitor's open is link_open's, on the service role, which
 * says where the link lands and counts the open. An open is a count, never a visitor. A read that fails THROWS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, heldTenantId, recordOrEmpty, type TenantId } from "@chanlytics/contracts";
import { tenantDb } from "../../shared/tenant-db";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** One place a form is shared. */
export interface LinkRead {
  id: string;
  code: string;
  place: string;
  printed: boolean;
  createdAt: string;
  stoppedAt: string | null;
  /** The sites the form may show on, framed in their own page (00703): null for every place that is not the website. */
  sites: string[] | null;
}

const LINK_COLUMNS = "id, code, place, printed, created_at, stopped_at, sites";

function linkOf(row: {
  id: string;
  code: string;
  place: string;
  printed: boolean;
  created_at: string;
  stopped_at: string | null;
  sites: string[] | null;
}): LinkRead {
  return {
    id: row.id,
    code: row.code,
    place: row.place,
    printed: row.printed,
    createdAt: row.created_at,
    stoppedAt: row.stopped_at,
    sites: row.sites ?? null,
  };
}

/** A form's links, in the order they were made. */
export async function listFormLinks(db: Db, tenantId: TenantId, formId: string): Promise<LinkRead[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("links")
    .select(LINK_COLUMNS)
    .eq("subject_type", "form")
    .eq("subject_id", formId)
    .order("created_at")
    .limit(100);
  if (error) throw new DbFailure(error, "links");
  return data.map(linkOf);
}

/** Every link of a workspace's forms, by form: the places a report says each request came through. */
export async function listWorkspaceFormLinks(
  db: Db,
  tenantId: TenantId,
): Promise<Array<{ id: string; formId: string; place: string }>> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("links")
    .select("id, subject_id, place")
    .eq("subject_type", "form")
    .order("created_at")
    .limit(1000);
  if (error) throw new DbFailure(error, "links");
  return data.map((row) => ({ id: row.id, formId: row.subject_id, place: row.place }));
}

/** Where one link is shared, in its owner's words, or null where the workspace has no such link. */
export async function findLinkPlace(db: Db, tenantId: TenantId, linkId: string): Promise<string | null> {
  const { data, error } = await tenantDb(db, tenantId).from("links").select("place").eq("id", linkId).maybeSingle();
  if (error) throw new DbFailure(error, "links");
  return data?.place ?? null;
}

/** How often a link is tried again with a new code before it is a failure: a code is taken once in a billion. */
const CODE_TRIES = 3;

/**
 * A link made for one place a form is shared; the database makes its code (link_code_new). A code another link holds
 * is tried again with a new one.
 */
export async function makeFormLink(
  db: Db,
  link: { tenantId: TenantId; formId: string; place: string; printed: boolean; userId: string; sites?: string[] },
): Promise<LinkRead> {
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await db
      .from("links")
      .insert({
        tenant_id: link.tenantId,
        subject_type: "form",
        subject_id: link.formId,
        place: link.place,
        printed: link.printed,
        created_by: link.userId,
        ...(link.sites ? { sites: link.sites } : {}),
      })
      .select(LINK_COLUMNS)
      .maybeSingle();
    if (error?.code === "23505" && attempt < CODE_TRIES) continue;
    if (error) throw new DbFailure(error, "links");
    // RLS answers a refused insert with no row and no error.
    if (!data) throw new Error("the link was not made: the workspace's row rules refused it");
    return linkOf(data);
  }
}

/** A link renamed, stopped, or started again. Answers whether a row was written: a refused write changes none. */
export async function keepLink(
  db: Db,
  kept: { tenantId: TenantId; linkId: string; place?: string; stoppedAt?: string | null; sites?: string[] },
): Promise<boolean> {
  const { data, error } = await db
    .from("links")
    .update({
      ...(kept.place === undefined ? {} : { place: kept.place }),
      ...(kept.stoppedAt === undefined ? {} : { stopped_at: kept.stoppedAt }),
      ...(kept.sites === undefined ? {} : { sites: kept.sites }),
    })
    .eq("tenant_id", kept.tenantId)
    .eq("id", kept.linkId)
    .select("id");
  if (error) throw new DbFailure(error, "links");
  return data.length > 0;
}

/**
 * The sites a link's form may show on, framed in their own page (00703), read for the framed address on the service
 * role: null for a link that is not a website's, or that the workspace does not hold.
 */
export async function findLinkSites(db: Db, tenantId: TenantId, linkId: string): Promise<string[] | null> {
  const { data, error } = await tenantDb(db, tenantId).from("links").select("sites").eq("id", linkId).maybeSingle();
  if (error) throw new DbFailure(error, "links");
  return data?.sites ?? null;
}

/** How many of a website link's latest requests are read for when each site last sent one. */
const SITE_ENTRIES = 200;

/**
 * The site each of a link's latest requests came from, newest first (form_entries.source.site, a host without its
 * www.): what says when a request last came from each site a form may show on. A test and a held entry are none.
 */
export async function listLinkEntrySites(
  db: Db,
  tenantId: TenantId,
  linkId: string,
): Promise<Array<{ site: string; createdAt: string }>> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("form_entries")
    .select("source, created_at")
    .eq("link_id", linkId)
    .neq("state", "held")
    .eq("test", false)
    .order("created_at", { ascending: false })
    .limit(SITE_ENTRIES);
  if (error) throw new DbFailure(error, "form_entries");
  return data.flatMap((row) => {
    const site = recordOrEmpty(row.source).site;
    return typeof site === "string" && site ? [{ site, createdAt: row.created_at }] : [];
  });
}

/** Where an opened link lands. */
export interface LinkOpened {
  linkId: string;
  tenantId: TenantId;
  code: string;
  stopped: boolean;
  /** The workspace's own address, which its public pages stand under. */
  workspace: string;
  /**
   * What it opens: a form, with the form's own address and whether it is live; or a post (00699), with where its link
   * lands and the workspace's own places it may land on.
   */
  subject:
    | { type: "form"; id: string; slug: string | null; state: string | null }
    | {
        type: "post";
        id: string;
        lands: "chat" | "booking";
        place: string | null;
        instagram: string | null;
        whatsapp: string | null;
        booking: string | null;
      };
}

const linkTextOrNull = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

/**
 * A link opened by its code (link_open): where it lands, with one more open on its day when `counted` (never for a
 * chat app's preview). Null for a code nobody holds.
 */
export async function openLink(db: Db, code: string, counted: boolean): Promise<LinkOpened | null> {
  const { data, error } = await db.rpc("link_open", { p_code: code, p_count: counted });
  if (error) throw new DbFailure(error, "link_open");
  const row = recordOrEmpty(data);
  if (typeof row.link_id !== "string" || typeof row.tenant_id !== "string" || typeof row.subject_id !== "string")
    return null;
  return {
    linkId: row.link_id,
    tenantId: heldTenantId(row.tenant_id),
    code: typeof row.code === "string" ? row.code : code,
    stopped: row.stopped === true,
    workspace: typeof row.workspace === "string" ? row.workspace : "",
    subject:
      row.subject_type === "post"
        ? {
            type: "post",
            id: row.subject_id,
            lands: row.lands === "booking" ? "booking" : "chat",
            place: linkTextOrNull(row.place),
            instagram: linkTextOrNull(row.instagram),
            whatsapp: linkTextOrNull(row.whatsapp),
            booking: linkTextOrNull(row.booking),
          }
        : {
            type: "form",
            id: row.subject_id,
            slug: linkTextOrNull(row.slug),
            state: linkTextOrNull(row.state),
          },
  };
}
