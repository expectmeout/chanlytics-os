/**
 * A workspace's own message templates, as Meta last told us about them, and the email and text versions of a message
 * a member writes beside them.
 *
 * WhatsApp's rows are the edge's: its admin doors own creating, syncing and deleting them, because that is where the
 * number's credentials live. What is read here is the one question the rest of the product asks -- which templates may
 * this workspace send, right now -- so that no caller has to name one by a literal again. An email or a text version
 * (00296) is written and removed through the two doors below, on the member's own session: a member may only read the
 * table, and the doors say who may write it and which rows. The one write Meta's webhook makes between two syncs is here
 * too: a WhatsApp template's quality, as Meta just said it (setTemplateQuality). A message's rows, on whatever channel,
 * are read once (messageVersionRowsOf) for contracts' campaignMessageOf to pick its versions out of.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isReachOutRow,
  type CampaignMessageRow,
  type Holds,
  type OwnVersionChannel,
  type Within,
} from "@chanlytics/contracts";
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

/** A template as the code that chooses what to SEND reads it: the row, and the components Meta holds for it. */
export interface TemplateToSend extends TemplateRow {
  /** Meta's component array: what makes a message one this product cannot send whole (contracts templateBlocked). */
  components: unknown;
}

/**
 * A template row as a message is read from it, whatever its channel: the columns contracts' campaignMessageOf picks the
 * versions out of (the status and category, the slots, the title, a refusal's words, the components a WhatsApp row is
 * judged by) and the ones a page draws a version from (the words an email or a text holds, and who wrote it).
 */
export interface MessageVersionRow {
  id: string;
  channel: string;
  name: string;
  language: string;
  meta_status: string;
  category: string | null;
  variables: unknown;
  hidden_at: string | null;
  title: string | null;
  source: string;
  components: unknown;
  body_preview: string | null;
  rejected_reason: string | null;
}

// A caller hands these rows to campaignMessageOf as they are, with no mapping: the compiler holds the two shapes together.
type _MessageVersionRowIsACampaignMessageRow = Holds<Within<MessageVersionRow, CampaignMessageRow>>;

/**
 * Every template this workspace holds on a channel, or on every channel when `channel` is null: the rows of all its
 * messages' versions, each with its id and channel so that contracts' campaignMessagesOf can pick the messages out of them
 * (a message with no WhatsApp row among them).
 *
 * A read that fails THROWS. "We could not read the templates" is not "this
 * workspace has none": the second is an answer a caller can be told, and
 * telling them it when we simply could not look is how a working feature reads
 * as a missing one.
 */
export async function templatesFor(
  db: Db,
  tenantId: string,
  channel: string | null = "whatsapp",
): Promise<Array<TemplateRow & Pick<MessageVersionRow, "id" | "channel">>> {
  const ofTenant = db
    .from("templates")
    .select("id, channel, name, language, category, meta_status, body_preview, title, variables")
    .eq("tenant_id", tenantId);
  const { data, error } = await (channel === null ? ofTenant : ofTenant.eq("channel", channel));
  if (error) throw new Error(`templatesFor: ${error.message}`);
  return data ?? [];
}

/**
 * Every template this workspace holds on a channel, with the components Meta holds for each: for the caller that
 * chooses one to send (the receptionist's booking link), which must not choose a message WhatsApp will refuse
 * (contracts bookingTemplate, templateBlocked). `templatesFor` stays the lighter read, for those that only need the
 * row's own columns. A read that fails THROWS, as it does.
 */
export async function templatesToSend(db: Db, tenantId: string, channel = "whatsapp"): Promise<TemplateToSend[]> {
  const { data, error } = await db
    .from("templates")
    .select("name, language, category, meta_status, body_preview, title, variables, components")
    .eq("tenant_id", tenantId)
    .eq("channel", channel);
  if (error) throw new Error(`templatesToSend: ${error.message}`);
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

/** The name and language of the message a version of this workspace's is, or null when it holds no version of that id. */
async function messageOfVersion(
  db: Db,
  tenantId: string,
  id: string,
): Promise<{ name: string; language: string } | null> {
  const { data, error } = await db
    .from("templates")
    .select("name, language")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`messageVersionRowsOf: ${error.message}`);
  return data;
}

