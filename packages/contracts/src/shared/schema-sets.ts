/**
 * The database's closed sets, and every hand-kept copy held to them.
 *
 * SCHEMA_SETS is generated from the CHECK constraints themselves
 * (schema-sets.generated.ts, written by tooling/scripts/gen-schema-sets.mjs).
 * The lists written by hand stay where they are, because they carry an order, a
 * comment per value, or a narrower meaning. Each is held here to its column:
 * exactly where it mirrors it, as a subset where it is narrower on purpose. When
 * a migration changes a set and the file is regenerated, a stale copy stops
 * compiling on the line below that names it. packages/channels holds its own two
 * copies the same way, in channels/src/schema-agreement.ts.
 *
 * This replaced a test that read the migrations as text and had to guess which
 * CHECK was the latest -- it guessed wrong twice, and it could see 20 of the 53
 * sets. The database cannot be wrong about its own constraints.
 */
import type { SCHEMA_SETS } from "../schema-sets.generated";
import type {
  ACTOR_TYPES,
  CHANNEL_KINDS,
  CONSENT_STATES,
  CONVERSATION_STATES,
  DECISION_SUBJECTS,
  DECISION_VERBS,
  ESCALATION_REASONS,
  ESCALATION_STATES,
  JOB_KINDS,
  JOB_STATES,
  MEMBERSHIP_ROLES,
  MESSAGE_CHANNELS,
  MESSAGE_DIRECTIONS,
  MESSAGE_SENDERS,
  MESSAGE_STATUSES,
  MESSAGE_TYPES,
  TEMPLATE_STATUSES,
  TENANT_STATUSES,
} from "./enums";
import type { CAPABILITY_KINDS } from "../setup/capabilities";
import type { BUSINESS_TYPES, COMPANY_TYPES } from "../lines/a2p-enums";
import type { BILLING_MODES, BILLING_STATUSES } from "../workspace/billing";
import type {
  PARTNER_EARNING_KINDS,
  PARTNER_EARNING_STATES,
  PARTNER_REVERSAL_KINDS,
  PARTNER_STANDINGS,
  PARTNER_STATUSES,
} from "../workspace/partner";
import type { BROADCAST_STATES, REACH_OUT_SEND_STATES, RECIPIENT_STATES } from "../broadcasts/broadcasts";
import type { REPLY_INTENTS, REPLY_UNREADS } from "../reach-out/reach-out-replies";
import type { CALL_OUTCOMES } from "../voice/call-words";
import type { POLICY_CLASSES, POLICY_MODES } from "../config/workspace-config/policy-classes";
import type { DEAL_LOST_REASONS, DEAL_PERS, DEAL_SOURCES, DEAL_STAGES } from "../deals/deal-words";
import type { SELLS_BY } from "../deals/sells-by";
import type { SERVER_NOTIFICATION_KINDS } from "../today/notifications";
import type { PLAYBOOK_STATES, PLAYBOOK_TRIGGERS } from "../playbooks/playbooks";
import type { TEMPLATE_CATEGORIES } from "../templates/templates";
import type { PUSH_PLATFORMS } from "../today/push";
import type { DMARC_STATES, DOMAIN_HOLDS, DOMAIN_RESUMERS, SENDING_DOMAIN_STATES } from "../email/sending-domains";
import type {
  LEAD_CLOSED_REASONS,
  LEAD_COUNTER_KINDS,
  LEAD_EMAIL_STATES,
  LEAD_FITS,
  LEAD_MEMBER_CLASSES,
  LEAD_OPERATION_KINDS,
  LEAD_PREFERENCE_KINDS,
  LEAD_ROUND_ANSWERS,
  LEAD_ROUND_ENDINGS,
  LEAD_ROUND_PURPOSES,
  LEAD_ROUND_STATES,
  LEAD_RUN_PURPOSES,
  LEAD_RUN_STATES,
  LEAD_SEARCH_VIAS,
  LEAD_STAGES,
  LEAD_SUPPRESSION_KINDS,
  LEAD_SUPPRESSION_WHATS,
} from "../leads/search/sets";

export type SchemaSetKey = keyof typeof SCHEMA_SETS;
/** The values one column's CHECK allows, e.g. SchemaSet<"lines.voice_state">. */
export type SchemaSet<K extends SchemaSetKey> = (typeof SCHEMA_SETS)[K][number];

/** true when A and B are the same set of literals. */
export type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** true when every literal in A is also in B. */
export type Within<A, B> = [A] extends [B] ? true : false;
/** Compiles only when T is true, so the failing line names the pair that drifted. */
export type Holds<T extends true> = T;

type Of<T extends readonly unknown[]> = T[number];

