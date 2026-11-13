/** Control plane: config. */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  openToCustomersOf,
  type BillingMode,
  type BillingStatus,
  type OpenToCustomers,
  type SchemaSet,
  recordOrEmpty,
  DbFailure,
} from "@chanlytics/contracts";
import type { Database, Json } from "../../../types";
import { isMissingDoor } from "../../../shared/missing-door";
import { jsonCopyOf } from "../../../shared/json";
import type { TenantId, ContactId } from "@chanlytics/contracts";

export type Db = SupabaseClient<Database>;

export interface TenantConfigRow {
  tenant_id: TenantId;
  config: unknown;
  version: number;
  updated_at: string;
  /** Who last wrote it; null for rows written before 00085 kept track, and for the platform's own writes. */
  updated_by?: string | null;
}

export async function getTenantConfig(db: Db, tenantId: TenantId): Promise<TenantConfigRow | null> {
  const { data, error } = await db
    .from("tenant_config")
    .select("tenant_id, config, version, updated_at, updated_by")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "getTenantConfig");
  return data;
}

/**
 * The configuration row on a member's session. The calendar feed's address in it grants read access to the owner's
 * calendar, so from 00366 only the owner reads the table; every other member reads the row through tenant_config_read
 * (00365), which masks the address and says so (`feed_hidden`). The table is asked first, so the owner's read, and
 * every read on a database before 00366, is the one query it always was; the door is asked only where the table
 * answered nothing: no row, not a member, or a member who is not the owner. Null: no row, or not a member. A database
 * before 00365 has no door (PGRST202), and the table's answer stands. `feed_hidden`: the feed's address in the row is
 * masked.
 */
export async function getTenantConfigAsMember(
  db: Db,
  tenantId: TenantId,
): Promise<(TenantConfigRow & { feed_hidden: boolean }) | null> {
  const row = await getTenantConfig(db, tenantId);
  if (row) return { ...row, feed_hidden: false };
  const { data, error } = await db.rpc("tenant_config_read", { p_tenant_id: tenantId }).maybeSingle();
  if (error && isMissingDoor(error)) return null;
  if (error) throw new DbFailure(error, "getTenantConfigAsMember");
  return data;
}

export type PutTenantConfigResult =
  | { ok: true; row: TenantConfigRow }
  /** Someone else saved between the read and the write. A real conflict. */
  | { ok: false; reason: "stale" }
  /** There is no config row at all — this workspace was never provisioned.
   *  NOT a conflict, and telling the owner to "reload and reapply" sends them
   *  round a loop that cannot terminate. */
  | { ok: false; reason: "missing" };

/**
 * Optimistic-concurrency write: the caller sends back the version it read.
 *
 * Returns WHY it failed, because zero rows updated has two very different
 * causes and the route used to report both as "someone else saved settings
 * after you loaded them". For a tenant with no config row that sentence is
 * false in every particular — nobody saved anything, no colleague exists, and
 * reloading changes nothing.
 *
 * Zero rows has a third cause from 00366: an update reads the row it changes, and only the owner reads the table, so a
 * partner's update finds nothing. So zero rows asks tenant_config_write (00365), a session's versioned write under the
 * permission the table's update policy names, recorded as the caller's: it writes the row where it can, and says
 * stale or missing where it cannot. A database before 00365 has no door, and the row is looked for as it always was.
 */
