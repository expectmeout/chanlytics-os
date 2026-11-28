/**
 * The door walk's lists (database/doors/_walk.mjs says what the walk does): what the catalog cannot say about a row or
 * an argument, and the doors argued by name. Each list is held both ways: an entry the walk no longer needs fails as
 * an entry that is missing does.
 */

/**
 * Which table an argument's row comes from, where its name does not say (`p_contact_id` is a row of `contacts` with
 * no entry here). `@owner` is A's owner and `@viewer` A's viewer: a person, not a row. `@nothing` is an id that names
 * no row to act on (a place to read on from, an id the caller makes up): it is filled with one that exists nowhere.
 */
export const ARG_ROWS = {
  p_account_id: "ad_accounts",
  p_after_id: "@nothing",
  p_ask: "@nothing",
  p_batch_id: "sequence_batches",
  p_batch_ids: "sequence_batches",
  p_before_id: "@nothing",
  p_broadcast_id: "sequence_batches",
  p_by: "@owner",
  p_claim_id: "owner_claims",
  p_connection_id: "mailbox_connections",
  p_doubt_id: "person_doubts",
  p_enrollment_ids: "sequence_enrollments",
  p_entry_id: "form_entries",
  p_entry_ids: "form_entries",
  p_for_user_id: "@viewer",
  p_keep: "contacts",
  p_key_id: "form_keys",
  p_list_id: "lead_searches",
  p_mailbox_id: "mailbox_connections",
  p_merge: "contacts#2",
  p_note_id: "person_notes",
  p_op_id: "lead_operations",
  p_partner: "@nothing",
  p_plan_id: "content_plans",
  p_playbook_id: "sequence_steps",
  p_root_id: "sequence_steps#reach_out",
  p_round_id: "lead_rounds",
  p_run_id: "sequence_batches",
  p_run_ids: "sequence_batches",
  p_search_id: "lead_searches",
  p_send_id: "sequence_sends",
  p_site_id: "form_sites",
  p_slot_id: "plan_slots",
  p_source_id: "media_sources",
  p_step_id: "sequence_steps",
  p_step_ids: "sequence_steps",
  p_subject_id: "conversations",
  p_thread_id: "ask_threads",
  p_threads: "conversations",
  p_to_root: "sequence_steps#reach_out",
  p_undo_of: "decisions",
};

/**
 * One door's own arguments: door, then argument, then the table its row comes from (an id; `@null` passes none), or the
 * value to pass (anything else). A door that reads its other arguments before it asks who is calling is given ones it
 * takes, so the call reaches the question.
 */
export const DOOR_ARGS = {
  appointment_notice_dismiss: { p_id: "appointment_notices" },
  ask_memory_write: { p_id: "ask_memory_lines", p_act: "keep", p_source: "ask" },
  caller_has_permission: { p_permission: "approve" },
  change_playbook: { p_set: { name: "Door walk" } },
  claim_conversation_control: { p_kind: "person", p_seconds: "60" },
  deal_record: {
    p_stage: "proposed",
    p_service: null,
    p_per: null,
    p_note: null,
    p_proposal_url: null,
    p_lost_reason: null,
    p_clear: null,
  },
  fact_suggestion_answer: { p_id: "fact_suggestions" },
  file_change: { p_id: "files" },
  file_keep_many: { p_ids: "files" },
  file_media_processing: { p_id: "files" },
  file_remove: { p_id: "files" },
  file_restore: { p_id: "files" },
  file_start: { p_id: "files" },
  import_ledger_note: { p_source: "clients_file", p_state: "done" },
  lead_bulk: { p_ids: "leads" },
  lead_export_mark: { p_ids: "leads" },
  lead_round_answer: { p_answer: "stop" },
  lead_search_more: { p_purpose: "topup" },
  mark_visit: { p_status: "kept" },
  member_decision: { p_subject_type: "conversation" },
  member_view_set: { p_page: "people" },
  notification_mark: { p_id: "notifications" },
  outside_form_listed: { p_form_id: "outside_forms" },
  outside_form_rename: { p_form_id: "outside_forms" },
  person_call_logged: { p_outcome: "spoke" },
  person_note_add: { p_source: "page" },
  playbook_edit: { p_id: "sequence_steps" },
  reach_out_run_recheck: { p_broadcast_id: "sequence_batches#reach_out" },
  reach_out_send_said: { p_outcome: "sent" },
  record_consent: { p_purpose: "marketing", p_consent: "opted_out", p_source: "operator", p_message_id: "@null" },
  record_deal: { p_stage: "proposed" },
  rename_mailbox: { p_mailbox_id: "mailboxes" },
  sequence_once_keep: { p_id: "sequences" },
  set_contact_consent: { p_consent: "opted_out", p_source: "operator", p_message_id: "@null" },
  set_marketing_consent: { p_consent: "opted_out", p_source: "operator", p_message_id: "@null" },
  set_person_email: { p_email: "doorwalk@example.com" },
  set_person_proposal: { p_url: "https://example.com/doorwalk" },
};

