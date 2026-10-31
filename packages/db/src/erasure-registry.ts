/**
 * How an erasure reaches each column of a workspace table that can hold a person's words (decision 0036; 0031's
 * invariant 10, "every table has a tenant, a floor and an erasure strategy").
 *
 * An erasure (DELETE /api/v1/contacts/:id, apps/dashboard/src/server/people/erase-contact.ts) runs its legs in order:
 * the block, the copies keyed on the number, Storage, the rows in one transaction (`erase_contact`), the triggers that
 * fire on its tombstone, then the best-effort passes. What each leg reaches was written only in its own code, so a
 * new column that held a person's number or words was erased only if its author remembered. Here each such column
 * names one strategy:
 *
 *   with_person   the row goes when the erasure deletes the person's rows, by the named leg;
 *   scrubbed      the column is overwritten, or the row deleted, by the named legs, by the person's id or by needle;
 *   digest        kept only as a keyed hash an erasure cannot reverse (00263);
 *   by_age        removed by a retention clock within contracts' RETENTION_DAYS, which the privacy page states;
 *   with_workspace the workspace's own record that can name someone it is not serving: its owner, a member, its payer,
 *                 the representative its filing names. An erasure is of a person the workspace serves and does not
 *                 reach it; it leaves with the workspace, within the 30 days the privacy page states;
 *   as_record     the record that a request about a person was answered (decision 0066): who asked, when, and what was
 *                 done, kept past the workspace it was about so the answer can be shown; never what they wrote to it;
 *   not_personal  holds nothing of a person, said once.
 *
 * Which columns can hold words is the schema's: text, json and their arrays, in a table that names `tenant_id`, its
 * partitions read through it. A column the schema holds to a closed set (contracts SCHEMA_SETS) holds no person's words
 * and is not listed. A column with no strategy is counted: people/erasure/erasure-registry.test.mjs and the ratchet
 * "personal columns with no erasure strategy" (docs/debt.md) hold the count to fall, so a new column arrives with its
 * strategy. messages.body and messages.template_vars are counted on purpose: a message is immutable by trigger (00326),
 * so a person's words in someone else's thread stay until an exception to that is costed (Ruben, 6 October 2026).
 * A Google review's reviewer, words and reply are reached by no erasure (nothing joins a review to a person, and a name
 * is not a key): the mirror follows Google, and a review it has not seen for its days goes (00392, answered 10 October
 * 2026).
 */
import type { RETENTION_DAYS } from "@chanlytics/contracts";

/** The legs an erasure runs, each where it is written. */
export const ERASURE_LEGS = {
  erase_contact:
    "erase_contact: the person's calls (and a review of one, by its key: 00476), messages, conversations and identities deleted, scheduled jobs and decision payloads scrubbed, the tombstone written (00027, 00151)",
  notes_trigger:
    "person_notes_erase_on_contact: their own notes deleted, the old notes field cleared, a note_for_you about them removed (00158)",
  events_trigger: "contact_events_on_erase: an event that named them cut to who did it and from where (00131)",
  consent_trigger:
    "erase_marketing_consent, consent_channels_on_erase, email_marketing_on_erase: their answers and where they came from cleared (00101)",
  email_trigger: "contact_email_on_erase: the address and why it was suppressed cleared (00125)",
  proposal_trigger: "contact_proposal_on_erase: the proposal's link cleared",
  deals_trigger: "deals_erase_on_contact: a deal's note, evidence and link cleared",
  leads_trigger:
    "leads_erase_on_contact: their lead blanked (lead_blank), its places deleted, a reach-out's opening and a preference's example cleared (00391), its drafts cleared (00429), a company's people and key cleared and its domain kept as a digest (00430), its keys kept as digests; one of several people at a business takes only their own address, number and the call's note from it (lead_person_leg, 00413); a person named at any company leaves it, its drafts to them cleared and their address kept as a digest (lead_person_forget, 00430)",
  preview_trigger:
    "lead_previews_erase_with_their_lead: a lead blanked or erased ends its preview, what the business wrote to it and said was not right cleared and its workspace erased, unless it was made theirs (00497)",
  signer_trigger:
    "person_signer_erase_on_contact: the name and title a reply's reading found as its signer, and what became of it, cleared (00413)",
  recipients_trigger:
    "sequence_sends_on_erase: the words each batch kept for them, a visit's time, service and key and a proposal's link, cleared (00391, 00440)",
  jobs_scrub:
    "scrubErasedJobs and erase_contact: a job's payload that carried their number or words overwritten, and its error cleared",
  ask_scrub:
    "scrub_ask_for_contact: the assistant's turns that name them deleted (00238), and the lines Ask remembers and the days of its journal that name them (00470)",
  deliveries_scrub: "provider_events_scrub: a kept delivery that names them deleted (00336)",
  notes_scrub: "person_notes_scrub: their numbers and addresses overwritten in other people's notes (00341)",
  turns_scrub:
    "model_turns_scrub: the receptionist's kept turns that name them, in anyone's thread, deleted (00401); their own went with their conversation",
  appointments_scrub:
    "appointments_scrub: their visits keep their time and service and lose the client's name, number, address and note; the notices that made them, and any whose subject names them, lose the name (00345)",
  before_trigger:
    "contacts_before_erased: what another system said of them before Chanlytics (a client file's visits, last visit and birthday) cleared (00477)",
  mailbox_trigger:
    "mailbox_senders_on_erase: their address off the list of what a connected mailbox left, and a person said of it with it, and what Chanlytics read them to be (00495); what was said of a robot stays (00483)",
} as const;

