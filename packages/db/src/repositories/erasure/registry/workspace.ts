/**
 * The workspace's own records: its billing, its business on record, its lines and channels, its members and partners,
 * the platform's acts on it, its policies and its settings. What each strategy means is said in
 * repositories/erasure/registry.ts.
 */
import { all, byAge, type ErasureStrategy, NOT_PERSONAL, WITH_WORKSPACE } from "../strategy";

/** Table, then column, then its strategy. */
export const WORKSPACE_TABLES: Readonly<Record<string, Readonly<Record<string, ErasureStrategy>>>> = {
  // The model ledger (00273): which model answered and a hash of the system prompt, never a customer's turn. A shadow
  // row's question and answers are labels from the question's own options; the rows go at 400 days whatever a later
  // writer puts there. A failed call's reason (00469) is the API's error type, and its words, which name no one but go
  // at 400 days with the row.
  ai_usage: {
    ...all(NOT_PERSONAL, "model", "model_asked", "prompt_hash", "error_type"),
    error_message: byAge("ai_usage"),
    ...all(byAge("ai_usage"), "question", "primary_answer", "shadow_answer"),
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
  // A team invitation's address: the workspace's while it is open or expired (the Team card sends it again); one
  // accepted or taken back goes with its address 30 days later (purge_invitations, 00392).
  invitations: { email: WITH_WORKSPACE },
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
  // The settings as they stood (decision 0039, step 3): the business's own, as tenant_config.config is, and unlike it
  // a version leaves by its clock once it is replaced.
  tenant_config_versions: { config: byAge("tenant_config_versions") },
  // A partner's ledger of the workspaces it brought: Stripe's ids, the code used, the sweep's checks and reasons; the
  // address a workspace is handed to, the workspace's, cleared once its new owner accepts (00392).
  partner_earnings: all(NOT_PERSONAL, "currency", "stripe_event_id", "stripe_invoice_id"),
  partner_tenants: {
    handover_email: WITH_WORKSPACE,
    ...all(NOT_PERSONAL, "checks", "code_used", "standing_why"),
  },
  // The Console (00467, decision 0066). What the team did and why: the platform's staff, a ticket's number, and a reason
  // the ask tells them to write without a customer's details (CONSOLE_WORDS.noteHint); kept as the log of the act.
  platform_acts: all(NOT_PERSONAL, "actor_email", "act", "ticket", "note", "outcome_note"),
  // Who on the team has a workspace taken: the platform's staff, gone in four hours or when let go.
  platform_claims: { email: NOT_PERSONAL },
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
  // What the first run chose (decision 0091): the business's own number and how its calls reach the receptionist, the
  // workspace's record; the steps it marked done, from a closed list.
  setup_choices: { phone: WITH_WORKSPACE, marks: NOT_PERSONAL },
  // The workspace's channels: their configuration, its own numbers and the provider's ids.
  tenant_channels: all(NOT_PERSONAL, "config", "credentials_ref", "external_id", "number_e164", "waba_id"),
  // The workspace's receptionist at the provider, made before its number (decision 0069): the provider's ids.
  voice_agents: all(NOT_PERSONAL, "agent_id", "llm_id"),
  // The receptionist's configuration, which names the addresses the workspace is alerted at.
  tenant_config: { config: WITH_WORKSPACE },
};