const HEX_64 = "a".repeat(64);
const LATER = "2099-01-04T10:00:00Z";

/**
 * What a seeded row must hold that the catalog cannot say: columns that go together, a format, a day of the week.
 * Table, then column, then its value, cast to the column's type; `{a}` is A's id and `{table}` the id of A's row in
 * that table. The catalog says the rest: a column that must be filled takes its type's plainest value, the first word
 * of its closed set, or the row it points at.
 */
export const SEED_VALUES = {
  ad_entries: { kind: "number" },
  anthropic_profiles: { kind: "workspace" },
  appointments: { starts_at: "2099-01-05T10:00:00Z", ends_at: "2099-01-05T11:00:00Z", timezone: "America/Chicago" },
  content_plans: { week_of: "2099-01-05" },
  file_archive_parts: { shelf_key: "doorwalk" },
  file_archives: { origin: "shelf" },
  fact_suggestions: { state: "suggested", title: "doorwalk", body: "doorwalk", quote: "doorwalk" },
  file_moments: { end_s: "2" },
  form_entries: { contact_id: "{contacts}" },
  form_entry_links: { kind: "conversation", conversation_id: "{conversations}" },
  form_keys: { first: "false", hash: HEX_64, name: "doorwalk" },
  google_connections: { account_name: "accounts/doorwalk" },
  google_listings: { place_id: "doorwalk-place" },
  lead_counters: { kind: "allowance", period: "2099-01" },
  lead_previews: { token: "a".repeat(22) },
  lead_rounds: { day: "2099-01-05", month: "2099-01" },
  mailbox_connections: { address: "doorwalk@example.com", host: "example.com" },
  mailboxes: { reply_token: "a".repeat(24) },
  outside_forms: { site_id: "{form_sites}" },
  partner_earnings: { currency: "usd" },
  person_doubts: { other_id: "00000000-0000-4000-8000-0000000d0b70" },
  piece_renditions: { path: "{a}/{files}/doorwalk.mp4" },
  platform_acts: { reason_kind: "call" },
  platform_claims: { until: LATER },
  post_observations: { availability: "unsupported" },
  privacy_requests: { due_at: LATER },
  rehearsals: { kind: "typed" },
  remediation_actions: { outcome: "pending" },
  sequence_batches: { template_id: "{templates}", template_name: "doorwalk", template_language: "en" },
  sequence_enrollments: { contact_id: "{contacts}" },
  sequence_sends: { lead_id: "{leads}", state: "queued" },
  sequence_steps: {
    trigger: "quiet_30",
    policy_class: "reengage",
    template_id: "{templates}",
    template_name: "doorwalk",
    template_language: "en",
  },
  sequences: { mode: "ask" },
  source_connections: { provider_account: "doorwalk", email: "doorwalk@example.com" },
  templates: { channel: "email", source: "chanlytics" },
  touches: { contact_id: "{contacts}" },
  voice_agents: { agent_id: "agent_doorwalk" },
};

