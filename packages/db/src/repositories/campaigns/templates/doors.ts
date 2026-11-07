/**
 * A template's own row as the member changes it (decision 0111): hidden or shown, retitled through its doors, and what
 * still runs on it before it may go. Each answer is the database's as it came; the caller says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../database.types";

type Db = SupabaseClient<Database>;

/** A template hidden from the composers, or shown (set_template_hidden). */
export const setTemplateHidden = async (db: Db, templateId: string, hidden: boolean) =>
  db.rpc("set_template_hidden", { p_template_id: templateId, p_hidden: hidden });

/** A template's title in the workspace's words (set_template_title). */
export const setTemplateTitle = async (db: Db, templateId: string, title: string) =>
  db.rpc("set_template_title", { p_template_id: templateId, p_title: title });

/** How many of the workspace's runs on a template are scheduled or sending. */
export const countLiveRunsOfTemplate = async (db: Db, tenantId: string, key: { name: string; language: string }) =>
  db
    .from("sequence_batches")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("template_name", key.name)
    .eq("template_language", key.language)
    .in("state", ["scheduled", "sending"]);

/** The workspace's running steps that send a template. */
export const listRunningStepsOfTemplate = async (db: Db, tenantId: string, key: { name: string; language: string }) =>
  db
    .from("sequence_steps")
    .select("name")
    .eq("tenant_id", tenantId)
    .eq("template_name", key.name)
    .eq("template_language", key.language)
    .eq("state", "running");