export type ErasureLeg = keyof typeof ERASURE_LEGS;

/** One column's strategy. */
export type ErasureStrategy =
  | { readonly kind: "with_person"; readonly by: ErasureLeg }
  | { readonly kind: "scrubbed"; readonly by: readonly ErasureLeg[] }
  | { readonly kind: "digest" }
  | { readonly kind: "by_age"; readonly days: keyof typeof RETENTION_DAYS }
  | { readonly kind: "with_workspace" }
  | { readonly kind: "as_record" }
  | { readonly kind: "not_personal" };

const withPerson = (by: ErasureLeg): ErasureStrategy => ({ kind: "with_person", by });
const scrubbedBy = (...by: ErasureLeg[]): ErasureStrategy => ({ kind: "scrubbed", by });
const byAge = (days: keyof typeof RETENTION_DAYS): ErasureStrategy => ({ kind: "by_age", days });
const DIGEST: ErasureStrategy = { kind: "digest" };
const WITH_WORKSPACE: ErasureStrategy = { kind: "with_workspace" };
const AS_RECORD: ErasureStrategy = { kind: "as_record" };
const NOT_PERSONAL: ErasureStrategy = { kind: "not_personal" };

/** Every column in `names` with one strategy. */
const all = (strategy: ErasureStrategy, ...names: string[]): Record<string, ErasureStrategy> =>
  Object.fromEntries(names.map((n) => [n, strategy]));

