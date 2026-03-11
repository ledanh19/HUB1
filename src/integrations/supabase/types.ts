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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      account_mapping_rules: {
        Row: {
          archived_at: string | null
          cash_account_id: string
          counterparty_type: string | null
          created_at: string
          created_by: string | null
          direction: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_archived: boolean
          link_provider: string | null
          org_id: string
          payment_method: string | null
          payment_type: string | null
          priority: number
          rule_name: string
          source_type: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          cash_account_id: string
          counterparty_type?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_archived?: boolean
          link_provider?: string | null
          org_id?: string
          payment_method?: string | null
          payment_type?: string | null
          priority?: number
          rule_name: string
          source_type?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          cash_account_id?: string
          counterparty_type?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_archived?: boolean
          link_provider?: string | null
          org_id?: string
          payment_method?: string | null
          payment_type?: string | null
          priority?: number
          rule_name?: string
          source_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_mapping_rules_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_opening_balances: {
        Row: {
          as_of_date: string
          cash_account_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          opening_amount: number
          org_id: string
        }
        Insert: {
          as_of_date: string
          cash_account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          opening_amount?: number
          org_id?: string
        }
        Update: {
          as_of_date?: string
          cash_account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          opening_amount?: number
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_opening_balances_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_periods: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          note: string | null
          org_id: string
          period_end: string
          period_name: string
          period_start: string
          unlocked_at: string | null
          unlocked_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          note?: string | null
          org_id?: string
          period_end: string
          period_name: string
          period_start: string
          unlocked_at?: string | null
          unlocked_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          note?: string | null
          org_id?: string
          period_end?: string
          period_name?: string
          period_start?: string
          unlocked_at?: string | null
          unlocked_by?: string | null
        }
        Relationships: []
      }
      ai_pricing_baseline_anchors: {
        Row: {
          anchor_type: string
          avg_adr: number | null
          avg_occupancy: number
          avg_rate: number
          avg_velocity: number
          confidence: number | null
          created_at: string
          id: string
          is_active: boolean | null
          max_rate: number | null
          min_rate: number | null
          period_end: string
          period_start: string
          property_id: string
          rate_std_dev: number | null
          revpar: number | null
          room_type_id: string | null
          sample_size: number | null
          updated_at: string
        }
        Insert: {
          anchor_type: string
          avg_adr?: number | null
          avg_occupancy: number
          avg_rate: number
          avg_velocity: number
          confidence?: number | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          max_rate?: number | null
          min_rate?: number | null
          period_end: string
          period_start: string
          property_id: string
          rate_std_dev?: number | null
          revpar?: number | null
          room_type_id?: string | null
          sample_size?: number | null
          updated_at?: string
        }
        Update: {
          anchor_type?: string
          avg_adr?: number | null
          avg_occupancy?: number
          avg_rate?: number
          avg_velocity?: number
          confidence?: number | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          max_rate?: number | null
          min_rate?: number | null
          period_end?: string
          period_start?: string
          property_id?: string
          rate_std_dev?: number | null
          revpar?: number | null
          room_type_id?: string | null
          sample_size?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_pricing_decision_outcomes: {
        Row: {
          bookings_received: number | null
          created_at: string
          final_occupancy: number | null
          final_remaining_inventory: number | null
          id: string
          outcome: string | null
          outcome_evaluated_at: string | null
          outcome_explanation: string | null
          outcome_score: number | null
          price_after: number | null
          price_before: number | null
          price_change_pct: number | null
          recommendation_id: string
          revenue_impact_estimate: number | null
          updated_at: string
          user_action: string
          user_action_at: string | null
          user_id: string | null
          user_note: string | null
        }
        Insert: {
          bookings_received?: number | null
          created_at?: string
          final_occupancy?: number | null
          final_remaining_inventory?: number | null
          id?: string
          outcome?: string | null
          outcome_evaluated_at?: string | null
          outcome_explanation?: string | null
          outcome_score?: number | null
          price_after?: number | null
          price_before?: number | null
          price_change_pct?: number | null
          recommendation_id: string
          revenue_impact_estimate?: number | null
          updated_at?: string
          user_action: string
          user_action_at?: string | null
          user_id?: string | null
          user_note?: string | null
        }
        Update: {
          bookings_received?: number | null
          created_at?: string
          final_occupancy?: number | null
          final_remaining_inventory?: number | null
          id?: string
          outcome?: string | null
          outcome_evaluated_at?: string | null
          outcome_explanation?: string | null
          outcome_score?: number | null
          price_after?: number | null
          price_before?: number | null
          price_change_pct?: number | null
          recommendation_id?: string
          revenue_impact_estimate?: number | null
          updated_at?: string
          user_action?: string
          user_action_at?: string | null
          user_id?: string | null
          user_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_pricing_decision_outcomes_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "ai_pricing_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_pricing_recommendations: {
        Row: {
          action: string
          action_strength: string | null
          baseline_velocity: number | null
          business_intent: string | null
          confidence: number
          created_at: string
          data_confidence: number
          date_from: string
          date_to: string
          days_to_checkin: number | null
          expires_at: string | null
          explanation_text: string | null
          id: string
          occupancy_at_time: number | null
          priority: string | null
          property_context: Json | null
          property_id: string
          remaining_inventory: number | null
          room_type_id: string | null
          signal_class: string | null
          silence_reason: string | null
          temporal_context: Json | null
          validity_window_hours: number | null
          velocity_at_time: number | null
          why_not_reasons: Json | null
        }
        Insert: {
          action: string
          action_strength?: string | null
          baseline_velocity?: number | null
          business_intent?: string | null
          confidence: number
          created_at?: string
          data_confidence: number
          date_from: string
          date_to: string
          days_to_checkin?: number | null
          expires_at?: string | null
          explanation_text?: string | null
          id?: string
          occupancy_at_time?: number | null
          priority?: string | null
          property_context?: Json | null
          property_id: string
          remaining_inventory?: number | null
          room_type_id?: string | null
          signal_class?: string | null
          silence_reason?: string | null
          temporal_context?: Json | null
          validity_window_hours?: number | null
          velocity_at_time?: number | null
          why_not_reasons?: Json | null
        }
        Update: {
          action?: string
          action_strength?: string | null
          baseline_velocity?: number | null
          business_intent?: string | null
          confidence?: number
          created_at?: string
          data_confidence?: number
          date_from?: string
          date_to?: string
          days_to_checkin?: number | null
          expires_at?: string | null
          explanation_text?: string | null
          id?: string
          occupancy_at_time?: number | null
          priority?: string | null
          property_context?: Json | null
          property_id?: string
          remaining_inventory?: number | null
          room_type_id?: string | null
          signal_class?: string | null
          silence_reason?: string | null
          temporal_context?: Json | null
          validity_window_hours?: number | null
          velocity_at_time?: number | null
          why_not_reasons?: Json | null
        }
        Relationships: []
      }
      ai_pricing_shadow_signals: {
        Row: {
          advisory_direction: string
          baseline_pace: number | null
          baseline_reliability: string | null
          booking_velocity_24h: number | null
          booking_velocity_7d: number | null
          confidence_factors: Json | null
          created_at: string
          current_rate: number | null
          data_confidence: number
          data_freshness_minutes: number | null
          days_to_checkin: number
          explanation_text: string | null
          has_data_lag: boolean | null
          has_inventory_anomaly: boolean | null
          id: string
          lead_time_median: number | null
          property_id: string
          remaining_inventory: number
          room_type_id: string | null
          signal_class: string
          signal_timestamp: string
          stay_date: string
          total_inventory: number
        }
        Insert: {
          advisory_direction: string
          baseline_pace?: number | null
          baseline_reliability?: string | null
          booking_velocity_24h?: number | null
          booking_velocity_7d?: number | null
          confidence_factors?: Json | null
          created_at?: string
          current_rate?: number | null
          data_confidence: number
          data_freshness_minutes?: number | null
          days_to_checkin: number
          explanation_text?: string | null
          has_data_lag?: boolean | null
          has_inventory_anomaly?: boolean | null
          id?: string
          lead_time_median?: number | null
          property_id: string
          remaining_inventory: number
          room_type_id?: string | null
          signal_class: string
          signal_timestamp?: string
          stay_date: string
          total_inventory: number
        }
        Update: {
          advisory_direction?: string
          baseline_pace?: number | null
          baseline_reliability?: string | null
          booking_velocity_24h?: number | null
          booking_velocity_7d?: number | null
          confidence_factors?: Json | null
          created_at?: string
          current_rate?: number | null
          data_confidence?: number
          data_freshness_minutes?: number | null
          days_to_checkin?: number
          explanation_text?: string | null
          has_data_lag?: boolean | null
          has_inventory_anomaly?: boolean | null
          id?: string
          lead_time_median?: number | null
          property_id?: string
          remaining_inventory?: number
          room_type_id?: string | null
          signal_class?: string
          signal_timestamp?: string
          stay_date?: string
          total_inventory?: number
        }
        Relationships: []
      }
      ai_pricing_validation_outcomes: {
        Row: {
          classification: string | null
          context_tag: string | null
          created_at: string
          evaluated_at: string
          final_occupancy_pct: number | null
          final_remaining_inventory: number | null
          had_booking_surge: boolean | null
          had_late_pickup: boolean | null
          id: string
          sellout_risk_score: number | null
          signal_id: string
          sold_out_at: string | null
          vacancy_severity_score: number | null
          weighted_accuracy_score: number | null
        }
        Insert: {
          classification?: string | null
          context_tag?: string | null
          created_at?: string
          evaluated_at?: string
          final_occupancy_pct?: number | null
          final_remaining_inventory?: number | null
          had_booking_surge?: boolean | null
          had_late_pickup?: boolean | null
          id?: string
          sellout_risk_score?: number | null
          signal_id: string
          sold_out_at?: string | null
          vacancy_severity_score?: number | null
          weighted_accuracy_score?: number | null
        }
        Update: {
          classification?: string | null
          context_tag?: string | null
          created_at?: string
          evaluated_at?: string
          final_occupancy_pct?: number | null
          final_remaining_inventory?: number | null
          had_booking_surge?: boolean | null
          had_late_pickup?: boolean | null
          id?: string
          sellout_risk_score?: number | null
          signal_id?: string
          sold_out_at?: string | null
          vacancy_severity_score?: number | null
          weighted_accuracy_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_pricing_validation_outcomes_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "ai_pricing_shadow_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_pricing_weekly_reports: {
        Row: {
          accuracy_weighted: number | null
          calibration_data: Json | null
          created_at: string
          excellent_cases: Json | null
          failed_cases: Json | null
          false_negative_rate: number | null
          false_positive_rate: number | null
          generated_at: string
          go_nogo_reasons: Json | null
          go_nogo_status: string | null
          hold_count: number | null
          id: string
          property_id: string | null
          sellout_accuracy: number | null
          sellout_risk_count: number | null
          total_signals: number | null
          untrusted_conditions: Json | null
          vacancy_accuracy: number | null
          vacancy_risk_count: number | null
          week_end: string
          week_start: string
        }
        Insert: {
          accuracy_weighted?: number | null
          calibration_data?: Json | null
          created_at?: string
          excellent_cases?: Json | null
          failed_cases?: Json | null
          false_negative_rate?: number | null
          false_positive_rate?: number | null
          generated_at?: string
          go_nogo_reasons?: Json | null
          go_nogo_status?: string | null
          hold_count?: number | null
          id?: string
          property_id?: string | null
          sellout_accuracy?: number | null
          sellout_risk_count?: number | null
          total_signals?: number | null
          untrusted_conditions?: Json | null
          vacancy_accuracy?: number | null
          vacancy_risk_count?: number | null
          week_end: string
          week_start: string
        }
        Update: {
          accuracy_weighted?: number | null
          calibration_data?: Json | null
          created_at?: string
          excellent_cases?: Json | null
          failed_cases?: Json | null
          false_negative_rate?: number | null
          false_positive_rate?: number | null
          generated_at?: string
          go_nogo_reasons?: Json | null
          go_nogo_status?: string | null
          hold_count?: number | null
          id?: string
          property_id?: string | null
          sellout_accuracy?: number | null
          sellout_risk_count?: number | null
          total_signals?: number | null
          untrusted_conditions?: Json | null
          vacancy_accuracy?: number | null
          vacancy_risk_count?: number | null
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      approvals: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          note: string | null
          request_payload: Json
          request_type: string
          requested_by: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          request_payload: Json
          request_type: string
          requested_by: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          request_payload?: Json
          request_type?: string
          requested_by?: string
          status?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          entity: string
          entity_id: string | null
          event_time: string
          id: string
          ip_address: string | null
          is_override: boolean | null
          is_sample_data: boolean
          override_reason: string | null
          role_snapshot: Database["public"]["Enums"]["app_role"] | null
          scenario_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          entity: string
          entity_id?: string | null
          event_time?: string
          id?: string
          ip_address?: string | null
          is_override?: boolean | null
          is_sample_data?: boolean
          override_reason?: string | null
          role_snapshot?: Database["public"]["Enums"]["app_role"] | null
          scenario_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          entity?: string
          entity_id?: string | null
          event_time?: string
          id?: string
          ip_address?: string | null
          is_override?: boolean | null
          is_sample_data?: boolean
          override_reason?: string | null
          role_snapshot?: Database["public"]["Enums"]["app_role"] | null
          scenario_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_rules: {
        Row: {
          channels: string[] | null
          created_at: string
          created_by: string | null
          days_of_week: number[] | null
          end_date: string | null
          id: string
          is_active: boolean | null
          priority: number | null
          property_id: string
          rate_plan_ids: string[] | null
          room_type_ids: string[] | null
          rule_type: string
          rule_value: Json | null
          start_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          channels?: string[] | null
          created_at?: string
          created_by?: string | null
          days_of_week?: number[] | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          priority?: number | null
          property_id: string
          rate_plan_ids?: string[] | null
          room_type_ids?: string[] | null
          rule_type: string
          rule_value?: Json | null
          start_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          channels?: string[] | null
          created_at?: string
          created_by?: string | null
          days_of_week?: number[] | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          priority?: number | null
          property_id?: string
          rate_plan_ids?: string[] | null
          room_type_ids?: string[] | null
          rule_type?: string
          rule_value?: Json | null
          start_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      backfill_runs: {
        Row: {
          completed_at: string | null
          error_details: Json | null
          id: string
          metadata: Json | null
          rows_failed: number | null
          rows_processed: number | null
          rows_skipped: number | null
          run_type: string
          started_at: string
        }
        Insert: {
          completed_at?: string | null
          error_details?: Json | null
          id?: string
          metadata?: Json | null
          rows_failed?: number | null
          rows_processed?: number | null
          rows_skipped?: number | null
          run_type: string
          started_at?: string
        }
        Update: {
          completed_at?: string | null
          error_details?: Json | null
          id?: string
          metadata?: Json | null
          rows_failed?: number | null
          rows_processed?: number | null
          rows_skipped?: number | null
          run_type?: string
          started_at?: string
        }
        Relationships: []
      }
      booking_amount_overrides: {
        Row: {
          amount: number
          commission_percent: number | null
          confirmed_at: string
          confirmed_by: string | null
          created_at: string
          id: string
          note: string | null
          unified_booking_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          commission_percent?: number | null
          confirmed_at?: string
          confirmed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          unified_booking_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          commission_percent?: number | null
          confirmed_at?: string
          confirmed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          unified_booking_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      booking_changes: {
        Row: {
          after_data: Json | null
          before_data: Json | null
          change_source: string
          change_type: string
          changed_fields: Json | null
          created_at: string
          id: string
          pms_booking_id: string | null
          source_updated_at: string | null
          sync_run_id: string | null
          unified_booking_id: string
        }
        Insert: {
          after_data?: Json | null
          before_data?: Json | null
          change_source?: string
          change_type: string
          changed_fields?: Json | null
          created_at?: string
          id?: string
          pms_booking_id?: string | null
          source_updated_at?: string | null
          sync_run_id?: string | null
          unified_booking_id: string
        }
        Update: {
          after_data?: Json | null
          before_data?: Json | null
          change_source?: string
          change_type?: string
          changed_fields?: Json | null
          created_at?: string
          id?: string
          pms_booking_id?: string | null
          source_updated_at?: string | null
          sync_run_id?: string | null
          unified_booking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_changes_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_data_health: {
        Row: {
          anomaly_type: string | null
          assigned_to: string | null
          created_at: string
          detected_at: string | null
          health_status: Database["public"]["Enums"]["health_status"]
          id: string
          issue_type: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string | null
          unified_booking_id: string
        }
        Insert: {
          anomaly_type?: string | null
          assigned_to?: string | null
          created_at?: string
          detected_at?: string | null
          health_status?: Database["public"]["Enums"]["health_status"]
          id?: string
          issue_type?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          unified_booking_id: string
        }
        Update: {
          anomaly_type?: string | null
          assigned_to?: string | null
          created_at?: string
          detected_at?: string | null
          health_status?: Database["public"]["Enums"]["health_status"]
          id?: string
          issue_type?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          unified_booking_id?: string
        }
        Relationships: []
      }
      booking_guest_links: {
        Row: {
          confidence: Database["public"]["Enums"]["confidence_level"]
          created_at: string
          guest_id: string
          id: string
          is_sample_data: boolean
          match_method: Database["public"]["Enums"]["match_method"]
          matched_at: string
          matched_by: string | null
          role: Database["public"]["Enums"]["guest_role"]
          scenario_id: string | null
          unified_booking_id: string
        }
        Insert: {
          confidence?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string
          guest_id: string
          id?: string
          is_sample_data?: boolean
          match_method: Database["public"]["Enums"]["match_method"]
          matched_at?: string
          matched_by?: string | null
          role?: Database["public"]["Enums"]["guest_role"]
          scenario_id?: string | null
          unified_booking_id: string
        }
        Update: {
          confidence?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string
          guest_id?: string
          id?: string
          is_sample_data?: boolean
          match_method?: Database["public"]["Enums"]["match_method"]
          matched_at?: string
          matched_by?: string | null
          role?: Database["public"]["Enums"]["guest_role"]
          scenario_id?: string | null
          unified_booking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_guest_links_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_guest_links_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_room_lines_mirror: {
        Row: {
          amount: number | null
          check_in_date: string
          check_out_date: string
          created_at: string
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          line_index: number
          line_key: string
          nights: number
          pms_booking_id: string
          rate_plan: string | null
          room_type: string | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          check_in_date: string
          check_out_date: string
          created_at?: string
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          line_index?: number
          line_key: string
          nights?: number
          pms_booking_id: string
          rate_plan?: string | null
          room_type?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          check_in_date?: string
          check_out_date?: string
          created_at?: string
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          line_index?: number
          line_key?: string
          nights?: number
          pms_booking_id?: string
          rate_plan?: string | null
          room_type?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      booking_scenario_map: {
        Row: {
          created_at: string
          id: string
          scenario_id: string
          unified_booking_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          scenario_id: string
          unified_booking_id: string
        }
        Update: {
          created_at?: string
          id?: string
          scenario_id?: string
          unified_booking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_scenario_map_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_warnings: {
        Row: {
          created_at: string
          id: string
          is_resolved: boolean
          message: string
          metadata: Json | null
          pms_booking_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          sync_run_id: string | null
          unified_booking_id: string
          warning_code: string
          warning_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_resolved?: boolean
          message: string
          metadata?: Json | null
          pms_booking_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          sync_run_id?: string | null
          unified_booking_id: string
          warning_code: string
          warning_type: string
        }
        Update: {
          created_at?: string
          id?: string
          is_resolved?: boolean
          message?: string
          metadata?: Json | null
          pms_booking_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          sync_run_id?: string | null
          unified_booking_id?: string
          warning_code?: string
          warning_type?: string
        }
        Relationships: []
      }
      bookings_mirror: {
        Row: {
          booking_date: string | null
          booking_status: Database["public"]["Enums"]["booking_status"]
          booking_type: string | null
          channex_property_id: string | null
          channex_revision_id: string | null
          channex_room_type_id: string | null
          channex_status: string | null
          channex_user_id: string | null
          check_in_date: string
          check_out_date: string
          commission_amount: number | null
          commission_rate: number | null
          created_at: string
          customer_id: string | null
          guest_email: string | null
          guest_name: string
          guest_phone: string | null
          id: string
          mapping_status: string | null
          nationality: string | null
          nights: number
          ota_booking_code: string | null
          ota_property_id: string | null
          ota_source: string
          payment_type: Database["public"]["Enums"]["payment_type"]
          pms_booking_id: string | null
          pms_property_id: string | null
          pms_property_name: string | null
          provider: string | null
          provider_booking_id: string | null
          room_type: string | null
          source_updated_at: string | null
          synced_at: string | null
          total_amount_gross: number | null
          total_amount_net: number | null
          unified_booking_id: string
          updated_at: string
        }
        Insert: {
          booking_date?: string | null
          booking_status?: Database["public"]["Enums"]["booking_status"]
          booking_type?: string | null
          channex_property_id?: string | null
          channex_revision_id?: string | null
          channex_room_type_id?: string | null
          channex_status?: string | null
          channex_user_id?: string | null
          check_in_date: string
          check_out_date: string
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string
          customer_id?: string | null
          guest_email?: string | null
          guest_name: string
          guest_phone?: string | null
          id?: string
          mapping_status?: string | null
          nationality?: string | null
          nights: number
          ota_booking_code?: string | null
          ota_property_id?: string | null
          ota_source: string
          payment_type: Database["public"]["Enums"]["payment_type"]
          pms_booking_id?: string | null
          pms_property_id?: string | null
          pms_property_name?: string | null
          provider?: string | null
          provider_booking_id?: string | null
          room_type?: string | null
          source_updated_at?: string | null
          synced_at?: string | null
          total_amount_gross?: number | null
          total_amount_net?: number | null
          unified_booking_id: string
          updated_at?: string
        }
        Update: {
          booking_date?: string | null
          booking_status?: Database["public"]["Enums"]["booking_status"]
          booking_type?: string | null
          channex_property_id?: string | null
          channex_revision_id?: string | null
          channex_room_type_id?: string | null
          channex_status?: string | null
          channex_user_id?: string | null
          check_in_date?: string
          check_out_date?: string
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string
          customer_id?: string | null
          guest_email?: string | null
          guest_name?: string
          guest_phone?: string | null
          id?: string
          mapping_status?: string | null
          nationality?: string | null
          nights?: number
          ota_booking_code?: string | null
          ota_property_id?: string | null
          ota_source?: string
          payment_type?: Database["public"]["Enums"]["payment_type"]
          pms_booking_id?: string | null
          pms_property_id?: string | null
          pms_property_name?: string | null
          provider?: string | null
          provider_booking_id?: string | null
          room_type?: string | null
          source_updated_at?: string | null
          synced_at?: string | null
          total_amount_gross?: number | null
          total_amount_net?: number | null
          unified_booking_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_mirror_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_accounts: {
        Row: {
          account_code: string
          account_name: string
          account_number: string | null
          account_type: string
          archived_at: string | null
          bank_name: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_archived: boolean
          is_default: boolean
          note: string | null
          org_id: string
          updated_at: string
        }
        Insert: {
          account_code: string
          account_name: string
          account_number?: string | null
          account_type: string
          archived_at?: string | null
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          is_default?: boolean
          note?: string | null
          org_id?: string
          updated_at?: string
        }
        Update: {
          account_code?: string
          account_name?: string
          account_number?: string | null
          account_type?: string
          archived_at?: string | null
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          is_default?: boolean
          note?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      cash_outs: {
        Row: {
          amount: number
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          created_at: string
          currency: string
          id: string
          is_out_of_process: boolean
          is_sample_data: boolean
          note: string | null
          out_of_process_reason: string | null
          paid_at: string
          paid_by: string | null
          payment_gateway: string | null
          payment_method: string
          payment_request_id: string | null
          receipt_image: string | null
          receipt_status: string | null
          recipient_name: string | null
          scenario_id: string | null
          settlement_id: string | null
          settlement_type: string | null
          transfer_reference: string | null
        }
        Insert: {
          amount: number
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          is_out_of_process?: boolean
          is_sample_data?: boolean
          note?: string | null
          out_of_process_reason?: string | null
          paid_at?: string
          paid_by?: string | null
          payment_gateway?: string | null
          payment_method?: string
          payment_request_id?: string | null
          receipt_image?: string | null
          receipt_status?: string | null
          recipient_name?: string | null
          scenario_id?: string | null
          settlement_id?: string | null
          settlement_type?: string | null
          transfer_reference?: string | null
        }
        Update: {
          amount?: number
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          is_out_of_process?: boolean
          is_sample_data?: boolean
          note?: string | null
          out_of_process_reason?: string | null
          paid_at?: string
          paid_by?: string | null
          payment_gateway?: string | null
          payment_method?: string
          payment_request_id?: string | null
          receipt_image?: string | null
          receipt_status?: string | null
          recipient_name?: string | null
          scenario_id?: string | null
          settlement_id?: string | null
          settlement_type?: string | null
          transfer_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_outs_payment_request_id_fkey"
            columns: ["payment_request_id"]
            isOneToOne: false
            referencedRelation: "payment_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_scenario"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_transfers: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          from_cash_account_id: string
          id: string
          is_voided: boolean
          note: string | null
          org_id: string
          to_cash_account_id: string
          transfer_code: string
          transfer_date: string
          voided_at: string | null
          voided_by: string | null
          voided_reason: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          from_cash_account_id: string
          id?: string
          is_voided?: boolean
          note?: string | null
          org_id?: string
          to_cash_account_id: string
          transfer_code: string
          transfer_date: string
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          from_cash_account_id?: string
          id?: string
          is_voided?: boolean
          note?: string | null
          org_id?: string
          to_cash_account_id?: string
          transfer_code?: string
          transfer_date?: string
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_transfers_from_cash_account_id_fkey"
            columns: ["from_cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transfers_to_cash_account_id_fkey"
            columns: ["to_cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      cashflow_entries: {
        Row: {
          amount: number
          cash_date: string
          counterparty_id: string | null
          counterparty_type: string
          created_at: string
          created_by: string | null
          currency: string
          direction: string
          id: string
          is_sample_data: boolean
          metadata: Json | null
          note: string | null
          scenario_id: string | null
          source_id: string | null
          source_type: string
          updated_at: string | null
        }
        Insert: {
          amount?: number
          cash_date: string
          counterparty_id?: string | null
          counterparty_type: string
          created_at?: string
          created_by?: string | null
          currency?: string
          direction: string
          id?: string
          is_sample_data?: boolean
          metadata?: Json | null
          note?: string | null
          scenario_id?: string | null
          source_id?: string | null
          source_type: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          cash_date?: string
          counterparty_id?: string | null
          counterparty_type?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          direction?: string
          id?: string
          is_sample_data?: boolean
          metadata?: Json | null
          note?: string | null
          scenario_id?: string | null
          source_id?: string | null
          source_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_entries_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      cashflow_ledger_type_map: {
        Row: {
          cashflow_source_type: string
          created_at: string
          enforcement: string
          ledger_source_type: string | null
          migration_target: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          cashflow_source_type: string
          created_at?: string
          enforcement?: string
          ledger_source_type?: string | null
          migration_target?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          cashflow_source_type?: string
          created_at?: string
          enforcement?: string
          ledger_source_type?: string | null
          migration_target?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cashflow_whitelist_events: {
        Row: {
          amount: number
          cash_date: string
          cashflow_id: string
          created_at: string
          created_by: string | null
          direction: string
          id: string
          note: string | null
          org_id: string
          source_id: string | null
          source_type: string
        }
        Insert: {
          amount: number
          cash_date: string
          cashflow_id: string
          created_at?: string
          created_by?: string | null
          direction: string
          id?: string
          note?: string | null
          org_id?: string
          source_id?: string | null
          source_type: string
        }
        Update: {
          amount?: number
          cash_date?: string
          cashflow_id?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          note?: string | null
          org_id?: string
          source_id?: string | null
          source_type?: string
        }
        Relationships: []
      }
      channels: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
        }
        Relationships: []
      }
      channex_groups: {
        Row: {
          channex_group_id: string
          channex_user_id: string | null
          created_at: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          channex_group_id: string
          channex_user_id?: string | null
          created_at?: string
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          channex_group_id?: string
          channex_user_id?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      channex_mappings: {
        Row: {
          channex_property_id: string
          channex_room_type_id: string | null
          created_at: string
          first_synced_at: string | null
          id: string
          internal_property_id: string | null
          internal_room_type_id: string | null
          property_name: string | null
          raw_data: Json | null
          room_type_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          channex_property_id: string
          channex_room_type_id?: string | null
          created_at?: string
          first_synced_at?: string | null
          id?: string
          internal_property_id?: string | null
          internal_room_type_id?: string | null
          property_name?: string | null
          raw_data?: Json | null
          room_type_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          channex_property_id?: string
          channex_room_type_id?: string | null
          created_at?: string
          first_synced_at?: string | null
          id?: string
          internal_property_id?: string | null
          internal_room_type_id?: string | null
          property_name?: string | null
          raw_data?: Json | null
          room_type_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      channex_property_groups: {
        Row: {
          channex_group_id: string
          channex_property_id: string
          created_at: string
          id: string
        }
        Insert: {
          channex_group_id: string
          channex_property_id: string
          created_at?: string
          id?: string
        }
        Update: {
          channex_group_id?: string
          channex_property_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      channex_user_properties: {
        Row: {
          channex_property_id: string
          channex_user_id: string
          created_at: string
          id: string
          is_primary: boolean | null
          permissions: Json | null
          property_name: string | null
          property_status: string | null
          updated_at: string
        }
        Insert: {
          channex_property_id: string
          channex_user_id: string
          created_at?: string
          id?: string
          is_primary?: boolean | null
          permissions?: Json | null
          property_name?: string | null
          property_status?: string | null
          updated_at?: string
        }
        Update: {
          channex_property_id?: string
          channex_user_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean | null
          permissions?: Json | null
          property_name?: string | null
          property_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      channex_users: {
        Row: {
          api_key_last_4: string | null
          avatar_url: string | null
          channex_user_id: string
          company_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          last_synced_at: string | null
          locale: string | null
          name: string | null
          permissions: Json | null
          phone: string | null
          properties_count: number | null
          raw_data: Json | null
          settings: Json | null
          subscription_plan: string | null
          subscription_status: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          api_key_last_4?: string | null
          avatar_url?: string | null
          channex_user_id: string
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          locale?: string | null
          name?: string | null
          permissions?: Json | null
          phone?: string | null
          properties_count?: number | null
          raw_data?: Json | null
          settings?: Json | null
          subscription_plan?: string | null
          subscription_status?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          api_key_last_4?: string | null
          avatar_url?: string | null
          channex_user_id?: string
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          locale?: string | null
          name?: string | null
          permissions?: Json | null
          phone?: string | null
          properties_count?: number | null
          raw_data?: Json | null
          settings?: Json | null
          subscription_plan?: string | null
          subscription_status?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      collection_payout_allocations: {
        Row: {
          allocated_amount: number
          collection_id: string
          created_at: string | null
          id: string
          payout_id: string
        }
        Insert: {
          allocated_amount: number
          collection_id: string
          created_at?: string | null
          id?: string
          payout_id: string
        }
        Update: {
          allocated_amount?: number
          collection_id?: string
          created_at?: string | null
          id?: string
          payout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_payout_allocations_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "hotel_collects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_payout_allocations_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "ota_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_payout_allocations_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "v_financial_integrity_summary"
            referencedColumns: ["entity_id"]
          },
          {
            foreignKeyName: "collection_payout_allocations_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "v_no_show_reclass_gaps"
            referencedColumns: ["payout_id"]
          },
        ]
      }
      commission_receivables: {
        Row: {
          commission_amount: number
          created_at: string
          created_by: string | null
          currency: string
          due_date: string | null
          id: string
          note: string | null
          paid_at: string | null
          partner_id: string
          receivable_type: string
          status: string
          unified_booking_id: string
        }
        Insert: {
          commission_amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          note?: string | null
          paid_at?: string | null
          partner_id: string
          receivable_type: string
          status?: string
          unified_booking_id: string
        }
        Update: {
          commission_amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          note?: string | null
          paid_at?: string | null
          partner_id?: string
          receivable_type?: string
          status?: string
          unified_booking_id?: string
        }
        Relationships: []
      }
      conversation_cases: {
        Row: {
          assigned_to: string | null
          booking_id: string | null
          category: string
          conversation_id: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          priority: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          summary: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          booking_id?: string | null
          category: string
          conversation_id: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          priority?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          summary: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          booking_id?: string | null
          category?: string
          conversation_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          priority?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_cases_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_tags: {
        Row: {
          added_at: string
          added_by: string
          conversation_id: string
          id: string
          tag_name: string
        }
        Insert: {
          added_at?: string
          added_by: string
          conversation_id: string
          id?: string
          tag_name: string
        }
        Update: {
          added_at?: string
          added_by?: string
          conversation_id?: string
          id?: string
          tag_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_tags_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_at: string | null
          assigned_team: string | null
          assigned_to_user_id: string | null
          assignment_status: string
          channel_provider: string
          channel_type: string
          created_at: string
          external_conversation_id: string
          first_response_at: string | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          is_messaging_supported: boolean | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_outbound_at: string | null
          metadata: Json | null
          priority: string | null
          property_id: string
          resolved_at: string | null
          resolved_by_user_id: string | null
          status: string
          synced_at: string | null
          tenant_id: string | null
          unified_booking_id: string | null
          unread_count: number
          updated_at: string
          wa_customer_phone: string | null
          wa_phone_number_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_team?: string | null
          assigned_to_user_id?: string | null
          assignment_status?: string
          channel_provider?: string
          channel_type?: string
          created_at?: string
          external_conversation_id: string
          first_response_at?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          is_messaging_supported?: boolean | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_outbound_at?: string | null
          metadata?: Json | null
          priority?: string | null
          property_id: string
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          status?: string
          synced_at?: string | null
          tenant_id?: string | null
          unified_booking_id?: string | null
          unread_count?: number
          updated_at?: string
          wa_customer_phone?: string | null
          wa_phone_number_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_team?: string | null
          assigned_to_user_id?: string | null
          assignment_status?: string
          channel_provider?: string
          channel_type?: string
          created_at?: string
          external_conversation_id?: string
          first_response_at?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          is_messaging_supported?: boolean | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_outbound_at?: string | null
          metadata?: Json | null
          priority?: string | null
          property_id?: string
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          status?: string
          synced_at?: string | null
          tenant_id?: string | null
          unified_booking_id?: string | null
          unread_count?: number
          updated_at?: string
          wa_customer_phone?: string | null
          wa_phone_number_id?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_sample_data: boolean
          nationality: string | null
          phone: string | null
          scenario_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_sample_data?: boolean
          nationality?: string | null
          phone?: string | null
          scenario_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_sample_data?: boolean
          nationality?: string | null
          phone?: string | null
          scenario_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_attachments: {
        Row: {
          created_at: string
          dispute_id: string
          file_name: string
          file_type: string
          file_url: string
          id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          dispute_id: string
          file_name: string
          file_type?: string
          file_url: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          dispute_id?: string
          file_name?: string
          file_type?: string
          file_url?: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispute_attachments_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "ota_disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      email_accounts: {
        Row: {
          created_at: string
          created_by: string
          email_address: string
          error_at: string | null
          error_code: string | null
          expiry_at: string | null
          id: string
          last_sync_at: string | null
          provider: string
          refresh_cipher: string | null
          scope_level: string
          status: string
          sync_cursor: string | null
          syncing_since: string | null
          tenant_id: string
          token_cipher: string | null
          token_refresh_locked_at: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by: string
          email_address: string
          error_at?: string | null
          error_code?: string | null
          expiry_at?: string | null
          id?: string
          last_sync_at?: string | null
          provider?: string
          refresh_cipher?: string | null
          scope_level?: string
          status?: string
          sync_cursor?: string | null
          syncing_since?: string | null
          tenant_id: string
          token_cipher?: string | null
          token_refresh_locked_at?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          email_address?: string
          error_at?: string | null
          error_code?: string | null
          expiry_at?: string | null
          id?: string
          last_sync_at?: string | null
          provider?: string
          refresh_cipher?: string | null
          scope_level?: string
          status?: string
          sync_cursor?: string | null
          syncing_since?: string | null
          tenant_id?: string
          token_cipher?: string | null
          token_refresh_locked_at?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      email_actions_audit: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          email_account_id: string | null
          id: string
          message_id: string | null
          meta: Json | null
          tenant_id: string
          thread_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          email_account_id?: string | null
          id?: string
          message_id?: string | null
          meta?: Json | null
          tenant_id: string
          thread_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          email_account_id?: string | null
          id?: string
          message_id?: string | null
          meta?: Json | null
          tenant_id?: string
          thread_id?: string | null
        }
        Relationships: []
      }
      email_attachments: {
        Row: {
          created_at: string
          filename: string | null
          id: string
          message_id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          filename?: string | null
          id?: string
          message_id: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          filename?: string | null
          id?: string
          message_id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_audit_logs: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          id: string
          tenant_id: string
          thread_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          tenant_id: string
          thread_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          tenant_id?: string
          thread_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_audit_logs_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          attachments_json: Json | null
          bcc_json: Json | null
          body_html: string | null
          body_text: string | null
          cc_json: Json | null
          client_request_id: string | null
          created_at: string
          direction: string
          email_account_id: string
          error_code: string | null
          error_message: string | null
          from_json: Json | null
          gmail_internal_date: number | null
          has_attachments: boolean
          headers: Json | null
          id: string
          in_reply_to: string | null
          message_id: string | null
          provider_message_id: string
          recipients: Json | null
          sender: string | null
          sent_at: string | null
          status: string | null
          subject: string | null
          tenant_id: string
          thread_id: string
          to_json: Json | null
          updated_at: string | null
        }
        Insert: {
          attachments_json?: Json | null
          bcc_json?: Json | null
          body_html?: string | null
          body_text?: string | null
          cc_json?: Json | null
          client_request_id?: string | null
          created_at?: string
          direction: string
          email_account_id: string
          error_code?: string | null
          error_message?: string | null
          from_json?: Json | null
          gmail_internal_date?: number | null
          has_attachments?: boolean
          headers?: Json | null
          id?: string
          in_reply_to?: string | null
          message_id?: string | null
          provider_message_id: string
          recipients?: Json | null
          sender?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          tenant_id: string
          thread_id: string
          to_json?: Json | null
          updated_at?: string | null
        }
        Update: {
          attachments_json?: Json | null
          bcc_json?: Json | null
          body_html?: string | null
          body_text?: string | null
          cc_json?: Json | null
          client_request_id?: string | null
          created_at?: string
          direction?: string
          email_account_id?: string
          error_code?: string | null
          error_message?: string | null
          from_json?: Json | null
          gmail_internal_date?: number | null
          has_attachments?: boolean
          headers?: Json | null
          id?: string
          in_reply_to?: string | null
          message_id?: string | null
          provider_message_id?: string
          recipients?: Json | null
          sender?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          tenant_id?: string
          thread_id?: string
          to_json?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_email_account_id_fkey"
            columns: ["email_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          scope_level: string
          state_token: string
          tenant_id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          scope_level?: string
          state_token: string
          tenant_id: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          scope_level?: string
          state_token?: string
          tenant_id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      email_sync_state: {
        Row: {
          account_id: string
          backfill_cursor: string | null
          backfill_done: boolean
          backfill_start_date: string | null
          id: string
          last_history_id: string | null
          last_synced_at: string | null
          tenant_id: string
          total_messages_synced: number
          total_threads_synced: number
          updated_at: string
        }
        Insert: {
          account_id: string
          backfill_cursor?: string | null
          backfill_done?: boolean
          backfill_start_date?: string | null
          id?: string
          last_history_id?: string | null
          last_synced_at?: string | null
          tenant_id: string
          total_messages_synced?: number
          total_threads_synced?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          backfill_cursor?: string | null
          backfill_done?: boolean
          backfill_start_date?: string | null
          id?: string
          last_history_id?: string | null
          last_synced_at?: string | null
          tenant_id?: string
          total_messages_synced?: number
          total_threads_synced?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sync_state_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_thread_ai_suggestions: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          apply_status: string
          confidence: number
          created_at: string
          id: string
          last_message_id: string | null
          model: string
          prompt_version: string | null
          reasons: Json
          scored_at: string
          suggested_priority: string | null
          suggested_tag: string
          suggested_workflow_status: string | null
          tenant_id: string
          thread_id: string
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          apply_status?: string
          confidence: number
          created_at?: string
          id?: string
          last_message_id?: string | null
          model?: string
          prompt_version?: string | null
          reasons?: Json
          scored_at?: string
          suggested_priority?: string | null
          suggested_tag: string
          suggested_workflow_status?: string | null
          tenant_id: string
          thread_id: string
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          apply_status?: string
          confidence?: number
          created_at?: string
          id?: string
          last_message_id?: string | null
          model?: string
          prompt_version?: string | null
          reasons?: Json
          scored_at?: string
          suggested_priority?: string | null
          suggested_tag?: string
          suggested_workflow_status?: string | null
          tenant_id?: string
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_thread_ai_suggestions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_thread_notes: {
        Row: {
          created_at: string
          created_by: string
          id: string
          note: string
          thread_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          note: string
          thread_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          note?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_thread_notes_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_thread_participants: {
        Row: {
          email: string
          id: string
          role: string
          thread_id: string
        }
        Insert: {
          email: string
          id?: string
          role: string
          thread_id: string
        }
        Update: {
          email?: string
          id?: string
          role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_thread_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_thread_workflow: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          booking_linked_at: string | null
          booking_linked_by: string | null
          booking_unified_id: string | null
          created_at: string
          id: string
          status: string
          status_updated_at: string | null
          status_updated_by: string | null
          thread_id: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          booking_linked_at?: string | null
          booking_linked_by?: string | null
          booking_unified_id?: string | null
          created_at?: string
          id?: string
          status?: string
          status_updated_at?: string | null
          status_updated_by?: string | null
          thread_id: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          booking_linked_at?: string | null
          booking_linked_by?: string | null
          booking_unified_id?: string | null
          created_at?: string
          id?: string
          status?: string
          status_updated_at?: string | null
          status_updated_by?: string | null
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_thread_workflow_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: true
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_threads: {
        Row: {
          created_at: string
          email_account_id: string
          id: string
          is_muted: boolean
          labels: Json | null
          last_message_at: string | null
          manual_override: boolean
          owner_id: string | null
          participants: Json | null
          primary_participant: string | null
          primary_participant_email: string | null
          primary_participant_name: string | null
          priority: string
          provider_thread_id: string
          snippet: string | null
          status_updated_at: string | null
          status_updated_by: string | null
          subject: string | null
          tag: string
          tag_source: string
          tenant_id: string
          unread_count: number
          updated_at: string
          workflow_status: string
        }
        Insert: {
          created_at?: string
          email_account_id: string
          id?: string
          is_muted?: boolean
          labels?: Json | null
          last_message_at?: string | null
          manual_override?: boolean
          owner_id?: string | null
          participants?: Json | null
          primary_participant?: string | null
          primary_participant_email?: string | null
          primary_participant_name?: string | null
          priority?: string
          provider_thread_id: string
          snippet?: string | null
          status_updated_at?: string | null
          status_updated_by?: string | null
          subject?: string | null
          tag?: string
          tag_source?: string
          tenant_id: string
          unread_count?: number
          updated_at?: string
          workflow_status?: string
        }
        Update: {
          created_at?: string
          email_account_id?: string
          id?: string
          is_muted?: boolean
          labels?: Json | null
          last_message_at?: string | null
          manual_override?: boolean
          owner_id?: string | null
          participants?: Json | null
          primary_participant?: string | null
          primary_participant_email?: string | null
          primary_participant_name?: string | null
          priority?: string
          provider_thread_id?: string
          snippet?: string | null
          status_updated_at?: string | null
          status_updated_by?: string | null
          subject?: string | null
          tag?: string
          tag_source?: string
          tenant_id?: string
          unread_count?: number
          updated_at?: string
          workflow_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_threads_email_account_id_fkey"
            columns: ["email_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      export_logs: {
        Row: {
          entity: string
          export_type: string
          exported_at: string
          filter_criteria: Json | null
          id: string
          record_count: number | null
          user_id: string
        }
        Insert: {
          entity: string
          export_type: string
          exported_at?: string
          filter_criteria?: Json | null
          id?: string
          record_count?: number | null
          user_id: string
        }
        Update: {
          entity?: string
          export_type?: string
          exported_at?: string
          filter_criteria?: Json | null
          id?: string
          record_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      financial_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          note: string | null
          period_month: number
          period_year: number
          status: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          period_month: number
          period_year: number
          status?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          period_month?: number
          period_year?: number
          status?: string
        }
        Relationships: []
      }
      guest_documents: {
        Row: {
          created_at: string
          document_image: string | null
          document_number: string | null
          document_type: Database["public"]["Enums"]["document_type"]
          guest_name: string | null
          id: string
          is_sample_data: boolean
          nationality: string | null
          scenario_id: string | null
          sent_to_host_at: string | null
          sent_to_host_status: string
          unified_booking_id: string
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_image?: string | null
          document_number?: string | null
          document_type: Database["public"]["Enums"]["document_type"]
          guest_name?: string | null
          id?: string
          is_sample_data?: boolean
          nationality?: string | null
          scenario_id?: string | null
          sent_to_host_at?: string | null
          sent_to_host_status?: string
          unified_booking_id: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_image?: string | null
          document_number?: string | null
          document_type?: Database["public"]["Enums"]["document_type"]
          guest_name?: string | null
          id?: string
          is_sample_data?: boolean
          nationality?: string | null
          scenario_id?: string | null
          sent_to_host_at?: string | null
          sent_to_host_status?: string
          unified_booking_id?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_documents_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_identities: {
        Row: {
          created_at: string
          email_norm: string | null
          email_raw: string | null
          guest_id: string
          id: string
          is_sample_data: boolean
          name_norm: string | null
          name_raw: string | null
          phone_is_proxy: boolean
          phone_norm: string | null
          phone_raw: string | null
          scenario_id: string | null
          source_guest_key: string | null
          source_name: string
          source_type: Database["public"]["Enums"]["guest_source_type"]
        }
        Insert: {
          created_at?: string
          email_norm?: string | null
          email_raw?: string | null
          guest_id: string
          id?: string
          is_sample_data?: boolean
          name_norm?: string | null
          name_raw?: string | null
          phone_is_proxy?: boolean
          phone_norm?: string | null
          phone_raw?: string | null
          scenario_id?: string | null
          source_guest_key?: string | null
          source_name: string
          source_type: Database["public"]["Enums"]["guest_source_type"]
        }
        Update: {
          created_at?: string
          email_norm?: string | null
          email_raw?: string | null
          guest_id?: string
          id?: string
          is_sample_data?: boolean
          name_norm?: string | null
          name_raw?: string | null
          phone_is_proxy?: boolean
          phone_norm?: string | null
          phone_raw?: string | null
          scenario_id?: string | null
          source_guest_key?: string | null
          source_name?: string
          source_type?: Database["public"]["Enums"]["guest_source_type"]
        }
        Relationships: [
          {
            foreignKeyName: "guest_identities_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_identities_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_merge_history: {
        Row: {
          id: string
          is_rollback_available: boolean
          merge_reason: string | null
          merged_at: string
          merged_by: string | null
          merged_from_guest_id: string
          merged_guest_data: Json
          merged_to_guest_id: string
        }
        Insert: {
          id?: string
          is_rollback_available?: boolean
          merge_reason?: string | null
          merged_at?: string
          merged_by?: string | null
          merged_from_guest_id: string
          merged_guest_data: Json
          merged_to_guest_id: string
        }
        Update: {
          id?: string
          is_rollback_available?: boolean
          merge_reason?: string | null
          merged_at?: string
          merged_by?: string | null
          merged_from_guest_id?: string
          merged_guest_data?: Json
          merged_to_guest_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_merge_history_merged_to_guest_id_fkey"
            columns: ["merged_to_guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_merge_suggestions: {
        Row: {
          confidence_score: number
          created_at: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_guest_id: string
          status: string
          suggestion_reason: string
          target_guest_id: string
        }
        Insert: {
          confidence_score?: number
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_guest_id: string
          status?: string
          suggestion_reason: string
          target_guest_id: string
        }
        Update: {
          confidence_score?: number
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_guest_id?: string
          status?: string
          suggestion_reason?: string
          target_guest_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_merge_suggestions_source_guest_id_fkey"
            columns: ["source_guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_merge_suggestions_target_guest_id_fkey"
            columns: ["target_guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      guests: {
        Row: {
          confidence_level: Database["public"]["Enums"]["confidence_level"]
          created_at: string
          full_name: string
          id: string
          is_sample_data: boolean
          nationality: string | null
          primary_email: string | null
          primary_phone: string | null
          scenario_id: string | null
          updated_at: string
        }
        Insert: {
          confidence_level?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string
          full_name: string
          id?: string
          is_sample_data?: boolean
          nationality?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          scenario_id?: string | null
          updated_at?: string
        }
        Update: {
          confidence_level?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string
          full_name?: string
          id?: string
          is_sample_data?: boolean
          nationality?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          scenario_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guests_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      host_deposits: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          applied_to_payable_id: string | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          deposit_amount: number
          deposit_date: string
          id: string
          is_sample_data: boolean
          note: string | null
          partner_id: string
          refunded_at: string | null
          refunded_by: string | null
          rejection_note: string | null
          scenario_id: string | null
          status: Database["public"]["Enums"]["deposit_status"]
          unified_booking_id: string
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          applied_to_payable_id?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          deposit_amount: number
          deposit_date: string
          id?: string
          is_sample_data?: boolean
          note?: string | null
          partner_id: string
          refunded_at?: string | null
          refunded_by?: string | null
          rejection_note?: string | null
          scenario_id?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          unified_booking_id: string
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          applied_to_payable_id?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          deposit_amount?: number
          deposit_date?: string
          id?: string
          is_sample_data?: boolean
          note?: string | null
          partner_id?: string
          refunded_at?: string | null
          refunded_by?: string | null
          rejection_note?: string | null
          scenario_id?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          unified_booking_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_deposits_applied_to_payable_id_fkey"
            columns: ["applied_to_payable_id"]
            isOneToOne: false
            referencedRelation: "host_payables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_deposits_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_reference_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "host_deposits_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_deposits_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      host_extra_charges: {
        Row: {
          amount: number
          charge_type: string
          created_at: string
          created_by: string | null
          id: string
          is_sample_data: boolean
          locked_at: string | null
          note: string | null
          partner_id: string
          scenario_id: string | null
          segment_id: string | null
          settlement_id: string | null
          unified_booking_id: string
        }
        Insert: {
          amount?: number
          charge_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_sample_data?: boolean
          locked_at?: string | null
          note?: string | null
          partner_id: string
          scenario_id?: string | null
          segment_id?: string | null
          settlement_id?: string | null
          unified_booking_id: string
        }
        Update: {
          amount?: number
          charge_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_sample_data?: boolean
          locked_at?: string | null
          note?: string | null
          partner_id?: string
          scenario_id?: string | null
          segment_id?: string | null
          settlement_id?: string | null
          unified_booking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_extra_charges_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_reference_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "host_extra_charges_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_extra_charges_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_extra_charges_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "host_supply_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_extra_charges_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "host_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_extra_charges_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "v_settlement_net_integrity"
            referencedColumns: ["settlement_id"]
          },
        ]
      }
      host_payables: {
        Row: {
          amount: number
          applied_deposit_amount: number | null
          applied_prepaid_amount: number | null
          collection_responsibility: string
          created_at: string
          due_date: string | null
          id: string
          is_sample_data: boolean
          note: string | null
          paid_amount: number | null
          paid_at: string | null
          paid_by: string | null
          partner_id: string
          scenario_id: string | null
          status: Database["public"]["Enums"]["payable_status"]
          unified_booking_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          applied_deposit_amount?: number | null
          applied_prepaid_amount?: number | null
          collection_responsibility?: string
          created_at?: string
          due_date?: string | null
          id?: string
          is_sample_data?: boolean
          note?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          paid_by?: string | null
          partner_id: string
          scenario_id?: string | null
          status?: Database["public"]["Enums"]["payable_status"]
          unified_booking_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          applied_deposit_amount?: number | null
          applied_prepaid_amount?: number | null
          collection_responsibility?: string
          created_at?: string
          due_date?: string | null
          id?: string
          is_sample_data?: boolean
          note?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          paid_by?: string | null
          partner_id?: string
          scenario_id?: string | null
          status?: Database["public"]["Enums"]["payable_status"]
          unified_booking_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_payables_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_reference_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "host_payables_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_payables_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      host_payment_batch_items: {
        Row: {
          amount: number
          batch_id: string
          created_at: string
          id: string
          payable_id: string
        }
        Insert: {
          amount?: number
          batch_id: string
          created_at?: string
          id?: string
          payable_id: string
        }
        Update: {
          amount?: number
          batch_id?: string
          created_at?: string
          id?: string
          payable_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_payment_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "host_payment_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_payment_batch_items_payable_id_fkey"
            columns: ["payable_id"]
            isOneToOne: false
            referencedRelation: "host_payables"
            referencedColumns: ["id"]
          },
        ]
      }
      host_payment_batches: {
        Row: {
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          batch_code: string
          created_at: string
          id: string
          is_sample_data: boolean
          note: string | null
          paid_at: string
          paid_by: string | null
          partner_id: string
          payment_method: string
          scenario_id: string | null
          total_amount: number
          transfer_reference: string | null
        }
        Insert: {
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          batch_code: string
          created_at?: string
          id?: string
          is_sample_data?: boolean
          note?: string | null
          paid_at?: string
          paid_by?: string | null
          partner_id: string
          payment_method?: string
          scenario_id?: string | null
          total_amount?: number
          transfer_reference?: string | null
        }
        Update: {
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          batch_code?: string
          created_at?: string
          id?: string
          is_sample_data?: boolean
          note?: string | null
          paid_at?: string
          paid_by?: string | null
          partner_id?: string
          payment_method?: string
          scenario_id?: string | null
          total_amount?: number
          transfer_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "host_payment_batches_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_reference_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "host_payment_batches_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_payment_batches_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      host_payments: {
        Row: {
          amount: number
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          created_at: string
          currency: string
          id: string
          is_sample_data: boolean
          note: string | null
          paid_at: string
          paid_by: string | null
          partner_id: string
          payable_id: string
          payment_method: string
          scenario_id: string | null
          transfer_reference: string | null
          unified_booking_id: string
        }
        Insert: {
          amount: number
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          is_sample_data?: boolean
          note?: string | null
          paid_at?: string
          paid_by?: string | null
          partner_id: string
          payable_id: string
          payment_method?: string
          scenario_id?: string | null
          transfer_reference?: string | null
          unified_booking_id: string
        }
        Update: {
          amount?: number
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          is_sample_data?: boolean
          note?: string | null
          paid_at?: string
          paid_by?: string | null
          partner_id?: string
          payable_id?: string
          payment_method?: string
          scenario_id?: string | null
          transfer_reference?: string | null
          unified_booking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_payments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_reference_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "host_payments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_payments_payable_id_fkey"
            columns: ["payable_id"]
            isOneToOne: false
            referencedRelation: "host_payables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_payments_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      host_prepaids: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          applied_to_payable_id: string | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          is_sample_data: boolean
          note: string | null
          paid_at: string | null
          partner_id: string
          prepaid_amount: number
          prepaid_status: string
          rejection_note: string | null
          scenario_id: string | null
          unified_booking_id: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          applied_to_payable_id?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          is_sample_data?: boolean
          note?: string | null
          paid_at?: string | null
          partner_id: string
          prepaid_amount: number
          prepaid_status?: string
          rejection_note?: string | null
          scenario_id?: string | null
          unified_booking_id: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          applied_to_payable_id?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          is_sample_data?: boolean
          note?: string | null
          paid_at?: string | null
          partner_id?: string
          prepaid_amount?: number
          prepaid_status?: string
          rejection_note?: string | null
          scenario_id?: string | null
          unified_booking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_prepaids_applied_to_payable_id_fkey"
            columns: ["applied_to_payable_id"]
            isOneToOne: false
            referencedRelation: "host_payables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_prepaids_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_reference_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "host_prepaids_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_prepaids_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      host_properties: {
        Row: {
          address: string | null
          created_at: string
          host_property_name: string
          id: string
          is_sample_data: boolean
          partner_id: string
          property_type_id: string | null
          scenario_id: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          host_property_name: string
          id?: string
          is_sample_data?: boolean
          partner_id: string
          property_type_id?: string | null
          scenario_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          host_property_name?: string
          id?: string
          is_sample_data?: boolean
          partner_id?: string
          property_type_id?: string | null
          scenario_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_properties_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_reference_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "host_properties_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_properties_property_type_id_fkey"
            columns: ["property_type_id"]
            isOneToOne: false
            referencedRelation: "property_type_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_properties_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      host_room_types: {
        Row: {
          created_at: string
          host_property_id: string
          id: string
          room_type_name: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          host_property_id: string
          id?: string
          room_type_name: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          host_property_id?: string
          id?: string
          room_type_name?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_room_types_host_property_id_fkey"
            columns: ["host_property_id"]
            isOneToOne: false
            referencedRelation: "host_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      host_rooms: {
        Row: {
          active_status: boolean | null
          cost_per_night: number
          created_at: string
          id: string
          is_sample_data: boolean
          partner_id: string
          room_code: string
          room_type: string
          scenario_id: string | null
          updated_at: string
        }
        Insert: {
          active_status?: boolean | null
          cost_per_night?: number
          created_at?: string
          id?: string
          is_sample_data?: boolean
          partner_id: string
          room_code: string
          room_type: string
          scenario_id?: string | null
          updated_at?: string
        }
        Update: {
          active_status?: boolean | null
          cost_per_night?: number
          created_at?: string
          id?: string
          is_sample_data?: boolean
          partner_id?: string
          room_code?: string
          room_type?: string
          scenario_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_rooms_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_reference_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "host_rooms_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_rooms_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      host_settlement_adjustments: {
        Row: {
          adjustment_type: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          delta_amount: number
          id: string
          is_sample_data: boolean
          new_amount: number | null
          original_amount: number | null
          partner_id: string
          reason: string
          scenario_id: string | null
          settlement_id: string
          status: string
          unified_booking_id: string
        }
        Insert: {
          adjustment_type: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          delta_amount: number
          id?: string
          is_sample_data?: boolean
          new_amount?: number | null
          original_amount?: number | null
          partner_id: string
          reason: string
          scenario_id?: string | null
          settlement_id: string
          status?: string
          unified_booking_id: string
        }
        Update: {
          adjustment_type?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          delta_amount?: number
          id?: string
          is_sample_data?: boolean
          new_amount?: number | null
          original_amount?: number | null
          partner_id?: string
          reason?: string
          scenario_id?: string | null
          settlement_id?: string
          status?: string
          unified_booking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_settlement_adjustments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_reference_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "host_settlement_adjustments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_settlement_adjustments_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_settlement_adjustments_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "host_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_settlement_adjustments_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "v_settlement_net_integrity"
            referencedColumns: ["settlement_id"]
          },
        ]
      }
      host_settlement_apply_events: {
        Row: {
          amount: number
          apply_type: string
          backfill_run_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_legacy: boolean
          metadata: Json
          partner_id: string
          reason: string
          reason_tag: string
          settlement_id: string
          source_cash_out_id: string | null
          source_id: string | null
          source_payment_request_id: string | null
          source_ref_id: string
          source_table: string | null
        }
        Insert: {
          amount: number
          apply_type: string
          backfill_run_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_legacy?: boolean
          metadata?: Json
          partner_id: string
          reason: string
          reason_tag?: string
          settlement_id: string
          source_cash_out_id?: string | null
          source_id?: string | null
          source_payment_request_id?: string | null
          source_ref_id: string
          source_table?: string | null
        }
        Update: {
          amount?: number
          apply_type?: string
          backfill_run_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_legacy?: boolean
          metadata?: Json
          partner_id?: string
          reason?: string
          reason_tag?: string
          settlement_id?: string
          source_cash_out_id?: string | null
          source_id?: string | null
          source_payment_request_id?: string | null
          source_ref_id?: string
          source_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "host_settlement_apply_events_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_reference_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "host_settlement_apply_events_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_settlement_apply_events_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "host_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_settlement_apply_events_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "v_settlement_net_integrity"
            referencedColumns: ["settlement_id"]
          },
          {
            foreignKeyName: "host_settlement_apply_events_source_cash_out_id_fkey"
            columns: ["source_cash_out_id"]
            isOneToOne: false
            referencedRelation: "cash_outs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_settlement_apply_events_source_payment_request_id_fkey"
            columns: ["source_payment_request_id"]
            isOneToOne: false
            referencedRelation: "payment_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      host_settlement_manual_netting_backfill_log: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          dry_run: boolean
          id: string
          result: Json
          run_id: string
          settlement_id: string
        }
        Insert: {
          action: string
          created_at?: string
          created_by?: string | null
          dry_run?: boolean
          id?: string
          result?: Json
          run_id: string
          settlement_id: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          dry_run?: boolean
          id?: string
          result?: Json
          run_id?: string
          settlement_id?: string
        }
        Relationships: []
      }
      host_settlements: {
        Row: {
          created_at: string
          created_by: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          is_sample_data: boolean
          note: string | null
          partner_id: string
          period_from: string
          period_to: string
          remaining_amount: number
          scenario_id: string | null
          settlement_code: string
          status: string
          total_booking_revenue: number
          total_deposits_applied: number
          total_host_collected: number
          total_paid_amount: number
          total_payable_amount: number
          total_prepaids_applied: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          is_sample_data?: boolean
          note?: string | null
          partner_id: string
          period_from: string
          period_to: string
          remaining_amount?: number
          scenario_id?: string | null
          settlement_code: string
          status?: string
          total_booking_revenue?: number
          total_deposits_applied?: number
          total_host_collected?: number
          total_paid_amount?: number
          total_payable_amount?: number
          total_prepaids_applied?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          is_sample_data?: boolean
          note?: string | null
          partner_id?: string
          period_from?: string
          period_to?: string
          remaining_amount?: number
          scenario_id?: string | null
          settlement_code?: string
          status?: string
          total_booking_revenue?: number
          total_deposits_applied?: number
          total_host_collected?: number
          total_paid_amount?: number
          total_payable_amount?: number
          total_prepaids_applied?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "host_settlements_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_reference_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "host_settlements_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_settlements_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      host_supply_segments: {
        Row: {
          actual_check_in_at: string | null
          actual_check_out_at: string | null
          checked_in_by: string | null
          checked_out_by: string | null
          created_at: string
          created_by: string | null
          date_from: string
          date_to: string
          host_property_name: string | null
          host_room_id: string | null
          host_room_type: string | null
          id: string
          is_sample_data: boolean
          is_voided_by_no_show: boolean
          locked_at: string | null
          nightly_rate: number
          nights: number
          note: string | null
          partner_id: string
          room_code: string | null
          room_line_index: number | null
          scenario_id: string | null
          settlement_id: string | null
          total_amount: number
          unified_booking_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_check_in_at?: string | null
          actual_check_out_at?: string | null
          checked_in_by?: string | null
          checked_out_by?: string | null
          created_at?: string
          created_by?: string | null
          date_from: string
          date_to: string
          host_property_name?: string | null
          host_room_id?: string | null
          host_room_type?: string | null
          id?: string
          is_sample_data?: boolean
          is_voided_by_no_show?: boolean
          locked_at?: string | null
          nightly_rate?: number
          nights: number
          note?: string | null
          partner_id: string
          room_code?: string | null
          room_line_index?: number | null
          scenario_id?: string | null
          settlement_id?: string | null
          total_amount?: number
          unified_booking_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_check_in_at?: string | null
          actual_check_out_at?: string | null
          checked_in_by?: string | null
          checked_out_by?: string | null
          created_at?: string
          created_by?: string | null
          date_from?: string
          date_to?: string
          host_property_name?: string | null
          host_room_id?: string | null
          host_room_type?: string | null
          id?: string
          is_sample_data?: boolean
          is_voided_by_no_show?: boolean
          locked_at?: string | null
          nightly_rate?: number
          nights?: number
          note?: string | null
          partner_id?: string
          room_code?: string | null
          room_line_index?: number | null
          scenario_id?: string | null
          settlement_id?: string | null
          total_amount?: number
          unified_booking_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "host_supply_segments_host_room_id_fkey"
            columns: ["host_room_id"]
            isOneToOne: false
            referencedRelation: "host_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_supply_segments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_reference_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "host_supply_segments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_supply_segments_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_supply_segments_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "host_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_supply_segments_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "v_settlement_net_integrity"
            referencedColumns: ["settlement_id"]
          },
        ]
      }
      host_surcharges: {
        Row: {
          amount: number
          collected_at: string | null
          collected_by: string | null
          collector_type: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          host_partner_id: string
          id: string
          is_sample_data: boolean
          locked_at: string | null
          scenario_id: string | null
          settlement_id: string | null
          status: string
          surcharge_type: string
          unified_booking_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          collected_at?: string | null
          collected_by?: string | null
          collector_type?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          host_partner_id: string
          id?: string
          is_sample_data?: boolean
          locked_at?: string | null
          scenario_id?: string | null
          settlement_id?: string | null
          status?: string
          surcharge_type: string
          unified_booking_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          collected_at?: string | null
          collected_by?: string | null
          collector_type?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          host_partner_id?: string
          id?: string
          is_sample_data?: boolean
          locked_at?: string | null
          scenario_id?: string | null
          settlement_id?: string | null
          status?: string
          surcharge_type?: string
          unified_booking_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_surcharges_host_partner_id_fkey"
            columns: ["host_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_reference_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "host_surcharges_host_partner_id_fkey"
            columns: ["host_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_surcharges_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_surcharges_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "host_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_surcharges_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "v_settlement_net_integrity"
            referencedColumns: ["settlement_id"]
          },
        ]
      }
      hotel_collections: {
        Row: {
          amount: number
          collected_at: string | null
          collected_by: string | null
          collection_type: string
          created_at: string | null
          currency: string | null
          id: string
          is_sample_data: boolean | null
          is_voided: boolean | null
          note: string | null
          payment_method: string | null
          payment_provider: string | null
          scenario_id: string | null
          unified_booking_id: string
          updated_at: string | null
          voided_at: string | null
          voided_by: string | null
          voided_reason: string | null
        }
        Insert: {
          amount?: number
          collected_at?: string | null
          collected_by?: string | null
          collection_type: string
          created_at?: string | null
          currency?: string | null
          id?: string
          is_sample_data?: boolean | null
          is_voided?: boolean | null
          note?: string | null
          payment_method?: string | null
          payment_provider?: string | null
          scenario_id?: string | null
          unified_booking_id: string
          updated_at?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
        }
        Update: {
          amount?: number
          collected_at?: string | null
          collected_by?: string | null
          collection_type?: string
          created_at?: string | null
          currency?: string | null
          id?: string
          is_sample_data?: boolean | null
          is_voided?: boolean | null
          note?: string | null
          payment_method?: string | null
          payment_provider?: string | null
          scenario_id?: string | null
          unified_booking_id?: string
          updated_at?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
        }
        Relationships: []
      }
      hotel_collects: {
        Row: {
          amount_collected: number
          collected_at: string | null
          collected_by: string | null
          collection_type: string
          created_at: string
          id: string
          is_legacy_sync: boolean
          is_sample_data: boolean
          ledger_entry_id: string | null
          legacy_sync_marked_at: string | null
          legacy_sync_reason: string | null
          note: string | null
          payee_type: string
          payer_type: string
          payment_link_url: string | null
          payment_method: string
          payment_provider: string | null
          reason_note: string | null
          receipt: string | null
          receipt_image: string | null
          receipt_status: string | null
          related_collection_id: string | null
          related_id: string | null
          related_type: string
          scenario_id: string | null
          source_payout_id: string | null
          status: string | null
          unified_booking_id: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_collected: number
          collected_at?: string | null
          collected_by?: string | null
          collection_type?: string
          created_at?: string
          id?: string
          is_legacy_sync?: boolean
          is_sample_data?: boolean
          ledger_entry_id?: string | null
          legacy_sync_marked_at?: string | null
          legacy_sync_reason?: string | null
          note?: string | null
          payee_type?: string
          payer_type?: string
          payment_link_url?: string | null
          payment_method: string
          payment_provider?: string | null
          reason_note?: string | null
          receipt?: string | null
          receipt_image?: string | null
          receipt_status?: string | null
          related_collection_id?: string | null
          related_id?: string | null
          related_type?: string
          scenario_id?: string | null
          source_payout_id?: string | null
          status?: string | null
          unified_booking_id: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_collected?: number
          collected_at?: string | null
          collected_by?: string | null
          collection_type?: string
          created_at?: string
          id?: string
          is_legacy_sync?: boolean
          is_sample_data?: boolean
          ledger_entry_id?: string | null
          legacy_sync_marked_at?: string | null
          legacy_sync_reason?: string | null
          note?: string | null
          payee_type?: string
          payer_type?: string
          payment_link_url?: string | null
          payment_method?: string
          payment_provider?: string | null
          reason_note?: string | null
          receipt?: string | null
          receipt_image?: string | null
          receipt_status?: string | null
          related_collection_id?: string | null
          related_id?: string | null
          related_type?: string
          scenario_id?: string | null
          source_payout_id?: string | null
          status?: string | null
          unified_booking_id?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_collects_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_collects_related_collection_id_fkey"
            columns: ["related_collection_id"]
            isOneToOne: false
            referencedRelation: "hotel_collects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_collects_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_collects_source_payout_id_fkey"
            columns: ["source_payout_id"]
            isOneToOne: false
            referencedRelation: "ota_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_collects_source_payout_id_fkey"
            columns: ["source_payout_id"]
            isOneToOne: false
            referencedRelation: "v_financial_integrity_summary"
            referencedColumns: ["entity_id"]
          },
          {
            foreignKeyName: "hotel_collects_source_payout_id_fkey"
            columns: ["source_payout_id"]
            isOneToOne: false
            referencedRelation: "v_no_show_reclass_gaps"
            referencedColumns: ["payout_id"]
          },
        ]
      }
      internal_expenses: {
        Row: {
          amount: number
          attachment_url: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          confirmed_at: string | null
          created_at: string
          currency: string
          expense_category: string
          expense_period: string | null
          id: string
          is_sample_data: boolean
          note: string | null
          paid_at: string
          paid_by: string | null
          payment_gateway: string | null
          payment_method: string
          proposed_at: string | null
          recipient_name: string | null
          scenario_id: string | null
          status: string | null
          transfer_reference: string | null
        }
        Insert: {
          amount: number
          attachment_url?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          expense_category: string
          expense_period?: string | null
          id?: string
          is_sample_data?: boolean
          note?: string | null
          paid_at?: string
          paid_by?: string | null
          payment_gateway?: string | null
          payment_method?: string
          proposed_at?: string | null
          recipient_name?: string | null
          scenario_id?: string | null
          status?: string | null
          transfer_reference?: string | null
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          expense_category?: string
          expense_period?: string | null
          id?: string
          is_sample_data?: boolean
          note?: string | null
          paid_at?: string
          paid_by?: string | null
          payment_gateway?: string | null
          payment_method?: string
          proposed_at?: string | null
          recipient_name?: string | null
          scenario_id?: string | null
          status?: string | null
          transfer_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "internal_expenses_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_alert_config: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          is_active: boolean | null
          property_id: string | null
          threshold_value: number
          updated_at: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          property_id?: string | null
          threshold_value: number
          updated_at?: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          property_id?: string | null
          threshold_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      inventory_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          details: Json | null
          id: string
          is_acknowledged: boolean | null
          message: string
          property_id: string
          severity: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          details?: Json | null
          id?: string
          is_acknowledged?: boolean | null
          message: string
          property_id: string
          severity?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          details?: Json | null
          id?: string
          is_acknowledged?: boolean | null
          message?: string
          property_id?: string
          severity?: string
        }
        Relationships: []
      }
      inventory_batches: {
        Row: {
          batch_id: string
          created_at: string
          created_by: string | null
          failed_count: number | null
          id: string
          intent: string | null
          intent_note: string | null
          metadata: Json | null
          property_id: string
          status: string | null
          success_count: number | null
          total_cells: number | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          created_by?: string | null
          failed_count?: number | null
          id?: string
          intent?: string | null
          intent_note?: string | null
          metadata?: Json | null
          property_id: string
          status?: string | null
          success_count?: number | null
          total_cells?: number | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_by?: string | null
          failed_count?: number | null
          id?: string
          intent?: string | null
          intent_note?: string | null
          metadata?: Json | null
          property_id?: string
          status?: string | null
          success_count?: number | null
          total_cells?: number | null
        }
        Relationships: []
      }
      inventory_cells: {
        Row: {
          applied_override_id: string | null
          applied_rule_id: string | null
          availability: number | null
          availability_offset: number | null
          batch_id: string | null
          cell_date: string
          cell_state: string | null
          channel_id: string | null
          closed_to_arrival: boolean | null
          closed_to_departure: boolean | null
          created_at: string
          editing_by: string | null
          editing_expires_at: string | null
          id: string
          idempotency_key: string | null
          max_availability: number | null
          max_stay: number | null
          min_stay_arrival: number | null
          min_stay_through: number | null
          property_id: string
          rate: number | null
          rate_plan_id: string | null
          room_type_id: string
          source: string | null
          source_layer: string
          stop_sell: boolean | null
          sync_error: string | null
          sync_status: string
          timezone: string | null
          updated_at: string
          updated_by: string | null
          version: number | null
        }
        Insert: {
          applied_override_id?: string | null
          applied_rule_id?: string | null
          availability?: number | null
          availability_offset?: number | null
          batch_id?: string | null
          cell_date: string
          cell_state?: string | null
          channel_id?: string | null
          closed_to_arrival?: boolean | null
          closed_to_departure?: boolean | null
          created_at?: string
          editing_by?: string | null
          editing_expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          max_availability?: number | null
          max_stay?: number | null
          min_stay_arrival?: number | null
          min_stay_through?: number | null
          property_id: string
          rate?: number | null
          rate_plan_id?: string | null
          room_type_id: string
          source?: string | null
          source_layer?: string
          stop_sell?: boolean | null
          sync_error?: string | null
          sync_status?: string
          timezone?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number | null
        }
        Update: {
          applied_override_id?: string | null
          applied_rule_id?: string | null
          availability?: number | null
          availability_offset?: number | null
          batch_id?: string | null
          cell_date?: string
          cell_state?: string | null
          channel_id?: string | null
          closed_to_arrival?: boolean | null
          closed_to_departure?: boolean | null
          created_at?: string
          editing_by?: string | null
          editing_expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          max_availability?: number | null
          max_stay?: number | null
          min_stay_arrival?: number | null
          min_stay_through?: number | null
          property_id?: string
          rate?: number | null
          rate_plan_id?: string | null
          room_type_id?: string
          source?: string | null
          source_layer?: string
          stop_sell?: boolean | null
          sync_error?: string | null
          sync_status?: string
          timezone?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_cells_applied_rule_id_fkey"
            columns: ["applied_rule_id"]
            isOneToOne: false
            referencedRelation: "availability_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_edit_locks: {
        Row: {
          cell_key: string
          created_at: string
          expires_at: string
          id: string
          locked_at: string
          locked_by: string
          property_id: string
        }
        Insert: {
          cell_key: string
          created_at?: string
          expires_at: string
          id?: string
          locked_at?: string
          locked_by: string
          property_id: string
        }
        Update: {
          cell_key?: string
          created_at?: string
          expires_at?: string
          id?: string
          locked_at?: string
          locked_by?: string
          property_id?: string
        }
        Relationships: []
      }
      inventory_logs: {
        Row: {
          action: string
          after_data: Json | null
          batch_id: string | null
          before_data: Json | null
          cell_id: string | null
          changed_by: string | null
          created_at: string
          id: string
          property_id: string
        }
        Insert: {
          action: string
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          cell_id?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
          property_id: string
        }
        Update: {
          action?: string
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          cell_id?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
          property_id?: string
        }
        Relationships: []
      }
      inventory_room_order: {
        Row: {
          created_at: string
          display_order: number | null
          id: string
          property_id: string
          room_type_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: string
          property_id: string
          room_type_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: string
          property_id?: string
          room_type_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_snapshots: {
        Row: {
          created_at: string
          id: string
          property_mapping_id: string
          snapshot_data: Json
          snapshot_time: string
          snapshot_type: string
          sync_job_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          property_mapping_id: string
          snapshot_data: Json
          snapshot_time?: string
          snapshot_type?: string
          sync_job_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          property_mapping_id?: string
          snapshot_data?: Json
          snapshot_time?: string
          snapshot_type?: string
          sync_job_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_snapshots_property_mapping_id_fkey"
            columns: ["property_mapping_id"]
            isOneToOne: false
            referencedRelation: "property_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_snapshots_sync_job_id_fkey"
            columns: ["sync_job_id"]
            isOneToOne: false
            referencedRelation: "sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_sync_jobs: {
        Row: {
          cell_ids: string[]
          channel_id: string | null
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          idempotency_key: string | null
          property_id: string
          retry_count: number | null
          started_at: string | null
          status: string
        }
        Insert: {
          cell_ids: string[]
          channel_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          property_id: string
          retry_count?: number | null
          started_at?: string | null
          status?: string
        }
        Update: {
          cell_ids?: string[]
          channel_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          property_id?: string
          retry_count?: number | null
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      inventory_sync_metrics: {
        Row: {
          avg_sync_duration_ms: number | null
          cells_updated: number
          created_at: string
          failed_syncs: number
          id: string
          last_sync_at: string | null
          last_sync_status: string | null
          metric_date: string
          property_id: string
          successful_syncs: number
          total_syncs: number
          updated_at: string
        }
        Insert: {
          avg_sync_duration_ms?: number | null
          cells_updated?: number
          created_at?: string
          failed_syncs?: number
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          metric_date?: string
          property_id: string
          successful_syncs?: number
          total_syncs?: number
          updated_at?: string
        }
        Update: {
          avg_sync_duration_ms?: number | null
          cells_updated?: number
          created_at?: string
          failed_syncs?: number
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          metric_date?: string
          property_id?: string
          successful_syncs?: number
          total_syncs?: number
          updated_at?: string
        }
        Relationships: []
      }
      inventory_system_version: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          account_snapshot: Json | null
          amount: number
          cash_account_id: string | null
          counterparty_id: string | null
          counterparty_name: string | null
          counterparty_type: string | null
          created_at: string
          created_by: string | null
          currency: string
          direction: string
          economic_date: string | null
          economic_period: string | null
          entry_date: string
          entry_type: string
          id: string
          is_posted: boolean
          is_reversed: boolean
          note: string | null
          org_id: string
          posting_at: string
          reversal_of_id: string | null
          reversed_by_id: string | null
          source_id: string
          source_type: string
          updated_at: string
        }
        Insert: {
          account_snapshot?: Json | null
          amount: number
          cash_account_id?: string | null
          counterparty_id?: string | null
          counterparty_name?: string | null
          counterparty_type?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          direction: string
          economic_date?: string | null
          economic_period?: string | null
          entry_date: string
          entry_type?: string
          id?: string
          is_posted?: boolean
          is_reversed?: boolean
          note?: string | null
          org_id?: string
          posting_at?: string
          reversal_of_id?: string | null
          reversed_by_id?: string | null
          source_id: string
          source_type: string
          updated_at?: string
        }
        Update: {
          account_snapshot?: Json | null
          amount?: number
          cash_account_id?: string | null
          counterparty_id?: string | null
          counterparty_name?: string | null
          counterparty_type?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          direction?: string
          economic_date?: string | null
          economic_period?: string | null
          entry_date?: string
          entry_type?: string
          id?: string
          is_posted?: boolean
          is_reversed?: boolean
          note?: string | null
          org_id?: string
          posting_at?: string
          reversal_of_id?: string | null
          reversed_by_id?: string | null
          source_id?: string
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_reversal_of_id_fkey"
            columns: ["reversal_of_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_reversed_by_id_fkey"
            columns: ["reversed_by_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_reconciliations: {
        Row: {
          bank_reference: string | null
          bank_statement_date: string | null
          id: string
          ledger_entry_id: string
          note: string | null
          reconciled_at: string
          reconciled_by: string | null
        }
        Insert: {
          bank_reference?: string | null
          bank_statement_date?: string | null
          id?: string
          ledger_entry_id: string
          note?: string | null
          reconciled_at?: string
          reconciled_by?: string | null
        }
        Update: {
          bank_reference?: string | null
          bank_statement_date?: string | null
          id?: string
          ledger_entry_id?: string
          note?: string | null
          reconciled_at?: string
          reconciled_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_reconciliations_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: true
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_settlement_payment_backfill_map: {
        Row: {
          cash_out_id: string
          created_at: string
          id: string
          ledger_id: string
          legacy_cashflow_id: string
          settlement_id: string
          settlement_type: string
        }
        Insert: {
          cash_out_id: string
          created_at?: string
          id?: string
          ledger_id: string
          legacy_cashflow_id: string
          settlement_id: string
          settlement_type: string
        }
        Update: {
          cash_out_id?: string
          created_at?: string
          id?: string
          ledger_id?: string
          legacy_cashflow_id?: string
          settlement_id?: string
          settlement_type?: string
        }
        Relationships: []
      }
      manual_bookings: {
        Row: {
          booking_date: string | null
          booking_status: Database["public"]["Enums"]["booking_status"]
          check_in_date: string
          check_out_date: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          guest_email: string | null
          guest_name: string
          guest_phone: string | null
          id: string
          is_sample_data: boolean
          manual_property_name: string | null
          nights: number
          note: string | null
          payment_type: Database["public"]["Enums"]["payment_type"]
          room_type: string | null
          scenario_id: string | null
          sold_room_type: string | null
          source: string
          total_amount_gross: number | null
          total_amount_net: number | null
          unified_booking_id: string
          updated_at: string
        }
        Insert: {
          booking_date?: string | null
          booking_status?: Database["public"]["Enums"]["booking_status"]
          check_in_date: string
          check_out_date: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          guest_email?: string | null
          guest_name: string
          guest_phone?: string | null
          id?: string
          is_sample_data?: boolean
          manual_property_name?: string | null
          nights: number
          note?: string | null
          payment_type?: Database["public"]["Enums"]["payment_type"]
          room_type?: string | null
          scenario_id?: string | null
          sold_room_type?: string | null
          source: string
          total_amount_gross?: number | null
          total_amount_net?: number | null
          unified_booking_id: string
          updated_at?: string
        }
        Update: {
          booking_date?: string | null
          booking_status?: Database["public"]["Enums"]["booking_status"]
          check_in_date?: string
          check_out_date?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          guest_email?: string | null
          guest_name?: string
          guest_phone?: string | null
          id?: string
          is_sample_data?: boolean
          manual_property_name?: string | null
          nights?: number
          note?: string | null
          payment_type?: Database["public"]["Enums"]["payment_type"]
          room_type?: string | null
          scenario_id?: string | null
          sold_room_type?: string | null
          source?: string
          total_amount_gross?: number | null
          total_amount_net?: number | null
          unified_booking_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_bookings_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      message_events: {
        Row: {
          conversation_id: string | null
          created_at: string
          event_type: string
          id: string
          message_id: string | null
          outbound_id: string | null
          payload: Json | null
          request_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          message_id?: string | null
          outbound_id?: string | null
          payload?: Json | null
          request_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          message_id?: string | null
          outbound_id?: string | null
          payload?: Json | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_events_outbound_id_fkey"
            columns: ["outbound_id"]
            isOneToOne: false
            referencedRelation: "outbound_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json | null
          body: string | null
          channel_type: string | null
          conversation_id: string | null
          created_at: string
          direction: string
          external_message_id: string | null
          id: string
          sender_display_name: string | null
          sender_id: string | null
          sender_type: string
          sent_at: string | null
          synced_at: string | null
          tenant_id: string | null
          wa_phone_number_id: string | null
          wa_status: string | null
          wamid: string | null
        }
        Insert: {
          attachments?: Json | null
          body?: string | null
          channel_type?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string
          external_message_id?: string | null
          id?: string
          sender_display_name?: string | null
          sender_id?: string | null
          sender_type?: string
          sent_at?: string | null
          synced_at?: string | null
          tenant_id?: string | null
          wa_phone_number_id?: string | null
          wa_status?: string | null
          wamid?: string | null
        }
        Update: {
          attachments?: Json | null
          body?: string | null
          channel_type?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string
          external_message_id?: string | null
          id?: string
          sender_display_name?: string | null
          sender_id?: string | null
          sender_type?: string
          sent_at?: string | null
          synced_at?: string | null
          tenant_id?: string | null
          wa_phone_number_id?: string | null
          wa_status?: string | null
          wamid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_messages_conversation"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages_mirror: {
        Row: {
          attachments: Json | null
          body: string | null
          conversation_id: string
          created_at: string
          direction: string
          external_message_id: string
          id: string
          sender_type: string
          sent_at: string
          source_updated_at: string | null
          synced_at: string | null
        }
        Insert: {
          attachments?: Json | null
          body?: string | null
          conversation_id: string
          created_at?: string
          direction: string
          external_message_id: string
          id?: string
          sender_type: string
          sent_at?: string
          source_updated_at?: string | null
          synced_at?: string | null
        }
        Update: {
          attachments?: Json | null
          body?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          external_message_id?: string
          id?: string
          sender_type?: string
          sent_at?: string
          source_updated_at?: string | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_mirror_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      no_show_financial_snapshots: {
        Row: {
          charge_status: string
          collected_amount: number
          collector_type: string
          created_at: string
          created_by: string | null
          expected_amount: number
          id: string
          ledger_entry_id: string | null
          org_id: string
          prev_booking_status: string | null
          prev_stay_status: string | null
          refund_amount: number
          refund_ledger_entry_id: string | null
          removed_at: string | null
          revenue_posted: boolean
          snapshot_date: string
          unified_booking_id: string
          updated_at: string
        }
        Insert: {
          charge_status?: string
          collected_amount?: number
          collector_type: string
          created_at?: string
          created_by?: string | null
          expected_amount?: number
          id?: string
          ledger_entry_id?: string | null
          org_id?: string
          prev_booking_status?: string | null
          prev_stay_status?: string | null
          refund_amount?: number
          refund_ledger_entry_id?: string | null
          removed_at?: string | null
          revenue_posted?: boolean
          snapshot_date: string
          unified_booking_id: string
          updated_at?: string
        }
        Update: {
          charge_status?: string
          collected_amount?: number
          collector_type?: string
          created_at?: string
          created_by?: string | null
          expected_amount?: number
          id?: string
          ledger_entry_id?: string | null
          org_id?: string
          prev_booking_status?: string | null
          prev_stay_status?: string | null
          refund_amount?: number
          refund_ledger_entry_id?: string | null
          removed_at?: string | null
          revenue_posted?: boolean
          snapshot_date?: string
          unified_booking_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "no_show_financial_snapshots_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "no_show_financial_snapshots_refund_ledger_entry_id_fkey"
            columns: ["refund_ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      no_show_records: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_sample_data: boolean
          no_show_date: string | null
          note: string | null
          reason: string | null
          removal_reason: string | null
          removed_at: string | null
          removed_by: string | null
          scenario_id: string | null
          unified_booking_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_sample_data?: boolean
          no_show_date?: string | null
          note?: string | null
          reason?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          scenario_id?: string | null
          unified_booking_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_sample_data?: boolean
          no_show_date?: string | null
          note?: string | null
          reason?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          scenario_id?: string | null
          unified_booking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "no_show_records_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_read_states: {
        Row: {
          id: string
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_read_states_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string
          deep_link: string
          event_type: string
          icon: string | null
          id: string
          is_archived: boolean
          metadata: Json | null
          priority: string
          read_at: string | null
          source_module: string
          source_record_id: string | null
          source_table: string | null
          tenant_id: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key: string
          deep_link?: string
          event_type: string
          icon?: string | null
          id?: string
          is_archived?: boolean
          metadata?: Json | null
          priority?: string
          read_at?: string | null
          source_module: string
          source_record_id?: string | null
          source_table?: string | null
          tenant_id: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string
          deep_link?: string
          event_type?: string
          icon?: string | null
          id?: string
          is_archived?: boolean
          metadata?: Json | null
          priority?: string
          read_at?: string | null
          source_module?: string
          source_record_id?: string | null
          source_table?: string | null
          tenant_id?: string
          title?: string
        }
        Relationships: []
      }
      ota_adjustment_records: {
        Row: {
          adjustment_date: string
          amount: number
          attachment_url: string | null
          channel: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          reason: string
          reference: string | null
          updated_at: string
        }
        Insert: {
          adjustment_date: string
          amount: number
          attachment_url?: string | null
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          reason: string
          reference?: string | null
          updated_at?: string
        }
        Update: {
          adjustment_date?: string
          amount?: number
          attachment_url?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          reason?: string
          reference?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ota_audit_log: {
        Row: {
          action: string
          entity_id: string
          entity_type: string
          id: string
          ip_address: unknown
          new_data: Json | null
          old_data: Json | null
          performed_at: string
          performed_by: string
          project_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          performed_at?: string
          performed_by: string
          project_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          performed_at?: string
          performed_by?: string
          project_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ota_audit_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ota_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_debit_note_records: {
        Row: {
          amount: number
          attachment_url: string | null
          channel: string
          created_at: string
          created_by: string | null
          id: string
          issue_date: string
          note: string | null
          paid_via_cash_out_id: string | null
          reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          attachment_url?: string | null
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          issue_date: string
          note?: string | null
          paid_via_cash_out_id?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          issue_date?: string
          note?: string | null
          paid_via_cash_out_id?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ota_deductions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          dispute_id: string
          id: string
          is_reversal: boolean
          note: string | null
          reason: string
          recorded_at: string
          recorded_by: string | null
          reversal_of: string | null
          unified_booking_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          dispute_id: string
          id?: string
          is_reversal?: boolean
          note?: string | null
          reason: string
          recorded_at?: string
          recorded_by?: string | null
          reversal_of?: string | null
          unified_booking_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          dispute_id?: string
          id?: string
          is_reversal?: boolean
          note?: string | null
          reason?: string
          recorded_at?: string
          recorded_by?: string | null
          reversal_of?: string | null
          unified_booking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ota_deductions_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "ota_disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ota_deductions_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "ota_deductions"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_disputes: {
        Row: {
          amount_approved: number | null
          amount_in_dispute: number
          amount_requested: number | null
          assigned_to: string | null
          booking_cancellation_expected: boolean | null
          booking_cancellation_status: string | null
          case_status: string | null
          case_type: string | null
          cash_out_id: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          dispute_type: string
          id: string
          is_sample_data: boolean
          last_activity_at: string | null
          opened_at: string | null
          ota_adjustment_record_id: string | null
          ota_debit_note_record_id: string | null
          ota_payout_record_id: string | null
          ota_reference: string | null
          payment_request_id: string | null
          payout_id: string | null
          refund_channel: string | null
          resolution_note: string | null
          scenario_id: string | null
          settlement_type: string | null
          status: Database["public"]["Enums"]["dispute_status"]
          unified_booking_id: string
          updated_at: string
        }
        Insert: {
          amount_approved?: number | null
          amount_in_dispute: number
          amount_requested?: number | null
          assigned_to?: string | null
          booking_cancellation_expected?: boolean | null
          booking_cancellation_status?: string | null
          case_status?: string | null
          case_type?: string | null
          cash_out_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          dispute_type: string
          id?: string
          is_sample_data?: boolean
          last_activity_at?: string | null
          opened_at?: string | null
          ota_adjustment_record_id?: string | null
          ota_debit_note_record_id?: string | null
          ota_payout_record_id?: string | null
          ota_reference?: string | null
          payment_request_id?: string | null
          payout_id?: string | null
          refund_channel?: string | null
          resolution_note?: string | null
          scenario_id?: string | null
          settlement_type?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          unified_booking_id: string
          updated_at?: string
        }
        Update: {
          amount_approved?: number | null
          amount_in_dispute?: number
          amount_requested?: number | null
          assigned_to?: string | null
          booking_cancellation_expected?: boolean | null
          booking_cancellation_status?: string | null
          case_status?: string | null
          case_type?: string | null
          cash_out_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          dispute_type?: string
          id?: string
          is_sample_data?: boolean
          last_activity_at?: string | null
          opened_at?: string | null
          ota_adjustment_record_id?: string | null
          ota_debit_note_record_id?: string | null
          ota_payout_record_id?: string | null
          ota_reference?: string | null
          payment_request_id?: string | null
          payout_id?: string | null
          refund_channel?: string | null
          resolution_note?: string | null
          scenario_id?: string | null
          settlement_type?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          unified_booking_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ota_disputes_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "ota_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ota_disputes_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "v_financial_integrity_summary"
            referencedColumns: ["entity_id"]
          },
          {
            foreignKeyName: "ota_disputes_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "v_no_show_reclass_gaps"
            referencedColumns: ["payout_id"]
          },
          {
            foreignKeyName: "ota_disputes_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_expected: {
        Row: {
          created_at: string
          expected_amount: number
          expected_payout_date: string | null
          id: string
          ota_source: string
          status: Database["public"]["Enums"]["payout_status"] | null
          unified_booking_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expected_amount: number
          expected_payout_date?: string | null
          id?: string
          ota_source: string
          status?: Database["public"]["Enums"]["payout_status"] | null
          unified_booking_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expected_amount?: number
          expected_payout_date?: string | null
          id?: string
          ota_source?: string
          status?: Database["public"]["Enums"]["payout_status"] | null
          unified_booking_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ota_payout_deductions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          deduction_type: string
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          id: string
          is_deleted: boolean
          payout_detail_id: string | null
          payout_id: string
          reason_note: string
          unified_booking_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          deduction_type: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          id?: string
          is_deleted?: boolean
          payout_detail_id?: string | null
          payout_id: string
          reason_note: string
          unified_booking_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          deduction_type?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          id?: string
          is_deleted?: boolean
          payout_detail_id?: string | null
          payout_id?: string
          reason_note?: string
          unified_booking_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ota_payout_deductions_payout_detail_id_fkey"
            columns: ["payout_detail_id"]
            isOneToOne: false
            referencedRelation: "ota_payout_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ota_payout_deductions_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "ota_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ota_payout_deductions_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "v_financial_integrity_summary"
            referencedColumns: ["entity_id"]
          },
          {
            foreignKeyName: "ota_payout_deductions_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "v_no_show_reclass_gaps"
            referencedColumns: ["payout_id"]
          },
        ]
      }
      ota_payout_details: {
        Row: {
          actual_amount: number
          actual_check_out_at: string | null
          booking_code: string | null
          created_at: string
          deactivated_at: string | null
          deactivated_reason: string | null
          deduction_amount: number | null
          expected_amount: number
          final_amount: number | null
          guest_name: string | null
          id: string
          is_active: boolean
          note: string | null
          payout_id: string
          unified_booking_id: string
          variance: number | null
        }
        Insert: {
          actual_amount: number
          actual_check_out_at?: string | null
          booking_code?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_reason?: string | null
          deduction_amount?: number | null
          expected_amount: number
          final_amount?: number | null
          guest_name?: string | null
          id?: string
          is_active?: boolean
          note?: string | null
          payout_id: string
          unified_booking_id: string
          variance?: number | null
        }
        Update: {
          actual_amount?: number
          actual_check_out_at?: string | null
          booking_code?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_reason?: string | null
          deduction_amount?: number | null
          expected_amount?: number
          final_amount?: number | null
          guest_name?: string | null
          id?: string
          is_active?: boolean
          note?: string | null
          payout_id?: string
          unified_booking_id?: string
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ota_payout_details_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "ota_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ota_payout_details_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "v_financial_integrity_summary"
            referencedColumns: ["entity_id"]
          },
          {
            foreignKeyName: "ota_payout_details_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "v_no_show_reclass_gaps"
            referencedColumns: ["payout_id"]
          },
        ]
      }
      ota_payout_reconciliation_items: {
        Row: {
          adj_category: string | null
          amount: number
          created_at: string
          created_by: string | null
          deduction_id: string | null
          direction: string
          dispute_id: string | null
          economic_date: string | null
          evidence: Json | null
          id: string
          idempotency_key: string | null
          is_prior_period: boolean
          item_type: string
          ledger_entry_id: string | null
          note: string | null
          payout_id: string
          related_period: string | null
        }
        Insert: {
          adj_category?: string | null
          amount: number
          created_at?: string
          created_by?: string | null
          deduction_id?: string | null
          direction?: string
          dispute_id?: string | null
          economic_date?: string | null
          evidence?: Json | null
          id?: string
          idempotency_key?: string | null
          is_prior_period?: boolean
          item_type: string
          ledger_entry_id?: string | null
          note?: string | null
          payout_id: string
          related_period?: string | null
        }
        Update: {
          adj_category?: string | null
          amount?: number
          created_at?: string
          created_by?: string | null
          deduction_id?: string | null
          direction?: string
          dispute_id?: string | null
          economic_date?: string | null
          evidence?: Json | null
          id?: string
          idempotency_key?: string | null
          is_prior_period?: boolean
          item_type?: string
          ledger_entry_id?: string | null
          note?: string | null
          payout_id?: string
          related_period?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ota_payout_reconciliation_items_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "ota_disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ota_payout_reconciliation_items_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ota_payout_reconciliation_items_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "ota_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ota_payout_reconciliation_items_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "v_financial_integrity_summary"
            referencedColumns: ["entity_id"]
          },
          {
            foreignKeyName: "ota_payout_reconciliation_items_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "v_no_show_reclass_gaps"
            referencedColumns: ["payout_id"]
          },
        ]
      }
      ota_payouts: {
        Row: {
          adjustment_total: number
          bank_fee_total: number
          bank_reference: string | null
          created_at: string
          deduction_total: number | null
          gross_amount: number | null
          id: string
          is_reconciled: boolean
          is_voided: boolean
          net_payout_amount: number | null
          note: string | null
          ota_property_id: string | null
          ota_source: string
          payment_gateway: string | null
          payout_date: string
          payout_method: string | null
          payout_period_from: string | null
          payout_period_to: string | null
          provider_payout_id: string | null
          received_at: string | null
          receiving_bank_account: string | null
          reconciled_at: string | null
          reconciled_by: string | null
          status: Database["public"]["Enums"]["payout_status"] | null
          total_amount: number
          updated_at: string
          voided_at: string | null
          voided_by: string | null
          voided_reason: string | null
        }
        Insert: {
          adjustment_total?: number
          bank_fee_total?: number
          bank_reference?: string | null
          created_at?: string
          deduction_total?: number | null
          gross_amount?: number | null
          id?: string
          is_reconciled?: boolean
          is_voided?: boolean
          net_payout_amount?: number | null
          note?: string | null
          ota_property_id?: string | null
          ota_source: string
          payment_gateway?: string | null
          payout_date: string
          payout_method?: string | null
          payout_period_from?: string | null
          payout_period_to?: string | null
          provider_payout_id?: string | null
          received_at?: string | null
          receiving_bank_account?: string | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          status?: Database["public"]["Enums"]["payout_status"] | null
          total_amount: number
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
        }
        Update: {
          adjustment_total?: number
          bank_fee_total?: number
          bank_reference?: string | null
          created_at?: string
          deduction_total?: number | null
          gross_amount?: number | null
          id?: string
          is_reconciled?: boolean
          is_voided?: boolean
          net_payout_amount?: number | null
          note?: string | null
          ota_property_id?: string | null
          ota_source?: string
          payment_gateway?: string | null
          payout_date?: string
          payout_method?: string | null
          payout_period_from?: string | null
          payout_period_to?: string | null
          provider_payout_id?: string | null
          received_at?: string | null
          receiving_bank_account?: string | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          status?: Database["public"]["Enums"]["payout_status"] | null
          total_amount?: number
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
        }
        Relationships: []
      }
      ota_project_inputs: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          id: string
          project_id: string
          schema_version: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          project_id: string
          schema_version?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          project_id?: string
          schema_version?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ota_project_inputs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "ota_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_project_members: {
        Row: {
          assigned_at: string
          assigned_by: string
          deactivated_at: string | null
          deactivated_by: string | null
          is_active: boolean
          project_id: string
          role: Database["public"]["Enums"]["ota_project_role"]
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          is_active?: boolean
          project_id: string
          role?: Database["public"]["Enums"]["ota_project_role"]
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          is_active?: boolean
          project_id?: string
          role?: Database["public"]["Enums"]["ota_project_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ota_project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ota_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_project_outputs: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          id: string
          project_id: string
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          schema_version: number
          status: Database["public"]["Enums"]["ota_output_status"]
          submitted_at: string | null
          submitted_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          project_id: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          schema_version?: number
          status?: Database["public"]["Enums"]["ota_output_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          project_id?: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          schema_version?: number
          status?: Database["public"]["Enums"]["ota_output_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ota_project_outputs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ota_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_projects: {
        Row: {
          bucket_date: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          is_ops_bucket: boolean | null
          name: string
          property_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["ota_project_status"]
          updated_at: string
          updated_by: string
          work_type: Database["public"]["Enums"]["ota_work_type"] | null
        }
        Insert: {
          bucket_date?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_ops_bucket?: boolean | null
          name: string
          property_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["ota_project_status"]
          updated_at?: string
          updated_by: string
          work_type?: Database["public"]["Enums"]["ota_work_type"] | null
        }
        Update: {
          bucket_date?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_ops_bucket?: boolean | null
          name?: string
          property_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["ota_project_status"]
          updated_at?: string
          updated_by?: string
          work_type?: Database["public"]["Enums"]["ota_work_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "ota_projects_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_mirror"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_task_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string | null
          edited_at: string | null
          id: string
          is_edited: boolean | null
          parent_id: string | null
          task_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string | null
          edited_at?: string | null
          id?: string
          is_edited?: boolean | null
          parent_id?: string | null
          task_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string | null
          edited_at?: string | null
          id?: string
          is_edited?: boolean | null
          parent_id?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ota_task_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ota_task_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ota_task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ota_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_task_evidence: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          evidence_type: Database["public"]["Enums"]["ota_evidence_type"]
          external_url: string | null
          file_name: string | null
          file_size_bytes: number | null
          file_url: string | null
          id: string
          mime_type: string | null
          review_notes: string | null
          review_status: Database["public"]["Enums"]["ota_evidence_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          task_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          evidence_type: Database["public"]["Enums"]["ota_evidence_type"]
          external_url?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_url?: string | null
          id?: string
          mime_type?: string | null
          review_notes?: string | null
          review_status?: Database["public"]["Enums"]["ota_evidence_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          task_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          evidence_type?: Database["public"]["Enums"]["ota_evidence_type"]
          external_url?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_url?: string | null
          id?: string
          mime_type?: string | null
          review_notes?: string | null
          review_status?: Database["public"]["Enums"]["ota_evidence_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ota_task_evidence_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ota_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_task_todos: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_done: boolean
          sort_order: number
          task_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_done?: boolean
          sort_order?: number
          task_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_done?: boolean
          sort_order?: number
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ota_task_todos_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ota_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_tasks: {
        Row: {
          actual_effort_minutes: number | null
          actual_hours: number | null
          assigned_at: string | null
          assigned_by: string | null
          assignee_id: string | null
          classification:
            | Database["public"]["Enums"]["ota_task_classification"]
            | null
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          expected_effort_minutes: number | null
          id: string
          is_quick_task: boolean | null
          issue_tag: string | null
          min_evidence_count: number | null
          priority: Database["public"]["Enums"]["ota_task_priority"]
          project_id: string
          require_evidence: boolean | null
          started_at: string | null
          status: Database["public"]["Enums"]["ota_task_status"]
          tags: string[] | null
          title: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          actual_effort_minutes?: number | null
          actual_hours?: number | null
          assigned_at?: string | null
          assigned_by?: string | null
          assignee_id?: string | null
          classification?:
            | Database["public"]["Enums"]["ota_task_classification"]
            | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          expected_effort_minutes?: number | null
          id?: string
          is_quick_task?: boolean | null
          issue_tag?: string | null
          min_evidence_count?: number | null
          priority?: Database["public"]["Enums"]["ota_task_priority"]
          project_id: string
          require_evidence?: boolean | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["ota_task_status"]
          tags?: string[] | null
          title: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          actual_effort_minutes?: number | null
          actual_hours?: number | null
          assigned_at?: string | null
          assigned_by?: string | null
          assignee_id?: string | null
          classification?:
            | Database["public"]["Enums"]["ota_task_classification"]
            | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          expected_effort_minutes?: number | null
          id?: string
          is_quick_task?: boolean | null
          issue_tag?: string | null
          min_evidence_count?: number | null
          priority?: Database["public"]["Enums"]["ota_task_priority"]
          project_id?: string
          require_evidence?: boolean | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["ota_task_status"]
          tags?: string[] | null
          title?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "ota_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ota_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_messages: {
        Row: {
          attachments: Json | null
          body: string
          channel_provider: string
          channel_type: string | null
          client_message_id: string
          conversation_id: string
          created_at: string
          created_by: string | null
          error: string | null
          external_message_id: string | null
          id: string
          retry_count: number
          sender_display_name: string | null
          sent_at: string | null
          status: string
          tenant_id: string | null
          wa_phone_number_id: string | null
          wamid: string | null
        }
        Insert: {
          attachments?: Json | null
          body: string
          channel_provider?: string
          channel_type?: string | null
          client_message_id: string
          conversation_id: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          external_message_id?: string | null
          id?: string
          retry_count?: number
          sender_display_name?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string | null
          wa_phone_number_id?: string | null
          wamid?: string | null
        }
        Update: {
          attachments?: Json | null
          body?: string
          channel_provider?: string
          channel_type?: string | null
          client_message_id?: string
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          external_message_id?: string | null
          id?: string
          retry_count?: number
          sender_display_name?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string | null
          wa_phone_number_id?: string | null
          wamid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outbound_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_commission_config: {
        Row: {
          commission_rate: number
          commission_type: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          partner_id: string
        }
        Insert: {
          commission_rate?: number
          commission_type: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          partner_id: string
        }
        Update: {
          commission_rate?: number
          commission_type?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          partner_id?: string
        }
        Relationships: []
      }
      partner_property_mapping: {
        Row: {
          commission_rate: number | null
          created_at: string | null
          id: string
          is_active: boolean | null
          partner_id: string
          property_id: string
          role: string | null
          updated_at: string | null
        }
        Insert: {
          commission_rate?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          partner_id: string
          property_id: string
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          commission_rate?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          partner_id?: string
          property_id?: string
          role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_property_mapping_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_reference_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_property_mapping_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_property_mapping_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_property_room_types: {
        Row: {
          created_at: string
          default_capacity: number | null
          default_price: number | null
          display_name_override: string | null
          id: string
          is_active: boolean
          partner_property_id: string
          room_type_catalog_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_capacity?: number | null
          default_price?: number | null
          display_name_override?: string | null
          id?: string
          is_active?: boolean
          partner_property_id: string
          room_type_catalog_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_capacity?: number | null
          default_price?: number | null
          display_name_override?: string | null
          id?: string
          is_active?: boolean
          partner_property_id?: string
          room_type_catalog_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_property_room_types_partner_property_id_fkey"
            columns: ["partner_property_id"]
            isOneToOne: false
            referencedRelation: "partner_property_mapping"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_property_room_types_room_type_catalog_id_fkey"
            columns: ["room_type_catalog_id"]
            isOneToOne: false
            referencedRelation: "room_type_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          address: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          bank_account_info: Json | null
          blacklist_reason: string | null
          blacklisted_at: string | null
          blacklisted_by: string | null
          business_license: string | null
          commission_rate: number | null
          contact_person: string | null
          contract_end_date: string | null
          contract_number: string | null
          contract_start_date: string | null
          created_at: string
          email: string | null
          id: string
          is_sample_data: boolean
          last_activated_at: string | null
          last_activated_by: string | null
          note: string | null
          partner_name: string
          partner_status: Database["public"]["Enums"]["partner_status"] | null
          partner_type: Database["public"]["Enums"]["partner_type"]
          payment_method: string | null
          payment_terms: string | null
          phone: string | null
          priority_level: number | null
          region: string | null
          scenario_id: string | null
          secondary_phone: string | null
          status: string | null
          tax_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          bank_account_info?: Json | null
          blacklist_reason?: string | null
          blacklisted_at?: string | null
          blacklisted_by?: string | null
          business_license?: string | null
          commission_rate?: number | null
          contact_person?: string | null
          contract_end_date?: string | null
          contract_number?: string | null
          contract_start_date?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_sample_data?: boolean
          last_activated_at?: string | null
          last_activated_by?: string | null
          note?: string | null
          partner_name: string
          partner_status?: Database["public"]["Enums"]["partner_status"] | null
          partner_type: Database["public"]["Enums"]["partner_type"]
          payment_method?: string | null
          payment_terms?: string | null
          phone?: string | null
          priority_level?: number | null
          region?: string | null
          scenario_id?: string | null
          secondary_phone?: string | null
          status?: string | null
          tax_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          bank_account_info?: Json | null
          blacklist_reason?: string | null
          blacklisted_at?: string | null
          blacklisted_by?: string | null
          business_license?: string | null
          commission_rate?: number | null
          contact_person?: string | null
          contract_end_date?: string | null
          contract_number?: string | null
          contract_start_date?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_sample_data?: boolean
          last_activated_at?: string | null
          last_activated_by?: string | null
          note?: string | null
          partner_name?: string
          partner_status?: Database["public"]["Enums"]["partner_status"] | null
          partner_type?: Database["public"]["Enums"]["partner_type"]
          payment_method?: string | null
          payment_terms?: string | null
          phone?: string | null
          priority_level?: number | null
          region?: string | null
          scenario_id?: string | null
          secondary_phone?: string | null
          status?: string | null
          tax_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_request_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_type: string | null
          file_url: string
          id: string
          request_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_type?: string | null
          file_url: string
          id?: string
          request_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_type?: string | null
          file_url?: string
          id?: string
          request_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_request_attachments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "payment_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          confirmed_at: string | null
          created_at: string
          difference_amount: number | null
          difference_reason: string | null
          expense_category: string | null
          expense_period: string | null
          id: string
          is_sample_data: boolean
          note: string | null
          partner_id: string | null
          payment_type: string
          proposed_amount: number
          recipient_name: string | null
          recipient_unit: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          request_code: string
          requested_at: string
          requested_by: string | null
          scenario_id: string | null
          settlement_id: string | null
          settlement_type: string | null
          source_amount: number
          source_id: string | null
          status: string
          unified_booking_id: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          confirmed_at?: string | null
          created_at?: string
          difference_amount?: number | null
          difference_reason?: string | null
          expense_category?: string | null
          expense_period?: string | null
          id?: string
          is_sample_data?: boolean
          note?: string | null
          partner_id?: string | null
          payment_type: string
          proposed_amount?: number
          recipient_name?: string | null
          recipient_unit?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          request_code: string
          requested_at?: string
          requested_by?: string | null
          scenario_id?: string | null
          settlement_id?: string | null
          settlement_type?: string | null
          source_amount?: number
          source_id?: string | null
          status?: string
          unified_booking_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          confirmed_at?: string | null
          created_at?: string
          difference_amount?: number | null
          difference_reason?: string | null
          expense_category?: string | null
          expense_period?: string | null
          id?: string
          is_sample_data?: boolean
          note?: string | null
          partner_id?: string | null
          payment_type?: string
          proposed_amount?: number
          recipient_name?: string | null
          recipient_unit?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          request_code?: string
          requested_at?: string
          requested_by?: string | null
          scenario_id?: string | null
          settlement_id?: string | null
          settlement_type?: string | null
          source_amount?: number
          source_id?: string | null
          status?: string
          unified_booking_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_partner"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_reference_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "fk_partner"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_scenario"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      price_adjustments: {
        Row: {
          adjusted_at: string
          adjusted_by: string | null
          adjustment_percent: number
          adjustment_type: string | null
          created_at: string | null
          day_type: string | null
          id: string
          notes: string | null
          period_key: string
          pre_host_adr: number | null
          pre_margin_percent: number | null
          pre_ota_adr: number | null
          pre_velocity_ratio: number | null
          pre_volume_score: number | null
          property_id: string
          property_name: string
          room_type: string
          updated_at: string | null
        }
        Insert: {
          adjusted_at?: string
          adjusted_by?: string | null
          adjustment_percent: number
          adjustment_type?: string | null
          created_at?: string | null
          day_type?: string | null
          id?: string
          notes?: string | null
          period_key: string
          pre_host_adr?: number | null
          pre_margin_percent?: number | null
          pre_ota_adr?: number | null
          pre_velocity_ratio?: number | null
          pre_volume_score?: number | null
          property_id: string
          property_name: string
          room_type: string
          updated_at?: string | null
        }
        Update: {
          adjusted_at?: string
          adjusted_by?: string | null
          adjustment_percent?: number
          adjustment_type?: string | null
          created_at?: string | null
          day_type?: string | null
          id?: string
          notes?: string | null
          period_key?: string
          pre_host_adr?: number | null
          pre_margin_percent?: number | null
          pre_ota_adr?: number | null
          pre_velocity_ratio?: number | null
          pre_volume_score?: number | null
          property_id?: string
          property_name?: string
          room_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      pricing_calendar_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_date: string
          event_name: string | null
          event_type: string
          id: string
          notes: string | null
          price_weight: number | null
          property_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_date: string
          event_name?: string | null
          event_type: string
          id?: string
          notes?: string | null
          price_weight?: number | null
          property_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_date?: string
          event_name?: string | null
          event_type?: string
          id?: string
          notes?: string | null
          price_weight?: number | null
          property_id?: string | null
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
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      properties_mirror: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string
          currency: string | null
          id: string
          property_name: string
          provider: string
          provider_property_id: string
          raw_data: Json | null
          source_updated_at: string | null
          synced_at: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          property_name: string
          provider?: string
          provider_property_id: string
          raw_data?: Json | null
          source_updated_at?: string | null
          synced_at?: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          property_name?: string
          provider?: string
          provider_property_id?: string
          raw_data?: Json | null
          source_updated_at?: string | null
          synced_at?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      property_catalog: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          district: string | null
          district_code: string | null
          district_name_snapshot: string | null
          full_address: string | null
          id: string
          is_active: boolean | null
          property_code: string | null
          property_name: string
          property_type_id: string | null
          province_code: string | null
          province_name_snapshot: string | null
          total_units: number | null
          updated_at: string | null
          ward_code: string | null
          ward_name_snapshot: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          district?: string | null
          district_code?: string | null
          district_name_snapshot?: string | null
          full_address?: string | null
          id?: string
          is_active?: boolean | null
          property_code?: string | null
          property_name: string
          property_type_id?: string | null
          province_code?: string | null
          province_name_snapshot?: string | null
          total_units?: number | null
          updated_at?: string | null
          ward_code?: string | null
          ward_name_snapshot?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          district?: string | null
          district_code?: string | null
          district_name_snapshot?: string | null
          full_address?: string | null
          id?: string
          is_active?: boolean | null
          property_code?: string | null
          property_name?: string
          property_type_id?: string | null
          province_code?: string | null
          province_name_snapshot?: string | null
          total_units?: number | null
          updated_at?: string | null
          ward_code?: string | null
          ward_name_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_catalog_district_code_fkey"
            columns: ["district_code"]
            isOneToOne: false
            referencedRelation: "vn_districts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "property_catalog_property_type_id_fkey"
            columns: ["property_type_id"]
            isOneToOne: false
            referencedRelation: "property_type_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_catalog_province_code_fkey"
            columns: ["province_code"]
            isOneToOne: false
            referencedRelation: "vn_provinces"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "property_catalog_ward_code_fkey"
            columns: ["ward_code"]
            isOneToOne: false
            referencedRelation: "vn_wards"
            referencedColumns: ["code"]
          },
        ]
      }
      property_mappings: {
        Row: {
          channex_property_id: string
          channex_user_id: string | null
          created_at: string
          id: string
          internal_property_id: string | null
          last_validated_at: string | null
          property_name: string | null
          status: Database["public"]["Enums"]["mapping_status"]
          updated_at: string
          validation_error: string | null
        }
        Insert: {
          channex_property_id: string
          channex_user_id?: string | null
          created_at?: string
          id?: string
          internal_property_id?: string | null
          last_validated_at?: string | null
          property_name?: string | null
          status?: Database["public"]["Enums"]["mapping_status"]
          updated_at?: string
          validation_error?: string | null
        }
        Update: {
          channex_property_id?: string
          channex_user_id?: string | null
          created_at?: string
          id?: string
          internal_property_id?: string | null
          last_validated_at?: string | null
          property_name?: string | null
          status?: Database["public"]["Enums"]["mapping_status"]
          updated_at?: string
          validation_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_mappings_internal_property_id_fkey"
            columns: ["internal_property_id"]
            isOneToOne: false
            referencedRelation: "host_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_pricing_profiles: {
        Row: {
          avg_adr_90d: number | null
          avg_occupancy_90d: number | null
          avg_velocity_90d: number | null
          created_at: string
          id: string
          low_months: number[] | null
          ota_mix_ratio: number | null
          peak_months: number[] | null
          pricing_intent: string | null
          property_id: string
          property_name: string | null
          rooms_count: number | null
          updated_at: string
          volatility_score: number | null
        }
        Insert: {
          avg_adr_90d?: number | null
          avg_occupancy_90d?: number | null
          avg_velocity_90d?: number | null
          created_at?: string
          id?: string
          low_months?: number[] | null
          ota_mix_ratio?: number | null
          peak_months?: number[] | null
          pricing_intent?: string | null
          property_id: string
          property_name?: string | null
          rooms_count?: number | null
          updated_at?: string
          volatility_score?: number | null
        }
        Update: {
          avg_adr_90d?: number | null
          avg_occupancy_90d?: number | null
          avg_velocity_90d?: number | null
          created_at?: string
          id?: string
          low_months?: number[] | null
          ota_mix_ratio?: number | null
          peak_months?: number[] | null
          pricing_intent?: string | null
          property_id?: string
          property_name?: string | null
          rooms_count?: number | null
          updated_at?: string
          volatility_score?: number | null
        }
        Relationships: []
      }
      property_room_types: {
        Row: {
          created_at: string
          default_capacity: number | null
          default_price: number | null
          display_name_override: string | null
          id: string
          is_active: boolean
          property_id: string
          room_type_catalog_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_capacity?: number | null
          default_price?: number | null
          display_name_override?: string | null
          id?: string
          is_active?: boolean
          property_id: string
          room_type_catalog_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_capacity?: number | null
          default_price?: number | null
          display_name_override?: string | null
          id?: string
          is_active?: boolean
          property_id?: string
          room_type_catalog_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_room_types_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_room_types_room_type_catalog_id_fkey"
            columns: ["room_type_catalog_id"]
            isOneToOne: false
            referencedRelation: "room_type_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      property_type_catalog: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name_en: string | null
          name_vi: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_en?: string | null
          name_vi: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_en?: string | null
          name_vi?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      push_deliveries: {
        Row: {
          delivered_at: string | null
          event_type: string
          id: string
          idempotency_key: string
          payload_hash: string | null
          recipient_user_id: string
          source_record_id: string | null
          source_table: string | null
          subscription_id: string | null
          ttl_seconds: number | null
        }
        Insert: {
          delivered_at?: string | null
          event_type: string
          id?: string
          idempotency_key: string
          payload_hash?: string | null
          recipient_user_id: string
          source_record_id?: string | null
          source_table?: string | null
          subscription_id?: string | null
          ttl_seconds?: number | null
        }
        Update: {
          delivered_at?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string
          payload_hash?: string | null
          recipient_user_id?: string
          source_record_id?: string | null
          source_table?: string | null
          subscription_id?: string | null
          ttl_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "push_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          consecutive_failures: number | null
          created_at: string | null
          device_fingerprint: string | null
          endpoint: string
          id: string
          is_active: boolean | null
          last_failure_at: string | null
          last_failure_reason: string | null
          last_used_at: string | null
          p256dh: string
          updated_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          consecutive_failures?: number | null
          created_at?: string | null
          device_fingerprint?: string | null
          endpoint: string
          id?: string
          is_active?: boolean | null
          last_failure_at?: string | null
          last_failure_reason?: string | null
          last_used_at?: string | null
          p256dh: string
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          consecutive_failures?: number | null
          created_at?: string | null
          device_fingerprint?: string | null
          endpoint?: string
          id?: string
          is_active?: boolean | null
          last_failure_at?: string | null
          last_failure_reason?: string | null
          last_used_at?: string | null
          p256dh?: string
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          bucket_key: string
          bucket_type: string
          created_at: string
          id: string
          request_count: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          bucket_type?: string
          created_at?: string
          id?: string
          request_count?: number
          window_start: string
        }
        Update: {
          bucket_key?: string
          bucket_type?: string
          created_at?: string
          id?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      rate_plan_mappings: {
        Row: {
          channel_code: string | null
          channex_rate_plan_id: string
          created_at: string
          currency: string | null
          id: string
          internal_rate_plan_id: string | null
          last_validated_at: string | null
          rate_plan_name: string | null
          room_type_mapping_id: string
          sell_mode: string | null
          status: Database["public"]["Enums"]["mapping_status"]
          updated_at: string
          validation_error: string | null
        }
        Insert: {
          channel_code?: string | null
          channex_rate_plan_id: string
          created_at?: string
          currency?: string | null
          id?: string
          internal_rate_plan_id?: string | null
          last_validated_at?: string | null
          rate_plan_name?: string | null
          room_type_mapping_id: string
          sell_mode?: string | null
          status?: Database["public"]["Enums"]["mapping_status"]
          updated_at?: string
          validation_error?: string | null
        }
        Update: {
          channel_code?: string | null
          channex_rate_plan_id?: string
          created_at?: string
          currency?: string | null
          id?: string
          internal_rate_plan_id?: string | null
          last_validated_at?: string | null
          rate_plan_name?: string | null
          room_type_mapping_id?: string
          sell_mode?: string | null
          status?: Database["public"]["Enums"]["mapping_status"]
          updated_at?: string
          validation_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rate_plan_mappings_room_type_mapping_id_fkey"
            columns: ["room_type_mapping_id"]
            isOneToOne: false
            referencedRelation: "room_type_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_plans: {
        Row: {
          base_rate: number | null
          channels: string[] | null
          code: string | null
          created_at: string
          id: string
          is_base: boolean | null
          name: string
          property_id: string
          room_type_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          base_rate?: number | null
          channels?: string[] | null
          code?: string | null
          created_at?: string
          id?: string
          is_base?: boolean | null
          name: string
          property_id: string
          room_type_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          base_rate?: number | null
          channels?: string[] | null
          code?: string | null
          created_at?: string
          id?: string
          is_base?: boolean | null
          name?: string
          property_id?: string
          room_type_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rate_plans_mirror: {
        Row: {
          base_rate: number | null
          channels: string[] | null
          created_at: string
          currency: string | null
          id: string
          provider: string
          provider_property_id: string
          provider_rate_plan_id: string
          provider_room_type_id: string
          rate_plan_code: string | null
          rate_plan_name: string
          raw_data: Json | null
          sell_mode: string | null
          source_updated_at: string | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          base_rate?: number | null
          channels?: string[] | null
          created_at?: string
          currency?: string | null
          id?: string
          provider?: string
          provider_property_id: string
          provider_rate_plan_id: string
          provider_room_type_id: string
          rate_plan_code?: string | null
          rate_plan_name: string
          raw_data?: Json | null
          sell_mode?: string | null
          source_updated_at?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          base_rate?: number | null
          channels?: string[] | null
          created_at?: string
          currency?: string | null
          id?: string
          provider?: string
          provider_property_id?: string
          provider_rate_plan_id?: string
          provider_room_type_id?: string
          rate_plan_code?: string | null
          rate_plan_name?: string
          raw_data?: Json | null
          sell_mode?: string | null
          source_updated_at?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      recon_runs: {
        Row: {
          created_by: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          started_at: string
          status: string
          summary: Json | null
        }
        Insert: {
          created_by?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          summary?: Json | null
        }
        Update: {
          created_by?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          summary?: Json | null
        }
        Relationships: []
      }
      refund_thresholds: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          threshold_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          threshold_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          threshold_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      revenue_entries: {
        Row: {
          account_type: string
          amount: number
          category: string
          created_at: string
          created_by: string | null
          currency: string
          entry_date: string
          id: string
          note: string | null
          related_id: string | null
          related_type: string
          unified_booking_id: string | null
        }
        Insert: {
          account_type: string
          amount?: number
          category: string
          created_at?: string
          created_by?: string | null
          currency?: string
          entry_date: string
          id?: string
          note?: string | null
          related_id?: string | null
          related_type: string
          unified_booking_id?: string | null
        }
        Update: {
          account_type?: string
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          entry_date?: string
          id?: string
          note?: string | null
          related_id?: string | null
          related_type?: string
          unified_booking_id?: string | null
        }
        Relationships: []
      }
      room_type_catalog: {
        Row: {
          applicable_property_types: string[] | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name_en: string | null
          name_vi: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          applicable_property_types?: string[] | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_en?: string | null
          name_vi: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          applicable_property_types?: string[] | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_en?: string | null
          name_vi?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      room_type_mappings: {
        Row: {
          channex_room_type_id: string
          created_at: string
          id: string
          internal_room_type_id: string | null
          last_validated_at: string | null
          occupancy: number | null
          property_mapping_id: string
          room_type_name: string | null
          status: Database["public"]["Enums"]["mapping_status"]
          updated_at: string
          validation_error: string | null
        }
        Insert: {
          channex_room_type_id: string
          created_at?: string
          id?: string
          internal_room_type_id?: string | null
          last_validated_at?: string | null
          occupancy?: number | null
          property_mapping_id: string
          room_type_name?: string | null
          status?: Database["public"]["Enums"]["mapping_status"]
          updated_at?: string
          validation_error?: string | null
        }
        Update: {
          channex_room_type_id?: string
          created_at?: string
          id?: string
          internal_room_type_id?: string | null
          last_validated_at?: string | null
          occupancy?: number | null
          property_mapping_id?: string
          room_type_name?: string | null
          status?: Database["public"]["Enums"]["mapping_status"]
          updated_at?: string
          validation_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_type_mappings_internal_room_type_id_fkey"
            columns: ["internal_room_type_id"]
            isOneToOne: false
            referencedRelation: "host_room_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_type_mappings_property_mapping_id_fkey"
            columns: ["property_mapping_id"]
            isOneToOne: false
            referencedRelation: "property_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      room_types_mirror: {
        Row: {
          created_at: string
          id: string
          occupancy: number | null
          provider: string
          provider_property_id: string
          provider_room_type_id: string
          raw_data: Json | null
          room_type_name: string
          source_updated_at: string | null
          synced_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          occupancy?: number | null
          provider?: string
          provider_property_id: string
          provider_room_type_id: string
          raw_data?: Json | null
          room_type_name: string
          source_updated_at?: string | null
          synced_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          occupancy?: number | null
          provider?: string
          provider_property_id?: string
          provider_room_type_id?: string
          raw_data?: Json | null
          room_type_name?: string
          source_updated_at?: string | null
          synced_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_catalog: {
        Row: {
          active_status: boolean | null
          base_price: number | null
          cost_price: number | null
          created_at: string
          default_partner_id: string | null
          description: string | null
          id: string
          service_name: string
          service_type: Database["public"]["Enums"]["service_type"]
          updated_at: string
        }
        Insert: {
          active_status?: boolean | null
          base_price?: number | null
          cost_price?: number | null
          created_at?: string
          default_partner_id?: string | null
          description?: string | null
          id?: string
          service_name: string
          service_type: Database["public"]["Enums"]["service_type"]
          updated_at?: string
        }
        Update: {
          active_status?: boolean | null
          base_price?: number | null
          cost_price?: number | null
          created_at?: string
          default_partner_id?: string | null
          description?: string | null
          id?: string
          service_name?: string
          service_type?: Database["public"]["Enums"]["service_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_catalog_default_partner_id_fkey"
            columns: ["default_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_reference_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "service_catalog_default_partner_id_fkey"
            columns: ["default_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          collected_at: string | null
          collected_by: string | null
          collector_type: string
          cost_price: number | null
          created_at: string
          created_by: string | null
          id: string
          is_sample_data: boolean
          note: string | null
          partner_id: string | null
          pax: number | null
          property_group_id: string | null
          sale_price: number | null
          scenario_id: string | null
          service_date_time: string
          service_id: string
          service_provider_type: string
          status: Database["public"]["Enums"]["service_status"]
          unified_booking_id: string
          updated_at: string
        }
        Insert: {
          collected_at?: string | null
          collected_by?: string | null
          collector_type?: string
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_sample_data?: boolean
          note?: string | null
          partner_id?: string | null
          pax?: number | null
          property_group_id?: string | null
          sale_price?: number | null
          scenario_id?: string | null
          service_date_time: string
          service_id: string
          service_provider_type?: string
          status?: Database["public"]["Enums"]["service_status"]
          unified_booking_id: string
          updated_at?: string
        }
        Update: {
          collected_at?: string | null
          collected_by?: string | null
          collector_type?: string
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_sample_data?: boolean
          note?: string | null
          partner_id?: string | null
          pax?: number | null
          property_group_id?: string | null
          sale_price?: number | null
          scenario_id?: string | null
          service_date_time?: string
          service_id?: string
          service_provider_type?: string
          status?: Database["public"]["Enums"]["service_status"]
          unified_booking_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_reference_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "service_orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      service_partner_payables: {
        Row: {
          amount_payable: number
          created_at: string
          due_date: string | null
          id: string
          is_sample_data: boolean
          note: string | null
          paid_at: string | null
          partner_id: string
          scenario_id: string | null
          service_order_id: string
          status: Database["public"]["Enums"]["payable_status"]
          updated_at: string
        }
        Insert: {
          amount_payable: number
          created_at?: string
          due_date?: string | null
          id?: string
          is_sample_data?: boolean
          note?: string | null
          paid_at?: string | null
          partner_id: string
          scenario_id?: string | null
          service_order_id: string
          status?: Database["public"]["Enums"]["payable_status"]
          updated_at?: string
        }
        Update: {
          amount_payable?: number
          created_at?: string
          due_date?: string | null
          id?: string
          is_sample_data?: boolean
          note?: string | null
          paid_at?: string | null
          partner_id?: string
          scenario_id?: string | null
          service_order_id?: string
          status?: Database["public"]["Enums"]["payable_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_partner_payables_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_reference_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "service_partner_payables_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_partner_payables_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_partner_payables_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_payments: {
        Row: {
          amount_collected: number
          collected_at: string | null
          collected_by: string | null
          created_at: string
          id: string
          is_sample_data: boolean
          payee_type: string
          payer_type: string
          payment_method: string
          receipt: string | null
          scenario_id: string | null
          service_order_id: string
          service_settlement_id: string | null
        }
        Insert: {
          amount_collected: number
          collected_at?: string | null
          collected_by?: string | null
          created_at?: string
          id?: string
          is_sample_data?: boolean
          payee_type?: string
          payer_type?: string
          payment_method: string
          receipt?: string | null
          scenario_id?: string | null
          service_order_id: string
          service_settlement_id?: string | null
        }
        Update: {
          amount_collected?: number
          collected_at?: string | null
          collected_by?: string | null
          created_at?: string
          id?: string
          is_sample_data?: boolean
          payee_type?: string
          payer_type?: string
          payment_method?: string
          receipt?: string | null
          scenario_id?: string | null
          service_order_id?: string
          service_settlement_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_payments_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_payments_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_payments_service_settlement_id_fkey"
            columns: ["service_settlement_id"]
            isOneToOne: false
            referencedRelation: "service_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      service_settlement_items: {
        Row: {
          amount_collected: number
          amount_remaining: number
          collector_type: string | null
          cost_price: number
          created_at: string
          guest_name: string | null
          id: string
          net_line: number
          sale_price: number
          service_date: string | null
          service_name: string | null
          service_order_id: string
          service_type: string | null
          settlement_id: string
          unified_booking_id: string | null
        }
        Insert: {
          amount_collected?: number
          amount_remaining?: number
          collector_type?: string | null
          cost_price?: number
          created_at?: string
          guest_name?: string | null
          id?: string
          net_line?: number
          sale_price?: number
          service_date?: string | null
          service_name?: string | null
          service_order_id: string
          service_type?: string | null
          settlement_id: string
          unified_booking_id?: string | null
        }
        Update: {
          amount_collected?: number
          amount_remaining?: number
          collector_type?: string | null
          cost_price?: number
          created_at?: string
          guest_name?: string | null
          id?: string
          net_line?: number
          sale_price?: number
          service_date?: string | null
          service_name?: string | null
          service_order_id?: string
          service_type?: string | null
          settlement_id?: string
          unified_booking_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_settlement_items_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "service_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      service_settlements: {
        Row: {
          created_at: string
          created_by: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          is_sample_data: boolean
          net_amount: number
          net_direction: string
          note: string | null
          paid_at: string | null
          paid_by: string | null
          partner_collected_amount: number
          partner_id: string
          payment_status: string
          period_from: string
          period_to: string
          roomrise_collected_amount: number
          scenario_id: string | null
          settlement_code: string
          total_cost_price: number
          total_paid: number | null
          total_sale_price: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          is_sample_data?: boolean
          net_amount?: number
          net_direction?: string
          note?: string | null
          paid_at?: string | null
          paid_by?: string | null
          partner_collected_amount?: number
          partner_id: string
          payment_status?: string
          period_from: string
          period_to: string
          roomrise_collected_amount?: number
          scenario_id?: string | null
          settlement_code: string
          total_cost_price?: number
          total_paid?: number | null
          total_sale_price?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          is_sample_data?: boolean
          net_amount?: number
          net_direction?: string
          note?: string | null
          paid_at?: string | null
          paid_by?: string | null
          partner_collected_amount?: number
          partner_id?: string
          payment_status?: string
          period_from?: string
          period_to?: string
          roomrise_collected_amount?: number
          scenario_id?: string | null
          settlement_code?: string
          total_cost_price?: number
          total_paid?: number | null
          total_sale_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_settlements_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_reference_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "service_settlements_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_settlements_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_bookings: {
        Row: {
          created_at: string
          host_collected_amount: number
          id: string
          payable_amount: number
          payable_id: string | null
          settlement_id: string
          unified_booking_id: string
        }
        Insert: {
          created_at?: string
          host_collected_amount?: number
          id?: string
          payable_amount?: number
          payable_id?: string | null
          settlement_id: string
          unified_booking_id: string
        }
        Update: {
          created_at?: string
          host_collected_amount?: number
          id?: string
          payable_amount?: number
          payable_id?: string | null
          settlement_id?: string
          unified_booking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_bookings_payable_id_fkey"
            columns: ["payable_id"]
            isOneToOne: false
            referencedRelation: "host_payables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_bookings_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "host_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_bookings_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "v_settlement_net_integrity"
            referencedColumns: ["settlement_id"]
          },
        ]
      }
      stays: {
        Row: {
          actual_check_in_at: string | null
          actual_check_out_at: string | null
          assigned_at: string | null
          assigned_by: string | null
          created_at: string
          host_cost: number | null
          host_property_name: string | null
          host_room_id: string | null
          host_room_type: string | null
          id: string
          is_sample_data: boolean
          operation_note: string | null
          scenario_id: string | null
          stay_status: Database["public"]["Enums"]["stay_status"]
          unified_booking_id: string
          updated_at: string
        }
        Insert: {
          actual_check_in_at?: string | null
          actual_check_out_at?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string
          host_cost?: number | null
          host_property_name?: string | null
          host_room_id?: string | null
          host_room_type?: string | null
          id?: string
          is_sample_data?: boolean
          operation_note?: string | null
          scenario_id?: string | null
          stay_status?: Database["public"]["Enums"]["stay_status"]
          unified_booking_id: string
          updated_at?: string
        }
        Update: {
          actual_check_in_at?: string | null
          actual_check_out_at?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string
          host_cost?: number | null
          host_property_name?: string | null
          host_room_id?: string | null
          host_room_type?: string | null
          id?: string
          is_sample_data?: boolean
          operation_note?: string | null
          scenario_id?: string | null
          stay_status?: Database["public"]["Enums"]["stay_status"]
          unified_booking_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stays_host_room_id_fkey"
            columns: ["host_room_id"]
            isOneToOne: false
            referencedRelation: "host_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stays_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_coverage_kpi: {
        Row: {
          checked_at: string
          coverage_pct: number | null
          details: Json | null
          id: string
          kpi_date: string
          missing_booking_ids: Json | null
          provider: string
          total_bookings_mirror: number | null
          total_bookings_source: number | null
        }
        Insert: {
          checked_at?: string
          coverage_pct?: number | null
          details?: Json | null
          id?: string
          kpi_date: string
          missing_booking_ids?: Json | null
          provider?: string
          total_bookings_mirror?: number | null
          total_bookings_source?: number | null
        }
        Update: {
          checked_at?: string
          coverage_pct?: number | null
          details?: Json | null
          id?: string
          kpi_date?: string
          missing_booking_ids?: Json | null
          provider?: string
          total_bookings_mirror?: number | null
          total_bookings_source?: number | null
        }
        Relationships: []
      }
      sync_job_failed_cells: {
        Row: {
          cell_date: string | null
          cell_key: string
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          last_retry_at: string | null
          rate_plan_mapping_id: string | null
          retry_count: number | null
          room_type_mapping_id: string | null
          sync_job_id: string
        }
        Insert: {
          cell_date?: string | null
          cell_key: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          last_retry_at?: string | null
          rate_plan_mapping_id?: string | null
          retry_count?: number | null
          room_type_mapping_id?: string | null
          sync_job_id: string
        }
        Update: {
          cell_date?: string | null
          cell_key?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          last_retry_at?: string | null
          rate_plan_mapping_id?: string | null
          retry_count?: number | null
          room_type_mapping_id?: string | null
          sync_job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_job_failed_cells_sync_job_id_fkey"
            columns: ["sync_job_id"]
            isOneToOne: false
            referencedRelation: "sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_jobs: {
        Row: {
          channel_code: string | null
          created_at: string
          date_from: string | null
          date_to: string | null
          error_summary: Json | null
          fail_count: number | null
          finished_at: string | null
          id: string
          job_type: string
          property_mapping_id: string | null
          scope_ids: string[] | null
          scope_type: string | null
          started_at: string | null
          status: string
          success_count: number | null
          total_cells: number | null
          triggered_by: string | null
        }
        Insert: {
          channel_code?: string | null
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          error_summary?: Json | null
          fail_count?: number | null
          finished_at?: string | null
          id?: string
          job_type: string
          property_mapping_id?: string | null
          scope_ids?: string[] | null
          scope_type?: string | null
          started_at?: string | null
          status?: string
          success_count?: number | null
          total_cells?: number | null
          triggered_by?: string | null
        }
        Update: {
          channel_code?: string | null
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          error_summary?: Json | null
          fail_count?: number | null
          finished_at?: string | null
          id?: string
          job_type?: string
          property_mapping_id?: string | null
          scope_ids?: string[] | null
          scope_type?: string | null
          started_at?: string | null
          status?: string
          success_count?: number | null
          total_cells?: number | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_jobs_property_mapping_id_fkey"
            columns: ["property_mapping_id"]
            isOneToOne: false
            referencedRelation: "property_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_runs: {
        Row: {
          counts: Json
          created_at: string
          ended_at: string | null
          entity: string
          error: string | null
          id: string
          provider: string
          run_type: string
          since: string | null
          started_at: string
          status: string
          until: string | null
        }
        Insert: {
          counts?: Json
          created_at?: string
          ended_at?: string | null
          entity: string
          error?: string | null
          id?: string
          provider?: string
          run_type?: string
          since?: string | null
          started_at?: string
          status?: string
          until?: string | null
        }
        Update: {
          counts?: Json
          created_at?: string
          ended_at?: string | null
          entity?: string
          error?: string | null
          id?: string
          provider?: string
          run_type?: string
          since?: string | null
          started_at?: string
          status?: string
          until?: string | null
        }
        Relationships: []
      }
      sync_state: {
        Row: {
          key: string
          updated_at: string
          value_json: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value_json?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value_json?: Json
        }
        Relationships: []
      }
      test_runs: {
        Row: {
          created_at: string
          duration_ms: number | null
          environment: string
          fail_count: number | null
          id: string
          include_bad_data: boolean
          pass_count: number | null
          run_at: string
          run_by: string | null
          scale: string
          status: string
          test_results: Json | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          environment: string
          fail_count?: number | null
          id?: string
          include_bad_data?: boolean
          pass_count?: number | null
          run_at?: string
          run_by?: string | null
          scale?: string
          status?: string
          test_results?: Json | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          environment?: string
          fail_count?: number | null
          id?: string
          include_bad_data?: boolean
          pass_count?: number | null
          run_at?: string
          run_by?: string | null
          scale?: string
          status?: string
          test_results?: Json | null
        }
        Relationships: []
      }
      test_scenarios: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          purpose: string | null
          seed_key: string | null
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          purpose?: string | null
          seed_key?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          purpose?: string | null
          seed_key?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_filter_state: {
        Row: {
          id: string
          org_id: string
          scope_key: string
          state: Json
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          id?: string
          org_id: string
          scope_key: string
          state?: Json
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          id?: string
          org_id?: string
          scope_key?: string
          state?: Json
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      user_page_permissions: {
        Row: {
          can_use: boolean
          created_at: string
          created_by: string | null
          id: string
          page_path: string
          user_id: string
        }
        Insert: {
          can_use?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          page_path: string
          user_id: string
        }
        Update: {
          can_use?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          page_path?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vn_districts: {
        Row: {
          code: string
          created_at: string | null
          district_type: string | null
          effective_from: string | null
          effective_to: string | null
          is_active: boolean | null
          name: string
          name_en: string | null
          province_code: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          district_type?: string | null
          effective_from?: string | null
          effective_to?: string | null
          is_active?: boolean | null
          name: string
          name_en?: string | null
          province_code: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          district_type?: string | null
          effective_from?: string | null
          effective_to?: string | null
          is_active?: boolean | null
          name?: string
          name_en?: string | null
          province_code?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vn_districts_province_code_fkey"
            columns: ["province_code"]
            isOneToOne: false
            referencedRelation: "vn_provinces"
            referencedColumns: ["code"]
          },
        ]
      }
      vn_provinces: {
        Row: {
          code: string
          created_at: string | null
          effective_from: string | null
          effective_to: string | null
          is_active: boolean | null
          name: string
          name_en: string | null
          region: string | null
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          effective_from?: string | null
          effective_to?: string | null
          is_active?: boolean | null
          name: string
          name_en?: string | null
          region?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          effective_from?: string | null
          effective_to?: string | null
          is_active?: boolean | null
          name?: string
          name_en?: string | null
          region?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      vn_wards: {
        Row: {
          code: string
          created_at: string | null
          district_code: string
          effective_from: string | null
          effective_to: string | null
          is_active: boolean | null
          name: string
          name_en: string | null
          updated_at: string | null
          ward_type: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          district_code: string
          effective_from?: string | null
          effective_to?: string | null
          is_active?: boolean | null
          name: string
          name_en?: string | null
          updated_at?: string | null
          ward_type?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          district_code?: string
          effective_from?: string | null
          effective_to?: string | null
          is_active?: boolean | null
          name?: string
          name_en?: string | null
          updated_at?: string | null
          ward_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vn_wards_district_code_fkey"
            columns: ["district_code"]
            isOneToOne: false
            referencedRelation: "vn_districts"
            referencedColumns: ["code"]
          },
        ]
      }
      webhook_events: {
        Row: {
          created_at: string | null
          dedupe_key: string | null
          error: string | null
          event_type: string
          headers: Json | null
          id: string
          ip: string | null
          is_valid: boolean | null
          kind: string | null
          payload: Json
          processed_at: string | null
          provider: string
          received_at: string | null
          reject_reason: string | null
          request_id: string | null
          retry_count: number | null
          status: string
          updated_at: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string | null
          dedupe_key?: string | null
          error?: string | null
          event_type: string
          headers?: Json | null
          id?: string
          ip?: string | null
          is_valid?: boolean | null
          kind?: string | null
          payload: Json
          processed_at?: string | null
          provider?: string
          received_at?: string | null
          reject_reason?: string | null
          request_id?: string | null
          retry_count?: number | null
          status?: string
          updated_at?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string | null
          dedupe_key?: string | null
          error?: string | null
          event_type?: string
          headers?: Json | null
          id?: string
          ip?: string | null
          is_valid?: boolean | null
          kind?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string | null
          reject_reason?: string | null
          request_id?: string | null
          retry_count?: number | null
          status?: string
          updated_at?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      webhook_events_log: {
        Row: {
          channel: string
          error_message: string | null
          id: string
          payload_json: Json | null
          phone_number_id: string | null
          processing_status: string | null
          received_at: string
          signature_valid: boolean | null
          tenant_id: string | null
        }
        Insert: {
          channel?: string
          error_message?: string | null
          id?: string
          payload_json?: Json | null
          phone_number_id?: string | null
          processing_status?: string | null
          received_at?: string
          signature_valid?: boolean | null
          tenant_id?: string | null
        }
        Update: {
          channel?: string
          error_message?: string | null
          id?: string
          payload_json?: Json | null
          phone_number_id?: string | null
          processing_status?: string | null
          received_at?: string
          signature_valid?: boolean | null
          tenant_id?: string | null
        }
        Relationships: []
      }
      webhook_health_checks: {
        Row: {
          check_type: string
          check_window_minutes: number | null
          created_at: string
          details: Json | null
          events_in_window: number | null
          id: string
          last_event_at: string | null
          provider: string
          status: string
        }
        Insert: {
          check_type: string
          check_window_minutes?: number | null
          created_at?: string
          details?: Json | null
          events_in_window?: number | null
          id?: string
          last_event_at?: string | null
          provider?: string
          status: string
        }
        Update: {
          check_type?: string
          check_window_minutes?: number | null
          created_at?: string
          details?: Json | null
          events_in_window?: number | null
          id?: string
          last_event_at?: string | null
          provider?: string
          status?: string
        }
        Relationships: []
      }
      webhook_retry_queue: {
        Row: {
          created_at: string
          error_code: string | null
          event_type: string
          id: string
          last_error: string | null
          max_retries: number | null
          next_retry_at: string
          payload: Json
          provider: string
          retry_count: number | null
          status: string
          updated_at: string
          webhook_event_id: string | null
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          event_type: string
          id?: string
          last_error?: string | null
          max_retries?: number | null
          next_retry_at: string
          payload: Json
          provider?: string
          retry_count?: number | null
          status?: string
          updated_at?: string
          webhook_event_id?: string | null
        }
        Update: {
          created_at?: string
          error_code?: string | null
          event_type?: string
          id?: string
          last_error?: string | null
          max_retries?: number | null
          next_retry_at?: string
          payload?: Json
          provider?: string
          retry_count?: number | null
          status?: string
          updated_at?: string
          webhook_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_retry_queue_webhook_event_id_fkey"
            columns: ["webhook_event_id"]
            isOneToOne: false
            referencedRelation: "webhook_events"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_integrations: {
        Row: {
          access_token_ref: string
          app_secret_ref: string
          created_at: string
          display_phone: string | null
          id: string
          last_error: string | null
          last_health_check_at: string | null
          last_webhook_received_at: string | null
          phone_number_id: string
          status: string
          tenant_id: string
          updated_at: string
          verify_token: string
          waba_id: string
          webhook_url: string | null
        }
        Insert: {
          access_token_ref?: string
          app_secret_ref?: string
          created_at?: string
          display_phone?: string | null
          id?: string
          last_error?: string | null
          last_health_check_at?: string | null
          last_webhook_received_at?: string | null
          phone_number_id: string
          status?: string
          tenant_id: string
          updated_at?: string
          verify_token: string
          waba_id: string
          webhook_url?: string | null
        }
        Update: {
          access_token_ref?: string
          app_secret_ref?: string
          created_at?: string
          display_phone?: string | null
          id?: string
          last_error?: string | null
          last_health_check_at?: string | null
          last_webhook_received_at?: string | null
          phone_number_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          verify_token?: string
          waba_id?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      analytics_historical_daily_pl_v: {
        Row: {
          adr: number | null
          bookings_count: number | null
          business_date: string | null
          channel: string | null
          gross_profit_pl: number | null
          host_cost: number | null
          margin_pct: number | null
          nights: number | null
          overrides_count: number | null
          property_name: string | null
          revenue_pl: number | null
          revenue_raw_net: number | null
          room_type: string | null
        }
        Relationships: []
      }
      analytics_historical_daily_v: {
        Row: {
          adr: number | null
          bookings_count: number | null
          business_date: string | null
          channel: string | null
          gross_profit: number | null
          host_cost: number | null
          margin_pct: number | null
          nights: number | null
          property_name: string | null
          revenue_gross: number | null
          revenue_net: number | null
          room_type: string | null
        }
        Relationships: []
      }
      booking_new_events_v: {
        Row: {
          booking_id: string | null
          created_date: string | null
          guest_name: string | null
          nights: number | null
          ota_source: string | null
          payment_type: Database["public"]["Enums"]["payment_type"] | null
          property_id: string | null
          property_name: string | null
          source: string | null
          status: Database["public"]["Enums"]["booking_status"] | null
          total_amount_net: number | null
        }
        Relationships: []
      }
      latest_price_adjustments: {
        Row: {
          adjusted_at: string | null
          adjusted_by: string | null
          adjustment_percent: number | null
          adjustment_type: string | null
          day_type: string | null
          days_since_adjustment: number | null
          id: string | null
          notes: string | null
          period_key: string | null
          pre_host_adr: number | null
          pre_margin_percent: number | null
          pre_ota_adr: number | null
          pre_velocity_ratio: number | null
          pre_volume_score: number | null
          property_id: string | null
          property_name: string | null
          room_type: string | null
        }
        Relationships: []
      }
      ota_project_outputs_latest: {
        Row: {
          created_at: string | null
          created_by: string | null
          data: Json | null
          id: string | null
          project_id: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          schema_version: number | null
          status: Database["public"]["Enums"]["ota_output_status"] | null
          submitted_at: string | null
          submitted_by: string | null
          version: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ota_project_outputs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ota_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_reference_summary: {
        Row: {
          can_hard_delete: boolean | null
          commission_count: number | null
          deposit_count: number | null
          partner_id: string | null
          partner_name: string | null
          partner_status: Database["public"]["Enums"]["partner_status"] | null
          payable_count: number | null
          payment_count: number | null
          prepaid_count: number | null
          property_count: number | null
          room_count: number | null
          segment_count: number | null
          surcharge_count: number | null
          total_references: number | null
        }
        Relationships: []
      }
      push_delivery_stats: {
        Row: {
          delivery_count: number | null
          event_type: string | null
          hour: string | null
          unique_recipients: number | null
        }
        Relationships: []
      }
      unified_bookings: {
        Row: {
          booking_date: string | null
          booking_status: Database["public"]["Enums"]["booking_status"] | null
          booking_type: string | null
          check_in_date: string | null
          check_out_date: string | null
          commission_amount: number | null
          commission_rate: number | null
          created_at: string | null
          customer_id: string | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          host_cost: number | null
          host_property_name: string | null
          host_room_code: string | null
          host_room_id: string | null
          host_room_type: string | null
          nationality: string | null
          nights: number | null
          ota_booking_code: string | null
          ota_room_type_sold: string | null
          payment_type: Database["public"]["Enums"]["payment_type"] | null
          pms_property_id: string | null
          pms_property_name: string | null
          source: string | null
          stay_status: Database["public"]["Enums"]["stay_status"] | null
          total_amount_gross: number | null
          total_amount_net: number | null
          unified_booking_id: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      unified_bookings_with_final_amount: {
        Row: {
          booking_date: string | null
          booking_status: Database["public"]["Enums"]["booking_status"] | null
          booking_type: string | null
          check_in_date: string | null
          check_out_date: string | null
          commission_amount: number | null
          commission_rate: number | null
          created_at: string | null
          customer_id: string | null
          final_amount: number | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          host_cost: number | null
          host_property_name: string | null
          host_room_code: string | null
          host_room_id: string | null
          host_room_type: string | null
          nationality: string | null
          nights: number | null
          ota_booking_code: string | null
          ota_room_type_sold: string | null
          payment_type: Database["public"]["Enums"]["payment_type"] | null
          pms_property_id: string | null
          pms_property_name: string | null
          source: string | null
          stay_status: Database["public"]["Enums"]["stay_status"] | null
          total_amount_gross: number | null
          total_amount_net: number | null
          unified_booking_id: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      unified_payments: {
        Row: {
          amount: number | null
          currency: string | null
          note: string | null
          payee_type: string | null
          payer_type: string | null
          payment_channel: string | null
          payment_method: string | null
          processed_by: string | null
          receipt: string | null
          received_at: string | null
          related_id: string | null
          related_type: string | null
          source_id: string | null
          source_table: string | null
          unified_booking_id: string | null
          unified_payment_id: string | null
        }
        Relationships: []
      }
      v_cashflow_whitelist_volume_daily: {
        Row: {
          cash_date: string | null
          event_count: number | null
          migration_target: string | null
          source_type: string | null
          total_amount: number | null
        }
        Relationships: []
      }
      v_financial_integrity_summary: {
        Row: {
          check_type: string | null
          detail_sum: number | null
          diff: number | null
          entity_id: string | null
          header_amount: number | null
        }
        Relationships: []
      }
      v_no_show_reclass_gaps: {
        Row: {
          detail_amount: number | null
          ledger_status: string | null
          payout_id: string | null
          unified_booking_id: string | null
        }
        Relationships: []
      }
      v_orphan_cashflow_enforced: {
        Row: {
          amount: number | null
          cash_date: string | null
          cashflow_id: string | null
          created_at: string | null
          created_by: string | null
          direction: string | null
          expected_ledger_type: string | null
          source_id: string | null
          source_type: string | null
        }
        Relationships: []
      }
      v_payout_booking_duplicates: {
        Row: {
          active_flags: boolean[] | null
          payout_count: number | null
          payout_ids: string[] | null
          unified_booking_id: string | null
        }
        Relationships: []
      }
      v_payout_ledger_gaps: {
        Row: {
          age_days: number | null
          amount: number | null
          created_at: string | null
          detail_type: string | null
          existing_ledger_id: string | null
          gap_type: string | null
          is_voided: boolean | null
          ota_source: string | null
          payout_date: string | null
          payout_id: string | null
          payout_status: Database["public"]["Enums"]["payout_status"] | null
          received_at: string | null
          source_id: string | null
        }
        Relationships: []
      }
      v_settlement_net_integrity: {
        Row: {
          apply_events_total: number | null
          delta: number | null
          difference_reason: string | null
          extracted_manual_netting_amount: number | null
          has_deposit_record: boolean | null
          has_manual_netting_keywords: boolean | null
          has_prepaid_record: boolean | null
          header_recomputed_net: number | null
          is_effectively_fully_paid: boolean | null
          latest_payment_note: string | null
          partner_id: string | null
          period_from: string | null
          period_locked: boolean | null
          period_to: string | null
          recomputed_net: number | null
          remaining_amount_snapshot: number | null
          remaining_effective: number | null
          request_code: string | null
          settlement_code: string | null
          settlement_id: string | null
          status: string | null
          total_deposits_applied: number | null
          total_paid_cash: number | null
          total_payable_amount: number | null
          total_prepaids_applied: number | null
        }
        Relationships: [
          {
            foreignKeyName: "host_settlements_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_reference_summary"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "host_settlements_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      v_unposted_payout_items: {
        Row: {
          adj_category: string | null
          amount: number | null
          is_voided: boolean | null
          item_created_at: string | null
          item_type: string | null
          ledger_entry_id: string | null
          ota_source: string | null
          payout_date: string | null
          payout_id: string | null
          payout_status: Database["public"]["Enums"]["payout_status"] | null
          received_at: string | null
          recon_item_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ota_payout_reconciliation_items_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ota_payout_reconciliation_items_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "ota_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ota_payout_reconciliation_items_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "v_financial_integrity_summary"
            referencedColumns: ["entity_id"]
          },
          {
            foreignKeyName: "ota_payout_reconciliation_items_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "v_no_show_reclass_gaps"
            referencedColumns: ["payout_id"]
          },
        ]
      }
    }
    Functions: {
      acquire_inventory_lock: {
        Args: {
          p_cell_key: string
          p_duration_minutes?: number
          p_property_id: string
          p_user_id: string
        }
        Returns: {
          locked_at: string
          locked_by: string
          message: string
          success: boolean
        }[]
      }
      acquire_refresh_lock: { Args: { p_account_id: string }; Returns: boolean }
      add_booking_to_payout_atomic: {
        Args: {
          p_actual_check_out_at?: string
          p_booking_code: string
          p_expected_amount: number
          p_guest_name: string
          p_note?: string
          p_payout_id: string
          p_unified_booking_id: string
        }
        Returns: Json
      }
      approve_payment_request_secure: {
        Args: { p_request_id: string }
        Returns: string
      }
      approve_refund_with_ledger_atomic: {
        Args: { p_approval_id: string; p_note?: string }
        Returns: Json
      }
      archive_cash_account: {
        Args: { p_account_id: string; p_archive: boolean; p_org_id?: string }
        Returns: boolean
      }
      archive_partner: {
        Args: { p_partner_id: string; p_reason?: string }
        Returns: Json
      }
      assign_ota_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: Json
      }
      backfill_classify_and_post_adjustments: {
        Args: { p_dry_run?: boolean; p_limit?: number }
        Returns: Json
      }
      backfill_deductions_to_ledger: {
        Args: { p_dry_run?: boolean; p_limit?: number; p_reason?: string }
        Returns: Json
      }
      backfill_host_settlement_manual_netting: {
        Args: {
          p_dry_run?: boolean
          p_limit?: number
          p_partner_id?: string
          p_settlement_ids?: string[]
          p_skip_locked?: boolean
        }
        Returns: {
          action: string
          correction_amount: number
          correction_type: string
          note: string
          period_locked: boolean
          run_id: string
          settlement_code: string
          settlement_id: string
          source_ref_id: string
        }[]
      }
      backfill_missing_ledger_entries: { Args: never; Returns: number }
      backfill_normalize_ota_adjustments: {
        Args: { p_dry_run?: boolean; p_limit?: number }
        Returns: Json
      }
      backfill_post_ota_payout_bank_fees_to_ledger: {
        Args: { p_dry_run?: boolean; p_limit?: number }
        Returns: Json
      }
      blacklist_partner: {
        Args: { p_partner_id: string; p_reason: string }
        Returns: Json
      }
      can_refund_collection: {
        Args: { p_collection_id: string }
        Returns: {
          can_refund: boolean
          max_refund_amount: number
          reason: string
        }[]
      }
      can_void_collection: {
        Args: { p_collection_id: string }
        Returns: {
          can_void: boolean
          reason: string
        }[]
      }
      cancel_payment_request_secure: {
        Args: { p_reason: string; p_request_id: string }
        Returns: Json
      }
      check_inventory_alerts: {
        Args: { p_property_id: string }
        Returns: undefined
      }
      check_rate_limit: {
        Args: {
          p_bucket_key: string
          p_max_requests?: number
          p_window_seconds?: number
        }
        Returns: boolean
      }
      check_webhook_health: {
        Args: { p_provider?: string; p_window_minutes?: number }
        Returns: Json
      }
      claim_conversation: {
        Args: { p_conversation_id: string; p_team?: string; p_user_id: string }
        Returns: {
          current_assignee: string
          message: string
          success: boolean
        }[]
      }
      classify_ota_payout_adjustment: {
        Args: { p_item_id: string }
        Returns: string
      }
      cleanup_old_audit_logs: { Args: never; Returns: number }
      cleanup_old_booking_changes: { Args: never; Returns: number }
      cleanup_old_push_deliveries: {
        Args: { p_retention_days?: number }
        Returns: number
      }
      cleanup_old_webhook_events: { Args: never; Returns: number }
      cleanup_rate_limit_buckets: { Args: never; Returns: number }
      close_settlement_secure: {
        Args: { p_settlement_id: string }
        Returns: string
      }
      confirm_room_rounding_secure: {
        Args: { p_amount: number; p_booking_id: string; p_reason?: string }
        Returns: Json
      }
      create_cash_account_atomic: {
        Args: {
          p_account_name: string
          p_account_number?: string
          p_account_type: string
          p_bank_name?: string
          p_is_default?: boolean
          p_note?: string
          p_org_id?: string
        }
        Returns: string
      }
      create_cash_out_atomic: {
        Args: {
          p_account_name?: string
          p_account_number?: string
          p_amount: number
          p_bank_name?: string
          p_is_out_of_process?: boolean
          p_note?: string
          p_out_of_process_reason?: string
          p_paid_at: string
          p_payment_method: string
          p_payment_request_id: string
          p_receipt_image?: string
          p_recipient_name?: string
          p_transfer_reference?: string
        }
        Returns: string
      }
      create_cash_transfer_atomic: {
        Args: {
          p_amount: number
          p_from_account_id: string
          p_note?: string
          p_org_id?: string
          p_to_account_id: string
          p_transfer_date: string
        }
        Returns: string
      }
      create_collection_ledger_atomic: {
        Args: {
          p_amount: number
          p_collection_type: string
          p_note?: string
          p_payee_type?: string
          p_payer_type: string
          p_payment_method: string
          p_reason_note?: string
          p_related_collection_id?: string
          p_related_id?: string
          p_related_type: string
          p_unified_booking_id: string
        }
        Returns: string
      }
      create_financial_transaction_secure: {
        Args: {
          p_account_name?: string
          p_account_number?: string
          p_amount: number
          p_bank_name?: string
          p_cash_date: string
          p_counterparty_id?: string
          p_counterparty_type: string
          p_direction: string
          p_metadata?: Json
          p_note?: string
          p_payment_method?: string
          p_source_id?: string
          p_source_type?: string
          p_transaction_type: string
          p_transfer_reference?: string
        }
        Returns: Json
      }
      create_multi_payout_cashin_atomic: {
        Args: {
          p_amounts: number[]
          p_bank_reference?: string
          p_cash_account_id: string
          p_note?: string
          p_org_id?: string
          p_payment_channel?: string
          p_payment_method: string
          p_payout_ids: string[]
          p_received_at: string
          p_total_amount?: number
        }
        Returns: string[]
      }
      create_ota_payout_cashin_atomic: {
        Args: {
          p_amount: number
          p_bank_reference?: string
          p_cash_account_id: string
          p_note?: string
          p_org_id?: string
          p_payment_channel?: string
          p_payment_method: string
          p_payout_id: string
          p_received_at: string
        }
        Returns: string
      }
      create_ota_payout_deduction_atomic: {
        Args: {
          p_amount: number
          p_deduction_type: string
          p_idempotency_key?: string
          p_payout_detail_id?: string
          p_payout_id: string
          p_reason_note: string
          p_unified_booking_id?: string
        }
        Returns: Json
      }
      create_ota_payout_reconciliation_item_atomic:
        | {
            Args: {
              p_amount: number
              p_evidence?: Json
              p_item_type: string
              p_note?: string
              p_payout_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_amount: number
              p_direction?: string
              p_dispute_id?: string
              p_evidence?: Json
              p_idempotency_key?: string
              p_item_type: string
              p_note?: string
              p_payout_id: string
            }
            Returns: Json
          }
      create_payout_adjustment_atomic: {
        Args: {
          p_adj_category?: string
          p_amount: number
          p_direction?: string
          p_economic_date?: string
          p_idempotency_key?: string
          p_item_type: string
          p_note?: string
          p_payout_id: string
        }
        Returns: string
      }
      dashboard_forecast_summary_v1: { Args: never; Returns: Json }
      dashboard_host_debt_summary_v1: { Args: never; Returns: Json }
      deactivate_payout_detail_secure: {
        Args: { p_detail_id: string; p_reason: string }
        Returns: Json
      }
      delete_payout_deduction_secure: {
        Args: { p_deduction_id: string; p_reason: string }
        Returns: Json
      }
      email_apply_ai_suggestion: {
        Args: { p_force?: boolean; p_thread_id: string; p_user_id?: string }
        Returns: {
          created_at: string
          email_account_id: string
          id: string
          is_muted: boolean
          labels: Json | null
          last_message_at: string | null
          manual_override: boolean
          owner_id: string | null
          participants: Json | null
          primary_participant: string | null
          primary_participant_email: string | null
          primary_participant_name: string | null
          priority: string
          provider_thread_id: string
          snippet: string | null
          status_updated_at: string | null
          status_updated_by: string | null
          subject: string | null
          tag: string
          tag_source: string
          tenant_id: string
          unread_count: number
          updated_at: string
          workflow_status: string
        }
        SetofOptions: {
          from: "*"
          to: "email_threads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      email_assign_thread: {
        Args: { p_owner_id: string; p_thread_id: string; p_user_id: string }
        Returns: {
          created_at: string
          email_account_id: string
          id: string
          is_muted: boolean
          labels: Json | null
          last_message_at: string | null
          manual_override: boolean
          owner_id: string | null
          participants: Json | null
          primary_participant: string | null
          primary_participant_email: string | null
          primary_participant_name: string | null
          priority: string
          provider_thread_id: string
          snippet: string | null
          status_updated_at: string | null
          status_updated_by: string | null
          subject: string | null
          tag: string
          tag_source: string
          tenant_id: string
          unread_count: number
          updated_at: string
          workflow_status: string
        }
        SetofOptions: {
          from: "*"
          to: "email_threads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      email_debug_status: { Args: never; Returns: Json }
      email_ignore_ai_suggestion: {
        Args: { p_thread_id: string; p_user_id: string }
        Returns: undefined
      }
      email_update_priority: {
        Args: { p_new_priority: string; p_thread_id: string; p_user_id: string }
        Returns: {
          created_at: string
          email_account_id: string
          id: string
          is_muted: boolean
          labels: Json | null
          last_message_at: string | null
          manual_override: boolean
          owner_id: string | null
          participants: Json | null
          primary_participant: string | null
          primary_participant_email: string | null
          primary_participant_name: string | null
          priority: string
          provider_thread_id: string
          snippet: string | null
          status_updated_at: string | null
          status_updated_by: string | null
          subject: string | null
          tag: string
          tag_source: string
          tenant_id: string
          unread_count: number
          updated_at: string
          workflow_status: string
        }
        SetofOptions: {
          from: "*"
          to: "email_threads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      email_update_tag: {
        Args: { p_new_tag: string; p_thread_id: string; p_user_id: string }
        Returns: {
          created_at: string
          email_account_id: string
          id: string
          is_muted: boolean
          labels: Json | null
          last_message_at: string | null
          manual_override: boolean
          owner_id: string | null
          participants: Json | null
          primary_participant: string | null
          primary_participant_email: string | null
          primary_participant_name: string | null
          priority: string
          provider_thread_id: string
          snippet: string | null
          status_updated_at: string | null
          status_updated_by: string | null
          subject: string | null
          tag: string
          tag_source: string
          tenant_id: string
          unread_count: number
          updated_at: string
          workflow_status: string
        }
        SetofOptions: {
          from: "*"
          to: "email_threads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      email_update_workflow: {
        Args: { p_new_status: string; p_thread_id: string; p_user_id: string }
        Returns: {
          created_at: string
          email_account_id: string
          id: string
          is_muted: boolean
          labels: Json | null
          last_message_at: string | null
          manual_override: boolean
          owner_id: string | null
          participants: Json | null
          primary_participant: string | null
          primary_participant_email: string | null
          primary_participant_name: string | null
          priority: string
          provider_thread_id: string
          snippet: string | null
          status_updated_at: string | null
          status_updated_by: string | null
          subject: string | null
          tag: string
          tag_source: string
          tenant_id: string
          unread_count: number
          updated_at: string
          workflow_status: string
        }
        SetofOptions: {
          from: "*"
          to: "email_threads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      email_upsert_ai_suggestion: {
        Args: {
          p_confidence?: number
          p_last_message_id?: string
          p_model?: string
          p_prompt_version?: string
          p_reasons?: Json
          p_suggested_priority?: string
          p_suggested_tag?: string
          p_suggested_workflow_status?: string
          p_tenant_id: string
          p_thread_id: string
        }
        Returns: {
          applied_at: string | null
          applied_by: string | null
          apply_status: string
          confidence: number
          created_at: string
          id: string
          last_message_id: string | null
          model: string
          prompt_version: string | null
          reasons: Json
          scored_at: string
          suggested_priority: string | null
          suggested_tag: string
          suggested_workflow_status: string | null
          tenant_id: string
          thread_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "email_thread_ai_suggestions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_settlement_secure: {
        Args: { p_settlement_id: string }
        Returns: string
      }
      generate_batch_code: { Args: never; Returns: string }
      generate_settlement_code: { Args: never; Returns: string }
      get_adjustment_history: {
        Args: {
          p_period_key: string
          p_property_id: string
          p_room_type: string
        }
        Returns: {
          adjusted_at: string
          adjustment_percent: number
          adjustment_type: string
          id: string
          notes: string
          pre_margin_percent: number
          pre_velocity_ratio: number
        }[]
      }
      get_bank_short_name: { Args: { p_bank_name: string }; Returns: string }
      get_default_cash_account_for_collection: {
        Args: { p_canonical_payment?: string }
        Returns: {
          account_code: string
          account_name: string
          account_type: string
          bank_name: string
          id: string
        }[]
      }
      get_email_analytics_v1: { Args: never; Returns: Json }
      get_email_tenant_id: { Args: never; Returns: string }
      get_messages_paginated: {
        Args: {
          p_conversation_id: string
          p_cursor_id?: string
          p_cursor_sent_at?: string
          p_limit?: number
        }
        Returns: {
          attachments: Json
          body: string
          conversation_id: string
          created_at: string
          direction: string
          external_message_id: string
          id: string
          sender_display_name: string
          sender_id: string
          sender_type: string
          sent_at: string
          synced_at: string
        }[]
      }
      get_new_booking_count: {
        Args: {
          p_from_date: string
          p_include_ids?: boolean
          p_property_ids?: string[]
          p_to_date: string
        }
        Returns: Json
      }
      get_ota_project_role: { Args: { p_project_id: string }; Returns: string }
      get_pending_webhook_retries: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          error_code: string | null
          event_type: string
          id: string
          last_error: string | null
          max_retries: number | null
          next_retry_at: string
          payload: Json
          provider: string
          retry_count: number | null
          status: string
          updated_at: string
          webhook_event_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "webhook_retry_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_filter_state: { Args: { p_scope_key: string }; Returns: Json }
      get_user_page_permissions: {
        Args: { _user_id: string }
        Returns: {
          can_use: boolean
          page_path: string
        }[]
      }
      get_user_push_subscriptions: {
        Args: { p_user_id: string }
        Returns: {
          auth: string
          endpoint: string
          id: string
          p256dh: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_users_push_subscriptions: {
        Args: { p_user_ids: string[] }
        Returns: {
          auth: string
          endpoint: string
          p256dh: string
          subscription_id: string
          user_id: string
        }[]
      }
      has_any_role: { Args: { roles: string[] }; Returns: boolean }
      has_email_access: { Args: never; Returns: boolean }
      has_ota_project_access: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      has_page_access: {
        Args: { _page_path: string; _user_id: string }
        Returns: boolean
      }
      has_page_use_access:
        | { Args: { _page_path: string }; Returns: boolean }
        | { Args: { _page_path: string; _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_system_privilege: { Args: never; Returns: boolean }
      is_admin_or_super_admin: {
        Args: { check_user_id?: string }
        Returns: boolean
      }
      is_admin_or_superadmin: { Args: never; Returns: boolean }
      is_ota_lead_or_admin: { Args: never; Returns: boolean }
      is_ota_only_role: { Args: never; Returns: boolean }
      is_ota_role: { Args: never; Returns: boolean }
      is_period_locked:
        | { Args: { p_date: string; p_org_id: string }; Returns: boolean }
        | { Args: { p_date: string; p_org_id: string }; Returns: boolean }
      is_period_open: { Args: { check_date: string }; Returns: boolean }
      is_valid_uuid: { Args: { p_text: string }; Returns: boolean }
      lock_accounting_period: {
        Args: {
          p_note?: string
          p_org_id: string
          p_period_end: string
          p_period_start: string
        }
        Returns: string
      }
      log_price_adjustment: {
        Args: {
          p_adjustment_percent?: number
          p_adjustment_type?: string
          p_day_type?: string
          p_notes?: string
          p_period_key: string
          p_pre_host_adr?: number
          p_pre_margin_percent?: number
          p_pre_ota_adr?: number
          p_pre_velocity_ratio?: number
          p_pre_volume_score?: number
          p_property_id: string
          p_property_name: string
          p_room_type: string
        }
        Returns: string
      }
      mark_push_subscription_failure: {
        Args: { p_reason: string; p_subscription_id: string }
        Returns: undefined
      }
      mark_push_subscription_success: {
        Args: { p_subscription_id: string }
        Returns: undefined
      }
      normalize_ota_source: { Args: { raw_source: string }; Returns: string }
      ota_add_project_member: {
        Args: {
          p_project_id: string
          p_project_role?: string
          p_user_id: string
        }
        Returns: Json
      }
      ota_add_task_comment: {
        Args: { p_content: string; p_parent_id?: string; p_task_id: string }
        Returns: Json
      }
      ota_add_task_todo: {
        Args: { p_content: string; p_task_id: string }
        Returns: string
      }
      ota_assign_task: {
        Args: { p_assignee_id: string; p_task_id: string }
        Returns: Json
      }
      ota_bulk_approve_evidence: {
        Args: { p_comment?: string; p_task_ids: string[] }
        Returns: Json
      }
      ota_create_output_draft: { Args: { p_project_id: string }; Returns: Json }
      ota_create_quick_task: {
        Args: {
          p_assignee_id?: string
          p_classification?: string
          p_due_date?: string
          p_expected_effort_minutes?: number
          p_issue_tag?: string
          p_priority?: string
          p_title: string
        }
        Returns: Json
      }
      ota_create_task: {
        Args: {
          p_assignee_id?: string
          p_classification?: string
          p_description?: string
          p_due_date?: string
          p_estimated_hours?: number
          p_priority?: string
          p_project_id: string
          p_tags?: string[]
          p_title: string
        }
        Returns: Json
      }
      ota_delete_task_comment: { Args: { p_comment_id: string }; Returns: Json }
      ota_delete_task_todo: { Args: { p_todo_id: string }; Returns: undefined }
      ota_edit_task_comment: {
        Args: { p_comment_id: string; p_content: string }
        Returns: Json
      }
      ota_get_available_assignees: {
        Args: { p_project_id: string }
        Returns: Json
      }
      ota_get_channel_comparison: {
        Args: {
          p_end_date: string
          p_property_ids?: string[]
          p_start_date: string
        }
        Returns: Json
      }
      ota_get_kpi: {
        Args: {
          p_end_date: string
          p_property_ids?: string[]
          p_start_date: string
        }
        Returns: Json
      }
      ota_get_kpi_summary: {
        Args: {
          p_end_date: string
          p_property_ids?: string[]
          p_start_date: string
        }
        Returns: Json
      }
      ota_get_my_tasks: {
        Args: { p_project_id?: string; p_status?: string }
        Returns: Json
      }
      ota_get_or_create_ops_bucket: {
        Args: { p_bucket_date?: string }
        Returns: Json
      }
      ota_get_pending_reviews: {
        Args: { p_project_id?: string }
        Returns: Json
      }
      ota_get_project_detail: { Args: { p_project_id: string }; Returns: Json }
      ota_get_project_io: { Args: { p_project_id: string }; Returns: Json }
      ota_get_project_members: { Args: { p_project_id: string }; Returns: Json }
      ota_get_staff_list: { Args: never; Returns: Json }
      ota_get_task_comments: { Args: { p_task_id: string }; Returns: Json }
      ota_get_task_detail: { Args: { p_task_id: string }; Returns: Json }
      ota_get_task_evidence: { Args: { p_task_id: string }; Returns: Json }
      ota_get_task_todos: {
        Args: { p_task_id: string }
        Returns: {
          content: string
          created_at: string
          created_by: string
          id: string
          is_done: boolean
          sort_order: number
          task_id: string
          updated_at: string
        }[]
      }
      ota_get_tasks_with_assignees: {
        Args: {
          p_assignee_id?: string
          p_project_id?: string
          p_status?: string
        }
        Returns: Json
      }
      ota_list_team_members: { Args: never; Returns: Json }
      ota_promote_quick_task_to_project: {
        Args: { p_target_project_id: string; p_task_id: string }
        Returns: Json
      }
      ota_remove_project_member: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: Json
      }
      ota_reorder_task_todos: {
        Args: { p_task_id: string; p_todo_ids: string[] }
        Returns: undefined
      }
      ota_review_evidence: {
        Args: {
          p_evidence_id: string
          p_review_notes?: string
          p_review_status: string
        }
        Returns: Json
      }
      ota_review_output: {
        Args: { p_decision: string; p_output_id: string; p_reason: string }
        Returns: Json
      }
      ota_submit_evidence: {
        Args: {
          p_description?: string
          p_evidence_type: string
          p_file_name: string
          p_file_size?: number
          p_file_url: string
          p_task_id: string
        }
        Returns: Json
      }
      ota_submit_output: { Args: { p_output_id: string }; Returns: Json }
      ota_super_admin_override: {
        Args: {
          p_action: string
          p_data?: Json
          p_entity_id: string
          p_entity_type: string
          p_reason: string
        }
        Returns: Json
      }
      ota_super_admin_override_task_status: {
        Args: { p_override_type: string; p_reason: string; p_task_id: string }
        Returns: Json
      }
      ota_toggle_task_todo: { Args: { p_todo_id: string }; Returns: boolean }
      ota_update_output_draft: {
        Args: { p_data: Json; p_output_id: string; p_schema_version?: number }
        Returns: Json
      }
      ota_update_project: {
        Args: {
          p_description?: string
          p_due_date?: string
          p_name?: string
          p_project_id: string
          p_start_date?: string
          p_status?: string
        }
        Returns: Json
      }
      ota_update_project_member_role: {
        Args: { p_new_role: string; p_project_id: string; p_user_id: string }
        Returns: Json
      }
      ota_update_task_classification: {
        Args: {
          p_new_classification: string
          p_reason?: string
          p_task_id: string
        }
        Returns: Json
      }
      ota_update_task_status: {
        Args: {
          p_actual_hours?: number
          p_new_status: string
          p_task_id: string
        }
        Returns: Json
      }
      ota_update_task_todo: {
        Args: { p_content: string; p_todo_id: string }
        Returns: undefined
      }
      ota_upsert_project_inputs: {
        Args: {
          p_data: Json
          p_expected_updated_at?: string
          p_project_id: string
          p_schema_version?: number
        }
        Returns: Json
      }
      post_ledger_entry_idempotent: {
        Args: {
          p_amount: number
          p_cash_account_id: string
          p_counterparty_id?: string
          p_counterparty_type?: string
          p_direction: string
          p_entry_date: string
          p_note?: string
          p_org_id?: string
          p_source_id: string
          p_source_type: string
        }
        Returns: string
      }
      post_ota_payout_adjustment_to_ledger_atomic: {
        Args: { p_recon_item_id: string }
        Returns: Json
      }
      post_ota_payout_bank_fee_to_ledger_atomic: {
        Args: { p_payout_id: string }
        Returns: Json
      }
      post_payout_ledger_entries_atomic: {
        Args: { p_force?: boolean; p_payout_id: string }
        Returns: Json
      }
      queue_webhook_retry: {
        Args: { p_error: string; p_webhook_event_id: string }
        Returns: string
      }
      reactivate_partner: {
        Args: { p_new_status?: string; p_partner_id: string }
        Returns: Json
      }
      recalculate_ota_payout_status: {
        Args: { p_payout_id: string }
        Returns: undefined
      }
      recalculate_ota_payout_status_v2: {
        Args: { p_payout_id: string; p_received_at?: string }
        Returns: undefined
      }
      recompute_host_settlement_remaining_snapshot: {
        Args: {
          p_org_id: string
          p_settlement_id: string
          p_tolerance?: number
        }
        Returns: undefined
      }
      reconcile_ledger_entry: {
        Args: {
          p_bank_reference?: string
          p_bank_statement_date?: string
          p_ledger_entry_id: string
          p_note?: string
        }
        Returns: string
      }
      reject_payment_request_secure: {
        Args: { p_rejection_reason: string; p_request_id: string }
        Returns: string
      }
      release_conversation: {
        Args: {
          p_conversation_id: string
          p_new_assignee?: string
          p_user_id: string
        }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      release_inventory_lock: {
        Args: { p_cell_key: string; p_property_id: string; p_user_id: string }
        Returns: boolean
      }
      release_refresh_lock: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      remove_ota_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: Json
      }
      resolve_account_mapping: {
        Args: {
          p_counterparty_type?: string
          p_direction: string
          p_org_id?: string
          p_payment_method?: string
          p_payment_type?: string
          p_source_type: string
        }
        Returns: string
      }
      resolve_cashflow_ledger_mapping: {
        Args: { p_source_type: string }
        Returns: {
          enforcement: string
          ledger_source_type: string
          migration_target: string
        }[]
      }
      resolve_conversation: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      reverse_ledger_entry: {
        Args: { p_original_entry_id: string; p_reason: string }
        Returns: string
      }
      reverse_ota_payout_cashin: {
        Args: { p_collection_id: string; p_org_id?: string; p_reason: string }
        Returns: string
      }
      rpc_dashboard_forecast_30d_kpis: { Args: never; Returns: Json }
      rpc_dashboard_host_debt_kpis: { Args: never; Returns: Json }
      rpc_get_ota_adjustments_net: {
        Args: { p_end: string; p_mode?: string; p_start: string }
        Returns: Json
      }
      rpc_get_ota_ar_dashboard_v2: {
        Args: {
          p_channex_property_id?: string
          p_property_id?: string
          p_source?: string
        }
        Returns: Json
      }
      run_all_retention_cleanups: {
        Args: never
        Returns: {
          deleted_rows: number
          table_name: string
        }[]
      }
      run_financial_reconciliation: { Args: never; Returns: string }
      run_settlement_payment_backfill_secure: {
        Args: { p_batch_size?: number }
        Returns: Json
      }
      set_default_cash_account: {
        Args: { p_account_id: string; p_org_id?: string }
        Returns: boolean
      }
      try_record_push_deliveries_batch: {
        Args: {
          p_event_type: string
          p_idempotency_key: string
          p_recipient_user_ids: string[]
          p_source_record_id?: string
          p_source_table?: string
        }
        Returns: {
          status: string
          user_id: string
        }[]
      }
      try_record_push_delivery: {
        Args: {
          p_event_type: string
          p_idempotency_key: string
          p_payload_hash?: string
          p_recipient_user_id: string
          p_source_record_id?: string
          p_source_table?: string
          p_subscription_id?: string
        }
        Returns: string
      }
      unlock_accounting_period: {
        Args: {
          p_org_id: string
          p_period_end: string
          p_period_start: string
          p_reason: string
        }
        Returns: string
      }
      unlock_accounting_period_secure: {
        Args: { p_period_id: string; p_reason: string }
        Returns: Json
      }
      unreconcile_ledger_entry: {
        Args: { p_ledger_entry_id: string; p_reason: string }
        Returns: boolean
      }
      update_cash_account_atomic: {
        Args: {
          p_account_id: string
          p_account_name: string
          p_account_number?: string
          p_account_type: string
          p_bank_name?: string
          p_note?: string
          p_org_id?: string
        }
        Returns: boolean
      }
      update_conversation_timestamps_safe: {
        Args: {
          p_conversation_id: string
          p_increment_unread?: boolean
          p_last_inbound_at?: string
          p_last_message_at: string
          p_last_outbound_at?: string
        }
        Returns: undefined
      }
      upsert_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_user_agent?: string
          p_user_id: string
        }
        Returns: string
      }
      upsert_user_filter_state: {
        Args: { p_scope_key: string; p_state: Json; p_version?: number }
        Returns: undefined
      }
      void_collection_atomic: {
        Args: { p_collection_id: string; p_reason: string }
        Returns: string
      }
      void_ota_payout_secure: {
        Args: { p_payout_id: string; p_reason: string }
        Returns: Json
      }
      void_settlement_secure: {
        Args: { p_reason: string; p_settlement_id: string }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "sale"
        | "cskh"
        | "ke_toan"
        | "super_admin"
        | "ota_staff"
        | "ota_lead"
      booking_status:
        | "CONFIRMED"
        | "CHECKED_IN"
        | "CHECKED_OUT"
        | "CANCELLED"
        | "NO_SHOW"
        | "PENDING"
      confidence_level: "LOW" | "MED" | "HIGH"
      deposit_status: "HELD" | "REFUNDED" | "OFFSET" | "FORFEITED"
      dispute_status:
        | "OPEN"
        | "IN_REVIEW"
        | "WON"
        | "LOST"
        | "PARTIAL"
        | "CLOSED"
      document_type: "PASSPORT" | "CCCD"
      guest_role: "PRIMARY" | "SECONDARY"
      guest_source_type: "OTA" | "MANUAL" | "CRM"
      health_status: "OK" | "WARNING" | "CRITICAL"
      mapping_status: "MAPPED" | "NOT_MAPPED" | "CONFLICT" | "INVALID"
      match_method:
        | "SOURCE_KEY"
        | "EMAIL"
        | "REAL_PHONE"
        | "MANUAL"
        | "CREATED_NEW"
      no_show_reason:
        | "GUEST_NO_ARRIVAL"
        | "LATE_ARRIVAL_CONFIRMED"
        | "UNREACHABLE_GUEST"
        | "OTHER"
      ota_evidence_review_status:
        | "PENDING"
        | "APPROVED"
        | "REJECTED"
        | "NEEDS_REVISION"
      ota_evidence_type:
        | "SCREENSHOT"
        | "DOCUMENT"
        | "SPREADSHEET"
        | "IMAGE"
        | "VIDEO"
        | "LINK"
        | "NOTE"
        | "OTHER"
      ota_output_status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED"
      ota_project_role: "STAFF" | "LEAD" | "ADMIN"
      ota_project_status:
        | "PLANNING"
        | "IN_PROGRESS"
        | "ON_HOLD"
        | "COMPLETED"
        | "ARCHIVED"
      ota_task_classification: "EXECUTION" | "PREP" | "AUTO" | "OPS"
      ota_task_priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"
      ota_task_status:
        | "TODO"
        | "IN_PROGRESS"
        | "REVIEW"
        | "DONE"
        | "BLOCKED"
        | "CANCELLED"
      ota_work_type:
        | "ONBOARDING"
        | "CONTENT_UPDATE"
        | "PROMOTION"
        | "ISSUE_RESOLUTION"
        | "OPTIMIZATION"
        | "MAINTENANCE"
        | "OTHER"
        | "INTERNAL_OPS"
      partner_status: "ACTIVE" | "INACTIVE" | "ARCHIVED" | "BLACKLISTED"
      partner_type:
        | "HOST_LANDLORD"
        | "HOST_OPERATOR"
        | "SERVICE_PICKUP"
        | "SERVICE_TOUR"
        | "SERVICE_OTHER"
      payable_status: "PENDING" | "PAID" | "OVERDUE" | "PARTIAL"
      payment_type: "HOTEL_COLLECT" | "OTA_COLLECT"
      payout_status: "PENDING" | "RECEIVED" | "PARTIAL" | "DISPUTED"
      service_status:
        | "NEW"
        | "CONFIRMED"
        | "ASSIGNED"
        | "DONE"
        | "CANCELLED"
        | "NO_SHOW"
      service_type: "TOUR" | "PICKUP" | "ADDON"
      stay_status:
        | "WAIT_ROOM"
        | "CHECKED_IN"
        | "IN_HOUSE"
        | "CHECKED_OUT"
        | "NO_SHOW"
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
  public: {
    Enums: {
      app_role: [
        "admin",
        "sale",
        "cskh",
        "ke_toan",
        "super_admin",
        "ota_staff",
        "ota_lead",
      ],
      booking_status: [
        "CONFIRMED",
        "CHECKED_IN",
        "CHECKED_OUT",
        "CANCELLED",
        "NO_SHOW",
        "PENDING",
      ],
      confidence_level: ["LOW", "MED", "HIGH"],
      deposit_status: ["HELD", "REFUNDED", "OFFSET", "FORFEITED"],
      dispute_status: ["OPEN", "IN_REVIEW", "WON", "LOST", "PARTIAL", "CLOSED"],
      document_type: ["PASSPORT", "CCCD"],
      guest_role: ["PRIMARY", "SECONDARY"],
      guest_source_type: ["OTA", "MANUAL", "CRM"],
      health_status: ["OK", "WARNING", "CRITICAL"],
      mapping_status: ["MAPPED", "NOT_MAPPED", "CONFLICT", "INVALID"],
      match_method: [
        "SOURCE_KEY",
        "EMAIL",
        "REAL_PHONE",
        "MANUAL",
        "CREATED_NEW",
      ],
      no_show_reason: [
        "GUEST_NO_ARRIVAL",
        "LATE_ARRIVAL_CONFIRMED",
        "UNREACHABLE_GUEST",
        "OTHER",
      ],
      ota_evidence_review_status: [
        "PENDING",
        "APPROVED",
        "REJECTED",
        "NEEDS_REVISION",
      ],
      ota_evidence_type: [
        "SCREENSHOT",
        "DOCUMENT",
        "SPREADSHEET",
        "IMAGE",
        "VIDEO",
        "LINK",
        "NOTE",
        "OTHER",
      ],
      ota_output_status: ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"],
      ota_project_role: ["STAFF", "LEAD", "ADMIN"],
      ota_project_status: [
        "PLANNING",
        "IN_PROGRESS",
        "ON_HOLD",
        "COMPLETED",
        "ARCHIVED",
      ],
      ota_task_classification: ["EXECUTION", "PREP", "AUTO", "OPS"],
      ota_task_priority: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      ota_task_status: [
        "TODO",
        "IN_PROGRESS",
        "REVIEW",
        "DONE",
        "BLOCKED",
        "CANCELLED",
      ],
      ota_work_type: [
        "ONBOARDING",
        "CONTENT_UPDATE",
        "PROMOTION",
        "ISSUE_RESOLUTION",
        "OPTIMIZATION",
        "MAINTENANCE",
        "OTHER",
        "INTERNAL_OPS",
      ],
      partner_status: ["ACTIVE", "INACTIVE", "ARCHIVED", "BLACKLISTED"],
      partner_type: [
        "HOST_LANDLORD",
        "HOST_OPERATOR",
        "SERVICE_PICKUP",
        "SERVICE_TOUR",
        "SERVICE_OTHER",
      ],
      payable_status: ["PENDING", "PAID", "OVERDUE", "PARTIAL"],
      payment_type: ["HOTEL_COLLECT", "OTA_COLLECT"],
      payout_status: ["PENDING", "RECEIVED", "PARTIAL", "DISPUTED"],
      service_status: [
        "NEW",
        "CONFIRMED",
        "ASSIGNED",
        "DONE",
        "CANCELLED",
        "NO_SHOW",
      ],
      service_type: ["TOUR", "PICKUP", "ADDON"],
      stay_status: [
        "WAIT_ROOM",
        "CHECKED_IN",
        "IN_HOUSE",
        "CHECKED_OUT",
        "NO_SHOW",
      ],
    },
  },
} as const
