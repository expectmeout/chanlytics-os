import { SupabaseClient } from '@supabase/supabase-js';
import { PurposeBearing, EventKind, SchemaSet, DealFacts, PersonRowDto } from '@chanlytics/contracts';

type Json = string | number | boolean | null | {
    [key: string]: Json | undefined;
} | Json[];
type Database = {
    graphql_public: {
        Tables: {
            [_ in never]: never;
        };
        Views: {
            [_ in never]: never;
        };
        Functions: {
            graphql: {
                Args: {
                    extensions?: Json;
                    operationName?: string;
                    query?: string;
                    variables?: Json;
                };
                Returns: Json;
            };
        };
        Enums: {
            [_ in never]: never;
        };
        CompositeTypes: {
            [_ in never]: never;
        };
    };
    public: {
        Tables: {
            ask_messages: {
                Row: {
                    content: Json;
                    created_at: string;
                    id: string;
                    role: string;
                    tenant_id: string;
                    thread_id: string;
                    user_id: string;
                };
                Insert: {
                    content?: Json;
                    created_at?: string;
                    id?: string;
                    role: string;
                    tenant_id: string;
                    thread_id: string;
                    user_id: string;
                };
                Update: {
                    content?: Json;
                    created_at?: string;
                    id?: string;
                    role?: string;
                    tenant_id?: string;
                    thread_id?: string;
                    user_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "ask_messages_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "ask_messages_thread_id_fkey";
                        columns: ["thread_id"];
                        isOneToOne: false;
                        referencedRelation: "ask_threads";
                        referencedColumns: ["id"];
                    }
                ];
            };
            ask_threads: {
                Row: {
                    created_at: string;
                    id: string;
                    last_at: string;
                    scope: Json | null;
                    tenant_id: string;
                    title: string;
                    user_id: string;
                };
                Insert: {
                    created_at?: string;
                    id?: string;
                    last_at?: string;
                    scope?: Json | null;
                    tenant_id: string;
                    title?: string;
                    user_id: string;
                };
                Update: {
                    created_at?: string;
                    id?: string;
                    last_at?: string;
                    scope?: Json | null;
                    tenant_id?: string;
                    title?: string;
                    user_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "ask_threads_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            billing_accounts: {
                Row: {
                    cancel_at: string | null;
                    cancel_at_period_end: boolean;
                    card_brand: string | null;
                    card_last4: string | null;
                    created_at: string;
                    current_period_end: string | null;
                    facts: Json;
                    last_paid_at: string | null;
                    last_payment_failed_at: string | null;
                    mode: string;
                    price_id: string | null;
                    status: string;
                    stripe_customer_id: string | null;
                    stripe_subscription_id: string | null;
                    tenant_id: string;
                    trial_end: string | null;
                    updated_at: string;
                };
                Insert: {
                    cancel_at?: string | null;
                    cancel_at_period_end?: boolean;
                    card_brand?: string | null;
                    card_last4?: string | null;
                    created_at?: string;
                    current_period_end?: string | null;
                    facts?: Json;
                    last_paid_at?: string | null;
                    last_payment_failed_at?: string | null;
                    mode?: string;
                    price_id?: string | null;
                    status?: string;
                    stripe_customer_id?: string | null;
                    stripe_subscription_id?: string | null;
                    tenant_id: string;
                    trial_end?: string | null;
                    updated_at?: string;
                };
                Update: {
                    cancel_at?: string | null;
                    cancel_at_period_end?: boolean;
                    card_brand?: string | null;
                    card_last4?: string | null;
                    created_at?: string;
                    current_period_end?: string | null;
                    facts?: Json;
                    last_paid_at?: string | null;
                    last_payment_failed_at?: string | null;
                    mode?: string;
                    price_id?: string | null;
                    status?: string;
                    stripe_customer_id?: string | null;
                    stripe_subscription_id?: string | null;
                    tenant_id?: string;
                    trial_end?: string | null;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "billing_accounts_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: true;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            billing_events: {
                Row: {
                    id: string;
                    received_at: string;
                    tenant_id: string | null;
                    type: string;
                };
                Insert: {
                    id: string;
                    received_at?: string;
                    tenant_id?: string | null;
                    type: string;
                };
                Update: {
                    id?: string;
                    received_at?: string;
                    tenant_id?: string | null;
                    type?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "billing_events_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            broadcast_recipients: {
                Row: {
                    broadcast_id: string;
                    contact_id: string;
                    facts: Json | null;
                    message_id: string | null;
                    reason: string | null;
                    sent_at: string | null;
                    state: string;
                    tenant_id: string;
                };
                Insert: {
                    broadcast_id: string;
                    contact_id: string;
                    facts?: Json | null;
                    message_id?: string | null;
                    reason?: string | null;
                    sent_at?: string | null;
                    state?: string;
                    tenant_id: string;
                };
                Update: {
                    broadcast_id?: string;
                    contact_id?: string;
                    facts?: Json | null;
                    message_id?: string | null;
                    reason?: string | null;
                    sent_at?: string | null;
                    state?: string;
                    tenant_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "broadcast_recipients_broadcast_id_fkey";
                        columns: ["broadcast_id"];
                        isOneToOne: false;
                        referencedRelation: "broadcasts";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "broadcast_recipients_contact_id_fkey";
                        columns: ["contact_id"];
                        isOneToOne: false;
                        referencedRelation: "contacts";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "broadcast_recipients_message_id_fkey";
                        columns: ["message_id"];
                        isOneToOne: false;
                        referencedRelation: "messages";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "broadcast_recipients_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            broadcasts: {
                Row: {
                    audience: Json;
                    created_at: string;
                    created_by: string | null;
                    failure: string | null;
                    finished_at: string | null;
                    id: string;
                    name: string;
                    params: Json;
                    playbook_id: string | null;
                    recipient_count: number;
                    run_for: string | null;
                    scheduled_for: string;
                    started_at: string | null;
                    state: string;
                    template_id: string;
                    template_language: string;
                    template_name: string;
                    tenant_id: string;
                    updated_at: string;
                };
                Insert: {
                    audience?: Json;
                    created_at?: string;
                    created_by?: string | null;
                    failure?: string | null;
                    finished_at?: string | null;
                    id?: string;
                    name: string;
                    params?: Json;
                    playbook_id?: string | null;
                    recipient_count?: number;
                    run_for?: string | null;
                    scheduled_for: string;
                    started_at?: string | null;
                    state?: string;
                    template_id: string;
                    template_language: string;
                    template_name: string;
                    tenant_id: string;
                    updated_at?: string;
                };
                Update: {
                    audience?: Json;
                    created_at?: string;
                    created_by?: string | null;
                    failure?: string | null;
                    finished_at?: string | null;
                    id?: string;
                    name?: string;
                    params?: Json;
                    playbook_id?: string | null;
                    recipient_count?: number;
                    run_for?: string | null;
                    scheduled_for?: string;
                    started_at?: string | null;
                    state?: string;
                    template_id?: string;
                    template_language?: string;
                    template_name?: string;
                    tenant_id?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "broadcasts_playbook_id_fkey";
                        columns: ["playbook_id"];
                        isOneToOne: false;
                        referencedRelation: "playbooks";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "broadcasts_template_id_fkey";
                        columns: ["template_id"];
                        isOneToOne: false;
                        referencedRelation: "templates";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "broadcasts_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            business_records: {
                Row: {
                    about: string;
                    business_type: string;
                    city: string;
                    company_type: string;
                    contact_email: string;
                    contact_first_name: string;
                    contact_job_position: string;
                    contact_last_name: string;
                    contact_phone: string;
                    contact_title: string;
                    country: string;
                    created_at: string;
                    ein: string | null;
                    industry: string;
                    legal_name: string;
                    postal_code: string;
                    region: string;
                    street: string;
                    street_secondary: string | null;
                    tenant_id: string;
                    trade_name: string | null;
                    updated_at: string;
                    website_url: string;
                };
                Insert: {
                    about?: string;
                    business_type?: string;
                    city: string;
                    company_type?: string;
                    contact_email: string;
                    contact_first_name: string;
                    contact_job_position?: string;
                    contact_last_name: string;
                    contact_phone: string;
                    contact_title?: string;
                    country?: string;
                    created_at?: string;
                    ein?: string | null;
                    industry?: string;
                    legal_name: string;
                    postal_code: string;
                    region: string;
                    street: string;
                    street_secondary?: string | null;
                    tenant_id: string;
                    trade_name?: string | null;
                    updated_at?: string;
                    website_url: string;
                };
                Update: {
                    about?: string;
                    business_type?: string;
                    city?: string;
                    company_type?: string;
                    contact_email?: string;
                    contact_first_name?: string;
                    contact_job_position?: string;
                    contact_last_name?: string;
                    contact_phone?: string;
                    contact_title?: string;
                    country?: string;
                    created_at?: string;
                    ein?: string | null;
                    industry?: string;
                    legal_name?: string;
                    postal_code?: string;
                    region?: string;
                    street?: string;
                    street_secondary?: string | null;
                    tenant_id?: string;
                    trade_name?: string | null;
                    updated_at?: string;
                    website_url?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "business_records_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: true;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            calls: {
                Row: {
                    agent_id: string | null;
                    analysis: Json | null;
                    call_successful: boolean | null;
                    call_type: string | null;
                    caller_name: string | null;
                    channel_id: string | null;
                    contact_id: string | null;
                    conversation_id: string | null;
                    cost: Json | null;
                    created_at: string;
                    direction: string;
                    disconnection_reason: string | null;
                    duration_ms: number | null;
                    ended_at: string | null;
                    follow_up: string | null;
                    from_e164: string | null;
                    from_raw: string | null;
                    id: string;
                    in_voicemail: boolean | null;
                    latency: Json | null;
                    message_id: string | null;
                    note_checked_at: string | null;
                    notified_at: string | null;
                    outcome: string | null;
                    public_log_url: string | null;
                    raw: Json;
                    recording: Json | null;
                    retell_call_id: string;
                    sentiment: string | null;
                    started_at: string | null;
                    status: string;
                    summary: string | null;
                    tenant_id: string;
                    to_e164: string | null;
                    transcript: string | null;
                    transcript_object: Json | null;
                    updated_at: string;
                    wanted: string | null;
                };
                Insert: {
                    agent_id?: string | null;
                    analysis?: Json | null;
                    call_successful?: boolean | null;
                    call_type?: string | null;
                    caller_name?: string | null;
                    channel_id?: string | null;
                    contact_id?: string | null;
                    conversation_id?: string | null;
                    cost?: Json | null;
                    created_at?: string;
                    direction?: string;
                    disconnection_reason?: string | null;
                    duration_ms?: number | null;
                    ended_at?: string | null;
                    follow_up?: string | null;
                    from_e164?: string | null;
                    from_raw?: string | null;
                    id?: string;
                    in_voicemail?: boolean | null;
                    latency?: Json | null;
                    message_id?: string | null;
                    note_checked_at?: string | null;
                    notified_at?: string | null;
                    outcome?: string | null;
                    public_log_url?: string | null;
                    raw?: Json;
                    recording?: Json | null;
                    retell_call_id: string;
                    sentiment?: string | null;
                    started_at?: string | null;
                    status?: string;
                    summary?: string | null;
                    tenant_id: string;
                    to_e164?: string | null;
                    transcript?: string | null;
                    transcript_object?: Json | null;
                    updated_at?: string;
                    wanted?: string | null;
                };
                Update: {
                    agent_id?: string | null;
                    analysis?: Json | null;
                    call_successful?: boolean | null;
                    call_type?: string | null;
                    caller_name?: string | null;
                    channel_id?: string | null;
                    contact_id?: string | null;
                    conversation_id?: string | null;
                    cost?: Json | null;
                    created_at?: string;
                    direction?: string;
                    disconnection_reason?: string | null;
                    duration_ms?: number | null;
                    ended_at?: string | null;
                    follow_up?: string | null;
                    from_e164?: string | null;
                    from_raw?: string | null;
                    id?: string;
                    in_voicemail?: boolean | null;
                    latency?: Json | null;
                    message_id?: string | null;
                    note_checked_at?: string | null;
                    notified_at?: string | null;
                    outcome?: string | null;
                    public_log_url?: string | null;
                    raw?: Json;
                    recording?: Json | null;
                    retell_call_id?: string;
                    sentiment?: string | null;
                    started_at?: string | null;
                    status?: string;
                    summary?: string | null;
                    tenant_id?: string;
                    to_e164?: string | null;
                    transcript?: string | null;
                    transcript_object?: Json | null;
                    updated_at?: string;
                    wanted?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "calls_channel_id_fkey";
                        columns: ["channel_id"];
                        isOneToOne: false;
                        referencedRelation: "tenant_channels";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "calls_contact_id_fkey";
                        columns: ["contact_id"];
                        isOneToOne: false;
                        referencedRelation: "contacts";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "calls_conversation_id_fkey";
                        columns: ["conversation_id"];
                        isOneToOne: false;
                        referencedRelation: "conversations";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "calls_message_id_fkey";
                        columns: ["message_id"];
                        isOneToOne: false;
                        referencedRelation: "messages";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "calls_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            capability_activations: {
                Row: {
                    activated_at: string;
                    activated_by: string | null;
                    capability: string;
                    deactivated_at: string | null;
                    note: string | null;
                    tenant_id: string;
                };
                Insert: {
                    activated_at?: string;
                    activated_by?: string | null;
                    capability: string;
                    deactivated_at?: string | null;
                    note?: string | null;
                    tenant_id: string;
                };
                Update: {
                    activated_at?: string;
                    activated_by?: string | null;
                    capability?: string;
                    deactivated_at?: string | null;
                    note?: string | null;
                    tenant_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "capability_activations_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            contact_identities: {
                Row: {
                    channel: string;
                    contact_id: string;
                    created_at: string;
                    external_id: string;
                    id: string;
                    raw: Json;
                    tenant_id: string;
                };
                Insert: {
                    channel: string;
                    contact_id: string;
                    created_at?: string;
                    external_id: string;
                    id?: string;
                    raw?: Json;
                    tenant_id: string;
                };
                Update: {
                    channel?: string;
                    contact_id?: string;
                    created_at?: string;
                    external_id?: string;
                    id?: string;
                    raw?: Json;
                    tenant_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "contact_identities_contact_id_fkey";
                        columns: ["contact_id"];
                        isOneToOne: false;
                        referencedRelation: "contacts";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "contact_identities_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            contacts: {
                Row: {
                    consent: string;
                    consent_source: string | null;
                    consent_updated_at: string | null;
                    created_at: string;
                    display_name: string | null;
                    dnc: boolean;
                    email: string | null;
                    email_suppressed_at: string | null;
                    email_suppressed_reason: string | null;
                    erased_at: string | null;
                    erased_email_hash: string | null;
                    erased_phone_hash: string | null;
                    erasing_since: string | null;
                    first_seen_at: string;
                    id: string;
                    last_seen_at: string;
                    marketing_consent: string;
                    marketing_consent_source: string | null;
                    marketing_consent_updated_at: string | null;
                    merged_into_contact_id: string | null;
                    notes: string | null;
                    phone_e164: string | null;
                    proposal_url: string | null;
                    tenant_id: string;
                    updated_at: string;
                    wa_profile_name: string | null;
                };
                Insert: {
                    consent?: string;
                    consent_source?: string | null;
                    consent_updated_at?: string | null;
                    created_at?: string;
                    display_name?: string | null;
                    dnc?: boolean;
                    email?: string | null;
                    email_suppressed_at?: string | null;
                    email_suppressed_reason?: string | null;
                    erased_at?: string | null;
                    erased_email_hash?: string | null;
                    erased_phone_hash?: string | null;
                    erasing_since?: string | null;
                    first_seen_at?: string;
                    id?: string;
                    last_seen_at?: string;
                    marketing_consent?: string;
                    marketing_consent_source?: string | null;
                    marketing_consent_updated_at?: string | null;
                    merged_into_contact_id?: string | null;
                    notes?: string | null;
                    phone_e164?: string | null;
                    proposal_url?: string | null;
                    tenant_id: string;
                    updated_at?: string;
                    wa_profile_name?: string | null;
                };
                Update: {
                    consent?: string;
                    consent_source?: string | null;
                    consent_updated_at?: string | null;
                    created_at?: string;
                    display_name?: string | null;
                    dnc?: boolean;
                    email?: string | null;
                    email_suppressed_at?: string | null;
                    email_suppressed_reason?: string | null;
                    erased_at?: string | null;
                    erased_email_hash?: string | null;
                    erased_phone_hash?: string | null;
                    erasing_since?: string | null;
                    first_seen_at?: string;
                    id?: string;
                    last_seen_at?: string;
                    marketing_consent?: string;
                    marketing_consent_source?: string | null;
                    marketing_consent_updated_at?: string | null;
                    merged_into_contact_id?: string | null;
                    notes?: string | null;
                    phone_e164?: string | null;
                    proposal_url?: string | null;
                    tenant_id?: string;
                    updated_at?: string;
                    wa_profile_name?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "contacts_merged_into_contact_id_fkey";
                        columns: ["merged_into_contact_id"];
                        isOneToOne: false;
                        referencedRelation: "contacts";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "contacts_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            conversations: {
                Row: {
                    assignee_user_id: string | null;
                    contact_id: string;
                    control_by: string | null;
                    control_kind: string | null;
                    control_ref: string | null;
                    control_until: string | null;
                    created_at: string;
                    id: string;
                    last_inbound_at: string | null;
                    last_message_at: string | null;
                    last_wa_inbound_at: string | null;
                    note_checked_at: string | null;
                    paused_until: string | null;
                    snooze_until: string | null;
                    state: string;
                    tenant_id: string;
                    updated_at: string;
                };
                Insert: {
                    assignee_user_id?: string | null;
                    contact_id: string;
                    control_by?: string | null;
                    control_kind?: string | null;
                    control_ref?: string | null;
                    control_until?: string | null;
                    created_at?: string;
                    id?: string;
                    last_inbound_at?: string | null;
                    last_message_at?: string | null;
                    last_wa_inbound_at?: string | null;
                    note_checked_at?: string | null;
                    paused_until?: string | null;
                    snooze_until?: string | null;
                    state?: string;
                    tenant_id: string;
                    updated_at?: string;
                };
                Update: {
                    assignee_user_id?: string | null;
                    contact_id?: string;
                    control_by?: string | null;
                    control_kind?: string | null;
                    control_ref?: string | null;
                    control_until?: string | null;
                    created_at?: string;
                    id?: string;
                    last_inbound_at?: string | null;
                    last_message_at?: string | null;
                    last_wa_inbound_at?: string | null;
                    note_checked_at?: string | null;
                    paused_until?: string | null;
                    snooze_until?: string | null;
                    state?: string;
                    tenant_id?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "conversations_contact_id_fkey";
                        columns: ["contact_id"];
                        isOneToOne: false;
                        referencedRelation: "contacts";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "conversations_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            deals: {
                Row: {
                    amount_cents: number | null;
                    contact_id: string;
                    created_at: string;
                    created_by: string | null;
                    currency: string;
                    decided_at: string | null;
                    ended_at: string | null;
                    evidence: Json | null;
                    id: string;
                    lead_id: string | null;
                    lost_reason: string | null;
                    note: string | null;
                    per: string | null;
                    proposal_url: string | null;
                    proposed_at: string;
                    service: string | null;
                    source: string;
                    stage: string;
                    tenant_id: string;
                    updated_at: string;
                    valid_until: string | null;
                    version: number;
                };
                Insert: {
                    amount_cents?: number | null;
                    contact_id: string;
                    created_at?: string;
                    created_by?: string | null;
                    currency?: string;
                    decided_at?: string | null;
                    ended_at?: string | null;
                    evidence?: Json | null;
                    id?: string;
                    lead_id?: string | null;
                    lost_reason?: string | null;
                    note?: string | null;
                    per?: string | null;
                    proposal_url?: string | null;
                    proposed_at?: string;
                    service?: string | null;
                    source?: string;
                    stage: string;
                    tenant_id: string;
                    updated_at?: string;
                    valid_until?: string | null;
                    version?: number;
                };
                Update: {
                    amount_cents?: number | null;
                    contact_id?: string;
                    created_at?: string;
                    created_by?: string | null;
                    currency?: string;
                    decided_at?: string | null;
                    ended_at?: string | null;
                    evidence?: Json | null;
                    id?: string;
                    lead_id?: string | null;
                    lost_reason?: string | null;
                    note?: string | null;
                    per?: string | null;
                    proposal_url?: string | null;
                    proposed_at?: string;
                    service?: string | null;
                    source?: string;
                    stage?: string;
                    tenant_id?: string;
                    updated_at?: string;
                    valid_until?: string | null;
                    version?: number;
                };
                Relationships: [
                    {
                        foreignKeyName: "deals_contact_id_fkey";
                        columns: ["contact_id"];
                        isOneToOne: false;
                        referencedRelation: "contacts";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "deals_lead_id_fkey";
                        columns: ["lead_id"];
                        isOneToOne: false;
                        referencedRelation: "leads";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "deals_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            decisions: {
                Row: {
                    actor_type: string;
                    actor_user_id: string | null;
                    created_at: string;
                    id: string;
                    payload: Json;
                    subject_id: string;
                    subject_type: string;
                    tenant_id: string;
                    undo_of: string | null;
                    verb: string;
                };
                Insert: {
                    actor_type: string;
                    actor_user_id?: string | null;
                    created_at?: string;
                    id?: string;
                    payload?: Json;
                    subject_id: string;
                    subject_type: string;
                    tenant_id: string;
                    undo_of?: string | null;
                    verb: string;
                };
                Update: {
                    actor_type?: string;
                    actor_user_id?: string | null;
                    created_at?: string;
                    id?: string;
                    payload?: Json;
                    subject_id?: string;
                    subject_type?: string;
                    tenant_id?: string;
                    undo_of?: string | null;
                    verb?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "decisions_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "decisions_undo_of_fkey";
                        columns: ["undo_of"];
                        isOneToOne: false;
                        referencedRelation: "decisions";
                        referencedColumns: ["id"];
                    }
                ];
            };
            escalations: {
                Row: {
                    conversation_id: string;
                    created_at: string;
                    deadman_alerted_at: string | null;
                    decision_id: string | null;
                    details: string | null;
                    id: string;
                    reason: string;
                    resolved_by_user_id: string | null;
                    state: string;
                    tenant_id: string;
                    updated_at: string;
                };
                Insert: {
                    conversation_id: string;
                    created_at?: string;
                    deadman_alerted_at?: string | null;
                    decision_id?: string | null;
                    details?: string | null;
                    id?: string;
                    reason: string;
                    resolved_by_user_id?: string | null;
                    state?: string;
                    tenant_id: string;
                    updated_at?: string;
                };
                Update: {
                    conversation_id?: string;
                    created_at?: string;
                    deadman_alerted_at?: string | null;
                    decision_id?: string | null;
                    details?: string | null;
                    id?: string;
                    reason?: string;
                    resolved_by_user_id?: string | null;
                    state?: string;
                    tenant_id?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "escalations_conversation_id_fkey";
                        columns: ["conversation_id"];
                        isOneToOne: false;
                        referencedRelation: "conversations";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "escalations_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            events: {
                Row: {
                    category: string;
                    created_at: string;
                    data: Json;
                    id: string;
                    kind: string;
                    subject_id: string | null;
                    subject_type: string | null;
                    tenant_id: string;
                };
                Insert: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id: string;
                };
                Update: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind?: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id?: string;
                };
                Relationships: [];
            };
            events_default: {
                Row: {
                    category: string;
                    created_at: string;
                    data: Json;
                    id: string;
                    kind: string;
                    subject_id: string | null;
                    subject_type: string | null;
                    tenant_id: string;
                };
                Insert: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id: string;
                };
                Update: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind?: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id?: string;
                };
                Relationships: [];
            };
            events_y2026m09: {
                Row: {
                    category: string;
                    created_at: string;
                    data: Json;
                    id: string;
                    kind: string;
                    subject_id: string | null;
                    subject_type: string | null;
                    tenant_id: string;
                };
                Insert: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id: string;
                };
                Update: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind?: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id?: string;
                };
                Relationships: [];
            };
            events_y2026m10: {
                Row: {
                    category: string;
                    created_at: string;
                    data: Json;
                    id: string;
                    kind: string;
                    subject_id: string | null;
                    subject_type: string | null;
                    tenant_id: string;
                };
                Insert: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id: string;
                };
                Update: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind?: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id?: string;
                };
                Relationships: [];
            };
            events_y2026m11: {
                Row: {
                    category: string;
                    created_at: string;
                    data: Json;
                    id: string;
                    kind: string;
                    subject_id: string | null;
                    subject_type: string | null;
                    tenant_id: string;
                };
                Insert: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id: string;
                };
                Update: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind?: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id?: string;
                };
                Relationships: [];
            };
            events_y2026m12: {
                Row: {
                    category: string;
                    created_at: string;
                    data: Json;
                    id: string;
                    kind: string;
                    subject_id: string | null;
                    subject_type: string | null;
                    tenant_id: string;
                };
                Insert: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id: string;
                };
                Update: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind?: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id?: string;
                };
                Relationships: [];
            };
            events_y2027m01: {
                Row: {
                    category: string;
                    created_at: string;
                    data: Json;
                    id: string;
                    kind: string;
                    subject_id: string | null;
                    subject_type: string | null;
                    tenant_id: string;
                };
                Insert: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id: string;
                };
                Update: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind?: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id?: string;
                };
                Relationships: [];
            };
            events_y2027m02: {
                Row: {
                    category: string;
                    created_at: string;
                    data: Json;
                    id: string;
                    kind: string;
                    subject_id: string | null;
                    subject_type: string | null;
                    tenant_id: string;
                };
                Insert: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id: string;
                };
                Update: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind?: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id?: string;
                };
                Relationships: [];
            };
            events_y2027m03: {
                Row: {
                    category: string;
                    created_at: string;
                    data: Json;
                    id: string;
                    kind: string;
                    subject_id: string | null;
                    subject_type: string | null;
                    tenant_id: string;
                };
                Insert: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id: string;
                };
                Update: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind?: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id?: string;
                };
                Relationships: [];
            };
            events_y2027m04: {
                Row: {
                    category: string;
                    created_at: string;
                    data: Json;
                    id: string;
                    kind: string;
                    subject_id: string | null;
                    subject_type: string | null;
                    tenant_id: string;
                };
                Insert: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id: string;
                };
                Update: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind?: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id?: string;
                };
                Relationships: [];
            };
            events_y2027m05: {
                Row: {
                    category: string;
                    created_at: string;
                    data: Json;
                    id: string;
                    kind: string;
                    subject_id: string | null;
                    subject_type: string | null;
                    tenant_id: string;
                };
                Insert: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id: string;
                };
                Update: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind?: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id?: string;
                };
                Relationships: [];
            };
            events_y2027m06: {
                Row: {
                    category: string;
                    created_at: string;
                    data: Json;
                    id: string;
                    kind: string;
                    subject_id: string | null;
                    subject_type: string | null;
                    tenant_id: string;
                };
                Insert: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id: string;
                };
                Update: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind?: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id?: string;
                };
                Relationships: [];
            };
            events_y2027m07: {
                Row: {
                    category: string;
                    created_at: string;
                    data: Json;
                    id: string;
                    kind: string;
                    subject_id: string | null;
                    subject_type: string | null;
                    tenant_id: string;
                };
                Insert: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id: string;
                };
                Update: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind?: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id?: string;
                };
                Relationships: [];
            };
            events_y2027m08: {
                Row: {
                    category: string;
                    created_at: string;
                    data: Json;
                    id: string;
                    kind: string;
                    subject_id: string | null;
                    subject_type: string | null;
                    tenant_id: string;
                };
                Insert: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id: string;
                };
                Update: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind?: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id?: string;
                };
                Relationships: [];
            };
            events_y2027m09: {
                Row: {
                    category: string;
                    created_at: string;
                    data: Json;
                    id: string;
                    kind: string;
                    subject_id: string | null;
                    subject_type: string | null;
                    tenant_id: string;
                };
                Insert: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id: string;
                };
                Update: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind?: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id?: string;
                };
                Relationships: [];
            };
            events_y2027m10: {
                Row: {
                    category: string;
                    created_at: string;
                    data: Json;
                    id: string;
                    kind: string;
                    subject_id: string | null;
                    subject_type: string | null;
                    tenant_id: string;
                };
                Insert: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id: string;
                };
                Update: {
                    category?: string;
                    created_at?: string;
                    data?: Json;
                    id?: string;
                    kind?: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id?: string;
                };
                Relationships: [];
            };
            google_connections: {
                Row: {
                    account_name: string;
                    account_title: string | null;
                    connected_at: string;
                    connected_by: string | null;
                    created_at: string;
                    credentials_ref: string | null;
                    facts: Json;
                    google_email: string | null;
                    google_sub: string | null;
                    last_synced_at: string | null;
                    location_name: string | null;
                    location_title: string | null;
                    scopes: string[];
                    sync_error: string | null;
                    tenant_id: string;
                    updated_at: string;
                };
                Insert: {
                    account_name: string;
                    account_title?: string | null;
                    connected_at?: string;
                    connected_by?: string | null;
                    created_at?: string;
                    credentials_ref?: string | null;
                    facts?: Json;
                    google_email?: string | null;
                    google_sub?: string | null;
                    last_synced_at?: string | null;
                    location_name?: string | null;
                    location_title?: string | null;
                    scopes?: string[];
                    sync_error?: string | null;
                    tenant_id: string;
                    updated_at?: string;
                };
                Update: {
                    account_name?: string;
                    account_title?: string | null;
                    connected_at?: string;
                    connected_by?: string | null;
                    created_at?: string;
                    credentials_ref?: string | null;
                    facts?: Json;
                    google_email?: string | null;
                    google_sub?: string | null;
                    last_synced_at?: string | null;
                    location_name?: string | null;
                    location_title?: string | null;
                    scopes?: string[];
                    sync_error?: string | null;
                    tenant_id?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "google_connections_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: true;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            google_listing_days: {
                Row: {
                    day: string;
                    rating: number | null;
                    review_count: number;
                    tenant_id: string;
                };
                Insert: {
                    day: string;
                    rating?: number | null;
                    review_count: number;
                    tenant_id: string;
                };
                Update: {
                    day?: string;
                    rating?: number | null;
                    review_count?: number;
                    tenant_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "google_listing_days_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "google_listings";
                        referencedColumns: ["tenant_id"];
                    }
                ];
            };
            google_listings: {
                Row: {
                    address: string | null;
                    business_status: string | null;
                    check_error: string | null;
                    checked_at: string | null;
                    created_at: string;
                    facts: Json;
                    linked_at: string;
                    linked_by: string | null;
                    maps_uri: string | null;
                    name: string;
                    place_id: string;
                    rating: number | null;
                    review_count: number | null;
                    tenant_id: string;
                    updated_at: string;
                };
                Insert: {
                    address?: string | null;
                    business_status?: string | null;
                    check_error?: string | null;
                    checked_at?: string | null;
                    created_at?: string;
                    facts?: Json;
                    linked_at?: string;
                    linked_by?: string | null;
                    maps_uri?: string | null;
                    name: string;
                    place_id: string;
                    rating?: number | null;
                    review_count?: number | null;
                    tenant_id: string;
                    updated_at?: string;
                };
                Update: {
                    address?: string | null;
                    business_status?: string | null;
                    check_error?: string | null;
                    checked_at?: string | null;
                    created_at?: string;
                    facts?: Json;
                    linked_at?: string;
                    linked_by?: string | null;
                    maps_uri?: string | null;
                    name?: string;
                    place_id?: string;
                    rating?: number | null;
                    review_count?: number | null;
                    tenant_id?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "google_listings_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: true;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            google_reviews: {
                Row: {
                    author: string | null;
                    author_photo_uri: string | null;
                    author_uri: string | null;
                    body: string | null;
                    first_seen_at: string;
                    id: string;
                    language_code: string | null;
                    last_seen_at: string;
                    maps_uri: string | null;
                    origin: string;
                    published_at: string | null;
                    rating: number | null;
                    replied_at: string | null;
                    reply_text: string | null;
                    review_id: string;
                    tenant_id: string;
                };
                Insert: {
                    author?: string | null;
                    author_photo_uri?: string | null;
                    author_uri?: string | null;
                    body?: string | null;
                    first_seen_at?: string;
                    id?: string;
                    language_code?: string | null;
                    last_seen_at?: string;
                    maps_uri?: string | null;
                    origin?: string;
                    published_at?: string | null;
                    rating?: number | null;
                    replied_at?: string | null;
                    reply_text?: string | null;
                    review_id: string;
                    tenant_id: string;
                };
                Update: {
                    author?: string | null;
                    author_photo_uri?: string | null;
                    author_uri?: string | null;
                    body?: string | null;
                    first_seen_at?: string;
                    id?: string;
                    language_code?: string | null;
                    last_seen_at?: string;
                    maps_uri?: string | null;
                    origin?: string;
                    published_at?: string | null;
                    rating?: number | null;
                    replied_at?: string | null;
                    reply_text?: string | null;
                    review_id?: string;
                    tenant_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "google_reviews_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "google_listings";
                        referencedColumns: ["tenant_id"];
                    }
                ];
            };
            idempotency_keys: {
                Row: {
                    created_at: string;
                    id: string;
                    key: string;
                    request_hash: string | null;
                    response: Json | null;
                    route: string;
                    tenant_id: string;
                };
                Insert: {
                    created_at?: string;
                    id?: string;
                    key: string;
                    request_hash?: string | null;
                    response?: Json | null;
                    route: string;
                    tenant_id: string;
                };
                Update: {
                    created_at?: string;
                    id?: string;
                    key?: string;
                    request_hash?: string | null;
                    response?: Json | null;
                    route?: string;
                    tenant_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "idempotency_keys_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            invitations: {
                Row: {
                    accepted_at: string | null;
                    created_at: string;
                    email: string;
                    expires_at: string;
                    id: string;
                    invited_by: string;
                    revoked_at: string | null;
                    role: string;
                    tenant_id: string;
                };
                Insert: {
                    accepted_at?: string | null;
                    created_at?: string;
                    email: string;
                    expires_at?: string;
                    id?: string;
                    invited_by: string;
                    revoked_at?: string | null;
                    role: string;
                    tenant_id: string;
                };
                Update: {
                    accepted_at?: string | null;
                    created_at?: string;
                    email?: string;
                    expires_at?: string;
                    id?: string;
                    invited_by?: string;
                    revoked_at?: string | null;
                    role?: string;
                    tenant_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "invitations_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            jobs: {
                Row: {
                    attempts: number;
                    created_at: string;
                    due_at: string;
                    fired_at: string | null;
                    id: string;
                    kind: string;
                    last_error: string | null;
                    lease_until: string | null;
                    payload: Json;
                    state: string;
                    tenant_id: string;
                    updated_at: string;
                };
                Insert: {
                    attempts?: number;
                    created_at?: string;
                    due_at: string;
                    fired_at?: string | null;
                    id?: string;
                    kind: string;
                    last_error?: string | null;
                    lease_until?: string | null;
                    payload?: Json;
                    state?: string;
                    tenant_id: string;
                    updated_at?: string;
                };
                Update: {
                    attempts?: number;
                    created_at?: string;
                    due_at?: string;
                    fired_at?: string | null;
                    id?: string;
                    kind?: string;
                    last_error?: string | null;
                    lease_until?: string | null;
                    payload?: Json;
                    state?: string;
                    tenant_id?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "jobs_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            lead_counters: {
                Row: {
                    id: string;
                    kind: string;
                    period: string;
                    reserved: number;
                    tenant_id: string | null;
                    updated_at: string;
                    used: number;
                };
                Insert: {
                    id?: string;
                    kind: string;
                    period: string;
                    reserved?: number;
                    tenant_id?: string | null;
                    updated_at?: string;
                    used?: number;
                };
                Update: {
                    id?: string;
                    kind?: string;
                    period?: string;
                    reserved?: number;
                    tenant_id?: string | null;
                    updated_at?: string;
                    used?: number;
                };
                Relationships: [
                    {
                        foreignKeyName: "lead_counters_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            lead_judgments: {
                Row: {
                    answer: Json;
                    batch: number;
                    created_at: string;
                    id: string;
                    model: string | null;
                    op_id: string;
                    request_hash: string | null;
                    round_id: string;
                    tenant_id: string;
                    tokens: number;
                };
                Insert: {
                    answer: Json;
                    batch?: number;
                    created_at?: string;
                    id?: string;
                    model?: string | null;
                    op_id: string;
                    request_hash?: string | null;
                    round_id: string;
                    tenant_id: string;
                    tokens?: number;
                };
                Update: {
                    answer?: Json;
                    batch?: number;
                    created_at?: string;
                    id?: string;
                    model?: string | null;
                    op_id?: string;
                    request_hash?: string | null;
                    round_id?: string;
                    tenant_id?: string;
                    tokens?: number;
                };
                Relationships: [
                    {
                        foreignKeyName: "lead_judgments_round_id_fkey";
                        columns: ["round_id"];
                        isOneToOne: false;
                        referencedRelation: "lead_rounds";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "lead_judgments_round_id_fkey";
                        columns: ["round_id"];
                        isOneToOne: false;
                        referencedRelation: "lead_searches_view";
                        referencedColumns: ["round_id"];
                    },
                    {
                        foreignKeyName: "lead_judgments_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            lead_niche_priors: {
                Row: {
                    category_key: string;
                    matched: number;
                    places: number;
                    updated_at: string;
                    with_email: number;
                };
                Insert: {
                    category_key: string;
                    matched?: number;
                    places?: number;
                    updated_at?: string;
                    with_email?: number;
                };
                Update: {
                    category_key?: string;
                    matched?: number;
                    places?: number;
                    updated_at?: string;
                    with_email?: number;
                };
                Relationships: [];
            };
            lead_operations: {
                Row: {
                    after: Json;
                    at: string;
                    before: Json;
                    by: string | null;
                    id: string;
                    kind: string;
                    lead_ids: string[];
                    search_id: string | null;
                    tenant_id: string;
                    undone_at: string | null;
                    version: number;
                };
                Insert: {
                    after?: Json;
                    at?: string;
                    before?: Json;
                    by?: string | null;
                    id?: string;
                    kind: string;
                    lead_ids?: string[];
                    search_id?: string | null;
                    tenant_id: string;
                    undone_at?: string | null;
                    version: number;
                };
                Update: {
                    after?: Json;
                    at?: string;
                    before?: Json;
                    by?: string | null;
                    id?: string;
                    kind?: string;
                    lead_ids?: string[];
                    search_id?: string | null;
                    tenant_id?: string;
                    undone_at?: string | null;
                    version?: number;
                };
                Relationships: [
                    {
                        foreignKeyName: "lead_operations_search_id_fkey";
                        columns: ["search_id"];
                        isOneToOne: false;
                        referencedRelation: "lead_searches";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "lead_operations_search_id_fkey";
                        columns: ["search_id"];
                        isOneToOne: false;
                        referencedRelation: "lead_searches_view";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "lead_operations_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            lead_places: {
                Row: {
                    found_at: string;
                    id: string;
                    lead_id: string;
                    place_id: string;
                    street: string | null;
                    tenant_id: string;
                    title: string | null;
                };
                Insert: {
                    found_at?: string;
                    id?: string;
                    lead_id: string;
                    place_id: string;
                    street?: string | null;
                    tenant_id: string;
                    title?: string | null;
                };
                Update: {
                    found_at?: string;
                    id?: string;
                    lead_id?: string;
                    place_id?: string;
                    street?: string | null;
                    tenant_id?: string;
                    title?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "lead_places_lead_id_fkey";
                        columns: ["lead_id"];
                        isOneToOne: false;
                        referencedRelation: "leads";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "lead_places_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            lead_platform: {
                Row: {
                    id: boolean;
                    note: string | null;
                    prices_checked_at: string | null;
                    searches_on: boolean;
                    tenants_on: string[];
                    updated_at: string;
                };
                Insert: {
                    id?: boolean;
                    note?: string | null;
                    prices_checked_at?: string | null;
                    searches_on?: boolean;
                    tenants_on?: string[];
                    updated_at?: string;
                };
                Update: {
                    id?: boolean;
                    note?: string | null;
                    prices_checked_at?: string | null;
                    searches_on?: boolean;
                    tenants_on?: string[];
                    updated_at?: string;
                };
                Relationships: [];
            };
            lead_preferences: {
                Row: {
                    active: boolean;
                    category_key: string | null;
                    created_at: string;
                    created_by: string | null;
                    example: string | null;
                    from_lead_id: string | null;
                    id: string;
                    kind: string;
                    tenant_id: string;
                };
                Insert: {
                    active?: boolean;
                    category_key?: string | null;
                    created_at?: string;
                    created_by?: string | null;
                    example?: string | null;
                    from_lead_id?: string | null;
                    id?: string;
                    kind: string;
                    tenant_id: string;
                };
                Update: {
                    active?: boolean;
                    category_key?: string | null;
                    created_at?: string;
                    created_by?: string | null;
                    example?: string | null;
                    from_lead_id?: string | null;
                    id?: string;
                    kind?: string;
                    tenant_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "lead_preferences_from_lead_id_fkey";
                        columns: ["from_lead_id"];
                        isOneToOne: false;
                        referencedRelation: "leads";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "lead_preferences_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            lead_rounds: {
                Row: {
                    allowance_reserved: number;
                    allowance_used: number;
                    answered: string | null;
                    cost_reserved_usd: number;
                    cost_usd: number;
                    created_at: string;
                    day: string;
                    ended_at: string | null;
                    ending: string | null;
                    ending_pending: string | null;
                    id: string;
                    judge_model: string | null;
                    judge_tokens: number;
                    month: string;
                    nearby: Json;
                    plan: Json;
                    plan_version: number;
                    platform_day: string;
                    purpose: string;
                    question: Json | null;
                    search_id: string;
                    seq: number;
                    started_at: string | null;
                    state: string;
                    target: number;
                    tenant_id: string;
                    waiting_since: string | null;
                };
                Insert: {
                    allowance_reserved?: number;
                    allowance_used?: number;
                    answered?: string | null;
                    cost_reserved_usd?: number;
                    cost_usd?: number;
                    created_at?: string;
                    day: string;
                    ended_at?: string | null;
                    ending?: string | null;
                    ending_pending?: string | null;
                    id?: string;
                    judge_model?: string | null;
                    judge_tokens?: number;
                    month: string;
                    nearby?: Json;
                    plan: Json;
                    plan_version: number;
                    platform_day?: string;
                    purpose: string;
                    question?: Json | null;
                    search_id: string;
                    seq: number;
                    started_at?: string | null;
                    state?: string;
                    target: number;
                    tenant_id: string;
                    waiting_since?: string | null;
                };
                Update: {
                    allowance_reserved?: number;
                    allowance_used?: number;
                    answered?: string | null;
                    cost_reserved_usd?: number;
                    cost_usd?: number;
                    created_at?: string;
                    day?: string;
                    ended_at?: string | null;
                    ending?: string | null;
                    ending_pending?: string | null;
                    id?: string;
                    judge_model?: string | null;
                    judge_tokens?: number;
                    month?: string;
                    nearby?: Json;
                    plan?: Json;
                    plan_version?: number;
                    platform_day?: string;
                    purpose?: string;
                    question?: Json | null;
                    search_id?: string;
                    seq?: number;
                    started_at?: string | null;
                    state?: string;
                    target?: number;
                    tenant_id?: string;
                    waiting_since?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "lead_rounds_search_id_fkey";
                        columns: ["search_id"];
                        isOneToOne: false;
                        referencedRelation: "lead_searches";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "lead_rounds_search_id_fkey";
                        columns: ["search_id"];
                        isOneToOne: false;
                        referencedRelation: "lead_searches_view";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "lead_rounds_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            lead_runs: {
                Row: {
                    actor: string;
                    apify_run_id: string | null;
                    build: string;
                    cap_usd: number | null;
                    claimed_at: string | null;
                    claimed_by: string | null;
                    created_at: string;
                    dataset_id: string | null;
                    finished_at: string | null;
                    id: string;
                    items_seen: number;
                    lease_gen: number;
                    lease_owner: string | null;
                    lease_until: string | null;
                    purpose: string;
                    read_offset: number;
                    round_id: string;
                    state: string;
                    tenant_id: string;
                    term: string | null;
                    usage_usd: number;
                    webhook_token_hash: string;
                };
                Insert: {
                    actor: string;
                    apify_run_id?: string | null;
                    build: string;
                    cap_usd?: number | null;
                    claimed_at?: string | null;
                    claimed_by?: string | null;
                    created_at?: string;
                    dataset_id?: string | null;
                    finished_at?: string | null;
                    id?: string;
                    items_seen?: number;
                    lease_gen?: number;
                    lease_owner?: string | null;
                    lease_until?: string | null;
                    purpose: string;
                    read_offset?: number;
                    round_id: string;
                    state?: string;
                    tenant_id: string;
                    term?: string | null;
                    usage_usd?: number;
                    webhook_token_hash: string;
                };
                Update: {
                    actor?: string;
                    apify_run_id?: string | null;
                    build?: string;
                    cap_usd?: number | null;
                    claimed_at?: string | null;
                    claimed_by?: string | null;
                    created_at?: string;
                    dataset_id?: string | null;
                    finished_at?: string | null;
                    id?: string;
                    items_seen?: number;
                    lease_gen?: number;
                    lease_owner?: string | null;
                    lease_until?: string | null;
                    purpose?: string;
                    read_offset?: number;
                    round_id?: string;
                    state?: string;
                    tenant_id?: string;
                    term?: string | null;
                    usage_usd?: number;
                    webhook_token_hash?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "lead_runs_round_id_fkey";
                        columns: ["round_id"];
                        isOneToOne: false;
                        referencedRelation: "lead_rounds";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "lead_runs_round_id_fkey";
                        columns: ["round_id"];
                        isOneToOne: false;
                        referencedRelation: "lead_searches_view";
                        referencedColumns: ["round_id"];
                    },
                    {
                        foreignKeyName: "lead_runs_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            lead_search_members: {
                Row: {
                    blanked_at: string | null;
                    class: string;
                    counted: boolean;
                    counted_month: string | null;
                    created_at: string;
                    distance_m: number | null;
                    excluded_by: string | null;
                    fit: string | null;
                    id: string;
                    judgment: Json;
                    kept_at: string | null;
                    kept_by: string | null;
                    lead_id: string;
                    reason: string;
                    round_id: string | null;
                    search_id: string;
                    tenant_id: string;
                    version: number;
                };
                Insert: {
                    blanked_at?: string | null;
                    class: string;
                    counted?: boolean;
                    counted_month?: string | null;
                    created_at?: string;
                    distance_m?: number | null;
                    excluded_by?: string | null;
                    fit?: string | null;
                    id?: string;
                    judgment?: Json;
                    kept_at?: string | null;
                    kept_by?: string | null;
                    lead_id: string;
                    reason?: string;
                    round_id?: string | null;
                    search_id: string;
                    tenant_id: string;
                    version?: number;
                };
                Update: {
                    blanked_at?: string | null;
                    class?: string;
                    counted?: boolean;
                    counted_month?: string | null;
                    created_at?: string;
                    distance_m?: number | null;
                    excluded_by?: string | null;
                    fit?: string | null;
                    id?: string;
                    judgment?: Json;
                    kept_at?: string | null;
                    kept_by?: string | null;
                    lead_id?: string;
                    reason?: string;
                    round_id?: string | null;
                    search_id?: string;
                    tenant_id?: string;
                    version?: number;
                };
                Relationships: [
                    {
                        foreignKeyName: "lead_search_members_lead_id_fkey";
                        columns: ["lead_id"];
                        isOneToOne: false;
                        referencedRelation: "leads";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "lead_search_members_round_id_fkey";
                        columns: ["round_id"];
                        isOneToOne: false;
                        referencedRelation: "lead_rounds";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "lead_search_members_round_id_fkey";
                        columns: ["round_id"];
                        isOneToOne: false;
                        referencedRelation: "lead_searches_view";
                        referencedColumns: ["round_id"];
                    },
                    {
                        foreignKeyName: "lead_search_members_search_id_fkey";
                        columns: ["search_id"];
                        isOneToOne: false;
                        referencedRelation: "lead_searches";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "lead_search_members_search_id_fkey";
                        columns: ["search_id"];
                        isOneToOne: false;
                        referencedRelation: "lead_searches_view";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "lead_search_members_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            lead_searches: {
                Row: {
                    asked: string;
                    card: string;
                    created_at: string;
                    created_by: string | null;
                    id: string;
                    name: string;
                    plan: Json;
                    removed_at: string | null;
                    tenant_id: string;
                    via: string;
                };
                Insert: {
                    asked: string;
                    card: string;
                    created_at?: string;
                    created_by?: string | null;
                    id?: string;
                    name: string;
                    plan: Json;
                    removed_at?: string | null;
                    tenant_id: string;
                    via: string;
                };
                Update: {
                    asked?: string;
                    card?: string;
                    created_at?: string;
                    created_by?: string | null;
                    id?: string;
                    name?: string;
                    plan?: Json;
                    removed_at?: string | null;
                    tenant_id?: string;
                    via?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "lead_searches_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            lead_suggestions: {
                Row: {
                    business_line: string;
                    by_owner: boolean;
                    items: Json;
                    made_at: string;
                    tenant_id: string;
                };
                Insert: {
                    business_line: string;
                    by_owner?: boolean;
                    items?: Json;
                    made_at?: string;
                    tenant_id: string;
                };
                Update: {
                    business_line?: string;
                    by_owner?: boolean;
                    items?: Json;
                    made_at?: string;
                    tenant_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "lead_suggestions_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: true;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            lead_suppressions: {
                Row: {
                    created_at: string;
                    hash: string;
                    id: string;
                    kind: string;
                    tenant_id: string;
                    what: string;
                };
                Insert: {
                    created_at?: string;
                    hash: string;
                    id?: string;
                    kind: string;
                    tenant_id: string;
                    what: string;
                };
                Update: {
                    created_at?: string;
                    hash?: string;
                    id?: string;
                    kind?: string;
                    tenant_id?: string;
                    what?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "lead_suppressions_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            leads: {
                Row: {
                    about: string | null;
                    blanked_at: string | null;
                    business_name: string;
                    category: string | null;
                    city: string | null;
                    claimed: boolean | null;
                    closed_reason: string | null;
                    contact_id: string | null;
                    contacted_at: string | null;
                    converted_at: string | null;
                    country: string;
                    email: string | null;
                    email_alternates: Json;
                    email_checked_at: string | null;
                    email_state: string;
                    erased_at: string | null;
                    exported_at: string | null;
                    facebook_url: string | null;
                    found_at: string;
                    hours: Json;
                    id: string;
                    image_url: string | null;
                    instagram_url: string | null;
                    last_note: string | null;
                    last_outcome: string | null;
                    lat: number | null;
                    linkedin_url: string | null;
                    lng: number | null;
                    logo_url: string | null;
                    maps_url: string | null;
                    mark_path: string | null;
                    neighborhood: string | null;
                    phone_e164: string | null;
                    phone_sources: number;
                    phone_wrong: boolean;
                    place_id: string | null;
                    postal_code: string | null;
                    price: string | null;
                    rank: number | null;
                    rating: number | null;
                    region: string | null;
                    reviews: number | null;
                    reviews_dist: Json | null;
                    stage: string;
                    street: string | null;
                    tenant_id: string;
                    tiktok_url: string | null;
                    version: number;
                    website_host: string | null;
                };
                Insert: {
                    about?: string | null;
                    blanked_at?: string | null;
                    business_name?: string;
                    category?: string | null;
                    city?: string | null;
                    claimed?: boolean | null;
                    closed_reason?: string | null;
                    contact_id?: string | null;
                    contacted_at?: string | null;
                    converted_at?: string | null;
                    country?: string;
                    email?: string | null;
                    email_alternates?: Json;
                    email_checked_at?: string | null;
                    email_state?: string;
                    erased_at?: string | null;
                    exported_at?: string | null;
                    facebook_url?: string | null;
                    found_at?: string;
                    hours?: Json;
                    id?: string;
                    image_url?: string | null;
                    instagram_url?: string | null;
                    last_note?: string | null;
                    last_outcome?: string | null;
                    lat?: number | null;
                    linkedin_url?: string | null;
                    lng?: number | null;
                    logo_url?: string | null;
                    maps_url?: string | null;
                    mark_path?: string | null;
                    neighborhood?: string | null;
                    phone_e164?: string | null;
                    phone_sources?: number;
                    phone_wrong?: boolean;
                    place_id?: string | null;
                    postal_code?: string | null;
                    price?: string | null;
                    rank?: number | null;
                    rating?: number | null;
                    region?: string | null;
                    reviews?: number | null;
                    reviews_dist?: Json | null;
                    stage?: string;
                    street?: string | null;
                    tenant_id: string;
                    tiktok_url?: string | null;
                    version?: number;
                    website_host?: string | null;
                };
                Update: {
                    about?: string | null;
                    blanked_at?: string | null;
                    business_name?: string;
                    category?: string | null;
                    city?: string | null;
                    claimed?: boolean | null;
                    closed_reason?: string | null;
                    contact_id?: string | null;
                    contacted_at?: string | null;
                    converted_at?: string | null;
                    country?: string;
                    email?: string | null;
                    email_alternates?: Json;
                    email_checked_at?: string | null;
                    email_state?: string;
                    erased_at?: string | null;
                    exported_at?: string | null;
                    facebook_url?: string | null;
                    found_at?: string;
                    hours?: Json;
                    id?: string;
                    image_url?: string | null;
                    instagram_url?: string | null;
                    last_note?: string | null;
                    last_outcome?: string | null;
                    lat?: number | null;
                    linkedin_url?: string | null;
                    lng?: number | null;
                    logo_url?: string | null;
                    maps_url?: string | null;
                    mark_path?: string | null;
                    neighborhood?: string | null;
                    phone_e164?: string | null;
                    phone_sources?: number;
                    phone_wrong?: boolean;
                    place_id?: string | null;
                    postal_code?: string | null;
                    price?: string | null;
                    rank?: number | null;
                    rating?: number | null;
                    region?: string | null;
                    reviews?: number | null;
                    reviews_dist?: Json | null;
                    stage?: string;
                    street?: string | null;
                    tenant_id?: string;
                    tiktok_url?: string | null;
                    version?: number;
                    website_host?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "leads_contact_id_fkey";
                        columns: ["contact_id"];
                        isOneToOne: false;
                        referencedRelation: "contacts";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "leads_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            lines: {
                Row: {
                    a2p_profile_sid: string | null;
                    area_code: number | null;
                    brand_sid: string | null;
                    campaign_sid: string | null;
                    created_at: string;
                    credential_list_sid: string | null;
                    credentials_ref: string | null;
                    e164: string | null;
                    facts: Json;
                    forwarding_state: string;
                    id: string;
                    kind: string;
                    last_error: string | null;
                    messaging_service_sid: string | null;
                    number_sid: string | null;
                    port_state: string;
                    profile_sid: string | null;
                    provider: string;
                    reg_mock: boolean;
                    reg_sole_prop: boolean;
                    reg_step: string | null;
                    retell_agent_id: string | null;
                    sms_state: string;
                    state_since: string;
                    step: string | null;
                    subaccount_sid: string | null;
                    tenant_id: string;
                    termination_uri: string | null;
                    trunk_sid: string | null;
                    updated_at: string;
                    voice_state: string;
                    whatsapp_state: string;
                };
                Insert: {
                    a2p_profile_sid?: string | null;
                    area_code?: number | null;
                    brand_sid?: string | null;
                    campaign_sid?: string | null;
                    created_at?: string;
                    credential_list_sid?: string | null;
                    credentials_ref?: string | null;
                    e164?: string | null;
                    facts?: Json;
                    forwarding_state?: string;
                    id?: string;
                    kind?: string;
                    last_error?: string | null;
                    messaging_service_sid?: string | null;
                    number_sid?: string | null;
                    port_state?: string;
                    profile_sid?: string | null;
                    provider: string;
                    reg_mock?: boolean;
                    reg_sole_prop?: boolean;
                    reg_step?: string | null;
                    retell_agent_id?: string | null;
                    sms_state?: string;
                    state_since?: string;
                    step?: string | null;
                    subaccount_sid?: string | null;
                    tenant_id: string;
                    termination_uri?: string | null;
                    trunk_sid?: string | null;
                    updated_at?: string;
                    voice_state?: string;
                    whatsapp_state?: string;
                };
                Update: {
                    a2p_profile_sid?: string | null;
                    area_code?: number | null;
                    brand_sid?: string | null;
                    campaign_sid?: string | null;
                    created_at?: string;
                    credential_list_sid?: string | null;
                    credentials_ref?: string | null;
                    e164?: string | null;
                    facts?: Json;
                    forwarding_state?: string;
                    id?: string;
                    kind?: string;
                    last_error?: string | null;
                    messaging_service_sid?: string | null;
                    number_sid?: string | null;
                    port_state?: string;
                    profile_sid?: string | null;
                    provider?: string;
                    reg_mock?: boolean;
                    reg_sole_prop?: boolean;
                    reg_step?: string | null;
                    retell_agent_id?: string | null;
                    sms_state?: string;
                    state_since?: string;
                    step?: string | null;
                    subaccount_sid?: string | null;
                    tenant_id?: string;
                    termination_uri?: string | null;
                    trunk_sid?: string | null;
                    updated_at?: string;
                    voice_state?: string;
                    whatsapp_state?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "lines_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            mailboxes: {
                Row: {
                    created_at: string;
                    from_name: string;
                    id: string;
                    last_error: string | null;
                    last_received_at: string | null;
                    local_part: string;
                    reply_mode: string;
                    reply_token: string;
                    reply_token_prev: string | null;
                    tenant_id: string;
                    updated_at: string;
                };
                Insert: {
                    created_at?: string;
                    from_name: string;
                    id?: string;
                    last_error?: string | null;
                    last_received_at?: string | null;
                    local_part: string;
                    reply_mode?: string;
                    reply_token: string;
                    reply_token_prev?: string | null;
                    tenant_id: string;
                    updated_at?: string;
                };
                Update: {
                    created_at?: string;
                    from_name?: string;
                    id?: string;
                    last_error?: string | null;
                    last_received_at?: string | null;
                    local_part?: string;
                    reply_mode?: string;
                    reply_token?: string;
                    reply_token_prev?: string | null;
                    tenant_id?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "mailboxes_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            memberships: {
                Row: {
                    created_at: string;
                    id: string;
                    role: string;
                    tenant_id: string;
                    user_id: string;
                    views: Json;
                };
                Insert: {
                    created_at?: string;
                    id?: string;
                    role?: string;
                    tenant_id: string;
                    user_id: string;
                    views?: Json;
                };
                Update: {
                    created_at?: string;
                    id?: string;
                    role?: string;
                    tenant_id?: string;
                    user_id?: string;
                    views?: Json;
                };
                Relationships: [
                    {
                        foreignKeyName: "memberships_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            messages: {
                Row: {
                    body: string | null;
                    channel: string;
                    channel_ts: string | null;
                    contact_id: string | null;
                    content_hash: string | null;
                    conversation_id: string;
                    created_at: string;
                    direction: string;
                    error: Json | null;
                    external_id: string | null;
                    id: string;
                    media: Json | null;
                    meta: Json;
                    sender: string;
                    sent_by: string | null;
                    status: string;
                    status_updated_at: string | null;
                    template_name: string | null;
                    template_vars: Json | null;
                    tenant_id: string;
                    type: string;
                };
                Insert: {
                    body?: string | null;
                    channel: string;
                    channel_ts?: string | null;
                    contact_id?: string | null;
                    content_hash?: string | null;
                    conversation_id: string;
                    created_at?: string;
                    direction: string;
                    error?: Json | null;
                    external_id?: string | null;
                    id?: string;
                    media?: Json | null;
                    meta?: Json;
                    sender: string;
                    sent_by?: string | null;
                    status?: string;
                    status_updated_at?: string | null;
                    template_name?: string | null;
                    template_vars?: Json | null;
                    tenant_id: string;
                    type?: string;
                };
                Update: {
                    body?: string | null;
                    channel?: string;
                    channel_ts?: string | null;
                    contact_id?: string | null;
                    content_hash?: string | null;
                    conversation_id?: string;
                    created_at?: string;
                    direction?: string;
                    error?: Json | null;
                    external_id?: string | null;
                    id?: string;
                    media?: Json | null;
                    meta?: Json;
                    sender?: string;
                    sent_by?: string | null;
                    status?: string;
                    status_updated_at?: string | null;
                    template_name?: string | null;
                    template_vars?: Json | null;
                    tenant_id?: string;
                    type?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "messages_contact_id_fkey";
                        columns: ["contact_id"];
                        isOneToOne: false;
                        referencedRelation: "contacts";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "messages_conversation_id_fkey";
                        columns: ["conversation_id"];
                        isOneToOne: false;
                        referencedRelation: "conversations";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "messages_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            notification_marks: {
                Row: {
                    dismissed_at: string | null;
                    notification_id: string;
                    read_at: string | null;
                    user_id: string;
                };
                Insert: {
                    dismissed_at?: string | null;
                    notification_id: string;
                    read_at?: string | null;
                    user_id: string;
                };
                Update: {
                    dismissed_at?: string | null;
                    notification_id?: string;
                    read_at?: string | null;
                    user_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "notification_marks_notification_id_fkey";
                        columns: ["notification_id"];
                        isOneToOne: false;
                        referencedRelation: "notifications";
                        referencedColumns: ["id"];
                    }
                ];
            };
            notification_reads: {
                Row: {
                    seen_at: string;
                    tenant_id: string;
                    user_id: string;
                };
                Insert: {
                    seen_at?: string;
                    tenant_id: string;
                    user_id: string;
                };
                Update: {
                    seen_at?: string;
                    tenant_id?: string;
                    user_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "notification_reads_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            notifications: {
                Row: {
                    body: string;
                    created_at: string;
                    id: string;
                    kind: string;
                    recipient_user_id: string | null;
                    route: string | null;
                    subject_id: string | null;
                    subject_type: string | null;
                    tenant_id: string;
                    title: string;
                };
                Insert: {
                    body: string;
                    created_at?: string;
                    id?: string;
                    kind: string;
                    recipient_user_id?: string | null;
                    route?: string | null;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id: string;
                    title: string;
                };
                Update: {
                    body?: string;
                    created_at?: string;
                    id?: string;
                    kind?: string;
                    recipient_user_id?: string | null;
                    route?: string | null;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id?: string;
                    title?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "notifications_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            operator_pages: {
                Row: {
                    alerted_at: string | null;
                    count: number;
                    first_at: string;
                    key: string;
                    last_at: string;
                };
                Insert: {
                    alerted_at?: string | null;
                    count?: number;
                    first_at?: string;
                    key: string;
                    last_at?: string;
                };
                Update: {
                    alerted_at?: string | null;
                    count?: number;
                    first_at?: string;
                    key?: string;
                    last_at?: string;
                };
                Relationships: [];
            };
            person_notes: {
                Row: {
                    author_kind: string;
                    author_user_id: string | null;
                    body: string;
                    contact_id: string;
                    created_at: string;
                    deal_id: string | null;
                    done_at: string | null;
                    done_by: string | null;
                    due_on: string | null;
                    for_user_id: string | null;
                    id: string;
                    kept_at: string | null;
                    kept_by: string | null;
                    source: string;
                    source_id: string | null;
                    state: string;
                    team_only: boolean;
                    tenant_id: string;
                    updated_at: string;
                    version: number;
                };
                Insert: {
                    author_kind?: string;
                    author_user_id?: string | null;
                    body: string;
                    contact_id: string;
                    created_at?: string;
                    deal_id?: string | null;
                    done_at?: string | null;
                    done_by?: string | null;
                    due_on?: string | null;
                    for_user_id?: string | null;
                    id?: string;
                    kept_at?: string | null;
                    kept_by?: string | null;
                    source?: string;
                    source_id?: string | null;
                    state?: string;
                    team_only?: boolean;
                    tenant_id: string;
                    updated_at?: string;
                    version?: number;
                };
                Update: {
                    author_kind?: string;
                    author_user_id?: string | null;
                    body?: string;
                    contact_id?: string;
                    created_at?: string;
                    deal_id?: string | null;
                    done_at?: string | null;
                    done_by?: string | null;
                    due_on?: string | null;
                    for_user_id?: string | null;
                    id?: string;
                    kept_at?: string | null;
                    kept_by?: string | null;
                    source?: string;
                    source_id?: string | null;
                    state?: string;
                    team_only?: boolean;
                    tenant_id?: string;
                    updated_at?: string;
                    version?: number;
                };
                Relationships: [
                    {
                        foreignKeyName: "person_notes_contact_id_fkey";
                        columns: ["contact_id"];
                        isOneToOne: false;
                        referencedRelation: "contacts";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "person_notes_deal_id_fkey";
                        columns: ["deal_id"];
                        isOneToOne: false;
                        referencedRelation: "deals";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "person_notes_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            platform_admins: {
                Row: {
                    created_at: string;
                    user_id: string;
                };
                Insert: {
                    created_at?: string;
                    user_id: string;
                };
                Update: {
                    created_at?: string;
                    user_id?: string;
                };
                Relationships: [];
            };
            playbooks: {
                Row: {
                    cadence_days: number;
                    cap_per_run: number;
                    created_at: string;
                    created_by: string | null;
                    gap_days: number;
                    id: string;
                    last_run_at: string | null;
                    last_run_for: string | null;
                    list_id: string | null;
                    list_key: string | null;
                    name: string;
                    params: Json;
                    policy_class: string;
                    run_hour: number;
                    state: string;
                    template_id: string;
                    template_language: string;
                    template_name: string;
                    tenant_id: string;
                    trigger: string;
                    updated_at: string;
                };
                Insert: {
                    cadence_days?: number;
                    cap_per_run?: number;
                    created_at?: string;
                    created_by?: string | null;
                    gap_days?: number;
                    id?: string;
                    last_run_at?: string | null;
                    last_run_for?: string | null;
                    list_id?: string | null;
                    list_key?: string | null;
                    name: string;
                    params?: Json;
                    policy_class: string;
                    run_hour?: number;
                    state?: string;
                    template_id: string;
                    template_language: string;
                    template_name: string;
                    tenant_id: string;
                    trigger: string;
                    updated_at?: string;
                };
                Update: {
                    cadence_days?: number;
                    cap_per_run?: number;
                    created_at?: string;
                    created_by?: string | null;
                    gap_days?: number;
                    id?: string;
                    last_run_at?: string | null;
                    last_run_for?: string | null;
                    list_id?: string | null;
                    list_key?: string | null;
                    name?: string;
                    params?: Json;
                    policy_class?: string;
                    run_hour?: number;
                    state?: string;
                    template_id?: string;
                    template_language?: string;
                    template_name?: string;
                    tenant_id?: string;
                    trigger?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "playbooks_list_id_fkey";
                        columns: ["list_id"];
                        isOneToOne: false;
                        referencedRelation: "segments";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "playbooks_template_id_fkey";
                        columns: ["template_id"];
                        isOneToOne: false;
                        referencedRelation: "templates";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "playbooks_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            policies: {
                Row: {
                    class: string;
                    id: string;
                    limits: Json;
                    mode: string;
                    subject_id: string | null;
                    subject_type: string | null;
                    tenant_id: string;
                    updated_at: string;
                };
                Insert: {
                    class: string;
                    id?: string;
                    limits?: Json;
                    mode: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id: string;
                    updated_at?: string;
                };
                Update: {
                    class?: string;
                    id?: string;
                    limits?: Json;
                    mode?: string;
                    subject_id?: string | null;
                    subject_type?: string | null;
                    tenant_id?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "policies_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            profiles: {
                Row: {
                    display_name: string;
                    updated_at: string;
                    user_id: string;
                };
                Insert: {
                    display_name?: string;
                    updated_at?: string;
                    user_id: string;
                };
                Update: {
                    display_name?: string;
                    updated_at?: string;
                    user_id?: string;
                };
                Relationships: [];
            };
            push_devices: {
                Row: {
                    app_version: string | null;
                    created_at: string;
                    id: string;
                    last_seen_at: string;
                    platform: string;
                    token: string;
                    user_id: string;
                };
                Insert: {
                    app_version?: string | null;
                    created_at?: string;
                    id?: string;
                    last_seen_at?: string;
                    platform: string;
                    token: string;
                    user_id: string;
                };
                Update: {
                    app_version?: string | null;
                    created_at?: string;
                    id?: string;
                    last_seen_at?: string;
                    platform?: string;
                    token?: string;
                    user_id?: string;
                };
                Relationships: [];
            };
            rate_hits: {
                Row: {
                    actor: string;
                    at: string;
                    bucket: string;
                };
                Insert: {
                    actor: string;
                    at?: string;
                    bucket: string;
                };
                Update: {
                    actor?: string;
                    at?: string;
                    bucket?: string;
                };
                Relationships: [];
            };
            segment_members: {
                Row: {
                    added_at: string;
                    added_by: string | null;
                    contact_id: string;
                    segment_id: string;
                    tenant_id: string;
                };
                Insert: {
                    added_at?: string;
                    added_by?: string | null;
                    contact_id: string;
                    segment_id: string;
                    tenant_id: string;
                };
                Update: {
                    added_at?: string;
                    added_by?: string | null;
                    contact_id?: string;
                    segment_id?: string;
                    tenant_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "segment_members_contact_id_fkey";
                        columns: ["contact_id"];
                        isOneToOne: false;
                        referencedRelation: "contacts";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "segment_members_segment_id_fkey";
                        columns: ["segment_id"];
                        isOneToOne: false;
                        referencedRelation: "segments";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "segment_members_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            segments: {
                Row: {
                    archived_at: string | null;
                    created_at: string;
                    created_by: string | null;
                    id: string;
                    name: string;
                    rule: Json | null;
                    tenant_id: string;
                    updated_at: string;
                };
                Insert: {
                    archived_at?: string | null;
                    created_at?: string;
                    created_by?: string | null;
                    id?: string;
                    name: string;
                    rule?: Json | null;
                    tenant_id: string;
                    updated_at?: string;
                };
                Update: {
                    archived_at?: string | null;
                    created_at?: string;
                    created_by?: string | null;
                    id?: string;
                    name?: string;
                    rule?: Json | null;
                    tenant_id?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "segments_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            sweep_status: {
                Row: {
                    alerted_at: string | null;
                    backlog_ticks: number;
                    jobname: string | null;
                    judged_by: string;
                    max_silence: string | null;
                    note: string | null;
                    registered_at: string;
                    request_id: number | null;
                    requested_at: string | null;
                    sweep: string;
                };
                Insert: {
                    alerted_at?: string | null;
                    backlog_ticks?: number;
                    jobname?: string | null;
                    judged_by?: string;
                    max_silence?: string | null;
                    note?: string | null;
                    registered_at?: string;
                    request_id?: number | null;
                    requested_at?: string | null;
                    sweep: string;
                };
                Update: {
                    alerted_at?: string | null;
                    backlog_ticks?: number;
                    jobname?: string | null;
                    judged_by?: string;
                    max_silence?: string | null;
                    note?: string | null;
                    registered_at?: string;
                    request_id?: number | null;
                    requested_at?: string | null;
                    sweep?: string;
                };
                Relationships: [];
            };
            templates: {
                Row: {
                    body_preview: string | null;
                    category: string | null;
                    channel: string;
                    components: Json | null;
                    created_at: string;
                    created_by: string | null;
                    hidden_at: string | null;
                    id: string;
                    language: string;
                    meta_id: string | null;
                    meta_status: string;
                    name: string;
                    quality: string | null;
                    rejected_reason: string | null;
                    source: string;
                    synced_at: string | null;
                    tenant_id: string;
                    title: string | null;
                    updated_at: string;
                    variables: Json;
                };
                Insert: {
                    body_preview?: string | null;
                    category?: string | null;
                    channel: string;
                    components?: Json | null;
                    created_at?: string;
                    created_by?: string | null;
                    hidden_at?: string | null;
                    id?: string;
                    language: string;
                    meta_id?: string | null;
                    meta_status?: string;
                    name: string;
                    quality?: string | null;
                    rejected_reason?: string | null;
                    source?: string;
                    synced_at?: string | null;
                    tenant_id: string;
                    title?: string | null;
                    updated_at?: string;
                    variables?: Json;
                };
                Update: {
                    body_preview?: string | null;
                    category?: string | null;
                    channel?: string;
                    components?: Json | null;
                    created_at?: string;
                    created_by?: string | null;
                    hidden_at?: string | null;
                    id?: string;
                    language?: string;
                    meta_id?: string | null;
                    meta_status?: string;
                    name?: string;
                    quality?: string | null;
                    rejected_reason?: string | null;
                    source?: string;
                    synced_at?: string | null;
                    tenant_id?: string;
                    title?: string | null;
                    updated_at?: string;
                    variables?: Json;
                };
                Relationships: [
                    {
                        foreignKeyName: "templates_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            tenant_channels: {
                Row: {
                    config: Json;
                    created_at: string;
                    credentials_ref: string | null;
                    external_id: string;
                    id: string;
                    kind: string;
                    number_e164: string | null;
                    status: string;
                    tenant_id: string;
                    updated_at: string;
                    waba_id: string | null;
                };
                Insert: {
                    config?: Json;
                    created_at?: string;
                    credentials_ref?: string | null;
                    external_id: string;
                    id?: string;
                    kind: string;
                    number_e164?: string | null;
                    status?: string;
                    tenant_id: string;
                    updated_at?: string;
                    waba_id?: string | null;
                };
                Update: {
                    config?: Json;
                    created_at?: string;
                    credentials_ref?: string | null;
                    external_id?: string;
                    id?: string;
                    kind?: string;
                    number_e164?: string | null;
                    status?: string;
                    tenant_id?: string;
                    updated_at?: string;
                    waba_id?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "tenant_channels_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            tenant_config: {
                Row: {
                    calendar_checked_at: string | null;
                    config: Json;
                    tenant_id: string;
                    updated_at: string;
                    updated_by: string | null;
                    version: number;
                };
                Insert: {
                    calendar_checked_at?: string | null;
                    config?: Json;
                    tenant_id: string;
                    updated_at?: string;
                    updated_by?: string | null;
                    version?: number;
                };
                Update: {
                    calendar_checked_at?: string | null;
                    config?: Json;
                    tenant_id?: string;
                    updated_at?: string;
                    updated_by?: string | null;
                    version?: number;
                };
                Relationships: [
                    {
                        foreignKeyName: "tenant_config_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: true;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            tenants: {
                Row: {
                    created_at: string;
                    id: string;
                    locale: string;
                    name: string;
                    sells_by: string | null;
                    slug: string;
                    status: string;
                    timezone: string;
                    updated_at: string;
                };
                Insert: {
                    created_at?: string;
                    id?: string;
                    locale?: string;
                    name: string;
                    sells_by?: string | null;
                    slug: string;
                    status?: string;
                    timezone?: string;
                    updated_at?: string;
                };
                Update: {
                    created_at?: string;
                    id?: string;
                    locale?: string;
                    name?: string;
                    sells_by?: string | null;
                    slug?: string;
                    status?: string;
                    timezone?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
            waitlist: {
                Row: {
                    business: string | null;
                    created_at: string;
                    email: string;
                    id: string;
                    invited_at: string | null;
                    invited_by: string | null;
                    source: string | null;
                };
                Insert: {
                    business?: string | null;
                    created_at?: string;
                    email: string;
                    id?: string;
                    invited_at?: string | null;
                    invited_by?: string | null;
                    source?: string | null;
                };
                Update: {
                    business?: string | null;
                    created_at?: string;
                    email?: string;
                    id?: string;
                    invited_at?: string | null;
                    invited_by?: string | null;
                    source?: string | null;
                };
                Relationships: [];
            };
        };
        Views: {
            lead_searches_view: {
                Row: {
                    answered: string | null;
                    asked: string | null;
                    card: string | null;
                    cost_usd: number | null;
                    counted: number | null;
                    created_at: string | null;
                    created_by: string | null;
                    emails_checked: number | null;
                    ended_at: string | null;
                    ending: string | null;
                    ending_pending: string | null;
                    excluded: number | null;
                    id: string | null;
                    judge_tokens: number | null;
                    long: number | null;
                    look: number | null;
                    name: string | null;
                    nearby: Json | null;
                    plan: Json | null;
                    plan_version: number | null;
                    purpose: string | null;
                    qualified: number | null;
                    question: Json | null;
                    removed_at: string | null;
                    review: number | null;
                    round_id: string | null;
                    seq: number | null;
                    state: string | null;
                    strong: number | null;
                    target: number | null;
                    tenant_id: string | null;
                    undo_op_id: string | null;
                    undo_version: number | null;
                    via: string | null;
                    waiting_since: string | null;
                    with_phone: number | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "lead_searches_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
        };
        Functions: {
            call_status_rank: {
                Args: {
                    p_status: string;
                };
                Returns: number;
            };
            campaign_series: {
                Args: {
                    p_days?: number;
                    p_tenant_id: string;
                };
                Returns: Json;
            };
            claim_conversation_control: {
                Args: {
                    p_by: string;
                    p_conversation_id: string;
                    p_kind: string;
                    p_ref: string;
                    p_seconds: number;
                    p_tenant_id: string;
                };
                Returns: string;
            };
            claim_due_jobs: {
                Args: {
                    p_lease_seconds: number;
                    p_limit: number;
                };
                Returns: {
                    attempts: number;
                    created_at: string;
                    due_at: string;
                    fired_at: string | null;
                    id: string;
                    kind: string;
                    last_error: string | null;
                    lease_until: string | null;
                    payload: Json;
                    state: string;
                    tenant_id: string;
                    updated_at: string;
                }[];
                SetofOptions: {
                    from: "*";
                    to: "jobs";
                    isOneToOne: false;
                    isSetofReturn: true;
                };
            };
            create_mailbox: {
                Args: {
                    p_from_name: string;
                    p_local_part: string;
                    p_tenant_id: string;
                };
                Returns: Json;
            };
            create_person: {
                Args: {
                    p_display_name: string;
                    p_phone_e164: string;
                    p_source: string;
                    p_tenant_id: string;
                    p_title?: string;
                };
                Returns: Json;
            };
            create_workspace: {
                Args: {
                    p_name: string;
                    p_timezone?: string;
                };
                Returns: {
                    id: string;
                    locale: string;
                    name: string;
                    slug: string;
                    status: string;
                    timezone: string;
                }[];
            };
            create_workspace_for: {
                Args: {
                    p_name: string;
                    p_timezone?: string;
                    p_user: string;
                };
                Returns: {
                    id: string;
                    locale: string;
                    name: string;
                    slug: string;
                    status: string;
                    timezone: string;
                }[];
            };
            deadman_candidates: {
                Args: {
                    p_older_than?: string;
                };
                Returns: {
                    conversation_id: string;
                    details: string;
                    escalation_id: string;
                    opened_at: string;
                    phone_e164: string;
                    reason: string;
                    tenant_id: string;
                }[];
            };
            deadman_mark_alerted: {
                Args: {
                    p_ids: string[];
                };
                Returns: number;
            };
            deal_record: {
                Args: {
                    p_amount_cents?: number;
                    p_clear?: string[];
                    p_contact_id: string;
                    p_deal_id?: string;
                    p_evidence?: Json;
                    p_lost_reason?: string;
                    p_note?: string;
                    p_per?: string;
                    p_proposal_url?: string;
                    p_service?: string;
                    p_stage: string;
                    p_valid_until?: string;
                    p_version?: number;
                    p_when?: string;
                };
                Returns: Json;
            };
            drop_google_credentials: {
                Args: {
                    p_tenant_id: string;
                };
                Returns: boolean;
            };
            ensure_events_partition: {
                Args: {
                    p_month: string;
                };
                Returns: undefined;
            };
            erase_contact: {
                Args: {
                    p_contact_id: string;
                    p_legs?: Json;
                };
                Returns: Json;
            };
            erase_marketing_consent: {
                Args: {
                    p_contact_id: string;
                };
                Returns: undefined;
            };
            expire_stale_pauses: {
                Args: never;
                Returns: number;
            };
            first_replies: {
                Args: {
                    p_start: string;
                    p_tenant_id: string;
                };
                Returns: {
                    ai_at: string;
                    ai_seconds: number;
                    asked_at: string;
                    conversation_id: string;
                    human_at: string;
                    who: string;
                }[];
            };
            get_channel_credentials: {
                Args: {
                    p_channel_id: string;
                };
                Returns: Json;
            };
            get_cron_sweep_key: {
                Args: never;
                Returns: string;
            };
            get_google_credentials: {
                Args: {
                    p_tenant_id: string;
                };
                Returns: Json;
            };
            get_line_credentials: {
                Args: {
                    p_line_id: string;
                };
                Returns: Json;
            };
            has_permission: {
                Args: {
                    p_permission: string;
                    p_tenant_id: string;
                    p_user: string;
                };
                Returns: boolean;
            };
            import_person: {
                Args: {
                    p_email: string;
                    p_email_digest?: string;
                    p_name: string;
                    p_phone_digest?: string;
                    p_phone_e164: string;
                    p_tenant_id: string;
                };
                Returns: Json;
            };
            ingest_call: {
                Args: {
                    p_agent_id: string;
                    p_analysis?: Json;
                    p_call_type: string;
                    p_cost: Json;
                    p_direction: string;
                    p_disconnection: string;
                    p_duration_ms: number;
                    p_ended_at: string;
                    p_from_e164: string;
                    p_from_raw: string;
                    p_in_voicemail: boolean;
                    p_latency: Json;
                    p_public_log_url: string;
                    p_raw: Json;
                    p_recording: Json;
                    p_retell_call_id: string;
                    p_sentiment: string;
                    p_started_at: string;
                    p_status: string;
                    p_successful: boolean;
                    p_summary: string;
                    p_tenant_id: string;
                    p_to_e164: string;
                    p_transcript: string;
                    p_transcript_obj: Json;
                };
                Returns: Json;
            };
            ingest_inbound: {
                Args: {
                    p_body: string;
                    p_channel: string;
                    p_channel_ts: string;
                    p_identity_external_id: string;
                    p_media?: Json;
                    p_message_external_id: string;
                    p_meta?: Json;
                    p_opt_in?: boolean;
                    p_opt_out?: boolean;
                    p_phone_e164: string;
                    p_tenant_id: string;
                    p_type: string;
                    p_wa_profile_name: string;
                };
                Returns: Json;
            };
            is_acting_member: {
                Args: {
                    p_tenant: string;
                };
                Returns: boolean;
            };
            is_platform_admin: {
                Args: never;
                Returns: boolean;
            };
            is_workspace_owner: {
                Args: {
                    p_tenant: string;
                };
                Returns: boolean;
            };
            jobs_backlog: {
                Args: {
                    p_wait?: string;
                };
                Returns: number;
            };
            lead_blank: {
                Args: {
                    p_lead_id: string;
                };
                Returns: number;
            };
            lead_bulk: {
                Args: {
                    p_action: string;
                    p_ids?: string[];
                    p_search_id?: string;
                    p_tenant_id: string;
                    p_view?: Json;
                };
                Returns: Json;
            };
            lead_check_again: {
                Args: {
                    p_lead_ids: string[];
                    p_tenant_id: string;
                };
                Returns: Json;
            };
            lead_check_commit: {
                Args: {
                    p_last: boolean;
                    p_results: Json;
                    p_round_id: string;
                    p_run_id: string;
                    p_usage_usd: number;
                };
                Returns: Json;
            };
            lead_collect_commit: {
                Args: {
                    p_from_offset: number;
                    p_gen: number;
                    p_owner: string;
                    p_page: Json;
                    p_run_id: string;
                    p_to_offset: number;
                };
                Returns: Json;
            };
            lead_counter_take: {
                Args: {
                    p_kind: string;
                    p_period: string;
                    p_tenant_id: string;
                };
                Returns: {
                    id: string;
                    kind: string;
                    period: string;
                    reserved: number;
                    tenant_id: string | null;
                    updated_at: string;
                    used: number;
                };
                SetofOptions: {
                    from: "*";
                    to: "lead_counters";
                    isOneToOne: true;
                    isSetofReturn: false;
                };
            };
            lead_day: {
                Args: {
                    p_at?: string;
                    p_tenant_id: string;
                };
                Returns: string;
            };
            lead_erase: {
                Args: {
                    p_lead_id: string;
                };
                Returns: Json;
            };
            lead_export_mark: {
                Args: {
                    p_ids: string[];
                    p_tenant_id: string;
                };
                Returns: number;
            };
            lead_in_list: {
                Args: {
                    p_closed_reason: string;
                    p_list: string;
                    p_stage: string;
                };
                Returns: boolean;
            };
            lead_list_counts: {
                Args: {
                    p_tenant_id: string;
                };
                Returns: Json;
            };
            lead_member_exclude: {
                Args: {
                    p_lead_id: string;
                    p_search_id: string;
                };
                Returns: Json;
            };
            lead_member_keep: {
                Args: {
                    p_lead_id: string;
                    p_search_id: string;
                };
                Returns: Json;
            };
            lead_member_move: {
                Args: {
                    p_kind: string;
                    p_lead_id: string;
                    p_search_id: string;
                };
                Returns: Json;
            };
            lead_member_put_back: {
                Args: {
                    p_lead_id: string;
                    p_search_id: string;
                };
                Returns: Json;
            };
            lead_month: {
                Args: {
                    p_at?: string;
                    p_tenant_id: string;
                };
                Returns: string;
            };
            lead_month_used: {
                Args: {
                    p_period: string;
                    p_tenant_id: string;
                };
                Returns: Json;
            };
            lead_niche_prior: {
                Args: {
                    p_category_key: string;
                };
                Returns: Json;
            };
            lead_plan_check: {
                Args: {
                    p_plan: Json;
                };
                Returns: undefined;
            };
            lead_release: {
                Args: {
                    p_day: string;
                    p_leads: number;
                    p_month: string;
                    p_platform_day: string;
                    p_tenant_id: string;
                    p_usd: number;
                };
                Returns: undefined;
            };
            lead_renews_on: {
                Args: {
                    p_tenant_id: string;
                };
                Returns: string;
            };
            lead_reserve: {
                Args: {
                    p_day: string;
                    p_leads: number;
                    p_month: string;
                    p_platform_day: string;
                    p_tenant_id: string;
                    p_usd: number;
                };
                Returns: Json;
            };
            lead_round_answer: {
                Args: {
                    p_answer: string;
                    p_plan?: Json;
                    p_round_id: string;
                };
                Returns: Json;
            };
            lead_round_end: {
                Args: {
                    p_ending: string;
                    p_round_id: string;
                };
                Returns: boolean;
            };
            lead_round_rejudge: {
                Args: {
                    p_judgment?: Json;
                    p_places: Json;
                    p_plan_version: number;
                    p_round_id: string;
                };
                Returns: Json;
            };
            lead_round_stop: {
                Args: {
                    p_search_id: string;
                };
                Returns: Json;
            };
            lead_run_claim: {
                Args: {
                    p_owner: string;
                    p_run_id: string;
                };
                Returns: boolean;
            };
            lead_run_lease: {
                Args: {
                    p_owner: string;
                    p_run_id: string;
                    p_seconds: number;
                };
                Returns: number;
            };
            lead_run_mark_unknown: {
                Args: {
                    p_owner: string;
                    p_run_id: string;
                };
                Returns: boolean;
            };
            lead_run_reconcile: {
                Args: {
                    p_apify_run_id: string;
                    p_dataset_id: string;
                    p_run_id: string;
                    p_state: string;
                };
                Returns: boolean;
            };
            lead_run_record_start: {
                Args: {
                    p_apify_run_id: string;
                    p_cap_usd: number;
                    p_dataset_id: string;
                    p_owner: string;
                    p_run_id: string;
                };
                Returns: boolean;
            };
            lead_run_release: {
                Args: {
                    p_gen: number;
                    p_owner: string;
                    p_run_id: string;
                };
                Returns: boolean;
            };
            lead_search_create: {
                Args: {
                    p_estimate_usd: number;
                    p_plan: Json;
                    p_tenant_id: string;
                    p_via: string;
                };
                Returns: Json;
            };
            lead_search_more: {
                Args: {
                    p_estimate_usd: number;
                    p_plan: Json;
                    p_purpose: string;
                    p_search_id: string;
                };
                Returns: Json;
            };
            lead_search_remove: {
                Args: {
                    p_search_id: string;
                };
                Returns: Json;
            };
            lead_search_rename: {
                Args: {
                    p_name: string;
                    p_search_id: string;
                };
                Returns: Json;
            };
            lead_search_undo: {
                Args: {
                    p_search_id: string;
                };
                Returns: Json;
            };
            lead_searches_on: {
                Args: {
                    p_tenant_id: string;
                };
                Returns: boolean;
            };
            lead_set_stage: {
                Args: {
                    p_fit_reason?: string;
                    p_lead_id: string;
                    p_note?: string;
                    p_outcome?: string;
                    p_reason?: string;
                    p_stage?: string;
                };
                Returns: Json;
            };
            lead_settle_usage: {
                Args: {
                    p_day: string;
                    p_delta: number;
                    p_month: string;
                    p_outstanding: number;
                    p_platform_day: string;
                    p_tenant_id: string;
                };
                Returns: undefined;
            };
            lead_suppression_hash: {
                Args: {
                    p_tenant_id: string;
                    p_value: string;
                };
                Returns: string;
            };
            lead_undo: {
                Args: {
                    p_op_id: string;
                    p_version: number;
                };
                Returns: Json;
            };
            leads_page: {
                Args: {
                    p_after_id?: string;
                    p_after_key?: string;
                    p_class?: string;
                    p_dir?: string;
                    p_limit?: number;
                    p_list?: string;
                    p_search_id?: string;
                    p_sort?: string;
                    p_tenant_id: string;
                };
                Returns: {
                    about: string;
                    business_name: string;
                    category: string;
                    city: string;
                    claimed: boolean;
                    class: string;
                    closed_reason: string;
                    contact_id: string;
                    contacted_at: string;
                    converted_at: string;
                    counted: boolean;
                    counted_month: string;
                    distance_m: number;
                    email: string;
                    email_alternates: Json;
                    email_checked_at: string;
                    email_state: string;
                    excluded_by: string;
                    exported_at: string;
                    facebook_url: string;
                    fit: string;
                    found_at: string;
                    hours: Json;
                    image_url: string;
                    instagram_url: string;
                    judgment: Json;
                    last_note: string;
                    last_outcome: string;
                    lat: number;
                    lead_id: string;
                    linkedin_url: string;
                    lng: number;
                    maps_url: string;
                    mark_path: string;
                    member_id: string;
                    neighborhood: string;
                    page_key: string;
                    phone_e164: string;
                    phone_sources: number;
                    phone_wrong: boolean;
                    place_id: string;
                    places: number;
                    postal_code: string;
                    price: string;
                    rank: number;
                    rating: number;
                    reason: string;
                    region: string;
                    reviews: number;
                    reviews_dist: Json;
                    round_id: string;
                    search_id: string;
                    shares: Json;
                    sort_key: string;
                    stage: string;
                    street: string;
                    tiktok_url: string;
                    version: number;
                    website_host: string;
                }[];
            };
            line_forwarding_set: {
                Args: {
                    p_carrier: string;
                    p_mode: string;
                    p_number: string;
                    p_tenant_id: string;
                    p_test_from: string;
                };
                Returns: string;
            };
            line_forwarding_test: {
                Args: {
                    p_line_id: string;
                    p_tenant_id: string;
                };
                Returns: Json;
            };
            lookup_user_for_invite: {
                Args: {
                    p_email: string;
                    p_tenant_id: string;
                };
                Returns: string;
            };
            mark_processed: {
                Args: {
                    p_message_id: string;
                    p_tenant_id: string;
                };
                Returns: undefined;
            };
            member_view_set: {
                Args: {
                    p_page: string;
                    p_tenant_id: string;
                    p_view: Json;
                };
                Returns: Json;
            };
            metrics_summary: {
                Args: {
                    p_days?: number;
                    p_tenant_id: string;
                };
                Returns: Json;
            };
            mint_reply_token: {
                Args: never;
                Returns: string;
            };
            note_candidates: {
                Args: {
                    p_limit?: number;
                };
                Returns: {
                    contact_id: string;
                    dnc: boolean;
                    known: Json;
                    last_suggested: string;
                    seconds: number;
                    source: string;
                    source_id: string;
                    tenant_id: string;
                    turns: Json;
                    workspace_today: number;
                }[];
            };
            note_for_you_notify: {
                Args: {
                    p_by: string;
                    p_contact_id: string;
                    p_for: string;
                    p_note_id: string;
                    p_tenant_id: string;
                };
                Returns: undefined;
            };
            note_sweep_backlog: {
                Args: {
                    p_remaining: number;
                    p_sweep: string;
                };
                Returns: number;
            };
            notification_mark: {
                Args: {
                    p_dismissed?: boolean;
                    p_id: string;
                    p_read?: boolean;
                };
                Returns: Json;
            };
            notifications_seen: {
                Args: {
                    p_tenant_id: string;
                };
                Returns: Json;
            };
            number_drift: {
                Args: never;
                Returns: {
                    detail: string;
                    kind: string;
                    tenant_id: string;
                }[];
            };
            people_list: {
                Args: {
                    p_contact_id?: string;
                    p_limit?: number;
                    p_offset?: number;
                    p_query?: string;
                    p_tenant_id: string;
                };
                Returns: {
                    call_count: number;
                    call_seconds: number;
                    came_from: string;
                    channels: string[];
                    consent: string;
                    consent_source: string;
                    consent_updated_at: string;
                    conversation_count: number;
                    deal_amount_cents: number;
                    deal_decided_at: string;
                    deal_ended_at: string;
                    deal_id: string;
                    deal_lost_reason: string;
                    deal_per: string;
                    deal_proposal_url: string;
                    deal_proposed_at: string;
                    deal_service: string;
                    deal_stage: string;
                    deal_valid_until: string;
                    display_name: string;
                    dnc: boolean;
                    earliest_row_at: string;
                    email: string;
                    escalation_count: number;
                    first_contact_at: string;
                    has_backfill: boolean;
                    has_chat: boolean;
                    id: string;
                    last_call_at: string;
                    last_inbound_at: string;
                    last_inbound_call_at: string;
                    last_inbound_call_summary: string;
                    last_inbound_text: string;
                    last_message_at: string;
                    last_message_direction: string;
                    last_message_sender: string;
                    latest_assignee_user_id: string;
                    latest_conversation_id: string;
                    latest_paused_until: string;
                    latest_snooze_until: string;
                    latest_state: string;
                    latest_wa_inbound_at: string;
                    marketing_consent: string;
                    marketing_consent_source: string;
                    marketing_consent_updated_at: string;
                    message_channels: string[];
                    needs_human: boolean;
                    open_escalation_reason: string;
                    open_escalation_since: string;
                    phone_e164: string;
                    queued_reply_at: string;
                    step_body: string;
                    step_deal_id: string;
                    step_due_on: string;
                    step_for_user_id: string;
                    step_id: string;
                    wa_profile_name: string;
                }[];
            };
            person_note_add: {
                Args: {
                    p_body: string;
                    p_contact_id: string;
                    p_deal_id?: string;
                    p_due_on?: string;
                    p_for_user_id?: string;
                    p_source?: string;
                    p_team_only?: boolean;
                };
                Returns: Json;
            };
            person_note_decide: {
                Args: {
                    p_body?: string;
                    p_keep: boolean;
                    p_note_id: string;
                    p_team_only?: boolean;
                };
                Returns: Json;
            };
            person_note_done: {
                Args: {
                    p_done?: boolean;
                    p_note_id: string;
                    p_version?: number;
                };
                Returns: Json;
            };
            person_note_edit: {
                Args: {
                    p_body: string;
                    p_clear_due?: boolean;
                    p_deal_id?: string;
                    p_due_on?: string;
                    p_for_user_id?: string;
                    p_note_id: string;
                    p_team_only?: boolean;
                    p_version?: number;
                };
                Returns: Json;
            };
            person_note_remove: {
                Args: {
                    p_note_id: string;
                };
                Returns: Json;
            };
            person_note_suggest: {
                Args: {
                    p_body: string;
                    p_contact_id: string;
                    p_source: string;
                    p_source_id?: string;
                    p_tenant_id: string;
                };
                Returns: Json;
            };
            platform_admin_add: {
                Args: {
                    p_email: string;
                };
                Returns: string;
            };
            platform_overview: {
                Args: never;
                Returns: {
                    billing_mode: string;
                    billing_status: string;
                    created_at: string;
                    current_period_end: string;
                    last_inbound_at: string;
                    line_e164: string;
                    line_error: string;
                    line_kind: string;
                    members: number;
                    name: string;
                    reg_mock: boolean;
                    reg_sole_prop: boolean;
                    reg_step: string;
                    slug: string;
                    sms_state: string;
                    status: string;
                    tenant_id: string;
                    timezone: string;
                    trial_end: string;
                    voice_active: boolean;
                    voice_number: string;
                    voice_state: string;
                    whatsapp_active: boolean;
                    whatsapp_number: string;
                }[];
            };
            platform_overview_rows: {
                Args: never;
                Returns: {
                    billing_mode: string;
                    billing_status: string;
                    created_at: string;
                    current_period_end: string;
                    last_inbound_at: string;
                    line_e164: string;
                    line_error: string;
                    line_kind: string;
                    members: number;
                    name: string;
                    reg_mock: boolean;
                    reg_sole_prop: boolean;
                    reg_step: string;
                    slug: string;
                    sms_state: string;
                    status: string;
                    tenant_id: string;
                    timezone: string;
                    trial_end: string;
                    voice_active: boolean;
                    voice_number: string;
                    voice_state: string;
                    whatsapp_active: boolean;
                    whatsapp_number: string;
                }[];
            };
            profile_set: {
                Args: {
                    p_display_name: string;
                };
                Returns: Json;
            };
            provision_tenant: {
                Args: {
                    p_tenant_id: string;
                };
                Returns: undefined;
            };
            purge_ask: {
                Args: {
                    p_keep?: string;
                };
                Returns: number;
            };
            purge_cron_history: {
                Args: {
                    p_keep?: string;
                    p_keep_frequent?: string;
                    p_keep_per_job?: number;
                };
                Returns: number;
            };
            purge_events: {
                Args: {
                    p_keep?: string;
                };
                Returns: number;
            };
            purge_leads: {
                Args: never;
                Returns: number;
            };
            purge_notifications: {
                Args: {
                    p_keep?: string;
                };
                Returns: number;
            };
            push_device_forget: {
                Args: {
                    p_token: string;
                };
                Returns: Json;
            };
            push_device_register: {
                Args: {
                    p_app_version?: string;
                    p_platform: string;
                    p_token: string;
                };
                Returns: Json;
            };
            put_channel_credentials: {
                Args: {
                    p_channel_id: string;
                    p_secret: Json;
                };
                Returns: string;
            };
            put_google_credentials: {
                Args: {
                    p_secret: Json;
                    p_tenant_id: string;
                };
                Returns: string;
            };
            put_line_credentials: {
                Args: {
                    p_line_id: string;
                    p_secret: Json;
                };
                Returns: string;
            };
            release_conversation_control: {
                Args: {
                    p_by: string;
                    p_conversation_id: string;
                    p_kind: string;
                    p_ref: string;
                    p_tenant_id: string;
                };
                Returns: boolean;
            };
            rename_mailbox: {
                Args: {
                    p_from_name: string;
                    p_mailbox_id: string;
                };
                Returns: Json;
            };
            report_series: {
                Args: {
                    p_days?: number;
                    p_tenant_id: string;
                };
                Returns: Json;
            };
            request_sweep: {
                Args: {
                    p_path: string;
                    p_sweep: string;
                    p_timeout_ms?: number;
                };
                Returns: number;
            };
            runtime_stamp: {
                Args: {
                    p_tenant_id: string;
                };
                Returns: string;
            };
            scrub_ask_for_contact: {
                Args: {
                    p_contact_id: string;
                    p_needles: string[];
                    p_tenant_id: string;
                };
                Returns: number;
            };
            scrub_call_raw: {
                Args: {
                    p_raw: Json;
                };
                Returns: Json;
            };
            scrub_contact_events: {
                Args: {
                    p_contact_id: string;
                    p_tenant_id: string;
                };
                Returns: number;
            };
            set_contact_consent: {
                Args: {
                    p_consent: string;
                    p_contact_id: string;
                    p_message_id?: string;
                    p_note?: string;
                    p_source: string;
                };
                Returns: Json;
            };
            set_marketing_consent: {
                Args: {
                    p_consent: string;
                    p_contact_id: string;
                    p_evidence?: Json;
                    p_message_id?: string;
                    p_note?: string;
                    p_source: string;
                    p_tenant_id: string;
                };
                Returns: Json;
            };
            set_person_email: {
                Args: {
                    p_contact_id: string;
                    p_email: string;
                };
                Returns: Json;
            };
            set_person_name: {
                Args: {
                    p_contact_id: string;
                    p_name: string;
                };
                Returns: Json;
            };
            set_person_notes: {
                Args: {
                    p_contact_id: string;
                    p_notes: string;
                };
                Returns: Json;
            };
            set_person_proposal: {
                Args: {
                    p_contact_id: string;
                    p_url: string;
                };
                Returns: Json;
            };
            set_template_hidden: {
                Args: {
                    p_hidden: boolean;
                    p_template_id: string;
                };
                Returns: Json;
            };
            set_template_title: {
                Args: {
                    p_template_id: string;
                    p_title: string;
                };
                Returns: Json;
            };
            setup_request: {
                Args: {
                    p_tenant_id: string;
                    p_what: string;
                };
                Returns: Json;
            };
            stamp_email_sent: {
                Args: {
                    p_message_id: string;
                    p_provider_id: string;
                    p_rfc_message_id: string;
                    p_tenant_id: string;
                };
                Returns: {
                    conversation_id: string;
                    status: string;
                }[];
            };
            sweep_health: {
                Args: never;
                Returns: {
                    alerted_at: string;
                    detail: string;
                    healthy: boolean;
                    last_request_at: string;
                    scheduled: boolean;
                    status_code: number;
                    sweep: string;
                }[];
            };
            sweep_mark_alerted: {
                Args: {
                    p_alerted: string[];
                    p_healthy: string[];
                };
                Returns: number;
            };
            sweep_recent_responses: {
                Args: {
                    p_limit?: number;
                };
                Returns: {
                    body: string;
                    created_at: string;
                    request_id: number;
                    status_code: number;
                }[];
            };
            sweep_schedules: {
                Args: never;
                Returns: {
                    active: boolean;
                    jobname: string;
                    last_run: string;
                    last_status: string;
                    schedule: string;
                }[];
            };
            take_rate: {
                Args: {
                    p_actor: string;
                    p_bucket: string;
                    p_limit: number;
                    p_window_ms: number;
                };
                Returns: Json;
            };
            team_roster: {
                Args: {
                    p_tenant_id: string;
                };
                Returns: {
                    display_name: string;
                    email: string;
                    joined_at: string;
                    member_user_id: string;
                    membership_id: string;
                    role: string;
                }[];
            };
            trigger_calendar_sweep: {
                Args: never;
                Returns: number;
            };
            trigger_call_reconcile: {
                Args: never;
                Returns: number;
            };
            trigger_deadman_sweep: {
                Args: never;
                Returns: number;
            };
            trigger_google_sweep: {
                Args: never;
                Returns: number;
            };
            trigger_jobs_tick: {
                Args: never;
                Returns: number;
            };
            trigger_leads_sweep: {
                Args: never;
                Returns: number;
            };
            trigger_lines_sweep: {
                Args: never;
                Returns: number;
            };
            trigger_notes_sweep: {
                Args: never;
                Returns: number;
            };
            trigger_playbooks_sweep: {
                Args: never;
                Returns: number;
            };
            trigger_registration_sweep: {
                Args: never;
                Returns: number;
            };
            trigger_sweep_health: {
                Args: never;
                Returns: number;
            };
            wake_stale_snoozes: {
                Args: never;
                Returns: number;
            };
        };
        Enums: {
            [_ in never]: never;
        };
        CompositeTypes: {
            [_ in never]: never;
        };
    };
};

/**
 * Service-role client factory — ingestion, jobs, and platform-admin paths ONLY.
 * App-plane (/api/v1) handlers must use the session-scoped client so RLS is
 * the enforcement (Blueprint P6/§8); the dashboard wraps this behind a
 * server-only module. Framework-agnostic: env is passed in, never read here.
 */

interface ServiceClientConfig {
    url: string;
    serviceRoleKey: string;
}
declare function createServiceClient(cfg: ServiceClientConfig): SupabaseClient<Database>;

/**
 * Ingestion repositories — the edge's write surface (service-role client).
 * ingest_inbound is the atomic concurrency gate (RPC) and the receptionist's
 * dedupe; everything else is plain row work.
 */

type Db$a = SupabaseClient<Database>;
interface IngestInboundParams {
    tenantId: string;
    channel: "whatsapp" | "sms" | "email";
    identityExternalId: string;
    phoneE164: string | null;
    waProfileName: string | null;
    messageExternalId: string;
    type: "text" | "media";
    body: string | null;
    channelTs: string | null;
    media?: Json | null;
    meta?: Json;
    optOut?: boolean;
    optIn?: boolean;
    /**
     * The customer texted the OFFERS keyword specifically.
     *
     * A second, separate answer -- see contracts/consent.ts. It is recorded after
     * the ingest rather than inside it: `ingest_inbound` is the hot path for every
     * inbound message in the product, and adding a parameter to it means
     * recreating a hundred-and-sixty-line function to write one column.
     */
    optInMarketing?: boolean;
}
interface IngestResult {
    message_id: string;
    conversation_id: string;
    contact_id: string;
    is_new: boolean;
    processed: boolean;
    state: string;
    paused_until: string | null;
    /** The contact's consent AFTER this message was applied, so a STOP earlier in
     *  the same webhook batch is already reflected. Optional because a database
     *  still on a pre-00013 schema omits both — readers must treat absence as
     *  "nothing on record", never as a block. */
    consent?: string | null;
    dnc?: boolean | null;
}
declare function ingestInbound(db: Db$a, p: IngestInboundParams): Promise<IngestResult>;
/** Stamp a message handled (replied / deliberately skipped) — retry no-ops after this.
 *  One server-side jsonb merge (no read-modify-write, no lost-update race). */
declare function markProcessed(db: Db$a, tenantId: string, messageId: string): Promise<void>;
declare function recordOutbound(db: Db$a, p: {
    tenantId: string;
    conversationId: string;
    contactId: string | null;
    sender: "ai" | "human" | "system";
    type?: "text" | "template" | "note";
    body: string;
    externalId: string | null;
    meta?: Json;
    /** "queued" is a DRAFT awaiting its veto window — written by the bot,
     *  fired later by outbound_send, cancellable until then. */
    status?: "sent" | "failed" | "queued";
    /** The wire it goes out on: where the person last wrote. WhatsApp unless said. */
    channel?: "whatsapp" | "sms" | "email";
}): Promise<string | null>;
/**
 * `extends PurposeBearing` so the claim below is the compiler's and not only the
 * comment's: this row can be handed to `mayMessageFor` whole.
 */
interface OutboundTarget extends PurposeBearing {
    contactId: string;
    conversationId: string;
    /** 'unknown' | 'opted_in' | 'opted_out' — carried so no caller can send
     *  without having been handed the consent state. */
    consent: string | null;
    dnc: boolean;
    /**
     * The OTHER answer: offers, specifically (00095).
     *
     * Carried for exactly the reason the two above are — a sender that is not
     * handed the fact cannot honour it — and its absence is why the voice path
     * could only ever ask half the question. The shape is now a `PurposeBearing`,
     * so `mayMessageFor` can be asked about either purpose without a second read.
     */
    marketing_consent: string | null;
    /** A human has this thread until then. Carried for the same reason consent
     *  is: a sender that is not handed the fact cannot honour it. */
    pausedUntil: string | null;
}
/**
 * The contact + conversation an outbound message belongs to, with consent.
 *
 * Every send path needs the same four facts, and until now each one found them
 * its own way (or, in the voice function's case, not at all — it texted a raw
 * phone number with no row behind it). Consent is returned rather than checked
 * here on purpose: the repository's job is to report state, and each caller
 * has its own honest refusal to give.
 *
 * `create: false` means "only an existing contact will do" — the guard for a
 * number somebody supplied rather than one that called us.
 */
declare function resolveOutboundTarget(db: Db$a, p: {
    tenantId: string;
    phoneE164: string;
    create?: boolean;
    touch?: boolean;
}): Promise<OutboundTarget | null>;
/**
 * Automated sends already made to this thread today, by source.
 *
 * The conversational path caps bot replies per thread per day from the thread
 * state it already holds. A voice-initiated send has no thread state, and so had
 * no cap at all — a caller who phoned repeatedly, or an agent that called its
 * own tool twice, produced one billable template per attempt.
 */
declare function countSentToday(db: Db$a, p: {
    tenantId: string;
    conversationId: string;
    source: string;
}): Promise<number>;
/** Delivery receipts: update by wamid; monotone rank enforced by trigger. */
declare function recordStatusByExternalId(db: Db$a, tenantId: string, externalId: string, status: "sent" | "delivered" | "read" | "failed", errorDetail?: Json): Promise<void>;
/** Owner replied from the WhatsApp Business app: persist the echo + pause the bot.
 *  Upserts the contact/conversation — an owner-INITIATED thread (customer never
 *  messaged yet) must still record the message and the pause, or the
 *  receptionist answers over the person who just replied. */
declare function recordEchoAndPause(db: Db$a, p: {
    tenantId: string;
    customerPhoneDigits: string;
    body: string | null;
    externalId: string | null;
    pausedUntilIso: string;
}): Promise<void>;
/**
 * The AI-side pause (non-text / escalation): the receptionist steps out of
 * this thread until the given moment.
 *
 * Returns whether the pause actually landed, and the caller must care.
 *
 * This used to discard the result entirely, which is the quietest way to
 * break the product: `paused_until` on this row IS the answer
 * to "may I speak?", so a transient PostgREST failure here means the bot opens
 * an escalation, emails staff, and then keeps answering the thread it just
 * handed to a human. supabase-js does not throw, so the surrounding try/catch
 * never saw it either — the only evidence was a customer being talked over.
 *
 * `.select("id")` is not decoration: an UPDATE that RLS or a wrong tenant id
 * excludes matches zero rows and reports success, so the row count is the only
 * way to tell a write that happened from one that was silently skipped.
 */
declare function pauseConversation(db: Db$a, tenantId: string, conversationId: string, pausedUntilIso: string, 
/** The holding message this same handoff queued, which the pause must not withdraw. */
opts?: {
    keepMessageId?: string | null;
}): Promise<boolean>;
declare function emitEvent(db: Db$a, tenantId: string, kind: EventKind, category: string, subjectType: string | null, subjectId: string | null, data?: Json): Promise<void>;

/**
 * Email's rows: a workspace's mailbox, taking a received email in, the email a
 * reply answers, and what became of one we sent.
 *
 * Taking an email in goes through `ingest_inbound`, the same atomic gate every
 * channel uses (one advisory lock per identity, one replay gate on the
 * provider's id), with the sender's address as the identity. That function is
 * the hot path for every inbound message in the product and is not recreated
 * to learn a column (ingest.ts says the same of the offers answer). The two
 * things email needs around it are done here, each idempotent, so a run that
 * dies between them resumes cleanly:
 *
 *   before  a person the owner already gave this address to (00125) has never
 *           written from it, so no identity names them yet. The identity is
 *           written first, and the ingest then joins THAT person instead of
 *           making a second one.
 *   after   a person who arrived by email gets the address on their own row,
 *           where replies are addressed from and People shows it. Only an
 *           empty one is filled: what an owner typed is never overwritten.
 */

type Db$9 = SupabaseClient<Database>;
type MailboxRow = Database["public"]["Tables"]["mailboxes"]["Row"];
declare function mailboxById(db: Db$9, id: string): Promise<MailboxRow | null>;
/** The mailbox a published address or a reply route names. A rotated-out token still routes until it is revoked (00126). */
declare function mailboxFor(db: Db$9, to: {
    kind: "mailbox";
    localPart: string;
} | {
    kind: "reply";
    token: string;
}): Promise<MailboxRow | null>;
interface IngestEmailParams {
    tenantId: string;
    /** The sender's address, as normalizeEmail stores it. */
    address: string;
    /** The provider's id for this delivery: the replay gate. Never the sender's own Message-ID, which the sender writes. */
    receivedId: string;
    body: string | null;
    channelTs: string | null;
    meta: Json;
}
declare function ingestInboundEmail(db: Db$9, p: IngestEmailParams): Promise<IngestResult>;
/** Did this workspace send a message with this Message-ID? How an email that is our own, coming back, is known. */
declare function sentEmailWithMessageId(db: Db$9, tenantId: string, rfcMessageId: string): Promise<boolean>;
declare function stampMailboxReceived(db: Db$9, mailboxId: string, at: string): Promise<void>;
/** A workspace's mailbox; null when it has none, which is a workspace with no email line. */
declare function mailboxOfTenant(db: Db$9, tenantId: string): Promise<MailboxRow | null>;
/** The email a reply answers: what the thread stores of the person's latest one. */
interface InboundEmailFacts {
    messageId: string;
    from: string | null;
    rfcMessageId: string | null;
    references: string[];
    subject: string | null;
}
/**
 * The person's latest email on one thread, read inside that workspace and that
 * conversation and nowhere else: a reply cannot be threaded under another
 * workspace's or another person's message, because no such row can be returned.
 */
declare function lastInboundEmail(db: Db$9, tenantId: string, conversationId: string): Promise<InboundEmailFacts | null>;
/**
 * A sent email learns the provider's id and the Message-ID it left with
 * (00128, one statement, so it cannot overwrite a status stamp written beside
 * it), and says where the row stands and which thread it is on. Null when this
 * workspace has no such outbound email: a receipt for a row that is not there.
 */
declare function stampEmailSent(db: Db$9, p: {
    tenantId: string;
    messageId: string;
    providerId: string;
    rfcMessageId: string | null;
}): Promise<{
    status: string;
    conversationId: string;
} | null>;
/**
 * Move a sent email to what its receipt says. A move messages_guard refuses
 * (backwards, or off a terminal state) is a receipt arriving out of order, and
 * is let go the way recordStatusByExternalId lets it go; anything else throws.
 */
declare function recordEmailStatus(db: Db$9, p: {
    tenantId: string;
    messageId: string;
    status: "delivered" | "failed";
    error: Json | null;
}): Promise<void>;
/**
 * The address a sent email went to stops being sent to. It is the person's
 * address NOW that is stopped, and only when it is still the one that email
 * went to: a corrected address is a different address (00126). The person's id
 * when their row changed; null when it was already stopped, or no longer theirs.
 */
declare function suppressEmailOf(db: Db$9, p: {
    tenantId: string;
    messageId: string;
    addresses: string[];
    reason: "hard_bounce" | "complaint" | "provider";
    at: string;
}): Promise<string | null>;

/** Webhook → tenant routing over tenant_channels(kind, external_id). */

interface RoutedChannel {
    channelId: string;
    tenantId: string;
    kind: string;
    /** The provider's id this row routes on: a WhatsApp phone_number_id, a Retell agent id, an SMS number. */
    externalId: string;
    numberE164: string | null;
    credentialsRef: string | null;
    config: Json;
}
interface ChannelLookup {
    channel: RoutedChannel | null;
    /**
     * The lookup could not be COMPLETED (database error, no cached answer). This
     * is NOT the same as "no active channel", and callers must not conflate them:
     * "the database says this channel is off" is a deliberate configuration state
     * that should silence the receptionist, while "the database did not answer"
     * is an infrastructure blip the door refuses to acknowledge, so the provider
     * redelivers once the read works. Returning a bare null for both made a
     * Postgres hiccup indistinguishable from someone flipping the off switch.
     */
    lookupFailed: boolean;
}
declare function resolveChannelDetailed(db: SupabaseClient<Database>, kind: string, externalId: string): Promise<ChannelLookup>;
/** The common case: callers that cannot act on the distinction. */
declare function resolveChannel(db: SupabaseClient<Database>, kind: string, externalId: string): Promise<RoutedChannel | null>;

/**
 * Calls repository (Slice 3). ingest_call is the atomic gate: identity
 * resolution + upsert + metering in one round trip, idempotent on
 * (tenant_id, retell_call_id) so webhook stages and the history backfill
 * converge on one row.
 */

type Db$8 = SupabaseClient<Database>;
interface NormalizedCallInput {
    retellCallId: string;
    agentId: string | null;
    direction: "inbound" | "outbound";
    callType: string | null;
    fromE164: string | null;
    fromRaw: string | null;
    toE164: string | null;
    status: SchemaSet<"calls.status">;
    startedAtIso: string | null;
    endedAtIso: string | null;
    durationMs: number | null;
    disconnectionReason: string | null;
    sentiment: string | null;
    callSuccessful: boolean | null;
    inVoicemail: boolean | null;
    summary: string | null;
    transcript: string | null;
    transcriptObject: unknown;
    recordingUrl: string | null;
    publicLogUrl: string | null;
    cost: unknown;
    latency: unknown;
    /** The agent's post-call analysis answers; the door files them as columns. */
    analysis: unknown;
}
interface IngestCallResult {
    call_id: string;
    is_new: boolean;
    /** 'stored' means audio is already in private storage — skip re-copying. */
    recording_state: string | null;
    /** Copy attempts so far — the bound the sweep and the webhook share. */
    recording_attempts?: number | null;
    /** True when the event ranked below the row's status (a retried
     *  call_started after call_ended): nothing was written, updated_at did
     *  not move. */
    skipped?: boolean;
    contact_id: string | null;
    conversation_id: string | null;
}
declare function ingestCall(db: Db$8, tenantId: string, n: NormalizedCallInput, raw?: unknown): Promise<IngestCallResult>;
/**
 * Attach the thread note (call_summary message) back to its call row.
 *
 * Row-counted, like every other conditional write here: an UPDATE that RLS
 * excludes or that names a row which is gone reports success and changes
 * nothing, so "the write failed" and "the write did not happen" have to be
 * told apart by counting rows rather than by trusting the absence of an error.
 */
declare function linkCallMessage(db: Db$8, tenantId: string, callId: string, messageId: string): Promise<void>;
/**
 * Post-storage-copy state for the recording (private bucket path).
 *
 * Row-counted, and this is the one where it bites: the audio is already in the
 * bucket by the time this runs. A write that silently changed nothing leaves
 * the row saying `pending`, so the sweep fetches the file again, uploads it
 * again (upsert), three times, and then marks it failed -- and the object it
 * left behind is invisible to the purge, which only looks at rows that say
 * `stored`. A row that did not change is now said out loud.
 */
declare function setCallRecording(db: Db$8, tenantId: string, callId: string, recording: Record<string, unknown>): Promise<void>;
/** The customer's thread gets the call as a message, so history stays in one place. */
declare function recordCallNote(db: Db$8, p: {
    tenantId: string;
    conversationId: string;
    contactId: string | null;
    body: string;
    externalId: string;
    channelTsIso: string | null;
}): Promise<string | null>;
/**
 * Claim the one-time post-call side effects (the summary email, the memory
 * note). True for the first caller; false once claimed. Throws on a database
 * error so the webhook answers non-2xx and the provider retries.
 */
declare function claimCallNotification(db: Db$8, tenantId: string, callId: string): Promise<boolean>;

/**
 * The receptionist's working memory, read from Postgres — the only place it
 * lives.
 *
 * It used to live in Vercel Blob with Postgres as a write-only shadow, which
 * meant every surface we built read a MIRROR of the truth and the two had to
 * be kept in step by hand. Three of our worst bugs came from that gap (an
 * operator take-over clobbered by a webhook writing a stale whole-object,
 * archived threads swallowing new messages, a reply scheduled before its
 * mirror write). The rows the dashboard reads and writes ARE the memory now:
 *   history      last turns fed to the model
 *   pausedUntil  a human is handling this thread
 *   replies      bot sends in the last 24h (rate cap)
 * Retry dedupe is not here and needs nothing here: ingest_inbound's is_new is
 * an atomic gate on a unique index, which is strictly stronger than the
 * 40-entry array the store kept, and which two concurrent lambdas could both
 * miss.
 */

type Db$7 = SupabaseClient<Database>;
interface ThreadTurn {
    role: "user" | "assistant";
    content: string;
}
interface PgThreadState {
    history: ThreadTurn[];
    pausedUntil: number;
    replies: number[];
    /**
     * Anything has ever LEFT on this conversation, at any time, from anyone.
     *
     * `history` cannot answer this: a voice call note is an inbound row whose
     * sender is "system" and assembleHistory maps every non-customer sender to
     * an assistant turn, so a customer who only ever phoned looks like one we
     * have written to. `replies` cannot either — it is a 24h window, and it
     * counts only the machine. The A2P footer on a first text reply is decided
     * by this, so it is computed from what actually went out.
     */
    repliedBefore: boolean;
}
/**
 * A conversation's turns, as the model should see them.
 *
 * Extracted so the WhatsApp receptionist and the voice agent cannot end up
 * with different ideas of what was said. They used to: the bot read these rows
 * from Postgres while the voice agent read a six-turn slice out of the store
 * that has since been retired, so the same customer got a different — and
 * thinner — account of themselves depending on which number they used.
 *
 * Four rules live here and nowhere else:
 *   - a blank body carries nothing to reason over
 *   - an outbound row only counts once it actually LEFT; a canceled or failed
 *     send was never seen, and must not appear as something "we said"
 *   - the backfilled copy of a call note loses to the native row
 *   - order is by when things HAPPENED, so yesterday's call sits before this
 *     morning's message
 */
type HistoryRow = {
    body: string | null;
    sender: string;
    direction: string;
    status: string | null;
    created_at: string;
    channel_ts: string | null;
    meta?: unknown;
};
declare function assembleHistory(rows: HistoryRow[], limit: number): ThreadTurn[];
/** The columns assembleHistory needs. One string, so no caller can under-select. */
declare const HISTORY_COLUMNS = "body, sender, direction, type, status, created_at, channel_ts, meta";
declare function readThreadState(db: Db$7, tenantId: string, conversationId: string, pausedUntilIso: string | null, historyLimit?: number): Promise<PgThreadState>;
interface LeadContext {
    contactId: string | null;
    conversationId: string | null;
    /** What to call them, if we know. */
    name: string | null;
    /** We have spoken before. False for a genuinely first contact. */
    returning: boolean;
    lastSeenAt: string | null;
    /** Cross-channel turns — calls and messages, in the order they happened. */
    history: ThreadTurn[];
    /** They asked us to stop. Carried so no caller has to look it up separately. */
    optedOut: boolean;
    /** The owner's notes on them — facts for the receptionist, never read aloud. The field 00157 superseded: said only
     *  where the notes themselves could not be read (`noteList` null or absent). */
    notes?: string | null;
    /** The notes the receptionist reads (0007): kept, not for the team only, newest first. Null where they could not
     *  be read. Optional so every fake still compiles. */
    noteList?: {
        body: string;
        at: string;
    }[] | null;
    /**
     * Their proposal, as a web address: the current deal's while it is a proposal out, none for any other deal, the
     * person's own only with no deal at all (proposalLinkOf, 0008); none where deals are off. Sent when they ask about
     * price, its figures never stated.
     */
    proposalUrl?: string | null;
    /**
     * Their deal (0004), the newest open or current one: the sentence the receptionist hears; none where deals are off
     * (dealsAreOn, 0008). Optional so every fake still compiles.
     */
    deal?: DealFacts | null;
}
/**
 * Everything both agents know about one lead, from the one place that knows it.
 *
 * The WhatsApp receptionist and the voice agent are meant to be the same
 * receptionist — a customer who phoned yesterday and texts today should not
 * have to start again. They were not: the bot read this conversation from
 * Postgres while the voice agent read a six-turn slice out of a mirror that
 * has since been retired. Same person, two different accounts of them, and
 * only one of the two kept up to date.
 *
 * READ-ONLY on purpose. A context lookup must never create a contact or a
 * conversation: an inbound call that is never answered, or a wrong number,
 * would otherwise leave a lead behind in the workspace. The real ingest paths
 * create rows; this one only reports what is already true.
 */
declare function readLeadContext(db: Db$7, tenantId: string, phoneE164: string, historyLimit?: number): Promise<LeadContext>;
/**
 * The deal facts for a caller known by their number, or null: what the availability door needs and nothing more (0004).
 * None where deals are off (dealsAreOn, 0008): the workspace's answer rides on the contact read, and a database that
 * cannot say it has deals off. Every deal of theirs is read, because the current one may be the oldest (see
 * readLeadContext).
 */
declare function readDealForPhone(db: Db$7, tenantId: string, phoneE164: string): Promise<DealFacts | null>;
/**
 * The team's notes as the receptionist hears them (0007): newest first, each dated, as many as fit the budget -- the
 * newest always, however long. Where the notes could not be read, the field they moved from (00054), as it was said.
 */
declare function notesForReceptionist(lead: LeadContext, now?: Date, tz?: string): string | null;
declare function describeLead(lead: LeadContext, now?: Date, tz?: string): string;

/**
 * Who is speaking on a thread right now.
 *
 * Apart from `assignee_user_id`, which says who is RESPONSIBLE and may outlive
 * any one exchange, and apart from `paused_until`, which says how long the
 * machine is held. Three facts, three lifetimes; this is the middle one, which
 * until 00130 had nowhere to live.
 *
 * Every write goes through the database's own claim, never a read here and an
 * update after it: two claimants who both read an empty thread both believe it
 * is theirs, and one of them is wrong about the only question this fact exists
 * to answer.
 */

type Db$6 = SupabaseClient<Database>;
/** A person mid-conversation, or a call in progress. */
type ControlHolder = {
    kind: "person";
    userId: string;
} | {
    kind: "call";
    callId: string;
};
/**
 * How long a hold lasts unless it is renewed or let go.
 *
 * A call renews on its own events, so this is the ceiling on a call whose end
 * we never hear about -- long enough to cover a real conversation, short
 * enough that a lost hangup does not mute a thread for the afternoon.
 */
declare const CALL_CONTROL_S: number;
type ControlOutcome = "claimed" | "renewed" | "held" | "gone";
/**
 * Take the hold, or renew one this holder already has.
 *
 * `held` means somebody else has it and this caller must not speak. A throw is
 * a read that could not be made, which is not the same as a free thread, so it
 * is left to the caller to fail loudly rather than swallowed here.
 */
declare function claimControl(db: Db$6, p: {
    tenantId: string;
    conversationId: string;
    holder: ControlHolder;
    seconds: number;
}): Promise<ControlOutcome>;
/**
 * Let go of a hold this holder has. False when somebody else holds it now --
 * the honest answer to a release that arrives after a person took the thread
 * over, which must not clear their hold.
 */
declare function releaseControl(db: Db$6, p: {
    tenantId: string;
    conversationId: string;
    holder: ControlHolder;
}): Promise<boolean>;

/**
 * A workspace's own message templates, as Meta last told us about them.
 *
 * Read-only, and deliberately small: the admin doors in apps/edge own creating,
 * syncing and deleting them, because that is where the number's credentials
 * live. What is here is the one question the rest of the product asks -- which
 * templates may this workspace send, right now -- so that no caller has to name
 * one by a literal again.
 */

type Db$5 = SupabaseClient<Database>;
/** What every reader of a template needs to decide whether it may be sent and how to fill it. */
interface TemplateRow {
    name: string;
    language: string;
    category: string | null;
    meta_status: string | null;
    body_preview: string | null;
    title: string | null;
    variables: unknown;
}
/**
 * Every template this workspace holds on a channel.
 *
 * A read that fails THROWS. "We could not read the templates" is not "this
 * workspace has none": the second is an answer a caller can be told, and
 * telling them it when we simply could not look is how a working feature reads
 * as a missing one.
 */
declare function templatesFor(db: Db$5, tenantId: string, channel?: string): Promise<TemplateRow[]>;

/**
 * Control-plane repository (Session A): config, policies, team.
 * Same shape as ingest/calls/thread — thin, typed, no business rules here;
 * enforcement lives in RLS + the DB triggers + requireRole at the routes.
 */

type Db$4 = SupabaseClient<Database>;
interface TenantConfigRow {
    tenant_id: string;
    config: unknown;
    version: number;
    updated_at: string;
    /** Who last wrote it; null for rows written before 00085 kept track, and for the platform's own writes. */
    updated_by?: string | null;
}
declare function getTenantConfig(db: Db$4, tenantId: string): Promise<TenantConfigRow | null>;
type PutTenantConfigResult = {
    ok: true;
    row: TenantConfigRow;
}
/** Someone else saved between the read and the write. A real conflict. */
 | {
    ok: false;
    reason: "stale";
}
/** There is no config row at all — this workspace was never provisioned.
 *  NOT a conflict, and telling the owner to "reload and reapply" sends them
 *  round a loop that cannot terminate. */
 | {
    ok: false;
    reason: "missing";
};
/**
 * Optimistic-concurrency write: the caller sends back the version it read.
 *
 * Returns WHY it failed, because zero rows updated has two very different
 * causes and the route used to report both as "someone else saved settings
 * after you loaded them". For a tenant with no config row that sentence is
 * false in every particular — nobody saved anything, no colleague exists, and
 * reloading changes nothing.
 */
declare function putTenantConfig(db: Db$4, tenantId: string, config: unknown, expectedVersion: number, 
/** Who wrote it. This config IS what customers hear, so the row records its author (00085). */
updatedBy?: string | null): Promise<PutTenantConfigResult>;
interface PolicyRecord {
    id: string;
    class: string;
    mode: string;
    subject_type: string | null;
    subject_id: string | null;
    limits: unknown;
    updated_at: string;
}
/** Workspace-level rows only (subject IS NULL) — guardrail rows arrive with
 *  the People slice and get their own accessor then. */
declare function listPolicies(db: Db$4, tenantId: string): Promise<PolicyRecord[]>;
declare function setPolicyMode(db: Db$4, tenantId: string, policyClass: string, mode: string, 
/**
 * Merged into the existing limits, never replacing them.
 *
 * `limits` holds several unrelated settings for one class — a reply row
 * carries both max_replies_day and reply_delay_ms — so a PUT that sent the
 * whole object would silently drop whichever one the caller did not know
 * about. Callers set what they mean and leave the rest alone.
 */
limits?: Record<string, unknown>): Promise<PolicyRecord | null>;
/**
 * The receptionist mode set for ONE person, or null to follow the workspace.
 *
 * Read by the edge once per inbound message — a single lookup on the unique
 * key, never cached. The whole point of "Never" for a difficult customer is
 * that it applies to their NEXT message, not to one sixty seconds later.
 */
declare function personReplyMode(db: Db$4, tenantId: string, contactId: string): Promise<string | null>;
/**
 * Set or clear one person's receptionist mode. `null` removes the row, so the
 * person follows the workspace policy again. Insert and delete are owner-only
 * under RLS (00029); a forbidden insert raises, and the route decides the
 * role before getting here.
 */
declare function setPersonReplyMode(db: Db$4, tenantId: string, contactId: string, mode: string | null): Promise<void>;

/**
 * Everyone in People, as `people_list` (00112) computes them under the caller's row security.
 *
 * One pager for the dashboard's lists, counts and exports and the edge's playbook sweep: each had its own loop over
 * the same function, with its own page size and its own rule for when to name the page arguments.
 */

type Db$3 = SupabaseClient<Database>;
/** Rows per page: what people_list answers at most (the database clamps p_limit to it). */
declare const PEOPLE_PAGE = 1000;
/**
 * One page of people. The page arguments are named only when they leave their defaults, so a database that has not
 * been given 00112 answers the first page as it always has. A read that fails THROWS: a page the database could not
 * answer is never an empty workspace.
 */
declare function peoplePage(db: Db$3, tenantId: string, page?: {
    q?: string | null;
    offset?: number;
    limit?: number;
}): Promise<PersonRowDto[]>;
/**
 * Everyone, every page of them: whatever counts people counts everyone. One call is at most a thousand rows, and a
 * caller that does not loop gets a thousand with no error, no flag and no way to tell them from "that is everyone".
 */
declare function everyoneIn(db: Db$3, tenantId: string): Promise<PersonRowDto[]>;

/**
 * Saved lists: a name and the people on it (00044's segments and segment_members), read and written here and
 * nowhere else.
 *
 * The routes, the send, the assistant and the verbs each read these tables themselves, and each read of the members
 * was one select, which PostgREST answers with at most 1000 rows: past a thousand memberships a list silently lost
 * people. Every member read here is paged. A write answers the database's error as it came, code and all, so the
 * route that called it can say the refusal in its own words.
 */

type Db$2 = SupabaseClient<Database>;
/**
 * A list with every id on it, and its rule when it is a smart list (00155): who is on a smart list is judged on every
 * read (contracts savedListIds), and `ids` is empty for one.
 */
interface SavedListRow {
    id: string;
    name: string;
    ids: string[];
    rule: unknown;
    /** When it was archived (00169): it leaves People's rail and still resolves for the playbooks that name it. */
    archived_at: string | null;
}
/** A list as a verb acts on it: the workspace it belongs to is the one its role is judged in. */
interface ListRow {
    id: string;
    tenant_id: string;
    name: string;
    /** A smart list's rule, or null for a list kept by hand: nobody is put on or taken off a rule by hand. */
    rule: unknown;
    /** When it was archived (00169); null for a live list. */
    archived_at: string | null;
}
interface WriteError {
    code?: string;
    message: string;
}
/** Every saved list of one workspace with every id on it, by name. Scoped by tenant, not by row security alone. */
declare function savedListsFor(db: Db$2, tenantId: string): Promise<SavedListRow[]>;
/** Every id on one list. */
declare function listMemberIds(db: Db$2, listId: string): Promise<string[]>;
/** One saved list of this workspace with every id on it, or null when it has no such list: what a send to it enrols. */
declare function savedListFor(db: Db$2, tenantId: string, id: string): Promise<SavedListRow | null>;
/** The list a verb acts on, read under row security alone: one the caller cannot see is no list. */
declare function listRow(db: Db$2, id: string): Promise<ListRow | null>;
/**
 * A new list in the maker's name: empty and kept by hand, or smart with its rule. A name the workspace already has is
 * the database's 23505.
 */
declare function createList(db: Db$2, tenantId: string, name: string, userId: string, rule?: Json | null): Promise<{
    list: {
        id: string;
        name: string;
    } | null;
    error: WriteError | null;
}>;
/** A list's new name: one of the two columns a member may change (00155's column grant). */
declare function renameList(db: Db$2, id: string, name: string): Promise<{
    error: WriteError | null;
}>;
/** A smart list's new rule: the other column a member may change. */
declare function setListRule(db: Db$2, id: string, rule: Json): Promise<{
    error: WriteError | null;
}>;
/**
 * People onto a list, in the adder's name. Someone already on it is not an error; a person of another workspace or
 * one who was erased is row security's with-check refusal (42501).
 */
declare function addToList(db: Db$2, list: Pick<ListRow, "id" | "tenant_id">, contactIds: readonly string[], userId: string): Promise<{
    error: WriteError | null;
}>;
/** People off a list. The people stay; only the membership goes. */
declare function dropFromList(db: Db$2, listId: string, contactIds: readonly string[]): Promise<{
    error: WriteError | null;
}>;
/**
 * A list archived (a moment) or restored (null): the column a member may change (00169's grant). A restore under a name
 * a live list now has is the database's 23505.
 */
declare function archiveList(db: Db$2, id: string, at: Date | null, 
/** A new name to come back under, in the same write: a restore and its rename land together or not at all. */
name?: string): Promise<{
    error: WriteError | null;
    count: number;
}>;
/** The playbooks that name a list: what archiving it pauses. */
declare function playbooksOnList(db: Db$2, tenantId: string, listId: string): Promise<{
    id: string;
    name: string;
    state: string;
}[]>;
/** A list and its member rows. `count` says whether anything was removed: a delete that removed nothing is no delete. */
declare function deleteList(db: Db$2, id: string): Promise<{
    error: WriteError | null;
    count: number | null;
}>;

/**
 * Who a run of any kind reached, or is about to: the touches a playbook's gap and the week's breath hold people back
 * by (contracts eligibleForPlaybook), read by the edge's hourly sweep and the dashboard's Playbooks page alike.
 *
 * Each read them itself, the same rule twice, until one of them changed, which is the day the page's "waits for the
 * breath" would stop being the sweep's. The rule, once: a person sent to, or queued for a run on its way, was touched
 * from the moment it went or is due. A run canceled or failed touched only the people it had already sent to: stopped
 * halfway, it had reached them, and read as reaching nobody it messaged them again. A run waiting for a person whose
 * day has passed touched nobody: it can never be approved (core approveRun), and the approval sheet says the next run
 * starts over. A broadcast sent by hand counts for the breath and for no playbook's gap. A run that carries a
 * proposal's link is a proposal follow-up (0006), owed once per proposal whichever playbook sent it, one since deleted
 * too.
 */

type Db$1 = SupabaseClient<Database>;
/**
 * One person touched by one run: the run's playbook, if it was a playbook's, when (sent, or due), whether it went
 * (sent, rather than on its way or waiting), and whether the run was a proposal follow-up.
 */
interface Touch {
    contact_id: string;
    playbook_id: string | null;
    at: string;
    sent: boolean;
    /** Its run was made to wait for a person (pending_approval), today's, which may still go. */
    held: boolean;
    follow_up: boolean;
}
/**
 * The touches by person: the latest by any run (the breath), the latest by each playbook (its gap), and the latest
 * proposal follow-up by any playbook (the follow-up's once per proposal). Epoch ms.
 */
interface TouchIndex {
    byThis: Map<string, Map<string, number>>;
    byAny: Map<string, number>;
    followUps: Map<string, number>;
}
/**
 * Every touch since `since`, as of `now`. Runs are read by when they were made, from `since` on; a touch is dated by
 * when it went, or when its run is due, and one before `since` holds nobody back. Paged throughout: past a thousand
 * touches, the breath and each gap silently stopped holding and the people a read could no longer see were messaged
 * again. A read that fails THROWS -- "nobody was touched" is the reading that messages people twice. The workspace's
 * zone, read beside the runs, says which day is today for a run waiting for a person; unreadable, every waiting run
 * still holds its people, which never messages anyone twice either.
 */
declare function touchesSince(db: Db$1, tenantId: string, since: Date, now: Date): Promise<Touch[]>;
/**
 * The proposal follow-ups' touches alone since `since` (0006): the runs whose values carry a proposal's link, from
 * any playbook, one since deleted too. The window a follow-up needs is as long as a proposal waits, far longer than
 * the week's breath, so it is read for that one kind of run.
 */
declare function followUpTouchesSince(db: Db$1, tenantId: string, since: Date, now: Date): Promise<Touch[]>;
/** The touches by person, the way a run draws with them: the latest by any run, by each playbook, and follow-up. */
declare function touchIndex(touches: readonly Touch[]): TouchIndex;

/**
 * The deals a workspace's pace is read from (0008, amended): its yeses decided since a moment -- a deal standing won,
 * or ended since -- with their two days, for contracts dealPaceFrom. The edge's playbook sweep (the proposal
 * follow-up, 0006) and the dashboard's People reads read them alike, so the two never judge "waiting" by two paces.
 * Paged, so a busy year is read whole. A read that fails THROWS: each caller says what no pace costs it.
 */

type Db = SupabaseClient<Database>;
/** A yes as its wait is measured: its stage and its two days. */
interface YesRow {
    stage: string;
    proposed_at: string;
    decided_at: string | null;
}
/** Every yes decided since `since`, under whatever row security the client carries. */
declare function yesesSince(db: Db, tenantId: string, since: Date): Promise<YesRow[]>;

/**
 * The single Realtime subscription wrapper (Blueprint §5): every surface
 * subscribes through here, so the documented scale path (postgres_changes →
 * broadcast-from-database) never touches a surface. RLS authorizes events —
 * and the session token is pushed to Realtime EXPLICITLY before the channel
 * joins: relying on supabase-js's auth-listener propagation races the join,
 * and a channel that joins as `anon` receives zero rows forever (observed in
 * production via realtime.subscription claims_role). Topic names are
 * caller-scoped: two subscriptions on one client must not share a topic.
 */

interface SubscribeOptions {
    /** Unique topic suffix per subscriber (default "bridge"). */
    topic?: string;
    /** Server-side row filter, e.g. a tenant id — RLS still applies regardless. */
    tenantId?: string;
    /** Observability: called with SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / CLOSED. */
    onStatus?: (status: string) => void;
}
/** The tables the one subscription listens to: a surface's refreshOnTables can only name one of these. */
declare function watchedTables(): string[];
declare function subscribeMessagesInserts(client: SupabaseClient<Database>, 
/** Called with the changed row and the TABLE it came from, so a caller can
 *  route the event instead of repainting everything on every change. */
onInsert: (row: {
    conversation_id: string;
    tenant_id: string;
}, table: string, event?: string) => void, opts?: SubscribeOptions): () => void;

/**
 * Reading a whole answer out of PostgREST, which does not give you one.
 *
 * `api.max_rows` (supabase/config.toml) caps EVERY response at 1000 rows, and
 * it does it silently: no error, no flag, no partial-content status the client
 * library surfaces — a query matching 4000 rows answers with 1000 and looks
 * exactly like a query matching 1000. A `.limit(2000)` does not raise the cap
 * either; it lowers a ceiling that is already lower.
 *
 * So an unbounded read is not "read everything", it is "read the first
 * thousand and believe it", and the reads that were written that way are the
 * ones that go quietly wrong as a workspace grows: a touch history that stops
 * holding the week's breath, a set of seen reviews that starts re-announcing
 * old reviews as new, the people on a saved list that stop counting past the
 * thousandth. Each of those is correct on every small workspace and wrong on
 * exactly the large ones nobody tests against.
 *
 * `readAllRows` pages until the answer is short, so the caller gets the whole
 * set or a loud line saying it did not. The caller MUST order by something
 * unique — a range over an unstable order repeats and skips rows across page
 * boundaries — which is why every call site names a tiebreak column. One
 * pager for the edge and the dashboard: the edge wraps it with its own logger
 * (apps/edge/lib/paged.ts).
 */
/** `api.max_rows` in supabase/config.toml. A page is a whole one or the last one. */
declare const MAX_ROWS = 1000;
/** More than any workspace holds; a bound so a runaway read cannot exhaust a lambda. */
declare const DEFAULT_ROW_CAP = 20000;
interface Page<T> {
    data: T[] | null;
    error: {
        message: string;
    } | null;
}
/**
 * Every row the query matches, a page at a time.
 *
 * `page(from, to)` must apply `.range(from, to)` to an otherwise complete,
 * stably ordered query. Throws on a read error — a caller that must not fail
 * catches, the way the budget's does. Hitting `cap` is reported through
 * `onCapped` rather than thrown: a truncated answer that says so beats both a
 * silent one and an outage.
 */
declare function readAllRows<T>(what: string, page: (from: number, to: number) => PromiseLike<Page<T>>, cap?: number, onCapped?: (what: string, cap: number) => void): Promise<T[]>;

export { CALL_CONTROL_S, type ChannelLookup, type ControlHolder, type ControlOutcome, DEFAULT_ROW_CAP, type Database, HISTORY_COLUMNS, type InboundEmailFacts, type IngestCallResult, type IngestEmailParams, type IngestInboundParams, type IngestResult, type Json, type LeadContext, type ListRow, MAX_ROWS, type MailboxRow, type NormalizedCallInput, type OutboundTarget, PEOPLE_PAGE, type Page, type PgThreadState, type PolicyRecord, type PutTenantConfigResult, type RoutedChannel, type SavedListRow, type ServiceClientConfig, type SubscribeOptions, type TemplateRow, type TenantConfigRow, type ThreadTurn, type Touch, type TouchIndex, type WriteError, type YesRow, addToList, archiveList, assembleHistory, claimCallNotification, claimControl, countSentToday, createList, createServiceClient, deleteList, describeLead, dropFromList, emitEvent, everyoneIn, followUpTouchesSince, getTenantConfig, ingestCall, ingestInbound, ingestInboundEmail, lastInboundEmail, linkCallMessage, listMemberIds, listPolicies, listRow, mailboxById, mailboxFor, mailboxOfTenant, markProcessed, notesForReceptionist, pauseConversation, peoplePage, personReplyMode, playbooksOnList, putTenantConfig, readAllRows, readDealForPhone, readLeadContext, readThreadState, recordCallNote, recordEchoAndPause, recordEmailStatus, recordOutbound, recordStatusByExternalId, releaseControl, renameList, resolveChannel, resolveChannelDetailed, resolveOutboundTarget, savedListFor, savedListsFor, sentEmailWithMessageId, setCallRecording, setListRule, setPersonReplyMode, setPolicyMode, stampEmailSent, stampMailboxReceived, subscribeMessagesInserts, suppressEmailOf, templatesFor, touchIndex, touchesSince, watchedTables, yesesSince };
