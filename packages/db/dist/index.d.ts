import { SupabaseClient } from '@supabase/supabase-js';

type Json = string | number | boolean | null | {
    [key: string]: Json | undefined;
} | Json[];
type Database = {
    __InternalSupabase: {
        PostgrestVersion: "14.17";
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
                    first_seen_at: string;
                    id: string;
                    last_seen_at: string;
                    merged_into_contact_id: string | null;
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
                    first_seen_at?: string;
                    id?: string;
                    last_seen_at?: string;
                    merged_into_contact_id?: string | null;
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
                    first_seen_at?: string;
                    id?: string;
                    last_seen_at?: string;
                    merged_into_contact_id?: string | null;
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
            ensure_events_partition: {
                Args: {
                    p_month: string;
                };
                Returns: undefined;
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
                    p_opt_out?: boolean;
                    p_phone_e164: string;
                    p_tenant_id: string;
                    p_type: string;
                    p_wa_profile_name: string;
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

type Db = SupabaseClient<Database>;
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
}
interface IngestResult {
    message_id: string;
    conversation_id: string;
    contact_id: string;
    is_new: boolean;
    processed: boolean;
    state: string;
    paused_until: string | null;
}
declare function ingestInbound(db: Db, p: IngestInboundParams): Promise<IngestResult>;
/** Stamp a message handled (replied / deliberately skipped) — retry no-ops after this. */
declare function markProcessed(db: Db, tenantId: string, messageId: string): Promise<void>;
declare function recordOutbound(db: Db, p: {
    tenantId: string;
    conversationId: string;
    contactId: string | null;
    sender: "ai" | "human" | "system";
    type?: "text" | "template" | "note";
    body: string;
    externalId: string | null;
    meta?: Json;
    status?: "sent" | "failed";
}): Promise<string | null>;
/** Delivery receipts: update by wamid; monotone rank enforced by trigger. */
declare function recordStatusByExternalId(db: Db, tenantId: string, externalId: string, status: "sent" | "delivered" | "read" | "failed", errorDetail?: Json): Promise<void>;
/** Owner replied from the WhatsApp Business app: persist the echo + pause the bot. */
declare function recordEchoAndPause(db: Db, p: {
    tenantId: string;
    customerPhoneDigits: string;
    body: string | null;
    externalId: string | null;
    pausedUntilIso: string;
}): Promise<void>;
/** Mirror of the Blob pausedUntil semantics for AI-side pauses (non-text / escalation). */
declare function pauseConversation(db: Db, tenantId: string, conversationId: string, pausedUntilIso: string): Promise<void>;
declare function emitEvent(db: Db, tenantId: string, kind: string, category: string, subjectType: string | null, subjectId: string | null, data?: Json): Promise<void>;

/** Webhook → tenant routing over tenant_channels(kind, external_id). */

interface RoutedChannel {
    channelId: string;
    tenantId: string;
    kind: string;
}
declare function resolveChannel(db: SupabaseClient<Database>, kind: string, externalId: string): Promise<RoutedChannel | null>;

/**
 * The single Realtime subscription wrapper (Blueprint §5): every surface
 * subscribes through here, so the documented scale path (postgres_changes →
 * broadcast-from-database) never touches a surface. RLS authorizes events —
 * callers pass an AUTHED client.
 */

declare function subscribeMessagesInserts(client: SupabaseClient<Database>, onInsert: (row: {
    conversation_id: string;
    tenant_id: string;
}) => void): () => void;

export { type Database, type IngestInboundParams, type IngestResult, type Json, type RoutedChannel, type ServiceClientConfig, createServiceClient, emitEvent, ingestInbound, markProcessed, pauseConversation, recordEchoAndPause, recordOutbound, recordStatusByExternalId, resolveChannel, subscribeMessagesInserts };