export async function putTenantConfig(
  db: Db,
  tenantId: TenantId,
  config: unknown,
  expectedVersion: number,
  /** Who wrote it. This config IS what customers hear, so the row records its author (00085). The door records the
   *  caller, who is this person on every session that writes it. */
  updatedBy?: string | null,
): Promise<PutTenantConfigResult> {
  const { data, error } = await db
    .from("tenant_config")
    .update({
      config: jsonCopyOf(config),
      version: expectedVersion + 1,
      ...(updatedBy ? { updated_by: updatedBy } : {}),
    })
    .eq("tenant_id", tenantId)
    .eq("version", expectedVersion)
    .select("tenant_id, config, version, updated_at, updated_by")
    .maybeSingle();
  if (error) throw new DbFailure(error, "putTenantConfig");
  if (data) return { ok: true, row: data };

  // Zero rows: the door writes what the table would not show this member, and tells an absent row from a losing race.
  const door = await db
    .rpc("tenant_config_write", { p_tenant_id: tenantId, p_config: jsonCopyOf(config), p_version: expectedVersion })
    .maybeSingle();
  if (!door.error) {
    const w = door.data;
    if (w?.outcome === "saved")
      return {
        ok: true,
        row: { tenant_id: tenantId, config, version: w.version, updated_at: w.updated_at, updated_by: w.updated_by },
      };
    if (w?.outcome === "stale" || w?.outcome === "missing") return { ok: false, reason: w.outcome };
    throw new Error("putTenantConfig: the door answered without an outcome");
  }
  if (!isMissingDoor(door.error)) throw new DbFailure(door.error, "putTenantConfig");
  // Before 00365. Distinguish an absent row from a losing race — one query, only on the failure path.
  const existing = await getTenantConfig(db, tenantId);
  return { ok: false, reason: existing ? "stale" : "missing" };
}

/**
 * Stamp a workspace's calendar as having had its first read kept (00419, tenant_config.calendar_feed_kept_at), when
 * appointments_feed_sync answered `first` to the hourly sweep: the next read's additions are no first read, even when this
 * one named nothing. Once per workspace (a stamp already there is left). A write that fails throws.
 */
export async function markCalendarFeedKept(db: Db, tenantId: TenantId, now: Date): Promise<void> {
  const { error } = await db
    .from("tenant_config")
    .update({ calendar_feed_kept_at: now.toISOString() })
    .eq("tenant_id", tenantId)
    .is("calendar_feed_kept_at", null);
  if (error) throw new DbFailure(error, "stamping the calendar's first read");
}

export interface PolicyRecord {
  id: string;
  class: string;
  mode: string;
  subject_type: string | null;
  subject_id: string | null;
  limits: unknown;
  updated_at: string;
}

/** Workspace-level rows only (subject IS NULL) — guardrail rows arrive with
 *  the People slice and get their own accessor then. */
export async function listPolicies(db: Db, tenantId: TenantId): Promise<PolicyRecord[]> {
  const { data, error } = await db
    .from("policies")
    .select("id, class, mode, subject_type, subject_id, limits, updated_at")
    .eq("tenant_id", tenantId)
    .is("subject_type", null)
    .order("class");
  if (error) throw new DbFailure(error, "listPolicies");
  return data ?? [];
}

/**
 * A change to a workspace's own policy row for a class, as the database's one write (policy_change, 00624): the mode
 * when one is given, the dials merged where they are kept, and the change's row on the ledger with it. It was a read,
 * a merge here and a write, so two saves at once lost one's dial, and a dial alone wrote back the mode it had read.
 * Each part of the change is said, none assumed:
 *
 * - `mode`: the mode to write, or null, and the row keeps its own, whatever it is when the write lands.
 * - `limits`: the dials to set, merged into the limits on file and never replacing them. `limits` holds several
 *   unrelated settings for one class (a reply row carries both max_replies_day and reply_delay_ms), so a caller sets
 *   what it means and the rest stays. None is `{}`.
 * - `via`: the card the change came by (the ledger's `via`), or null for a form.
 *
 * Answers the row as it stands, or null where the workspace has no row for the class.
 */
export async function savePolicyChange(
  db: Db,
  tenantId: TenantId,
  policyClass: SchemaSet<"policies.class">,
  change: { mode: SchemaSet<"policies.mode"> | null; limits: Record<string, unknown>; via: string | null },
): Promise<PolicyRecord | null> {
  const { data, error } = await db
    .rpc("policy_change", {
      p_tenant_id: tenantId,
      p_class: policyClass,
      p_limits: jsonCopyOf(change.limits),
      ...(change.mode ? { p_mode: change.mode } : {}),
      ...(change.via ? { p_via: change.via } : {}),
    })
    .maybeSingle();
  // The money-lock trigger raises here, and the door refuses whoever may not: said as the database said it, the route maps it.
  if (error) throw new DbFailure(error, "savePolicyChange");
  if (!data) return null;
  return {
    id: data.id,
    class: data.class,
    mode: data.mode,
    subject_type: data.subject_type,
    subject_id: data.subject_id,
    limits: data.limits,
    updated_at: data.updated_at,
  };
}

