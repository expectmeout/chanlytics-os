/**
 * The workspace's own records, a section at a time, for the owner's copy (GET export; the wiring's second audit, R14 X1).
 *
 * The file held people, conversations, calls and the consent history, and the card above "Delete this workspace" called
 * it everything. These are the sections that follow them, in the order the privacy policy names the records (contracts
 * EXPORT_SECTIONS): notes and steps, deals, the business's own details, bookings, then the rest. The team is read by the
 * roster (team_roster), which alone may name a member's address.
 *
 * Read on the owner's own session, so RLS decides what the copy holds as it decides what the pages show. Each section is
 * read a page at a time by OFFSET under a fixed order that ends on a unique column (paged.ts): a row written by one
 * statement shares its timestamp with the rest, and a skipped row is worse here than a slow page. Each section names its
 * columns: the file says what it holds, and a column added for the platform's own use does not reach it unasked.
 *
 * One person's own copy (GET export?person=<id>, R14 X5) is read here too, each section filtered to them, in the same
 * columns: personExportPages.
 *
 * Workspace scope: every statement is filtered to the tenant passed in.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

type Db = SupabaseClient<Database>;

/** A page of a section: up to `limit` rows from `offset`, in the section's fixed order. */
export type ExportPage = (offset: number, limit: number) => Promise<Record<string, unknown>[]>;

/** The sections read here, by the names the file gives them (contracts EXPORT_SECTIONS). */
export interface ExportSectionPages {
  notes_and_steps: ExportPage;
  deals: ExportPage;
  business: ExportPage;
  bookings: ExportPage;
  lists: ExportPage;
  list_members: ExportPage;
  campaigns: ExportPage;
  sends: ExportPage;
  templates: ExportPage;
  holds: ExportPage;
  rules: ExportPage;
  reviews: ExportPage;
  leads: ExportPage;
  reach_out_replies: ExportPage;
}

