/**
 * Every code an edge door answers a refusal with, and nothing it does not: the `error` of `{ ok: false, error }`.
 *
 * The code is what a caller compares -- the dashboard's routes, the platform's pages, a script -- so it is a word a
 * caller can switch on, never a sentence, and it never changes once a caller reads it. The words for a person or for
 * support ride beside it in `detail`. One refusal has one spelling (no database is `no_database`), and neither a
 * sentence nor the database's own words stand where a caller expects a code.
 *
 * The edge's `json` and `refuse` (apps/edge/lib/http.ts) take a body whose `error` is an `EdgeErrorCode`, so a code
 * outside the list is a type error wherever a door answers; tooling/scripts/tests/edge/error-codes.test.mjs holds the
 * list to the edge both ways, over the syntax tree: a code a refusal answers and not here, a code here that no refusal
 * answers, a refusal whose code is a value handed on and not named in its register, a sentence in an `error`. Sorted,
 * so two changes that add a code each land in different places. A new code is snake_case and names its domain first
 * (`line_retry_taken`); reuse one that says it before adding one.
 *
 * Not the app plane's envelope: /api/v1 answers `{ ok: false, error: { code, message } }` with ERROR_CODES
 * (errors.ts). This is the edge's, one level down, which the dashboard reads and translates into that one.
 */
export const EDGE_ERROR_CODES = [
  "accounts_unreadable",
  "already_registered",
  "already_sent",
  "already_subscribed",
  "ask_budget",
  "bad_request",
  "bad_secret",
  "bad_signature",
  "bad_template",
  "bad_tenant",
  "brain_failed",
  "calendar_backlog",
  "campaign_rejected",
  "channel_read_failed",
  "channel_write_failed",
  "check_unset",
  "cold_lane_unset",
  "config_broken",
  "connection_write_failed",
  "context_failed",
  "could_not_queue",
  "could_not_retire_old_draft",
  "credentials_failed",
  "direct",
  "dns_hold",
  "email_off",
  "empty_draft",
  "erasure_unreadable",
  "exchange_failed",
  "google_refused",
  "host_elsewhere",
  "host_taken",
  "in_flight",
  "ingest_failed",
  "invalid",
  "key_unavailable",
  "line_exists",
  "line_failed_retry",
  "line_not_retryable",
  "line_retry_taken",
  "listing_read_failed",
  "listing_write_failed",
  "message_read_failed",
  "meta_failed",
  "meta_refused",
  "mock_registration",
  "model_failed",
  "model_unavailable",
  "model_unreachable",
  "moved",
  "no_account",
  "no_app_credentials",
  "no_billing_record",
  "no_business_record",
  "no_campaign_to_resubmit",
  "no_channel",
  "no_cold_key",
  "no_credentials",
  "no_customer",
  "no_database",
  "no_domain_readable",
  "no_fn_secret",
  "no_line_credentials",
  "no_line_provider",
  "no_listing",
  "no_location",
  "no_locations",
  "no_messaging_service",
  "no_model_key",
  "no_oauth_client",
  "no_open_handover",
  "no_open_invitation",
  "no_persona",
  "no_phone",
  "no_places_key",
  "no_platform_mailbox",
  "no_primary_profile",
  "no_provider",
  "no_provider_credentials",
  "no_provider_key",
  "no_refresh_token",
  "no_registration_readable",
  "no_review",
  "no_sender",
  "no_subaccount",
  "no_subscription",
  "no_such_location",
  "no_token",
  "no_waba",
  "no_whatsapp_channel",
  "no_workspace_readable",
  "not_a_held_draft",
  "not_connected",
  "not_found",
  "not_from_profile",
  "not_held",
  "not_on_maps",
  "not_paused",
  "not_ready",
  "not_rejected",
  "not_trialing",
  "nothing_to_answer",
  "number_taken",
  "number_unreadable",
  "payment_required",
  "pin_required",
  "platform_hold",
  "platform_only",
  "playbooks_backlog",
  "policy_block_price",
  "policy_never",
  "preview_failed",
  "provider",
  "provider_refused",
  "provider_unauthorized",
  "purge_failed",
  "query_failed",
  "reach_out_step",
  "read_failed",
  "record_incomplete",
  "register_failed",
  "registration_pending",
  "replace_failed",
  "resubmit_failed",
  "review_read_failed",
  "review_write_failed",
  "routing_unreadable",
  "run_failed",
  "scope_missing",
  "signature",
  "sole_proprietor_incomplete",
  "stripe_refused",
  "stripe_unreadable",
  "subscribe_failed",
  "token_audience",
  "token_body",
  "token_expired",
  "token_malformed",
  "token_replayed",
  "token_required",
  "token_signature",
  "too_large",
  "too_many",
  "unauthorized",
  "unavailable",
  "unfile_failed",
  "unknown_op",
  "unreadable",
  "waba_unreadable",
  "workspace_mismatch",
  "write_failed",
] as const;

export type EdgeErrorCode = (typeof EDGE_ERROR_CODES)[number];

/**
 * The codes the dashboard's own side of an edge call answers with when no door answered: the call was never made
 * (`no_edge_credential`, this deployment holds nothing the edge honours; `preview`, a preview never calls a live
 * provider) or never came back (`edge_timeout`, `edge_unreachable`; apps/dashboard/src/server/edge.ts callEdge). No
 * edge door answers one, so they are not EDGE_ERROR_CODES; they are named here so the dashboard reads every code an
 * answer can carry from one union.
 */
export type EdgeCallCode = "edge_timeout" | "edge_unreachable" | "no_edge_credential" | "preview";

/** What an edge answer's `error` can be, as the dashboard reads it: a door's code, or the call's own. */
export type EdgeAnswerCode = EdgeErrorCode | EdgeCallCode;

/**
 * An edge answer's JSON body as the dashboard reads it: its code is one of the union, so a comparison with a code no
 * set names does not compile, and a code the edge renames fails the dashboard's typecheck at every place that reads
 * it; the other fields are each door's own.
 */
export type EdgeAnswerBody = { error?: EdgeAnswerCode; detail?: string; [field: string]: unknown };

/** An edge door's refusal: the code a caller compares, and the words for a person or for support when there are any. */
export type EdgeRefusal = { ok: false; error: EdgeErrorCode; detail?: string };
