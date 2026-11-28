/**
 * Forms owned elsewhere and the sites they come from (00709; Campaigns in three tabs, Lane B): a website's own forms,
 * each made by form_entry_take at its first entry, and the sites a business sends entries from, each made with its first
 * key. Read on the member's session client under their row rules; renamed and listed through a member's own doors
 * (outside_form_rename, outside_form_listed). The open requests are counted whole here (form_requests_open_count), never
 * from the list that stops at 200. A read that fails THROWS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, heldContactId, type ContactId, type OutsideFormKind, type TenantId } from "@chanlytics/contracts";
import { tenantDb } from "../../shared/tenant-db";
import type { Database, Json } from "../../types";

type Db = SupabaseClient<Database>;

/** A site a business sends entries from, as kept. */
export interface FormSiteRead {
  id: string;
  name: string | null;
  host: string | null;
  firstEntryAt: string | null;
  lastEntryAt: string | null;
  testAt: string | null;
  createdAt: string;
}

/** A form owned elsewhere, as kept. */
export interface OutsideFormRead {
  id: string;
  siteId: string | null;
  form: OutsideFormKind;
  ref: string | null;
  sentName: string | null;
  name: string | null;
  listed: boolean;
  requestsFrom: string;
  firstEntryAt: string | null;
  lastEntryAt: string | null;
}

/** The most sites a workspace lists: it keeps at most ten keys that work, so more sites than this are ended ones. */
const SITES_MAX = 40;
/** The most forms a workspace's sites list. */
const OUTSIDE_FORMS_MAX = 200;

const formKindOf = (kept: string): OutsideFormKind => (kept === "signup" ? "signup" : "request");

const outsideFormOf = (row: {
  id: string;
  site_id: string | null;
  form: string;
  ref: string | null;
  sent_name: string | null;
  name: string | null;
  listed: boolean;
  requests_from: string;
  first_entry_at: string | null;
  last_entry_at: string | null;
}): OutsideFormRead => ({
  id: row.id,
  siteId: row.site_id,
  form: formKindOf(row.form),
  ref: row.ref,
  sentName: row.sent_name,
  name: row.name,
  listed: row.listed,
  requestsFrom: row.requests_from,
  firstEntryAt: row.first_entry_at,
  lastEntryAt: row.last_entry_at,
});

const OUTSIDE_COLUMNS = "id, site_id, form, ref, sent_name, name, listed, requests_from, first_entry_at, last_entry_at";

/** The workspace's sites, the newest entry first, then the newest made. */
export async function listFormSites(db: Db, tenantId: TenantId): Promise<FormSiteRead[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("form_sites")
    .select("id, name, host, first_entry_at, last_entry_at, test_at, created_at")
    .order("last_entry_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(SITES_MAX);
  if (error) throw new DbFailure(error, "form_sites");
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    host: row.host,
    firstEntryAt: row.first_entry_at,
    lastEntryAt: row.last_entry_at,
    testAt: row.test_at,
    createdAt: row.created_at,
  }));
}

/** The workspace's forms owned elsewhere, listed and hidden, the newest entry first. */
export async function listOutsideForms(db: Db, tenantId: TenantId): Promise<OutsideFormRead[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("outside_forms")
    .select(OUTSIDE_COLUMNS)
    .order("last_entry_at", { ascending: false, nullsFirst: false })
    .limit(OUTSIDE_FORMS_MAX);
  if (error) throw new DbFailure(error, "outside_forms");
  return data.map(outsideFormOf);
}

/** One form owned elsewhere, or null where the workspace has none by that id. */
export async function findOutsideForm(db: Db, tenantId: TenantId, formId: string): Promise<OutsideFormRead | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("outside_forms")
    .select(OUTSIDE_COLUMNS)
    .eq("id", formId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "outside_forms");
  return data ? outsideFormOf(data) : null;
}

/** An entry of a form owned elsewhere, as its sheet lists it: one held for a look (00726) says so, and why. */
export interface OutsideEntryRead {
  id: string;
  contactId: ContactId | null;
  createdAt: string;
  answers: Json;
  held: boolean;
  /** Why it is held, as the database keeps the word; null for one that is not. */
  heldWhy: string | null;
}

/** A form's newest entries, at most `limit`: never a test, which names no form. */
export async function listOutsideFormEntries(
  db: Db,
  listed: { tenantId: TenantId; formId: string; limit: number },
): Promise<OutsideEntryRead[]> {
  const { data, error } = await tenantDb(db, listed.tenantId)
    .from("form_entries")
    .select("id, contact_id, created_at, answers, state, held_why")
    .eq("outside_form_id", listed.formId)
    .order("created_at", { ascending: false })
    .limit(listed.limit);
  if (error) throw new DbFailure(error, "form_entries");
  return data.map((row) => ({
    id: row.id,
    contactId: row.contact_id ? heldContactId(row.contact_id) : null,
    createdAt: row.created_at,
    answers: row.answers,
    held: row.state === "held",
    heldWhy: row.held_why,
  }));
}

/** How many requests nobody has answered, counted whole (form_requests_open_count): what Needs you and Today say. */
export async function countOpenFormRequests(db: Db, tenantId: TenantId): Promise<number> {
  const { data, error } = await db.rpc("form_requests_open_count", { p_tenant_id: tenantId });
  if (error) throw new DbFailure(error, "form_requests_open_count");
  return typeof data === "number" && data > 0 ? data : 0;
}

/** The owner's own name for a form owned elsewhere, on their client (blank: the name its site sends). */
export async function renameOutsideForm(
  db: Db,
  renamed: { tenantId: TenantId; formId: string; name: string },
): Promise<boolean> {
  const { data, error } = await db.rpc("outside_form_rename", {
    p_tenant_id: renamed.tenantId,
    p_form_id: renamed.formId,
    p_name: renamed.name,
  });
  if (error) throw new DbFailure(error, "outside_form_rename");
  return data === true;
}

/** A form owned elsewhere listed or hidden, on the member's client: hidden never stops its entries. */
export async function setOutsideFormListed(
  db: Db,
  set: { tenantId: TenantId; formId: string; listed: boolean },
): Promise<boolean> {
  const { data, error } = await db.rpc("outside_form_listed", {
    p_tenant_id: set.tenantId,
    p_form_id: set.formId,
    p_listed: set.listed,
  });
  if (error) throw new DbFailure(error, "outside_form_listed");
  return data === true;
}