export type SchemaAgreement = [
  // Workspaces and the people in them. Nobody is invited as an owner.
  Holds<Exactly<Of<typeof TENANT_STATUSES>, SchemaSet<"tenants.status">>>,
  Holds<Exactly<Of<typeof MEMBERSHIP_ROLES>, SchemaSet<"memberships.role">>>,
  Holds<Within<SchemaSet<"invitations.role">, Of<typeof MEMBERSHIP_ROLES>>>,

  // Partners (0012): the account, the standing of a workspace brought, the ledger.
  Holds<Exactly<Of<typeof PARTNER_STATUSES>, SchemaSet<"partners.status">>>,
  Holds<Exactly<Of<typeof PARTNER_STANDINGS>, SchemaSet<"partner_tenants.standing">>>,
  Holds<Exactly<Of<typeof PARTNER_EARNING_KINDS>, SchemaSet<"partner_earnings.kind">>>,
  Holds<Exactly<Of<typeof PARTNER_EARNING_STATES>, SchemaSet<"partner_earnings.state">>>,
  Holds<Exactly<Of<typeof PARTNER_REVERSAL_KINDS>, SchemaSet<"partner_reversals_waiting.kind">>>,

  // Channels and the people on them.
  Holds<Exactly<Of<typeof CHANNEL_KINDS>, SchemaSet<"tenant_channels.kind">>>,
  Holds<Exactly<Of<typeof CAPABILITY_KINDS>, SchemaSet<"capability_activations.capability">>>,
  Holds<Exactly<Of<typeof CHANNEL_KINDS>, SchemaSet<"contact_identities.channel">>>,
  Holds<Exactly<Of<typeof CHANNEL_KINDS>, SchemaSet<"templates.channel">>>,
  Holds<Exactly<Of<typeof CONSENT_STATES>, SchemaSet<"contacts.consent">>>,
  Holds<Exactly<Of<typeof CONSENT_STATES>, SchemaSet<"contacts.marketing_consent">>>,
  // The email answer (00174): the same three words, asked of marketing email (Reach out's unsubscribe).
  Holds<Exactly<Of<typeof CONSENT_STATES>, SchemaSet<"contacts.email_marketing">>>,

  // Conversations and messages.
  Holds<Exactly<Of<typeof CONVERSATION_STATES>, SchemaSet<"conversations.state">>>,
  Holds<Exactly<Of<typeof MESSAGE_CHANNELS>, SchemaSet<"messages.channel">>>,
  Holds<Exactly<Of<typeof MESSAGE_DIRECTIONS>, SchemaSet<"messages.direction">>>,
  Holds<Exactly<Of<typeof MESSAGE_SENDERS>, SchemaSet<"messages.sender">>>,
  Holds<Exactly<Of<typeof MESSAGE_TYPES>, SchemaSet<"messages.type">>>,
  Holds<Exactly<Of<typeof MESSAGE_STATUSES>, SchemaSet<"messages.status">>>,

  // The jobs ledger.
  Holds<Exactly<Of<typeof JOB_KINDS>, SchemaSet<"jobs.kind">>>,
  Holds<Exactly<Of<typeof JOB_STATES>, SchemaSet<"jobs.state">>>,
  Holds<Exactly<Of<typeof PUSH_PLATFORMS>, SchemaSet<"push_devices.platform">>>,

  // The inbox, and the ledger of who decided what.
  Holds<Exactly<Of<typeof ESCALATION_REASONS>, SchemaSet<"escalations.reason">>>,
  Holds<Exactly<Of<typeof ESCALATION_STATES>, SchemaSet<"escalations.state">>>,
  Holds<Exactly<Of<typeof DECISION_VERBS>, SchemaSet<"decisions.verb">>>,
  Holds<Exactly<Of<typeof DECISION_SUBJECTS>, SchemaSet<"decisions.subject_type">>>,
  Holds<Exactly<Of<typeof ACTOR_TYPES>, SchemaSet<"decisions.actor_type">>>,

  // Templates, policies and the bell. A template is authored as marketing or
  // utility here; Meta also files authentication templates, which sync in.
  Holds<Exactly<Of<typeof TEMPLATE_STATUSES>, SchemaSet<"templates.meta_status">>>,
  Holds<Within<Of<typeof TEMPLATE_CATEGORIES>, SchemaSet<"templates.category">>>,
  Holds<Exactly<Of<typeof POLICY_CLASSES>, SchemaSet<"policies.class">>>,
  Holds<Exactly<Of<typeof POLICY_MODES>, SchemaSet<"policies.mode">>>,
  Holds<Exactly<Of<typeof SERVER_NOTIFICATION_KINDS>, SchemaSet<"notifications.kind">>>,

  // Broadcasts and playbooks. A playbook runs under one of the policy classes.
  Holds<Exactly<Of<typeof BROADCAST_STATES>, SchemaSet<"broadcasts.state">>>,
  Holds<Exactly<Of<typeof RECIPIENT_STATES>, SchemaSet<"broadcast_recipients.state">>>,
  Holds<Exactly<Of<typeof REACH_OUT_SEND_STATES>, SchemaSet<"reach_out_sends.state">>>,
  // A reply's reading (00222): the seven intents the reader answers in, and the table that keeps them.
  Holds<Exactly<Of<typeof REPLY_INTENTS>, SchemaSet<"reach_out_replies.intent">>>,
  Holds<Exactly<Of<typeof REPLY_UNREADS>, SchemaSet<"reach_out_replies.unread">>>,
  Holds<Exactly<Of<typeof PLAYBOOK_STATES>, SchemaSet<"playbooks.state">>>,
  Holds<Exactly<(typeof PLAYBOOK_TRIGGERS)[number]["id"], SchemaSet<"playbooks.trigger">>>,
  Holds<Within<SchemaSet<"playbooks.policy_class">, Of<typeof POLICY_CLASSES>>>,

  // Calls, billing, and the business on record with the carriers.
  Holds<Exactly<Of<typeof MESSAGE_DIRECTIONS>, SchemaSet<"calls.direction">>>,
  Holds<Exactly<Of<typeof CALL_OUTCOMES>, SchemaSet<"calls.outcome">>>,
  Holds<Exactly<Of<typeof BILLING_MODES>, SchemaSet<"billing_accounts.mode">>>,
  Holds<Exactly<Of<typeof BILLING_STATUSES>, SchemaSet<"billing_accounts.status">>>,
  Holds<Exactly<Of<typeof BUSINESS_TYPES>, SchemaSet<"business_records.business_type">>>,
  Holds<Exactly<Of<typeof COMPANY_TYPES>, SchemaSet<"business_records.company_type">>>,

  // The lead finder (00140). A round's ending and its pending ending are one set.
  Holds<Exactly<Of<typeof LEAD_SEARCH_VIAS>, SchemaSet<"lead_searches.via">>>,
  Holds<Exactly<Of<typeof LEAD_ROUND_PURPOSES>, SchemaSet<"lead_rounds.purpose">>>,
  Holds<Exactly<Of<typeof LEAD_ROUND_STATES>, SchemaSet<"lead_rounds.state">>>,
  Holds<Exactly<Of<typeof LEAD_ROUND_ENDINGS>, SchemaSet<"lead_rounds.ending">>>,
  Holds<Exactly<Of<typeof LEAD_ROUND_ENDINGS>, SchemaSet<"lead_rounds.ending_pending">>>,
  Holds<Exactly<Of<typeof LEAD_ROUND_ANSWERS>, SchemaSet<"lead_rounds.answered">>>,
  Holds<Exactly<Of<typeof LEAD_RUN_PURPOSES>, SchemaSet<"lead_runs.purpose">>>,
  Holds<Exactly<Of<typeof LEAD_RUN_STATES>, SchemaSet<"lead_runs.state">>>,
  Holds<Exactly<Of<typeof LEAD_EMAIL_STATES>, SchemaSet<"leads.email_state">>>,
  Holds<Exactly<Of<typeof LEAD_STAGES>, SchemaSet<"leads.stage">>>,
  Holds<Exactly<Of<typeof LEAD_CLOSED_REASONS>, SchemaSet<"leads.closed_reason">>>,
  Holds<Exactly<Of<typeof LEAD_MEMBER_CLASSES>, SchemaSet<"lead_search_members.class">>>,
  Holds<Exactly<Of<typeof LEAD_FITS>, SchemaSet<"lead_search_members.fit">>>,
  Holds<Exactly<Of<typeof LEAD_COUNTER_KINDS>, SchemaSet<"lead_counters.kind">>>,
  Holds<Exactly<Of<typeof LEAD_OPERATION_KINDS>, SchemaSet<"lead_operations.kind">>>,
  Holds<Exactly<Of<typeof LEAD_PREFERENCE_KINDS>, SchemaSet<"lead_preferences.kind">>>,
  Holds<Exactly<Of<typeof LEAD_SUPPRESSION_KINDS>, SchemaSet<"lead_suppressions.kind">>>,
  Holds<Exactly<Of<typeof LEAD_SUPPRESSION_WHATS>, SchemaSet<"lead_suppressions.what">>>,

  // A deal is a record (00156): its stage, how an amount recurs, and who wrote it.
  Holds<Exactly<Of<typeof DEAL_STAGES>, SchemaSet<"deals.stage">>>,
  Holds<Exactly<Of<typeof DEAL_PERS>, SchemaSet<"deals.per">>>,
  Holds<Exactly<Of<typeof DEAL_SOURCES>, SchemaSet<"deals.source">>>,
  // A proposal is part of the deal (00160): why they passed, and how the workspace's customers buy.
  Holds<Exactly<Of<typeof DEAL_LOST_REASONS>, SchemaSet<"deals.lost_reason">>>,
  Holds<Exactly<Of<typeof SELLS_BY>, SchemaSet<"tenants.sells_by">>>,
  // A workspace sends cold email from its own domains (00175): where each stands, why one is held, and its DMARC.
  Holds<Exactly<Of<typeof SENDING_DOMAIN_STATES>, SchemaSet<"sending_domains.state">>>,
  Holds<Exactly<Of<typeof DOMAIN_HOLDS>, SchemaSet<"sending_domains.held_why">>>,
  Holds<Exactly<Of<typeof DMARC_STATES>, SchemaSet<"sending_domains.dmarc">>>,
  // Who lifts a reputation hold (00188, D16).
  Holds<Exactly<Of<typeof DOMAIN_RESUMERS>, SchemaSet<"sending_domains.resume_by">>>,
];
