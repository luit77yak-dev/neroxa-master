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
      neroxa_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          organization_id: string | null
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          organization_id?: string | null
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          organization_id?: string | null
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: []
      }
      neroxa_billing_records: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          external_id: string | null
          gateway_event_id: string | null
          gateway_payment_id: string | null
          gateway_provider: string | null
          gateway_status: string | null
          id: string
          organization_id: string
          paid_at: string | null
          payment_method: string | null
          reference_month: string
          status: Database["public"]["Enums"]["neroxa_billing_status"]
          subscription_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          due_date: string
          external_id?: string | null
          gateway_event_id?: string | null
          gateway_payment_id?: string | null
          gateway_provider?: string | null
          gateway_status?: string | null
          id?: string
          organization_id: string
          paid_at?: string | null
          payment_method?: string | null
          reference_month: string
          status?: Database["public"]["Enums"]["neroxa_billing_status"]
          subscription_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          external_id?: string | null
          gateway_event_id?: string | null
          gateway_payment_id?: string | null
          gateway_provider?: string | null
          gateway_status?: string | null
          id?: string
          organization_id?: string
          paid_at?: string | null
          payment_method?: string | null
          reference_month?: string
          status?: Database["public"]["Enums"]["neroxa_billing_status"]
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "neroxa_billing_records_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "neroxa_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      neroxa_checkout_sessions: {
        Row: {
          amount: number
          checkout_url: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string
          customer_document: string | null
          customer_email: string
          customer_name: string
          customer_phone: string | null
          gateway_payment_id: string | null
          gateway_preference_id: string | null
          gateway_provider: string
          gateway_status: string | null
          id: string
          organization_id: string | null
          plan_id: string
          status: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          checkout_url?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_document?: string | null
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          gateway_payment_id?: string | null
          gateway_preference_id?: string | null
          gateway_provider?: string
          gateway_status?: string | null
          id?: string
          organization_id?: string | null
          plan_id: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          checkout_url?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_document?: string | null
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          gateway_payment_id?: string | null
          gateway_preference_id?: string | null
          gateway_provider?: string
          gateway_status?: string | null
          id?: string
          organization_id?: string | null
          plan_id?: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "neroxa_checkout_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "neroxa_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neroxa_checkout_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "neroxa_clients"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "neroxa_checkout_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "neroxa_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neroxa_checkout_sessions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "neroxa_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neroxa_checkout_sessions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "neroxa_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      neroxa_client_contacts: {
        Row: {
          active: boolean
          client_id: string
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          notes: string | null
          phone: string | null
          role_title: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          active?: boolean
          client_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          role_title?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          active?: boolean
          client_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          role_title?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "neroxa_client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "neroxa_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neroxa_client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "neroxa_clients"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "neroxa_client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "neroxa_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      neroxa_contract_signatures: {
        Row: {
          contract_id: string
          contract_version: number
          created_at: string
          id: string
          party: string
          signature_method: string
          signed_at: string
          signer_document: string | null
          signer_name: string
          signer_role: string | null
          signer_user_id: string | null
        }
        Insert: {
          contract_id: string
          contract_version: number
          created_at?: string
          id?: string
          party: string
          signature_method?: string
          signed_at?: string
          signer_document?: string | null
          signer_name: string
          signer_role?: string | null
          signer_user_id?: string | null
        }
        Update: {
          contract_id?: string
          contract_version?: number
          created_at?: string
          id?: string
          party?: string
          signature_method?: string
          signed_at?: string
          signer_document?: string | null
          signer_name?: string
          signer_role?: string | null
          signer_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "neroxa_contract_signatures_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "neroxa_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      neroxa_contracts: {
        Row: {
          billing_period: string | null
          client_id: string
          commercial_model: string
          contract_number: string | null
          created_at: string
          currency: string
          customer_signed_at: string | null
          customer_signer_document: string | null
          customer_signer_name: string | null
          ended_at: string | null
          id: string
          issued_at: string | null
          maintenance_value: number | null
          neroxa_signed_at: string | null
          neroxa_signer_name: string | null
          neroxa_signer_role: string | null
          neroxa_signer_user_id: string | null
          plan_id: string | null
          proposal_id: string | null
          public_signature_token: string
          recurring_value: number | null
          setup_value: number
          signature_requested_at: string | null
          signature_status: string
          signed_at: string | null
          started_at: string | null
          status: string
          system_id: string | null
          term_months: number | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          billing_period?: string | null
          client_id: string
          commercial_model?: string
          contract_number?: string | null
          created_at?: string
          currency?: string
          customer_signed_at?: string | null
          customer_signer_document?: string | null
          customer_signer_name?: string | null
          ended_at?: string | null
          id?: string
          issued_at?: string | null
          maintenance_value?: number | null
          neroxa_signed_at?: string | null
          neroxa_signer_name?: string | null
          neroxa_signer_role?: string | null
          neroxa_signer_user_id?: string | null
          plan_id?: string | null
          proposal_id?: string | null
          public_signature_token?: string
          recurring_value?: number | null
          setup_value?: number
          signature_requested_at?: string | null
          signature_status?: string
          signed_at?: string | null
          started_at?: string | null
          status?: string
          system_id?: string | null
          term_months?: number | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          billing_period?: string | null
          client_id?: string
          commercial_model?: string
          contract_number?: string | null
          created_at?: string
          currency?: string
          customer_signed_at?: string | null
          customer_signer_document?: string | null
          customer_signer_name?: string | null
          ended_at?: string | null
          id?: string
          issued_at?: string | null
          maintenance_value?: number | null
          neroxa_signed_at?: string | null
          neroxa_signer_name?: string | null
          neroxa_signer_role?: string | null
          neroxa_signer_user_id?: string | null
          plan_id?: string | null
          proposal_id?: string | null
          public_signature_token?: string
          recurring_value?: number | null
          setup_value?: number
          signature_requested_at?: string | null
          signature_status?: string
          signed_at?: string | null
          started_at?: string | null
          status?: string
          system_id?: string | null
          term_months?: number | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "neroxa_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "neroxa_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neroxa_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "neroxa_clients"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "neroxa_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "neroxa_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neroxa_contracts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "neroxa_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neroxa_contracts_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "neroxa_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neroxa_contracts_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "neroxa_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      neroxa_organizations: {
        Row: {
          acquired_at: string | null
          activated_at: string | null
          active: boolean
          cancelled_at: string | null
          contact_name: string | null
          contracted_at: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          legal_name: string
          notes: string | null
          paused_at: string | null
          phone: string | null
          status: string
          trade_name: string | null
          updated_at: string
        }
        Insert: {
          acquired_at?: string | null
          activated_at?: string | null
          active?: boolean
          cancelled_at?: string | null
          contact_name?: string | null
          contracted_at?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          legal_name: string
          notes?: string | null
          paused_at?: string | null
          phone?: string | null
          status?: string
          trade_name?: string | null
          updated_at?: string
        }
        Update: {
          acquired_at?: string | null
          activated_at?: string | null
          active?: boolean
          cancelled_at?: string | null
          contact_name?: string | null
          contracted_at?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          legal_name?: string
          notes?: string | null
          paused_at?: string | null
          phone?: string | null
          status?: string
          trade_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      neroxa_payment_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_id: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          received_at: string
          resource_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_id: string
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider: string
          received_at?: string
          resource_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          resource_id?: string | null
          status?: string
        }
        Relationships: []
      }
      neroxa_plan_features: {
        Row: {
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          limit_value: number | null
          plan_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          limit_value?: number | null
          plan_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          limit_value?: number | null
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "neroxa_plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "neroxa_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      neroxa_plan_products: {
        Row: {
          created_at: string
          id: string
          included: boolean
          plan_id: string
          product_id: string
          quantity: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          included?: boolean
          plan_id: string
          product_id: string
          quantity?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          included?: boolean
          plan_id?: string
          product_id?: string
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "neroxa_plan_products_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "neroxa_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neroxa_plan_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "neroxa_products"
            referencedColumns: ["id"]
          },
        ]
      }
      neroxa_plans: {
        Row: {
          active: boolean
          billing_period: Database["public"]["Enums"]["neroxa_billing_period"]
          commercial_model: string
          created_at: string
          description: string | null
          gateway_plan_id: string | null
          gateway_provider: string | null
          gateway_status: string
          gateway_synced_at: string | null
          id: string
          maintenance_price: number | null
          name: string
          price_monthly: number
          setup_price: number
          slug: string
          system_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          billing_period?: Database["public"]["Enums"]["neroxa_billing_period"]
          commercial_model?: string
          created_at?: string
          description?: string | null
          gateway_plan_id?: string | null
          gateway_provider?: string | null
          gateway_status?: string
          gateway_synced_at?: string | null
          id?: string
          maintenance_price?: number | null
          name: string
          price_monthly?: number
          setup_price?: number
          slug: string
          system_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          billing_period?: Database["public"]["Enums"]["neroxa_billing_period"]
          commercial_model?: string
          created_at?: string
          description?: string | null
          gateway_plan_id?: string | null
          gateway_provider?: string | null
          gateway_status?: string
          gateway_synced_at?: string | null
          id?: string
          maintenance_price?: number | null
          name?: string
          price_monthly?: number
          setup_price?: number
          slug?: string
          system_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "neroxa_plans_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "neroxa_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      neroxa_platform_members: {
        Row: {
          active: boolean
          created_at: string
          id: string
          role: Database["public"]["Enums"]["neroxa_platform_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["neroxa_platform_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["neroxa_platform_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      neroxa_platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by_user_id: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by_user_id?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by_user_id?: string | null
          value?: Json
        }
        Relationships: []
      }
      neroxa_products: {
        Row: {
          active: boolean
          category: string
          created_at: string
          description: string | null
          id: string
          name: string
          price_monthly: number
          setup_price: number
          slug: string
          system_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price_monthly?: number
          setup_price?: number
          slug: string
          system_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price_monthly?: number
          setup_price?: number
          slug?: string
          system_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "neroxa_products_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "neroxa_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      neroxa_proposals: {
        Row: {
          accepted_at: string | null
          billing_period: string | null
          client_id: string
          commercial_model: string
          created_at: string
          currency: string
          id: string
          maintenance_value: number | null
          notes: string | null
          plan_id: string | null
          public_token: string
          recurring_value: number | null
          rejected_at: string | null
          sent_at: string | null
          setup_value: number
          status: string
          system_id: string | null
          title: string
          updated_at: string
          valid_until: string | null
          version: number
        }
        Insert: {
          accepted_at?: string | null
          billing_period?: string | null
          client_id: string
          commercial_model?: string
          created_at?: string
          currency?: string
          id?: string
          maintenance_value?: number | null
          notes?: string | null
          plan_id?: string | null
          public_token?: string
          recurring_value?: number | null
          rejected_at?: string | null
          sent_at?: string | null
          setup_value?: number
          status?: string
          system_id?: string | null
          title: string
          updated_at?: string
          valid_until?: string | null
          version?: number
        }
        Update: {
          accepted_at?: string | null
          billing_period?: string | null
          client_id?: string
          commercial_model?: string
          created_at?: string
          currency?: string
          id?: string
          maintenance_value?: number | null
          notes?: string | null
          plan_id?: string | null
          public_token?: string
          recurring_value?: number | null
          rejected_at?: string | null
          sent_at?: string | null
          setup_value?: number
          status?: string
          system_id?: string | null
          title?: string
          updated_at?: string
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "neroxa_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "neroxa_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neroxa_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "neroxa_clients"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "neroxa_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "neroxa_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neroxa_proposals_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "neroxa_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neroxa_proposals_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "neroxa_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      neroxa_provisioning_jobs: {
        Row: {
          action: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          organization_id: string
          payload: Json
          started_at: string | null
          status: Database["public"]["Enums"]["neroxa_provisioning_status"]
          system_instance_id: string | null
        }
        Insert: {
          action: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          organization_id: string
          payload?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["neroxa_provisioning_status"]
          system_instance_id?: string | null
        }
        Update: {
          action?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          organization_id?: string
          payload?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["neroxa_provisioning_status"]
          system_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "neroxa_provisioning_jobs_system_instance_id_fkey"
            columns: ["system_instance_id"]
            isOneToOne: false
            referencedRelation: "neroxa_system_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      neroxa_subscriptions: {
        Row: {
          cancelled_at: string | null
          checkout_url: string | null
          contract_id: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          gateway_provider: string | null
          gateway_status: string | null
          gateway_subscription_id: string | null
          gateway_synced_at: string | null
          id: string
          organization_id: string
          plan_id: string
          price: number
          started_at: string
          status: Database["public"]["Enums"]["neroxa_subscription_status"]
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          checkout_url?: string | null
          contract_id?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          gateway_provider?: string | null
          gateway_status?: string | null
          gateway_subscription_id?: string | null
          gateway_synced_at?: string | null
          id?: string
          organization_id: string
          plan_id: string
          price?: number
          started_at?: string
          status?: Database["public"]["Enums"]["neroxa_subscription_status"]
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          checkout_url?: string | null
          contract_id?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          gateway_provider?: string | null
          gateway_status?: string | null
          gateway_subscription_id?: string | null
          gateway_synced_at?: string | null
          id?: string
          organization_id?: string
          plan_id?: string
          price?: number
          started_at?: string
          status?: Database["public"]["Enums"]["neroxa_subscription_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "neroxa_subscriptions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "neroxa_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neroxa_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "neroxa_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      neroxa_support_messages: {
        Row: {
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          internal: boolean
          ticket_id: string
        }
        Insert: {
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          internal?: boolean
          ticket_id: string
        }
        Update: {
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "neroxa_support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "neroxa_support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      neroxa_support_tickets: {
        Row: {
          assignee_user_id: string | null
          category: string
          closed_at: string | null
          created_at: string
          created_by_user_id: string | null
          description: string
          id: string
          last_response_at: string | null
          organization_id: string
          priority: Database["public"]["Enums"]["neroxa_support_ticket_priority"]
          resolved_at: string | null
          status: Database["public"]["Enums"]["neroxa_support_ticket_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          assignee_user_id?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          description: string
          id?: string
          last_response_at?: string | null
          organization_id: string
          priority?: Database["public"]["Enums"]["neroxa_support_ticket_priority"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["neroxa_support_ticket_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          assignee_user_id?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string
          id?: string
          last_response_at?: string | null
          organization_id?: string
          priority?: Database["public"]["Enums"]["neroxa_support_ticket_priority"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["neroxa_support_ticket_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "neroxa_support_tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "neroxa_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neroxa_support_tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "neroxa_clients"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "neroxa_support_tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "neroxa_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      neroxa_system_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          is_primary: boolean
          status: Database["public"]["Enums"]["neroxa_domain_status"]
          system_instance_id: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          is_primary?: boolean
          status?: Database["public"]["Enums"]["neroxa_domain_status"]
          system_instance_id: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          is_primary?: boolean
          status?: Database["public"]["Enums"]["neroxa_domain_status"]
          system_instance_id?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "neroxa_system_domains_system_instance_id_fkey"
            columns: ["system_instance_id"]
            isOneToOne: false
            referencedRelation: "neroxa_system_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      neroxa_system_instances: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          plan_id: string | null
          slug: string
          status: Database["public"]["Enums"]["neroxa_instance_status"]
          subscription_id: string | null
          system_id: string | null
          system_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          plan_id?: string | null
          slug: string
          status?: Database["public"]["Enums"]["neroxa_instance_status"]
          subscription_id?: string | null
          system_id?: string | null
          system_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          plan_id?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["neroxa_instance_status"]
          subscription_id?: string | null
          system_id?: string | null
          system_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "neroxa_system_instances_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "neroxa_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neroxa_system_instances_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "neroxa_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neroxa_system_instances_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "neroxa_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      neroxa_systems: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          system_type: string
          updated_at: string
          version: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          system_type: string
          updated_at?: string
          version?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          system_type?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
    }
    Views: {
      neroxa_clients: {
        Row: {
          acquired_at: string | null
          activated_at: string | null
          cancelled_at: string | null
          contracted_at: string | null
          created_at: string | null
          id: string | null
          legal_name: string | null
          notes: string | null
          organization_id: string | null
          paused_at: string | null
          status: string | null
          tax_id: string | null
          trade_name: string | null
          updated_at: string | null
        }
        Insert: {
          acquired_at?: string | null
          activated_at?: string | null
          cancelled_at?: string | null
          contracted_at?: string | null
          created_at?: string | null
          id?: string | null
          legal_name?: string | null
          notes?: string | null
          organization_id?: string | null
          paused_at?: string | null
          status?: string | null
          tax_id?: string | null
          trade_name?: string | null
          updated_at?: string | null
        }
        Update: {
          acquired_at?: string | null
          activated_at?: string | null
          cancelled_at?: string | null
          contracted_at?: string | null
          created_at?: string | null
          id?: string | null
          legal_name?: string | null
          notes?: string | null
          organization_id?: string | null
          paused_at?: string | null
          status?: string | null
          tax_id?: string | null
          trade_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      activate_neroxa_contract_and_subscription: {
        Args: { p_contract_id: string }
        Returns: string
      }
      apply_neroxa_domain_validation_result: {
        Args: { p_domain_id: string; p_valid: boolean }
        Returns: Database["public"]["Enums"]["neroxa_domain_status"]
      }
      create_neroxa_client: {
        Args: {
          p_legal_name: string
          p_notes: string
          p_tax_id: string
          p_trade_name: string
        }
        Returns: string
      }
      create_neroxa_client_contact: {
        Args: {
          p_client_id: string
          p_email: string
          p_is_primary: boolean
          p_name: string
          p_notes: string
          p_phone: string
          p_role_title: string
          p_whatsapp: string
        }
        Returns: string
      }
      delete_neroxa_system_domain_safely: {
        Args: { p_domain_id: string }
        Returns: Json
      }
      delete_neroxa_system_instance_safely: {
        Args: { p_instance_id: string }
        Returns: Json
      }
      get_neroxa_platform_access: {
        Args: never
        Returns: {
          active: boolean
          role: Database["public"]["Enums"]["neroxa_platform_role"]
        }[]
      }
      get_neroxa_public_contract: { Args: { p_token: string }; Returns: Json }
      get_neroxa_public_proposal: { Args: { p_token: string }; Returns: Json }
      neroxa_has_platform_role: {
        Args: { p_roles: Database["public"]["Enums"]["neroxa_platform_role"][] }
        Returns: boolean
      }
      neroxa_is_platform_member: { Args: never; Returns: boolean }
      prepare_neroxa_implementation_from_subscription: {
        Args: { p_name: string; p_slug: string; p_subscription_id: string }
        Returns: string
      }
      record_neroxa_audit: {
        Args: {
          p_action: string
          p_details?: Json
          p_organization_id?: string
          p_resource_id?: string
          p_resource_type: string
        }
        Returns: string
      }
      respond_neroxa_public_proposal: {
        Args: { p_action: string; p_token: string }
        Returns: Json
      }
      send_neroxa_contract_for_signature: {
        Args: { p_contract_id: string }
        Returns: string
      }
      sign_neroxa_contract: {
        Args: {
          p_contract_id: string
          p_signer_name: string
          p_signer_role: string
        }
        Returns: boolean
      }
      sign_neroxa_contract_as_customer: {
        Args: {
          p_confirmed: boolean
          p_signer_document: string
          p_signer_name: string
          p_token: string
        }
        Returns: boolean
      }
      transition_neroxa_client_status: {
        Args: { p_client_id: string; p_new_status: string }
        Returns: boolean
      }
      transition_neroxa_domain_status: {
        Args: {
          p_domain_id: string
          p_new_status: Database["public"]["Enums"]["neroxa_domain_status"]
        }
        Returns: Database["public"]["Enums"]["neroxa_domain_status"]
      }
      transition_neroxa_instance_status: {
        Args: {
          p_instance_id: string
          p_status: Database["public"]["Enums"]["neroxa_instance_status"]
        }
        Returns: Database["public"]["Enums"]["neroxa_instance_status"]
      }
      update_neroxa_client: {
        Args: {
          p_client_id: string
          p_legal_name: string
          p_notes: string
          p_tax_id: string
          p_trade_name: string
        }
        Returns: boolean
      }
      update_neroxa_provisioning_job_status: {
        Args: {
          p_error_message?: string
          p_job_id: string
          p_status: Database["public"]["Enums"]["neroxa_provisioning_status"]
        }
        Returns: undefined
      }
    }
    Enums: {
      neroxa_billing_period: "MONTHLY" | "YEARLY" | "ONE_TIME"
      neroxa_billing_status:
        | "PENDING"
        | "PAID"
        | "OVERDUE"
        | "CANCELLED"
        | "REFUNDED"
      neroxa_domain_status:
        | "PENDING"
        | "VERIFYING"
        | "VERIFIED"
        | "FAILED"
        | "DISABLED"
      neroxa_instance_status:
        | "PROVISIONING"
        | "ACTIVE"
        | "SUSPENDED"
        | "ARCHIVED"
      neroxa_platform_role: "SUPER_ADMIN" | "ADMIN" | "SUPPORT" | "FINANCE"
      neroxa_provisioning_status:
        | "PENDING"
        | "RUNNING"
        | "COMPLETED"
        | "FAILED"
        | "CANCELLED"
      neroxa_subscription_status:
        | "TRIAL"
        | "ACTIVE"
        | "PAST_DUE"
        | "PAUSED"
        | "CANCELLED"
        | "EXPIRED"
      neroxa_support_ticket_priority: "LOW" | "NORMAL" | "HIGH" | "URGENT"
      neroxa_support_ticket_status:
        | "OPEN"
        | "IN_PROGRESS"
        | "WAITING_CLIENT"
        | "RESOLVED"
        | "CLOSED"
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
      neroxa_billing_period: ["MONTHLY", "YEARLY", "ONE_TIME"],
      neroxa_billing_status: [
        "PENDING",
        "PAID",
        "OVERDUE",
        "CANCELLED",
        "REFUNDED",
      ],
      neroxa_domain_status: [
        "PENDING",
        "VERIFYING",
        "VERIFIED",
        "FAILED",
        "DISABLED",
      ],
      neroxa_instance_status: [
        "PROVISIONING",
        "ACTIVE",
        "SUSPENDED",
        "ARCHIVED",
      ],
      neroxa_platform_role: ["SUPER_ADMIN", "ADMIN", "SUPPORT", "FINANCE"],
      neroxa_provisioning_status: [
        "PENDING",
        "RUNNING",
        "COMPLETED",
        "FAILED",
        "CANCELLED",
      ],
      neroxa_subscription_status: [
        "TRIAL",
        "ACTIVE",
        "PAST_DUE",
        "PAUSED",
        "CANCELLED",
        "EXPIRED",
      ],
      neroxa_support_ticket_priority: ["LOW", "NORMAL", "HIGH", "URGENT"],
      neroxa_support_ticket_status: [
        "OPEN",
        "IN_PROGRESS",
        "WAITING_CLIENT",
        "RESOLVED",
        "CLOSED",
      ],
    },
  },
} as const