/**
 * A second row of a table, where a door needs one the first cannot be: two people to merge, a cold email's first step
 * beside a customer's. Its name (an argument's row in `ARG_ROWS` or `DOOR_ARGS`), then its table, when it is made
 * among these, and its values, as `SEED_VALUES` gives them.
 */
export const SEED_MORE = {
  "contacts#2": { table: "contacts", order: 1, values: {} },
  "sequence_batches#reach_out": {
    table: "sequence_batches",
    order: 4,
    values: {
      sequence_id: "{sequences#leads}",
      template_id: "{templates}",
      template_name: "reach_out_doorwalk",
      template_language: "en",
      audience: { kind: "reach_out" },
    },
  },
  "sequences#leads": { table: "sequences", order: 2, values: { starts: "leads", mode: "ask" } },
  "sequence_steps#reach_out": {
    table: "sequence_steps",
    order: 3,
    values: {
      id: "{sequences#leads}",
      sequence_id: "{sequences#leads}",
      kind: "reach_out",
      trigger: "lead_first",
      policy_class: "outreach",
      gap_minutes: "12",
      lead_search_id: "{lead_searches}",
      template_id: "{templates}",
      template_name: "reach_out_doorwalk",
      template_language: "en",
    },
  },
};

const PARTNERS_OWN =
  "a partner's own door, by their own record: nobody in the walk holds one, and partners/second-factor.db.test.mjs tries each as a partner";
const PLATFORMS_OWN =
  "the platform's staff alone (decision 0066): every member is refused, and console/console.db.test.mjs tries it as staff";
const CALLERS_OWN = "the caller's own, by who is calling: it takes no workspace and no row of one";

/**
 * The doors that run as their owner and answer A's owner as they answer B's: nothing the walk passes makes them ask
 * who is calling, each with why. A door that runs as its caller is not listed: it reads what the caller's own row
 * rules give (database/tenancy/ proves those), and the walk counts it. A new door that answers everyone the same is
 * given arguments that reach its question (`DOOR_ARGS`), or is named here.
 */
export const SAME_FOR_EVERYONE = {
  "create_workspace(text,text,text)": "makes a workspace of the caller's own: it names nobody else's",
  "create_workspace_for_business(text,text,text)": PARTNERS_OWN,
  "handover_accept(uuid)": "answers the person a workspace is handed to, by their proved address, never a seat",
  "handover_decline(uuid)": "answers the person a workspace is handed to, by their proved address, never a seat",
  "handovers_mine()": CALLERS_OWN,
  "is_platform_admin()": CALLERS_OWN,
  "lead_card_live(text)": "which lead cards the platform offers: the same for every member (privileges' ASKS_NOBODY)",
  "lead_cards_live()": "which lead cards the platform offers: the same for every member (privileges' ASKS_NOBODY)",
  "lead_niche_prior(text)":
    "the platform's counts for a kind of business: they name no workspace (privileges' ASKS_NOBODY)",
  "lead_search_widens(uuid)":
    "the platform's own switch for a workspace, off until the platform names it: false to a member and to a stranger alike",
  "partner_balance()": PARTNERS_OWN,
  "partner_become(text)": PARTNERS_OWN,
  "partner_handover_resend(uuid,text)": PARTNERS_OWN,
  "partner_invitations_mine()": PARTNERS_OWN,
  "partner_invite_accept(uuid)": PARTNERS_OWN,
  "partner_invite_decline(uuid)": PARTNERS_OWN,
  "partner_letters_set(boolean)": PARTNERS_OWN,
  "partner_overview()": PARTNERS_OWN,
  "partner_payout_mark(uuid,text,text,bigint)": PLATFORMS_OWN,
  "partner_second_factor_reset(uuid,text)": PLATFORMS_OWN,
  "partner_standing_set(uuid,text,text)": PLATFORMS_OWN,
  "partner_status_set(uuid,text,text)": PLATFORMS_OWN,
  "partner_workspace_money()": PARTNERS_OWN,
  "platform_find(text)": PLATFORMS_OWN,
  "platform_overview()": PLATFORMS_OWN,
  "platform_partner_balances()": PLATFORMS_OWN,
  "platform_partner_workspaces()": PLATFORMS_OWN,
  "platform_role()": CALLERS_OWN,
  "platform_staff_state()": CALLERS_OWN,
  "preview_claim(text)":
    "opens a preview by its link's own secret, which the walk does not hold: not found to everyone",
  "profile_set(text)": CALLERS_OWN,
  "push_device_forget(text)": CALLERS_OWN,
  "push_device_register(text,text,text,text)": CALLERS_OWN,
  "push_devices_forget_all()": CALLERS_OWN,
  "session_has_partner_seat()": CALLERS_OWN,
};