async function sectionRows(
  q: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

/** The last row a page starting at `offset` reads, for PostgREST's inclusive range. */
const last = (offset: number, limit: number) => offset + limit - 1;

// Each section's columns, named once for the workspace's copy and for one person's (personExportPages).
const NOTE_COLUMNS =
  "id, contact_id, body, author_kind, author_user_id, for_user_id, team_only, state, source, due_on, done_at, done_by, deal_id, created_at, updated_at";
const DEAL_COLUMNS =
  "id, contact_id, lead_id, service, stage, proposed_at, decided_at, ended_at, amount_cents, per, currency, note, evidence, source, proposal_url, valid_until, lost_reason, created_by, created_at, updated_at";
const BOOKING_COLUMNS =
  "id, contact_id, lead_id, source, tool, external_id, status, starts_at, ends_at, all_day, timezone, title, service, staff, price, note, client_name, client_phone, client_email, consultation, vanished_at, created_by, created_at, updated_at";
const SEGMENT_COLUMNS = "id, name, rule, archived_at, created_by, created_at, updated_at";
const SEGMENT_MEMBER_COLUMNS = "segment_id, contact_id, added_by, added_at";
const HOLD_COLUMNS =
  "id, conversation_id, reason, details, state, resolved_by_user_id, resolved_at, created_at, updated_at";
const RULE_COLUMNS = "id, class, mode, subject_type, subject_id, limits, updated_at";
const LEAD_COLUMNS =
  "id, business_name, category, street, city, region, postal_code, country, neighborhood, phone_e164, email, website_host, instagram_url, facebook_url, linkedin_url, tiktok_url, maps_url, rating, reviews, about, price, stage, closed_reason, last_outcome, last_note, contacted_at, booked_at, converted_at, contact_id, found_at";
const REPLY_COLUMNS =
  "message_id, conversation_id, contact_id, lead_id, intent, claim, summary, named_day, refer_to, until_at, draft, draft_state, signer_name, signer_title, read_at, undone_at";

/** The first half: the records the privacy policy names first, up to the campaigns. */
function recordSections(
  db: Db,
  tenantId: string,
): Pick<
  ExportSectionPages,
  "notes_and_steps" | "deals" | "business" | "bookings" | "lists" | "list_members" | "campaigns"
> {
  return {
    // The notes kept and suggested, and the steps with their due day and who did them.
    notes_and_steps: (offset, limit) =>
      sectionRows(
        db
          .from("person_notes")
          .select(NOTE_COLUMNS)
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, last(offset, limit)),
      ),
    deals: (offset, limit) =>
      sectionRows(
        db
          .from("deals")
          .select(DEAL_COLUMNS)
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, last(offset, limit)),
      ),
    // The business's own details as saved: its facts, hours and services, what the receptionist may say, its alerts, its
    // calendar and its booking tool. One row.
    business: async (offset) =>
      offset > 0
        ? []
        : sectionRows(db.from("tenant_config").select("config, updated_at, updated_by").eq("tenant_id", tenantId)),
    bookings: (offset, limit) =>
      sectionRows(
        db
          .from("appointments")
          .select(BOOKING_COLUMNS)
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, last(offset, limit)),
      ),
    lists: (offset, limit) =>
      sectionRows(
        db
          .from("segments")
          .select(SEGMENT_COLUMNS)
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, last(offset, limit)),
      ),
    // Who is on each list kept by hand (a list with a rule is its rule, in lists).
    list_members: (offset, limit) =>
      sectionRows(
        db
          .from("segment_members")
          .select(SEGMENT_MEMBER_COLUMNS)
          .eq("tenant_id", tenantId)
          .order("segment_id", { ascending: true })
          .order("contact_id", { ascending: true })
          .range(offset, last(offset, limit)),
      ),
    campaigns: (offset, limit) =>
      sectionRows(
        db
          .from("playbooks")
          .select(
            "id, name, kind, trigger, state, template_id, template_name, template_language, params, hand, policy_class, channels, run_hour, cap_per_run, gap_days, cadence_days, gap_minutes, until, list_id, list_key, lead_search_id, after_playbook_id, after_days, signed_by, include_unconfirmed, last_run_for, last_run_at, created_by, created_at, updated_at",
          )
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, last(offset, limit)),
      ),
  };
}

/** The second half: what went out, what it was written from, what was handed over, and what was found. */
function sendSections(
  db: Db,
  tenantId: string,
): Pick<ExportSectionPages, "sends" | "templates" | "holds" | "rules" | "reviews" | "leads" | "reach_out_replies"> {
  return {
    // Each run of a campaign and each one-off send: who it was for, when it went and how many it reached.
    sends: (offset, limit) =>
      sectionRows(
        db
          .from("broadcasts")
          .select(
            "id, name, playbook_id, run_for, template_id, template_name, template_language, params, audience, channels, state, scheduled_for, started_at, finished_at, recipient_count, failure, created_by, created_at, updated_at",
          )
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, last(offset, limit)),
      ),
    templates: (offset, limit) =>
      sectionRows(
        db
          .from("templates")
          .select(
            "id, channel, name, title, language, category, meta_status, quality, rejected_reason, body_preview, variables, components, source, hidden_at, created_by, created_at, updated_at",
          )
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, last(offset, limit)),
      ),
    // What was handed to a person, why, and how it was settled.
    holds: (offset, limit) =>
      sectionRows(
        db
          .from("escalations")
          .select(HOLD_COLUMNS)
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, last(offset, limit)),
      ),
    // What the receptionist may do on its own, asks first or leaves alone, for the workspace and for a list or a person.
    rules: (offset, limit) =>
      sectionRows(
        db
          .from("policies")
          .select(RULE_COLUMNS)
          .eq("tenant_id", tenantId)
          .order("id", { ascending: true })
          .range(offset, last(offset, limit)),
      ),
    // The Google reviews as the mirror last saw them, with the reply.
    reviews: (offset, limit) =>
      sectionRows(
        db
          .from("google_reviews")
          .select(
            "id, origin, rating, author, author_uri, body, language_code, published_at, reply_text, replied_at, maps_uri, first_seen_at, last_seen_at",
          )
          .eq("tenant_id", tenantId)
          .order("first_seen_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, last(offset, limit)),
      ),
    // The businesses the finder found, and how far each came; one erased at a person's request holds nothing to export.
    leads: (offset, limit) =>
      sectionRows(
        db
          .from("leads")
          .select(LEAD_COLUMNS)
          .eq("tenant_id", tenantId)
          .is("erased_at", null)
          .order("found_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, last(offset, limit)),
      ),
    // How each answer to a reach-out was read: what they meant, the day they named, the draft made for it and who signed.
    reach_out_replies: (offset, limit) =>
      sectionRows(
        db
          .from("reach_out_replies")
          .select(REPLY_COLUMNS)
          .eq("tenant_id", tenantId)
          .order("read_at", { ascending: true })
          .order("message_id", { ascending: true })
          .range(offset, last(offset, limit)),
      ),
  };
}

