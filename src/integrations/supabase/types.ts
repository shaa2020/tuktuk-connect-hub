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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_operator_log: {
        Row: {
          conversation_id: string | null
          created_at: string
          detail: Json
          id: string
          kind: string
          summary: string
          workspace_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          kind: string
          summary: string
          workspace_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          kind?: string
          summary?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_operator_log_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_operator_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_operator_marks: {
        Row: {
          conversation_id: string
          handed_off: boolean
          last_inbound_id: string | null
          replies: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          conversation_id: string
          handed_off?: boolean
          last_inbound_id?: string | null
          replies?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          conversation_id?: string
          handed_off?: boolean
          last_inbound_id?: string | null
          replies?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_operator_marks_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_operator_marks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_operator_settings: {
        Row: {
          allow_alert: boolean
          allow_assign: boolean
          allow_booking: boolean
          allow_reply: boolean
          away_mode: boolean
          default_assignee: string | null
          last_run_at: string | null
          lock_until: string | null
          max_replies: number
          notes: string
          paused_reason: string | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          allow_alert?: boolean
          allow_assign?: boolean
          allow_booking?: boolean
          allow_reply?: boolean
          away_mode?: boolean
          default_assignee?: string | null
          last_run_at?: string | null
          lock_until?: string | null
          max_replies?: number
          notes?: string
          paused_reason?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          allow_alert?: boolean
          allow_assign?: boolean
          allow_booking?: boolean
          allow_reply?: boolean
          away_mode?: boolean
          default_assignee?: string | null
          last_run_at?: string | null
          lock_until?: string | null
          max_replies?: number
          notes?: string
          paused_reason?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_operator_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_settings: {
        Row: {
          base_url: string | null
          enabled: boolean
          instructions: string | null
          model: string | null
          provider: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          base_url?: string | null
          enabled?: boolean
          instructions?: string | null
          model?: string | null
          provider?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          base_url?: string | null
          enabled?: boolean
          instructions?: string | null
          model?: string | null
          provider?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: string
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          actions: Json | null
          created_at: string
          enabled: boolean
          id: string
          name: string
          trigger: Json | null
          workspace_id: string
        }
        Insert: {
          actions?: Json | null
          created_at?: string
          enabled?: boolean
          id?: string
          name: string
          trigger?: Json | null
          workspace_id: string
        }
        Update: {
          actions?: Json | null
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          trigger?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          rule_id: string
          status: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          rule_id: string
          status: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          rule_id?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      background_jobs: {
        Row: {
          attempts: number
          created_at: string
          id: string
          kind: string
          last_error: string | null
          payload: Json | null
          run_at: string
          status: string
          workspace_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          payload?: Json | null
          run_at?: string
          status?: string
          workspace_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          payload?: Json | null
          run_at?: string
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "background_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          amount: number | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          dispatch_status: string
          driver_id: string | null
          driver_notify_pending: boolean
          duration_minutes: number | null
          external_reference: string | null
          guests: number | null
          id: string
          is_demo: boolean
          language: string | null
          lead_id: string | null
          notes: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          payment_status_source: string
          pickup_location: string | null
          reference: string
          reminder_sent_at: string | null
          review_sent_at: string | null
          source_system: string
          start_time: string | null
          status: Database["public"]["Enums"]["booking_status"]
          ticket_sent_at: string | null
          ticket_token: string
          tour_date: string | null
          tour_name: string
          updated_at: string
          vehicle_id: string | null
          workspace_id: string
        }
        Insert: {
          amount?: number | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          dispatch_status?: string
          driver_id?: string | null
          driver_notify_pending?: boolean
          duration_minutes?: number | null
          external_reference?: string | null
          guests?: number | null
          id?: string
          is_demo?: boolean
          language?: string | null
          lead_id?: string | null
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payment_status_source?: string
          pickup_location?: string | null
          reference: string
          reminder_sent_at?: string | null
          review_sent_at?: string | null
          source_system?: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          ticket_sent_at?: string | null
          ticket_token?: string
          tour_date?: string | null
          tour_name: string
          updated_at?: string
          vehicle_id?: string | null
          workspace_id: string
        }
        Update: {
          amount?: number | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          dispatch_status?: string
          driver_id?: string | null
          driver_notify_pending?: boolean
          duration_minutes?: number | null
          external_reference?: string | null
          guests?: number | null
          id?: string
          is_demo?: boolean
          language?: string | null
          lead_id?: string | null
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payment_status_source?: string
          pickup_location?: string | null
          reference?: string
          reminder_sent_at?: string | null
          review_sent_at?: string | null
          source_system?: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          ticket_sent_at?: string | null
          ticket_token?: string
          tour_date?: string | null
          tour_name?: string
          updated_at?: string
          vehicle_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      canned_replies: {
        Row: {
          body: string
          created_at: string
          id: string
          sort: number
          title: string
          workspace_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sort?: number
          title: string
          workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sort?: number
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canned_replies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_connections: {
        Row: {
          account_id: string | null
          account_label: string | null
          channel: Database["public"]["Enums"]["channel_type"]
          config: Json
          created_at: string
          display_name: string | null
          id: string
          last_checked_at: string | null
          last_error: string | null
          status: Database["public"]["Enums"]["connection_status"]
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          account_label?: string | null
          channel: Database["public"]["Enums"]["channel_type"]
          config?: Json
          created_at?: string
          display_name?: string | null
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          status?: Database["public"]["Enums"]["connection_status"]
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          account_label?: string | null
          channel?: Database["public"]["Enums"]["channel_type"]
          config?: Json
          created_at?: string
          display_name?: string | null
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          status?: Database["public"]["Enums"]["connection_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_consents: {
        Row: {
          contact_id: string
          granted: boolean
          id: string
          purpose: string
          recorded_at: string
          recorded_by: string | null
          source: string | null
          workspace_id: string
        }
        Insert: {
          contact_id: string
          granted: boolean
          id?: string
          purpose: string
          recorded_at?: string
          recorded_by?: string | null
          source?: string | null
          workspace_id: string
        }
        Update: {
          contact_id?: string
          granted?: boolean
          id?: string
          purpose?: string
          recorded_at?: string
          recorded_by?: string | null
          source?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_consents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_consents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_id: string
          tag_id: string
          workspace_id: string
        }
        Insert: {
          contact_id: string
          tag_id: string
          workspace_id: string
        }
        Update: {
          contact_id?: string
          tag_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          anonymized_at: string | null
          assigned_to: string | null
          country: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          is_demo: boolean
          last_interaction_at: string | null
          merged_into: string | null
          notes: string | null
          phone: string | null
          preferred_language: string | null
          preferred_name: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          anonymized_at?: string | null
          assigned_to?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_demo?: boolean
          last_interaction_at?: string | null
          merged_into?: string | null
          notes?: string | null
          phone?: string | null
          preferred_language?: string | null
          preferred_name?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          anonymized_at?: string | null
          assigned_to?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_demo?: boolean
          last_interaction_at?: string | null
          merged_into?: string | null
          notes?: string | null
          phone?: string | null
          preferred_language?: string | null
          preferred_name?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_assignments: {
        Row: {
          actor_id: string | null
          conversation_id: string
          created_at: string
          from_user: string | null
          id: string
          to_user: string | null
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          conversation_id: string
          created_at?: string
          from_user?: string | null
          id?: string
          to_user?: string | null
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          conversation_id?: string
          created_at?: string
          from_user?: string | null
          id?: string
          to_user?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_assignments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          external_identity_id: string
          workspace_id: string
        }
        Insert: {
          conversation_id: string
          external_identity_id: string
          workspace_id: string
        }
        Update: {
          conversation_id?: string
          external_identity_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_external_identity_id_fkey"
            columns: ["external_identity_id"]
            isOneToOne: false
            referencedRelation: "external_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_tags: {
        Row: {
          conversation_id: string
          tag_id: string
          workspace_id: string
        }
        Insert: {
          conversation_id: string
          tag_id: string
          workspace_id: string
        }
        Update: {
          conversation_id?: string
          tag_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_tags_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          awaiting_reply: boolean
          booking_id: string | null
          channel: Database["public"]["Enums"]["channel_type"]
          connection_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          escalated: boolean
          first_inbound_at: string | null
          first_response_at: string | null
          id: string
          is_demo: boolean
          last_message_at: string
          last_message_preview: string | null
          lead_id: string | null
          priority: Database["public"]["Enums"]["priority_level"]
          resolved_at: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          subject: string | null
          unread: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_to?: string | null
          awaiting_reply?: boolean
          booking_id?: string | null
          channel?: Database["public"]["Enums"]["channel_type"]
          connection_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          escalated?: boolean
          first_inbound_at?: string | null
          first_response_at?: string | null
          id?: string
          is_demo?: boolean
          last_message_at?: string
          last_message_preview?: string | null
          lead_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          subject?: string | null
          unread?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_to?: string | null
          awaiting_reply?: boolean
          booking_id?: string | null
          channel?: Database["public"]["Enums"]["channel_type"]
          connection_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          escalated?: boolean
          first_inbound_at?: string | null
          first_response_at?: string | null
          id?: string
          is_demo?: boolean
          last_message_at?: string
          last_message_preview?: string | null
          lead_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          subject?: string | null
          unread?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      external_identities: {
        Row: {
          channel: Database["public"]["Enums"]["channel_type"]
          contact_id: string | null
          created_at: string
          display_name: string | null
          external_id: string
          id: string
          verified: boolean
          workspace_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["channel_type"]
          contact_id?: string | null
          created_at?: string
          display_name?: string | null
          external_id: string
          id?: string
          verified?: boolean
          workspace_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["channel_type"]
          contact_id?: string | null
          created_at?: string
          display_name?: string | null
          external_id?: string
          id?: string
          verified?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_identities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_identities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_events: {
        Row: {
          channel: Database["public"]["Enums"]["channel_type"] | null
          created_at: string
          id: string
          level: string
          message: string
          workspace_id: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["channel_type"] | null
          created_at?: string
          id?: string
          level?: string
          message: string
          workspace_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["channel_type"] | null
          created_at?: string
          id?: string
          level?: string
          message?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_job_tokens: {
        Row: {
          created_at: string
          name: string
          token: string
        }
        Insert: {
          created_at?: string
          name: string
          token?: string
        }
        Update: {
          created_at?: string
          name?: string
          token?: string
        }
        Relationships: []
      }
      internal_notes: {
        Row: {
          author_id: string
          body: string
          conversation_id: string
          created_at: string
          id: string
          workspace_id: string
        }
        Insert: {
          author_id?: string
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          workspace_id: string
        }
        Update: {
          author_id?: string
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          role: Database["public"]["Enums"]["app_role"]
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          content: string
          created_at: string
          document_id: string
          id: string
          workspace_id: string
        }
        Insert: {
          content: string
          created_at?: string
          document_id: string
          id?: string
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string
          document_id?: string
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          category: string
          content: string | null
          created_at: string
          id: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          category?: string
          content?: string | null
          created_at?: string
          id?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          category?: string
          content?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          id: string
          kind: string
          lead_id: string
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          lead_id: string
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          lead_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          budget: number | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          duration_hours: number | null
          follow_up_at: string | null
          group_size: number | null
          id: string
          is_demo: boolean
          lost_reason: string | null
          notes: string | null
          owner_id: string | null
          preferred_date: string | null
          preferred_language: string | null
          source: string | null
          stage: Database["public"]["Enums"]["lead_stage"]
          title: string
          tour_interest: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          budget?: number | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          duration_hours?: number | null
          follow_up_at?: string | null
          group_size?: number | null
          id?: string
          is_demo?: boolean
          lost_reason?: string | null
          notes?: string | null
          owner_id?: string | null
          preferred_date?: string | null
          preferred_language?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          title: string
          tour_interest?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          budget?: number | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          duration_hours?: number | null
          follow_up_at?: string | null
          group_size?: number | null
          id?: string
          is_demo?: boolean
          lost_reason?: string | null
          notes?: string | null
          owner_id?: string | null
          preferred_date?: string | null
          preferred_language?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          title?: string
          tour_interest?: string | null
          updated_at?: string
          workspace_id?: string
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
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          created_at: string
          id: string
          message_id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      message_delivery_events: {
        Row: {
          detail: string | null
          id: string
          message_id: string
          occurred_at: string
          provider_event_id: string | null
          status: Database["public"]["Enums"]["message_status"]
          workspace_id: string
        }
        Insert: {
          detail?: string | null
          id?: string
          message_id: string
          occurred_at?: string
          provider_event_id?: string | null
          status: Database["public"]["Enums"]["message_status"]
          workspace_id: string
        }
        Update: {
          detail?: string | null
          id?: string
          message_id?: string
          occurred_at?: string
          provider_event_id?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_delivery_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_delivery_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_id: string | null
          body: string
          conversation_id: string
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          error_message: string | null
          external_id: string | null
          id: string
          status: Database["public"]["Enums"]["message_status"]
          workspace_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          conversation_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          error_message?: string | null
          external_id?: string | null
          id?: string
          status?: Database["public"]["Enums"]["message_status"]
          workspace_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          error_message?: string | null
          external_id?: string | null
          id?: string
          status?: Database["public"]["Enums"]["message_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          push_sent_at: string | null
          read_at: string | null
          title: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          push_sent_at?: string | null
          read_at?: string | null
          title: string
          user_id: string
          workspace_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          push_sent_at?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          keys: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          keys: Json
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          keys?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          permission?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      saved_replies: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          title: string
          workspace_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          title: string
          workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_replies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          media_urls: string[]
          published_at: string | null
          scheduled_at: string | null
          status: string
          targets: Json
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          media_urls?: string[]
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          targets?: Json
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          media_urls?: string[]
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          targets?: Json
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          booking_id: string | null
          completed_at: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          is_demo: boolean
          lead_id: string | null
          priority: Database["public"]["Enums"]["priority_level"]
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_to?: string | null
          booking_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          is_demo?: boolean
          lead_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_to?: string | null
          booking_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          is_demo?: boolean
          lead_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          plate: string | null
          seats: number
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          plate?: string | null
          seats?: number
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          plate?: string | null
          seats?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          error: string | null
          event_id: string
          id: string
          payload: Json | null
          processed_at: string | null
          provider: string
          received_at: string
          workspace_id: string | null
        }
        Insert: {
          error?: string | null
          event_id: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
          provider: string
          received_at?: string
          workspace_id?: string | null
        }
        Update: {
          error?: string | null
          event_id?: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
          provider?: string
          received_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      website_booking_ignores: {
        Row: {
          created_at: string
          external_reference: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          external_reference: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          external_reference?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_booking_ignores_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_webhook_events: {
        Row: {
          attempts: number
          delivery_id: string
          event: string
          id: string
          payload: Json
          processed_at: string | null
          processing_error: string | null
          received_at: string
        }
        Insert: {
          attempts?: number
          delivery_id: string
          event: string
          id?: string
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Update: {
          attempts?: number
          delivery_id?: string
          event?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          active: boolean
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          schedule_sent_on: string | null
          user_id: string
          whatsapp_phone: string | null
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          schedule_sent_on?: string | null
          user_id: string
          whatsapp_phone?: string | null
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          schedule_sent_on?: string | null
          user_id?: string
          whatsapp_phone?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_secrets: {
        Row: {
          ciphertext: string
          hint: string | null
          kind: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          ciphertext: string
          hint?: string | null
          kind: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          ciphertext?: string
          hint?: string | null
          kind?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_secrets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          agents_see_unassigned: boolean
          auto_assign_driver: boolean
          created_at: string
          default_driver_id: string | null
          driver_auto: boolean
          google_review_url: string | null
          guest_reminder_auto: boolean
          id: string
          name: string
          plan: string
          plan_limits: Json
          review_request_auto: boolean
          ticket_auto: string
          timezone: string
          tripadvisor_review_url: string | null
          updated_at: string
        }
        Insert: {
          agents_see_unassigned?: boolean
          auto_assign_driver?: boolean
          created_at?: string
          default_driver_id?: string | null
          driver_auto?: boolean
          google_review_url?: string | null
          guest_reminder_auto?: boolean
          id?: string
          name: string
          plan?: string
          plan_limits?: Json
          review_request_auto?: boolean
          ticket_auto?: string
          timezone?: string
          tripadvisor_review_url?: string | null
          updated_at?: string
        }
        Update: {
          agents_see_unassigned?: boolean
          auto_assign_driver?: boolean
          created_at?: string
          default_driver_id?: string | null
          driver_auto?: boolean
          google_review_url?: string | null
          guest_reminder_auto?: boolean
          id?: string
          name?: string
          plan?: string
          plan_limits?: Json
          review_request_auto?: boolean
          ticket_auto?: string
          timezone?: string
          tripadvisor_review_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { _token: string }; Returns: string }
      anonymize_contact: { Args: { _id: string }; Returns: undefined }
      can_view_conversation: {
        Args: { _assigned: string; _ws: string }
        Returns: boolean
      }
      can_view_conversation_id: { Args: { _conv: string }; Returns: boolean }
      clear_demo_data: { Args: { _ws: string }; Returns: undefined }
      dashboard_stats: {
        Args: {
          _assignee?: string
          _channel?: Database["public"]["Enums"]["channel_type"]
          _from: string
          _status?: Database["public"]["Enums"]["conversation_status"]
          _to: string
          _ws: string
        }
        Returns: Json
      }
      has_ws_role: {
        Args: { _roles: Database["public"]["Enums"]["app_role"][]; _ws: string }
        Returns: boolean
      }
      is_member: { Args: { _ws: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      kick_ai_operator: { Args: { _ws: string }; Returns: undefined }
      load_demo_data: { Args: { _ws: string }; Returns: undefined }
      merge_contacts: {
        Args: { _keep: string; _merge: string }
        Returns: undefined
      }
      shares_workspace: { Args: { _other: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "manager" | "agent"
      booking_status:
        | "inquiry"
        | "quote"
        | "tentative"
        | "confirmed"
        | "cancelled"
        | "completed"
      channel_type: "whatsapp" | "instagram" | "messenger" | "email" | "manual"
      connection_status:
        | "not_connected"
        | "pending"
        | "connected"
        | "error"
        | "disconnected"
      conversation_status:
        | "open"
        | "in_progress"
        | "waiting_customer"
        | "waiting_team"
        | "resolved"
        | "archived"
      lead_stage:
        | "new"
        | "contacted"
        | "qualified"
        | "quote_requested"
        | "quote_sent"
        | "awaiting_customer"
        | "won"
        | "lost"
      message_direction: "inbound" | "outbound"
      message_status:
        | "draft"
        | "queued"
        | "sending"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
        | "unknown"
        | "logged"
      payment_status:
        | "unknown"
        | "pending"
        | "paid"
        | "partially_paid"
        | "refunded"
      priority_level: "low" | "normal" | "high" | "urgent"
      task_status: "open" | "done"
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
  public: {
    Enums: {
      app_role: ["admin", "manager", "agent"],
      booking_status: [
        "inquiry",
        "quote",
        "tentative",
        "confirmed",
        "cancelled",
        "completed",
      ],
      channel_type: ["whatsapp", "instagram", "messenger", "email", "manual"],
      connection_status: [
        "not_connected",
        "pending",
        "connected",
        "error",
        "disconnected",
      ],
      conversation_status: [
        "open",
        "in_progress",
        "waiting_customer",
        "waiting_team",
        "resolved",
        "archived",
      ],
      lead_stage: [
        "new",
        "contacted",
        "qualified",
        "quote_requested",
        "quote_sent",
        "awaiting_customer",
        "won",
        "lost",
      ],
      message_direction: ["inbound", "outbound"],
      message_status: [
        "draft",
        "queued",
        "sending",
        "sent",
        "delivered",
        "read",
        "failed",
        "unknown",
        "logged",
      ],
      payment_status: [
        "unknown",
        "pending",
        "paid",
        "partially_paid",
        "refunded",
      ],
      priority_level: ["low", "normal", "high", "urgent"],
      task_status: ["open", "done"],
    },
  },
} as const
