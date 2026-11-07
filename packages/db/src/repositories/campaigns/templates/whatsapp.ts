/**
 * A workspace's WhatsApp templates as the edge files, syncs and hears of them from Meta (decision 0111): saved one a
 * (channel, name, language), read, deleted, and their status and category as Meta's events say. Each answer is the
 * database's as it came; the caller says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../database.types";
import { tenantDb } from "../../../shared/tenant-db";

type Db = SupabaseClient<Database>;
type TemplateInsert = Database["public"]["Tables"]["templates"]["Insert"];
type TemplateUpdate = Database["public"]["Tables"]["templates"]["Update"];

/** A template's key: one a (workspace, channel, name, language). */
const TEMPLATE_KEY = "tenant_id,channel,name,language";

/** One template saved over its key, its id back. */
export const saveTemplateRow = (db: Db, tenantId: string, row: TemplateInsert) =>
  tenantDb(db, tenantId).from("templates").upsert(row, { onConflict: TEMPLATE_KEY }).select("id").single();

/** Templates saved, each over its key. */
export const saveTemplateRows = (db: Db, tenantId: string, rows: TemplateInsert[]) =>
  tenantDb(db, tenantId).from("templates").upsert(rows, { onConflict: TEMPLATE_KEY });

/** One of the workspace's WhatsApp templates, as a delete names it to Meta, or none. */
export const findWhatsAppTemplate = (db: Db, tenantId: string, templateId: string) =>
  db
    .from("templates")
    .select("id, name, language, meta_id")
    .eq("id", templateId)
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .maybeSingle();

/** One of the workspace's templates deleted. */
export const deleteTemplateRow = (db: Db, tenantId: string, templateId: string) =>
  db.from("templates").delete().eq("id", templateId).eq("tenant_id", tenantId);

/** The workspace's WhatsApp templates' keys and variables. */
export const listWhatsAppTemplateKeys = (db: Db, tenantId: string) =>
  db.from("templates").select("name, language, variables").eq("tenant_id", tenantId).eq("channel", "whatsapp");

/** One of the workspace's WhatsApp templates, by its name and language, changed. */
export const patchWhatsAppTemplate = (
  db: Db,
  tenantId: string,
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
export const patchWhatsAppTemplateBack = (
  db: Db,
  tenantId: string,
  key: { name: string; language: string },
  set: TemplateUpdate,
) => patchWhatsAppTemplate(db, tenantId, key, set).select("id");
