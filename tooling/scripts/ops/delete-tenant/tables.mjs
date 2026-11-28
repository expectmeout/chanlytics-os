/**
 * What tooling/scripts/ops/delete-tenant.mjs knows of the schema, each pinned BY VALUE: the tables a workspace's rows are
 * in, the ones that outlive it, the key each is read by, and the ones emptied before the workspace's own delete. The
 * tests in tests/console/back-office hold every list here to the migrations and to the generated keys, so a table added
 * without its line turns them red.
 *
 * Plain Node, as the script is: it imports nothing of the app's.
 */

/**
 * Every table carrying a tenant_id, derived from the migrations. Pinned here
 * BY VALUE so the backup cannot silently miss a table: a companion test reads
 * supabase/migrations and fails when this list and the schema disagree.
 *
 * google_reviews and google_listing_days carry a tenant_id with no key to tenants: they cascade through
 * google_listings, which cascades from tenants. They are read and backed up like the rest.
 */
export const TABLES = [
  // An owner's ad account, and each ad's days of spend (00648, decision 0049); its ads are below.
  "ad_accounts",
  "ad_days",
  // The workspace's one draft of a new ad, with its words (00659).
  "ad_drafts",
  // What an ad said to each person who tapped it and wrote (00644, decision 0049).
  "ad_entries",
  // What Chanlytics made at Meta for an ad made here (00666).
  "ad_objects",
  "ads",
  "ai_usage",
  "anthropic_profiles",
  "appointment_notices",
  "appointments",
  // What Ask did (00574): closed sets and ids alone.
  "ask_actions",
  // What Ask remembers, its journal and each member's mornings (00470, decision 0070).
  "ask_journal_days",
  "ask_memory_lines",
  "ask_messages",
  "ask_mornings",
  "ask_notice_days",
  "ask_threads",
  "ask_voice_sessions",
  "billing_accounts",
  "billing_card_marks",
  "billing_events",
  "business_records",
  "calls",
  "capability_activations",
  "contact_identities",
  "contact_marks",
  "contact_reads",
  "contacts",
  // When a thread's person last wrote on each wire (00484, decision 0001).
  "conversation_channel_state",
  // Ask's drafts written ahead for a thread waiting on a person (00475, decision 0071).
  "conversation_drafts",
  "conversations",
  "deals",
  "decisions",
  "escalations",
  "events",
  // A business's files (00551): the rows here, and their bytes in the files bucket below.
  "files",
  "files_let_go",
  // Where a file's copies are (00686): the folder a press saves into in the owner's Drive, each copy and its pieces.
  "archive_folders",
  "file_archives",
  "file_archive_parts",
  // A website's form entries and its keys (00675), each site it sends from and each form it sends (00709).
  "form_entries",
  "form_keys",
  "form_sites",
  "outside_forms",
  // A business's own forms (00680): each form and its versions, what happened to an entry, and its links with their
  // days of opens; and each form's days of its business's booking page opened from it (00691).
  "form_days",
  "form_entry_links",
  "form_versions",
  "forms",
  "link_days",
  "links",
  // Where each post went, and each send of it (00611, decision 0121).
  "posts",
  "publish_attempts",
  // Each video asked for (00613, decision 0122); the video itself is a file, above.
  "pieces",
  // A piece's versions, its shapes as sent, and what an owner approved (00681).
  "piece_revisions",
  "piece_renditions",
  "approvals",
  // A week planned (00706): what the owner claims and what posts are for, the plans and their slots, a clip's moments.
  "owner_claims",
  "content_goals",
  "content_plans",
  "plan_slots",
  "file_moments",
  // What a post said back (00699): its numbers by read, people's touches of a post or a link, and the public answers to
  // comments.
  "post_observations",
  "touches",
  "comment_answers",
  "sequence_lead_words",
  // The notes an owner's corrections suggest keeping (00448, decision 0063).
  "fact_suggestions",
  "google_connections",
  "google_listing_days",
  "google_listings",
  "google_reviews",
  "idempotency_keys",
  "invitations",
  "jobs",
  "lead_counters",
  "lead_judgments",
  "lead_operations",
  "lead_places",
  "lead_preferences",
  "lead_rounds",
  "lead_runs",
  "lead_search_members",
  "lead_searches",
  "lead_suggestions",
  "lead_suppressions",
  "leads",
  "lines",
  // The mailboxes a business connected to write its reach-outs from (00423, decision 0056).
  "mailbox_connections",
  // What the workspace said of a sender, and what its mailbox left where it was (00483).
  "mailbox_left",
  "mailbox_sender_reads",
  "mailbox_senders",
  "mailboxes",
  // A folder the workspace has watched for its photos and videos (00639); its connection and its items are below.
  "media_sources",
  "memberships",
  "messages",
  // A receptionist's turns as the model read them, and the prompts they read (00401, decision 0039).
  "model_prompts",
  "model_turns",
  "notification_reads",
  "notifications",
  "partner_earnings",
  "partner_invitations",
  "partner_tenants",
  // The doubt queue (00344): a pair of the workspace's records the door could not tell apart.
  "person_doubts",
  "person_moments",
  "person_notes",
  "platform_metrics",
  // The Console (00467, decision 0066): what the team did in it and why, who had it taken, what it reported, and the
  // requests about it, the last of which outlive it.
  "platform_acts",
  "platform_claims",
  "privacy_requests",
  "support_reports",
  // The spine (00334): an event's outbox row and its deliveries follow their workspace.
  "event_outbox",
  "event_deliveries",
  // The intake ledger (00336): a provider's deliveries the door placed with the workspace.
  "provider_events",
  "policies",
  "reach_out_check_spend",
  // A conversation rehearsed or a real call reviewed (00476, decision 0069).
  "rehearsals",
  // What a cause started, and each action of it (00676): a yes taken back, honoured, ad by ad.
  "remediation_actions",
  "remediations",
  // What was brought in, and what the profile and the website say (00477, 00479; decision 0073).
  "imports",
  "business_reads",
  // A lead's own receptionist before they sign up (00497, decision 0079): the sender's row; its workspace is its own.
  "lead_previews",
  "reply_turns",
  "segment_members",
  "segments",
  "sequence_batches",
  "sequence_enrollments",
  // What a sequence owes a person for an occasion (00598, decision 0119).
  "sequence_occasions",
  "sequence_replies",
  "sequence_sends",
  "sequence_steps",
  "sequences",
  // A workspace's setup choices, its own and not each member's (00513, decision 0091).
  "setup_choices",
  // The provider account a watched folder is read through, and what each folder holds (00639).
  "source_connections",
  "source_items",
  "templates",
  "tenant_channels",
  "tenant_config",
  // The settings as they stood at each version (00402, decision 0039).
  "tenant_config_versions",
  // The workspace's receptionist at Retell, made before any number (00476, decision 0069).
  "voice_agents",
];

