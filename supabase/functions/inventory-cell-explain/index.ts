import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExplainRequest {
  property_id: string;
  room_type_id: string;
  rate_plan_id: string;
  channel_id: string;
  date: string;
  restriction: string;
}

interface ResolutionStep {
  layer: string;
  value: any;
  skipped_reason?: string;
  rule_id?: string;
  priority?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const params: ExplainRequest = {
      property_id: url.searchParams.get('property_id') || '',
      room_type_id: url.searchParams.get('room_type_id') || '',
      rate_plan_id: url.searchParams.get('rate_plan_id') || '',
      channel_id: url.searchParams.get('channel_id') || '',
      date: url.searchParams.get('date') || '',
      restriction: url.searchParams.get('restriction') || '',
    };

    // Validate required params
    const missing = Object.entries(params).filter(([_, v]) => !v).map(([k]) => k);
    if (missing.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: `Missing required parameters: ${missing.join(', ')}`,
          code: 'INVALID_PARAMS'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[inventory-cell-explain] Explaining cell: ${params.room_type_id}/${params.rate_plan_id}/${params.channel_id}/${params.date}/${params.restriction}`);

    // Fetch the cell
    const { data: cell, error: cellError } = await supabase
      .from('inventory_cells')
      .select('*')
      .eq('property_id', params.property_id)
      .eq('room_type_id', params.room_type_id)
      .eq('rate_plan_id', params.rate_plan_id)
      .eq('channel_id', params.channel_id)
      .eq('cell_date', params.date)
      .single();

    if (cellError || !cell) {
      return new Response(
        JSON.stringify({ 
          error: 'Cell not found',
          code: 'NOT_FOUND'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get synced value based on restriction
    let syncValue: any = null;
    switch (params.restriction) {
      case 'RATE': syncValue = cell.rate; break;
      case 'AVL': syncValue = cell.availability; break;
      case 'SS': syncValue = cell.stop_sell; break;
      case 'CTA': syncValue = cell.closed_to_arrival; break;
      case 'CTD': syncValue = cell.closed_to_departure; break;
      case 'MSA': syncValue = cell.min_stay_arrival; break;
      case 'MST': syncValue = cell.min_stay_through; break;
      case 'MXS': syncValue = cell.max_stay; break;
      case 'MAL': syncValue = cell.max_availability; break;
    }

    // Fetch applicable rules
    const { data: rules } = await supabase
      .from('availability_rules')
      .select('*')
      .eq('property_id', params.property_id)
      .eq('is_active', true)
      .eq('rule_type', params.restriction)
      .or(`start_date.is.null,start_date.lte.${params.date}`)
      .or(`end_date.is.null,end_date.gte.${params.date}`)
      .order('priority', { ascending: false });

    // Build resolution chain
    const resolutionChain: ResolutionStep[] = [];
    let finalValue: any = null;
    let sourceLayer = 'BASE';
    let appliedAt = new Date().toISOString();
    let appliedBy: string | null = null;
    let ruleId: string | null = null;
    let rulePriority: number | null = null;
    let precedenceReason = '';

    // Step 1: Check BASE
    resolutionChain.push({
      layer: 'BASE',
      value: 0,
      skipped_reason: 'Default fallback value'
    });

    // Step 2: Check SYNC
    if (syncValue !== null && syncValue !== undefined) {
      resolutionChain.push({
        layer: 'SYNC',
        value: syncValue,
        skipped_reason: undefined
      });
      finalValue = syncValue;
      sourceLayer = 'SYNC';
      precedenceReason = 'Value from OTA sync';
    } else {
      resolutionChain.push({
        layer: 'SYNC',
        value: null,
        skipped_reason: 'No synced value available'
      });
    }

    // Step 3: Check RULES (highest priority first)
    const cellDate = new Date(params.date);
    const dayOfWeek = cellDate.getDay();

    if (rules?.length) {
      for (const rule of rules) {
        const appliesToRoom = !rule.room_type_ids?.length || rule.room_type_ids.includes(params.room_type_id);
        const appliesToRatePlan = !rule.rate_plan_ids?.length || rule.rate_plan_ids.includes(params.rate_plan_id);
        const appliesToChannel = !rule.channels?.length || rule.channels.includes(params.channel_id);
        const dayMatches = !rule.days_of_week?.length || rule.days_of_week.includes(dayOfWeek);

        if (appliesToRoom && appliesToRatePlan && appliesToChannel && dayMatches) {
          if (rule.rule_value !== null) {
            resolutionChain.push({
              layer: 'RULE',
              value: rule.rule_value,
              rule_id: rule.id,
              priority: rule.priority
            });
            finalValue = rule.rule_value;
            sourceLayer = 'RULE';
            ruleId = rule.id;
            rulePriority = rule.priority;
            appliedAt = rule.updated_at;
            appliedBy = rule.created_by;
            precedenceReason = `Rule "${rule.title}" (priority ${rule.priority}) overrides synced value`;
            break;
          }
        } else {
          resolutionChain.push({
            layer: 'RULE',
            value: rule.rule_value,
            rule_id: rule.id,
            priority: rule.priority,
            skipped_reason: !appliesToRoom ? 'Room type not matched' :
                           !appliesToRatePlan ? 'Rate plan not matched' :
                           !appliesToChannel ? 'Channel not matched' :
                           'Day of week not matched'
          });
        }
      }
    }

    // Step 4: Check OVERRIDE (if implemented)
    // For now, we don't have a separate overrides table, but the structure is ready

    // If no value found, use BASE
    if (finalValue === null) {
      finalValue = 0;
      sourceLayer = 'BASE';
      precedenceReason = 'Using default base value';
    }

    const response = {
      cell_key: `${params.room_type_id}:${params.rate_plan_id}:${params.channel_id}:${params.date}:${params.restriction}`,
      final_value: finalValue,
      source_layer: sourceLayer,
      rule_id: ruleId,
      rule_priority: rulePriority,
      override_id: null,
      applied_at: appliedAt,
      applied_by: appliedBy,
      precedence_reason: precedenceReason,
      resolution_chain: resolutionChain
    };

    console.log(`[inventory-cell-explain] Result: ${sourceLayer} = ${finalValue}`);

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[inventory-cell-explain] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'INTERNAL_ERROR'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
