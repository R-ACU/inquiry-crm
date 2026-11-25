/**
 * Database types in the format of `supabase gen types typescript`.
 *
 * Written by hand from supabase/migrations because generating them needs a
 * running database. Insert and Update list only the columns the API roles
 * hold privileges for, so the compiler flags writes the database would
 * refuse. Tables without any API privileges (ai_usage, login_failures) are
 * left out. After `supabase link`, regenerate with:
 *   npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: Database["public"]["Enums"]["app_role"];
          created_at: string;
        };
        Insert: never;
        Update: {
          full_name?: string;
        };
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          full_name: string;
          company: string | null;
          email: string | null;
          phone: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          full_name: string;
          company?: string | null;
          email?: string | null;
          phone?: string | null;
        };
        Update: {
          full_name?: string;
          company?: string | null;
          phone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      api_keys: {
        Row: {
          id: string;
          name: string;
          key_prefix: string;
          rate_limit_per_minute: number;
          created_by: string | null;
          last_used_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          name: string;
          key_prefix: string;
          key_hash: string;
          rate_limit_per_minute?: number;
        };
        Update: {
          name?: string;
          revoked_at?: string | null;
        };
        Relationships: [];
      };
      inquiries: {
        Row: {
          id: string;
          contact_id: string;
          title: string;
          message: string;
          status: Database["public"]["Enums"]["inquiry_status"];
          source: Database["public"]["Enums"]["inquiry_source"];
          event_type: Database["public"]["Enums"]["event_type"] | null;
          event_date: string | null;
          start_time: string | null;
          end_time: string | null;
          guest_count: number | null;
          budget_cents: number | null;
          location: string | null;
          assigned_to: string | null;
          api_key_id: string | null;
          submitted_contact: Json | null;
          matched_existing_contact: boolean;
          closed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          contact_id: string;
          title: string;
          message?: string;
          event_type?: Database["public"]["Enums"]["event_type"] | null;
          event_date?: string | null;
          start_time?: string | null;
          end_time?: string | null;
          guest_count?: number | null;
          budget_cents?: number | null;
          location?: string | null;
          assigned_to?: string | null;
        };
        Update: {
          title?: string;
          message?: string;
          status?: Database["public"]["Enums"]["inquiry_status"];
          event_type?: Database["public"]["Enums"]["event_type"] | null;
          event_date?: string | null;
          start_time?: string | null;
          end_time?: string | null;
          guest_count?: number | null;
          budget_cents?: number | null;
          location?: string | null;
          assigned_to?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "inquiries_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inquiries_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inquiries_api_key_id_fkey";
            columns: ["api_key_id"];
            isOneToOne: false;
            referencedRelation: "api_keys";
            referencedColumns: ["id"];
          },
        ];
      };
      inquiry_notes: {
        Row: {
          id: string;
          inquiry_id: string;
          author_id: string | null;
          body: string;
          created_at: string;
        };
        Insert: {
          inquiry_id: string;
          body: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "inquiry_notes_inquiry_id_fkey";
            columns: ["inquiry_id"];
            isOneToOne: false;
            referencedRelation: "inquiries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inquiry_notes_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      inquiry_events: {
        Row: {
          id: number;
          inquiry_id: string;
          actor_id: string | null;
          kind:
            | "created"
            | "status_changed"
            | "assigned"
            | "details_updated"
            | "ai_draft_accepted"
            | "ai_draft_discarded";
          details: Json;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "inquiry_events_inquiry_id_fkey";
            columns: ["inquiry_id"];
            isOneToOne: false;
            referencedRelation: "inquiries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inquiry_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_drafts: {
        Row: {
          id: string;
          inquiry_id: string;
          created_by: string | null;
          summary: string;
          questions: Json;
          suggested_event_type: Database["public"]["Enums"]["event_type"] | null;
          model: string;
          status: Database["public"]["Enums"]["draft_status"];
          decided_by: string | null;
          decided_at: string | null;
          created_at: string;
        };
        Insert: {
          inquiry_id: string;
          summary: string;
          questions: Json;
          suggested_event_type?: Database["public"]["Enums"]["event_type"] | null;
          model: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "ai_drafts_inquiry_id_fkey";
            columns: ["inquiry_id"];
            isOneToOne: false;
            referencedRelation: "inquiries";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_owner: { Args: never; Returns: boolean };
      set_member_role: {
        Args: { p_user_id: string; p_role: Database["public"]["Enums"]["app_role"] };
        Returns: undefined;
      };
      accept_ai_draft: { Args: { p_draft_id: string }; Returns: string };
      discard_ai_draft: { Args: { p_draft_id: string }; Returns: undefined };
      reserve_ai_draft: { Args: { p_inquiry_id: string }; Returns: undefined };
      login_allowed: { Args: { p_email: string; p_client: string }; Returns: boolean };
      record_login_failure: { Args: { p_email: string; p_client: string }; Returns: undefined };
      ingest_inquiry: {
        Args: { p_api_key: string; p_payload: Json };
        Returns: Json;
      };
    };
    Enums: {
      app_role: "owner" | "staff";
      inquiry_status: "new" | "quoted" | "won" | "lost";
      inquiry_source: "manual" | "web_form" | "api";
      event_type: "corporate" | "wedding" | "private" | "conference" | "other";
      draft_status: "draft" | "accepted" | "discarded";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
