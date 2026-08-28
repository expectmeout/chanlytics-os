export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      calls: {
        Row: {
          agent_id: string | null
          call_successful: boolean | null
          call_type: string | null
          channel_id: string | null
          contact_id: string | null
          conversation_id: string | null
          cost: Json | null
          created_at: string
          direction: string
          disconnection_reason: string | null
          duration_ms: number | null
          ended_at: string | null
          from_e164: string | null
          from_raw: string | null
          id: string
          in_voicemail: boolean | null
          latency: Json | null
          message_id: string | null
          public_log_url: string | null
          raw: Json
          recording: Json | null
          retell_call_id: string
          sentiment: string | null
          started_at: string | null
          status: string
          summary: string | null
          tenant_id: string
          to_e164: string | null
          transcript: string | null
          transcript_object: Json | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          call_successful?: boolean | null
          call_type?: string | null
          channel_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          cost?: Json | null
          created_at?: string
          direction?: string
          disconnection_reason?: string | null
          duration_ms?: number | null
          ended_at?: string | null
          from_e164?: string | null
          from_raw?: string | null
          id?: string
          in_voicemail?: boolean | null
          latency?: Json | null
          message_id?: string | null
          public_log_url?: string | null
          raw?: Json
          recording?: Json | null
          retell_call_id: string
          sentiment?: string | null
          started_at?: string | null
          status?: string
          summary?: string | null
          tenant_id: string
          to_e164?: string | null
          transcript?: string | null
          transcript_object?: Json | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          call_successful?: boolean | null
          call_type?: string | null
          channel_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          cost?: Json | null
          created_at?: string
          direction?: string
          disconnection_reason?: string | null
          duration_ms?: number | null
          ended_at?: string | null
          from_e164?: string | null
          from_raw?: string | null
          id?: string
          in_voicemail?: boolean | null
          latency?: Json | null
          message_id?: string | null
          public_log_url?: string | null
          raw?: Json
          recording?: Json | null
          retell_call_id?: string
          sentiment?: string | null
          started_at?: string | null
          status?: string
          summary?: string | null
          tenant_id?: string
          to_e164?: string | null
          transcript?: string | null
          transcript_object?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "tenant_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_identities: {
        Row: {
          channel: string
          contact_id: string
          created_at: string
          external_id: string
          id: string
          raw: Json
          tenant_id: string
        }
        Insert: {
          channel: string
          contact_id: string
          created_at?: string
          external_id: string
          id?: string
          raw?: Json
          tenant_id: string
        }
        Update: {
          channel?: string
          contact_id?: string
          created_at?: string
          external_id?: string
          id?: string
          raw?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_identities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_identities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          consent: string
          consent_source: string | null
          consent_updated_at: string | null
          created_at: string
          display_name: string | null
          dnc: boolean
          first_seen_at: string
          id: string
          last_seen_at: string
          merged_into_contact_id: string | null
          phone_e164: string | null
          tenant_id: string
          updated_at: string
          wa_profile_name: string | null
        }
        Insert: {
          consent?: string
          consent_source?: string | null
          consent_updated_at?: string | null
          created_at?: string
          display_name?: string | null
          dnc?: boolean
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          merged_into_contact_id?: string | null
          phone_e164?: string | null
          tenant_id: string
          updated_at?: string
          wa_profile_name?: string | null
        }
        Update: {
          consent?: string
          consent_source?: string | null
          consent_updated_at?: string | null
          created_at?: string
          display_name?: string | null
          dnc?: boolean
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          merged_into_contact_id?: string | null
          phone_e164?: string | null
          tenant_id?: string
          updated_at?: string
          wa_profile_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_merged_into_contact_id_fkey"
            columns: ["merged_into_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assignee_user_id: string | null
          contact_id: string
          created_at: string
          id: string
          last_inbound_at: string | null
          last_message_at: string | null
          last_wa_inbound_at: string | null
          paused_until: string | null
          snooze_until: string | null
          state: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assignee_user_id?: string | null
          contact_id: string
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_wa_inbound_at?: string | null
          paused_until?: string | null
          snooze_until?: string | null
          state?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assignee_user_id?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_wa_inbound_at?: string | null
          paused_until?: string | null
          snooze_until?: string | null
          state?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          actor_type: string
          actor_user_id: string | null
          created_at: string
          id: string
          payload: Json
          subject_id: string
          subject_type: string
          tenant_id: string
          undo_of: string | null
          verb: string
        }
        Insert: {
          actor_type: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          subject_id: string
          subject_type: string
          tenant_id: string
          undo_of?: string | null
          verb: string
        }
        Update: {
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          subject_id?: string
          subject_type?: string
          tenant_id?: string
          undo_of?: string | null
          verb?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_undo_of_fkey"
            columns: ["undo_of"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      escalations: {
        Row: {
          conversation_id: string
          created_at: string
          decision_id: string | null
          details: string | null
          id: string
          reason: string
          resolved_by_user_id: string | null
          state: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          decision_id?: string | null
          details?: string | null
          id?: string
          reason: string
          resolved_by_user_id?: string | null
          state?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          decision_id?: string | null
          details?: string | null
          id?: string
          reason?: string
          resolved_by_user_id?: string | null
          state?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          category: string
          created_at: string
          data: Json
          id: string
          kind: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      events_y2026m08: {
        Row: {
          category: string
          created_at: string
          data: Json
          id: string
          kind: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      events_y2026m09: {
        Row: {
          category: string
          created_at: string
          data: Json
          id: string
          kind: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      events_y2026m10: {
        Row: {
          category: string
          created_at: string
          data: Json
          id: string
          kind: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      events_y2026m11: {
        Row: {
          category: string
          created_at: string
          data: Json
          id: string
          kind: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      events_y2026m12: {
        Row: {
          category: string
          created_at: string
          data: Json
          id: string
          kind: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      events_y2027m01: {
        Row: {
          category: string
          created_at: string
          data: Json
          id: string
          kind: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      events_y2027m02: {
        Row: {
          category: string
          created_at: string
          data: Json
          id: string
          kind: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      events_y2027m03: {
        Row: {
          category: string
          created_at: string
          data: Json
          id: string
          kind: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      events_y2027m04: {
        Row: {
          category: string
          created_at: string
          data: Json
          id: string
          kind: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      events_y2027m05: {
        Row: {
          category: string
          created_at: string
          data: Json
          id: string
          kind: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      events_y2027m06: {
        Row: {
          category: string
          created_at: string
          data: Json
          id: string
          kind: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      events_y2027m07: {
        Row: {
          category: string
          created_at: string
          data: Json
          id: string
          kind: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      events_y2027m08: {
        Row: {
          category: string
          created_at: string
          data: Json
          id: string
          kind: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      events_y2027m09: {
        Row: {
          category: string
          created_at: string
          data: Json
          id: string
          kind: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          created_at: string
          id: string
          key: string
          request_hash: string | null
          response: Json | null
          route: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          request_hash?: string | null
          response?: Json | null
          route: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          request_hash?: string | null
          response?: Json | null
          route?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          revoked_at: string | null
          role: string
          tenant_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          revoked_at?: string | null
          role: string
          tenant_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          revoked_at?: string | null
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          cancel_token: string
          created_at: string
          due_at: string
          fired_at: string | null
          id: string
          kind: string
          last_error: string | null
          payload: Json
          qstash_id: string | null
          state: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          cancel_token?: string
          created_at?: string
          due_at: string
          fired_at?: string | null
          id?: string
          kind: string
          last_error?: string | null
          payload?: Json
          qstash_id?: string | null
          state?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          cancel_token?: string
          created_at?: string
          due_at?: string
          fired_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          payload?: Json
          qstash_id?: string | null
          state?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          channel: string
          channel_ts: string | null
          contact_id: string | null
          content_hash: string | null
          conversation_id: string
          created_at: string
          direction: string
          error: Json | null
          external_id: string | null
          id: string
          media: Json | null
          meta: Json
          sender: string
          sent_by: string | null
          status: string
          status_updated_at: string | null
          template_name: string | null
          template_vars: Json | null
          tenant_id: string
          type: string
        }
        Insert: {
          body?: string | null
          channel: string
          channel_ts?: string | null
          contact_id?: string | null
          content_hash?: string | null
          conversation_id: string
          created_at?: string
          direction: string
          error?: Json | null
          external_id?: string | null
          id?: string
          media?: Json | null
          meta?: Json
          sender: string
          sent_by?: string | null
          status?: string
          status_updated_at?: string | null
          template_name?: string | null
          template_vars?: Json | null
          tenant_id: string
          type?: string
        }
        Update: {
          body?: string | null
          channel?: string
          channel_ts?: string | null
          contact_id?: string | null
          content_hash?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          error?: Json | null
          external_id?: string | null
          id?: string
          media?: Json | null
          meta?: Json
          sender?: string
          sent_by?: string | null
          status?: string
          status_updated_at?: string | null
          template_name?: string | null
          template_vars?: Json | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      policies: {
        Row: {
          class: string
          id: string
          limits: Json
          mode: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          class: string
          id?: string
          limits?: Json
          mode: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          class?: string
          id?: string
          limits?: Json
          mode?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          body_preview: string | null
          channel: string
          created_at: string
          id: string
          language: string
          meta_status: string
          name: string
          tenant_id: string
          updated_at: string
          variables: Json
        }
        Insert: {
          body_preview?: string | null
          channel: string
          created_at?: string
          id?: string
          language: string
          meta_status?: string
          name: string
          tenant_id: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          body_preview?: string | null
          channel?: string
          created_at?: string
          id?: string
          language?: string
          meta_status?: string
          name?: string
          tenant_id?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_channels: {
        Row: {
          config: Json
          created_at: string
          credentials_ref: string | null
          external_id: string
          id: string
          kind: string
          number_e164: string | null
          status: string
          tenant_id: string
          updated_at: string
          waba_id: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          credentials_ref?: string | null
          external_id: string
          id?: string
          kind: string
          number_e164?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          waba_id?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          credentials_ref?: string | null
          external_id?: string
          id?: string
          kind?: string
          number_e164?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          waba_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_config: {
        Row: {
          config: Json
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          config?: Json
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          config?: Json
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          locale: string
          name: string
          slug: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          locale?: string
          name: string
          slug: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          locale?: string
          name?: string
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_job: { Args: { p_job_id: string }; Returns: Json }
      ensure_events_partition: { Args: { p_month: string }; Returns: undefined }
      expire_stale_pauses: { Args: never; Returns: number }
      fail_job: {
        Args: { p_error: string; p_job_id: string }
        Returns: undefined
      }
      get_channel_credentials: { Args: { p_channel_id: string }; Returns: Json }
      ingest_call: {
        Args: {
          p_agent_id: string
          p_call_type: string
          p_cost: Json
          p_direction: string
          p_disconnection: string
          p_duration_ms: number
          p_ended_at: string
          p_from_e164: string
          p_from_raw: string
          p_in_voicemail: boolean
          p_latency: Json
          p_public_log_url: string
          p_raw: Json
          p_recording: Json
          p_retell_call_id: string
          p_sentiment: string
          p_started_at: string
          p_status: string
          p_successful: boolean
          p_summary: string
          p_tenant_id: string
          p_to_e164: string
          p_transcript: string
          p_transcript_obj: Json
        }
        Returns: Json
      }
      ingest_inbound: {
        Args: {
          p_body: string
          p_channel: string
          p_channel_ts: string
          p_identity_external_id: string
          p_media?: Json
          p_message_external_id: string
          p_meta?: Json
          p_opt_in?: boolean
          p_opt_out?: boolean
          p_phone_e164: string
          p_tenant_id: string
          p_type: string
          p_wa_profile_name: string
        }
        Returns: Json
      }
      mark_processed: {
        Args: { p_message_id: string; p_tenant_id: string }
        Returns: undefined
      }
      metrics_summary: {
        Args: { p_days?: number; p_tenant_id: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