/* ------------------------- receptionist mode per person ------------------- */

/**
 * The receptionist mode set for ONE person, or null to follow the workspace.
 *
 * Read by the edge once per inbound message — a single lookup on the unique
 * key, never cached. The whole point of "Never" for a difficult customer is
 * that it applies to their NEXT message, not to one sixty seconds later.
 */
export async function findPersonReplyMode(db: Db, tenantId: TenantId, contactId: ContactId): Promise<string | null> {
  const { data, error } = await db
    .from("policies")
    .select("mode")
    .eq("tenant_id", tenantId)
    .eq("class", "reply")
    .eq("subject_type", "contact")
    .eq("subject_id", contactId)
    .maybeSingle();
  if (error) throw new DbFailure(error);
  return data?.mode ?? null;
}

/** How many people's ids one read of their modes carries: the URL's own limit, as the readers that page by id keep it. */
const MODE_IDS_AT_ONCE = 200;

/**
 * The receptionist mode set for each of these people, by their id; one who follows the workspace has none (absent).
 * What a card for many reads before it is proposed, so it says who already has the mode asked (Ask's bulk mode).
 */
export async function getPersonReplyModes(
  db: Db,
  tenantId: TenantId,
  contactIds: readonly ContactId[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let index = 0; index < contactIds.length; index += MODE_IDS_AT_ONCE) {
    const { data, error } = await db
      .from("policies")
      .select("subject_id, mode")
      .eq("tenant_id", tenantId)
      .eq("class", "reply")
      .eq("subject_type", "contact")
      .in("subject_id", contactIds.slice(index, index + MODE_IDS_AT_ONCE));
    if (error) throw new DbFailure(error);
    for (const r of data ?? []) if (r.subject_id) out.set(r.subject_id, r.mode);
  }
  return out;
}

/** How many replies' usage one read takes (PostgREST's page), and how many at most: a week of a busy workspace. */
const USAGE_PAGE = 1000;

const USAGE_CAP = 5000;

/**
 * How many replies the receptionist wrote from `since` to `until`, and their model tokens in and out: the usage events every reply
 * writes (usage.llm_tokens), which the day's budget counts (limits.max_llm_tokens_day), so a budget can be said in the
 * replies it buys at this workspace's own size of reply. The newest first, at most USAGE_CAP of them: an average of the
 * newest five thousand is the average. A read that fails THROWS.
 */
export async function replyTokensSince(
  db: Db,
  tenantId: TenantId,
  since: string,
  until: string,
): Promise<{ replies: number; tokens: number }> {
  let replies = 0;
  let tokens = 0;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  for (let from = 0; from < USAGE_CAP; from += USAGE_PAGE) {
    const { data, error } = await db
      .from("events")
      .select("data")
      .eq("tenant_id", tenantId)
      .eq("kind", "usage.llm_tokens")
      .gte("created_at", since)
      .lte("created_at", until)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + USAGE_PAGE - 1);
    if (error) throw new DbFailure(error, "replyTokensSince");
    for (const r of data ?? []) {
      const d = recordOrEmpty(r.data);
      replies += 1;
      tokens += n(d.input_tokens) + n(d.output_tokens);
    }
    if ((data ?? []).length < USAGE_PAGE) break;
  }
  return { replies, tokens };
}

/** How many people's own modes one read takes: PostgREST's page. */
const OWN_MODES_PAGE = 1000;

/**
 * Every person in the workspace whose receptionist has a mode of their own, the newest change first: their id and the
 * mode (Settings › Autonomy says how many, and opens them). Read a page at a time to the end: a count that stopped at a
 * page would say fewer people than are set. A merge moves a person's row and an erasure deletes it, so every row is a
 * person. A read that fails THROWS: a count the database could not answer is never none.
 */