/** Table, then column, then its strategy: what the legs reach today, and what is plainly no one's. */
export const ERASURE_STRATEGIES: Readonly<Record<string, Readonly<Record<string, ErasureStrategy>>>> = {
  // The model ledger (00273): which model answered and a hash of the system prompt, never a customer's turn. A shadow
  // row's question and answers are labels from the question's own options; the rows go at 400 days whatever a later
  // writer puts there. A failed call's reason (00469) is the API's error type, and its words, which name no one but go
  // at 400 days with the row.
  ai_usage: {
    ...all(NOT_PERSONAL, "model", "model_asked", "prompt_hash", "error_type"),
    error_message: byAge("ai_usage"),
    ...all(byAge("ai_usage"), "question", "primary_answer", "shadow_answer"),
  },
  // What Ask remembers (00470, decision 0070): a line a member told it, and a day of its journal, which may name a customer
  // as the team does; one that names them goes with their turns. Where each came from is a closed set.
  ask_journal_days: { text: scrubbedBy("ask_scrub") },
  ask_memory_lines: { text: scrubbedBy("ask_scrub") },
  ask_messages: { content: scrubbedBy("ask_scrub") },
  // A thread that one of their turns makes theirs, or whose title or scope holds their id, number or address, is
  // cleared, and removed once empty (00238). A title that names them by name alone stays, as 0036 leaves names; purge_ask
  // takes the thread at 90 days.
  ask_threads: all(scrubbedBy("ask_scrub"), "title", "scope"),
  // A voice session's page can name a person as its label, and it holds the member's sealed token: the row goes a day
  // after the token expires (sweep_voice_sessions). Its ids and its page's name are nobody's.
  ask_voice_sessions: {
    ...all(byAge("ask_voice_sessions"), "context", "scope", "token_cipher"),
    ...all(NOT_PERSONAL, "id", "conversation_id", "surface", "turn_key"),
  },
  // The workspace's account with Stripe: its payer's card, and Stripe's ids and price.
  billing_accounts: {
    ...all(WITH_WORKSPACE, "card_brand", "card_last4"),
    ...all(NOT_PERSONAL, "facts", "price_id", "stripe_customer_id", "stripe_subscription_id"),
  },
  billing_card_marks: { card_fingerprint: WITH_WORKSPACE },
  billing_events: all(NOT_PERSONAL, "id", "type", "currency"),
  // The workspace's carrier registration: the business, its address and tax id, and the representative it names.
  business_records: all(
    WITH_WORKSPACE,
    "about",
    "city",
    "contact_email",
    "contact_first_name",
    "contact_job_position",
    "contact_last_name",
    "contact_phone",
    "contact_title",
    "country",
    "ein",
    "industry",
    "legal_name",
    "postal_code",
    "region",
    "street",
    "street_secondary",
    "trade_name",
    "website_url",
  ),
  // The owner's note on switching a capability on.
  capability_activations: { note: NOT_PERSONAL },
  calls: all(
    withPerson("erase_contact"),
    "retell_call_id",
    "agent_id",
    "call_type",
    "from_e164",
    "to_e164",
    "from_raw",
    "disconnection_reason",
    "sentiment",
    "summary",
    "transcript",
    "transcript_object",
    "recording",
    "public_log_url",
    "cost",
    "latency",
    "raw",
    "wanted",
    "follow_up",
    "caller_name",
    "analysis",
  ),
  contact_identities: all(withPerson("erase_contact"), "external_id", "raw"),
  // A conversation rehearsed or a real call reviewed (decision 0069). A review of a real call holds that call's words and
  // goes with the call (its key cascades, 00476); a rehearsal is the owner speaking or typing as a customer, which names
  // nobody the workspace serves, and leaves with the workspace. The provider's ids and the end's word are nobody's.
  rehearsals: {
    ...all(withPerson("erase_contact"), "transcript", "instructions", "review", "fixes"),
    ...all(NOT_PERSONAL, "retell_call_id", "agent_id", "end_reason"),
  },
  contacts: {
    phone_e164: scrubbedBy("erase_contact"),
    display_name: scrubbedBy("erase_contact"),
    wa_profile_name: scrubbedBy("erase_contact"),
    consent_source: scrubbedBy("erase_contact"),
    notes: scrubbedBy("notes_trigger", "erase_contact"),
    marketing_consent_source: scrubbedBy("consent_trigger"),
    email_marketing_source: scrubbedBy("consent_trigger"),
    consent_channels: scrubbedBy("consent_trigger"),
    marketing_channels: scrubbedBy("consent_trigger"),
    email: scrubbedBy("email_trigger"),
    email_suppressed_reason: scrubbedBy("email_trigger"),
    proposal_url: scrubbedBy("proposal_trigger"),
    erased_phone_hash: DIGEST,
    erased_email_hash: DIGEST,
    // The line or the ad a person came by, never the person (its column comment).
    acquired_ref: NOT_PERSONAL,
    // What a client file said of them before Chanlytics (00477, decision 0073): cleared as the row is tombstoned.
    before: scrubbedBy("before_trigger"),
  },
  // What was brought in (00477, decision 0073): a source's counts, where its job stands (a mailbox's id, a provider's page
  // token, Meta's request id), the tool it came from and our words for a stop. None of it names a person.
  imports: all(NOT_PERSONAL, "counts", "job_cursor", "last_error", "via"),
  // What the business's own profile and website say (00479): its services, prices, closures, rules and description, the
  // page it was read from, and our words for a read that failed. The business's public facts, not a customer's.
  business_reads: all(NOT_PERSONAL, "facts", "read_from", "error"),
  conversations: all(withPerson("erase_contact"), "control_kind", "control_ref"),
  // Ask's draft written ahead for a thread waiting on a person (00475): its key names the thread, so the row goes with it
  // when erase_contact deletes their conversation (on delete cascade).
  conversation_drafts: { words: withPerson("erase_contact") },
  deals: {
    ...all(scrubbedBy("deals_trigger"), "note", "evidence", "proposal_url"),
    // What was sold and in what currency, kept as its stage and amount are, as a visit keeps its service. The service is
    // the team's words (80 characters): a name typed into it is the name 0036 leaves, not a number or an address.
    ...all(NOT_PERSONAL, "service", "currency"),
  },
  decisions: { payload: scrubbedBy("erase_contact") },
  escalations: { details: withPerson("erase_contact") },
  // A subscriber's error: an exception of the code's own, the subscribers touching no provider.
  event_deliveries: all(NOT_PERSONAL, "subscriber", "kind", "last_error"),
  event_outbox: { kind: NOT_PERSONAL },
  events: {
    data: scrubbedBy("events_trigger"),
    ...all(NOT_PERSONAL, "kind", "category", "subject_type", "request_id"),
  },
  // A note suggested from an owner's correction (00448): its key is the correction's message, in the person's thread, so
  // the row goes with it when erase_contact deletes their messages (on delete cascade). A note once kept is the business's
  // own, in its settings, and no longer a suggestion.
  fact_suggestions: all(withPerson("erase_contact"), "title", "body", "quote"),
  // A member's own Google account, connected for the workspace's profile: the row goes at disconnect, and with the
  // workspace. The profile's and Google's names and ids, and the sync's error, are nobody's.
  google_connections: {
    ...all(WITH_WORKSPACE, "google_email", "google_sub", "account_title"),
    ...all(
      NOT_PERSONAL,
      "account_name",
      "credentials_ref",
      "facts",
      "location_name",
      "location_title",
      "scopes",
      "sync_error",
    ),
  },
  // The workspace's own listing, as Google's public read gives it.
  google_listings: all(
    NOT_PERSONAL,
    "address",
    "business_status",
    "check_error",
    "facts",
    "maps_uri",
    "name",
    "new_review_uri",
    "place_id",
  ),
  // A review as Google shows it: a complete read drops one Google no longer lists, and one not seen for its days goes
  // (purge_google_reviews, 00392). Its ids and language are nobody's.
  google_reviews: {
    // The reply the receptionist holds (00462) names the reviewer as a posted one does, and goes with the review.
    ...all(byAge("google_reviews"), "author", "author_uri", "author_photo_uri", "body", "reply_text", "draft_text"),
    ...all(NOT_PERSONAL, "language_code", "maps_uri", "review_id"),
  },
  idempotency_keys: all(byAge("idempotency_keys"), "key", "route", "request_hash", "response"),
  // A team invitation's address: the workspace's while it is open or expired (the Team card sends it again); one
  // accepted or taken back goes with its address 30 days later (purge_invitations, 00392).
  invitations: { email: WITH_WORKSPACE },
  jobs: {
    // A thrown error can quote the recipient a provider refused.
    ...all(scrubbedBy("jobs_scrub", "erase_contact"), "payload", "last_error"),
    // Ids only (jobs dedupeKeyOf).
    dedupe_key: NOT_PERSONAL,
  },
  lead_counters: { period: NOT_PERSONAL },
  // A batch's judge: its answer, with a reason for each place, goes with the batch (purge_leads, 00140); its model and
  // the hashes of its work are nobody's.
  lead_judgments: {
    answer: byAge("lead_judgments"),
    ...all(NOT_PERSONAL, "model", "op_id", "request_hash"),
  },
  // A lead's stage before and after a move, its counts, ids and a keyed hash of its place.
  lead_operations: all(NOT_PERSONAL, "before", "after"),
  lead_preferences: {
    example: scrubbedBy("leads_trigger"),
    category_key: NOT_PERSONAL,
  },
  // A search's rounds and runs: the owner's plan and question, the days, the provider's and the judge's ids.
  lead_rounds: all(NOT_PERSONAL, "day", "judge_model", "month", "nearby", "plan", "platform_day", "question"),
  lead_runs: all(
    NOT_PERSONAL,
    "actor",
    "apify_run_id",
    "build",
    "claimed_by",
    "dataset_id",
    "lease_owner",
    "term",
    "webhook_token_hash",
  ),
  lead_places: all(withPerson("leads_trigger"), "place_id", "title", "street"),
  // A lead's own receptionist before they sign up (00497, decision 0079): what someone at the business wrote to it and
  // said was not right, ended with its lead; its link's token and our words for a build that failed name no one.
  lead_previews: {
    ...all(scrubbedBy("leads_trigger", "preview_trigger"), "turns", "not_right"),
    ...all(NOT_PERSONAL, "token", "failed_why"),
  },
  lead_search_members: {
    ...all(scrubbedBy("leads_trigger"), "judgment", "reason"),
    ...all(NOT_PERSONAL, "counted_month", "excluded_by"),
  },
  // What the owner asked the finder for, and the kinds of business it suggested.
  lead_searches: all(NOT_PERSONAL, "asked", "card", "name", "plan"),
  // The ideas for a search (00398, 00399): the business line, the plans, what they were written over and what was passed on.
  lead_suggestions: all(NOT_PERSONAL, "business_line", "items", "basis", "passed"),
  lead_suppressions: { hash: DIGEST },
  leads: {
    ...all(
      scrubbedBy("leads_trigger"),
      "place_id",
      "business_name",
      "category",
      "street",
      "city",
      "region",
      "postal_code",
      "website_host",
      "instagram_url",
      "phone_e164",
      "email",
      "email_alternates",
      "last_outcome",
      "last_note",
      "about",
      "hours",
      "image_url",
      "price",
      "reviews_dist",
      "facebook_url",
      "linkedin_url",
      "tiktok_url",
      "maps_url",
      "neighborhood",
      "logo_url",
      "mark_path",
      // A company's people (their names, titles, work addresses, profiles) and its key (00430).
      "facts",
      "source_key",
    ),
    // What lead_blank keeps: the country and the stage it came from.
    ...all(NOT_PERSONAL, "country", "stage_from"),
  },
  // The workspace's own numbers and the carrier's and provider's ids for them.
  lines: {
    // A member's own number a forwarding test rang from (facts.test_from), and the carrier's words on the filing that
    // names the workspace's representative.
    ...all(WITH_WORKSPACE, "facts", "last_error"),
    ...all(
      NOT_PERSONAL,
      "a2p_profile_sid",
      "brand_sid",
      "campaign_sid",
      "credential_list_sid",
      "credentials_ref",
      "e164",
      "messaging_service_sid",
      "number_sid",
      "profile_sid",
      "retell_agent_id",
      "subaccount_sid",
      "termination_uri",
      "trunk_sid",
    ),
  },
  // The kinds a member's phones are not told (00372), and a member's sort and columns: the member's own settings.
  memberships: all(NOT_PERSONAL, "push_off", "views"),
  messages: all(withPerson("erase_contact"), "template_name", "media", "external_id", "content_hash", "error", "meta"),
  // A kept turn (decision 0039): the person's own go when their conversation does, by the fence's cascade, and a turn
  // about someone else that quoted them is deleted by needle; the prompt it read is the business's own facts, and
  // leaves by its clock.
  model_turns: {
    ...all(scrubbedBy("turns_scrub", "erase_contact"), "request", "response"),
    ...all(NOT_PERSONAL, "prompt_hash", "model"),
  },
  model_prompts: { text: byAge("model_prompts"), prompt_hash: NOT_PERSONAL },
  // The settings as they stood (decision 0039, step 3): the business's own, as tenant_config.config is, and unlike it
  // a version leaves by its clock once it is replaced.
  tenant_config_versions: { config: byAge("tenant_config_versions") },
  notifications: {
    ...all(byAge("notifications"), "title", "body"),
    ...all(NOT_PERSONAL, "route", "subject_type", "subject_id"),
  },
  // A visit is the business's fact; the client in it is the person's (00345, docs/plans/2026-10-07-bookings-arrive-by-email.md).
  appointments: {
    ...all(
      scrubbedBy("appointments_scrub"),
      "client_name",
      "client_phone",
      "client_email",
      "note",
      "title",
      "external_id",
    ),
    ...all(NOT_PERSONAL, "tool", "service", "staff", "price", "timezone"),
  },
  appointment_notices: {
    subject: scrubbedBy("appointments_scrub"),
    // The tool's own sender and its id for the delivery: nobody's.
    ...all(NOT_PERSONAL, "notice_id", "tool", "from_address"),
  },
  // A mailbox a member connected to write from (00423): its address and name are the business's, kept with the
  // workspace; its token's name, its records and its clocks are not personal (its provider, state and hold are closed
  // sets, no words).
  mailbox_connections: {
    ...all(WITH_WORKSPACE, "address", "host", "from_name", "signature", "gmail_signature", "provider_account"),
    ...all(NOT_PERSONAL, "scopes", "credentials_ref", "dns", "sync_cursor", "watch_id", "last_error"),
  },
  // What a connected mailbox left where it was, one row a sender (00483): a robot's, or a person's that Gmail filed with
  // the receipts, whose erasure takes it.
  mailbox_left: all(scrubbedBy("mailbox_trigger"), "address", "name"),
  // What the workspace said of a sender (00483): an address or a domain. A person's address goes with them; what was
  // said of a robot is nobody's, and stays.
  mailbox_senders: { sender: scrubbedBy("mailbox_trigger") },
  // What Chanlytics read a sender to be (00495, decision 0080): their address, and in a few words what they wanted,
  // which never holds a name; their erasure takes it.
  mailbox_sender_reads: all(scrubbedBy("mailbox_trigger"), "address", "about"),
  // Gmail's pending confirmation of a forward to the workspace's address (00345): the owner's own account, and
  // Google's code and link for it; the name its mail is sent from. The workspace's address on the platform's domain,
  // its reply tokens and its intake's error code are nobody's.
  mailboxes: {
    ...all(WITH_WORKSPACE, "forward_confirm_account", "from_name"),
    ...all(
      NOT_PERSONAL,
      "forward_confirm_code",
      "forward_confirm_link",
      "last_error",
      "local_part",
      "reply_token",
      "reply_token_prev",
    ),
  },
  // A partner's ledger of the workspaces it brought: Stripe's ids, the code used, the sweep's checks and reasons; the
  // address a workspace is handed to, the workspace's, cleared once its new owner accepts (00392).
  partner_earnings: all(NOT_PERSONAL, "currency", "stripe_event_id", "stripe_invoice_id"),
  partner_tenants: {
    handover_email: WITH_WORKSPACE,
    ...all(NOT_PERSONAL, "checks", "code_used", "standing_why"),
  },
  person_notes: { body: scrubbedBy("notes_scrub", "notes_trigger") },
  // The Console (00467, decision 0066). What the team did and why: the platform's staff, a ticket's number, and a reason
  // the ask tells them to write without a customer's details (CONSOLE_WORDS.noteHint); kept as the log of the act.
  platform_acts: all(NOT_PERSONAL, "actor_email", "act", "ticket", "note", "outcome_note"),
  // Who on the team has a workspace taken: the platform's staff, gone in four hours or when let go.
  platform_claims: { email: NOT_PERSONAL },
  // A request the data-deletion page promises an answer to: who asked and the team's notes on it, kept as the answer's
  // record; the workspace's name and address as it was filed.
  privacy_requests: {
    ...all(AS_RECORD, "asked_by", "ticket", "note", "steps"),
    ...all(NOT_PERSONAL, "slug", "name"),
  },
  // Report a problem: a member's address and words leave with the workspace (or their account), as its other records do;
  // the page and the error are the app's own.
  support_reports: {
    ...all(WITH_WORKSPACE, "email", "words"),
    ...all(NOT_PERSONAL, "page", "error_id", "error_name", "error_message", "mail_error"),
  },
  platform_metrics: all(
    NOT_PERSONAL,
    "messages_in",
    "messages_out",
    "provider_failures",
    "handled",
    "topics",
    "ai_tokens",
    "ai_usd",
    "job_lag_ms",
    "first_answer_ms",
    "dead_letters",
    "intake_lag_ms",
  ),
  // Numbers: a day's tokens, a pause's hours (contracts config/limits.ts).
  policies: { limits: NOT_PERSONAL },
  provider_events: {
    body: scrubbedBy("deliveries_scrub"),
    ...all(byAge("provider_events"), "provider_event_id", "door", "url", "headers"),
  },
  // A list's name and its rule, in the closed vocabulary; its members go by segment_members_on_erase.
  segments: all(NOT_PERSONAL, "name", "rule"),
  // A sequence (decision 0060): its name, and a one-off kept as a draft (00465: who it goes to by list or everyone, when,
  // its channels and its message as the owner wrote it), the business's.
  sequences: all(NOT_PERSONAL, "name", "once"),
  // A batch's name, its audience (a list's or a step's name, a rule in the closed vocabulary), its channels, its template
  // and what fills its slots: the business's.
  sequence_batches: all(
    NOT_PERSONAL,
    "audience",
    "channels",
    "failure",
    "name",
    "params",
    "template_language",
    "template_name",
  ),
  // Someone in a sequence: why they left is a send's code or a door's word, never theirs.
  sequence_enrollments: { why: NOT_PERSONAL },
  // A reply to a sequence's send hangs on the replier's message and thread, and goes with them.
  sequence_replies: {
    ...all(withPerson("erase_contact"), "draft", "draft_why", "plan", "refer_to", "summary"),
    // Who signed it (0052): cleared when the person it names is erased, wherever the reply's thread is.
    ...all(scrubbedBy("signer_trigger"), "signer_name", "signer_title"),
    // What became of the signer's name, and the source it replaced: closed words, never the name.
    ...all(NOT_PERSONAL, "signer_state", "signer_was"),
  },
  sequence_sends: {
    // A customer's send: the words its batch kept for them.
    facts: scrubbedBy("recipients_trigger"),
    // A lead's: written from the lead's record (00391).
    ...all(scrubbedBy("leads_trigger"), "opening", "angle", "hold_detail"),
    // A draft handed to its owner (00429): the business's address, name and the words written to it; lead_blank clears it.
    ...all(scrubbedBy("leads_trigger"), "draft"),
    // A digest of the words checked, the facts' keys, and the hold's, the skip's and a failure's codes.
    ...all(NOT_PERSONAL, "checked_words", "facts_used", "included_for", "reason"),
  },
  // A step: its name, channels, list, template and slots, the words waiting for WhatsApp, the conditions it goes on, and
  // the team's instruction; the name it is signed with, the sender's.
  sequence_steps: {
    signed_by: WITH_WORKSPACE,
    ...all(
      NOT_PERSONAL,
      "channels",
      "hand",
      "list_key",
      "name",
      "next_params",
      "next_template_language",
      "next_template_name",
      "only_if",
      "params",
      "template_language",
      "template_name",
    ),
  },
  templates: all(
    NOT_PERSONAL,
    "body_preview",
    "components",
    "language",
    "meta_id",
    "name",
    "quality",
    "rejected_reason",
    "title",
    "variables",
  ),
  // The workspace's channels: their configuration, its own numbers and the provider's ids.
  tenant_channels: all(NOT_PERSONAL, "config", "credentials_ref", "external_id", "number_e164", "waba_id"),
  // The workspace's receptionist at the provider, made before its number (decision 0069): the provider's ids.
  voice_agents: all(NOT_PERSONAL, "agent_id", "llm_id"),
  // The receptionist's configuration, which names the addresses the workspace is alerted at.
  tenant_config: { config: WITH_WORKSPACE },
};
