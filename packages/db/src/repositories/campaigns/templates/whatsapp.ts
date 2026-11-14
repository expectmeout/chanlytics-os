/**
 * A workspace's WhatsApp templates as the edge files, syncs and hears of them from Meta (decision 0111): saved one a
 * (channel, name, language), read, deleted, and their status and category as Meta's events say. Each answer is the
 * database's as it came; the caller says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../types";
import { tenantDb } from "../../../shared/tenant-db";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;
type TemplateInsert = Database["public"]["Tables"]["templates"]["Insert"];
type TemplateUpdate = Database["public"]["Tables"]["templates"]["Update"];

/** A template's key: one a (workspace, channel, name, language). */
const TEMPLATE_KEY = "tenant_id,channel,name,language";

/** One template saved over its key, its id back. */
export const saveTemplateRow = async (db: Db, tenantId: TenantId, row: TemplateInsert) =>
  tenantDb(db, tenantId).from("templates").upsert(row, { onConflict: TEMPLATE_KEY }).select("id").single();

/** Templates saved, each over its key. */
export const saveTemplateRows = async (db: Db, tenantId: TenantId, rows: TemplateInsert[]) =>
  tenantDb(db, tenantId).from("templates").upsert(rows, { onConflict: TEMPLATE_KEY });

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
 * A WhatsApp template's words changed here and sent back to Meta: its words, its values and its components, and in review
 * again, any refusal's reason gone with the words it was about. Meta's answer moves it on (waba-events).
 */
export const keepTemplateWords = async (
  db: Db,
  tenantId: TenantId,
  templateId: string,
  words: Required<Pick<TemplateUpdate, "components" | "body_preview" | "variables">>,
) =>
  db
    .from("templates")
    .update({ ...words, meta_status: "pending", rejected_reason: null, synced_at: new Date().toISOString() })
    .eq("id", templateId)
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .select("id")
    .maybeSingle();

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

/** One of the workspace's templates deleted. */
export const deleteTemplateRow = async (db: Db, tenantId: TenantId, templateId: string) =>
  db.from("templates").delete().eq("id", templateId).eq("tenant_id", tenantId);

/** The workspace's WhatsApp templates' keys and variables. */
export const listWhatsAppTemplateKeys = async (db: Db, tenantId: TenantId) =>
  db.from("templates").select("name, language, variables").eq("tenant_id", tenantId).eq("channel", "whatsapp");

/** One of the workspace's WhatsApp templates, by its name and language, changed. */
export const patchWhatsAppTemplate = async (
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
    .eq("language", key.language);

/** One of the workspace's WhatsApp templates, by its name and language, changed, its id back: none when there is none. */
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
    .select("id");
