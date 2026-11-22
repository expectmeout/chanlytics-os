/**
 * A workspace's hosted forms and their published versions (00680; the Forms plan, F1). A form's draft is written by a
 * member who may act, on their own client, under its row rules; form_publish and form_turn alone move its state. A
 * version is never changed. The visitor's page and the door read a form and its version on the service role, by the
 * workspace's id and the form's address. A description is read back through its shape (contracts FormDescription): one
 * that does not hold is answered as none, so nothing draws or checks against a shape it does not know. A read that
 * fails THROWS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, FormDescription, recordOrEmpty, type TenantId } from "@chanlytics/contracts";
import { tenantDb } from "../../shared/tenant-db";
import type { Database, Json } from "../../types";

type Db = SupabaseClient<Database>;

/** Whether a form is a draft never published, live, or off. */
export type FormState = "draft" | "live" | "off";

/** A form as its owner's screens read it. */
export interface FormRead {
  id: string;
  slug: string;
  state: FormState;
  /** The description as it is being changed; null for one the shape no longer reads. */
  draft: FormDescription | null;
  liveVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  lastEntryAt: string | null;
}

/** A published version: which, and what it says; null for a description the shape no longer reads. */
export interface FormVersionRead {
  id: string;
  formId: string;
  description: FormDescription | null;
  publishedAt: string;
  replacedAt: string | null;
}

const FORM_COLUMNS = "id, slug, state, draft, live_version_id, created_at, updated_at, last_entry_at";
const VERSION_COLUMNS = "id, form_id, description, published_at, replaced_at";

/** A description read back through its shape, or null. */
function describedBy(kept: Json): FormDescription | null {
  const read = FormDescription.safeParse(kept);
  return read.success ? read.data : null;
}

const formStateOf = (kept: string): FormState => (kept === "live" || kept === "off" ? kept : "draft");

function formOf(row: FormKept): FormRead {
  return {
    id: row.id,
    slug: row.slug,
    state: formStateOf(row.state),
    draft: describedBy(row.draft),
    liveVersionId: row.live_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastEntryAt: row.last_entry_at,
  };
}

/** The columns a form is read by. */
interface FormKept {
  id: string;
  slug: string;
  state: string;
  draft: Json;
  live_version_id: string | null;
  created_at: string;
  updated_at: string;
  last_entry_at: string | null;
}

function versionRowOf(row: {
  id: string;
  form_id: string;
  description: Json;
  published_at: string;
  replaced_at: string | null;
}): FormVersionRead {
  return {
    id: row.id,
    formId: row.form_id,
    description: describedBy(row.description),
    publishedAt: row.published_at,
    replacedAt: row.replaced_at,
  };
}

/** A workspace's forms, the newest first. */
export async function listForms(db: Db, tenantId: TenantId): Promise<FormRead[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("forms")
    .select(FORM_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new DbFailure(error, "forms");
  return data.map(formOf);
}

/** One form, or null where the workspace has none by that id. */
export async function findForm(db: Db, tenantId: TenantId, formId: string): Promise<FormRead | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("forms")
    .select(FORM_COLUMNS)
    .eq("id", formId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "forms");
  return data ? formOf(data) : null;
}

/** The form at an address under the workspace's page, or null. */
export async function findFormBySlug(db: Db, tenantId: TenantId, slug: string): Promise<FormRead | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("forms")
    .select(FORM_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new DbFailure(error, "forms");
  return data ? formOf(data) : null;
}

/** One version of a workspace's forms, or null. */
export async function findFormVersion(db: Db, tenantId: TenantId, versionId: string): Promise<FormVersionRead | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("form_versions")
    .select(VERSION_COLUMNS)
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "form_versions");
  return data ? versionRowOf(data) : null;
}

