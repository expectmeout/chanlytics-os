export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      billing_accounts: {
        Row: {
          cancel_at: string | null
          cancel_at_period_end: boolean
          card_brand: string | null
          card_last4: string | null
          created_at: string
          current_period_end: string | null
          facts: Json
          last_paid_at: string | null
          last_payment_failed_at: string | null
          mode: string
          price_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          cancel_at?: string | null
          cancel_at_period_end?: boolean
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          current_period_end?: string | null
          facts?: Json
          last_paid_at?: string | null
          last_payment_failed_at?: string | null
          mode?: string
          price_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at?: string | null
          cancel_at_period_end?: boolean
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          current_period_end?: string | null
          facts?: Json
          last_paid_at?: string | null
          last_payment_failed_at?: string | null
          mode?: string
          price_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
          trial_end?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_card_marks: {
        Row: {
          card_fingerprint: string
          seen_at: string
          tenant_id: string
        }
        Insert: {
          card_fingerprint: string
          seen_at?: string
          tenant_id: string
        }
        Update: {
          card_fingerprint?: string
          seen_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_card_marks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          id: string
          lease_until: string | null
          received_at: string
          state: string
          tenant_id: string | null
          type: string
        }
        Insert: {
          id: string
          lease_until?: string | null
          received_at?: string
          state?: string
          tenant_id?: string | null
          type: string
        }
        Update: {
          id?: string
          lease_until?: string | null
          received_at?: string
          state?: string
          tenant_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_tenant_id_fkey"
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
          facts: Json | null
          message_id: string | null
          reason: string | null
          sent_at: string | null
          state: string
          tenant_id: string
        }
        Insert: {
          broadcast_id: string
          contact_id: string
          facts?: Json | null
          message_id?: string | null
          reason?: string | null
          sent_at?: string | null
          state?: string
          tenant_id: string
        }
        Update: {
          broadcast_id?: string
          contact_id?: string
          facts?: Json | null
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
      business_records: {
        Row: {
          about: string
          business_type: string
          city: string
          company_type: string
          contact_email: string
          contact_first_name: string
          contact_job_position: string
          contact_last_name: string
          contact_phone: string
          contact_title: string
          country: string
          created_at: string
          ein: string | null
          industry: string
          legal_name: string
          postal_code: string
          region: string
          street: string
          street_secondary: string | null
          tenant_id: string
          trade_name: string | null
          updated_at: string
          website_url: string
        }
        Insert: {
          about?: string
          business_type?: string
          city: string
          company_type?: string
          contact_email: string
          contact_first_name: string
          contact_job_position?: string
          contact_last_name: string
          contact_phone: string
          contact_title?: string
          country?: string
          created_at?: string
          ein?: string | null
          industry?: string
          legal_name: string
          postal_code: string
          region: string
          street: string
          street_secondary?: string | null
          tenant_id: string
          trade_name?: string | null
          updated_at?: string
          website_url: string
        }
        Update: {
          about?: string
          business_type?: string
          city?: string
          company_type?: string
          contact_email?: string
          contact_first_name?: string
          contact_job_position?: string
          contact_last_name?: string
          contact_phone?: string
          contact_title?: string
          country?: string
          created_at?: string
          ein?: string | null
          industry?: string
          legal_name?: string
          postal_code?: string
          region?: string
          street?: string
          street_secondary?: string | null
          tenant_id?: string
          trade_name?: string | null
          updated_at?: string
          website_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          agent_id: string | null
          analysis: Json | null
          call_successful: boolean | null
          call_type: string | null
          caller_name: string | null
          channel_id: string | null
          contact_id: string | null
          conversation_id: string | null
          cost: Json | null
          created_at: string
          direction: string
          disconnection_reason: string | null
          duration_ms: number | null
          ended_at: string | null
          follow_up: string | null
          from_e164: string | null
          from_raw: string | null
          id: string
          in_voicemail: boolean | null
          latency: Json | null
          message_id: string | null
          note_checked_at: string | null
          notified_at: string | null
          outcome: string | null
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
          wanted: string | null
        }
        Insert: {
          agent_id?: string | null
          analysis?: Json | null
          call_successful?: boolean | null
          call_type?: string | null
          caller_name?: string | null
          channel_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          cost?: Json | null
          created_at?: string
          direction?: string
          disconnection_reason?: string | null
          duration_ms?: number | null
          ended_at?: string | null
          follow_up?: string | null
          from_e164?: string | null
          from_raw?: string | null
          id?: string
          in_voicemail?: boolean | null
          latency?: Json | null
          message_id?: string | null
          note_checked_at?: string | null
          notified_at?: string | null
          outcome?: string | null
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
          wanted?: string | null
        }
        Update: {
          agent_id?: string | null
          analysis?: Json | null
          call_successful?: boolean | null
          call_type?: string | null
          caller_name?: string | null
          channel_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          cost?: Json | null
          created_at?: string
          direction?: string
          disconnection_reason?: string | null
          duration_ms?: number | null
          ended_at?: string | null
          follow_up?: string | null
          from_e164?: string | null
          from_raw?: string | null
          id?: string
          in_voicemail?: boolean | null
          latency?: Json | null
          message_id?: string | null
          note_checked_at?: string | null
          notified_at?: string | null
          outcome?: string | null
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
          wanted?: string | null
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
      capability_activations: {
        Row: {
          activated_at: string
          activated_by: string | null
          capability: string
          deactivated_at: string | null
          note: string | null
          tenant_id: string
        }
        Insert: {
          activated_at?: string
          activated_by?: string | null
          capability: string
          deactivated_at?: string | null
          note?: string | null
          tenant_id: string
        }
        Update: {
          activated_at?: string
          activated_by?: string | null
          capability?: string
          deactivated_at?: string | null
          note?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capability_activations_tenant_id_fkey"
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
          email: string | null
          email_marketing: string
          email_marketing_source: string | null
          email_marketing_updated_at: string | null
          email_suppressed_at: string | null
          email_suppressed_reason: string | null
          erased_at: string | null
          erased_email_hash: string | null
          erased_phone_hash: string | null
          erasing_since: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          marketing_consent: string
          marketing_consent_source: string | null
          marketing_consent_updated_at: string | null
          merged_into_contact_id: string | null
          notes: string | null
          phone_e164: string | null
          proposal_url: string | null
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
          email?: string | null
          email_marketing?: string
          email_marketing_source?: string | null
          email_marketing_updated_at?: string | null
          email_suppressed_at?: string | null
          email_suppressed_reason?: string | null
          erased_at?: string | null
          erased_email_hash?: string | null
          erased_phone_hash?: string | null
          erasing_since?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          marketing_consent?: string
          marketing_consent_source?: string | null
          marketing_consent_updated_at?: string | null
          merged_into_contact_id?: string | null
          notes?: string | null
          phone_e164?: string | null
          proposal_url?: string | null
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
          email?: string | null
          email_marketing?: string
          email_marketing_source?: string | null
          email_marketing_updated_at?: string | null
          email_suppressed_at?: string | null
          email_suppressed_reason?: string | null
          erased_at?: string | null
          erased_email_hash?: string | null
          erased_phone_hash?: string | null
          erasing_since?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          marketing_consent?: string
          marketing_consent_source?: string | null
          marketing_consent_updated_at?: string | null
          merged_into_contact_id?: string | null
          notes?: string | null
          phone_e164?: string | null
          proposal_url?: string | null
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
          control_by: string | null
          control_kind: string | null
          control_ref: string | null
          control_until: string | null
          created_at: string
          id: string
          last_inbound_at: string | null
          last_message_at: string | null
          last_wa_inbound_at: string | null
          note_checked_at: string | null
          paused_until: string | null
          snooze_until: string | null
          state: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assignee_user_id?: string | null
          contact_id: string
          control_by?: string | null
          control_kind?: string | null
          control_ref?: string | null
          control_until?: string | null
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_wa_inbound_at?: string | null
          note_checked_at?: string | null
          paused_until?: string | null
          snooze_until?: string | null
          state?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assignee_user_id?: string | null
          contact_id?: string
          control_by?: string | null
          control_kind?: string | null
          control_ref?: string | null
          control_until?: string | null
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_wa_inbound_at?: string | null
          note_checked_at?: string | null
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
      deals: {
        Row: {
          amount_cents: number | null
          contact_id: string
          created_at: string
          created_by: string | null
          currency: string
          decided_at: string | null
          ended_at: string | null
          evidence: Json | null
          id: string
          lead_id: string | null
          lost_reason: string | null
          note: string | null
          per: string | null
          proposal_url: string | null
          proposed_at: string
          service: string | null
          source: string
          stage: string
          tenant_id: string
          updated_at: string
          valid_until: string | null
          version: number
        }
        Insert: {
          amount_cents?: number | null
          contact_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          decided_at?: string | null
          ended_at?: string | null
          evidence?: Json | null
          id?: string
          lead_id?: string | null
          lost_reason?: string | null
          note?: string | null
          per?: string | null
          proposal_url?: string | null
          proposed_at?: string
          service?: string | null
          source?: string
          stage: string
          tenant_id: string
          updated_at?: string
          valid_until?: string | null
          version?: number
        }
        Update: {
          amount_cents?: number | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          decided_at?: string | null
          ended_at?: string | null
          evidence?: Json | null
          id?: string
          lead_id?: string | null
          lost_reason?: string | null
          note?: string | null
          per?: string | null
          proposal_url?: string | null
          proposed_at?: string
          service?: string | null
          source?: string
          stage?: string
          tenant_id?: string
          updated_at?: string
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_tenant_id_fkey"
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
      events_y2027m10: {
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
      google_connections: {
        Row: {
          account_name: string
          account_title: string | null
          connected_at: string
          connected_by: string | null
          created_at: string
          credentials_ref: string | null
          facts: Json
          google_email: string | null
          google_sub: string | null
          last_synced_at: string | null
          location_name: string | null
          location_title: string | null
          scopes: string[]
          sync_error: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_name: string
          account_title?: string | null
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          credentials_ref?: string | null
          facts?: Json
          google_email?: string | null
          google_sub?: string | null
          last_synced_at?: string | null
          location_name?: string | null
          location_title?: string | null
          scopes?: string[]
          sync_error?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_title?: string | null
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          credentials_ref?: string | null
          facts?: Json
          google_email?: string | null
          google_sub?: string | null
          last_synced_at?: string | null
          location_name?: string | null
          location_title?: string | null
          scopes?: string[]
          sync_error?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      google_listing_days: {
        Row: {
          day: string
          rating: number | null
          review_count: number
          tenant_id: string
        }
        Insert: {
          day: string
          rating?: number | null
          review_count: number
          tenant_id: string
        }
        Update: {
          day?: string
          rating?: number | null
          review_count?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_listing_days_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "google_listings"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      google_listings: {
        Row: {
          address: string | null
          business_status: string | null
          check_error: string | null
          checked_at: string | null
          created_at: string
          facts: Json
          linked_at: string
          linked_by: string | null
          maps_uri: string | null
          name: string
          place_id: string
          rating: number | null
          review_count: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_status?: string | null
          check_error?: string | null
          checked_at?: string | null
          created_at?: string
          facts?: Json
          linked_at?: string
          linked_by?: string | null
          maps_uri?: string | null
          name: string
          place_id: string
          rating?: number | null
          review_count?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_status?: string | null
          check_error?: string | null
          checked_at?: string | null
          created_at?: string
          facts?: Json
          linked_at?: string
          linked_by?: string | null
          maps_uri?: string | null
          name?: string
          place_id?: string
          rating?: number | null
          review_count?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_listings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      google_reviews: {
        Row: {
          author: string | null
          author_photo_uri: string | null
          author_uri: string | null
          body: string | null
          first_seen_at: string
          id: string
          language_code: string | null
          last_seen_at: string
          maps_uri: string | null
          origin: string
          published_at: string | null
          rating: number | null
          replied_at: string | null
          reply_text: string | null
          review_id: string
          tenant_id: string
        }
        Insert: {
          author?: string | null
          author_photo_uri?: string | null
          author_uri?: string | null
          body?: string | null
          first_seen_at?: string
          id?: string
          language_code?: string | null
          last_seen_at?: string
          maps_uri?: string | null
          origin?: string
          published_at?: string | null
          rating?: number | null
          replied_at?: string | null
          reply_text?: string | null
          review_id: string
          tenant_id: string
        }
        Update: {
          author?: string | null
          author_photo_uri?: string | null
          author_uri?: string | null
          body?: string | null
          first_seen_at?: string
          id?: string
          language_code?: string | null
          last_seen_at?: string
          maps_uri?: string | null
          origin?: string
          published_at?: string | null
          rating?: number | null
          replied_at?: string | null
          reply_text?: string | null
          review_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "google_listings"
            referencedColumns: ["tenant_id"]
          },
        ]
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
          invited_by: string | null
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
          invited_by?: string | null
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
          invited_by?: string | null
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
          created_at: string
          due_at: string
          fired_at: string | null
          id: string
          kind: string
          last_error: string | null
          lease_until: string | null
          payload: Json
          state: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          due_at: string
          fired_at?: string | null
          id?: string
          kind: string
          last_error?: string | null
          lease_until?: string | null
          payload?: Json
          state?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          due_at?: string
          fired_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          lease_until?: string | null
          payload?: Json
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
      lead_counters: {
        Row: {
          id: string
          kind: string
          period: string
          reserved: number
          tenant_id: string | null
          updated_at: string
          used: number
        }
        Insert: {
          id?: string
          kind: string
          period: string
          reserved?: number
          tenant_id?: string | null
          updated_at?: string
          used?: number
        }
        Update: {
          id?: string
          kind?: string
          period?: string
          reserved?: number
          tenant_id?: string | null
          updated_at?: string
          used?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_judgments: {
        Row: {
          answer: Json
          batch: number
          created_at: string
          id: string
          model: string | null
          op_id: string
          request_hash: string | null
          round_id: string
          tenant_id: string
          tokens: number
        }
        Insert: {
          answer: Json
          batch?: number
          created_at?: string
          id?: string
          model?: string | null
          op_id: string
          request_hash?: string | null
          round_id: string
          tenant_id: string
          tokens?: number
        }
        Update: {
          answer?: Json
          batch?: number
          created_at?: string
          id?: string
          model?: string | null
          op_id?: string
          request_hash?: string | null
          round_id?: string
          tenant_id?: string
          tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_judgments_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "lead_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_judgments_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "lead_searches_view"
            referencedColumns: ["round_id"]
          },
          {
            foreignKeyName: "lead_judgments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_niche_priors: {
        Row: {
          category_key: string
          matched: number
          places: number
          updated_at: string
          with_email: number
        }
        Insert: {
          category_key: string
          matched?: number
          places?: number
          updated_at?: string
          with_email?: number
        }
        Update: {
          category_key?: string
          matched?: number
          places?: number
          updated_at?: string
          with_email?: number
        }
        Relationships: []
      }
      lead_operations: {
        Row: {
          after: Json
          at: string
          before: Json
          by: string | null
          id: string
          kind: string
          lead_ids: string[]
          search_id: string | null
          tenant_id: string
          undone_at: string | null
          version: number
        }
        Insert: {
          after?: Json
          at?: string
          before?: Json
          by?: string | null
          id?: string
          kind: string
          lead_ids?: string[]
          search_id?: string | null
          tenant_id: string
          undone_at?: string | null
          version: number
        }
        Update: {
          after?: Json
          at?: string
          before?: Json
          by?: string | null
          id?: string
          kind?: string
          lead_ids?: string[]
          search_id?: string | null
          tenant_id?: string
          undone_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_operations_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "lead_searches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_operations_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "lead_searches_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_operations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_places: {
        Row: {
          found_at: string
          id: string
          lead_id: string
          place_id: string
          street: string | null
          tenant_id: string
          title: string | null
        }
        Insert: {
          found_at?: string
          id?: string
          lead_id: string
          place_id: string
          street?: string | null
          tenant_id: string
          title?: string | null
        }
        Update: {
          found_at?: string
          id?: string
          lead_id?: string
          place_id?: string
          street?: string | null
          tenant_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_places_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_places_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_platform: {
        Row: {
          id: boolean
          note: string | null
          prices_checked_at: string | null
          searches_on: boolean
          tenants_on: string[]
          updated_at: string
        }
        Insert: {
          id?: boolean
          note?: string | null
          prices_checked_at?: string | null
          searches_on?: boolean
          tenants_on?: string[]
          updated_at?: string
        }
        Update: {
          id?: boolean
          note?: string | null
          prices_checked_at?: string | null
          searches_on?: boolean
          tenants_on?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      lead_preferences: {
        Row: {
          active: boolean
          category_key: string | null
          created_at: string
          created_by: string | null
          example: string | null
          from_lead_id: string | null
          id: string
          kind: string
          tenant_id: string
        }
        Insert: {
          active?: boolean
          category_key?: string | null
          created_at?: string
          created_by?: string | null
          example?: string | null
          from_lead_id?: string | null
          id?: string
          kind: string
          tenant_id: string
        }
        Update: {
          active?: boolean
          category_key?: string | null
          created_at?: string
          created_by?: string | null
          example?: string | null
          from_lead_id?: string | null
          id?: string
          kind?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_preferences_from_lead_id_fkey"
            columns: ["from_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_rounds: {
        Row: {
          allowance_reserved: number
          allowance_used: number
          answered: string | null
          cost_reserved_usd: number
          cost_usd: number
          created_at: string
          day: string
          ended_at: string | null
          ending: string | null
          ending_pending: string | null
          id: string
          judge_model: string | null
          judge_tokens: number
          month: string
          nearby: Json
          plan: Json
          plan_version: number
          platform_day: string
          purpose: string
          question: Json | null
          search_id: string
          seq: number
          started_at: string | null
          state: string
          target: number
          tenant_id: string
          waiting_since: string | null
        }
        Insert: {
          allowance_reserved?: number
          allowance_used?: number
          answered?: string | null
          cost_reserved_usd?: number
          cost_usd?: number
          created_at?: string
          day: string
          ended_at?: string | null
          ending?: string | null
          ending_pending?: string | null
          id?: string
          judge_model?: string | null
          judge_tokens?: number
          month: string
          nearby?: Json
          plan: Json
          plan_version: number
          platform_day?: string
          purpose: string
          question?: Json | null
          search_id: string
          seq: number
          started_at?: string | null
          state?: string
          target: number
          tenant_id: string
          waiting_since?: string | null
        }
        Update: {
          allowance_reserved?: number
          allowance_used?: number
          answered?: string | null
          cost_reserved_usd?: number
          cost_usd?: number
          created_at?: string
          day?: string
          ended_at?: string | null
          ending?: string | null
          ending_pending?: string | null
          id?: string
          judge_model?: string | null
          judge_tokens?: number
          month?: string
          nearby?: Json
          plan?: Json
          plan_version?: number
          platform_day?: string
          purpose?: string
          question?: Json | null
          search_id?: string
          seq?: number
          started_at?: string | null
          state?: string
          target?: number
          tenant_id?: string
          waiting_since?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_rounds_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "lead_searches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_rounds_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "lead_searches_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_rounds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_runs: {
        Row: {
          actor: string
          apify_run_id: string | null
          build: string
          cap_usd: number | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          dataset_id: string | null
          finished_at: string | null
          id: string
          items_seen: number
          lease_gen: number
          lease_owner: string | null
          lease_until: string | null
          purpose: string
          read_offset: number
          round_id: string
          state: string
          tenant_id: string
          term: string | null
          usage_usd: number
          webhook_token_hash: string
        }
        Insert: {
          actor: string
          apify_run_id?: string | null
          build: string
          cap_usd?: number | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          dataset_id?: string | null
          finished_at?: string | null
          id?: string
          items_seen?: number
          lease_gen?: number
          lease_owner?: string | null
          lease_until?: string | null
          purpose: string
          read_offset?: number
          round_id: string
          state?: string
          tenant_id: string
          term?: string | null
          usage_usd?: number
          webhook_token_hash: string
        }
        Update: {
          actor?: string
          apify_run_id?: string | null
          build?: string
          cap_usd?: number | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          dataset_id?: string | null
          finished_at?: string | null
          id?: string
          items_seen?: number
          lease_gen?: number
          lease_owner?: string | null
          lease_until?: string | null
          purpose?: string
          read_offset?: number
          round_id?: string
          state?: string
          tenant_id?: string
          term?: string | null
          usage_usd?: number
          webhook_token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_runs_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "lead_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_runs_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "lead_searches_view"
            referencedColumns: ["round_id"]
          },
          {
            foreignKeyName: "lead_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_search_members: {
        Row: {
          blanked_at: string | null
          class: string
          counted: boolean
          counted_month: string | null
          created_at: string
          distance_m: number | null
          excluded_by: string | null
          fit: string | null
          id: string
          judgment: Json
          kept_at: string | null
          kept_by: string | null
          lead_id: string
          reason: string
          round_id: string | null
          search_id: string
          tenant_id: string
          version: number
        }
        Insert: {
          blanked_at?: string | null
          class: string
          counted?: boolean
          counted_month?: string | null
          created_at?: string
          distance_m?: number | null
          excluded_by?: string | null
          fit?: string | null
          id?: string
          judgment?: Json
          kept_at?: string | null
          kept_by?: string | null
          lead_id: string
          reason?: string
          round_id?: string | null
          search_id: string
          tenant_id: string
          version?: number
        }
        Update: {
          blanked_at?: string | null
          class?: string
          counted?: boolean
          counted_month?: string | null
          created_at?: string
          distance_m?: number | null
          excluded_by?: string | null
          fit?: string | null
          id?: string
          judgment?: Json
          kept_at?: string | null
          kept_by?: string | null
          lead_id?: string
          reason?: string
          round_id?: string | null
          search_id?: string
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_search_members_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_search_members_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "lead_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_search_members_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "lead_searches_view"
            referencedColumns: ["round_id"]
          },
          {
            foreignKeyName: "lead_search_members_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "lead_searches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_search_members_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "lead_searches_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_search_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_searches: {
        Row: {
          asked: string
          card: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          plan: Json
          removed_at: string | null
          tenant_id: string
          thread_id: string | null
          via: string
        }
        Insert: {
          asked: string
          card: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          plan: Json
          removed_at?: string | null
          tenant_id: string
          thread_id?: string | null
          via: string
        }
        Update: {
          asked?: string
          card?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          plan?: Json
          removed_at?: string | null
          tenant_id?: string
          thread_id?: string | null
          via?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_searches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_searches_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ask_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_suggestions: {
        Row: {
          business_line: string
          by_owner: boolean
          items: Json
          made_at: string
          tenant_id: string
        }
        Insert: {
          business_line: string
          by_owner?: boolean
          items?: Json
          made_at?: string
          tenant_id: string
        }
        Update: {
          business_line?: string
          by_owner?: boolean
          items?: Json
          made_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_suggestions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_suppressions: {
        Row: {
          created_at: string
          hash: string
          id: string
          kind: string
          tenant_id: string
          what: string
        }
        Insert: {
          created_at?: string
          hash: string
          id?: string
          kind: string
          tenant_id: string
          what: string
        }
        Update: {
          created_at?: string
          hash?: string
          id?: string
          kind?: string
          tenant_id?: string
          what?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_suppressions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          about: string | null
          blanked_at: string | null
          business_name: string
          category: string | null
          city: string | null
          claimed: boolean | null
          closed_reason: string | null
          contact_id: string | null
          contacted_at: string | null
          converted_at: string | null
          country: string
          email: string | null
          email_alternates: Json
          email_checked_at: string | null
          email_state: string
          erased_at: string | null
          exported_at: string | null
          facebook_url: string | null
          found_at: string
          hours: Json
          id: string
          image_url: string | null
          instagram_url: string | null
          last_note: string | null
          last_outcome: string | null
          lat: number | null
          linkedin_url: string | null
          lng: number | null
          logo_url: string | null
          maps_url: string | null
          mark_path: string | null
          neighborhood: string | null
          phone_e164: string | null
          phone_sources: number
          phone_wrong: boolean
          place_id: string | null
          postal_code: string | null
          price: string | null
          rank: number | null
          rating: number | null
          region: string | null
          resume_at: string | null
          reviews: number | null
          reviews_dist: Json | null
          stage: string
          street: string | null
          tenant_id: string
          tiktok_url: string | null
          version: number
          website_host: string | null
        }
        Insert: {
          about?: string | null
          blanked_at?: string | null
          business_name?: string
          category?: string | null
          city?: string | null
          claimed?: boolean | null
          closed_reason?: string | null
          contact_id?: string | null
          contacted_at?: string | null
          converted_at?: string | null
          country?: string
          email?: string | null
          email_alternates?: Json
          email_checked_at?: string | null
          email_state?: string
          erased_at?: string | null
          exported_at?: string | null
          facebook_url?: string | null
          found_at?: string
          hours?: Json
          id?: string
          image_url?: string | null
          instagram_url?: string | null
          last_note?: string | null
          last_outcome?: string | null
          lat?: number | null
          linkedin_url?: string | null
          lng?: number | null
          logo_url?: string | null
          maps_url?: string | null
          mark_path?: string | null
          neighborhood?: string | null
          phone_e164?: string | null
          phone_sources?: number
          phone_wrong?: boolean
          place_id?: string | null
          postal_code?: string | null
          price?: string | null
          rank?: number | null
          rating?: number | null
          region?: string | null
          resume_at?: string | null
          reviews?: number | null
          reviews_dist?: Json | null
          stage?: string
          street?: string | null
          tenant_id: string
          tiktok_url?: string | null
          version?: number
          website_host?: string | null
        }
        Update: {
          about?: string | null
          blanked_at?: string | null
          business_name?: string
          category?: string | null
          city?: string | null
          claimed?: boolean | null
          closed_reason?: string | null
          contact_id?: string | null
          contacted_at?: string | null
          converted_at?: string | null
          country?: string
          email?: string | null
          email_alternates?: Json
          email_checked_at?: string | null
          email_state?: string
          erased_at?: string | null
          exported_at?: string | null
          facebook_url?: string | null
          found_at?: string
          hours?: Json
          id?: string
          image_url?: string | null
          instagram_url?: string | null
          last_note?: string | null
          last_outcome?: string | null
          lat?: number | null
          linkedin_url?: string | null
          lng?: number | null
          logo_url?: string | null
          maps_url?: string | null
          mark_path?: string | null
          neighborhood?: string | null
          phone_e164?: string | null
          phone_sources?: number
          phone_wrong?: boolean
          place_id?: string | null
          postal_code?: string | null
          price?: string | null
          rank?: number | null
          rating?: number | null
          region?: string | null
          resume_at?: string | null
          reviews?: number | null
          reviews_dist?: Json | null
          stage?: string
          street?: string | null
          tenant_id?: string
          tiktok_url?: string | null
          version?: number
          website_host?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lines: {
        Row: {
          a2p_profile_sid: string | null
          area_code: number | null
          brand_sid: string | null
          campaign_sid: string | null
          created_at: string
          credential_list_sid: string | null
          credentials_ref: string | null
          e164: string | null
          facts: Json
          forwarding_state: string
          id: string
          kind: string
          last_error: string | null
          messaging_service_sid: string | null
          number_sid: string | null
          port_state: string
          profile_sid: string | null
          provider: string
          reg_mock: boolean
          reg_sole_prop: boolean
          reg_step: string | null
          retell_agent_id: string | null
          sms_state: string
          state_since: string
          step: string | null
          subaccount_sid: string | null
          tenant_id: string
          termination_uri: string | null
          trunk_sid: string | null
          updated_at: string
          voice_state: string
          whatsapp_state: string
        }
        Insert: {
          a2p_profile_sid?: string | null
          area_code?: number | null
          brand_sid?: string | null
          campaign_sid?: string | null
          created_at?: string
          credential_list_sid?: string | null
          credentials_ref?: string | null
          e164?: string | null
          facts?: Json
          forwarding_state?: string
          id?: string
          kind?: string
          last_error?: string | null
          messaging_service_sid?: string | null
          number_sid?: string | null
          port_state?: string
          profile_sid?: string | null
          provider: string
          reg_mock?: boolean
          reg_sole_prop?: boolean
          reg_step?: string | null
          retell_agent_id?: string | null
          sms_state?: string
          state_since?: string
          step?: string | null
          subaccount_sid?: string | null
          tenant_id: string
          termination_uri?: string | null
          trunk_sid?: string | null
          updated_at?: string
          voice_state?: string
          whatsapp_state?: string
        }
        Update: {
          a2p_profile_sid?: string | null
          area_code?: number | null
          brand_sid?: string | null
          campaign_sid?: string | null
          created_at?: string
          credential_list_sid?: string | null
          credentials_ref?: string | null
          e164?: string | null
          facts?: Json
          forwarding_state?: string
          id?: string
          kind?: string
          last_error?: string | null
          messaging_service_sid?: string | null
          number_sid?: string | null
          port_state?: string
          profile_sid?: string | null
          provider?: string
          reg_mock?: boolean
          reg_sole_prop?: boolean
          reg_step?: string | null
          retell_agent_id?: string | null
          sms_state?: string
          state_since?: string
          step?: string | null
          subaccount_sid?: string | null
          tenant_id?: string
          termination_uri?: string | null
          trunk_sid?: string | null
          updated_at?: string
          voice_state?: string
          whatsapp_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mailboxes: {
        Row: {
          created_at: string
          from_name: string
          id: string
          last_error: string | null
          last_received_at: string | null
          local_part: string
          reply_mode: string
          reply_token: string
          reply_token_prev: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_name: string
          id?: string
          last_error?: string | null
          last_received_at?: string | null
          local_part: string
          reply_mode?: string
          reply_token: string
          reply_token_prev?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_name?: string
          id?: string
          last_error?: string | null
          last_received_at?: string | null
          local_part?: string
          reply_mode?: string
          reply_token?: string
          reply_token_prev?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailboxes_tenant_id_fkey"
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
          views: Json
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          tenant_id: string
          user_id: string
          views?: Json
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          tenant_id?: string
          user_id?: string
          views?: Json
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
      notification_marks: {
        Row: {
          dismissed_at: string | null
          notification_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          dismissed_at?: string | null
          notification_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          dismissed_at?: string | null
          notification_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_marks_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          seen_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          seen_at?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          seen_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          recipient_user_id: string | null
          route: string | null
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind: string
          recipient_user_id?: string | null
          route?: string | null
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          recipient_user_id?: string | null
          route?: string | null
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_pages: {
        Row: {
          alerted_at: string | null
          count: number
          first_at: string
          key: string
          last_at: string
        }
        Insert: {
          alerted_at?: string | null
          count?: number
          first_at?: string
          key: string
          last_at?: string
        }
        Update: {
          alerted_at?: string | null
          count?: number
          first_at?: string
          key?: string
          last_at?: string
        }
        Relationships: []
      }
      partner_earnings: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          earned_cents: number
          id: string
          kind: string
          paid_at: string
          partner_id: string
          payable_at: string
          payout_id: string | null
          share_bp: number
          state: string
          stripe_event_id: string
          stripe_invoice_id: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency: string
          earned_cents: number
          id?: string
          kind: string
          paid_at: string
          partner_id: string
          payable_at: string
          payout_id?: string | null
          share_bp: number
          state?: string
          stripe_event_id: string
          stripe_invoice_id: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          earned_cents?: number
          id?: string
          kind?: string
          paid_at?: string
          partner_id?: string
          payable_at?: string
          payout_id?: string | null
          share_bp?: number
          state?: string
          stripe_event_id?: string
          stripe_invoice_id?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_earnings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_earnings_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "partner_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_earnings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_payouts: {
        Row: {
          created_at: string
          currency: string
          earnings: number
          id: string
          partner_id: string
          period_end: string
          period_start: string
          reference: string
          sent_at: string
          sent_by: string | null
          total_cents: number
        }
        Insert: {
          created_at?: string
          currency: string
          earnings: number
          id?: string
          partner_id: string
          period_end: string
          period_start: string
          reference: string
          sent_at?: string
          sent_by?: string | null
          total_cents: number
        }
        Update: {
          created_at?: string
          currency?: string
          earnings?: number
          id?: string
          partner_id?: string
          period_end?: string
          period_start?: string
          reference?: string
          sent_at?: string
          sent_by?: string | null
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "partner_payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_reversals_waiting: {
        Row: {
          amount_cents: number
          created_at: string
          kind: string
          stripe_event_id: string
          stripe_invoice_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          kind: string
          stripe_event_id: string
          stripe_invoice_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          kind?: string
          stripe_event_id?: string
          stripe_invoice_id?: string
        }
        Relationships: []
      }
      partner_tenants: {
        Row: {
          attributed_at: string
          checks: Json
          code_used: string
          handover_accepted_at: string | null
          handover_accepted_by: string | null
          handover_declined_at: string | null
          handover_email: string | null
          handover_expires_at: string | null
          handover_sent_at: string | null
          origin: string
          partner_id: string
          seat_held_at: string | null
          standing: string | null
          standing_at: string | null
          standing_by: string | null
          standing_why: string | null
          tenant_id: string
        }
        Insert: {
          attributed_at?: string
          checks?: Json
          code_used: string
          handover_accepted_at?: string | null
          handover_accepted_by?: string | null
          handover_declined_at?: string | null
          handover_email?: string | null
          handover_expires_at?: string | null
          handover_sent_at?: string | null
          origin?: string
          partner_id: string
          seat_held_at?: string | null
          standing?: string | null
          standing_at?: string | null
          standing_by?: string | null
          standing_why?: string | null
          tenant_id: string
        }
        Update: {
          attributed_at?: string
          checks?: Json
          code_used?: string
          handover_accepted_at?: string | null
          handover_accepted_by?: string | null
          handover_declined_at?: string | null
          handover_email?: string | null
          handover_expires_at?: string | null
          handover_sent_at?: string | null
          origin?: string
          partner_id?: string
          seat_held_at?: string | null
          standing?: string | null
          standing_at?: string | null
          standing_by?: string | null
          standing_why?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_tenants_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          code: string
          created_at: string
          id: string
          letters: boolean
          payout_facts: Json
          second_factor_reset_at: string | null
          second_factor_reset_by: string | null
          second_factor_reset_why: string | null
          share_bp: number
          status: string
          status_at: string | null
          status_by: string | null
          status_why: string | null
          terms_accepted_at: string | null
          updated_at: string
          user_id: string | null
          written_through: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          letters?: boolean
          payout_facts?: Json
          second_factor_reset_at?: string | null
          second_factor_reset_by?: string | null
          second_factor_reset_why?: string | null
          share_bp?: number
          status?: string
          status_at?: string | null
          status_by?: string | null
          status_why?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
          user_id?: string | null
          written_through?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          letters?: boolean
          payout_facts?: Json
          second_factor_reset_at?: string | null
          second_factor_reset_by?: string | null
          second_factor_reset_why?: string | null
          share_bp?: number
          status?: string
          status_at?: string | null
          status_by?: string | null
          status_why?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
          user_id?: string | null
          written_through?: string
        }
        Relationships: []
      }
      person_notes: {
        Row: {
          author_kind: string
          author_user_id: string | null
          body: string
          contact_id: string
          created_at: string
          deal_id: string | null
          done_at: string | null
          done_by: string | null
          due_on: string | null
          for_user_id: string | null
          id: string
          kept_at: string | null
          kept_by: string | null
          source: string
          source_id: string | null
          state: string
          team_only: boolean
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          author_kind?: string
          author_user_id?: string | null
          body: string
          contact_id: string
          created_at?: string
          deal_id?: string | null
          done_at?: string | null
          done_by?: string | null
          due_on?: string | null
          for_user_id?: string | null
          id?: string
          kept_at?: string | null
          kept_by?: string | null
          source?: string
          source_id?: string | null
          state?: string
          team_only?: boolean
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          author_kind?: string
          author_user_id?: string | null
          body?: string
          contact_id?: string
          created_at?: string
          deal_id?: string | null
          done_at?: string | null
          done_by?: string | null
          due_on?: string | null
          for_user_id?: string | null
          id?: string
          kept_at?: string | null
          kept_by?: string | null
          source?: string
          source_id?: string | null
          state?: string
          team_only?: boolean
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "person_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_notes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_notes_tenant_id_fkey"
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
          after_days: number | null
          after_playbook_id: string | null
          cadence_days: number
          cap_per_run: number
          created_at: string
          created_by: string | null
          domain_ids: string[]
          gap_days: number
          gap_minutes: number | null
          id: string
          include_unconfirmed: boolean
          kind: string
          last_run_at: string | null
          last_run_for: string | null
          lead_search_id: string | null
          list_id: string | null
          list_key: string | null
          name: string
          params: Json
          policy_class: string
          run_hour: number
          signed_by: string | null
          state: string
          template_id: string
          template_language: string
          template_name: string
          tenant_id: string
          trigger: string
          updated_at: string
        }
        Insert: {
          after_days?: number | null
          after_playbook_id?: string | null
          cadence_days?: number
          cap_per_run?: number
          created_at?: string
          created_by?: string | null
          domain_ids?: string[]
          gap_days?: number
          gap_minutes?: number | null
          id?: string
          include_unconfirmed?: boolean
          kind?: string
          last_run_at?: string | null
          last_run_for?: string | null
          lead_search_id?: string | null
          list_id?: string | null
          list_key?: string | null
          name: string
          params?: Json
          policy_class: string
          run_hour?: number
          signed_by?: string | null
          state?: string
          template_id: string
          template_language: string
          template_name: string
          tenant_id: string
          trigger: string
          updated_at?: string
        }
        Update: {
          after_days?: number | null
          after_playbook_id?: string | null
          cadence_days?: number
          cap_per_run?: number
          created_at?: string
          created_by?: string | null
          domain_ids?: string[]
          gap_days?: number
          gap_minutes?: number | null
          id?: string
          include_unconfirmed?: boolean
          kind?: string
          last_run_at?: string | null
          last_run_for?: string | null
          lead_search_id?: string | null
          list_id?: string | null
          list_key?: string | null
          name?: string
          params?: Json
          policy_class?: string
          run_hour?: number
          signed_by?: string | null
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
            foreignKeyName: "playbooks_after_same_workspace"
            columns: ["tenant_id", "after_playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "playbooks_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbooks_search_same_workspace"
            columns: ["tenant_id", "lead_search_id"]
            isOneToOne: false
            referencedRelation: "lead_searches"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "playbooks_search_same_workspace"
            columns: ["tenant_id", "lead_search_id"]
            isOneToOne: false
            referencedRelation: "lead_searches_view"
            referencedColumns: ["tenant_id", "id"]
          },
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
      profiles: {
        Row: {
          display_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          display_name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          display_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_devices: {
        Row: {
          activity_token: string | null
          app_version: string | null
          created_at: string
          id: string
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          activity_token?: string | null
          app_version?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          activity_token?: string | null
          app_version?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_hits: {
        Row: {
          actor: string
          at: string
          bucket: string
        }
        Insert: {
          actor: string
          at?: string
          bucket: string
        }
        Update: {
          actor?: string
          at?: string
          bucket?: string
        }
        Relationships: []
      }
      reach_out_check_spend: {
        Row: {
          attempts: number
          day: string
          tenant_id: string
        }
        Insert: {
          attempts?: number
          day: string
          tenant_id: string
        }
        Update: {
          attempts?: number
          day?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reach_out_check_spend_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reach_out_sends: {
        Row: {
          angle: string | null
          attempts: number
          broadcast_id: string
          check_after: string | null
          check_first_at: string | null
          check_gen: number
          check_started_at: string | null
          check_tries: number
          checked_at: string | null
          checked_words: string | null
          claimed_at: string | null
          contact_id: string | null
          created_at: string
          domain_id: string | null
          facts_used: string[]
          hold_detail: string | null
          id: string
          included_for: string[]
          lead_id: string
          message_id: string | null
          opening: string | null
          playbook_id: string | null
          reason: string | null
          root_id: string
          send_at: string | null
          sent_at: string | null
          state: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          angle?: string | null
          attempts?: number
          broadcast_id: string
          check_after?: string | null
          check_first_at?: string | null
          check_gen?: number
          check_started_at?: string | null
          check_tries?: number
          checked_at?: string | null
          checked_words?: string | null
          claimed_at?: string | null
          contact_id?: string | null
          created_at?: string
          domain_id?: string | null
          facts_used?: string[]
          hold_detail?: string | null
          id: string
          included_for?: string[]
          lead_id: string
          message_id?: string | null
          opening?: string | null
          playbook_id?: string | null
          reason?: string | null
          root_id: string
          send_at?: string | null
          sent_at?: string | null
          state?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          angle?: string | null
          attempts?: number
          broadcast_id?: string
          check_after?: string | null
          check_first_at?: string | null
          check_gen?: number
          check_started_at?: string | null
          check_tries?: number
          checked_at?: string | null
          checked_words?: string | null
          claimed_at?: string | null
          contact_id?: string | null
          created_at?: string
          domain_id?: string | null
          facts_used?: string[]
          hold_detail?: string | null
          id?: string
          included_for?: string[]
          lead_id?: string
          message_id?: string | null
          opening?: string | null
          playbook_id?: string | null
          reason?: string | null
          root_id?: string
          send_at?: string | null
          sent_at?: string | null
          state?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reach_out_sends_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_out_sends_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_out_sends_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "sending_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_out_sends_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_out_sends_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_out_sends_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_out_sends_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reach_out_sends_tenant_id_fkey"
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
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          rule: Json | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          rule?: Json | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          rule?: Json | null
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
      sending_domains: {
        Row: {
          bounced_recent: number | null
          checked_at: string | null
          clean_since: string | null
          complaints: number | null
          counted_since: string | null
          created_at: string
          created_by: string | null
          dmarc: string | null
          from_local: string
          from_name: string
          held_at: string | null
          held_why: string | null
          host: string
          id: string
          provider_domain_id: string | null
          provider_status: string | null
          records: Json
          resume_by: string
          sent_days: number | null
          sent_recent: number | null
          state: string
          tenant_id: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          bounced_recent?: number | null
          checked_at?: string | null
          clean_since?: string | null
          complaints?: number | null
          counted_since?: string | null
          created_at?: string
          created_by?: string | null
          dmarc?: string | null
          from_local: string
          from_name: string
          held_at?: string | null
          held_why?: string | null
          host: string
          id?: string
          provider_domain_id?: string | null
          provider_status?: string | null
          records?: Json
          resume_by?: string
          sent_days?: number | null
          sent_recent?: number | null
          state?: string
          tenant_id: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          bounced_recent?: number | null
          checked_at?: string | null
          clean_since?: string | null
          complaints?: number | null
          counted_since?: string | null
          created_at?: string
          created_by?: string | null
          dmarc?: string | null
          from_local?: string
          from_name?: string
          held_at?: string | null
          held_why?: string | null
          host?: string
          id?: string
          provider_domain_id?: string | null
          provider_status?: string | null
          records?: Json
          resume_by?: string
          sent_days?: number | null
          sent_recent?: number | null
          state?: string
          tenant_id?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sending_domains_tenant_id_fkey"
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
          backlog_ticks: number
          jobname: string | null
          judged_by: string
          max_silence: string | null
          note: string | null
          registered_at: string
          request_id: number | null
          requested_at: string | null
          sweep: string
        }
        Insert: {
          alerted_at?: string | null
          backlog_ticks?: number
          jobname?: string | null
          judged_by?: string
          max_silence?: string | null
          note?: string | null
          registered_at?: string
          request_id?: number | null
          requested_at?: string | null
          sweep: string
        }
        Update: {
          alerted_at?: string | null
          backlog_ticks?: number
          jobname?: string | null
          judged_by?: string
          max_silence?: string | null
          note?: string | null
          registered_at?: string
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
          calendar_checked_at: string | null
          config: Json
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          calendar_checked_at?: string | null
          config?: Json
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          calendar_checked_at?: string | null
          config?: Json
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
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
          sells_by: string | null
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
          sells_by?: string | null
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
          sells_by?: string | null
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          business: string | null
          created_at: string
          email: string
          id: string
          invited_at: string | null
          invited_by: string | null
          source: string | null
        }
        Insert: {
          business?: string | null
          created_at?: string
          email: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          source?: string | null
        }
        Update: {
          business?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          source?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      lead_searches_view: {
        Row: {
          answered: string | null
          asked: string | null
          card: string | null
          cost_usd: number | null
          counted: number | null
          created_at: string | null
          created_by: string | null
          emails_checked: number | null
          ended_at: string | null
          ending: string | null
          ending_pending: string | null
          excluded: number | null
          id: string | null
          judge_tokens: number | null
          long: number | null
          look: number | null
          name: string | null
          nearby: Json | null
          plan: Json | null
          plan_version: number | null
          purpose: string | null
          qualified: number | null
          question: Json | null
          removed_at: string | null
          review: number | null
          round_id: string | null
          seq: number | null
          state: string | null
          strong: number | null
          target: number | null
          tenant_id: string | null
          thread_id: string | null
          undo_op_id: string | null
          undo_version: number | null
          via: string | null
          waiting_since: string | null
          with_phone: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_searches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_searches_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ask_threads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      billing_card_mark: {
        Args: { p_fingerprint: string; p_tenant_id: string }
        Returns: undefined
      }
      call_status_rank: { Args: { p_status: string }; Returns: number }
      caller_has_permission: {
        Args: { p_permission: string; p_tenant_id: string }
        Returns: boolean
      }
      campaign_series: {
        Args: { p_days?: number; p_tenant_id: string }
        Returns: Json
      }
      claim_conversation_control: {
        Args: {
          p_by: string
          p_conversation_id: string
          p_kind: string
          p_ref: string
          p_seconds: number
          p_tenant_id: string
        }
        Returns: string
      }
      claim_due_jobs: {
        Args: { p_lease_seconds: number; p_limit: number }
        Returns: {
          attempts: number
          created_at: string
          due_at: string
          fired_at: string | null
          id: string
          kind: string
          last_error: string | null
          lease_until: string | null
          payload: Json
          state: string
          tenant_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cold_receipts_owed: {
        Args: { p_from: string; p_to: string }
        Returns: {
          host: string
          sent: number
          tenant_id: string
          unanswered: number
        }[]
      }
      create_mailbox: {
        Args: { p_from_name: string; p_local_part: string; p_tenant_id: string }
        Returns: Json
      }
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
        Args: { p_name: string; p_partner_code?: string; p_timezone?: string }
        Returns: {
          id: string
          locale: string
          name: string
          slug: string
          status: string
          timezone: string
        }[]
      }
      create_workspace_for: {
        Args: {
          p_name: string
          p_partner_code?: string
          p_timezone?: string
          p_user: string
        }
        Returns: {
          id: string
          locale: string
          name: string
          slug: string
          status: string
          timezone: string
        }[]
      }
      create_workspace_for_business: {
        Args: { p_name: string; p_owner_email: string; p_timezone: string }
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
      deal_record: {
        Args: {
          p_amount_cents?: number
          p_clear?: string[]
          p_contact_id: string
          p_deal_id?: string
          p_evidence?: Json
          p_lost_reason?: string
          p_note?: string
          p_per?: string
          p_proposal_url?: string
          p_service?: string
          p_stage: string
          p_valid_until?: string
          p_version?: number
          p_when?: string
        }
        Returns: Json
      }
      delete_my_account: { Args: never; Returns: Json }
      drop_google_credentials: {
        Args: { p_tenant_id: string }
        Returns: boolean
      }
      email_from_host: { Args: { p_meta: Json }; Returns: string }
      email_left: {
        Args: { p_error: Json; p_status: string }
        Returns: boolean
      }
      email_sent_at: {
        Args: {
          p_created_at: string
          p_meta: Json
          p_status_updated_at: string
        }
        Returns: string
      }
      ensure_events_partition: { Args: { p_month: string }; Returns: undefined }
      erase_contact: {
        Args: { p_contact_id: string; p_legs?: Json }
        Returns: Json
      }
      erase_marketing_consent: {
        Args: { p_contact_id: string }
        Returns: undefined
      }
      expire_stale_pauses: { Args: never; Returns: number }
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
      get_google_credentials: { Args: { p_tenant_id: string }; Returns: Json }
      get_line_credentials: { Args: { p_line_id: string }; Returns: Json }
      handover_accept: {
        Args: { p_tenant: string }
        Returns: {
          id: string
          name: string
          slug: string
        }[]
      }
      handover_decline: { Args: { p_tenant: string }; Returns: undefined }
      handovers_mine: {
        Args: never
        Returns: {
          expires_at: string
          partner_code: string
          tenant_id: string
          workspace: string
        }[]
      }
      has_permission: {
        Args: { p_permission: string; p_tenant_id: string; p_user: string }
        Returns: boolean
      }
      import_person: {
        Args: {
          p_email: string
          p_email_digest?: string
          p_name: string
          p_phone_digest?: string
          p_phone_e164: string
          p_tenant_id: string
        }
        Returns: Json
      }
      ingest_call: {
        Args: {
          p_agent_id: string
          p_analysis?: Json
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
      is_platform_admin: { Args: never; Returns: boolean }
      is_workspace_owner: { Args: { p_tenant: string }; Returns: boolean }
      jobs_backlog: { Args: { p_wait?: string }; Returns: number }
      lead_address_suppressed: {
        Args: { p_address: string; p_tenant_id: string }
        Returns: boolean
      }
      lead_addresses_suppressed: {
        Args: { p_addresses: string[]; p_tenant_id: string }
        Returns: string[]
      }
      lead_blank: { Args: { p_lead_id: string }; Returns: number }
      lead_bulk: {
        Args: {
          p_action: string
          p_ids?: string[]
          p_search_id?: string
          p_tenant_id: string
          p_view?: Json
        }
        Returns: Json
      }
      lead_check_again: {
        Args: { p_lead_ids: string[]; p_tenant_id: string }
        Returns: Json
      }
      lead_check_commit: {
        Args: {
          p_last: boolean
          p_results: Json
          p_round_id: string
          p_run_id: string
          p_usage_usd: number
        }
        Returns: Json
      }
      lead_collect_commit: {
        Args: {
          p_from_offset: number
          p_gen: number
          p_owner: string
          p_page: Json
          p_run_id: string
          p_to_offset: number
        }
        Returns: Json
      }
      lead_convert_by: {
        Args: {
          p_any_stage?: boolean
          p_data?: Json
          p_how: string
          p_lead_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      lead_counter_take: {
        Args: { p_kind: string; p_period: string; p_tenant_id: string }
        Returns: {
          id: string
          kind: string
          period: string
          reserved: number
          tenant_id: string | null
          updated_at: string
          used: number
        }
        SetofOptions: {
          from: "*"
          to: "lead_counters"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      lead_day: {
        Args: { p_at?: string; p_tenant_id: string }
        Returns: string
      }
      lead_erase: { Args: { p_lead_id: string }; Returns: Json }
      lead_export_mark: {
        Args: { p_ids: string[]; p_tenant_id: string }
        Returns: number
      }
      lead_in_list: {
        Args: { p_closed_reason: string; p_list: string; p_stage: string }
        Returns: boolean
      }
      lead_list_counts: { Args: { p_tenant_id: string }; Returns: Json }
      lead_member_exclude: {
        Args: { p_lead_id: string; p_search_id: string }
        Returns: Json
      }
      lead_member_keep: {
        Args: { p_lead_id: string; p_search_id: string }
        Returns: Json
      }
      lead_member_move: {
        Args: { p_kind: string; p_lead_id: string; p_search_id: string }
        Returns: Json
      }
      lead_member_of: {
        Args: { p_lead_id: string; p_search_id?: string; p_tenant_id: string }
        Returns: Json
      }
      lead_member_put_back: {
        Args: { p_lead_id: string; p_search_id: string }
        Returns: Json
      }
      lead_member_shown: {
        Args: { p_class: string; p_counted: boolean }
        Returns: boolean
      }
      lead_month: {
        Args: { p_at?: string; p_tenant_id: string }
        Returns: string
      }
      lead_month_used: {
        Args: { p_period: string; p_tenant_id: string }
        Returns: Json
      }
      lead_name_key: { Args: { p_name: string }; Returns: string }
      lead_niche_prior: { Args: { p_category_key: string }; Returns: Json }
      lead_plan_check: { Args: { p_plan: Json }; Returns: undefined }
      lead_release: {
        Args: {
          p_day: string
          p_leads: number
          p_month: string
          p_platform_day: string
          p_tenant_id: string
          p_usd: number
        }
        Returns: undefined
      }
      lead_renews_on: { Args: { p_tenant_id: string }; Returns: string }
      lead_reserve: {
        Args: {
          p_day: string
          p_leads: number
          p_month: string
          p_platform_day: string
          p_tenant_id: string
          p_usd: number
        }
        Returns: Json
      }
      lead_round_answer: {
        Args: { p_answer: string; p_plan?: Json; p_round_id: string }
        Returns: Json
      }
      lead_round_end: {
        Args: { p_ending: string; p_round_id: string }
        Returns: boolean
      }
      lead_round_rejudge: {
        Args: {
          p_judgment?: Json
          p_places: Json
          p_plan_version: number
          p_round_id: string
        }
        Returns: Json
      }
      lead_round_stop: { Args: { p_search_id: string }; Returns: Json }
      lead_run_claim: {
        Args: { p_owner: string; p_run_id: string }
        Returns: boolean
      }
      lead_run_lease: {
        Args: { p_owner: string; p_run_id: string; p_seconds: number }
        Returns: number
      }
      lead_run_mark_unknown: {
        Args: { p_owner: string; p_run_id: string }
        Returns: boolean
      }
      lead_run_reconcile: {
        Args: {
          p_apify_run_id: string
          p_dataset_id: string
          p_run_id: string
          p_state: string
        }
        Returns: boolean
      }
      lead_run_record_start: {
        Args: {
          p_apify_run_id: string
          p_cap_usd: number
          p_dataset_id: string
          p_owner: string
          p_run_id: string
        }
        Returns: boolean
      }
      lead_run_release: {
        Args: { p_gen: number; p_owner: string; p_run_id: string }
        Returns: boolean
      }
      lead_search_create: {
        Args: {
          p_estimate_usd: number
          p_plan: Json
          p_tenant_id: string
          p_thread_id?: string
          p_via: string
        }
        Returns: Json
      }
      lead_search_more: {
        Args: {
          p_estimate_usd: number
          p_plan: Json
          p_purpose: string
          p_search_id: string
        }
        Returns: Json
      }
      lead_search_remove: { Args: { p_search_id: string }; Returns: Json }
      lead_search_rename: {
        Args: { p_name: string; p_search_id: string }
        Returns: Json
      }
      lead_search_undo: { Args: { p_search_id: string }; Returns: Json }
      lead_searches_on: { Args: { p_tenant_id: string }; Returns: boolean }
      lead_set_stage: {
        Args: {
          p_fit_reason?: string
          p_lead_id: string
          p_note?: string
          p_outcome?: string
          p_reason?: string
          p_stage?: string
        }
        Returns: Json
      }
      lead_settle_usage: {
        Args: {
          p_day: string
          p_delta: number
          p_month: string
          p_outstanding: number
          p_platform_day: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      lead_site_key: { Args: { p_host: string }; Returns: string }
      lead_suppression_hash: {
        Args: { p_tenant_id: string; p_value: string }
        Returns: string
      }
      lead_undo: { Args: { p_op_id: string; p_version: number }; Returns: Json }
      leads_page: {
        Args: {
          p_after_id?: string
          p_after_key?: string
          p_class?: string
          p_dir?: string
          p_limit?: number
          p_list?: string
          p_search_id?: string
          p_sort?: string
          p_tenant_id: string
        }
        Returns: {
          about: string
          business_name: string
          category: string
          city: string
          claimed: boolean
          class: string
          closed_reason: string
          contact_id: string
          contacted_at: string
          converted_at: string
          counted: boolean
          counted_month: string
          distance_m: number
          email: string
          email_alternates: Json
          email_checked_at: string
          email_state: string
          excluded_by: string
          exported_at: string
          facebook_url: string
          fit: string
          found_at: string
          hours: Json
          image_url: string
          instagram_url: string
          judgment: Json
          last_note: string
          last_outcome: string
          lat: number
          lead_id: string
          linkedin_url: string
          lng: number
          maps_url: string
          mark_path: string
          member_id: string
          neighborhood: string
          page_key: string
          phone_e164: string
          phone_sources: number
          phone_wrong: boolean
          place_id: string
          places: number
          postal_code: string
          price: string
          rank: number
          rating: number
          reason: string
          region: string
          reviews: number
          reviews_dist: Json
          round_id: string
          search_id: string
          shares: Json
          sort_key: string
          stage: string
          street: string
          tiktok_url: string
          version: number
          website_host: string
        }[]
      }
      line_forwarding_set: {
        Args: {
          p_carrier: string
          p_mode: string
          p_number: string
          p_tenant_id: string
          p_test_from: string
        }
        Returns: string
      }
      line_forwarding_test: {
        Args: { p_line_id: string; p_tenant_id: string }
        Returns: Json
      }
      lookup_user_for_invite: {
        Args: { p_email: string; p_tenant_id: string }
        Returns: string
      }
      mark_processed: {
        Args: { p_message_id: string; p_tenant_id: string }
        Returns: undefined
      }
      member_view_set: {
        Args: { p_page: string; p_tenant_id: string; p_view: Json }
        Returns: Json
      }
      metrics_summary: {
        Args: { p_days?: number; p_tenant_id: string }
        Returns: Json
      }
      mint_reply_token: { Args: never; Returns: string }
      note_candidates: {
        Args: { p_limit?: number }
        Returns: {
          contact_id: string
          dnc: boolean
          known: Json
          last_suggested: string
          seconds: number
          source: string
          source_id: string
          tenant_id: string
          turns: Json
          workspace_today: number
        }[]
      }
      note_for_you_notify: {
        Args: {
          p_by: string
          p_contact_id: string
          p_for: string
          p_note_id: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      note_sweep_backlog: {
        Args: { p_remaining: number; p_sweep: string }
        Returns: number
      }
      notification_mark: {
        Args: { p_dismissed?: boolean; p_id: string; p_read?: boolean }
        Returns: Json
      }
      notifications_seen: { Args: { p_tenant_id: string }; Returns: Json }
      number_drift: {
        Args: never
        Returns: {
          detail: string
          kind: string
          tenant_id: string
        }[]
      }
      outreach_facts: {
        Args: {
          p_contact_id: string
          p_host: string
          p_lead_id?: string
          p_since: string
          p_tenant_id: string
          p_to: string
        }
        Returns: Json
      }
      outreach_lead_facts: {
        Args: {
          p_contact_id: string
          p_lead_id?: string
          p_tenant_id: string
          p_to: string
        }
        Returns: Json
      }
      outreach_wrote_back: {
        Args: { p_contact_ids: string[]; p_tenant_id: string }
        Returns: string[]
      }
      partner_balance: {
        Args: never
        Returns: {
          currency: string
          earned_cents: number
          next_payable_at: string
          state: string
        }[]
      }
      partner_become: { Args: { p_code: string }; Returns: Json }
      partner_earn: {
        Args: {
          p_amount_cents: number
          p_currency: string
          p_event_id: string
          p_invoice_id: string
          p_paid_at: string
          p_tenant_id: string
        }
        Returns: Json
      }
      partner_earnings_sweep: { Args: { p_now?: string }; Returns: Json }
      partner_handover_resend: {
        Args: { p_email: string; p_tenant: string }
        Returns: Json
      }
      partner_letter_written: {
        Args: { p_partner: string; p_through: string }
        Returns: boolean
      }
      partner_letters_due: {
        Args: { p_now?: string }
        Returns: {
          code: string
          email: string
          news: Json
          partner_id: string
          since: string
          status: string
          through: string
        }[]
      }
      partner_letters_set: { Args: { p_on: boolean }; Returns: boolean }
      partner_overview: {
        Args: never
        Returns: {
          billing_mode: string
          billing_status: string
          created_at: string
          current_period_end: string
          last_inbound_at: string
          line_e164: string
          line_error: string
          line_kind: string
          members: number
          name: string
          reg_mock: boolean
          reg_sole_prop: boolean
          reg_step: string
          slug: string
          sms_state: string
          status: string
          tenant_id: string
          timezone: string
          trial_end: string
          voice_active: boolean
          voice_number: string
          voice_state: string
          whatsapp_active: boolean
          whatsapp_number: string
        }[]
      }
      partner_payout_mark: {
        Args: {
          p_currency: string
          p_expected_cents?: number
          p_partner: string
          p_reference: string
        }
        Returns: Json
      }
      partner_reverse: {
        Args: {
          p_amount_cents: number
          p_event_id: string
          p_invoice_id: string
          p_kind: string
        }
        Returns: Json
      }
      partner_second_factor_reset: {
        Args: { p_partner: string; p_why: string }
        Returns: string
      }
      partner_standing_set: {
        Args: { p_standing: string; p_tenant: string; p_why: string }
        Returns: Json
      }
      partner_status_set: {
        Args: { p_partner: string; p_status: string; p_why: string }
        Returns: Json
      }
      partner_workspace_money: {
        Args: never
        Returns: {
          currency: string
          held_cents: number
          month_cents: number
          name: string
          on_team: boolean
          paid_cents: number
          payable_cents: number
          standing: string
          tenant_id: string
        }[]
      }
      people_list: {
        Args: {
          p_contact_id?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_tenant_id: string
        }
        Returns: {
          call_count: number
          call_seconds: number
          came_from: string
          channels: string[]
          consent: string
          consent_source: string
          consent_updated_at: string
          conversation_count: number
          deal_amount_cents: number
          deal_decided_at: string
          deal_ended_at: string
          deal_id: string
          deal_lost_reason: string
          deal_per: string
          deal_proposal_url: string
          deal_proposed_at: string
          deal_service: string
          deal_stage: string
          deal_valid_until: string
          display_name: string
          dnc: boolean
          earliest_row_at: string
          email: string
          escalation_count: number
          first_contact_at: string
          has_backfill: boolean
          has_chat: boolean
          id: string
          last_call_at: string
          last_inbound_at: string
          last_inbound_call_at: string
          last_inbound_call_summary: string
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
          marketing_consent: string
          marketing_consent_source: string
          marketing_consent_updated_at: string
          message_channels: string[]
          needs_human: boolean
          open_escalation_reason: string
          open_escalation_since: string
          phone_e164: string
          queued_reply_at: string
          step_body: string
          step_deal_id: string
          step_due_on: string
          step_for_user_id: string
          step_id: string
          wa_profile_name: string
        }[]
      }
      person_note_add: {
        Args: {
          p_body: string
          p_contact_id: string
          p_deal_id?: string
          p_due_on?: string
          p_for_user_id?: string
          p_source?: string
          p_team_only?: boolean
        }
        Returns: Json
      }
      person_note_decide: {
        Args: {
          p_body?: string
          p_keep: boolean
          p_note_id: string
          p_team_only?: boolean
        }
        Returns: Json
      }
      person_note_done: {
        Args: { p_done?: boolean; p_note_id: string; p_version?: number }
        Returns: Json
      }
      person_note_edit: {
        Args: {
          p_body: string
          p_clear_due?: boolean
          p_deal_id?: string
          p_due_on?: string
          p_for_user_id?: string
          p_note_id: string
          p_team_only?: boolean
          p_version?: number
        }
        Returns: Json
      }
      person_note_remove: { Args: { p_note_id: string }; Returns: Json }
      person_note_suggest: {
        Args: {
          p_body: string
          p_contact_id: string
          p_source: string
          p_source_id?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      person_step_from_playbook: {
        Args: {
          p_contact_id: string
          p_due_on: string
          p_for_user_id?: string
          p_source_id?: string
          p_tenant_id: string
          p_words: string
        }
        Returns: Json
      }
      platform_admin_add: { Args: { p_email: string }; Returns: string }
      platform_overview: {
        Args: never
        Returns: {
          billing_mode: string
          billing_status: string
          created_at: string
          current_period_end: string
          last_inbound_at: string
          line_e164: string
          line_error: string
          line_kind: string
          members: number
          name: string
          reg_mock: boolean
          reg_sole_prop: boolean
          reg_step: string
          slug: string
          sms_state: string
          status: string
          tenant_id: string
          timezone: string
          trial_end: string
          voice_active: boolean
          voice_number: string
          voice_state: string
          whatsapp_active: boolean
          whatsapp_number: string
        }[]
      }
      platform_overview_rows: {
        Args: never
        Returns: {
          billing_mode: string
          billing_status: string
          created_at: string
          current_period_end: string
          last_inbound_at: string
          line_e164: string
          line_error: string
          line_kind: string
          members: number
          name: string
          reg_mock: boolean
          reg_sole_prop: boolean
          reg_step: string
          slug: string
          sms_state: string
          status: string
          tenant_id: string
          timezone: string
          trial_end: string
          voice_active: boolean
          voice_number: string
          voice_state: string
          whatsapp_active: boolean
          whatsapp_number: string
        }[]
      }
      platform_overview_rows_for: {
        Args: { p_tenants: string[] }
        Returns: {
          billing_mode: string
          billing_status: string
          created_at: string
          current_period_end: string
          last_inbound_at: string
          line_e164: string
          line_error: string
          line_kind: string
          members: number
          name: string
          reg_mock: boolean
          reg_sole_prop: boolean
          reg_step: string
          slug: string
          sms_state: string
          status: string
          tenant_id: string
          timezone: string
          trial_end: string
          voice_active: boolean
          voice_number: string
          voice_state: string
          whatsapp_active: boolean
          whatsapp_number: string
        }[]
      }
      platform_partner_balances: {
        Args: never
        Returns: {
          code: string
          currency: string
          email: string
          held_cents: number
          joined_at: string
          last_paid_at: string
          paid_cents: number
          partner_id: string
          payable_cents: number
          share_bp: number
          status: string
          under_review: number
          workspaces: number
        }[]
      }
      platform_partner_workspaces: {
        Args: never
        Returns: {
          attributed_at: string
          checks: Json
          code: string
          decided_by: string
          partner_id: string
          standing: string
          standing_at: string
          standing_why: string
          tenant_id: string
        }[]
      }
      profile_set: { Args: { p_display_name: string }; Returns: Json }
      provision_tenant: { Args: { p_tenant_id: string }; Returns: undefined }
      purge_ask: { Args: { p_keep?: string }; Returns: number }
      purge_cron_history: {
        Args: {
          p_keep?: string
          p_keep_frequent?: string
          p_keep_per_job?: number
        }
        Returns: number
      }
      purge_events: { Args: { p_keep?: string }; Returns: number }
      purge_jobs: {
        Args: { p_failed?: string; p_finished?: string }
        Returns: number
      }
      purge_leads: { Args: never; Returns: number }
      purge_notifications: { Args: { p_keep?: string }; Returns: number }
      push_device_forget: { Args: { p_token: string }; Returns: Json }
      push_device_register: {
        Args: {
          p_activity_token?: string
          p_app_version?: string
          p_platform: string
          p_token: string
        }
        Returns: Json
      }
      put_channel_credentials: {
        Args: { p_channel_id: string; p_secret: Json }
        Returns: string
      }
      put_google_credentials: {
        Args: { p_secret: Json; p_tenant_id: string }
        Returns: string
      }
      put_line_credentials: {
        Args: { p_line_id: string; p_secret: Json }
        Returns: string
      }
      reach_out_audience:
        | {
            Args: {
              p_include_unconfirmed?: boolean
              p_limit: number
              p_search_id: string
              p_tenant_id: string
            }
            Returns: {
              business_name: string
              city: string
              email: string
              hours: Json
              lead_id: string
              region: string
            }[]
          }
        | {
            Args: {
              p_limit: number
              p_root_id: string
              p_search_id: string
              p_tenant_id: string
            }
            Returns: {
              business_name: string
              city: string
              email: string
              hours: Json
              lead_id: string
              region: string
            }[]
          }
      reach_out_chain_report: {
        Args: { p_root_id: string; p_tenant_id: string }
        Returns: Json
      }
      reach_out_check_take: {
        Args: { p_at?: string; p_cap: number; p_tenant_id: string }
        Returns: boolean
      }
      reach_out_claim: {
        Args: {
          p_at: string
          p_cap: number
          p_domain_id: string
          p_limit: number
        }
        Returns: {
          angle: string | null
          attempts: number
          broadcast_id: string
          check_after: string | null
          check_first_at: string | null
          check_gen: number
          check_started_at: string | null
          check_tries: number
          checked_at: string | null
          checked_words: string | null
          claimed_at: string | null
          contact_id: string | null
          created_at: string
          domain_id: string | null
          facts_used: string[]
          hold_detail: string | null
          id: string
          included_for: string[]
          lead_id: string
          message_id: string | null
          opening: string | null
          playbook_id: string | null
          reason: string | null
          root_id: string
          send_at: string | null
          sent_at: string | null
          state: string
          tenant_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "reach_out_sends"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reach_out_closed_sends: {
        Args: { p_limit: number; p_stuck_before: string; p_tenant_id?: string }
        Returns: {
          email_status: string
          send: Json
        }[]
      }
      reach_out_due_domains: {
        Args: {
          p_at: string
          p_limit: number
          p_skip_domains?: string[]
          p_skip_tenants?: string[]
          p_tenant_id?: string
        }
        Returns: {
          id: string
          tenant_id: string
        }[]
      }
      reach_out_finishable: {
        Args: { p_limit: number; p_tenant_id?: string }
        Returns: string[]
      }
      reach_out_followers: {
        Args: {
          p_after_days: number
          p_limit: number
          p_parent_id: string
          p_step_id: string
          p_tenant_id: string
        }
        Returns: {
          bounced: boolean
          contact_id: string
          email: string
          facts: Json
          hours: Json
          lead_id: string
          parent_message_id: string
          region: string
        }[]
      }
      reach_out_given_up: { Args: { p_created_at: string }; Returns: boolean }
      reach_out_held_stale: {
        Args: { p_before: string; p_limit: number; p_tenant_id?: string }
        Returns: {
          angle: string | null
          attempts: number
          broadcast_id: string
          check_after: string | null
          check_first_at: string | null
          check_gen: number
          check_started_at: string | null
          check_tries: number
          checked_at: string | null
          checked_words: string | null
          claimed_at: string | null
          contact_id: string | null
          created_at: string
          domain_id: string | null
          facts_used: string[]
          hold_detail: string | null
          id: string
          included_for: string[]
          lead_id: string
          message_id: string | null
          opening: string | null
          playbook_id: string | null
          reason: string | null
          root_id: string
          send_at: string | null
          sent_at: string | null
          state: string
          tenant_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "reach_out_sends"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reach_out_month_sent: {
        Args: { p_at: string; p_tenant_id: string }
        Returns: number
      }
      reach_out_person: {
        Args: { p_lead_id: string; p_tenant_id: string }
        Returns: Json
      }
      reach_out_plan_run: {
        Args: { p_run: Json; p_sends: Json }
        Returns: Json
      }
      reach_out_queued_outcomes: {
        Args: { p_limit: number; p_tenant_id?: string }
        Returns: {
          error: Json
          send: Json
          sent_at: string
          status: string
          written_at: string
        }[]
      }
      reach_out_reach: {
        Args: { p_search_id: string; p_tenant_id: string }
        Returns: Json
      }
      reach_out_recheck: {
        Args: {
          p_from_state?: string
          p_send_ids: string[]
          p_tenant_id?: string
        }
        Returns: number
      }
      reach_out_record: {
        Args: { p_lead_id: string; p_search_id: string; p_tenant_id: string }
        Returns: {
          about: string
          business_name: string
          category: string
          city: string
          email: string
          email_domain_shared: boolean
          hours: Json
          name_listings: number
          rating: number
          region: string
          reviews: number
          site_listings: number
          website_host: string
          what_you_asked: string
          why_it_fits: string
        }[]
      }
      reach_out_release_unavailable: {
        Args: { p_before: string; p_tenant_id?: string }
        Returns: number
      }
      reach_out_remove: {
        Args: { p_root_id: string; p_tenant_id: string }
        Returns: Json
      }
      reach_out_run_recheck: { Args: { p_broadcast_id: string }; Returns: Json }
      reach_out_save: {
        Args: { p_chain: Json; p_tenant_id: string; p_user_id: string }
        Returns: Json
      }
      reach_out_send_decide: {
        Args: { p_decision: string; p_send_id: string }
        Returns: Json
      }
      reach_out_stale_sends: {
        Args: { p_before: string; p_limit: number; p_tenant_id?: string }
        Returns: {
          angle: string | null
          attempts: number
          broadcast_id: string
          check_after: string | null
          check_first_at: string | null
          check_gen: number
          check_started_at: string | null
          check_tries: number
          checked_at: string | null
          checked_words: string | null
          claimed_at: string | null
          contact_id: string | null
          created_at: string
          domain_id: string | null
          facts_used: string[]
          hold_detail: string | null
          id: string
          included_for: string[]
          lead_id: string
          message_id: string | null
          opening: string | null
          playbook_id: string | null
          reason: string | null
          root_id: string
          send_at: string | null
          sent_at: string | null
          state: string
          tenant_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "reach_out_sends"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reach_out_unchecked: {
        Args: {
          p_ahead_minutes: number
          p_limit: number
          p_per_workspace: number
          p_tenant_id?: string
        }
        Returns: {
          about: string
          business_name: string
          category: string
          check_gen: number
          city: string
          email: string
          email_domain_shared: boolean
          hours: Json
          included_for: string[]
          name_listings: number
          rating: number
          region: string
          reviews: number
          send: Json
          signed_by: string
          site_listings: number
          template_id: string
          template_language: string
          website_host: string
          what_you_asked: string
          why_it_fits: string
        }[]
      }
      release_conversation_control: {
        Args: {
          p_by: string
          p_conversation_id: string
          p_kind: string
          p_ref: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      rename_mailbox: {
        Args: { p_from_name: string; p_mailbox_id: string }
        Returns: Json
      }
      report_series: {
        Args: { p_days?: number; p_tenant_id: string }
        Returns: Json
      }
      request_sweep: {
        Args: { p_path: string; p_sweep: string; p_timeout_ms?: number }
        Returns: number
      }
      runtime_stamp: { Args: { p_tenant_id: string }; Returns: string }
      scrub_ask_for_contact: {
        Args: { p_contact_id: string; p_needles: string[]; p_tenant_id: string }
        Returns: number
      }
      scrub_call_raw: { Args: { p_raw: Json }; Returns: Json }
      scrub_contact_events: {
        Args: { p_contact_id: string; p_tenant_id: string }
        Returns: number
      }
      search_messages: {
        Args: {
          p_limit: number
          p_since: string
          p_tenant: string
          p_words: string
        }
        Returns: {
          at: string
          channel: string
          contact_id: string
          conversation_id: string
          direction: string
          id: string
          kind: string
          snippet: string
        }[]
      }
      sending_domain_capacity: {
        Args: { p_at: string; p_domain_id: string }
        Returns: Json
      }
      sending_domain_counts: {
        Args: { p_host: string; p_since: string; p_tenant_id: string }
        Returns: Json
      }
      session_shows_second_factor: { Args: never; Returns: boolean }
      set_contact_consent: {
        Args: {
          p_consent: string
          p_contact_id: string
          p_message_id?: string
          p_note?: string
          p_source: string
        }
        Returns: Json
      }
      set_email_marketing: {
        Args: {
          p_contact_id: string
          p_evidence?: Json
          p_message_id?: string
          p_source: string
          p_state: string
          p_tenant_id: string
        }
        Returns: Json
      }
      set_marketing_consent: {
        Args: {
          p_consent: string
          p_contact_id: string
          p_evidence?: Json
          p_message_id?: string
          p_note?: string
          p_source: string
          p_tenant_id: string
        }
        Returns: Json
      }
      set_person_email: {
        Args: { p_contact_id: string; p_email: string }
        Returns: Json
      }
      set_person_name: {
        Args: { p_contact_id: string; p_name: string }
        Returns: Json
      }
      set_person_notes: {
        Args: { p_contact_id: string; p_notes: string }
        Returns: Json
      }
      set_person_proposal: {
        Args: { p_contact_id: string; p_url: string }
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
      setup_request: {
        Args: { p_tenant_id: string; p_what: string }
        Returns: Json
      }
      stamp_email_complaint: {
        Args: { p_at: string; p_message_id: string; p_tenant_id: string }
        Returns: boolean
      }
      stamp_email_sent: {
        Args: {
          p_message_id: string
          p_provider_id: string
          p_rfc_message_id: string
          p_tenant_id: string
        }
        Returns: {
          conversation_id: string
          status: string
        }[]
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
      take_rate: {
        Args: {
          p_actor: string
          p_bucket: string
          p_limit: number
          p_window_ms: number
        }
        Returns: Json
      }
      team_roster: {
        Args: { p_tenant_id: string }
        Returns: {
          display_name: string
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
      trigger_domains_sweep: { Args: never; Returns: number }
      trigger_google_sweep: { Args: never; Returns: number }
      trigger_jobs_tick: { Args: never; Returns: number }
      trigger_leads_sweep: { Args: never; Returns: number }
      trigger_lines_sweep: { Args: never; Returns: number }
      trigger_notes_sweep: { Args: never; Returns: number }
      trigger_partners_sweep: { Args: never; Returns: number }
      trigger_playbooks_sweep: { Args: never; Returns: number }
      trigger_reach_out_check_sweep: { Args: never; Returns: number }
      trigger_reach_out_sweep: { Args: never; Returns: number }
      trigger_registration_sweep: { Args: never; Returns: number }
      trigger_sweep_health: { Args: never; Returns: number }
      wake_stale_snoozes: { Args: never; Returns: number }
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

