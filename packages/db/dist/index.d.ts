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
            billing_card_marks: {
                Row: {
                    card_fingerprint: string;
                    seen_at: string;
                    tenant_id: string;
                };
                Insert: {
                    card_fingerprint: string;
                    seen_at?: string;
                    tenant_id: string;
                };
                Update: {
                    card_fingerprint?: string;
                    seen_at?: string;
                    tenant_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "billing_card_marks_tenant_id_fkey";
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
                    lease_until: string | null;
                    received_at: string;
                    state: string;
                    tenant_id: string | null;
                    type: string;
                };
                Insert: {
                    id: string;
                    lease_until?: string | null;
                    received_at?: string;
                    state?: string;
                    tenant_id?: string | null;
                    type: string;
                };
                Update: {
                    id?: string;
                    lease_until?: string | null;
                    received_at?: string;
                    state?: string;
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
                    activity_started_at: string | null;
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
                    activity_started_at?: string | null;
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
                    activity_started_at?: string | null;
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
                    email_marketing: string;
                    email_marketing_source: string | null;
                    email_marketing_updated_at: string | null;
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
                    email_marketing?: string;
                    email_marketing_source?: string | null;
                    email_marketing_updated_at?: string | null;
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
                    email_marketing?: string;
                    email_marketing_source?: string | null;
                    email_marketing_updated_at?: string | null;
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
                    invited_by: string | null;
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
                    invited_by?: string | null;
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
                    invited_by?: string | null;
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
                    thread_id: string | null;
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
                    thread_id?: string | null;
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
                    thread_id?: string | null;
                    via?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "lead_searches_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "lead_searches_thread_id_fkey";
                        columns: ["thread_id"];
                        isOneToOne: false;
                        referencedRelation: "ask_threads";
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
            partner_earnings: {
                Row: {
                    amount_cents: number;
                    created_at: string;
                    currency: string;
                    earned_cents: number;
                    id: string;
                    kind: string;
                    paid_at: string;
                    partner_id: string;
                    payable_at: string;
                    payout_id: string | null;
                    share_bp: number;
                    state: string;
                    stripe_event_id: string;
                    stripe_invoice_id: string;
                    tenant_id: string | null;
                    updated_at: string;
                };
                Insert: {
                    amount_cents: number;
                    created_at?: string;
                    currency: string;
                    earned_cents: number;
                    id?: string;
                    kind: string;
                    paid_at: string;
                    partner_id: string;
                    payable_at: string;
                    payout_id?: string | null;
                    share_bp: number;
                    state?: string;
                    stripe_event_id: string;
                    stripe_invoice_id: string;
                    tenant_id?: string | null;
                    updated_at?: string;
                };
                Update: {
                    amount_cents?: number;
                    created_at?: string;
                    currency?: string;
                    earned_cents?: number;
                    id?: string;
                    kind?: string;
                    paid_at?: string;
                    partner_id?: string;
                    payable_at?: string;
                    payout_id?: string | null;
                    share_bp?: number;
                    state?: string;
                    stripe_event_id?: string;
                    stripe_invoice_id?: string;
                    tenant_id?: string | null;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "partner_earnings_partner_id_fkey";
                        columns: ["partner_id"];
                        isOneToOne: false;
                        referencedRelation: "partners";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "partner_earnings_payout_id_fkey";
                        columns: ["payout_id"];
                        isOneToOne: false;
                        referencedRelation: "partner_payouts";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "partner_earnings_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            partner_payouts: {
                Row: {
                    created_at: string;
                    currency: string;
                    earnings: number;
                    id: string;
                    partner_id: string;
                    period_end: string;
                    period_start: string;
                    reference: string;
                    sent_at: string;
                    sent_by: string | null;
                    total_cents: number;
                };
                Insert: {
                    created_at?: string;
                    currency: string;
                    earnings: number;
                    id?: string;
                    partner_id: string;
                    period_end: string;
                    period_start: string;
                    reference: string;
                    sent_at?: string;
                    sent_by?: string | null;
                    total_cents: number;
                };
                Update: {
                    created_at?: string;
                    currency?: string;
                    earnings?: number;
                    id?: string;
                    partner_id?: string;
                    period_end?: string;
                    period_start?: string;
                    reference?: string;
                    sent_at?: string;
                    sent_by?: string | null;
                    total_cents?: number;
                };
                Relationships: [
                    {
                        foreignKeyName: "partner_payouts_partner_id_fkey";
                        columns: ["partner_id"];
                        isOneToOne: false;
                        referencedRelation: "partners";
                        referencedColumns: ["id"];
                    }
                ];
            };
            partner_reversals_waiting: {
                Row: {
                    amount_cents: number;
                    created_at: string;
                    kind: string;
                    stripe_event_id: string;
                    stripe_invoice_id: string;
                };
                Insert: {
                    amount_cents: number;
                    created_at?: string;
                    kind: string;
                    stripe_event_id: string;
                    stripe_invoice_id: string;
                };
                Update: {
                    amount_cents?: number;
                    created_at?: string;
                    kind?: string;
                    stripe_event_id?: string;
                    stripe_invoice_id?: string;
                };
                Relationships: [];
            };
            partner_tenants: {
                Row: {
                    attributed_at: string;
                    checks: Json;
                    code_used: string;
                    handover_accepted_at: string | null;
                    handover_accepted_by: string | null;
                    handover_declined_at: string | null;
                    handover_email: string | null;
                    handover_expires_at: string | null;
                    handover_sent_at: string | null;
                    origin: string;
                    partner_id: string;
                    seat_held_at: string | null;
                    standing: string | null;
                    standing_at: string | null;
                    standing_by: string | null;
                    standing_why: string | null;
                    tenant_id: string;
                };
                Insert: {
                    attributed_at?: string;
                    checks?: Json;
                    code_used: string;
                    handover_accepted_at?: string | null;
                    handover_accepted_by?: string | null;
                    handover_declined_at?: string | null;
                    handover_email?: string | null;
                    handover_expires_at?: string | null;
                    handover_sent_at?: string | null;
                    origin?: string;
                    partner_id: string;
                    seat_held_at?: string | null;
                    standing?: string | null;
                    standing_at?: string | null;
                    standing_by?: string | null;
                    standing_why?: string | null;
                    tenant_id: string;
                };
                Update: {
                    attributed_at?: string;
                    checks?: Json;
                    code_used?: string;
                    handover_accepted_at?: string | null;
                    handover_accepted_by?: string | null;
                    handover_declined_at?: string | null;
                    handover_email?: string | null;
                    handover_expires_at?: string | null;
                    handover_sent_at?: string | null;
                    origin?: string;
                    partner_id?: string;
                    seat_held_at?: string | null;
                    standing?: string | null;
                    standing_at?: string | null;
                    standing_by?: string | null;
                    standing_why?: string | null;
                    tenant_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "partner_tenants_partner_id_fkey";
                        columns: ["partner_id"];
                        isOneToOne: false;
                        referencedRelation: "partners";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "partner_tenants_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: true;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            partners: {
                Row: {
                    code: string;
                    created_at: string;
                    id: string;
                    letters: boolean;
                    payout_facts: Json;
                    second_factor_reset_at: string | null;
                    second_factor_reset_by: string | null;
                    second_factor_reset_why: string | null;
                    share_bp: number;
                    status: string;
                    status_at: string | null;
                    status_by: string | null;
                    status_why: string | null;
                    terms_accepted_at: string | null;
                    updated_at: string;
                    user_id: string | null;
                    written_through: string;
                };
                Insert: {
                    code: string;
                    created_at?: string;
                    id?: string;
                    letters?: boolean;
                    payout_facts?: Json;
                    second_factor_reset_at?: string | null;
                    second_factor_reset_by?: string | null;
                    second_factor_reset_why?: string | null;
                    share_bp?: number;
                    status?: string;
                    status_at?: string | null;
                    status_by?: string | null;
                    status_why?: string | null;
                    terms_accepted_at?: string | null;
                    updated_at?: string;
                    user_id?: string | null;
                    written_through?: string;
                };
                Update: {
                    code?: string;
                    created_at?: string;
                    id?: string;
                    letters?: boolean;
                    payout_facts?: Json;
                    second_factor_reset_at?: string | null;
                    second_factor_reset_by?: string | null;
                    second_factor_reset_why?: string | null;
                    share_bp?: number;
                    status?: string;
                    status_at?: string | null;
                    status_by?: string | null;
                    status_why?: string | null;
                    terms_accepted_at?: string | null;
                    updated_at?: string;
                    user_id?: string | null;
                    written_through?: string;
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
                    after_days: number | null;
                    after_playbook_id: string | null;
                    cadence_days: number;
                    cap_per_run: number;
                    created_at: string;
                    created_by: string | null;
                    domain_ids: string[];
                    gap_days: number;
                    gap_minutes: number | null;
                    id: string;
                    include_unconfirmed: boolean;
                    kind: string;
                    last_run_at: string | null;
                    last_run_for: string | null;
                    lead_search_id: string | null;
                    list_id: string | null;
                    list_key: string | null;
                    name: string;
                    params: Json;
                    policy_class: string;
                    run_hour: number;
                    signed_by: string | null;
                    state: string;
                    template_id: string;
                    template_language: string;
                    template_name: string;
                    tenant_id: string;
                    trigger: string;
                    updated_at: string;
                };
                Insert: {
                    after_days?: number | null;
                    after_playbook_id?: string | null;
                    cadence_days?: number;
                    cap_per_run?: number;
                    created_at?: string;
                    created_by?: string | null;
                    domain_ids?: string[];
                    gap_days?: number;
                    gap_minutes?: number | null;
                    id?: string;
                    include_unconfirmed?: boolean;
                    kind?: string;
                    last_run_at?: string | null;
                    last_run_for?: string | null;
                    lead_search_id?: string | null;
                    list_id?: string | null;
                    list_key?: string | null;
                    name: string;
                    params?: Json;
                    policy_class: string;
                    run_hour?: number;
                    signed_by?: string | null;
                    state?: string;
                    template_id: string;
                    template_language: string;
                    template_name: string;
                    tenant_id: string;
                    trigger: string;
                    updated_at?: string;
                };
                Update: {
                    after_days?: number | null;
                    after_playbook_id?: string | null;
                    cadence_days?: number;
                    cap_per_run?: number;
                    created_at?: string;
                    created_by?: string | null;
                    domain_ids?: string[];
                    gap_days?: number;
                    gap_minutes?: number | null;
                    id?: string;
                    include_unconfirmed?: boolean;
                    kind?: string;
                    last_run_at?: string | null;
                    last_run_for?: string | null;
                    lead_search_id?: string | null;
                    list_id?: string | null;
                    list_key?: string | null;
                    name?: string;
                    params?: Json;
                    policy_class?: string;
                    run_hour?: number;
                    signed_by?: string | null;
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
                        foreignKeyName: "playbooks_after_same_workspace";
                        columns: ["tenant_id", "after_playbook_id"];
                        isOneToOne: false;
                        referencedRelation: "playbooks";
                        referencedColumns: ["tenant_id", "id"];
                    },
                    {
                        foreignKeyName: "playbooks_list_id_fkey";
                        columns: ["list_id"];
                        isOneToOne: false;
                        referencedRelation: "segments";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "playbooks_search_same_workspace";
                        columns: ["tenant_id", "lead_search_id"];
                        isOneToOne: false;
                        referencedRelation: "lead_searches";
                        referencedColumns: ["tenant_id", "id"];
                    },
                    {
                        foreignKeyName: "playbooks_search_same_workspace";
                        columns: ["tenant_id", "lead_search_id"];
                        isOneToOne: false;
                        referencedRelation: "lead_searches_view";
                        referencedColumns: ["tenant_id", "id"];
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
                    activity_token: string | null;
                    app_version: string | null;
                    created_at: string;
                    id: string;
                    last_seen_at: string;
                    platform: string;
                    token: string;
                    user_id: string;
                };
                Insert: {
                    activity_token?: string | null;
                    app_version?: string | null;
                    created_at?: string;
                    id?: string;
                    last_seen_at?: string;
                    platform: string;
                    token: string;
                    user_id: string;
                };
                Update: {
                    activity_token?: string | null;
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
            reach_out_check_spend: {
                Row: {
                    attempts: number;
                    day: string;
                    tenant_id: string;
                };
                Insert: {
                    attempts?: number;
                    day: string;
                    tenant_id: string;
                };
                Update: {
                    attempts?: number;
                    day?: string;
                    tenant_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "reach_out_check_spend_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            reach_out_sends: {
                Row: {
                    angle: string | null;
                    attempts: number;
                    broadcast_id: string;
                    check_after: string | null;
                    check_first_at: string | null;
                    check_gen: number;
                    check_started_at: string | null;
                    check_tries: number;
                    checked_at: string | null;
                    checked_words: string | null;
                    claimed_at: string | null;
                    contact_id: string | null;
                    created_at: string;
                    domain_id: string | null;
                    facts_used: string[];
                    hold_detail: string | null;
                    id: string;
                    included_for: string[];
                    lead_id: string;
                    message_id: string | null;
                    opening: string | null;
                    playbook_id: string | null;
                    reason: string | null;
                    root_id: string;
                    send_at: string | null;
                    sent_at: string | null;
                    state: string;
                    tenant_id: string;
                    updated_at: string;
                };
                Insert: {
                    angle?: string | null;
                    attempts?: number;
                    broadcast_id: string;
                    check_after?: string | null;
                    check_first_at?: string | null;
                    check_gen?: number;
                    check_started_at?: string | null;
                    check_tries?: number;
                    checked_at?: string | null;
                    checked_words?: string | null;
                    claimed_at?: string | null;
                    contact_id?: string | null;
                    created_at?: string;
                    domain_id?: string | null;
                    facts_used?: string[];
                    hold_detail?: string | null;
                    id: string;
                    included_for?: string[];
                    lead_id: string;
                    message_id?: string | null;
                    opening?: string | null;
                    playbook_id?: string | null;
                    reason?: string | null;
                    root_id: string;
                    send_at?: string | null;
                    sent_at?: string | null;
                    state?: string;
                    tenant_id: string;
                    updated_at?: string;
                };
                Update: {
                    angle?: string | null;
                    attempts?: number;
                    broadcast_id?: string;
                    check_after?: string | null;
                    check_first_at?: string | null;
                    check_gen?: number;
                    check_started_at?: string | null;
                    check_tries?: number;
                    checked_at?: string | null;
                    checked_words?: string | null;
                    claimed_at?: string | null;
                    contact_id?: string | null;
                    created_at?: string;
                    domain_id?: string | null;
                    facts_used?: string[];
                    hold_detail?: string | null;
                    id?: string;
                    included_for?: string[];
                    lead_id?: string;
                    message_id?: string | null;
                    opening?: string | null;
                    playbook_id?: string | null;
                    reason?: string | null;
                    root_id?: string;
                    send_at?: string | null;
                    sent_at?: string | null;
                    state?: string;
                    tenant_id?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "reach_out_sends_broadcast_id_fkey";
                        columns: ["broadcast_id"];
                        isOneToOne: false;
                        referencedRelation: "broadcasts";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "reach_out_sends_contact_id_fkey";
                        columns: ["contact_id"];
                        isOneToOne: false;
                        referencedRelation: "contacts";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "reach_out_sends_domain_id_fkey";
                        columns: ["domain_id"];
                        isOneToOne: false;
                        referencedRelation: "sending_domains";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "reach_out_sends_lead_id_fkey";
                        columns: ["lead_id"];
                        isOneToOne: false;
                        referencedRelation: "leads";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "reach_out_sends_message_id_fkey";
                        columns: ["message_id"];
                        isOneToOne: false;
                        referencedRelation: "messages";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "reach_out_sends_playbook_id_fkey";
                        columns: ["playbook_id"];
                        isOneToOne: false;
                        referencedRelation: "playbooks";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "reach_out_sends_root_id_fkey";
                        columns: ["root_id"];
                        isOneToOne: false;
                        referencedRelation: "playbooks";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "reach_out_sends_tenant_id_fkey";
                        columns: ["tenant_id"];
                        isOneToOne: false;
                        referencedRelation: "tenants";
                        referencedColumns: ["id"];
                    }
                ];
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
            sending_domains: {
                Row: {
                    bounced_recent: number | null;
                    checked_at: string | null;
                    clean_since: string | null;
                    complaints: number | null;
                    counted_since: string | null;
                    created_at: string;
                    created_by: string | null;
                    dmarc: string | null;
                    from_local: string;
                    from_name: string;
                    held_at: string | null;
                    held_why: string | null;
                    host: string;
                    id: string;
                    provider_domain_id: string | null;
                    provider_status: string | null;
                    records: Json;
                    resume_by: string;
                    sent_days: number | null;
                    sent_recent: number | null;
                    state: string;
                    tenant_id: string;
                    updated_at: string;
                    verified_at: string | null;
                };
                Insert: {
                    bounced_recent?: number | null;
                    checked_at?: string | null;
                    clean_since?: string | null;
                    complaints?: number | null;
                    counted_since?: string | null;
                    created_at?: string;
                    created_by?: string | null;
                    dmarc?: string | null;
                    from_local: string;
                    from_name: string;
                    held_at?: string | null;
                    held_why?: string | null;
                    host: string;
                    id?: string;
                    provider_domain_id?: string | null;
                    provider_status?: string | null;
                    records?: Json;
                    resume_by?: string;
                    sent_days?: number | null;
                    sent_recent?: number | null;
                    state?: string;
                    tenant_id: string;
                    updated_at?: string;
                    verified_at?: string | null;
                };
                Update: {
                    bounced_recent?: number | null;
                    checked_at?: string | null;
                    clean_since?: string | null;
                    complaints?: number | null;
                    counted_since?: string | null;
                    created_at?: string;
                    created_by?: string | null;
                    dmarc?: string | null;
                    from_local?: string;
                    from_name?: string;
                    held_at?: string | null;
                    held_why?: string | null;
                    host?: string;
                    id?: string;
                    provider_domain_id?: string | null;
                    provider_status?: string | null;
                    records?: Json;
                    resume_by?: string;
                    sent_days?: number | null;
                    sent_recent?: number | null;
                    state?: string;
                    tenant_id?: string;
                    updated_at?: string;
                    verified_at?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "sending_domains_tenant_id_fkey";
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
                    thread_id: string | null;
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
                    },
                    {
                        foreignKeyName: "lead_searches_thread_id_fkey";
                        columns: ["thread_id"];
                        isOneToOne: false;
                        referencedRelation: "ask_threads";
                        referencedColumns: ["id"];
                    }
                ];
            };
        };
        Functions: {
            billing_card_mark: {
                Args: {
                    p_fingerprint: string;
                    p_tenant_id: string;
                };
                Returns: undefined;
            };
            call_status_rank: {
                Args: {
                    p_status: string;
                };
                Returns: number;
            };
            caller_has_permission: {
                Args: {
                    p_permission: string;
                    p_tenant_id: string;
                };
                Returns: boolean;
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
            cold_receipts_owed: {
                Args: {
                    p_from: string;
                    p_to: string;
                };
                Returns: {
                    host: string;
                    sent: number;
                    tenant_id: string;
                    unanswered: number;
                }[];
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
                    p_partner_code?: string;
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
                    p_partner_code?: string;
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
            create_workspace_for_business: {
                Args: {
                    p_name: string;
                    p_owner_email: string;
                    p_timezone: string;
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
            delete_my_account: {
                Args: never;
                Returns: Json;
            };
            drop_google_credentials: {
                Args: {
                    p_tenant_id: string;
                };
                Returns: boolean;
            };
            email_from_host: {
                Args: {
                    p_meta: Json;
                };
                Returns: string;
            };
            email_left: {
                Args: {
                    p_error: Json;
                    p_status: string;
                };
                Returns: boolean;
            };
            email_sent_at: {
                Args: {
                    p_created_at: string;
                    p_meta: Json;
                    p_status_updated_at: string;
                };
                Returns: string;
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
            handover_accept: {
                Args: {
                    p_tenant: string;
                };
                Returns: {
                    id: string;
                    name: string;
                    slug: string;
                }[];
            };
            handover_decline: {
                Args: {
                    p_tenant: string;
                };
                Returns: undefined;
            };
            handovers_mine: {
                Args: never;
                Returns: {
                    expires_at: string;
                    partner_code: string;
                    tenant_id: string;
                    workspace: string;
                }[];
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
            lead_member_of: {
                Args: {
                    p_lead_id: string;
                    p_search_id?: string;
                    p_tenant_id: string;
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
            lead_member_shown: {
                Args: {
                    p_class: string;
                    p_counted: boolean;
                };
                Returns: boolean;
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
            lead_name_key: {
                Args: {
                    p_name: string;
                };
                Returns: string;
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
                    p_thread_id?: string;
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
            lead_site_key: {
                Args: {
                    p_host: string;
                };
                Returns: string;
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
            outreach_facts: {
                Args: {
                    p_contact_id: string;
                    p_host: string;
                    p_lead_id?: string;
                    p_since: string;
                    p_tenant_id: string;
                    p_to: string;
                };
                Returns: Json;
            };
            outreach_lead_facts: {
                Args: {
                    p_contact_id: string;
                    p_lead_id?: string;
                    p_tenant_id: string;
                    p_to: string;
                };
                Returns: Json;
            };
            outreach_wrote_back: {
                Args: {
                    p_contact_ids: string[];
                    p_tenant_id: string;
                };
                Returns: string[];
            };
            partner_balance: {
                Args: never;
                Returns: {
                    currency: string;
                    earned_cents: number;
                    next_payable_at: string;
                    state: string;
                }[];
            };
            partner_become: {
                Args: {
                    p_code: string;
                };
                Returns: Json;
            };
            partner_earn: {
                Args: {
                    p_amount_cents: number;
                    p_currency: string;
                    p_event_id: string;
                    p_invoice_id: string;
                    p_paid_at: string;
                    p_tenant_id: string;
                };
                Returns: Json;
            };
            partner_earnings_sweep: {
                Args: {
                    p_now?: string;
                };
                Returns: Json;
            };
            partner_handover_resend: {
                Args: {
                    p_email: string;
                    p_tenant: string;
                };
                Returns: Json;
            };
            partner_letter_written: {
                Args: {
                    p_partner: string;
                    p_through: string;
                };
                Returns: boolean;
            };
            partner_letters_due: {
                Args: {
                    p_now?: string;
                };
                Returns: {
                    code: string;
                    email: string;
                    news: Json;
                    partner_id: string;
                    since: string;
                    status: string;
                    through: string;
                }[];
            };
            partner_letters_set: {
                Args: {
                    p_on: boolean;
                };
                Returns: boolean;
            };
            partner_overview: {
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
            partner_payout_mark: {
                Args: {
                    p_currency: string;
                    p_expected_cents?: number;
                    p_partner: string;
                    p_reference: string;
                };
                Returns: Json;
            };
            partner_reverse: {
                Args: {
                    p_amount_cents: number;
                    p_event_id: string;
                    p_invoice_id: string;
                    p_kind: string;
                };
                Returns: Json;
            };
            partner_second_factor_reset: {
                Args: {
                    p_partner: string;
                    p_why: string;
                };
                Returns: string;
            };
            partner_standing_set: {
                Args: {
                    p_standing: string;
                    p_tenant: string;
                    p_why: string;
                };
                Returns: Json;
            };
            partner_status_set: {
                Args: {
                    p_partner: string;
                    p_status: string;
                    p_why: string;
                };
                Returns: Json;
            };
            partner_workspace_money: {
                Args: never;
                Returns: {
                    currency: string;
                    held_cents: number;
                    month_cents: number;
                    name: string;
                    on_team: boolean;
                    paid_cents: number;
                    payable_cents: number;
                    standing: string;
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
            platform_overview_rows_for: {
                Args: {
                    p_tenants: string[];
                };
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
            platform_partner_balances: {
                Args: never;
                Returns: {
                    code: string;
                    currency: string;
                    email: string;
                    held_cents: number;
                    joined_at: string;
                    last_paid_at: string;
                    paid_cents: number;
                    partner_id: string;
                    payable_cents: number;
                    share_bp: number;
                    status: string;
                    under_review: number;
                    workspaces: number;
                }[];
            };
            platform_partner_workspaces: {
                Args: never;
                Returns: {
                    attributed_at: string;
                    checks: Json;
                    code: string;
                    decided_by: string;
                    partner_id: string;
                    standing: string;
                    standing_at: string;
                    standing_why: string;
                    tenant_id: string;
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
                    p_activity_token?: string;
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
            reach_out_audience: {
                Args: {
                    p_include_unconfirmed?: boolean;
                    p_limit: number;
                    p_search_id: string;
                    p_tenant_id: string;
                };
                Returns: {
                    business_name: string;
                    city: string;
                    email: string;
                    hours: Json;
                    lead_id: string;
                    region: string;
                }[];
            } | {
                Args: {
                    p_limit: number;
                    p_root_id: string;
                    p_search_id: string;
                    p_tenant_id: string;
                };
                Returns: {
                    business_name: string;
                    city: string;
                    email: string;
                    hours: Json;
                    lead_id: string;
                    region: string;
                }[];
            };
            reach_out_chain_report: {
                Args: {
                    p_root_id: string;
                    p_tenant_id: string;
                };
                Returns: Json;
            };
            reach_out_check_take: {
                Args: {
                    p_at?: string;
                    p_cap: number;
                    p_tenant_id: string;
                };
                Returns: boolean;
            };
            reach_out_claim: {
                Args: {
                    p_at: string;
                    p_cap: number;
                    p_domain_id: string;
                    p_limit: number;
                };
                Returns: {
                    angle: string | null;
                    attempts: number;
                    broadcast_id: string;
                    check_after: string | null;
                    check_first_at: string | null;
                    check_gen: number;
                    check_started_at: string | null;
                    check_tries: number;
                    checked_at: string | null;
                    checked_words: string | null;
                    claimed_at: string | null;
                    contact_id: string | null;
                    created_at: string;
                    domain_id: string | null;
                    facts_used: string[];
                    hold_detail: string | null;
                    id: string;
                    included_for: string[];
                    lead_id: string;
                    message_id: string | null;
                    opening: string | null;
                    playbook_id: string | null;
                    reason: string | null;
                    root_id: string;
                    send_at: string | null;
                    sent_at: string | null;
                    state: string;
                    tenant_id: string;
                    updated_at: string;
                }[];
                SetofOptions: {
                    from: "*";
                    to: "reach_out_sends";
                    isOneToOne: false;
                    isSetofReturn: true;
                };
            };
            reach_out_closed_sends: {
                Args: {
                    p_limit: number;
                    p_stuck_before: string;
                    p_tenant_id?: string;
                };
                Returns: {
                    email_status: string;
                    send: Json;
                }[];
            };
            reach_out_due_domains: {
                Args: {
                    p_at: string;
                    p_limit: number;
                    p_skip_domains?: string[];
                    p_skip_tenants?: string[];
                    p_tenant_id?: string;
                };
                Returns: {
                    id: string;
                    tenant_id: string;
                }[];
            };
            reach_out_finishable: {
                Args: {
                    p_limit: number;
                    p_tenant_id?: string;
                };
                Returns: string[];
            };
            reach_out_followers: {
                Args: {
                    p_after_days: number;
                    p_limit: number;
                    p_parent_id: string;
                    p_step_id: string;
                    p_tenant_id: string;
                };
                Returns: {
                    bounced: boolean;
                    contact_id: string;
                    email: string;
                    facts: Json;
                    hours: Json;
                    lead_id: string;
                    parent_message_id: string;
                    region: string;
                }[];
            };
            reach_out_given_up: {
                Args: {
                    p_created_at: string;
                };
                Returns: boolean;
            };
            reach_out_held_stale: {
                Args: {
                    p_before: string;
                    p_limit: number;
                    p_tenant_id?: string;
                };
                Returns: {
                    angle: string | null;
                    attempts: number;
                    broadcast_id: string;
                    check_after: string | null;
                    check_first_at: string | null;
                    check_gen: number;
                    check_started_at: string | null;
                    check_tries: number;
                    checked_at: string | null;
                    checked_words: string | null;
                    claimed_at: string | null;
                    contact_id: string | null;
                    created_at: string;
                    domain_id: string | null;
                    facts_used: string[];
                    hold_detail: string | null;
                    id: string;
                    included_for: string[];
                    lead_id: string;
                    message_id: string | null;
                    opening: string | null;
                    playbook_id: string | null;
                    reason: string | null;
                    root_id: string;
                    send_at: string | null;
                    sent_at: string | null;
                    state: string;
                    tenant_id: string;
                    updated_at: string;
                }[];
                SetofOptions: {
                    from: "*";
                    to: "reach_out_sends";
                    isOneToOne: false;
                    isSetofReturn: true;
                };
            };
            reach_out_month_sent: {
                Args: {
                    p_at: string;
                    p_tenant_id: string;
                };
                Returns: number;
            };
            reach_out_person: {
                Args: {
                    p_lead_id: string;
                    p_tenant_id: string;
                };
                Returns: Json;
            };
            reach_out_plan_run: {
                Args: {
                    p_run: Json;
                    p_sends: Json;
                };
                Returns: Json;
            };
            reach_out_queued_outcomes: {
                Args: {
                    p_limit: number;
                    p_tenant_id?: string;
                };
                Returns: {
                    error: Json;
                    send: Json;
                    sent_at: string;
                    status: string;
                    written_at: string;
                }[];
            };
            reach_out_reach: {
                Args: {
                    p_search_id: string;
                    p_tenant_id: string;
                };
                Returns: Json;
            };
            reach_out_recheck: {
                Args: {
                    p_from_state?: string;
                    p_send_ids: string[];
                    p_tenant_id?: string;
                };
                Returns: number;
            };
            reach_out_record: {
                Args: {
                    p_lead_id: string;
                    p_search_id: string;
                    p_tenant_id: string;
                };
                Returns: {
                    about: string;
                    business_name: string;
                    category: string;
                    city: string;
                    email: string;
                    email_domain_shared: boolean;
                    hours: Json;
                    name_listings: number;
                    rating: number;
                    region: string;
                    reviews: number;
                    site_listings: number;
                    website_host: string;
                    what_you_asked: string;
                    why_it_fits: string;
                }[];
            };
            reach_out_release_unavailable: {
                Args: {
                    p_before: string;
                    p_tenant_id?: string;
                };
                Returns: number;
            };
            reach_out_remove: {
                Args: {
                    p_root_id: string;
                    p_tenant_id: string;
                };
                Returns: Json;
            };
            reach_out_run_recheck: {
                Args: {
                    p_broadcast_id: string;
                };
                Returns: Json;
            };
            reach_out_save: {
                Args: {
                    p_chain: Json;
                    p_tenant_id: string;
                    p_user_id: string;
                };
                Returns: Json;
            };
            reach_out_send_decide: {
                Args: {
                    p_decision: string;
                    p_send_id: string;
                };
                Returns: Json;
            };
            reach_out_stale_sends: {
                Args: {
                    p_before: string;
                    p_limit: number;
                    p_tenant_id?: string;
                };
                Returns: {
                    angle: string | null;
                    attempts: number;
                    broadcast_id: string;
                    check_after: string | null;
                    check_first_at: string | null;
                    check_gen: number;
                    check_started_at: string | null;
                    check_tries: number;
                    checked_at: string | null;
                    checked_words: string | null;
                    claimed_at: string | null;
                    contact_id: string | null;
                    created_at: string;
                    domain_id: string | null;
                    facts_used: string[];
                    hold_detail: string | null;
                    id: string;
                    included_for: string[];
                    lead_id: string;
                    message_id: string | null;
                    opening: string | null;
                    playbook_id: string | null;
                    reason: string | null;
                    root_id: string;
                    send_at: string | null;
                    sent_at: string | null;
                    state: string;
                    tenant_id: string;
                    updated_at: string;
                }[];
                SetofOptions: {
                    from: "*";
                    to: "reach_out_sends";
                    isOneToOne: false;
                    isSetofReturn: true;
                };
            };
            reach_out_unchecked: {
                Args: {
                    p_ahead_minutes: number;
                    p_limit: number;
                    p_per_workspace: number;
                    p_tenant_id?: string;
                };
                Returns: {
                    about: string;
                    business_name: string;
                    category: string;
                    check_gen: number;
                    city: string;
                    email: string;
                    email_domain_shared: boolean;
                    hours: Json;
                    included_for: string[];
                    name_listings: number;
                    rating: number;
                    region: string;
                    reviews: number;
                    send: Json;
                    signed_by: string;
                    site_listings: number;
                    template_id: string;
                    template_language: string;
                    website_host: string;
                    what_you_asked: string;
                    why_it_fits: string;
                }[];
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
            sending_domain_capacity: {
                Args: {
                    p_at: string;
                    p_domain_id: string;
                };
                Returns: Json;
            };
            sending_domain_counts: {
                Args: {
                    p_host: string;
                    p_since: string;
                    p_tenant_id: string;
                };
                Returns: Json;
            };
            session_shows_second_factor: {
                Args: never;
                Returns: boolean;
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
            set_email_marketing: {
                Args: {
                    p_contact_id: string;
                    p_evidence?: Json;
                    p_message_id?: string;
                    p_source: string;
                    p_state: string;
                    p_tenant_id: string;
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
            stamp_email_complaint: {
                Args: {
                    p_at: string;
                    p_message_id: string;
                    p_tenant_id: string;
                };
                Returns: boolean;
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
            trigger_domains_sweep: {
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
            trigger_partners_sweep: {
                Args: never;
                Returns: number;
            };
            trigger_playbooks_sweep: {
                Args: never;
                Returns: number;
            };
            trigger_reach_out_check_sweep: {
                Args: never;
                Returns: number;
            };
            trigger_reach_out_sweep: {
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

type Db$i = SupabaseClient<Database>;
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
declare function ingestInbound(db: Db$i, p: IngestInboundParams): Promise<IngestResult>;
/**
 * A no the carrier reported instead of relaying: a text refused with Twilio
 * 21610, the person having replied STOP to the number before we heard (the
 * STOP went to the carrier, or came before the line's webhook pointed here).
 * The number is unreachable whatever our row says (contracts enums.ts, the
 * carriers' words), so the row is brought to agree with the carrier THE WAY
 * ingest_inbound records a STOP it did hear: the three consent columns
 * together, dnc with them, and one contact.consent_changed row -- the carrier
 * as its source, since there is no message of theirs to name. A person
 * already opted out is left as they are, with no second ledger row: the
 * update is guarded and counted, and the event written only for a row that
 * changed. A write that fails THROWS, as ingestInbound's does: the door
 * reports the send as it reports any wire it could not write, rather than a
 * no going unrecorded under a refusal that says it was.
 */
declare function recordCarrierOptOut(db: Db$i, p: {
    tenantId: string;
    contactId: string;
    channel: "sms";
    previous: string | null;
}): Promise<boolean>;
/** Stamp a message handled (replied / deliberately skipped) — retry no-ops after this.
 *  One server-side jsonb merge (no read-modify-write, no lost-update race). */
declare function markProcessed(db: Db$i, tenantId: string, messageId: string): Promise<void>;
declare function recordOutbound(db: Db$i, p: {
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
declare function resolveOutboundTarget(db: Db$i, p: {
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
declare function countSentToday(db: Db$i, p: {
    tenantId: string;
    conversationId: string;
    source: string;
}): Promise<number>;
/** Delivery receipts: update by wamid; monotone rank enforced by trigger. */
declare function recordStatusByExternalId(db: Db$i, tenantId: string, externalId: string, status: "sent" | "delivered" | "read" | "failed", errorDetail?: Json): Promise<void>;
/** Owner replied from the WhatsApp Business app: persist the echo + pause the bot.
 *  Upserts the contact/conversation — an owner-INITIATED thread (customer never
 *  messaged yet) must still record the message and the pause, or the
 *  receptionist answers over the person who just replied. */
declare function recordEchoAndPause(db: Db$i, p: {
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
declare function pauseConversation(db: Db$i, tenantId: string, conversationId: string, pausedUntilIso: string, 
/** The holding message this same handoff queued, which the pause must not withdraw. */
opts?: {
    keepMessageId?: string | null;
}): Promise<boolean>;
declare function emitEvent(db: Db$i, tenantId: string, kind: EventKind, category: string, subjectType: string | null, subjectId: string | null, data?: Json): Promise<void>;

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

type Db$h = SupabaseClient<Database>;
type MailboxRow = Database["public"]["Tables"]["mailboxes"]["Row"];
declare function mailboxById(db: Db$h, id: string): Promise<MailboxRow | null>;
/** The mailbox a published address or a reply route names. A rotated-out token still routes until it is revoked (00126). */
declare function mailboxFor(db: Db$h, to: {
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
declare function ingestInboundEmail(db: Db$h, p: IngestEmailParams): Promise<IngestResult>;
/** Did this workspace send a message with this Message-ID? How an email that is our own, coming back, is known. */
declare function sentEmailWithMessageId(db: Db$h, tenantId: string, rfcMessageId: string): Promise<boolean>;
declare function stampMailboxReceived(db: Db$h, mailboxId: string, at: string): Promise<void>;
/** A workspace's mailbox; null when it has none, which is a workspace with no email line. */
declare function mailboxOfTenant(db: Db$h, tenantId: string): Promise<MailboxRow | null>;
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
declare function lastInboundEmail(db: Db$h, tenantId: string, conversationId: string): Promise<InboundEmailFacts | null>;
/**
 * A sent email learns the provider's id and the Message-ID it left with
 * (00128, one statement, so it cannot overwrite a status stamp written beside
 * it), and says where the row stands and which thread it is on. Null when this
 * workspace has no such outbound email: a receipt for a row that is not there.
 */
declare function stampEmailSent(db: Db$h, p: {
    tenantId: string;
    messageId: string;
    providerId: string;
    rfcMessageId: string | null;
}): Promise<{
    status: string;
    conversationId: string;
} | null>;
/**
 * The request an outbound email was frozen with (its row's meta.email.request), or null when there is no such row or
 * it froze none: what a receipt reads to know whether the email was a reply or a campaign's (channels
 * isCampaignEmail). A read that fails throws; the receipt comes again.
 */
declare function sentEmailRequestOf(db: Db$h, p: {
    tenantId: string;
    messageId: string;
}): Promise<unknown | null>;
/**
 * An outbound email as a receipt reads it: the request it was frozen with, and the lead a reach-out wrote it for
 * (meta.reach_out.lead_id), so a permanent bounce marks that lead's address (Reach out C11). Null when there is no such
 * row. A read that fails throws; the receipt comes again.
 */
declare function sentEmailOf(db: Db$h, p: {
    tenantId: string;
    messageId: string;
}): Promise<{
    request: unknown | null;
    leadId: string | null;
} | null>;
/**
 * A complaint, stamped once on the row it is about (00176), so the domain it left from answers for it. True when this
 * stamped it; false when it was stamped before or is no such row.
 */
declare function stampEmailComplaint(db: Db$h, p: {
    tenantId: string;
    messageId: string;
    at: string;
}): Promise<boolean>;
/**
 * A complaint on an email, recorded as the person's no (00177): the unsubscribe's own door, source 'complaint', so
 * the address goes on the never-again list and their leads are closed as said no. Answers the person and the From
 * the email left as (its frozen request's), so the caller can hold the domain it came from; a row with no person
 * records nothing, since there is no one to stop.
 */
declare function recordEmailNo(db: Db$h, p: {
    tenantId: string;
    messageId: string;
    source: "complaint";
}): Promise<{
    contactId: string | null;
    from: string | null;
}>;
/**
 * Move a sent email to what its receipt says. A move messages_guard refuses
 * (backwards, or off a terminal state) is a receipt arriving out of order, and
 * is let go the way recordStatusByExternalId lets it go; anything else throws.
 */
declare function recordEmailStatus(db: Db$h, p: {
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
declare function suppressEmailOf(db: Db$h, p: {
    tenantId: string;
    messageId: string;
    addresses: string[];
    reason: "hard_bounce" | "complaint" | "provider";
    at: string;
}): Promise<string | null>;

/**
 * sending_domains (00175): a workspace's own domains for cold email, as the edge reads and writes them. The one place
 * the table is typed. Members read it through RLS (the dashboard's server/sending-domains.ts); every write here is
 * the service role's, on the edge, because each follows a call to the cold mail account.
 */

type Db$g = SupabaseClient<Database>;
type SendingDomainRow = Database["public"]["Tables"]["sending_domains"]["Row"];
type Patch = Database["public"]["Tables"]["sending_domains"]["Update"];
declare function sendingDomainsOf(db: Db$g, tenantId: string): Promise<SendingDomainRow[]>;
declare function sendingDomainOf(db: Db$g, tenantId: string, id: string): Promise<SendingDomainRow | null>;
/** One of a workspace's domains by its host (lower-cased, 00175); null when it owns none by that name. */
declare function sendingDomainByHost(db: Db$g, tenantId: string, host: string): Promise<SendingDomainRow | null>;
/** What the clock reads: every domain being checked or able to send, the longest unread first. */
declare function dueSendingDomains(db: Db$g, limit: number): Promise<SendingDomainRow[]>;
/** One verified own domain's emails in a window: how many left it, and how many no delivery receipt has reached. */
type ColdReceiptsOwed = Database["public"]["Functions"]["cold_receipts_owed"]["Returns"][number];
/**
 * Every verified own domain that sent in [from, to), across the platform (00179): what the domains sweep reads to find
 * a cold webhook whose receipts never arrive. A domain that sent nothing in the window is not listed.
 */
declare function coldReceiptsOwed(db: Db$g, from: Date, to: Date): Promise<ColdReceiptsOwed[]>;
declare function countSendingDomains(db: Db$g, tenantId: string): Promise<number>;
/**
 * Who holds a host a reservation found taken: enough to say whose it is, whether it was ever verified, and the records
 * it was given, whose DKIM key in DNS says the holder did the work at their registrar.
 */
type SendingDomainHolder = Pick<SendingDomainRow, "id" | "tenant_id" | "state" | "created_at" | "provider_domain_id" | "provider_status" | "updated_at" | "records">;
/**
 * The host, held for this workspace before the provider is asked: unique across the platform (00175). Taken names
 * the holder; five already is the table's own limit (sending_domains_within_limit), which a count before the insert
 * could not hold against two adds pressed at once.
 */
declare function reserveSendingDomain(db: Db$g, i: {
    tenantId: string;
    host: string;
    fromLocal: string;
    fromName: string;
    by: string | null;
}): Promise<{
    ok: true;
    row: SendingDomainRow;
} | {
    ok: false;
    reason: "taken";
    holder: SendingDomainHolder | null;
} | {
    ok: false;
    reason: "too_many";
}>;
/**
 * A write that changes nothing but the row's `updated_at` (moddatetime): a removal fences off a check already in
 * flight, whose write names the row as it was read and now finds it moved (applyDomainCheck). Null when the row is gone.
 */
declare function touchSendingDomain(db: Db$g, row: SendingDomainRow): Promise<SendingDomainRow | null>;
/** The provider's id, records and word, on the row reserved for them. */
declare function recordProviderDomain(db: Db$g, id: string, p: {
    providerDomainId: string;
    records: Json;
    providerStatus: string;
}): Promise<SendingDomainRow>;
/**
 * A check's result, written only onto the row as it was read: another writer since (an owner's Check racing the
 * clock, a removal) wins, and this answers null rather than overwrite what it did not see.
 */
declare function applyDomainCheck(db: Db$g, row: SendingDomainRow, patch: Patch): Promise<SendingDomainRow | null>;
/**
 * What one own domain sent since it was last clean (00176): the last 500 that left, the bounces among them, the
 * complaints, and the unsubscribes they drew (00188; none from a database before it). A read that fails throws; the
 * caller judges nothing on it.
 */
declare function sendingDomainCounts(db: Db$g, tenantId: string, host: string, since: string | null): Promise<{
    sent: number;
    bounced: number;
    complained: number;
    unsubscribed: number;
    complained_new: number;
}>;
/**
 * How many times this workspace's domain by this host was held for its reputation since `sinceIso` (its
 * sending_domain.held events, by host: a domain removed and added again has a new id, and the same name). What makes
 * a second hold the platform's to lift (D16). A read that fails throws.
 */
declare function reputationHoldsSince(db: Db$g, p: {
    tenantId: string;
    host: string;
    sinceIso: string;
    whys: readonly string[];
}): Promise<number>;
/**
 * Whether this workspace's domain by this host is, by its ledger, still held for the platform to lift (D16): its last
 * platform word since `sinceIso` a hold the platform lifts (a sending_domain.held with resume_by platform) and not the
 * platform's Resume. What refuses an owner who removed the domain while so held from adding it again. A read that fails
 * throws.
 */
declare function platformHoldStands(db: Db$g, p: {
    tenantId: string;
    host: string;
    sinceIso: string;
}): Promise<boolean>;
/** A domain removed only as it was read: another writer since (its owner checking it, say) wins. */
declare function deleteSendingDomainAsRead(db: Db$g, row: Pick<SendingDomainRow, "id" | "tenant_id" | "updated_at">): Promise<boolean>;
/**
 * Whether this domain was held since `sinceIso` for one of `whys` (its sending_domain.held events): what the once-a-day
 * notice asks, of the holds it covers only, so a hold that told nobody never quiets one that must.
 */
declare function domainHeldSince(db: Db$g, tenantId: string, domainId: string, sinceIso: string, whys: readonly string[]): Promise<boolean>;
declare function deleteSendingDomain(db: Db$g, tenantId: string, id: string): Promise<boolean>;

/**
 * What the send door asks of a cold email (00177 outreach_facts): one question, one answer. The one place the door's
 * outreach facts are typed. The service role asks it (the send path runs on the edge); a read that fails throws,
 * because "we could not check" is not "yes".
 */

type Db$f = SupabaseClient<Database>;
interface OutreachFactsRow {
    /** The lead's stage, the one still being written to first; null when the finder never found this person. */
    lead_stage: string | null;
    /** The address is on the workspace's never-again list (lead_suppressions, email). */
    suppressed: boolean;
    /**
     * The person wrote back, or phoned (00181): a message of their own on any channel, an email from any address that
     * answers or cites one sent to them, or a call they made. An out-of-office is not one.
     */
    wrote_back: boolean;
    /**
     * The From host's row as Connections set it up, with the days it has sent on since it was clean (D15, 00184); null
     * when the workspace owns no such domain.
     */
    domain: {
        state: string;
        from_local: string;
        clean_since: string | null;
        sent_days: number;
    } | null;
    /** What left from that domain since `since`. */
    sent_since: number;
}
declare function outreachFactsOf(db: Db$f, p: {
    tenantId: string;
    contactId: string;
    to: string;
    host: string;
    since: string;
    /** The lead the send is for (a reach-out's always names one): its own stage, not any lead of this person's. */
    leadId?: string | null;
}): Promise<OutreachFactsRow>;

/**
 * Reach out's sends and the doors they go through (Part 3): the one place `reach_out_sends` is typed, and the doors of
 * 00184. The service role asks every one of them (the edge's clock and run); a read or a door that fails throws,
 * because "we could not check" is not "yes".
 */

type Db$e = SupabaseClient<Database>;
type ReachOutSendRow = Database["public"]["Tables"]["reach_out_sends"]["Row"];
type ReachOutSendInsert = Database["public"]["Tables"]["reach_out_sends"]["Insert"];
/** What a domain may still send (00184 sending_domain_capacity): the one reading the timetable, the claim and the door share. */
interface DomainCapacity {
    state: string;
    clean_since: string | null;
    /** The days it sent on since it was clean, within the last 90 (D15). */
    sent_days: number;
    /** What it spends in the rolling day: left, of unknown outcome, queued, claimed. */
    used: number;
    /** When it spends each (ms): those of the rolling day, the waiting ones, and the planned ones ahead. */
    recent: number[];
    last_sent_at: string | null;
}
declare function domainCapacityOf(db: Db$e, domainId: string, at: Date): Promise<DomainCapacity>;
interface AudienceLead {
    lead_id: string;
    email: string;
    business_name: string | null;
    city: string | null;
    region: string | null;
    hours: unknown;
}
/**
 * The leads a chain's first step may write to (00197 reach_out_audience), strongest fit first: never one any chain of
 * the workspace planned, held or wrote to, and a catch-all address only when the chain includes them.
 */
declare function reachOutAudience(db: Db$e, p: {
    tenantId: string;
    searchId: string;
    limit: number;
    includeUnconfirmed: boolean;
}): Promise<AudienceLead[]>;
type PersonForSend = {
    ok: true;
    contactId: string;
    conversationId: string;
    made: boolean;
} | {
    ok: false;
    refused: "lead_gone" | "lead_closed" | "no_address" | "already_yours";
};
/** The person a first send needs, made once (00184 reach_out_person): never a lead converted by it. */
declare function reachOutPerson(db: Db$e, tenantId: string, leadId: string): Promise<PersonForSend>;
/** Up to `limit` due sends of a running chain on one domain, claimed under its lock within `cap` (00184, C7). */
declare function claimSends(db: Db$e, p: {
    domainId: string;
    cap: number;
    at: Date;
    limit: number;
}): Promise<ReachOutSendRow[]>;
/** One send's move, only from the state it was read in: a stale writer changes nothing and is told so. */
declare function moveSend(db: Db$e, p: {
    tenantId: string;
    id: string;
    from: ReachOutSendRow["state"];
    patch: Partial<ReachOutSendRow>;
}): Promise<boolean>;
interface FollowerLead {
    lead_id: string;
    contact_id: string;
    email: string;
    region: string | null;
    hours: unknown;
    parent_message_id: string;
    /** The lead's own facts (outreach_lead_facts, keyed by it): the answer the send door will give about them. */
    facts: {
        lead_stage: string | null;
        suppressed: boolean;
        wrote_back: boolean;
    };
    /** Any email of the chain to them bounced or failed for good (C4): the chain stops. */
    bounced: boolean;
}
/** A step's leads: sent the step before at least `afterDays` ago, not on this step yet (00184 reach_out_followers). */
declare function reachOutFollowers(db: Db$e, p: {
    tenantId: string;
    stepId: string;
    parentId: string;
    afterDays: number;
    limit: number;
}): Promise<FollowerLead[]>;
/** A queued send and what became of its email (00186 reach_out_queued_outcomes). An email row gone is all nulls. */
interface QueuedOutcome {
    send: ReachOutSendRow;
    status: string | null;
    error: unknown;
    /** When it left, as its row was stamped (messages_guard's status_at.sent). */
    sent_at: string | null;
    /** When its email row was written. */
    written_at: string | null;
}
/** Queued sends with their emails, the ones with an outcome to read first (00186). */
declare function queuedOutcomes(db: Db$e, limit: number, tenantId?: string): Promise<QueuedOutcome[]>;
/** Claims older than `before`, oldest first: a writer that died mid-send left them. */
declare function stuckClaims(db: Db$e, before: Date, limit: number, tenantId?: string): Promise<ReachOutSendRow[]>;
/** Planned sends left past `before` in runs that go ahead on running chains (00186 reach_out_stale_sends). */
declare function staleSends(db: Db$e, before: Date, limit: number, tenantId?: string): Promise<ReachOutSendRow[]>;
/** The open sends of canceled or failed runs, with their email's state (00186 reach_out_closed_sends). */
declare function closedRunSends(db: Db$e, stuckBefore: Date, limit: number, tenantId?: string): Promise<Array<{
    send: ReachOutSendRow;
    email_status: string | null;
}>>;
/** Reach-out runs that go ahead with nothing left open (00186 reach_out_finishable). */
declare function finishableRuns(db: Db$e, limit: number, tenantId?: string): Promise<string[]>;
/** Which of these email ids have a row, a hundred at a time (an id list rides in the request's address). */
declare function writtenEmails(db: Db$e, ids: string[]): Promise<Set<string>>;
/** An email the clock withdraws while it is still queued (its run was closed): its job then sends nothing. */
declare function withdrawEmail(db: Db$e, p: {
    tenantId: string;
    id: string;
    reason: string;
}): Promise<boolean>;
/** A verified domain with a send due, and its workspace. */
interface DueDomain {
    id: string;
    tenant_id: string;
}
/**
 * The clean, verified domains with sends due in runs that go ahead on running chains, longest waiting first (00187),
 * past the workspaces and domains the caller is done with this tick. The lists ride in the call's body, not its
 * address, so their length is no URL's.
 */
declare function dueDomains(db: Db$e, at: Date, limit: number, opts?: {
    tenantId?: string;
    skipTenants?: Iterable<string>;
    skipDomains?: Iterable<string>;
}): Promise<DueDomain[]>;
/** The cold emails a workspace wrote this calendar month, in its zone, that left or may still leave (00187). */
declare function monthSent(db: Db$e, tenantId: string, at: Date): Promise<number>;
type MessageInsert = Database["public"]["Tables"]["messages"]["Insert"];
/**
 * A reach-out's email, written queued under its own id (core sendMessageId) before its send leaves `claimed`.
 * "exists" when that id is a row already: a writer that died after writing it, whose email this is.
 */
declare function insertQueuedEmail(db: Db$e, row: MessageInsert): Promise<"written" | "exists">;
/** An email a writer wrote before, as it was frozen: its thread, its person, where it stands, and whom it names. */
interface WrittenEmail {
    conversation_id: string;
    contact_id: string | null;
    status: string;
    to: string | null;
}
declare function writtenEmail(db: Db$e, p: {
    tenantId: string;
    id: string;
}): Promise<WrittenEmail | null>;
/** Whether an outbound_send job was scheduled for this email: a writer that died after scheduling it. */
declare function sendJobScheduled(db: Db$e, p: {
    tenantId: string;
    messageId: string;
}): Promise<boolean>;
/** A send's run and its chain as they stand now: the claim read them, and its writer is seconds behind. */
interface SendStanding {
    run: string | null;
    step: {
        state: string;
        template_id: string;
        after_playbook_id: string | null;
    } | null;
    root: string | null;
    /** The name the chain signs with ({{your name}}): the root's. */
    signedBy: string | null;
}
declare function sendStanding(db: Db$e, s: ReachOutSendRow): Promise<SendStanding>;
/** A step's words as an email template holds them: its HEADER is the subject, its BODY the words. */
declare function emailWordsOf(db: Db$e, tenantId: string, templateId: string): Promise<{
    subject: string | null;
    body: string;
} | null>;
/** A workspace's name and its configuration, as stored: the foot's who, and the profile its where is read from. */
declare function workspaceNameAndConfig(db: Db$e, tenantId: string): Promise<{
    name: string | null;
    config: unknown;
}>;
/** What a lead's words fill a step's slots with. */
declare function leadSlotsOf(db: Db$e, tenantId: string, leadId: string): Promise<{
    business_name: string | null;
    city: string | null;
} | null>;
/** The address a person has on file, as the send door compares a request's recipient with it. */
declare function contactEmailOf(db: Db$e, tenantId: string, contactId: string): Promise<string | null>;
/** A send as it stands now, for a writer whose move found it moved. */
declare function sendNow(db: Db$e, p: {
    tenantId: string;
    id: string;
}): Promise<{
    state: string;
    message_id: string | null;
} | null>;
/** A run whose first email is written: scheduled becomes sending, through its guard's own move. */
declare function runSending(db: Db$e, p: {
    tenantId: string;
    id: string;
}): Promise<void>;
/** The email a step's send answers (D19): the lead's email on the step before, as its receipt stamped it. */
interface ParentEmail {
    messageId: string;
    /** Its Message-ID, stamped by its receipt (00128); null until one arrives. */
    rfcMessageId: string | null;
    /** The chain it carried, oldest first. */
    references: string[];
    subject: string | null;
}
/** The lead's sent email on the step before this one in its chain; null when it has none. */
declare function parentEmailOf(db: Db$e, p: {
    tenantId: string;
    rootId: string;
    leadId: string;
    stepId: string;
}): Promise<ParentEmail | null>;
/**
 * A lead whose address bounced for good (Reach out C11): its address is invalid now, as the finder's own check would
 * say it, so the Leads page shows it and no step or run writes to it again. The address itself already stops at the
 * send door (suppressed). An erased or blanked lead is left as it is. True when the lead was marked.
 */
declare function leadAddressBounced(db: Db$e, p: {
    tenantId: string;
    leadId: string;
    at: string;
    retried?: boolean;
}): Promise<boolean>;
/**
 * A lead written to by a reach-out's email: still being written to (ready becomes nurture; a later stage is kept),
 * first contacted when its first email left, its last outcome "emailed", and its event. Written only as it was read
 * (its version), so a person working the lead at the same moment wins and the next email says so again.
 */
declare function leadWritten(db: Db$e, p: {
    tenantId: string;
    leadId: string;
    at: string;
    sendId: string;
    retried?: boolean;
}): Promise<boolean>;
/** A business's record, as 00197's reach_out_record reads it: what the check writes and reads an opening from. */
interface ReachOutRecordRow {
    business_name: string | null;
    category: string | null;
    city: string | null;
    region: string | null;
    rating: number | null;
    reviews: number | null;
    website_host: string | null;
    hours: unknown;
    about: string | null;
    email: string | null;
    why_it_fits: string | null;
    what_you_asked: string | null;
    site_listings: number;
    name_listings: number;
    email_domain_shared: boolean;
}
/** A send to check (00197 reach_out_unchecked), leased to this tick: the send, its step, its chain and its record. */
interface UncheckedSend {
    send: ReachOutSendRow;
    /** The words' version the send was read at: the check writes only while it is still this (R5). */
    check_gen: number;
    template_id: string;
    template_language: string;
    signed_by: string | null;
    /** The holds its owner included it, or its lead in this chain, past (R7): never held for them again. */
    included_for: string[];
    record: ReachOutRecordRow;
}
/**
 * The sends this tick checks, leased under their row locks (00197): at most `perWorkspace` of each workspace, round
 * robin, waiting for their owner or due within `aheadMinutes`, none another tick started in the last two minutes.
 */
declare function uncheckedSends(db: Db$e, p: {
    limit: number;
    perWorkspace: number;
    aheadMinutes: number;
    tenantId?: string;
}): Promise<UncheckedSend[]>;
/** Whether any send waits to be checked: what the check's clock answers for when it cannot check (R4). */
declare function uncheckedWaiting(db: Db$e, tenantId?: string): Promise<boolean>;
/** One business's record for a search, whether or not a send exists for it yet (the sheet's preview). */
declare function reachOutRecord(db: Db$e, p: {
    tenantId: string;
    searchId: string;
    leadId: string;
}): Promise<ReachOutRecordRow | null>;
/**
 * What the check found, written only onto a send still planned, not yet checked, and at the words' version it was read
 * at (R3, R5): a check never undoes an owner's answer, and never stamps words that changed under it. Its lease ends.
 */
declare function recordCheck(db: Db$e, p: {
    tenantId: string;
    id: string;
    gen: number;
    patch: Partial<ReachOutSendRow>;
}): Promise<boolean>;
/** Holds left past `before`, oldest planned first (00197: fourteen days from when a send was planned, R10). */
declare function heldStale(db: Db$e, before: Date, limit: number, tenantId?: string): Promise<ReachOutSendRow[]>;
/**
 * Holds the check could not answer (check_unavailable, no rule broken) left since `before`: put back to be checked
 * again at their words' next version, in one statement (00197 reach_out_release_unavailable, R4). A hold for a rule an
 * opening broke keeps: it is its owner's to answer. How many went back.
 */
declare function releaseUnavailableHolds(db: Db$e, p: {
    before: Date;
    tenantId?: string;
}): Promise<number>;
/**
 * One attempt of the check's model spend for a workspace's UTC day, taken only while the day is under `cap` (00197
 * reach_out_check_take, R12): true when taken. A reset of a send's check never gives it back.
 */
declare function takeCheckAttempt(db: Db$e, p: {
    tenantId: string;
    cap: number;
    at: Date;
}): Promise<boolean>;
/**
 * Whether a workspace may spend on reach-out now (contracts maySpend): a paused workspace, or one with no billing row,
 * may not. The one reading of it: the step's run (run-context.ts), the check and the dashboard's chains ask it. A read that fails throws:
 * "we could not check" is not "yes".
 */
declare function workspaceMaySpend(db: Db$e, tenantId: string): Promise<boolean>;
/** The workspace's own words about what it does (business_records.about, 00152), for the writer. */
declare function workspaceAbout(db: Db$e, tenantId: string): Promise<string | null>;

/**
 * The reach-out sheet's reads and writes (Reach out, Part 4 PRs 4–5): a workspace's chains as their rows, a chain's
 * root and a send by their ids, the emails' words, a run's sends, a step stamped for its day, the one reset of a
 * send's check (00211 reach_out_recheck) and the outreach mode. The one place these tables are typed for them. The
 * dashboard asks on the session client (RLS decides what a member reads); the edge on the service role. A read that
 * fails throws: "we could not read" is never "none".
 */

type Db$d = SupabaseClient<Database>;
/** A reach-out step as the sheet and its rows read it. */
interface ReachOutStepRow {
    id: string;
    name: string;
    state: string;
    trigger: string;
    lead_search_id: string | null;
    after_playbook_id: string | null;
    after_days: number | null;
    gap_minutes: number | null;
    domain_ids: string[] | null;
    signed_by: string | null;
    include_unconfirmed: boolean | null;
    template_id: string | null;
    run_hour: number;
    last_run_for: string | null;
    created_at: string;
}
/** Every reach-out step of a workspace, each chain's root among them (trigger lead_first). */
declare function reachOutStepsOf(db: Db$d, tenantId: string): Promise<ReachOutStepRow[]>;
/** A chain's root (its first step) by its id; null when there is none, or it is a later step. */
declare function reachOutRootOf(db: Db$d, id: string): Promise<{
    id: string;
    tenant_id: string;
    name: string;
    state: string;
    trigger: string;
    lead_search_id: string | null;
} | null>;
/** One send of a run by its id: whose it is and where it stands; null when there is none. */
declare function reachOutSendRefOf(db: Db$d, id: string): Promise<{
    id: string;
    tenant_id: string;
    broadcast_id: string;
    state: string;
    reason: string | null;
} | null>;
/** An email template's words from its row: HEADER is the subject, BODY the body (the body preview when it has none). */
declare function emailWordsFrom(row: {
    components: unknown;
    body_preview: string | null;
}): {
    subject: string | null;
    body: string;
} | null;
/** Many templates' words at once, by id: what a workspace's chains say. */
declare function emailWordsByTemplate(db: Db$d, tenantId: string, ids: string[]): Promise<Map<string, {
    subject: string | null;
    body: string;
} | null>>;
/** The searches' names, by id. */
declare function searchNamesByIds(db: Db$d, tenantId: string, ids: string[]): Promise<Map<string, string>>;
/** The runs waiting for their owner's approval, as their audiences say them (a reach-out's names its root). */
declare function runsWaitingOf(db: Db$d, tenantId: string): Promise<{
    id: string;
    audience: unknown;
}[]>;
/** A run's sends, each with its lead's name, address and city (a run holds at most a step's cap, 200). */
interface ReachOutRunSend {
    id: string;
    lead_id: string;
    state: string;
    reason: string | null;
    hold_detail: string | null;
    opening: string | null;
    angle: string | null;
    send_at: string | null;
    checked_at: string | null;
    created_at: string;
    domain_id: string | null;
    lead: {
        business_name: string | null;
        email: string | null;
        city: string | null;
    } | null;
}
declare function reachOutRunSendsOf(db: Db$d, tenantId: string, runId: string): Promise<ReachOutRunSend[]>;
/** A step's day: tried now, and, when it ran, the day it ran for (the sweep and Start both stamp it). */
declare function stampReachOutStep(db: Db$d, id: string, p: {
    at: Date;
    runFor?: string;
}): Promise<void>;
/**
 * Sends back to unchecked (R5), in one statement (00211 reach_out_recheck, the one reset): planned, not checked, at
 * their words' next version, so a check still under way for the old words writes nothing; what their owner included
 * them past stays (R7). Only from planned, held or claimed, and only from `fromState` when it is named: the sender
 * names "claimed", so a send another tick has claimed since is never reset. One past its fortnight is given up,
 * kept_waiting, instead (R10). How many went back.
 */
declare function recheckSends(db: Db$d, p: {
    tenantId: string;
    ids: string[];
    fromState?: "planned" | "held" | "claimed";
}): Promise<number>;
type OutreachMode = "ask" | "veto" | "never";
/**
 * Settings › Autonomy's outreach row (00183), the one reading of it: a workspace's own row, its mode as said; none, or
 * a mode it does not know, reads as ask, so a missing row can only wait for its owner. The step's run and the
 * dashboard's chains both ask it. A read that fails throws.
 */
declare function outreachModeOf(db: Db$d, tenantId: string): Promise<OutreachMode>;
/** A workspace's zone; null when it could not be read (the caller says which zone it falls back to). */
declare function tenantZoneOf(db: Db$d, tenantId: string): Promise<string | null>;
/** A run's held-notice mark, kept in its audience (Reach out, Part 4 PR 7, R20): claimed by a tick, then sent. */
interface HeldNoticeMark {
    claimed_at: string;
    sent_at?: string;
}
type JsonObject = {
    [key: string]: Json | undefined;
};
/** A live reach-out run with holds whose owner has not been told of them yet, as the check's notice reads it. */
interface HeldNoticeRun {
    id: string;
    tenant_id: string;
    name: string;
    audience: JsonObject;
    updated_at: string;
    held: number;
    reasons: string[];
}
/**
 * The live reach-out runs (scheduled or sending) holding sends held since `since` whose owner was not told yet: no
 * mark, or a claim older than `staleBefore` that never went (a tick that stopped, or a notice that failed). A read,
 * not a tick's memory, so a notice that failed is asked again. A read that fails throws.
 */
declare function heldNoticeDue(db: Db$d, p: {
    since: string;
    staleBefore: string;
    tenantId?: string;
    limit: number;
}): Promise<HeldNoticeRun[]>;
/**
 * A run's held-notice mark written into its audience. With `ifUpdatedAt`, only onto the row as it was read (its
 * updated_at, which moddatetime moves on every write): of two ticks that read one run, one claims it and the other finds
 * it moved. Nothing else writes a run's audience after it is planned, so the mark after a claim is written plainly.
 * True when the row took it.
 */
declare function markHeldNotice(db: Db$d, p: {
    tenantId: string;
    id: string;
    audience: JsonObject;
    mark: HeldNoticeMark;
    ifUpdatedAt?: string;
}): Promise<boolean>;

/**
 * What a person is told, as the edge reads and writes it: a kept notification taken back (apps/edge/lib/ops/notify.ts),
 * and the phones a call in progress is shown on (apps/edge/lib/voice/call-activity.ts). A read or write that fails
 * throws.
 */

type Db$c = SupabaseClient<Database>;
/**
 * The one place a bell's row is taken back: a notice told exactly once (notifyOnce) whose mail failed takes its row
 * back, so asking again leaves no twin on the bell.
 */
declare function forgetNotification(db: Db$c, p: {
    tenantId: string;
    id: string;
}): Promise<void>;
/**
 * The push-to-start tokens of the phones whose people hold one of `roles` in the workspace (00191), each once. Throws
 * when the people or their phones cannot be read.
 */
declare function activityTokensOf(db: Db$c, tenantId: string, roles: readonly string[]): Promise<string[]>;
/** Forget activity tokens Apple says are gone (410), so no later call tries them again. */
declare function forgetActivityTokens(db: Db$c, tokens: readonly string[]): Promise<void>;

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

type Db$b = SupabaseClient<Database>;
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
declare function ingestCall(db: Db$b, tenantId: string, n: NormalizedCallInput, raw?: unknown): Promise<IngestCallResult>;
/**
 * Attach the thread note (call_summary message) back to its call row.
 *
 * Row-counted, like every other conditional write here: an UPDATE that RLS
 * excludes or that names a row which is gone reports success and changes
 * nothing, so "the write failed" and "the write did not happen" have to be
 * told apart by counting rows rather than by trusting the absence of an error.
 */
declare function linkCallMessage(db: Db$b, tenantId: string, callId: string, messageId: string): Promise<void>;
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
declare function setCallRecording(db: Db$b, tenantId: string, callId: string, recording: Record<string, unknown>): Promise<void>;
/** The customer's thread gets the call as a message, so history stays in one place. */
declare function recordCallNote(db: Db$b, p: {
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
declare function claimCallNotification(db: Db$b, tenantId: string, callId: string): Promise<boolean>;
/**
 * Claim the one start of a call's Live Activity on the workspace's phones (00218). True for the first delivery of its
 * call_started; false once claimed, so a redelivered one starts nothing twice. Throws on a database error.
 */
declare function claimCallActivity(db: Db$b, tenantId: string, callId: string): Promise<boolean>;
/** The caller's name as the Live page gives it (their display name, else their WhatsApp name), or null. */
declare function callerNameOf(db: Db$b, tenantId: string, contactId: string): Promise<string | null>;

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

type Db$a = SupabaseClient<Database>;
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
declare function readThreadState(db: Db$a, tenantId: string, conversationId: string, pausedUntilIso: string | null, historyLimit?: number): Promise<PgThreadState>;
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
    /** Whether an email address is on file for them: the receptionist asks for one only when there is none (the booking rule ask_email). Undefined for a reader that never learned it, which says nothing. */
    hasEmail?: boolean;
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
declare function readLeadContext(db: Db$a, tenantId: string, phoneE164: string, historyLimit?: number): Promise<LeadContext>;
/**
 * The deal facts for a caller known by their number, or null: what the availability door needs and nothing more (0004).
 * None where deals are off (dealsAreOn, 0008): the workspace's answer rides on the contact read, and a database that
 * cannot say it has deals off. Every deal of theirs is read, because the current one may be the oldest (see
 * readLeadContext).
 */
declare function readDealForPhone(db: Db$a, tenantId: string, phoneE164: string): Promise<DealFacts | null>;
/**
 * The team's notes as the receptionist hears them (0007): newest first, each dated, as many as fit the budget -- the
 * newest always, however long. Where the notes could not be read, the field they moved from (00054), as it was said.
 */
declare function notesForReceptionist(lead: LeadContext, now?: Date, tz?: string): string | null;
declare function describeLead(lead: LeadContext, now?: Date, tz?: string): string;

/**
 * A reply's idempotency key (0004): the receipt kept under the caller's key,
 * so a replayed POST is answered with the first send instead of a second one.
 *
 * The key is a row the reply CLAIMS before it writes anything else, on the
 * table's unique (tenant_id, key). Two callers under one key at once used to
 * both read "no receipt yet" and both send; now the insert is the race, and
 * Postgres picks the one winner. The winner completes its row with the
 * receipt (`keepIdempotencyReceipt`), written only onto the row that still
 * carries its stamp. A loser is shown what the holder left, and core's reply
 * decides what that means: a replay, a refusal, or a hold to take over
 * (`takeIdempotencyKey`, by the stamp it was read at, so of two callers who
 * both read an abandoned hold exactly one takes it, and the caller taken over
 * finds its stamp gone when it comes to keep its receipt). A claim whose
 * reply failed before its job is let go (`releaseIdempotencyKey`), by its own
 * stamp, so a retry is not told its reply is in progress.
 *
 * The stamp is `created_at`, written by the claim and the takeover in the
 * verb's own ISO spelling and compared in Postgres, so the spelling PostgREST
 * reads it back in matches it too (idempotency-claim.db.test.mjs proves both).
 */

type Db$9 = SupabaseClient<Database>;
/** What the key's holder left: a receipt once kept, and nothing while its reply is still on its way. */
interface IdempotencyHold {
    response: Json | null;
    created_at: string;
    request_hash: string | null;
}
type IdempotencyClaim = {
    won: true;
} | {
    won: false;
    held: IdempotencyHold | null;
};
/**
 * The key claimed: won when this caller's row is the one on the unique, else
 * the hold that is there. `held` is null when the row went between the claim
 * and the read (its holder let it go), which the caller treats as in progress.
 */
declare function claimIdempotencyKey(db: Db$9, p: {
    tenantId: string;
    key: string;
    route: string;
    requestHash: string;
    nowIso: string;
}): Promise<IdempotencyClaim>;
/**
 * A hold taken over, written only onto the row as it was read (`from` is the
 * stamp the reader saw): true iff this caller holds the key now. Another
 * caller who read the same hold and took it first moved the stamp, and this
 * one changes nothing and is told so.
 */
declare function takeIdempotencyKey(db: Db$9, p: {
    tenantId: string;
    key: string;
    requestHash: string;
    nowIso: string;
    from: string;
}): Promise<boolean>;
/**
 * The row stamped `nowIso` let go, whatever it holds, and only that one: a
 * caller lets go only when its send did not happen, and another caller's
 * takeover moved the stamp, so this never removes anyone else's row.
 */
declare function releaseIdempotencyKey(db: Db$9, p: {
    tenantId: string;
    key: string;
    nowIso: string;
}): Promise<void>;
/**
 * The receipt kept under the key, completing its claim, written only onto the
 * row that still carries the claim's stamp: true iff it does. False is a key
 * another caller took over since (the hold outlived HOLD_EXPIRY_MS), and the
 * caller must not go on to send. The stamp stays, so the replay window runs
 * from the claim, which is this send.
 */
declare function keepIdempotencyReceipt(db: Db$9, p: {
    tenantId: string;
    key: string;
    requestHash: string;
    response: Json;
    stamp: string;
}): Promise<boolean>;

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

type Db$8 = SupabaseClient<Database>;
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
declare function claimControl(db: Db$8, p: {
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
declare function releaseControl(db: Db$8, p: {
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

type Db$7 = SupabaseClient<Database>;
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
declare function templatesFor(db: Db$7, tenantId: string, channel?: string): Promise<TemplateRow[]>;

/**
 * Control-plane repository (Session A): config, policies, team.
 * Same shape as ingest/calls/thread — thin, typed, no business rules here;
 * enforcement lives in RLS + the DB triggers + requireRole at the routes.
 */

type Db$6 = SupabaseClient<Database>;
interface TenantConfigRow {
    tenant_id: string;
    config: unknown;
    version: number;
    updated_at: string;
    /** Who last wrote it; null for rows written before 00085 kept track, and for the platform's own writes. */
    updated_by?: string | null;
}
declare function getTenantConfig(db: Db$6, tenantId: string): Promise<TenantConfigRow | null>;
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
declare function putTenantConfig(db: Db$6, tenantId: string, config: unknown, expectedVersion: number, 
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
declare function listPolicies(db: Db$6, tenantId: string): Promise<PolicyRecord[]>;
declare function setPolicyMode(db: Db$6, tenantId: string, policyClass: string, mode: string, 
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
declare function personReplyMode(db: Db$6, tenantId: string, contactId: string): Promise<string | null>;
/**
 * Set or clear one person's receptionist mode. `null` removes the row, so the
 * person follows the workspace policy again. Insert and delete are owner-only
 * under RLS (00029); a forbidden insert raises, and the route decides the
 * role before getting here.
 */
declare function setPersonReplyMode(db: Db$6, tenantId: string, contactId: string, mode: string | null): Promise<void>;

/**
 * Everyone in People, as `people_list` (00112) computes them under the caller's row security.
 *
 * One pager for the dashboard's lists, counts and exports and the edge's playbook sweep: each had its own loop over
 * the same function, with its own page size and its own rule for when to name the page arguments.
 */

type Db$5 = SupabaseClient<Database>;
/** Rows per page: what people_list answers at most (the database clamps p_limit to it). */
declare const PEOPLE_PAGE = 1000;
/**
 * One page of people. The page arguments are named only when they leave their defaults, so a database that has not
 * been given 00112 answers the first page as it always has. A read that fails THROWS: a page the database could not
 * answer is never an empty workspace.
 */
declare function peoplePage(db: Db$5, tenantId: string, page?: {
    q?: string | null;
    offset?: number;
    limit?: number;
}): Promise<PersonRowDto[]>;
/**
 * Everyone, every page of them: whatever counts people counts everyone. One call is at most a thousand rows, and a
 * caller that does not loop gets a thousand with no error, no flag and no way to tell them from "that is everyone".
 */
declare function everyoneIn(db: Db$5, tenantId: string): Promise<PersonRowDto[]>;

/**
 * Saved lists: a name and the people on it (00044's segments and segment_members), read and written here and
 * nowhere else.
 *
 * The routes, the send, the assistant and the verbs each read these tables themselves, and each read of the members
 * was one select, which PostgREST answers with at most 1000 rows: past a thousand memberships a list silently lost
 * people. Every member read here is paged. A write answers the database's error as it came, code and all, so the
 * route that called it can say the refusal in its own words.
 */

type Db$4 = SupabaseClient<Database>;
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
declare function savedListsFor(db: Db$4, tenantId: string): Promise<SavedListRow[]>;
/** Every id on one list. */
declare function listMemberIds(db: Db$4, listId: string): Promise<string[]>;
/** One saved list of this workspace with every id on it, or null when it has no such list: what a send to it enrols. */
declare function savedListFor(db: Db$4, tenantId: string, id: string): Promise<SavedListRow | null>;
/** The list a verb acts on, read under row security alone: one the caller cannot see is no list. */
declare function listRow(db: Db$4, id: string): Promise<ListRow | null>;
/**
 * A new list in the maker's name: empty and kept by hand, or smart with its rule. A name the workspace already has is
 * the database's 23505.
 */
declare function createList(db: Db$4, tenantId: string, name: string, userId: string, rule?: Json | null): Promise<{
    list: {
        id: string;
        name: string;
    } | null;
    error: WriteError | null;
}>;
/** A list's new name: one of the two columns a member may change (00155's column grant). */
declare function renameList(db: Db$4, id: string, name: string): Promise<{
    error: WriteError | null;
}>;
/** A smart list's new rule: the other column a member may change. */
declare function setListRule(db: Db$4, id: string, rule: Json): Promise<{
    error: WriteError | null;
}>;
/**
 * People onto a list, in the adder's name. Someone already on it is not an error; a person of another workspace or
 * one who was erased is row security's with-check refusal (42501).
 */
declare function addToList(db: Db$4, list: Pick<ListRow, "id" | "tenant_id">, contactIds: readonly string[], userId: string): Promise<{
    error: WriteError | null;
}>;
/** People off a list. The people stay; only the membership goes. */
declare function dropFromList(db: Db$4, listId: string, contactIds: readonly string[]): Promise<{
    error: WriteError | null;
}>;
/**
 * A list archived (a moment) or restored (null): the column a member may change (00169's grant). A restore under a name
 * a live list now has is the database's 23505.
 */
declare function archiveList(db: Db$4, id: string, at: Date | null, 
/** A new name to come back under, in the same write: a restore and its rename land together or not at all. */
name?: string): Promise<{
    error: WriteError | null;
    count: number;
}>;
/** The playbooks that name a list: what archiving it pauses. */
declare function playbooksOnList(db: Db$4, tenantId: string, listId: string): Promise<{
    id: string;
    name: string;
    state: string;
}[]>;
/** A list and its member rows. `count` says whether anything was removed: a delete that removed nothing is no delete. */
declare function deleteList(db: Db$4, id: string): Promise<{
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

type Db$3 = SupabaseClient<Database>;
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
declare function touchesSince(db: Db$3, tenantId: string, since: Date, now: Date): Promise<Touch[]>;
/**
 * The proposal follow-ups' touches alone since `since` (0006): the runs whose values carry a proposal's link, from
 * any playbook, one since deleted too. The window a follow-up needs is as long as a proposal waits, far longer than
 * the week's breath, so it is read for that one kind of run.
 */
declare function followUpTouchesSince(db: Db$3, tenantId: string, since: Date, now: Date): Promise<Touch[]>;
/** The touches by person, the way a run draws with them: the latest by any run, by each playbook, and follow-up. */
declare function touchIndex(touches: readonly Touch[]): TouchIndex;

/**
 * The deals a workspace's pace is read from (0008, amended): its yeses decided since a moment -- a deal standing won,
 * or ended since -- with their two days, for contracts dealPaceFrom. The edge's playbook sweep (the proposal
 * follow-up, 0006) and the dashboard's People reads read them alike, so the two never judge "waiting" by two paces.
 * Paged, so a busy year is read whole. A read that fails THROWS: each caller says what no pace costs it.
 */

type Db$2 = SupabaseClient<Database>;
/** A yes as its wait is measured: its stage and its two days. */
interface YesRow {
    stage: string;
    proposed_at: string;
    decided_at: string | null;
}
/** Every yes decided since `since`, under whatever row security the client carries. */
declare function yesesSince(db: Db$2, tenantId: string, since: Date): Promise<YesRow[]>;

/**
 * Partners (decision 0012): the one place the two tables are typed. Reads run on the session client, so RLS
 * decides what comes back: a partner sees their own row and the workspaces they brought; an owner sees who
 * brought theirs. The writes are functions (partner_become, create_workspace) and the service role's.
 */

type Db$1 = SupabaseClient<Database>;
type PartnerRow = Database["public"]["Tables"]["partners"]["Row"];
type PartnerTenantRow = Database["public"]["Tables"]["partner_tenants"]["Row"];
type PartnerPublicRow = Pick<PartnerRow, "id" | "code" | "status" | "share_bp" | "terms_accepted_at" | "created_at">;
/**
 * The caller's own partner row, or null: none, or a database 00202 has not reached, which reads as none so the app
 * boots whichever deploys first. Any other failure is thrown.
 */
declare function getOwnPartner(db: Db$1): Promise<PartnerPublicRow | null>;
/**
 * How many workspaces the caller brought (their partner_tenants rows, which partner_tenants_partner_select lets them
 * read): through their link, or set up and accepted by an owner (0016); one still waiting for its owner is not
 * brought yet. The same count whether or not they still sit on each team. On a database 00214 has not reached every
 * row is a link's. Null when it cannot be read.
 */
declare function getPartnerBroughtCount(db: Db$1, partnerId: string): Promise<number | null>;
/** One line of the caller's balance: a currency's total in one state, and when the next held one is due. */
interface PartnerBalanceLine {
    currency: string;
    state: string;
    earned_cents: number;
    next_payable_at: string | null;
}
/**
 * The caller's own totals (00203 partner_balance): held, payable and paid, by currency. Empty on a database 00203
 * has not reached, which reads as nothing earned yet, which is true.
 */
declare function getPartnerBalance(db: Db$1): Promise<PartnerBalanceLine[]>;
/**
 * Whether the caller's daily letter is on (00209 partners.letters): read apart from the row, so a database 00209 has
 * not reached still answers the row, and the letter reads as null (the pane shows no switch).
 */
declare function getPartnerLetters(db: Db$1): Promise<boolean | null>;
/** The caller turns their daily letter on or off (00209 partner_letters_set); the function's own words on a refusal. */
declare function setPartnerLetters(db: Db$1, on: boolean): Promise<{
    ok: true;
    letters: boolean;
} | {
    ok: false;
    code: string;
    message: string;
}>;
/** The caller becomes a partner with this code: the function's own words come back as the error's message. */
declare function becomePartner(db: Db$1, code: string): Promise<{
    ok: true;
    row: PartnerPublicRow;
} | {
    ok: false;
    code: string;
    message: string;
}>;
type PartnerOverviewRow = Database["public"]["Functions"]["partner_overview"]["Returns"][number];
type PartnerWorkspaceMoneyLine = Database["public"]["Functions"]["partner_workspace_money"]["Returns"][number];
/**
 * The back office's row for each workspace the caller brought and still sits on the team of (00204
 * partner_overview), and what each they ever brought earned them (partner_workspace_money). Both answer about the
 * caller alone; both read as none on a database 00204 has not reached.
 */
declare function getPartnerWorkspaces(db: Db$1): Promise<{
    overview: PartnerOverviewRow[];
    money: PartnerWorkspaceMoneyLine[];
}>;
type PlatformPartnerBalanceLine = Database["public"]["Functions"]["platform_partner_balances"]["Returns"][number];
type PlatformPartnerWorkspaceLine = Database["public"]["Functions"]["platform_partner_workspaces"]["Returns"][number];
/** An answer from one of the platform's partner verbs: the value, or the function's own code and words. */
type PartnerVerbResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    code: string;
    message: string;
};
/**
 * Every partner and every workspace one brought (00205), for the back office. Both functions check the caller is a
 * platform admin themselves, so this is called on the session client, never the service role. A database 00205 has
 * not reached reads as no partners.
 */
declare function getPlatformPartners(db: Db$1): Promise<{
    balances: PlatformPartnerBalanceLine[];
    workspaces: PlatformPartnerWorkspaceLine[];
}>;
/** A platform admin decides a brought workspace's standing (00205 partner_standing_set). */
declare function setPartnerStanding(db: Db$1, tenantId: string, standing: string, why: string): Promise<PartnerVerbResult<{
    standing: string;
    from: string | null;
    voided: number;
    matured: number;
}>>;
/** What partner_payout_mark answers: paid, or not and why (changed: what is payable moved since it was read). */
type PartnerPayoutAnswer = {
    paid: boolean;
    changed?: boolean;
    total_cents: number;
    currency: string;
    earnings?: number;
    payout_id?: string;
};
/**
 * A platform admin records a payout sent by hand (00205, 00207 partner_payout_mark). `expectedCents` is what the
 * person saw and sent; the function records nothing when what is payable is no longer that.
 */
declare function markPartnerPaid(db: Db$1, partnerId: string, currency: string, reference: string, expectedCents?: number): Promise<PartnerVerbResult<PartnerPayoutAnswer>>;
/** A platform admin pauses, closes or restores a partner (00206 partner_status_set). */
declare function setPartnerStatus(db: Db$1, partnerId: string, status: string, why: string): Promise<PartnerVerbResult<{
    status: string;
    from: string;
    seats: number;
}>>;
/**
 * A platform admin records the reset of a partner's second factor (00215 partner_second_factor_reset, decision 0013)
 * and learns whose account to act on; the factor itself is removed in Supabase Auth by the caller.
 */
declare function recordPartnerSecondFactorReset(db: Db$1, partnerId: string, why: string): Promise<PartnerVerbResult<string>>;
/** An answer from a handover verb: the value, or the function's own code and words. */
type HandoverResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    code: string;
    message: string;
};
/** A workspace as a handover verb answers it. */
interface HandoverWorkspace {
    id: string;
    slug: string;
    name: string;
}
/**
 * The calling partner makes a workspace for a business and hands it to `ownerEmail` (00214
 * create_workspace_for_business): seated as partner, credited now, open fourteen days.
 */
declare function createWorkspaceForBusiness(db: Db$1, input: {
    name: string;
    timezone: string | null;
    ownerEmail: string;
}): Promise<HandoverResult<HandoverWorkspace>>;
/** Where a handover stands after it was sent again. */
interface HandoverSent {
    email: string;
    sentAt: string;
    expiresAt: string;
}
/** The calling partner sends a handover again, to the same address or another (00214 partner_handover_resend). */
declare function resendHandover(db: Db$1, tenantId: string, email: string): Promise<HandoverResult<HandoverSent>>;
/** A handover waiting for the caller: which workspace, from which partner, open until when. */
interface OpenHandover {
    tenantId: string;
    workspace: string;
    partnerCode: string;
    expiresAt: string;
}
/**
 * The open handovers addressed to the caller's confirmed email (00214 handovers_mine). None on a database 00214 has
 * not reached, which is true there: nothing can have been handed over. Any other failure reads as none too, and is
 * logged by the caller: the boot this rides on must not fail for it.
 */
declare function getOpenHandovers(db: Db$1): Promise<{
    handovers: OpenHandover[];
    error: string | null;
}>;
/** The caller becomes the owner of the workspace handed to them (00214 handover_accept). */
declare function acceptHandover(db: Db$1, tenantId: string): Promise<HandoverResult<HandoverWorkspace>>;
/** The caller says no to the workspace handed to them (00214 handover_decline). */
declare function declineHandover(db: Db$1, tenantId: string): Promise<HandoverResult<null>>;
/** A workspace the caller set up for a business, and where its handover stands. */
interface PartnerHandoverLine {
    tenantId: string;
    /** Null once the partner can no longer read the workspace (they left its team). */
    name: string | null;
    email: string;
    sentAt: string;
    expiresAt: string;
    acceptedAt: string | null;
    declinedAt: string | null;
}
/**
 * The handovers of the workspaces the caller set up (partner_tenants, which partner_tenants_partner_select lets them
 * read). None on a database 00214 has not reached, where the columns do not exist yet.
 */
declare function getPartnerHandovers(db: Db$1): Promise<PartnerHandoverLine[]>;
/** What the edge needs to write a handover's invitation: to whom, which workspace, from which partner, until when. */
interface HandoverInvite {
    email: string;
    workspace: string;
    partnerCode: string;
    expiresAt: string;
}
/**
 * An open handover's invitation facts, for the edge (service role): the address is the one on record, never one a
 * caller passes, so the door that sends it can write to nobody else. Null when the workspace has no open handover.
 */
declare function getHandoverInvite(db: Db$1, tenantId: string): Promise<HandoverInvite | null>;

/**
 * One lead as the Leads page would show it (Reach out Part 4, PR 9): what GET leads/[id] reads for the peek of a lead
 * on no page the tab has loaded. The lead in the workspace named, the membership the page would show (00212's
 * lead_member_of, over lead_member_shown, the one rule leads_page asks) and how many places it was found at. Reads
 * run on the session client, so RLS decides what comes back; the page's rows are leads_page's, read by the dashboard.
 */

type Db = SupabaseClient<Database>;
type LeadsRow = Database["public"]["Tables"]["leads"]["Row"];
type LeadOneLead = Omit<LeadsRow, "country" | "logo_url">;
/** The membership lead_member_of answers, the columns leads_page answers of it. */
interface LeadOneMember {
    id: string;
    search_id: string;
    class: string;
    excluded_by: string | null;
    fit: string | null;
    reason: string;
    distance_m: number | null;
    counted: boolean;
    judgment: Json;
}
/**
 * One lead of the workspace named, with the membership the page would show (in `searchId` when it names one, else
 * the newest) and its places counted; null when the lead is not the workspace's, is erased or blanked, or has no
 * membership the page would show.
 */
declare function readLeadOne(db: Db, tenantId: string, leadId: string, searchId?: string): Promise<{
    lead: LeadOneLead;
    member: LeadOneMember;
    places: number;
} | null>;

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

export { type AudienceLead, CALL_CONTROL_S, type ChannelLookup, type ColdReceiptsOwed, type ControlHolder, type ControlOutcome, DEFAULT_ROW_CAP, type Database, type DomainCapacity, type DueDomain, type FollowerLead, HISTORY_COLUMNS, type HandoverInvite, type HandoverResult, type HandoverSent, type HandoverWorkspace, type HeldNoticeMark, type HeldNoticeRun, type IdempotencyClaim, type IdempotencyHold, type InboundEmailFacts, type IngestCallResult, type IngestEmailParams, type IngestInboundParams, type IngestResult, type Json, type LeadContext, type LeadOneLead, type LeadOneMember, type ListRow, MAX_ROWS, type MailboxRow, type MessageInsert, type NormalizedCallInput, type OpenHandover, type OutboundTarget, type OutreachFactsRow, type OutreachMode, PEOPLE_PAGE, type Page, type ParentEmail, type PartnerBalanceLine, type PartnerHandoverLine, type PartnerOverviewRow, type PartnerPayoutAnswer, type PartnerPublicRow, type PartnerRow, type PartnerTenantRow, type PartnerVerbResult, type PartnerWorkspaceMoneyLine, type PersonForSend, type PgThreadState, type PlatformPartnerBalanceLine, type PlatformPartnerWorkspaceLine, type PolicyRecord, type PutTenantConfigResult, type QueuedOutcome, type ReachOutRecordRow, type ReachOutRunSend, type ReachOutSendInsert, type ReachOutSendRow, type ReachOutStepRow, type RoutedChannel, type SavedListRow, type SendStanding, type SendingDomainHolder, type SendingDomainRow, type ServiceClientConfig, type SubscribeOptions, type TemplateRow, type TenantConfigRow, type ThreadTurn, type Touch, type TouchIndex, type UncheckedSend, type WriteError, type WrittenEmail, type YesRow, acceptHandover, activityTokensOf, addToList, applyDomainCheck, archiveList, assembleHistory, becomePartner, callerNameOf, claimCallActivity, claimCallNotification, claimControl, claimIdempotencyKey, claimSends, closedRunSends, coldReceiptsOwed, contactEmailOf, countSendingDomains, countSentToday, createList, createServiceClient, createWorkspaceForBusiness, declineHandover, deleteList, deleteSendingDomain, deleteSendingDomainAsRead, describeLead, domainCapacityOf, domainHeldSince, dropFromList, dueDomains, dueSendingDomains, emailWordsByTemplate, emailWordsFrom, emailWordsOf, emitEvent, everyoneIn, finishableRuns, followUpTouchesSince, forgetActivityTokens, forgetNotification, getHandoverInvite, getOpenHandovers, getOwnPartner, getPartnerBalance, getPartnerBroughtCount, getPartnerHandovers, getPartnerLetters, getPartnerWorkspaces, getPlatformPartners, getTenantConfig, heldNoticeDue, heldStale, ingestCall, ingestInbound, ingestInboundEmail, insertQueuedEmail, keepIdempotencyReceipt, lastInboundEmail, leadAddressBounced, leadSlotsOf, leadWritten, linkCallMessage, listMemberIds, listPolicies, listRow, mailboxById, mailboxFor, mailboxOfTenant, markHeldNotice, markPartnerPaid, markProcessed, monthSent, moveSend, notesForReceptionist, outreachFactsOf, outreachModeOf, parentEmailOf, pauseConversation, peoplePage, personReplyMode, platformHoldStands, playbooksOnList, putTenantConfig, queuedOutcomes, reachOutAudience, reachOutFollowers, reachOutPerson, reachOutRecord, reachOutRootOf, reachOutRunSendsOf, reachOutSendRefOf, reachOutStepsOf, readAllRows, readDealForPhone, readLeadContext, readLeadOne, readThreadState, recheckSends, recordCallNote, recordCarrierOptOut, recordCheck, recordEchoAndPause, recordEmailNo, recordEmailStatus, recordOutbound, recordPartnerSecondFactorReset, recordProviderDomain, recordStatusByExternalId, releaseControl, releaseIdempotencyKey, releaseUnavailableHolds, renameList, reputationHoldsSince, resendHandover, reserveSendingDomain, resolveChannel, resolveChannelDetailed, resolveOutboundTarget, runSending, runsWaitingOf, savedListFor, savedListsFor, searchNamesByIds, sendJobScheduled, sendNow, sendStanding, sendingDomainByHost, sendingDomainCounts, sendingDomainOf, sendingDomainsOf, sentEmailOf, sentEmailRequestOf, sentEmailWithMessageId, setCallRecording, setListRule, setPartnerLetters, setPartnerStanding, setPartnerStatus, setPersonReplyMode, setPolicyMode, staleSends, stampEmailComplaint, stampEmailSent, stampMailboxReceived, stampReachOutStep, stuckClaims, subscribeMessagesInserts, suppressEmailOf, takeCheckAttempt, takeIdempotencyKey, templatesFor, tenantZoneOf, touchIndex, touchSendingDomain, touchesSince, uncheckedSends, uncheckedWaiting, watchedTables, withdrawEmail, workspaceAbout, workspaceMaySpend, workspaceNameAndConfig, writtenEmail, writtenEmails, yesesSince };
