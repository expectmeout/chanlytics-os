/**
 * A workspace's own message templates, as Meta last told us about them.
 *
 * Read-only, and deliberately small: the admin doors in apps/edge own creating,
 * syncing and deleting them, because that is where the number's credentials
 * live. What is here is the one question the rest of the product asks -- which
 * templates may this workspace send, right now -- so that no caller has to name
 * one by a literal again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

type Db = SupabaseClient<Database>;

/** What every reader of a template needs to decide whether it may be sent and how to fill it. */
export interface TemplateRow {
  name: string;
  language: string;
  category: string | null;
  meta_status: string | null;
  body_preview: string | null;
  title: string | null;
  variables: unknown;
}

/**
 * Every template this workspace holds on a channel.
 *
 * A read that fails THROWS. "We could not read the templates" is not "this
 * workspace has none": the second is an answer a caller can be told, and
 * telling them it when we simply could not look is how a working feature reads
 * as a missing one.
 */
export async function templatesFor(db: Db, tenantId: string, channel = "whatsapp"): Promise<TemplateRow[]> {
  const { data, error } = await db
    .from("templates")
    .select("name, language, category, meta_status, body_preview, title, variables")
    .eq("tenant_id", tenantId)
    .eq("channel", channel);
  if (error) throw new Error(`templatesFor: ${error.message}`);
  return data ?? [];
}
