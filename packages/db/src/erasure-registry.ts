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
 *   not_personal  holds nothing of a person, said once.
 *
 * Which columns can hold words is the schema's: text, json and their arrays, in a table that names `tenant_id`, its
 * partitions read through it. A column the schema holds to a closed set (contracts SCHEMA_SETS) holds no person's words
 * and is not listed. A column with no strategy is counted: people/erasure/erasure-registry.test.mjs and the ratchet
 * "personal columns with no erasure strategy" (docs/debt.md) hold the count to fall, so a new column arrives with its
 * strategy. messages.body and messages.template_vars are counted on purpose: a message is immutable by trigger (00326),
 * so a person's words in someone else's thread stay until an exception to that is costed (Ruben, 6 October 2026).
 */
import type { RETENTION_DAYS } from "@chanlytics/contracts";

/** The legs an erasure runs, each where it is written. */
export const ERASURE_LEGS = {
  erase_contact:
    "erase_contact: the person's calls, messages, conversations and identities deleted, scheduled jobs and decision payloads scrubbed, the tombstone written (00027, 00151)",
  notes_trigger:
    "person_notes_erase_on_contact: their own notes deleted, the old notes field cleared, a note_for_you about them removed (00158)",
  events_trigger: "contact_events_on_erase: an event that named them cut to who did it and from where (00131)",
  consent_trigger:
    "erase_marketing_consent, consent_channels_on_erase, email_marketing_on_erase: their answers and where they came from cleared (00101)",
  email_trigger: "contact_email_on_erase: the address and why it was suppressed cleared (00125)",
  proposal_trigger: "contact_proposal_on_erase: the proposal's link cleared",
  deals_trigger: "deals_erase_on_contact: a deal's note, evidence and link cleared",
  leads_trigger:
    "leads_erase_on_contact: their lead blanked (lead_blank), its places deleted, its keys kept as digests",
  jobs_scrub: "scrubErasedJobs and erase_contact: a job's payload that carried their number or words overwritten",
  ask_scrub: "scrub_ask_for_contact: the assistant's turns that name them deleted (00238)",
  deliveries_scrub: "provider_events_scrub: a kept delivery that names them deleted (00336)",
  notes_scrub: "person_notes_scrub: their numbers and addresses overwritten in other people's notes (00341)",
  appointments_scrub:
    "appointments_scrub: their visits keep their time and service and lose the client's name, number, address and note; the notices that made them, and any whose subject names them, lose the name (00345)",
} as const;

export type ErasureLeg = keyof typeof ERASURE_LEGS;

/** One column's strategy. */
export type ErasureStrategy =
  | { readonly kind: "with_person"; readonly by: ErasureLeg }
  | { readonly kind: "scrubbed"; readonly by: readonly ErasureLeg[] }
  | { readonly kind: "digest" }
  | { readonly kind: "by_age"; readonly days: keyof typeof RETENTION_DAYS }
  | { readonly kind: "not_personal" };

const withPerson = (by: ErasureLeg): ErasureStrategy => ({ kind: "with_person", by });
const scrubbedBy = (...by: ErasureLeg[]): ErasureStrategy => ({ kind: "scrubbed", by });
const byAge = (days: keyof typeof RETENTION_DAYS): ErasureStrategy => ({ kind: "by_age", days });
const DIGEST: ErasureStrategy = { kind: "digest" };
const NOT_PERSONAL: ErasureStrategy = { kind: "not_personal" };

/** Every column in `names` with one strategy. */
const all = (strategy: ErasureStrategy, ...names: string[]): Record<string, ErasureStrategy> =>
  Object.fromEntries(names.map((n) => [n, strategy]));

/** Table, then column, then its strategy: what the legs reach today, and what is plainly no one's. */
export const ERASURE_STRATEGIES: Readonly<Record<string, Readonly<Record<string, ErasureStrategy>>>> = {
  ask_messages: { content: scrubbedBy("ask_scrub") },
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
  },
  conversations: all(withPerson("erase_contact"), "control_kind", "control_ref"),
  deals: all(scrubbedBy("deals_trigger"), "note", "evidence", "proposal_url"),
  decisions: { payload: scrubbedBy("erase_contact") },
  escalations: { details: withPerson("erase_contact") },
  event_deliveries: all(NOT_PERSONAL, "subscriber", "kind"),
  event_outbox: { kind: NOT_PERSONAL },
  events: {
    data: scrubbedBy("events_trigger"),
    ...all(NOT_PERSONAL, "kind", "category", "subject_type", "request_id"),
  },
  idempotency_keys: all(byAge("idempotency_keys"), "key", "route", "request_hash", "response"),
  jobs: { payload: scrubbedBy("jobs_scrub", "erase_contact") },
  lead_places: all(withPerson("leads_trigger"), "place_id", "title", "street"),
  lead_search_members: all(scrubbedBy("leads_trigger"), "judgment", "reason"),
  lead_suppressions: { hash: DIGEST },
  leads: all(
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
  ),
  messages: all(withPerson("erase_contact"), "template_name", "media", "external_id", "content_hash", "error", "meta"),
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
  // Gmail's pending confirmation of a forward to the workspace's address (00345): the owner's own account, and
  // Google's code and link for it. The workspace's, never a person's.
  mailboxes: all(NOT_PERSONAL, "forward_confirm_account", "forward_confirm_code", "forward_confirm_link"),
  person_notes: { body: scrubbedBy("notes_scrub", "notes_trigger") },
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
  provider_events: {
    body: scrubbedBy("deliveries_scrub"),
    ...all(byAge("provider_events"), "provider_event_id", "door", "url", "headers"),
  },
};
