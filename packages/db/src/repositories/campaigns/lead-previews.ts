/**
 * A lead's own receptionist before they sign up (decision 0079, 00497 lead_previews): the one place the table and its
 * doors are named.
 *
 *   - The sender's members read their workspace's rows under their own session (RLS), as the lead sheet and Today do
 *     (`findLeadPreview`, `listPreviewsTriedSince`).
 *   - The page knows only its link's token, so the dashboard reads by it on the service role (`findLeadPreviewByToken`); the
 *     edge reads a preview by its own workspace (`findLeadPreviewOfWorkspace`) and the sweep the ones past their end
 *     (`listPreviewsPastTheirEnd`), both every workspace's on purpose.
 *   - Every write is a door: made, built, sent, opened, said, called, not right and ended on the service role; claimed
 *     on the claimer's own session (`claimPreview`). A door's refusal comes back as its reason, never as a throw.
 */
import type { PreviewTriedDto } from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types";
import { platformWide, tenantDb } from "../../shared/tenant-db";

type Db = SupabaseClient<Database>;

/** A preview as the doors and the pages read it: the row whole. */
export type LeadPreviewRow = Database["public"]["Tables"]["lead_previews"]["Row"];

/** What a door said no with, by its code: the limit, a preview ended or never found, one claimed, and the rest. */
export type PreviewRefusal = "limit" | "ended" | "not_found" | "taken" | "not_ours" | "refused" | "signed_out";

/** A door's raised code, read as its reason. 55000 is a claim's: taken when it names a business set up, else ended. */
function previewRefusalOf(error: { code?: string; message?: string }): PreviewRefusal {
  switch (error.code) {
    case "54000":
      return "limit";
    case "P0002":
      return /not found/i.test(error.message ?? "") ? "not_found" : "ended";
    case "55000":
      return /already set up/i.test(error.message ?? "") ? "taken" : "ended";
    case "42501":
      return "not_ours";
    case "28000":
      return "signed_out";
    default:
      return "refused";
  }
}

/** A door's answer: what it answered, or why not, with the door's own words. */
export type PreviewDoor<T> = { ok: true; value: T } | { ok: false; reason: PreviewRefusal; message: string };

/** One of the doors' answers, read: a known refusal is its reason; anything else is the database's, thrown. */
function previewDoorOf<T>(r: { data: unknown; error: { code?: string; message: string } | null }): PreviewDoor<T> {
  if (!r.error) return { ok: true, value: r.data as T };
  const reason = previewRefusalOf(r.error);
  if (reason === "refused" && r.error.code !== "22023") throw new Error(r.error.message);
  return { ok: false, reason, message: r.error.message };
}

/** What preview_make answers. */
export interface PreviewMade {
  id: string;
  token: string;
  state: string;
  preview_tenant_id: string | null;
  made: boolean;
}

/** A lead's preview made, or the one that stands (the service role's). */
export async function makeLeadPreview(
  db: Db,
  params: { tenantId: string; leadId: string; name: string; timezone: string | null; by: string | null },
): Promise<PreviewDoor<PreviewMade>> {
  return previewDoorOf<PreviewMade>(
    await db.rpc("preview_make", {
      p_tenant_id: params.tenantId,
      p_lead_id: params.leadId,
      p_name: params.name,
      p_timezone: params.timezone ?? "",
      ...(params.by ? { p_by: params.by } : {}),
    }),
  );
}

/** A build answered: ready, or failed and why. True when the preview moved. */
export async function recordPreviewBuilt(
  db: Db,
  id: string,
  ok: boolean,
  reason: string | null = null,
): Promise<boolean> {
  const { data, error } = await db.rpc("preview_built", { p_id: id, p_ok: ok, ...(reason ? { p_why: reason } : {}) });
  if (error) throw new Error(error.message);
  return data === true;
}

/** The first email that carried it went: its thirty days start. True the first time. */
export async function recordPreviewSent(db: Db, id: string): Promise<boolean> {
  const { data, error } = await db.rpc("preview_sent", { p_id: id });
  if (error) throw new Error(error.message);
  return data === true;
}

/** The page drew in a browser: the count, or null for a preview not open to try. */
export async function recordPreviewOpened(db: Db, id: string): Promise<number | null> {
  const { data, error } = await db.rpc("preview_opened", { p_id: id });
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : null;
}

/** A message and its answer kept: the count so far, or the limit, or a preview that has ended. */
export async function recordPreviewSaid(
  db: Db,
  id: string,
  text: string,
  reply: { text: string; then?: Json | null },
): Promise<PreviewDoor<number>> {
  return previewDoorOf<number>(
    await db.rpc("preview_said", { p_id: id, p_text: text, p_reply: { text: reply.text, then: reply.then ?? null } }),
  );
}

/** A call on a preview's workspace ended: its seconds counted. True when it was a preview open to try. */
export async function recordPreviewCalled(db: Db, previewTenantId: string, seconds: number): Promise<boolean> {
  const { data, error } = await db.rpc("preview_called", {
    p_preview_tenant_id: previewTenantId,
    p_seconds: Math.max(0, Math.round(seconds)),
  });
  if (error) throw new Error(error.message);
  return data === true;
}