/** Survives the delete with a null tenant_id, deliberately. */
// A partner's earnings (0012) are money owed or paid, and outlive the workspace they came from, as its events do. What
// the Console's staff did there, and the request that asked for the delete, are the record of it (00467).
export const KEPT = new Set(["billing_events", "partner_earnings", "platform_acts", "privacy_requests"]);

/**
 * The key each table is read by, a page at a time, where it is not `id`: its primary key's columns in order, with
 * tenant_id left out, since every read is one workspace's. An empty key is a table with one row a workspace.
 */
const KEYS = {
  ad_days: ["ad_id", "day"],
  ask_journal_days: ["day"],
  ask_mornings: ["user_id", "day"],
  ask_notice_days: ["day"],
  billing_accounts: [],
  billing_card_marks: [],
  business_reads: ["source"],
  business_records: [],
  capability_activations: ["capability"],
  contact_marks: ["contact_id", "user_id"],
  contact_reads: ["user_id"],
  event_deliveries: ["event_id", "subscriber"],
  event_outbox: ["event_id"],
  events: ["id", "created_at"],
  files_let_go: ["fingerprint"],
  form_days: ["form_id", "day"],
  google_connections: [],
  google_listing_days: ["day"],
  google_listings: [],
  lead_suggestions: [],
  link_days: ["link_id", "day"],
  mailbox_left: ["address"],
  mailbox_sender_reads: ["address"],
  mailbox_senders: ["sender"],
  model_prompts: ["prompt_hash"],
  notification_reads: ["user_id"],
  partner_invitations: [],
  partner_tenants: [],
  person_moments: ["contact_id"],
  platform_claims: [],
  platform_metrics: ["day"],
  provider_events: ["provider", "provider_event_id"],
  reach_out_check_spend: ["day"],
  reply_turns: ["conversation_id"],
  segment_members: ["segment_id", "contact_id"],
  sequence_lead_words: ["step_id", "lead_id"],
  sequence_replies: ["message_id"],
  setup_choices: [],
  tenant_config: [],
  tenant_config_versions: ["version"],
  voice_agents: [],
};

/** The columns a table's rows are paged by, in order. */
export const keyOf = (table) => KEYS[table] ?? ["id"];

/**
 * The tables that grow with a workspace's history and that its own delete would otherwise cascade through in one
 * statement: emptied before it, a slice at a time, in this order. Each is deleted by the cascade anyway (its tenant_id
 * cascades from tenants), and no key anywhere can refuse a delete of its rows: whatever points at one cascades or is
 * set to null. The two that point at messages go before it, so a message's delete finds nothing of theirs to visit.
 * `events` is not here: it has no key to tenants, and is deleted by time.
 */
export const EMPTIED_FIRST = [
  "event_deliveries",
  "event_outbox",
  "provider_events",
  "jobs",
  "model_turns",
  "ai_usage",
  "sequence_sends",
  "touches",
  "messages",
];

/**
 * The tables whose rows the delete reads again after the backup: what it would strand outside the database, and what it
 * removes there. Every other table's rows go to the backup and are not held.
 */
export const READ_AGAIN = [
  "ad_accounts",
  "billing_accounts",
  "file_archive_parts",
  "files",
  "google_connections",
  "lines",
  "mailbox_connections",
  "source_connections",
  "tenant_channels",
  "voice_agents",
];