export async function listPeopleOnTheirOwnMode(
  db: Db,
  tenantId: TenantId,
): Promise<Array<{ id: string; mode: string }>> {
  const out: Array<{ id: string; mode: string }> = [];
  for (let from = 0; ; from += OWN_MODES_PAGE) {
    const { data, error } = await db
      .from("policies")
      .select("subject_id, mode")
      .eq("tenant_id", tenantId)
      .eq("class", "reply")
      .eq("subject_type", "contact")
      .order("updated_at", { ascending: false })
      .order("id")
      .range(from, from + OWN_MODES_PAGE - 1);
    if (error) throw new DbFailure(error, "listPeopleOnTheirOwnMode");
    for (const r of data ?? []) if (r.subject_id) out.push({ id: r.subject_id, mode: r.mode });
    if ((data ?? []).length < OWN_MODES_PAGE) return out;
  }
}

/**
 * Set or clear one person's receptionist mode. `null` removes the row, so the
 * person follows the workspace policy again. Insert and delete are owner-only
 * under RLS (00029); a forbidden insert raises, and the route decides the
 * role before getting here. Answers the mode the person had before this write, null when they followed the workspace
 * policy: what an undo puts back (the row a delete took, or the row as it was read just before it was replaced).
 */
export async function setPersonReplyMode(
  db: Db,
  tenantId: TenantId,
  contactId: ContactId,
  mode: SchemaSet<"policies.mode"> | null,
): Promise<string | null> {
  if (mode === null) {
    const { data, error } = await db
      .from("policies")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("class", "reply")
      .eq("subject_type", "contact")
      .eq("subject_id", contactId)
      .select("mode");
    if (error) throw new DbFailure(error);
    return data?.[0]?.mode ?? null;
  }
  const { data: was, error: readError } = await db
    .from("policies")
    .select("mode")
    .eq("tenant_id", tenantId)
    .eq("class", "reply")
    .eq("subject_type", "contact")
    .eq("subject_id", contactId)
    .maybeSingle();
  if (readError) throw new DbFailure(readError);
  const { error } = await db
    .from("policies")
    .upsert(
      { tenant_id: tenantId, class: "reply", mode, subject_type: "contact", subject_id: contactId },
      { onConflict: "tenant_id,class,subject_type,subject_id" },
    );
  if (error) throw new DbFailure(error);
  return was?.mode ?? null;
}

/** A workspace's standing toward its customers (contracts openToCustomersOf), with the plan it was judged by. */
export interface OpenToCustomersRead {
  open: OpenToCustomers;
  billing: { mode: BillingMode; status: BillingStatus } | null;
}

/** The plan as the one rule reads it: null for no billing row. */
const billingPlanOf = (row: { mode: string; status: string } | null): OpenToCustomersRead["billing"] =>
  row ? { mode: row.mode as BillingMode, status: row.status as BillingStatus } : null;

/**
 * Whether a workspace is open to its customers right now, by contracts' one rule: not while it is paused (tenants.status:
 * billing stopped it, or a person did), not once its last member has left (ended, 00262: left_empty_at), and not while a
 * plan billed through Stripe is in a state that stops the receptionist. A read that fails throws: "we could not check"
 * is not "yes".
 */