/** What the business said is not right, kept for the sender: the count, or the limit. */
export async function recordPreviewNotRight(
  db: Db,
  id: string,
  fact: string,
  sentence: string | null,
): Promise<PreviewDoor<number>> {
  return previewDoorOf<number>(
    await db.rpc("preview_not_right", { p_id: id, p_fact: fact, ...(sentence ? { p_said: sentence } : {}) }),
  );
}

/** The workspace a claim made theirs, as /api/v1/workspaces lists it. */
export interface ClaimedWorkspace {
  id: string;
  slug: string;
  name: string;
  status: string;
  timezone: string;
  locale: string;
}

/** Make it mine, on the claimer's own session: the workspace now theirs, or why not. */
export async function claimPreview(session: Db, token: string): Promise<PreviewDoor<ClaimedWorkspace>> {
  const r = previewDoorOf<ClaimedWorkspace[]>(await session.rpc("preview_claim", { p_token: token }));
  if (!r.ok) return r;
  const workspace = r.value[0];
  if (!workspace) throw new Error("preview_claim answered no row");
  return { ok: true, value: workspace };
}

/** A preview past its end, ended: its words cleared, its workspace erased. True when it ended now. */
export async function endPreview(db: Db, id: string): Promise<boolean> {
  const { data, error } = await db.rpc("preview_end", { p_id: id });
  if (error) throw new Error(error.message);
  return data === true;
}

/** A lead's preview in its workspace, or null where none was made. */
export async function findLeadPreview(db: Db, tenantId: string, leadId: string): Promise<LeadPreviewRow | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("lead_previews")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** A preview in its sender's workspace by its id, or null. */
export async function findLeadPreviewById(db: Db, tenantId: string, id: string): Promise<LeadPreviewRow | null> {
  const { data, error } = await tenantDb(db, tenantId).from("lead_previews").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** What a preview is built from: the lead's listing as the finder kept it, and whether it may still have one. */
export interface LeadForPreview {
  id: string;
  kind: string;
  stage: string;
  erased_at: string | null;
  blanked_at: string | null;
  business_name: string;
  category: string | null;
  street: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  phone_e164: string | null;
  /** The address the sender wrote to: sign-up from its preview opens with it filled in (L4). */
  email: string | null;
  website_host: string | null;
  hours: Json;
}

/** The lead a preview is built from, or null where it is gone. */
export async function findLeadForPreview(db: Db, tenantId: string, leadId: string): Promise<LeadForPreview | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("leads")
    .select(
      "id, kind, stage, erased_at, blanked_at, business_name, category, street, city, region, postal_code, phone_e164, email, website_host, hours",
    )
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** A preview by its link's token (the service role's: the page knows nothing else), or null for none. */
export async function findLeadPreviewByToken(db: Db, token: string): Promise<LeadPreviewRow | null> {
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return null;
  const { data, error } = await platformWide(db).from("lead_previews").select("*").eq("token", token).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** The preview a workspace is (the service role's: the edge knows the workspace), or null for one that is none. */
export async function findLeadPreviewOfWorkspace(db: Db, previewTenantId: string): Promise<LeadPreviewRow | null> {
  const { data, error } = await platformWide(db)
    .from("lead_previews")
    .select("*")
    .eq("preview_tenant_id", previewTenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** The previews a workspace's leads tried since a moment, the newest first (Today's rows, under the member's session). */
export async function listPreviewsTriedSince(db: Db, tenantId: string, since: string): Promise<PreviewTriedDto[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("lead_previews")
    .select("id, lead_id, state, tried_at, asked_count, call_count, call_seconds, not_right, lead:leads(business_name)")
    .gte("tried_at", since)
    .order("tried_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((item) =>
    item.tried_at
      ? [
          {
            id: item.id,
            lead_id: item.lead_id,
            state: item.state,
            tried_at: item.tried_at,
            asked_count: item.asked_count,
            call_count: item.call_count,
            call_seconds: item.call_seconds,
            not_right: item.not_right,
            business: item.lead?.business_name ?? null,
          },
        ]
      : [],
  );
}

/** The previews past their end and not yet ended, oldest first (the sweep's, every workspace's). */
export async function listPreviewsPastTheirEnd(
  db: Db,
  now: Date,
  limit: number,
): Promise<Array<Pick<LeadPreviewRow, "id" | "tenant_id" | "preview_tenant_id">>> {
  const { data, error } = await platformWide(db)
    .from("lead_previews")
    .select("id, tenant_id, preview_tenant_id")
    .in("state", ["building", "ready", "failed"])
    .lt("ends_at", now.toISOString())
    .order("ends_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Whether a workspace makes previews: one marked ours (00469, decision 0079). Its own row, under its member's session. */
export async function doesMakePreviews(db: Db, tenantId: string): Promise<boolean> {
  const { data, error } = await db.from("tenants").select("ours").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.ours === true;
}