const MESSAGE_COLUMNS =
  "id, channel, name, language, meta_status, category, variables, hidden_at, title, source, components, body_preview, rejected_reason";

/**
 * Every row of one message, whatever its channel: the rows of this workspace that share its name and language, which are
 * its versions on WhatsApp, email and text (and any other channel a row of that name sits on; contracts campaignMessageOf
 * picks the versions out of them). The message is named by one of its versions' ids, which answers its siblings and the
 * version itself, or by its name and language. An id the workspace does not hold is no message: `[]`. So is a reach-out's
 * email (contracts isReachOutRow), which is filed under a name of its own and belongs to no message. A read that fails
 * THROWS, as `templatesFor` does.
 */
export async function messageVersionRowsOf(
  db: Db,
  tenantId: string,
  by: { id: string } | { name: string; language: string },
): Promise<MessageVersionRow[]> {
  const message = "id" in by ? await messageOfVersion(db, tenantId, by.id) : by;
  if (message === null || isReachOutRow(message)) return [];
  const { data, error } = await db
    .from("templates")
    .select(MESSAGE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("name", message.name)
    .eq("language", message.language);
  if (error) throw new Error(`messageVersionRowsOf: ${error.message}`);
  return data ?? [];
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
 * Write, or rewrite, a message's email or text version (save_template_version, 00296). The words are already checked
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

/** Remove an email or text version a member wrote (remove_template_version, 00296); never a WhatsApp template. */
export async function removeTemplateVersion(db: Db, templateId: string): Promise<VersionDoor> {
  const { data, error } = await db.rpc("remove_template_version", { p_template_id: templateId });
  if (error) return { ok: false, error: { code: error.code ?? null, message: error.message } };
  const version = versionRefOf(data);
  if (!version) throw new Error("removeTemplateVersion: the door answered without the version it removed");
  return { ok: true, version };
}

/** The id of the WhatsApp template this workspace already holds under a name and a language, or null when none. */
export async function templateIdOf(db: Db, tenantId: string, name: string, language: string): Promise<string | null> {
  const { data, error } = await db
    .from("templates")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .eq("name", name)
    .eq("language", language)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

/** The WhatsApp templates this workspace holds under any of these names, with where each stands at Meta. */
export async function templatesNamed(
  db: Db,
  tenantId: string,
  names: string[],
): Promise<{ name: string; language: string; meta_status: string | null }[]> {
  const { data, error } = await db
    .from("templates")
    .select("name, language, meta_status")
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .in("name", names);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Where one WhatsApp template stands at Meta, by name and language; null when the workspace holds none. */
export async function templateStatusOf(
  db: Db,
  tenantId: string,
  name: string,
  language: string,
): Promise<{ meta_status: string | null } | null> {
  const { data } = await db
    .from("templates")
    .select("meta_status")
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .eq("name", name)
    .eq("language", language)
    .maybeSingle();
  return data;
}

/**
 * A WhatsApp template's quality, as Meta just reported it (message_template_quality_update): set on the row the sync
 * keeps for that name and language in this workspace, and nothing else on it. A template the workspace holds no row for
 * is no write at all; the next sync creates it. A write that fails THROWS, and the webhook that calls it
 * (apps/edge/lib/whatsapp/waba-events.ts) carries on without the new word.
 */
export async function setTemplateQuality(
  db: Db,
  p: { tenantId: string; name: string; language: string; quality: string },
): Promise<void> {
  const { error } = await db
    .from("templates")
    .update({ quality: p.quality })
    .eq("tenant_id", p.tenantId)
    .eq("channel", "whatsapp")
    .eq("name", p.name)
    .eq("language", p.language);
  if (error) throw new Error(`setTemplateQuality: ${error.message}`);
}