/** Each section of the owner's copy that is read here, page by page, on the owner's own client. */
export function exportSectionPages(db: Db, tenantId: string): ExportSectionPages {
  return { ...recordSections(db, tenantId), ...sendSections(db, tenantId) };
}

/**
 * The sections of one person's own copy that are read here (contracts PERSON_EXPORT_SECTIONS; the wiring's second audit,
 * R14 X5): the workspace's sections that hold a person's records, each holding theirs alone.
 */
export type PersonExportPages = Pick<
  ExportSectionPages,
  | "notes_and_steps"
  | "deals"
  | "bookings"
  | "lists"
  | "list_members"
  | "sends"
  | "holds"
  | "rules"
  | "leads"
  | "reach_out_replies"
>;

/** A read answered once and kept for the pages after it: the few ids a person's sections are filtered by. */
function keptRead<T>(read: () => Promise<T>): () => Promise<T> {
  let held: Promise<T> | null = null;
  return () => (held ??= read());
}

/** The ids a read of one column answered, or throws. */
async function columnIds<K extends string>(
  q: PromiseLike<{ data: Record<K, string>[] | null; error: { message: string } | null }>,
  key: K,
): Promise<string[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r[key]);
}

/** Their records: the notes and steps on them, their deals and bookings, and the lists they were put on by hand. */
function personRecordSections(
  db: Db,
  tenantId: string,
  contactId: string,
): Pick<PersonExportPages, "notes_and_steps" | "deals" | "bookings" | "lists" | "list_members"> {
  // The lists kept by hand that name them, read once. A list made by a rule is its rule, which their copy does not run:
  // the file says so (contracts personExportLeftOut).
  const theirLists = keptRead(() =>
    columnIds(
      db.from("segment_members").select("segment_id").eq("tenant_id", tenantId).eq("contact_id", contactId),
      "segment_id",
    ),
  );
  return {
    notes_and_steps: (offset, limit) =>
      sectionRows(
        db
          .from("person_notes")
          .select(NOTE_COLUMNS)
          .eq("tenant_id", tenantId)
          .eq("contact_id", contactId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, last(offset, limit)),
      ),
    deals: (offset, limit) =>
      sectionRows(
        db
          .from("deals")
          .select(DEAL_COLUMNS)
          .eq("tenant_id", tenantId)
          .eq("contact_id", contactId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, last(offset, limit)),
      ),
    bookings: (offset, limit) =>
      sectionRows(
        db
          .from("appointments")
          .select(BOOKING_COLUMNS)
          .eq("tenant_id", tenantId)
          .eq("contact_id", contactId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, last(offset, limit)),
      ),
    lists: async (offset, limit) => {
      const ids = await theirLists();
      if (ids.length === 0) return [];
      return sectionRows(
        db
          .from("segments")
          .select(SEGMENT_COLUMNS)
          .eq("tenant_id", tenantId)
          .in("id", ids)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, last(offset, limit)),
      );
    },
    list_members: (offset, limit) =>
      sectionRows(
        db
          .from("segment_members")
          .select(SEGMENT_MEMBER_COLUMNS)
          .eq("tenant_id", tenantId)
          .eq("contact_id", contactId)
          .order("segment_id", { ascending: true })
          .range(offset, last(offset, limit)),
      ),
  };
}