/**
 * The doors a viewer writes through, where the door's text makes no check the walk knows: each writes the viewer's
 * own mark or record, never the workspace's.
 */
export const A_VIEWER_WRITES = {
  "contact_mark(uuid,boolean,timestamp with time zone)": "the viewer's own read mark on a person",
  "delete_my_account()": "the viewer's own account",
  "member_push_off_set(uuid,text[])": "which notices the viewer's own phone is not rung for, on their own seat",
  "member_view_set(uuid,text,jsonb)": "the viewer's own saved view of a page, on their own seat",
  "notification_mark(uuid,boolean,boolean)": "the viewer's own read mark on a notice",
  "notifications_read_through(uuid,timestamp with time zone,boolean)": "the viewer's own read-through moment",
  "notifications_seen(uuid)": "the viewer's own seen mark",
  "profile_set(text)": "the viewer's own name",
  "recording_opened(uuid)":
    "the record that this person opened a call's recording: reading one is written down, whoever reads",
};

/**
 * The doors that answer a partner on a password alone otherwise than a stranger, or let them write: each writes the
 * caller's own mark and answers no workspace content (partners/second-factor-catalog.db.test.mjs names the same three
 * as not a seat's door), or refuses in words.
 */
export const A_PASSWORD_ALONE_MAY = {
  "notification_mark(uuid,boolean,boolean)": "writes the caller's own read marks; answers no workspace content",
  "notifications_read_through(uuid,timestamp with time zone,boolean)":
    "writes the caller's own read-through moment; answers no workspace content",
  "notifications_seen(uuid)": "writes the caller's own seen mark; answers no workspace content",
  "reach_out_reply_undoable(uuid)": `answers "role": a refusal in the door's own word, nothing of the reply`,
};

/**
 * The doors that answer a seat their own text gives no pass, in words and not by raising: door, then who, then why
 * the answer is a refusal.
 */
export const REFUSES_IN_WORDS = {
  "reach_out_reply_undoable(uuid)": { viewer: `answers "role": a viewer may not undo, said in the door's own word` },
};

/**
 * The doors that run as their owner, name a workspace or a row, and answer a session with no person in it without
 * raising: each answers no, nothing or not found, which tells and changes nothing. A door that takes such a session
 * as the server (it wrote, or read the workspace's own) is an offence, never an entry here (00732).
 */
export const ANSWERS_NO_PERSON_IN_WORDS = {
  "caller_has_permission(uuid,text)": "answers false: nobody has a permission",
  "lead_search_widens(uuid)": "answers false: nobody's search widens",
  "may_read_workspace(uuid)": "answers false: nobody may read",
  "reach_out_reply_undoable(uuid)": 'answers "not_found", as to a stranger',
  "sequence_queued_why_not(uuid,uuid[],uuid[])": "answers no rows, as to a stranger",
  "tenant_config_read(uuid)": "answers no rows, as to a stranger",
};
