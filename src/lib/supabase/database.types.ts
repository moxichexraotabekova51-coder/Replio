// AVTOMATIK GENERATSIYA QILINGAN — qo'lda o'zgartirmang. (node scripts/gen-types.mjs)
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      account_invites: {
        Row: {
          id: string;
          account_id: string;
          email: string;
          role: Database["public"]["Enums"]["member_role"];
          token: string;
          invited_by: string | null;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          email: string;
          role?: Database["public"]["Enums"]["member_role"];
          token?: string;
          invited_by?: string | null;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          email?: string;
          role?: Database["public"]["Enums"]["member_role"];
          token?: string;
          invited_by?: string | null;
          accepted_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "account_invites_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      account_members: {
        Row: {
          account_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["member_role"];
          created_at: string;
        };
        Insert: {
          account_id: string;
          user_id: string;
          role?: Database["public"]["Enums"]["member_role"];
          created_at?: string;
        };
        Update: {
          account_id?: string;
          user_id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "account_members_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      accounts: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          timezone: string;
          locale: string;
          plan_id: string;
          avatar_url: string | null;
          settings: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          timezone?: string;
          locale?: string;
          plan_id?: string;
          avatar_url?: string | null;
          settings?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          timezone?: string;
          locale?: string;
          plan_id?: string;
          avatar_url?: string | null;
          settings?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "accounts_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      api_keys: {
        Row: {
          id: string;
          account_id: string;
          key_hash: string;
          prefix: string;
          created_by: string | null;
          created_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          account_id: string;
          key_hash: string;
          prefix: string;
          created_by?: string | null;
          created_at?: string;
          revoked_at?: string | null;
        };
        Update: {
          id?: string;
          account_id?: string;
          key_hash?: string;
          prefix?: string;
          created_by?: string | null;
          created_at?: string;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "api_keys_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      bots: {
        Row: {
          id: string;
          account_id: string;
          tg_bot_id: number;
          username: string;
          first_name: string | null;
          token_encrypted: string;
          webhook_secret: string;
          webhook_ok: boolean;
          status: Database["public"]["Enums"]["bot_status"];
          last_error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          tg_bot_id: number;
          username: string;
          first_name?: string | null;
          token_encrypted: string;
          webhook_secret?: string;
          webhook_ok?: boolean;
          status?: Database["public"]["Enums"]["bot_status"];
          last_error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          tg_bot_id?: number;
          username?: string;
          first_name?: string | null;
          token_encrypted?: string;
          webhook_secret?: string;
          webhook_ok?: boolean;
          status?: Database["public"]["Enums"]["bot_status"];
          last_error?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bots_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      broadcasts: {
        Row: {
          id: string;
          account_id: string;
          name: string;
          audience: Json;
          flow_id: string | null;
          scheduled_at: string | null;
          sent_at: string | null;
          status: Database["public"]["Enums"]["broadcast_status"];
          stats: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          name?: string;
          audience?: Json;
          flow_id?: string | null;
          scheduled_at?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["broadcast_status"];
          stats?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          name?: string;
          audience?: Json;
          flow_id?: string | null;
          scheduled_at?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["broadcast_status"];
          stats?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "broadcasts_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "broadcasts_flow_id_fkey";
            columns: ["flow_id"];
            isOneToOne: false;
            referencedRelation: "flows";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_field_values: {
        Row: {
          contact_id: string;
          field_id: string;
          value: Json | null;
          updated_at: string;
        };
        Insert: {
          contact_id: string;
          field_id: string;
          value?: Json | null;
          updated_at?: string;
        };
        Update: {
          contact_id?: string;
          field_id?: string;
          value?: Json | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contact_field_values_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_field_values_field_id_fkey";
            columns: ["field_id"];
            isOneToOne: false;
            referencedRelation: "custom_fields";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_labels: {
        Row: {
          contact_id: string;
          label_id: string;
          created_at: string;
        };
        Insert: {
          contact_id: string;
          label_id: string;
          created_at?: string;
        };
        Update: {
          contact_id?: string;
          label_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contact_labels_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_labels_label_id_fkey";
            columns: ["label_id"];
            isOneToOne: false;
            referencedRelation: "inbox_labels";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_sequences: {
        Row: {
          contact_id: string;
          sequence_id: string;
          current_step: number;
          next_run_at: string | null;
          created_at: string;
        };
        Insert: {
          contact_id: string;
          sequence_id: string;
          current_step?: number;
          next_run_at?: string | null;
          created_at?: string;
        };
        Update: {
          contact_id?: string;
          sequence_id?: string;
          current_step?: number;
          next_run_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contact_sequences_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_sequences_sequence_id_fkey";
            columns: ["sequence_id"];
            isOneToOne: false;
            referencedRelation: "sequences";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_tags: {
        Row: {
          contact_id: string;
          tag_id: string;
          created_at: string;
        };
        Insert: {
          contact_id: string;
          tag_id: string;
          created_at?: string;
        };
        Update: {
          contact_id?: string;
          tag_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          id: string;
          account_id: string;
          bot_id: string | null;
          tg_user_id: number;
          first_name: string | null;
          last_name: string | null;
          username: string | null;
          language_code: string | null;
          avatar_url: string | null;
          subscribed_at: string;
          last_interaction_at: string | null;
          is_subscribed: boolean;
          live_chat_status: Database["public"]["Enums"]["live_chat_status"];
          assigned_to: string | null;
          automation_paused_until: string | null;
          is_unread: boolean;
          last_message_preview: string | null;
          last_message_at: string | null;
          over_limit: boolean;
          search: string | null;
        };
        Insert: {
          id?: string;
          account_id: string;
          bot_id?: string | null;
          tg_user_id: number;
          first_name?: string | null;
          last_name?: string | null;
          username?: string | null;
          language_code?: string | null;
          avatar_url?: string | null;
          subscribed_at?: string;
          last_interaction_at?: string | null;
          is_subscribed?: boolean;
          live_chat_status?: Database["public"]["Enums"]["live_chat_status"];
          assigned_to?: string | null;
          automation_paused_until?: string | null;
          is_unread?: boolean;
          last_message_preview?: string | null;
          last_message_at?: string | null;
          over_limit?: boolean;
        };
        Update: {
          id?: string;
          account_id?: string;
          bot_id?: string | null;
          tg_user_id?: number;
          first_name?: string | null;
          last_name?: string | null;
          username?: string | null;
          language_code?: string | null;
          avatar_url?: string | null;
          subscribed_at?: string;
          last_interaction_at?: string | null;
          is_subscribed?: boolean;
          live_chat_status?: Database["public"]["Enums"]["live_chat_status"];
          assigned_to?: string | null;
          automation_paused_until?: string | null;
          is_unread?: boolean;
          last_message_preview?: string | null;
          last_message_at?: string | null;
          over_limit?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_bot_id_fkey";
            columns: ["bot_id"];
            isOneToOne: false;
            referencedRelation: "bots";
            referencedColumns: ["id"];
          },
        ];
      };
      custom_fields: {
        Row: {
          id: string;
          account_id: string;
          name: string;
          type: Database["public"]["Enums"]["field_type"];
          description: string | null;
          is_bot_field: boolean;
          bot_value: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          name: string;
          type?: Database["public"]["Enums"]["field_type"];
          description?: string | null;
          is_bot_field?: boolean;
          bot_value?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          name?: string;
          type?: Database["public"]["Enums"]["field_type"];
          description?: string | null;
          is_bot_field?: boolean;
          bot_value?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "custom_fields_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_stats: {
        Row: {
          account_id: string;
          date: string;
          new_contacts: number;
          unsubscribed: number;
          messages_in: number;
          messages_out: number;
          clicks: number;
        };
        Insert: {
          account_id: string;
          date: string;
          new_contacts?: number;
          unsubscribed?: number;
          messages_in?: number;
          messages_out?: number;
          clicks?: number;
        };
        Update: {
          account_id?: string;
          date?: string;
          new_contacts?: number;
          unsubscribed?: number;
          messages_in?: number;
          messages_out?: number;
          clicks?: number;
        };
        Relationships: [
          {
            foreignKeyName: "daily_stats_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      flow_versions: {
        Row: {
          id: string;
          flow_id: string;
          version: number;
          draft: Json;
          compiled: Json;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          flow_id: string;
          version: number;
          draft: Json;
          compiled: Json;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          flow_id?: string;
          version?: number;
          draft?: Json;
          compiled?: Json;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "flow_versions_flow_id_fkey";
            columns: ["flow_id"];
            isOneToOne: false;
            referencedRelation: "flows";
            referencedColumns: ["id"];
          },
        ];
      };
      flows: {
        Row: {
          id: string;
          account_id: string;
          folder_id: string | null;
          name: string;
          draft: Json;
          compiled: Json | null;
          published_version: number;
          has_unpublished: boolean;
          status: Database["public"]["Enums"]["flow_status"];
          is_basic: boolean;
          basic_kind: string | null;
          runs: number;
          clicks: number;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          folder_id?: string | null;
          name?: string;
          draft?: Json;
          compiled?: Json | null;
          published_version?: number;
          has_unpublished?: boolean;
          status?: Database["public"]["Enums"]["flow_status"];
          is_basic?: boolean;
          basic_kind?: string | null;
          runs?: number;
          clicks?: number;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          folder_id?: string | null;
          name?: string;
          draft?: Json;
          compiled?: Json | null;
          published_version?: number;
          has_unpublished?: boolean;
          status?: Database["public"]["Enums"]["flow_status"];
          is_basic?: boolean;
          basic_kind?: string | null;
          runs?: number;
          clicks?: number;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "flows_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flows_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
        ];
      };
      folders: {
        Row: {
          id: string;
          account_id: string;
          name: string;
          parent_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          name: string;
          parent_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          name?: string;
          parent_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "folders_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "folders_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
        ];
      };
      growth_tools: {
        Row: {
          id: string;
          account_id: string;
          type: string;
          name: string;
          ref_code: string;
          flow_id: string | null;
          config: Json;
          stats: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          type: string;
          name?: string;
          ref_code: string;
          flow_id?: string | null;
          config?: Json;
          stats?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          type?: string;
          name?: string;
          ref_code?: string;
          flow_id?: string | null;
          config?: Json;
          stats?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "growth_tools_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "growth_tools_flow_id_fkey";
            columns: ["flow_id"];
            isOneToOne: false;
            referencedRelation: "flows";
            referencedColumns: ["id"];
          },
        ];
      };
      inbox_labels: {
        Row: {
          id: string;
          account_id: string;
          name: string;
          icon: string;
          is_default: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          name: string;
          icon?: string;
          is_default?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          name?: string;
          icon?: string;
          is_default?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inbox_labels_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      latency_logs: {
        Row: {
          id: number;
          bot_id: string | null;
          account_id: string | null;
          kind: string;
          received_at: string;
          sent_at: string;
          ms: number;
        };
        Insert: {
          bot_id?: string | null;
          account_id?: string | null;
          kind?: string;
          received_at: string;
          sent_at: string;
          ms: number;
        };
        Update: {
          bot_id?: string | null;
          account_id?: string | null;
          kind?: string;
          received_at?: string;
          sent_at?: string;
          ms?: number;
        };
        Relationships: [
          {
            foreignKeyName: "latency_logs_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "latency_logs_bot_id_fkey";
            columns: ["bot_id"];
            isOneToOne: false;
            referencedRelation: "bots";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          account_id: string;
          contact_id: string;
          direction: Database["public"]["Enums"]["message_direction"];
          type: string;
          content: Json;
          tg_message_id: number | null;
          flow_id: string | null;
          step_id: string | null;
          author_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          contact_id: string;
          direction: Database["public"]["Enums"]["message_direction"];
          type?: string;
          content?: Json;
          tg_message_id?: number | null;
          flow_id?: string | null;
          step_id?: string | null;
          author_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          contact_id?: string;
          direction?: Database["public"]["Enums"]["message_direction"];
          type?: string;
          content?: Json;
          tg_message_id?: number | null;
          flow_id?: string | null;
          step_id?: string | null;
          author_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_flow_id_fkey";
            columns: ["flow_id"];
            isOneToOne: false;
            referencedRelation: "flows";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          id: string;
          account_id: string;
          plan_id: string;
          billing_period: Database["public"]["Enums"]["billing_period"];
          amount: number;
          checkout_id: string | null;
          checkout_uuid: string | null;
          checkout_url: string | null;
          status: Database["public"]["Enums"]["payment_status"];
          raw: Json | null;
          created_by: string | null;
          created_at: string;
          paid_at: string | null;
        };
        Insert: {
          id?: string;
          account_id: string;
          plan_id: string;
          billing_period?: Database["public"]["Enums"]["billing_period"];
          amount: number;
          checkout_id?: string | null;
          checkout_uuid?: string | null;
          checkout_url?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          raw?: Json | null;
          created_by?: string | null;
          created_at?: string;
          paid_at?: string | null;
        };
        Update: {
          id?: string;
          account_id?: string;
          plan_id?: string;
          billing_period?: Database["public"]["Enums"]["billing_period"];
          amount?: number;
          checkout_id?: string | null;
          checkout_uuid?: string | null;
          checkout_url?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          raw?: Json | null;
          created_by?: string | null;
          created_at?: string;
          paid_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      perf_logs: {
        Row: {
          id: number;
          account_id: string | null;
          kind: string;
          name: string;
          ms: number | null;
          meta: Json | null;
          created_at: string;
        };
        Insert: {
          account_id?: string | null;
          kind: string;
          name: string;
          ms?: number | null;
          meta?: Json | null;
          created_at?: string;
        };
        Update: {
          account_id?: string | null;
          kind?: string;
          name?: string;
          ms?: number | null;
          meta?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "perf_logs_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          id: string;
          name: string;
          price_monthly: number;
          price_yearly: number;
          contact_limit: number;
          bot_limit: number;
          seat_limit: number;
          features: Json;
          sort_order: number;
        };
        Insert: {
          id: string;
          name: string;
          price_monthly: number;
          price_yearly: number;
          contact_limit: number;
          bot_limit: number;
          seat_limit: number;
          features?: Json;
          sort_order?: number;
        };
        Update: {
          id?: string;
          name?: string;
          price_monthly?: number;
          price_yearly?: number;
          contact_limit?: number;
          bot_limit?: number;
          seat_limit?: number;
          features?: Json;
          sort_order?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          locale: string;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          locale?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          locale?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      reminders: {
        Row: {
          id: string;
          account_id: string;
          contact_id: string;
          user_id: string;
          remind_at: string;
          note: string | null;
          done: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          contact_id: string;
          user_id: string;
          remind_at: string;
          note?: string | null;
          done?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          contact_id?: string;
          user_id?: string;
          remind_at?: string;
          note?: string | null;
          done?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reminders_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reminders_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      scheduled_jobs: {
        Row: {
          id: string;
          account_id: string | null;
          type: string;
          payload: Json;
          run_at: string;
          status: Database["public"]["Enums"]["job_status"];
          attempts: number;
          last_error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id?: string | null;
          type: string;
          payload?: Json;
          run_at?: string;
          status?: Database["public"]["Enums"]["job_status"];
          attempts?: number;
          last_error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string | null;
          type?: string;
          payload?: Json;
          run_at?: string;
          status?: Database["public"]["Enums"]["job_status"];
          attempts?: number;
          last_error?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scheduled_jobs_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      sequence_steps: {
        Row: {
          id: string;
          sequence_id: string;
          position: number;
          delay: string;
          flow_id: string | null;
          send_window: Json | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          sequence_id: string;
          position?: number;
          delay?: string;
          flow_id?: string | null;
          send_window?: Json | null;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          sequence_id?: string;
          position?: number;
          delay?: string;
          flow_id?: string | null;
          send_window?: Json | null;
          is_active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "sequence_steps_flow_id_fkey";
            columns: ["flow_id"];
            isOneToOne: false;
            referencedRelation: "flows";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sequence_steps_sequence_id_fkey";
            columns: ["sequence_id"];
            isOneToOne: false;
            referencedRelation: "sequences";
            referencedColumns: ["id"];
          },
        ];
      };
      sequences: {
        Row: {
          id: string;
          account_id: string;
          name: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          name: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          name?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sequences_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      step_stats: {
        Row: {
          flow_id: string;
          step_id: string;
          sent: number;
          delivered: number;
          clicked: number;
        };
        Insert: {
          flow_id: string;
          step_id: string;
          sent?: number;
          delivered?: number;
          clicked?: number;
        };
        Update: {
          flow_id?: string;
          step_id?: string;
          sent?: number;
          delivered?: number;
          clicked?: number;
        };
        Relationships: [
          {
            foreignKeyName: "step_stats_flow_id_fkey";
            columns: ["flow_id"];
            isOneToOne: false;
            referencedRelation: "flows";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          account_id: string;
          plan_id: string;
          billing_period: Database["public"]["Enums"]["billing_period"];
          status: Database["public"]["Enums"]["subscription_status"];
          current_period_end: string;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          plan_id: string;
          billing_period?: Database["public"]["Enums"]["billing_period"];
          status?: Database["public"]["Enums"]["subscription_status"];
          current_period_end: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          plan_id?: string;
          billing_period?: Database["public"]["Enums"]["billing_period"];
          status?: Database["public"]["Enums"]["subscription_status"];
          current_period_end?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: true;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      tags: {
        Row: {
          id: string;
          account_id: string;
          name: string;
          folder: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          name: string;
          folder?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          name?: string;
          folder?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tags_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      templates: {
        Row: {
          id: string;
          name: string;
          description: string;
          category: string;
          icon: string;
          flow_json: Json;
          sort_order: number;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string;
          category?: string;
          icon?: string;
          flow_json: Json;
          sort_order?: number;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          category?: string;
          icon?: string;
          flow_json?: Json;
          sort_order?: number;
        };
        Relationships: [];
      };
      triggers: {
        Row: {
          id: string;
          account_id: string;
          flow_id: string;
          type: string;
          config: Json;
          conditions: Json;
          actions: Json;
          priority: number;
          is_active: boolean;
          run_count: number;
          click_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          flow_id: string;
          type: string;
          config?: Json;
          conditions?: Json;
          actions?: Json;
          priority?: number;
          is_active?: boolean;
          run_count?: number;
          click_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          flow_id?: string;
          type?: string;
          config?: Json;
          conditions?: Json;
          actions?: Json;
          priority?: number;
          is_active?: boolean;
          run_count?: number;
          click_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "triggers_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "triggers_flow_id_fkey";
            columns: ["flow_id"];
            isOneToOne: false;
            referencedRelation: "flows";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      account_role: { Args: { aid: string }; Returns: Database["public"]["Enums"]["member_role"] };
      is_member: { Args: { aid: string }; Returns: boolean };
      can_view_automation: { Args: { aid: string }; Returns: boolean };
      can_edit: { Args: { aid: string }; Returns: boolean };
      can_chat: { Args: { aid: string }; Returns: boolean };
      is_admin: { Args: { aid: string }; Returns: boolean };
      create_account: { Args: { p_name: string; p_timezone?: string }; Returns: string };
      tags_with_counts: { Args: { p_account_id: string }; Returns: { id: string; name: string; folder: string; created_at: string; contacts: number }[] };
      duplicate_flow: { Args: { p_flow_id: string }; Returns: string };
      create_flow: { Args: { p_account_id: string; p_template_id?: string; p_folder_id?: string }; Returns: string };
      contact_account: { Args: { cid: string }; Returns: string };
      flow_account: { Args: { fid: string }; Returns: string };
      sequence_account: { Args: { sid: string }; Returns: string };
      activate_payment: { Args: { p_payment_id: string; p_raw?: Json }; Returns: boolean };
      refresh_daily_stats: { Args: { p_days?: number }; Returns: undefined };
      dashboard_stats: { Args: { p_account_id: string; p_days?: number }; Returns: Json };
      ensure_basic_flow: { Args: { p_account_id: string; p_kind: string }; Returns: string };
      purge_trash: { Args: Record<PropertyKey, never>; Returns: undefined };
      inbox_search: { Args: { p_account_id: string; p_query: string; p_limit?: number }; Returns: string[] };
      account_member_emails: { Args: { p_account_id: string }; Returns: { user_id: string; email: string }[] };
      find_user_id_by_email: { Args: { p_email: string }; Returns: string };
      latency_summary: { Args: { p_account_id: string; p_hours?: number }; Returns: Json };
    };
    Enums: {
      member_role: "admin" | "editor" | "agent" | "viewer";
      flow_status: "draft" | "live" | "stopped";
      bot_status: "connected" | "disconnected" | "error";
      field_type: "text" | "number" | "date" | "datetime" | "boolean";
      live_chat_status: "open" | "closed";
      message_direction: "in" | "out_bot" | "out_agent" | "note";
      broadcast_status: "draft" | "scheduled" | "sending" | "sent" | "failed";
      subscription_status: "trialing" | "active" | "past_due" | "expired" | "canceled";
      billing_period: "monthly" | "yearly";
      payment_status: "pending" | "paid" | "failed" | "canceled";
      job_status: "pending" | "running" | "done" | "failed";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
