/**
 * How an erasure reaches each column of a workspace table that can hold a person's words (decision 0036; 0031's
 * invariant 10, "every table has a tenant, a floor and an erasure strategy").
 *
 * An erasure (DELETE /api/v1/contacts/:id, packages/jobs/src/handlers/erasure.ts, its legs in repositories/erasure/legs.ts beside this)
 * runs its legs in order: the block, the copies keyed on the number, Storage, the rows in one transaction
 * (`erase_contact`), the triggers that fire on its tombstone, then the best-effort passes; one a press left unfinished
 * is finished by the erasure_finish job. What each leg reaches was written only in its own code, so a
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
import type { ErasureLeg } from "./leg-words";

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
  // What an ad said to a person who tapped it and wrote (00644, decision 0049): the ad's own headline, words and link,
  // and the platform's id for the ad. None of it is the person's, and the row is theirs through its message: an entry
  // names the message that carried it and goes when that message does, which an erasure deletes. An entry with no
  // message (a form lead's, which nothing writes yet) will need a leg of its own, and its lead's id at the platform.
  ad_entries: all(withPerson("erase_contact"), "platform_ad_id", "external_ref", "said"),
  // An owner's own ad account (00648, decision 0049). The account's name at its platform can be a person's, and its
  // ids there (its own, and the business, Page and number beside it in config) are the owner's: they leave with the
  // workspace. Its currency, its zone, the typed words it stands on and our own words for a failed read name nobody
  // (its platform and status are closed sets). Its token is in Vault, on no row.
  ad_accounts: {
    ...all(WITH_WORKSPACE, "external_id", "name", "config"),
    ...all(NOT_PERSONAL, "currency", "timezone", "standing", "read_error"),
  },
  // A draft of a new ad (00659): what New ad chose and the ad writer's words, the business's own advertising for the
  // public, never a person it serves (an ad says nothing of a person: the writer's checks hold it to the service), and
  // the words a writer out for it writes (00672: the service, the picture, the price or none). It leaves with the
  // workspace.
  ad_drafts: all(WITH_WORKSPACE, "draft", "writing_for"),
  // An ad (00648): its name and what it says are the business's own advertising, written by the owner for the public,
  // and leave with the workspace, and so does what the owner approved at Turn on (00666: the words, the area's address
  // and the number a tap opens, all the business's own). The platform's ids for it, the platform's own words about it,
  // where it shows and how its launch went name nobody, nor does a change of the owner's on its way (00673: an amount, a
  // day, miles, and the member who pressed). No person the workspace serves is on the row: who an ad brought is read
  // from contacts, never kept here. A day of an ad (ad_days) holds numbers alone.
  ads: {
    ...all(WITH_WORKSPACE, "name", "said", "approved"),
    ...all(
      NOT_PERSONAL,
      "platform_ad_id",
      "platform_set_id",
      "platform_campaign_id",
      "platform_state",
      "platform_issue",
      "launch",
      "shown_on",
      "change",
    ),
  },
  // What Chanlytics made at Meta for an ad (00666): each part's tagged name, the ad's own, and Meta's id for it. The
  // business's advertising, leaving with the workspace; never a person.
  ad_objects: {
    ...all(WITH_WORKSPACE, "name"),
    ...all(NOT_PERSONAL, "platform_id"),
  },
  // The model ledger (00273): which model answered and a hash of the system prompt, never a customer's turn. A shadow
  // row's question and answers are labels from the question's own options; the rows go at 400 days whatever a later
  // writer puts there. A failed call's reason (00469) is the API's error type, and its words, which name no one but go
  // at 400 days with the row.
  ai_usage: {
    ...all(NOT_PERSONAL, "model", "model_asked", "prompt_hash", "error_type"),
    error_message: byAge("ai_usage"),
    ...all(byAge("ai_usage"), "question", "primary_answer", "shadow_answer"),
  },
  // What Ask told a business: a key and a day (00575).
  ask_notice_days: { key: { kind: "not_personal" } },
  // What Ask did: ids and its own codes alone, its words stay on the turn, which ask_scrub reaches (00574). How it was pressed,
  // where it came from and where it stands (by, origin_by, state) are closed sets, which hold no words.
  ask_actions: all({ kind: "not_personal" }, "proposal_id", "kind", "made_kind", "made_id", "reason", "code"),
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
  // Whom Anthropic is told a call is for (00544): ids and Anthropic's own words, nothing a person wrote.
  anthropic_profiles: all(NOT_PERSONAL, "reference_id", "profile_id", "enforcement_actions"),
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
  // What a cause started (00676; the content loop PRD's 5.3), kept as the proof a yes taken back was honoured: what it is
  // about is a file's id, and an action's words are the platform's. Never what the person wrote.
  remediations: { ...all(NOT_PERSONAL, "subject_id") },
  remediation_actions: { ...all(NOT_PERSONAL, "said") },
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
  // token, Meta's request id), the tool it came from, our words for a stop, and the run that holds it (00499: a number,
  // or the moment Stop was pressed). None of it names a person.
  imports: all(NOT_PERSONAL, "counts", "job_cursor", "last_error", "via", "run"),
  // A provider account a member connected so the workspace's footage is read where it lives (00639): the account's id
  // and email are that member's, and leave with the workspace. Its scopes and its token's name are nobody's (its
  // provider and health are closed sets).
  source_connections: {
    ...all(WITH_WORKSPACE, "provider_account", "email"),
    ...all(NOT_PERSONAL, "scopes", "credentials_ref"),
  },
  // A folder the workspace has watched (00639). The business named the folder, and a name can be a person's ("Ana's
  // wedding"): it leaves with the workspace. The provider's ids, the cursor, the push channel's id, its provider's id
  // for what it watches (00641) and its token's hash, and our words for what went wrong name nobody (its state and its
  // walk's kind are closed sets).
  media_sources: {
    folder_name: WITH_WORKSPACE,
    ...all(
      NOT_PERSONAL,
      "folder_id",
      "drive_id",
      "change_cursor",
      "channel_id",
      "channel_resource_id",
      "channel_token_hash",
      "last_error",
    ),
  },
  // What a watched folder holds (00639). A file's name and who added it can hold a person's name; an erasure of a person
  // the workspace serves does not reach a file in the business's own folder (its owner removing it there is the remedy,
  // as for a picture in the Library), and both leave with the workspace. The provider's ids, the checksum and the
  // provider's token for a folder's next page (00641) name nobody (its kind, its state and why it stands there are
  // closed sets: 00643 made the reason one).
  source_items: {
    ...all(WITH_WORKSPACE, "name", "added_by"),
    ...all(NOT_PERSONAL, "provider_id", "parent_id", "checksum", "walk_page"),
  },
  // Where a file's copies are (00686). The Google account whose Drive holds a copy is the member's who connected it,
  // and leaves with the workspace, as a connection's does. Drive's ids for the folder and for a file in it, a piece's
  // key on the shelf and its checksums name nobody (the states, origins, pieces and reasons are closed sets). A copy
  // the owner saved to their own Drive is theirs to delete there: an erasure removes the file here, and its rows with it.
  archive_folders: {
    google_account: WITH_WORKSPACE,
    ...all(NOT_PERSONAL, "folder_id", "made_folder_id", "added_folder_id"),
  },
  file_archives: { google_account: WITH_WORKSPACE },
  file_archive_parts: all(NOT_PERSONAL, "drive_file_id", "shelf_key", "md5", "sha256"),
  // What the business's own profile and website say (00479): its services, prices, closures, rules and description, the
  // page it was read from, and our words for a read that failed. The business's public facts, not a customer's.
  business_reads: all(NOT_PERSONAL, "facts", "read_from", "error"),
  conversations: all(withPerson("erase_contact"), "control_kind", "control_ref"),
  // Ask's draft written ahead for a thread waiting on a person (00475): its key names the thread, so the row goes with it
  // when erase_contact deletes their conversation (on delete cascade). What the drafter handed the model (`used`, 00538)
  // goes with it, and why one was not written is a word of contracts' ReplyDraftWhy, which names nobody.
  conversation_drafts: {
    ...all(withPerson("erase_contact"), "words", "used"),
    ...all(NOT_PERSONAL, "why_failed"),
  },
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
    // Ids only (job_dedupe_key_of, 00526: the parts each kind names in job_kinds).
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
  // A business's own pictures (00551). A picture can show anyone, and a look or a name can hold what it read off one: an
  // erasure of a person reaches neither, and the owner deleting that file is the remedy, which blanks all three.
  // A video's (00556): what was heard of it can carry what a customer said in a clip, so it goes with the workspace; the video
  // platform's id for it and its error code are nobody's.
  // A yes for one use of a file (00665): who said it, as the owner named them to AI. A person in a picture is not joined
  // to People, so, as the picture itself, it leaves with the workspace; an erasure of a person has no key to it.
  file_consents: { who: WITH_WORKSPACE },
  files: {
    ...all(WITH_WORKSPACE, "look", "made", "name", "source_ref", "sound", "sound_said"),
    // The uses a file has a yes for, and those taken back (00665): words of a closed set, never a person's.
    ...all(
      NOT_PERSONAL,
      "fingerprint",
      "claude_copy",
      "media_ref",
      "media_error",
      "picture_print",
      "yes_back",
      "yes_for",
    ),
  },
  // What a person removed, by a hash of its bytes alone (00551).
  files_let_go: { fingerprint: NOT_PERSONAL },
  // A website's entries, and a hosted form's requests (00680), go with their person: what they answered, who it was
  // about as typed (reach), where it came from (source: a link's code, a page, a campaign's labels, never a click id)
  // and the code its thank-you carried into a chat. One held for a look has no person yet, so the same leg finds it by
  // the address or the number typed, and it goes at 30 days whoever it was (form_entries_purge). A key is the
  // business's own (00675).
  form_entries: all(
    withPerson("form_entries_trigger"),
    "answers",
    "ref",
    "words",
    "effects",
    "owed",
    "reach",
    "source",
    "code",
  ),
  form_keys: { name: WITH_WORKSPACE, hash: NOT_PERSONAL },
  // A form (00680) is the business's own page: the word in its address, its draft and each version published, written
  // by the owner for the public. No person the workspace serves is on a row, and they leave with the workspace. What
  // happened to an entry (form_entry_links) is ids and a closed set alone.
  form_versions: { description: WITH_WORKSPACE },
  forms: all(WITH_WORKSPACE, "slug", "draft"),
  // A link (00680): a code made at random, the kind of thing it opens, and where it is shared in the owner's own
  // words for a place ("Google listing"), which leave with the workspace. A day of a link (link_days) is numbers alone.
  links: { ...all(NOT_PERSONAL, "code", "subject_type"), place: WITH_WORKSPACE },
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
  // A video asked for (00613, decision 0122): its plan holds the words the business chose to open and end it, and its look
  // the business's name, booking line and address. The machine it is drawn on and its card's key are nobody's.
  // A made picture is a piece too (00681); why a piece exists (its intent: a day, an offer, a service) is the business's.
  pieces: {
    ...all(WITH_WORKSPACE, "plan", "look", "intent"),
    ...all(NOT_PERSONAL, "machine", "card_key"),
  },
  // A piece's versions (00681): its plan and its words per place are the business's own, as pieces.plan and posts.caption
  // are; what moved between two versions is a closed list.
  piece_revisions: { ...all(WITH_WORKSPACE, "plan", "captions"), changed: NOT_PERSONAL },
  // A shape as it is sent (00681): a path in the file's folder and its checksum, nobody's.
  piece_renditions: all(NOT_PERSONAL, "path", "checksum"),
  // What an owner approved (00681): the version, each shape by path and checksum, where, when, the business's own words and
  // any fact the owner stated, the business's record; its hash is nobody's.
  approvals: { snapshot: WITH_WORKSPACE, snapshot_hash: NOT_PERSONAL },
  // Where a post went (00611, decision 0121): its caption is the business's own public words, and the rest is the platform's
  // ids and our sentences.
  posts: {
    caption: WITH_WORKSPACE,
    ...all(NOT_PERSONAL, "held_reason", "error", "container_id", "external_id", "permalink", "account_id"),
  },
  provider_events: {
    body: scrubbedBy("deliveries_scrub"),
    ...all(byAge("provider_events"), "provider_event_id", "door", "url", "headers"),
  },
  // Each send of a post (00611): what was sent is the post's caption and the picture's host; what came back is the platform's.
  publish_attempts: {
    request: WITH_WORKSPACE,
    ...all(NOT_PERSONAL, "answer", "error", "container_id", "external_id"),
  },
  // A list's name and its rule, in the closed vocabulary; its members go by segment_members_on_erase.
  segments: all(NOT_PERSONAL, "name", "rule"),
  // What the first run chose (decision 0091): the business's own number and how its calls reach the receptionist, the
  // workspace's record; the steps it marked done, from a closed list.
  setup_choices: { phone: WITH_WORKSPACE, marks: NOT_PERSONAL },
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
  // What a sequence owes someone for an occasion (0119): a key of ids and a closed code for why it left, never their
  // words; the rows are deleted with the person (sequence_occasions_on_erase).
  sequence_occasions: { occasion: NOT_PERSONAL, why: NOT_PERSONAL },
  // A reply to a sequence's send hangs on the replier's message and thread, and goes with them.
  sequence_replies: {
    ...all(withPerson("erase_contact"), "draft", "draft_why", "plan", "refer_to", "summary"),
    // Who signed it (0052): cleared when the person it names is erased, wherever the reply's thread is.
    ...all(scrubbedBy("signer_trigger"), "signer_name", "signer_title"),
    // What became of the signer's name, and the source it replaced: closed words, never the name.
    ...all(NOT_PERSONAL, "signer_state", "signer_was"),
  },
  // The words a member typed for a lead at a step (00545): lead_blank deletes them with the lead's details.
  sequence_lead_words: all(scrubbedBy("leads_trigger"), "subject", "body"),
  sequence_sends: {
    // A customer's send: the words its batch kept for them.
    facts: scrubbedBy("recipients_trigger"),
    // A lead's: written from the lead's record (00391).
    ...all(scrubbedBy("leads_trigger"), "opening", "angle", "hold_detail"),
    // A draft handed to its owner (00429): the business's address, name and the words written to it; lead_blank clears it.
    ...all(scrubbedBy("leads_trigger"), "draft"),
    // What its owner asked of the opening and the one it replaced, and what the business's site said (00505): lead_blank
    // clears them with the opening.
    ...all(scrubbedBy("leads_trigger"), "rewrite_asked", "website_says"),
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