/** The versions some forms have live, by version id: what a list of forms says of each. */
export async function listFormVersions(
  db: Db,
  tenantId: TenantId,
  versionIds: readonly string[],
): Promise<FormVersionRead[]> {
  if (versionIds.length === 0) return [];
  const { data, error } = await tenantDb(db, tenantId)
    .from("form_versions")
    .select(VERSION_COLUMNS)
    .in("id", [...versionIds]);
  if (error) throw new DbFailure(error, "form_versions");
  return data.map(versionRowOf);
}

/**
 * A form made as a draft, at an address of its own. `taken` where the workspace already has a form there: the caller
 * tries the next address.
 */
export async function makeForm(
  db: Db,
  form: { tenantId: TenantId; slug: string; draft: FormDescription; userId: string },
): Promise<{ id: string } | { taken: true }> {
  const { data, error } = await db
    .from("forms")
    .insert({ tenant_id: form.tenantId, slug: form.slug, draft: { ...form.draft }, created_by: form.userId })
    .select("id")
    .maybeSingle();
  if (error?.code === "23505") return { taken: true };
  if (error) throw new DbFailure(error, "forms");
  // RLS answers a refused insert with no row and no error.
  if (!data) throw new Error("the form was not made: the workspace's row rules refused it");
  return { id: data.id };
}

/** A form's draft kept as it was changed. Answers whether a row was written: a refused write changes none. */
export async function keepFormDraft(
  db: Db,
  kept: { tenantId: TenantId; formId: string; draft: FormDescription; nowIso: string },
): Promise<boolean> {
  const { data, error } = await db
    .from("forms")
    .update({ draft: { ...kept.draft }, updated_at: kept.nowIso })
    .eq("tenant_id", kept.tenantId)
    .eq("id", kept.formId)
    .select("id");
  if (error) throw new DbFailure(error, "forms");
  return data.length > 0;
}

/** A draft never published, deleted. Answers whether one went: a form that was published is turned off instead. */
export async function deleteFormDraft(db: Db, gone: { tenantId: TenantId; formId: string }): Promise<boolean> {
  const { data, error } = await db
    .from("forms")
    .delete()
    .eq("tenant_id", gone.tenantId)
    .eq("id", gone.formId)
    .eq("state", "draft")
    .select("id");
  if (error) throw new DbFailure(error, "forms");
  return data.length > 0;
}

/** A form's draft made its next version and the form live (form_publish): which version, and whether one was made. */
export async function publishForm(
  db: Db,
  published: { tenantId: TenantId; formId: string },
): Promise<{ versionId: string; made: boolean }> {
  const { data, error } = await db.rpc("form_publish", {
    p_tenant_id: published.tenantId,
    p_form_id: published.formId,
  });
  if (error) throw new DbFailure(error, "form_publish");
  const row = recordOrEmpty(data);
  if (typeof row.version_id !== "string") throw new Error("form_publish answered without a version");
  return { versionId: row.version_id, made: row.made === true };
}

/** A published form turned off, or on again (form_turn). Answers whether it turned. */
export async function setFormOn(db: Db, turned: { tenantId: TenantId; formId: string; on: boolean }): Promise<boolean> {
  const { data, error } = await db.rpc("form_turn", {
    p_tenant_id: turned.tenantId,
    p_form_id: turned.formId,
    p_on: turned.on,
  });
  if (error) throw new DbFailure(error, "form_turn");
  return data === true;
}

/** The live forms of a workspace as its own page lists them: each one's address and heading. */
export async function listLiveForms(db: Db, tenantId: TenantId): Promise<Array<{ slug: string; heading: string }>> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("forms")
    .select("slug, live_version_id")
    .eq("state", "live")
    .order("created_at")
    .limit(50);
  if (error) throw new DbFailure(error, "forms");
  const versions = await listFormVersions(
    db,
    tenantId,
    data.flatMap((row) => (row.live_version_id ? [row.live_version_id] : [])),
  );
  const headingBy = new Map(versions.map((version) => [version.id, version.description?.heading ?? null]));
  return data.flatMap((row) => {
    const heading = row.live_version_id ? headingBy.get(row.live_version_id) : null;
    return heading ? [{ slug: row.slug, heading }] : [];
  });
}
