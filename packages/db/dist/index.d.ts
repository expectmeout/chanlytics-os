import { SupabaseClient } from '@supabase/supabase-js';

type Json = string | number | boolean | null | {
    [key: string]: Json | undefined;
} | Json[];
type Database = {
    __InternalSupabase: {
        PostgrestVersion: "14.5";
    };
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
            broadcast_recipients: {
                Row: {
                    broadcast_id: string;
                    contact_id: string;
                    message_id: string | null;
                    reason: string | null;
                    sent_at: string | null;
                    state: string;
                    tenant_id: string;
                };
                Insert: {
                    broadcast_id: string;
                    contact_id: string;
                    message_id?: string | null;
                    reason?: string | null;
                    sent_at?: string | null;
                    state?: string;
                    tenant_id: string;
                };
                Update: {
                    broadcast_id?: string;
                    contact_id?: string;
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
            calls: {
                Row: {
                    agent_id: string | null;
                    call_successful: boolean | null;
                    call_type: string | null;
                    channel_id: string | null;
                    contact_id: string | null;
                    conversation_id: string | null;
                    cost: Json | null;
                    created_at: string;
                    direction: string;
                    disconnection_reason: string | null;
                    duration_ms: number | null;
                    ended_at: string | null;
                    from_e164: string | null;
                    from_raw: string | null;
                    id: string;
                    in_voicemail: boolean | null;
                    latency: Json | null;
                    message_id: string | null;
                    notified_at: string | null;
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
                };
                Insert: {
                    agent_id?: string | null;
                    call_successful?: boolean | null;
                    call_type?: string | null;
                    channel_id?: string | null;
                    contact_id?: string | null;
                    conversation_id?: string | null;
                    cost?: Json | null;
                    created_at?: string;
                    direction?: string;
                    disconnection_reason?: string | null;
                    duration_ms?: number | null;
                    ended_at?: string | null;
                    from_e164?: string | null;
                    from_raw?: string | null;
                    id?: string;
                    in_voicemail?: boolean | null;
                    latency?: Json | null;
                    message_id?: string | null;
                    notified_at?: string | null;
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
                };
                Update: {
                    agent_id?: string | null;
                    call_successful?: boolean | null;
                    call_type?: string | null;
                    channel_id?: string | null;
                    contact_id?: string | null;
                    conversation_id?: string | null;
                    cost?: Json | null;
                    created_at?: string;
                    direction?: string;
                    disconnection_reason?: string | null;
                    duration_ms?: number | null;
                    ended_at?: string | null;
                    from_e164?: string | null;
                    from_raw?: string | null;
                    id?: string;
                    in_voicemail?: boolean | null;
                    latency?: Json | null;
                    message_id?: string | null;
                    notified_at?: string | null;
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
                    erased_at: string | null;
                    first_seen_at: string;
                    id: string;
                    last_seen_at: string;
                    merged_into_contact_id: string | null;
                    notes: string | null;
                    phone_e164: string | null;
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
                    erased_at?: string | null;
                    first_seen_at?: string;
                    id?: string;
                    last_seen_at?: string;
                    merged_into_contact_id?: string | null;
                    notes?: string | null;
                    phone_e164?: string | null;
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
                    erased_at?: string | null;
                    first_seen_at?: string;
                    id?: string;
                    last_seen_at?: string;
                    merged_into_contact_id?: string | null;
                    notes?: string | null;
                    phone_e164?: string | null;
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
                    created_at: string;
                    id: string;
                    last_inbound_at: string | null;
                    last_message_at: string | null;
                    last_wa_inbound_at: string | null;
                    paused_until: string | null;
                    snooze_until: string | null;
                    state: string;
                    tenant_id: string;
                    updated_at: string;
                };
                Insert: {
                    assignee_user_id?: string | null;
                    contact_id: string;
                    created_at?: string;
                    id?: string;
                    last_inbound_at?: string | null;
                    last_message_at?: string | null;
                    last_wa_inbound_at?: string | null;
                    paused_until?: string | null;
                    snooze_until?: string | null;
                    state?: string;
                    tenant_id: string;
                    updated_at?: string;
                };
                Update: {
                    assignee_user_id?: string | null;
                    contact_id?: string;
                    created_at?: string;
                    id?: string;
                    last_inbound_at?: string | null;
                    last_message_at?: string | null;
                    last_wa_inbound_at?: string | null;
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
            events_y2026m08: {
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
                    cancel_token: string;
                    created_at: string;
                    due_at: string;
                    fired_at: string | null;
                    id: string;
                    kind: string;
                    last_error: string | null;
                    payload: Json;
                    qstash_id: string | null;
                    state: string;
                    tenant_id: string;
                    updated_at: string;
                };
                Insert: {
                    attempts?: number;
                    cancel_token?: string;
                    created_at?: string;
                    due_at: string;
                    fired_at?: string | null;
                    id?: string;
                    kind: string;
                    last_error?: string | null;
                    payload?: Json;
                    qstash_id?: string | null;
                    state?: string;
                    tenant_id: string;
                    updated_at?: string;
                };
                Update: {
                    attempts?: number;
                    cancel_token?: string;
                    created_at?: string;
                    due_at?: string;
                    fired_at?: string | null;
                    id?: string;
                    kind?: string;
                    last_error?: string | null;
                    payload?: Json;
                    qstash_id?: string | null;
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
            memberships: {
                Row: {
                    created_at: string;
                    id: string;
                    role: string;
                    tenant_id: string;
                    user_id: string;
                };
                Insert: {
                    created_at?: string;
                    id?: string;
                    role?: string;
                    tenant_id: string;
                    user_id: string;
                };
                Update: {
                    created_at?: string;
                    id?: string;
                    role?: string;
                    tenant_id?: string;
                    user_id?: string;
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
                    created_at: string;
                    created_by: string | null;
                    id: string;
                    name: string;
                    tenant_id: string;
                    updated_at: string;
                };
                Insert: {
                    created_at?: string;
                    created_by?: string | null;
                    id?: string;
                    name: string;
                    tenant_id: string;
                    updated_at?: string;
                };
                Update: {
                    created_at?: string;
                    created_by?: string | null;
                    id?: string;
                    name?: string;
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
                    note: string | null;
                    request_id: number | null;
                    requested_at: string | null;
                    sweep: string;
                };
                Insert: {
                    alerted_at?: string | null;
                    note?: string | null;
                    request_id?: number | null;
                    requested_at?: string | null;
                    sweep: string;
                };
                Update: {
                    alerted_at?: string | null;
                    note?: string | null;
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
                    config: Json;
                    tenant_id: string;
                    updated_at: string;
                    version: number;
                };
                Insert: {
                    config?: Json;
                    tenant_id: string;
                    updated_at?: string;
                    version?: number;
                };
                Update: {
                    config?: Json;
                    tenant_id?: string;
                    updated_at?: string;
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
                    slug?: string;
                    status?: string;
                    timezone?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
        };
        Views: {
            [_ in never]: never;
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
            claim_job: {
                Args: {
                    p_job_id: string;
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
            expire_stale_pauses: {
                Args: never;
                Returns: number;
            };
            fail_job: {
                Args: {
                    p_error: string;
                    p_job_id: string;
                };
                Returns: undefined;
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
            ingest_call: {
                Args: {
                    p_agent_id: string;
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
            metrics_summary: {
                Args: {
                    p_days?: number;
                    p_tenant_id: string;
                };
                Returns: Json;
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
            people_list: {
                Args: {
                    p_contact_id?: string;
                    p_tenant_id: string;
                };
                Returns: {
                    call_count: number;
                    call_seconds: number;
                    channels: string[];
                    consent: string;
                    consent_source: string;
                    consent_updated_at: string;
                    conversation_count: number;
                    display_name: string;
                    dnc: boolean;
                    earliest_row_at: string;
                    escalation_count: number;
                    first_contact_at: string;
                    has_backfill: boolean;
                    has_chat: boolean;
                    id: string;
                    last_call_at: string;
                    last_inbound_at: string;
                    last_inbound_call_at: string;
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
                    needs_human: boolean;
                    open_escalation_reason: string;
                    open_escalation_since: string;
                    phone_e164: string;
                    queued_reply_at: string;
                    wa_profile_name: string;
                }[];
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
            purge_notifications: {
                Args: {
                    p_keep?: string;
                };
                Returns: number;
            };
            put_channel_credentials: {
                Args: {
                    p_channel_id: string;
                    p_secret: Json;
                };
                Returns: string;
            };
            report_series: {
                Args: {
                    p_days?: number;
                    p_tenant_id: string;
                };
                Returns: Json;
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
            set_contact_consent: {
                Args: {
                    p_consent: string;
                    p_contact_id: string;
                    p_note?: string;
                    p_source: string;
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
            trigger_playbooks_sweep: {
                Args: never;
                Returns: number;
            };
            trigger_sweep_health: {
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
 * ingest_inbound is the atomic concurrency gate (RPC); everything else is
 * plain row work. All writes are ADDITIVE to the Blob path during dual-write.
 */

type Db$3 = SupabaseClient<Database>;
interface IngestInboundParams {
    tenantId: string;
    channel: "whatsapp";
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
declare function ingestInbound(db: Db$3, p: IngestInboundParams): Promise<IngestResult>;
/** Stamp a message handled (replied / deliberately skipped) — retry no-ops after this.
 *  One server-side jsonb merge (no read-modify-write, no lost-update race). */
declare function markProcessed(db: Db$3, tenantId: string, messageId: string): Promise<void>;
declare function recordOutbound(db: Db$3, p: {
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
}): Promise<string | null>;
interface OutboundTarget {
    contactId: string;
    conversationId: string;
    /** 'unknown' | 'opted_in' | 'opted_out' — carried so no caller can send
     *  without having been handed the consent state. */
    consent: string | null;
    dnc: boolean;
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
declare function resolveOutboundTarget(db: Db$3, p: {
    tenantId: string;
    phoneE164: string;
    create?: boolean;
}): Promise<OutboundTarget | null>;
/**
 * Automated sends already made to this thread today, by source.
 *
 * The conversational path caps bot replies per thread per day from the thread
 * state it already holds. A voice-initiated send has no thread state, and so had
 * no cap at all — a caller who phoned repeatedly, or an agent that called its
 * own tool twice, produced one billable template per attempt.
 */
declare function countSentToday(db: Db$3, p: {
    tenantId: string;
    conversationId: string;
    source: string;
}): Promise<number>;
/** Delivery receipts: update by wamid; monotone rank enforced by trigger. */
declare function recordStatusByExternalId(db: Db$3, tenantId: string, externalId: string, status: "sent" | "delivered" | "read" | "failed", errorDetail?: Json): Promise<void>;
/** Owner replied from the WhatsApp Business app: persist the echo + pause the bot.
 *  Upserts the contact/conversation — an owner-INITIATED thread (customer never
 *  messaged yet) must still record the message and the pause, or PG diverges
 *  from the Blob pause forever. */
declare function recordEchoAndPause(db: Db$3, p: {
    tenantId: string;
    customerPhoneDigits: string;
    body: string | null;
    externalId: string | null;
    pausedUntilIso: string;
}): Promise<void>;
/**
 * Mirror of the Blob pausedUntil semantics for AI-side pauses (non-text / escalation).
 *
 * Returns whether the pause actually landed, and the caller must care.
 *
 * This used to discard the result entirely, which under PG_READS makes it the
 * quietest way to break the product: `paused_until` on this row IS the answer
 * to "may I speak?", so a transient PostgREST failure here means the bot opens
 * an escalation, emails staff, and then keeps answering the thread it just
 * handed to a human. supabase-js does not throw, so the surrounding try/catch
 * never saw it either — the only evidence was a customer being talked over.
 *
 * `.select("id")` is not decoration: an UPDATE that RLS or a wrong tenant id
 * excludes matches zero rows and reports success, so the row count is the only
 * way to tell a write that happened from one that was silently skipped.
 */
declare function pauseConversation(db: Db$3, tenantId: string, conversationId: string, pausedUntilIso: string): Promise<boolean>;
declare function emitEvent(db: Db$3, tenantId: string, kind: string, category: string, subjectType: string | null, subjectId: string | null, data?: Json): Promise<void>;

/** Webhook → tenant routing over tenant_channels(kind, external_id). */

interface RoutedChannel {
    channelId: string;
    tenantId: string;
    kind: string;
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
     * is an infrastructure blip that a designated tenant may ride out on its
     * baked profile. Returning a bare null for both made a Postgres hiccup
     * indistinguishable from someone flipping the off switch.
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

type Db$2 = SupabaseClient<Database>;
interface NormalizedCallInput {
    retellCallId: string;
    agentId: string | null;
    direction: "inbound" | "outbound";
    callType: string | null;
    fromE164: string | null;
    fromRaw: string | null;
    toE164: string | null;
    status: "registered" | "ongoing" | "ended" | "error" | "not_connected";
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
declare function ingestCall(db: Db$2, tenantId: string, n: NormalizedCallInput, raw?: unknown): Promise<IngestCallResult>;
/** Attach the thread note (call_summary message) back to its call row. */
declare function linkCallMessage(db: Db$2, tenantId: string, callId: string, messageId: string): Promise<void>;
/** Post-storage-copy state for the recording (private bucket path). */
declare function setCallRecording(db: Db$2, tenantId: string, callId: string, recording: Record<string, unknown>): Promise<void>;
/** The customer's thread gets the call as a message, so history stays in one place. */
declare function recordCallNote(db: Db$2, p: {
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
declare function claimCallNotification(db: Db$2, tenantId: string, callId: string): Promise<boolean>;

/**
 * Gate 1b: the bot's working memory, read from Postgres.
 *
 * Until now the receptionist's memory lived in Vercel Blob and Postgres was a
 * write-only shadow — which meant every surface we built read a MIRROR of the
 * truth, and the two had to be kept in step by hand. Three of our worst bugs
 * came from that gap (an operator take-over clobbered by a webhook writing a
 * stale whole-object, archived threads swallowing new messages, a reply
 * scheduled before its mirror write).
 *
 * This returns the same four things the Blob blob did, so the caller's logic is
 * untouched — only the source moves:
 *   history      last turns fed to the model
 *   pausedUntil  a human is handling this thread
 *   replies      bot sends in the last 24h (rate cap)
 *   seen         retry dedupe — NOT needed here: ingest_inbound's is_new is an
 *                atomic gate on a unique index, which is strictly stronger than
 *                a 40-entry array that two concurrent lambdas could both miss.
 */

type Db$1 = SupabaseClient<Database>;
interface ThreadTurn {
    role: "user" | "assistant";
    content: string;
}
interface PgThreadState {
    history: ThreadTurn[];
    seen: string[];
    pausedUntil: number;
    replies: number[];
}
/**
 * A conversation's turns, as the model should see them.
 *
 * Extracted so the WhatsApp receptionist and the voice agent cannot end up
 * with different ideas of what was said. They used to: the bot read these rows
 * from Postgres while the voice agent read a six-turn slice out of the Blob
 * mirror, so the same customer got a different — and thinner — account of
 * themselves depending on which number they used.
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
declare function readThreadState(db: Db$1, tenantId: string, conversationId: string, pausedUntilIso: string | null, historyLimit?: number): Promise<PgThreadState>;
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
    /** The owner's notes on them — facts for the receptionist, never read aloud. */
    notes?: string | null;
}
/**
 * Everything both agents know about one lead, from the one place that knows it.
 *
 * The WhatsApp receptionist and the voice agent are meant to be the same
 * receptionist — a customer who phoned yesterday and texts today should not
 * have to start again. They were not: the bot read this conversation from
 * Postgres while the voice agent read a six-turn slice out of the Blob mirror,
 * a store we are actively retiring. Same person, two different accounts of
 * them, and only one of the two kept up to date.
 *
 * READ-ONLY on purpose. A context lookup must never create a contact or a
 * conversation: an inbound call that is never answered, or a wrong number,
 * would otherwise leave a lead behind in the workspace. The real ingest paths
 * create rows; this one only reports what is already true.
 */
declare function readLeadContext(db: Db$1, tenantId: string, phoneE164: string, historyLimit?: number): Promise<LeadContext>;
/**
 * The lead, described for a model in a few plain lines.
 *
 * Shared so both agents introduce the same person the same way. Facts only —
 * a name we were given, whether we have spoken, when. Nothing inferred, and
 * nothing said at all when we know nothing, because "New caller" is itself a
 * useful and honest thing to tell an agent.
 */
declare function describeLead(lead: LeadContext, now?: Date): string;

/**
 * Control-plane repository (Session A): config, policies, team.
 * Same shape as ingest/calls/thread — thin, typed, no business rules here;
 * enforcement lives in RLS + the DB triggers + requireRole at the routes.
 */

type Db = SupabaseClient<Database>;
interface TenantConfigRow {
    tenant_id: string;
    config: unknown;
    version: number;
    updated_at: string;
}
declare function getTenantConfig(db: Db, tenantId: string): Promise<TenantConfigRow | null>;
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
declare function putTenantConfig(db: Db, tenantId: string, config: unknown, expectedVersion: number): Promise<PutTenantConfigResult>;
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
declare function listPolicies(db: Db, tenantId: string): Promise<PolicyRecord[]>;
declare function setPolicyMode(db: Db, tenantId: string, policyClass: string, mode: string, 
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
declare function personReplyMode(db: Db, tenantId: string, contactId: string): Promise<string | null>;
/**
 * Set or clear one person's receptionist mode. `null` removes the row, so the
 * person follows the workspace policy again. Insert and delete are owner-only
 * under RLS (00029); a forbidden insert raises, and the route decides the
 * role before getting here.
 */
declare function setPersonReplyMode(db: Db, tenantId: string, contactId: string, mode: string | null): Promise<void>;

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
declare function subscribeMessagesInserts(client: SupabaseClient<Database>, 
/** Called with the changed row and the TABLE it came from, so a caller can
 *  route the event instead of repainting everything on every change. */
onInsert: (row: {
    conversation_id: string;
    tenant_id: string;
}, table: string, event?: string) => void, opts?: SubscribeOptions): () => void;

export { type ChannelLookup, type Database, HISTORY_COLUMNS, type IngestCallResult, type IngestInboundParams, type IngestResult, type Json, type LeadContext, type NormalizedCallInput, type OutboundTarget, type PgThreadState, type PolicyRecord, type PutTenantConfigResult, type RoutedChannel, type ServiceClientConfig, type SubscribeOptions, type TenantConfigRow, type ThreadTurn, assembleHistory, claimCallNotification, countSentToday, createServiceClient, describeLead, emitEvent, getTenantConfig, ingestCall, ingestInbound, linkCallMessage, listPolicies, markProcessed, pauseConversation, personReplyMode, putTenantConfig, readLeadContext, readThreadState, recordCallNote, recordEchoAndPause, recordOutbound, recordStatusByExternalId, resolveChannel, resolveChannelDetailed, resolveOutboundTarget, setCallRecording, setPersonReplyMode, setPolicyMode, subscribeMessagesInserts };