export async function isWorkspaceOpenToCustomers(db: Db, tenantId: TenantId): Promise<OpenToCustomersRead> {
  const [tenant, billing] = await Promise.all([
    db.from("tenants").select("status, left_empty_at").eq("id", tenantId).maybeSingle(),
    db.from("billing_accounts").select("mode, status").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (tenant.error) throw new DbFailure(tenant.error, "cannot read the workspace");
  if (billing.error) throw new DbFailure(billing.error, "cannot read the workspace's billing");
  const plan = billingPlanOf(billing.data);
  return {
    open: openToCustomersOf({
      paused: tenant.data?.status === "paused",
      ended: !!tenant.data?.left_empty_at,
      billing: plan,
    }),
    billing: plan,
  };
}

/**
 * Whether the receptionist may speak under the business's name on its own right now, with nobody reading it first (a
 * public reply): only while the workspace is open to its customers (isWorkspaceOpenToCustomers). A read that fails throws.
 */
export async function doesWorkspaceAnswerOnItsOwn(db: Db, tenantId: TenantId): Promise<boolean> {
  return (await isWorkspaceOpenToCustomers(db, tenantId)).open === "open";
}

/** The business on record as a public page may show it: never the EIN, the contact's own phone or their names. */
const PUBLIC_RECORD_COLUMNS =
  "legal_name, trade_name, street, street_secondary, city, region, postal_code, country, contact_email, website_url, about, industry";

/** The one load's read of the record: its type is what the select reads, which the dashboard's type test holds. */
const publicRecordOf = (db: Db, tenantId: TenantId) =>
  db.from("business_records").select(PUBLIC_RECORD_COLUMNS).eq("tenant_id", tenantId).maybeSingle();

type PublicRecordRead = NonNullable<Awaited<ReturnType<typeof publicRecordOf>>["data"]>;

/** One workspace's public facts, read by its slug for the pages that have no session (the dashboard's server/public). */
export interface PublicWorkspaceRead {
  id: string;
  name: string;
  slug: string;
  status: string;
  open: OpenToCustomers;
  /**
   * The record's public columns, as the select reads them: exactly those contracts lets the page show (the dashboard's
   * server/public/facts.type-test.ts holds it).
   */
  record: PublicRecordRead | null;
  /**
   * The business on record has no tax id: one person, filed as a sole proprietor, whose street the page leaves off
   * (00439 sole_proprietor_of; the wiring's second audit, X4-5). False with nothing on record. The tax id is never read.
   */
  soleProprietor: boolean;
  config: Json | null;
  channels: { kind: string; number_e164: string | null }[];
}

/**
 * Everything a workspace's public pages show, in one load (the wiring's second audit, X4-7): the workspace, its standing
 * toward its customers, the business on record (its public columns), its configuration (for the services it lists), and
 * its active channels, oldest first so a workspace with two numbers of a kind names the one Connections shows. Null when
 * no workspace answers to the slug. EVERY read that fails throws: a page that cannot read a fact is a failed page, never
 * a page with Chanlytics' own policy links or no phone.
 *
 * Cross-workspace: the public pages resolve one workspace by slug, with the service role, and read only its public facts.
 */
export async function findPublicWorkspaceBySlug(db: Db, slug: string): Promise<PublicWorkspaceRead | null> {
  const rows = await db.from("tenants").select("id, name, slug, status, left_empty_at").eq("slug", slug).maybeSingle();
  if (rows.error) throw new DbFailure(rows.error, "reading the workspace");
  if (!rows.data) return null;
  const id = rows.data.id;
  const [billing, record, sole, cfg, channels] = await Promise.all([
    db.from("billing_accounts").select("mode, status").eq("tenant_id", id).maybeSingle(),
    publicRecordOf(db, id),
    db.rpc("sole_proprietor_of", { p_tenant_id: id }),
    db.from("tenant_config").select("config").eq("tenant_id", id).maybeSingle(),
    db
      .from("tenant_channels")
      .select("kind, number_e164")
      .eq("tenant_id", id)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
  ]);
  if (billing.error) throw new DbFailure(billing.error, "reading the workspace's billing");
  if (record.error) throw new DbFailure(record.error, "reading the business on record");
  if (sole.error) throw new DbFailure(sole.error, "reading whether the business is a sole proprietor");
  if (cfg.error) throw new DbFailure(cfg.error, "reading the workspace's configuration");
  if (channels.error) throw new DbFailure(channels.error, "reading the workspace's channels");
  return {
    id,
    name: rows.data.name,
    slug: rows.data.slug,
    status: rows.data.status,
    open: openToCustomersOf({
      paused: rows.data.status === "paused",
      ended: !!rows.data.left_empty_at,
      billing: billingPlanOf(billing.data),
    }),
    record: record.data ?? null,
    soleProprietor: sole.data === true,
    config: cfg.data?.config ?? null,
    channels: channels.data ?? [],
  };
}

/** What the first run chose for the workspace, as setup_choices keeps it (00513): read whole, its shapes contracts'. */
export interface SetupChoicesRow {
  phone: Json | null;
  whatsapp: string | null;
  marks: string[];
  version: number;
}

/** The workspace's setup choices, or null before anything was chosen. RLS decides on a member's session. Throws on a failed read. */
export async function setupChoicesOf(db: Db, tenantId: TenantId): Promise<SetupChoicesRow | null> {
  const { data, error } = await db
    .from("setup_choices")
    .select("phone, whatsapp, marks, version")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "cannot read the setup choices");
  return data ? { phone: data.phone, whatsapp: data.whatsapp, marks: data.marks ?? [], version: data.version } : null;
}
