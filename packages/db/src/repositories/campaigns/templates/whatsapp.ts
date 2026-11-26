/**
 * A workspace's WhatsApp templates as the edge files, syncs and hears of them from Meta (decision 0111): saved one a
 * (channel, name, language), read, deleted, and their status and category as Meta's events say. Each answer is the
 * database's as it came; the caller says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../types";
import { platformWide, tenantDb } from "../../../shared/tenant-db";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;
type TemplateInsert = Database["public"]["Tables"]["templates"]["Insert"];
type TemplateUpdate = Database["public"]["Tables"]["templates"]["Update"];

/** A template's key: one a (workspace, channel, name, language). */
const TEMPLATE_KEY = "tenant_id,channel,name,language";

/**
 * One template sent to WhatsApp, saved over its key with template.submitted and who sent it, in one transaction (00722
 * template_submitted_keep). The answer is the database's as it came: the row's id, or its error.
 */
export const saveTemplateRow = async (db: Db, tenantId: TenantId, row: TemplateInsert, by: string | null) =>
  db.rpc("template_submitted_keep", { p_tenant_id: tenantId, p_row: { ...row }, ...(by ? { p_by: by } : {}) });

/** Templates saved, each over its key. */
export const saveTemplateRows = async (db: Db, tenantId: TenantId, rows: TemplateInsert[]) =>
  tenantDb(db, tenantId).from("templates").upsert(rows, { onConflict: TEMPLATE_KEY });

/**
 * Every workspace's WhatsApp versions WhatsApp holds (Meta gave each an id) and has been checking since before `before`,
 * by their last change, the oldest first: what the six-hourly visit asks WhatsApp about again (edge
 * whatsapp/slow-reviews.ts). A sample nobody sent has no id and is not one. Across workspaces on purpose, as a sweep reads.
 */
export const listSlowReviews = async (db: Db, before: Date, limit: number) =>
  platformWide(db)
    .from("templates")
    .select("id, tenant_id, name, language, title, meta_id, updated_at")
    .eq("channel", "whatsapp")
    .eq("meta_status", "pending")
    .is("hidden_at", null)
    .not("meta_id", "is", null)
    .lt("updated_at", before.toISOString())
    .order("updated_at", { ascending: true })
    .limit(limit);

/** One of the workspace's WhatsApp templates, as a delete names it to Meta, or none. */
export const findWhatsAppTemplate = async (db: Db, tenantId: TenantId, templateId: string) =>
  db
    .from("templates")
    .select("id, name, language, meta_id")
    .eq("id", templateId)
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .maybeSingle();

/**
 * A WhatsApp template's new words kept, in review again, with template.submitted, who sent them and the approved words
 * they replace, in one transaction (00722 template_words_keep). The answer is the database's as it came: true when the
 * workspace's WhatsApp message took them.
 */
export const keepTemplateWords = async (
  db: Db,
  tenantId: TenantId,
  templateId: string,
  words: Required<Pick<TemplateUpdate, "components" | "body_preview" | "variables">>,
  told: { by: string | null; before: string | null },
) =>
  db.rpc("template_words_keep", {
    p_tenant_id: tenantId,
    p_template_id: templateId,
    p_words: { ...words },
    ...(told.by ? { p_by: told.by } : {}),
    ...(told.before ? { p_before: told.before } : {}),
  });

/**
 * Ask's new words for WhatsApp's refusal of a message, kept on the ledger (template.fix_written) on the member's own
 * session, through a door that asks who is calling (00722 template_fix_keep). The answer is the database's as it came.
 */
export const keepTemplateFix = async (
  db: Db,
  tenantId: TenantId,
  templateId: string,
  fix: { words: string; reason: string },
) =>
  db.rpc("template_fix_keep", {
    p_tenant_id: tenantId,
    p_template_id: templateId,
    p_words: fix.words,
    p_reason: fix.reason,
  });

/**
 * A WhatsApp template as a change of its words reads it: what stays (its name, language, category, footer and button),
 * whether WhatsApp holds it at all (its `meta_id`), and the words it says now, which an approved one's change replaces.
 */
export const findTemplateWords = async (db: Db, tenantId: TenantId, templateId: string) =>
  db
    .from("templates")
    .select("id, channel, name, language, category, meta_status, meta_id, body_preview, components, variables")
    .eq("id", templateId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

/**
 * The workspace's WhatsApp templates whose words are exactly `body`, each with whether WhatsApp holds it (`meta_id`) and
 * its footer's home (`components`): what its review refuses a second message for, a duplicate.
 */
export const listWhatsAppTwins = async (db: Db, tenantId: TenantId, body: string) =>
  db
    .from("templates")
    .select("id, name, title, meta_id, components")
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .eq("body_preview", body);

/**
 * A template deleted, with template.removed naming it and who deleted it, in one transaction (00722 template_remove).
 * The answer is the database's as it came: true when it was there.
 */
export const deleteTemplateRow = async (db: Db, tenantId: TenantId, templateId: string, by: string | null) =>
  db.rpc("template_remove", { p_tenant_id: tenantId, p_template_id: templateId, ...(by ? { p_by: by } : {}) });

/** The workspace's WhatsApp templates' keys and variables. */
export const listWhatsAppTemplateKeys = async (db: Db, tenantId: TenantId) =>
  db.from("templates").select("name, language, variables").eq("tenant_id", tenantId).eq("channel", "whatsapp");

/**
 * One of the workspace's WhatsApp templates, by its name and language, changed, its id and where WhatsApp has it back:
 * none when there is none.
 */
export const patchWhatsAppTemplateBack = async (
  db: Db,
  tenantId: TenantId,
  key: { name: string; language: string },
  set: TemplateUpdate,
) =>
  db
    .from("templates")
    .update(set)
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .eq("name", key.name)
    .eq("language", key.language)
    .select("id, meta_status");
