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
    PostgrestVersion: "14.5"
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
      ask_messages: {
        Row: {
          content: Json
          created_at: string
          id: string
          role: string
          tenant_id: string
          thread_id: string
          user_id: string
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          role: string
          tenant_id: string
          thread_id: string
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          role?: string
          tenant_id?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ask_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ask_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ask_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ask_threads: {
        Row: {
          created_at: string
          id: string
          last_at: string
          scope: Json | null
          tenant_id: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_at?: string
          scope?: Json | null
          tenant_id: string
          title?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_at?: string
          scope?: Json | null
          tenant_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ask_threads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_recipients: {
        Row: {
          broadcast_id: string
          contact_id: string
          message_id: string | null
          reason: string | null
          sent_at: string | null
          state: string
          tenant_id: string
        }
        Insert: {
          broadcast_id: string
          contact_id: string
          message_id?: string | null
          reason?: string | null
          sent_at?: string | null
          state?: string
          tenant_id: string
        }
        Update: {
          broadcast_id?: string
          contact_id?: string
          message_id?: string | null
          reason?: string | null
          sent_at?: string | null
          state?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_recipients_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_recipients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          audience: Json
          created_at: string
          created_by: string | null
          failure: string | null
          finished_at: string | null
          id: string
          name: string
          params: Json
          playbook_id: string | null
          recipient_count: number
          run_for: string | null
          scheduled_for: string
          started_at: string | null
          state: string
          template_id: string
          template_language: string
          template_name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          audience?: Json
          created_at?: string
          created_by?: string | null
          failure?: string | null
          finished_at?: string | null
          id?: string
          name: string
          params?: Json
          playbook_id?: string | null
          recipient_count?: number
          run_for?: string | null
          scheduled_for: string
          started_at?: string | null
          state?: string
          template_id: string
          template_language: string
          template_name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          audience?: Json
          created_at?: string
          created_by?: string | null
          failure?: string | null
          finished_at?: string | null
          id?: string
          name?: string
          params?: Json
          playbook_id?: string | null
          recipient_count?: number
          run_for?: string | null
          scheduled_for?: string
          started_at?: string | null
          state?: string
          template_id?: string
          template_language?: string
          template_name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
          notified_at: string | null
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
          notified_at?: string | null
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
          notified_at?: string | null
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
          erased_at: string | null
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
          erased_at?: string | null
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
          erased_at?: string | null
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
          deadman_alerted_at: string | null
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
          deadman_alerted_at?: string | null
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
          deadman_alerted_at?: string | null
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
      events_default: {
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
      playbooks: {
        Row: {
          cadence_days: number
          cap_per_run: number
          created_at: string
          created_by: string | null
          gap_days: number
          id: string
          last_run_at: string | null
          last_run_for: string | null
          name: string
          params: Json
          policy_class: string
          run_hour: number
          state: string
          template_id: string
          template_language: string
          template_name: string
          tenant_id: string
          trigger: string
          updated_at: string
        }
        Insert: {
          cadence_days?: number
          cap_per_run?: number
          created_at?: string
          created_by?: string | null
          gap_days?: number
          id?: string
          last_run_at?: string | null
          last_run_for?: string | null
          name: string
          params?: Json
          policy_class: string
          run_hour?: number
          state?: string
          template_id: string
          template_language: string
          template_name: string
          tenant_id: string
          trigger: string
          updated_at?: string
        }
        Update: {
          cadence_days?: number
          cap_per_run?: number
          created_at?: string
          created_by?: string | null
          gap_days?: number
          id?: string
          last_run_at?: string | null
          last_run_for?: string | null
          name?: string
          params?: Json
          policy_class?: string
          run_hour?: number
          state?: string
          template_id?: string
          template_language?: string
          template_name?: string
          tenant_id?: string
          trigger?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbooks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      segment_members: {
        Row: {
          added_at: string
          added_by: string | null
          contact_id: string
          segment_id: string
          tenant_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          contact_id: string
          segment_id: string
          tenant_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          contact_id?: string
          segment_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "segment_members_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segment_members_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segment_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      segments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "segments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sweep_status: {
        Row: {
          alerted_at: string | null
          note: string | null
          request_id: number | null
          requested_at: string | null
          sweep: string
        }
        Insert: {
          alerted_at?: string | null
          note?: string | null
          request_id?: number | null
          requested_at?: string | null
          sweep: string
        }
        Update: {
          alerted_at?: string | null
          note?: string | null
          request_id?: number | null
          requested_at?: string | null
          sweep?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          body_preview: string | null
          category: string | null
          channel: string
          components: Json | null
          created_at: string
          created_by: string | null
          hidden_at: string | null
          id: string
          language: string
          meta_id: string | null
          meta_status: string
          name: string
          quality: string | null
          rejected_reason: string | null
          source: string
          synced_at: string | null
          tenant_id: string
          title: string | null
          updated_at: string
          variables: Json
        }
        Insert: {
          body_preview?: string | null
          category?: string | null
          channel: string
          components?: Json | null
          created_at?: string
          created_by?: string | null
          hidden_at?: string | null
          id?: string
          language: string
          meta_id?: string | null
          meta_status?: string
          name: string
          quality?: string | null
          rejected_reason?: string | null
          source?: string
          synced_at?: string | null
          tenant_id: string
          title?: string | null
          updated_at?: string
          variables?: Json
        }
        Update: {
          body_preview?: string | null
          category?: string | null
          channel?: string
          components?: Json | null
          created_at?: string
          created_by?: string | null
          hidden_at?: string | null
          id?: string
          language?: string
          meta_id?: string | null
          meta_status?: string
          name?: string
          quality?: string | null
          rejected_reason?: string | null
          source?: string
          synced_at?: string | null
          tenant_id?: string
          title?: string | null
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
      call_status_rank: { Args: { p_status: string }; Returns: number }
      campaign_series: {
        Args: { p_days?: number; p_tenant_id: string }
        Returns: Json
      }
      claim_job: { Args: { p_job_id: string }; Returns: Json }
      create_person: {
        Args: {
          p_display_name: string
          p_phone_e164: string
          p_source: string
          p_tenant_id: string
          p_title?: string
        }
        Returns: Json
      }
      create_workspace: {
        Args: { p_name: string; p_timezone?: string }
        Returns: {
          id: string
          locale: string
          name: string
          slug: string
          status: string
          timezone: string
        }[]
      }
      deadman_candidates: {
        Args: { p_older_than?: string }
        Returns: {
          conversation_id: string
          details: string
          escalation_id: string
          opened_at: string
          phone_e164: string
          reason: string
          tenant_id: string
        }[]
      }
      deadman_mark_alerted: { Args: { p_ids: string[] }; Returns: number }
      ensure_events_partition: { Args: { p_month: string }; Returns: undefined }
      erase_contact: {
        Args: { p_contact_id: string; p_legs?: Json }
        Returns: Json
      }
      expire_stale_pauses: { Args: never; Returns: number }
      fail_job: {
        Args: { p_error: string; p_job_id: string }
        Returns: undefined
      }
      first_replies: {
        Args: { p_start: string; p_tenant_id: string }
        Returns: {
          ai_at: string
          ai_seconds: number
          asked_at: string
          conversation_id: string
          human_at: string
          who: string
        }[]
      }
      get_channel_credentials: { Args: { p_channel_id: string }; Returns: Json }
      get_cron_sweep_key: { Args: never; Returns: string }
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
      is_acting_member: { Args: { p_tenant: string }; Returns: boolean }
      lookup_user_for_invite: {
        Args: { p_email: string; p_tenant_id: string }
        Returns: string
      }
      mark_processed: {
        Args: { p_message_id: string; p_tenant_id: string }
        Returns: undefined
      }
      metrics_summary: {
        Args: { p_days?: number; p_tenant_id: string }
        Returns: Json
      }
      people_list: {
        Args: { p_contact_id?: string; p_tenant_id: string }
        Returns: {
          call_count: number
          call_seconds: number
          channels: string[]
          consent: string
          consent_source: string
          consent_updated_at: string
          conversation_count: number
          display_name: string
          dnc: boolean
          earliest_row_at: string
          escalation_count: number
          first_contact_at: string
          has_backfill: boolean
          has_chat: boolean
          id: string
          last_call_at: string
          last_inbound_at: string
          last_inbound_text: string
          last_message_at: string
          last_message_direction: string
          last_message_sender: string
          latest_assignee_user_id: string
          latest_conversation_id: string
          latest_paused_until: string
          latest_snooze_until: string
          latest_state: string
          latest_wa_inbound_at: string
          needs_human: boolean
          open_escalation_reason: string
          open_escalation_since: string
          phone_e164: string
          queued_reply_at: string
          wa_profile_name: string
        }[]
      }
      provision_tenant: { Args: { p_tenant_id: string }; Returns: undefined }
      purge_ask: { Args: { p_keep?: string }; Returns: number }
      purge_cron_history: {
        Args: { p_keep?: string; p_keep_per_job?: number }
        Returns: number
      }
      purge_events: { Args: { p_keep?: string }; Returns: number }
      put_channel_credentials: {
        Args: { p_channel_id: string; p_secret: Json }
        Returns: string
      }
      report_series: {
        Args: { p_days?: number; p_tenant_id: string }
        Returns: Json
      }
      scrub_ask_for_contact: {
        Args: { p_contact_id: string; p_needles: string[]; p_tenant_id: string }
        Returns: number
      }
      scrub_call_raw: { Args: { p_raw: Json }; Returns: Json }
      set_contact_consent: {
        Args: {
          p_consent: string
          p_contact_id: string
          p_note?: string
          p_source: string
        }
        Returns: Json
      }
      set_template_hidden: {
        Args: { p_hidden: boolean; p_template_id: string }
        Returns: Json
      }
      set_template_title: {
        Args: { p_template_id: string; p_title: string }
        Returns: Json
      }
      sweep_health: {
        Args: never
        Returns: {
          alerted_at: string
          detail: string
          healthy: boolean
          last_request_at: string
          scheduled: boolean
          status_code: number
          sweep: string
        }[]
      }
      sweep_mark_alerted: {
        Args: { p_alerted: string[]; p_healthy: string[] }
        Returns: number
      }
      sweep_recent_responses: {
        Args: { p_limit?: number }
        Returns: {
          body: string
          created_at: string
          request_id: number
          status_code: number
        }[]
      }
      sweep_schedules: {
        Args: never
        Returns: {
          active: boolean
          jobname: string
          last_run: string
          last_status: string
          schedule: string
        }[]
      }
      team_roster: {
        Args: { p_tenant_id: string }
        Returns: {
          email: string
          joined_at: string
          member_user_id: string
          membership_id: string
          role: string
        }[]
      }
      trigger_calendar_sweep: { Args: never; Returns: number }
      trigger_call_reconcile: { Args: never; Returns: number }
      trigger_deadman_sweep: { Args: never; Returns: number }
      trigger_playbooks_sweep: { Args: never; Returns: number }
      trigger_sweep_health: { Args: never; Returns: number }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
