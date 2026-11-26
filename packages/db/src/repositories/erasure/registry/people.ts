/**
 * A person and what passed between them and the workspace: their record, threads, calls, notes, visits, deals, a
 * website's entries, what AI read and wrote of them, Ask's threads, and the ledgers that name them. What each strategy
 * means is said in repositories/erasure/registry.ts.
 */
import {
  all,
  AS_RECORD,
  byAge,
  DIGEST,
  type ErasureStrategy,
  NOT_PERSONAL,
  scrubbedBy,
  WITH_WORKSPACE,
  withPerson,
} from "../strategy";

/** Table, then column, then its strategy. */
export const PEOPLE_TABLES: Readonly<Record<string, Readonly<Record<string, ErasureStrategy>>>> = {
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
  // token, Meta's request id), the tool it came from, our words for a stop, and the run that holds it (00499: a number,
  // or the moment Stop was pressed). None of it names a person.
  imports: all(NOT_PERSONAL, "counts", "job_cursor", "last_error", "via", "run"),
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
  idempotency_keys: all(byAge("idempotency_keys"), "key", "route", "request_hash", "response"),
  jobs: {
    // A thrown error can quote the recipient a provider refused.
    ...all(scrubbedBy("jobs_scrub", "erase_contact"), "payload", "last_error"),
    // Ids only (job_dedupe_key_of, 00526: the parts each kind names in job_kinds).
    dedupe_key: NOT_PERSONAL,
  },
  // A person's words in someone else's thread stay, as a message is immutable (00326; Ruben, 6 October 2026).
  messages: all(
    withPerson("erase_contact"),
    "body",
    "template_vars",
    "template_name",
    "media",
    "external_id",
    "content_hash",
    "error",
    "meta",
  ),
  // A kept turn (decision 0039): the person's own go when their conversation does, by the fence's cascade, and a turn
  // about someone else that quoted them is deleted by needle; the prompt it read is the business's own facts, and
  // leaves by its clock.
  model_turns: {
    ...all(scrubbedBy("turns_scrub", "erase_contact"), "request", "response"),
    ...all(NOT_PERSONAL, "prompt_hash", "model"),
  },
  model_prompts: { text: byAge("model_prompts"), prompt_hash: NOT_PERSONAL },
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
    ...all(NOT_PERSONAL, "tool", "service", "staff", "price", "timezone", "worth_currency"),
  },
  appointment_notices: {
    subject: scrubbedBy("appointments_scrub"),
    // The tool's own sender and its id for the delivery: nobody's.
    ...all(NOT_PERSONAL, "notice_id", "tool", "from_address"),
  },
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
  person_notes: { body: scrubbedBy("notes_scrub", "notes_trigger") },
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
  // What a post said back (00699). A person's touch of a post keeps that it happened; what they wrote there (a comment's
  // words, their name on Instagram) goes with them: emptied by their erasure (and by age, past 180 days,
  // touches_age_out). The place's own id for it (a comment's id) is nobody's words, and keeps it once. A public answer to a comment is the business speaking in public: AI's draft, the owner's
  // words, Instagram's id for it and the house's words for a refusal, kept with the workspace as a post's caption is. A
  // post's numbers are numbers alone.
  touches: { evidence: scrubbedBy("touches_trigger"), provider_event_id: NOT_PERSONAL },
  provider_events: {
    body: scrubbedBy("deliveries_scrub"),
    ...all(byAge("provider_events"), "provider_event_id", "door", "url", "headers"),
  },
};
