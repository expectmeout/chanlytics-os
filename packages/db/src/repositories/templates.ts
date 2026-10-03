/**
 * A workspace's own message templates, as Meta last told us about them, and the email and text versions of a message
 * a member writes beside them.
 *
 * WhatsApp's rows are the edge's: its admin doors own creating, syncing and deleting them, because that is where the
 * number's credentials live. What is read here is the one question the rest of the product asks -- which templates may
 * this workspace send, right now -- so that no caller has to name one by a literal again. An email or a text version
 * (00285) is written and removed through the two doors below, on the member's own session: a member may only read the
 * table, and the doors say who may write it and which rows.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OwnVersionChannel } from "@chanlytics/contracts";
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

/** How many slots a message fills: the highest numbered one its row names, or the rows it lists. */
function slotsOf(variables: unknown): number {
  if (!Array.isArray(variables)) return 0;
  const positions = variables
    .map((v) => Number((v as { position?: unknown } | null)?.position))
    .filter(Number.isFinite);
  return Math.max(variables.length, ...positions);
}

/**
 * How many slots a message has, for the version being written in `language`: the row of its name the door
 * (save_template_version) would take them from, WhatsApp's first, then the one in this language. Null when the
 * workspace has no row of that name, which is a message that does not exist. A read that fails THROWS.
 */
export async function messageSlots(db: Db, tenantId: string, name: string, language: string): Promise<number | null> {
  const { data, error } = await db
    .from("templates")
    .select("channel, language, variables")
    .eq("tenant_id", tenantId)
    .eq("name", name);
  if (error) throw new Error(`messageSlots: ${error.message}`);
  const rows = (data ?? []).slice().sort((a, b) => {
    const wa = Number(b.channel === "whatsapp") - Number(a.channel === "whatsapp");
    return wa || Number(b.language === language) - Number(a.language === language);
  });
  const row = rows[0];
  return row ? slotsOf(row.variables) : null;
}

/** The email and text versions of these messages the workspace holds: each one's channel, name and language. */
export async function ownVersionsFiled(
  db: Db,
  tenantId: string,
  names: string[],
): Promise<Array<Pick<VersionRef, "channel" | "name" | "language">>> {
  if (names.length === 0) return [];
  const { data, error } = await db
    .from("templates")
    .select("channel, name, language")
    .eq("tenant_id", tenantId)
    .in("channel", ["email", "sms"])
    .in("name", names);
  if (error) throw new Error(`ownVersionsFiled: ${error.message}`);
  return data ?? [];
}

/** A version as the doors answer it. */
export interface VersionRef {
  id: string;
  channel: string;
  name: string;
  language: string;
}

/** A door's answer: the version, or the refusal in the database's own terms (its SQLSTATE and its words). */
type VersionDoor = { ok: true; version: VersionRef } | { ok: false; error: { code: string | null; message: string } };

function versionRefOf(data: unknown): VersionRef | null {
  const v = data as Partial<Record<keyof VersionRef, unknown>> | null;
  return v &&
    typeof v.id === "string" &&
    typeof v.channel === "string" &&
    typeof v.name === "string" &&
    typeof v.language === "string"
    ? { id: v.id, channel: v.channel, name: v.name, language: v.language }
    : null;
}

/**
 * Write, or rewrite, a message's email or text version (save_template_version, 00285). The words are already checked
 * (contracts validateOwnVersion); the door holds who may, that the message exists, and the lengths. A text takes no
 * subject. The session's own client, never the service role's: the door judges the caller.
 */
export async function saveTemplateVersion(
  db: Db,
  p: {
    tenantId: string;
    name: string;
    language: string;
    channel: OwnVersionChannel;
    subject: string | null;
    body: string;
  },
): Promise<VersionDoor> {
  const { data, error } = await db.rpc("save_template_version", {
    p_tenant_id: p.tenantId,
    p_name: p.name,
    p_language: p.language,
    p_channel: p.channel,
    p_subject: p.subject ?? "",
    p_body: p.body,
  });
  if (error) return { ok: false, error: { code: error.code ?? null, message: error.message } };
  const version = versionRefOf(data);
  if (!version) throw new Error("saveTemplateVersion: the door answered without the version it wrote");
  return { ok: true, version };
}

/** Remove an email or text version a member wrote (remove_template_version, 00285); never a WhatsApp template. */
export async function removeTemplateVersion(db: Db, templateId: string): Promise<VersionDoor> {
  const { data, error } = await db.rpc("remove_template_version", { p_template_id: templateId });
  if (error) return { ok: false, error: { code: error.code ?? null, message: error.message } };
  const version = versionRefOf(data);
  if (!version) throw new Error("removeTemplateVersion: the door answered without the version it removed");
  return { ok: true, version };
}