/** What reached them and what they answered: the runs that sent to them, their holds, their rules, their business. */
function personSendSections(
  db: Db,
  tenantId: string,
  contactId: string,
): Pick<PersonExportPages, "sends" | "holds" | "rules" | "leads" | "reach_out_replies"> {
  // Their threads, read once: a hold is a thread's.
  const theirThreads = keptRead(() =>
    columnIds(db.from("conversations").select("id").eq("tenant_id", tenantId).eq("contact_id", contactId), "id"),
  );
  // The business they work at (contacts.lead_id, 0052), read once.
  const worksAt = keptRead(async () => {
    const { data, error } = await db
      .from("contacts")
      .select("lead_id")
      .eq("tenant_id", tenantId)
      .eq("id", contactId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.lead_id ?? null;
  });
  return {
    // Each campaign run that named them: what became of their line (sent, skipped and why, failed), on which channel,
    // the words it filled in for them, and the run it was. A run names a person once (broadcast_recipients_pkey), so the
    // run's id orders them.
    sends: (offset, limit) =>
      sectionRows(
        db
          .from("broadcast_recipients")
          .select(
            "broadcast_id, state, reason, channel, sent_at, message_id, facts, broadcasts (name, playbook_id, run_for, template_name, template_language, scheduled_for, started_at)",
          )
          .eq("tenant_id", tenantId)
          .eq("contact_id", contactId)
          .order("broadcast_id", { ascending: true })
          .range(offset, last(offset, limit)),
      ),
    holds: async (offset, limit) => {
      const threads = await theirThreads();
      if (threads.length === 0) return [];
      return sectionRows(
        db
          .from("escalations")
          .select(HOLD_COLUMNS)
          .eq("tenant_id", tenantId)
          .in("conversation_id", threads)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, last(offset, limit)),
      );
    },
    // The receptionist's rules set for them alone; the workspace's own are its copy's.
    rules: (offset, limit) =>
      sectionRows(
        db
          .from("policies")
          .select(RULE_COLUMNS)
          .eq("tenant_id", tenantId)
          .eq("subject_type", "contact")
          .eq("subject_id", contactId)
          .order("id", { ascending: true })
          .range(offset, last(offset, limit)),
      ),
    // The business they work at, and a lead that became them; one erased at a person's request holds nothing to export.
    leads: async (offset, limit) => {
      const lead = await worksAt();
      return sectionRows(
        db
          .from("leads")
          .select(LEAD_COLUMNS)
          .eq("tenant_id", tenantId)
          .is("erased_at", null)
          .or(lead ? `contact_id.eq.${contactId},id.eq.${lead}` : `contact_id.eq.${contactId}`)
          .order("found_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, last(offset, limit)),
      );
    },
    reach_out_replies: (offset, limit) =>
      sectionRows(
        db
          .from("reach_out_replies")
          .select(REPLY_COLUMNS)
          .eq("tenant_id", tenantId)
          .eq("contact_id", contactId)
          .order("read_at", { ascending: true })
          .order("message_id", { ascending: true })
          .range(offset, last(offset, limit)),
      ),
  };
}

/**
 * One person's sections of their own copy, page by page, on the owner's own client. `contactId` is checked by the caller
 * (a uuid, a person of this workspace): it is written into a filter.
 */
export function personExportPages(db: Db, tenantId: string, contactId: string): PersonExportPages {
  return { ...personRecordSections(db, tenantId, contactId), ...personSendSections(db, tenantId, contactId) };
}
