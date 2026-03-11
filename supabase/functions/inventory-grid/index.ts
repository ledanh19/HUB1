import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GridRequest {
  property_id: string;
  start_date: string;
  end_date: string;
  room_type_ids?: string[];
  rate_plan_ids?: string[];
  channel_ids?: string[];
  restrictions?: string[];
  resolve_mode?: 'DISPLAY' | 'AUDIT';
  timezone?: string;
  cursor?: string;
  limit?: number;
}

interface GridCell {
  room_type_id: string;
  rate_plan_id: string;
  channel_id: string;
  date: string;
  restriction: string;
  final_value: number | boolean;
  state: 'PENDING' | 'SYNCED' | 'FAILED' | 'STALE';
  source_layer: 'BASE' | 'SYNC' | 'RULE' | 'OVERRIDE';
  applied_at: string;
  applied_by: string | null;
}

// Generate scope hash for conflict detection
function generateScopeHash(cells: GridCell[]): string {
  const content = JSON.stringify(cells.map(c => ({
    key: `${c.room_type_id}:${c.rate_plan_id}:${c.channel_id}:${c.date}:${c.restriction}`,
    value: c.final_value,
    applied_at: c.applied_at
  })));
  
  // Simple hash for scope detection
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `scope_${Math.abs(hash).toString(16)}`;
}

// Priority resolution: OVERRIDE > RULE > SYNC > BASE
function resolveCell(
  baseValue: any,
  syncValue: any,
  ruleValue: any,
  overrideValue: any,
  ruleDetails: any,
  overrideDetails: any
): { value: any; source_layer: string; applied_at: string; applied_by: string | null } {
  
  if (overrideValue !== null && overrideValue !== undefined) {
    return {
      value: overrideValue,
      source_layer: 'OVERRIDE',
      applied_at: overrideDetails?.applied_at || new Date().toISOString(),
      applied_by: overrideDetails?.applied_by || null
    };
  }
  
  if (ruleValue !== null && ruleValue !== undefined) {
    return {
      value: ruleValue,
      source_layer: 'RULE',
      applied_at: ruleDetails?.applied_at || new Date().toISOString(),
      applied_by: ruleDetails?.created_by || null
    };
  }
  
  if (syncValue !== null && syncValue !== undefined) {
    return {
      value: syncValue,
      source_layer: 'SYNC',
      applied_at: new Date().toISOString(),
      applied_by: null
    };
  }
  
  return {
    value: baseValue ?? 0,
    source_layer: 'BASE',
    applied_at: new Date().toISOString(),
    applied_by: null
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const params: GridRequest = {
      property_id: url.searchParams.get('property_id') || '',
      start_date: url.searchParams.get('start_date') || '',
      end_date: url.searchParams.get('end_date') || '',
      room_type_ids: url.searchParams.get('room_type_ids')?.split(',').filter(Boolean),
      rate_plan_ids: url.searchParams.get('rate_plan_ids')?.split(',').filter(Boolean),
      channel_ids: url.searchParams.get('channel_ids')?.split(',').filter(Boolean),
      restrictions: url.searchParams.get('restrictions')?.split(',').filter(Boolean),
      resolve_mode: (url.searchParams.get('resolve_mode') as 'DISPLAY' | 'AUDIT') || 'DISPLAY',
      timezone: url.searchParams.get('timezone') || 'Asia/Ho_Chi_Minh',
      cursor: url.searchParams.get('cursor') || undefined,
      limit: parseInt(url.searchParams.get('limit') || '1000')
    };

    // Validate required params
    if (!params.property_id || !params.start_date || !params.end_date) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required parameters: property_id, start_date, end_date',
          code: 'INVALID_PARAMS'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[inventory-grid] Fetching grid for property ${params.property_id}, ${params.start_date} to ${params.end_date}`);

    // Fetch inventory cells
    let cellsQuery = supabase
      .from('inventory_cells')
      .select('*')
      .eq('property_id', params.property_id)
      .gte('cell_date', params.start_date)
      .lte('cell_date', params.end_date)
      .order('cell_date')
      .order('room_type_id')
      .order('rate_plan_id')
      .order('channel_id')
      .limit(params.limit || 1000);

    if (params.room_type_ids?.length) {
      cellsQuery = cellsQuery.in('room_type_id', params.room_type_ids);
    }
    if (params.channel_ids?.length) {
      cellsQuery = cellsQuery.in('channel_id', params.channel_ids);
    }

    const { data: cells, error: cellsError } = await cellsQuery;
    if (cellsError) {
      console.error('[inventory-grid] Error fetching cells:', cellsError);
      throw cellsError;
    }

    // Fetch applicable rules
    const { data: rules, error: rulesError } = await supabase
      .from('availability_rules')
      .select('*')
      .eq('property_id', params.property_id)
      .eq('is_active', true)
      .or(`start_date.is.null,start_date.lte.${params.end_date}`)
      .or(`end_date.is.null,end_date.gte.${params.start_date}`)
      .order('priority', { ascending: false });

    if (rulesError) {
      console.error('[inventory-grid] Error fetching rules:', rulesError);
    }

    // Get last sync time
    const { data: syncMetrics } = await supabase
      .from('inventory_sync_metrics')
      .select('last_sync_at')
      .eq('property_id', params.property_id)
      .order('last_sync_at', { ascending: false })
      .limit(1)
      .single();

    // Get current data version
    const { data: version } = await supabase
      .from('inventory_system_version')
      .select('version')
      .eq('is_active', true)
      .single();

    // Default restrictions if not specified
    const restrictionTypes = params.restrictions?.length 
      ? params.restrictions 
      : ['RATE', 'AVL', 'SS', 'CTA', 'CTD', 'MSA', 'MST', 'MXS', 'MAL'];

    // Build resolved grid
    const gridCells: GridCell[] = [];
    
    for (const cell of cells || []) {
      for (const restriction of restrictionTypes) {
        // Get value based on restriction type
        let baseValue: any = null;
        let syncValue: any = null;
        
        switch (restriction) {
          case 'RATE':
            syncValue = cell.rate;
            break;
          case 'AVL':
            syncValue = cell.availability;
            break;
          case 'SS':
            syncValue = cell.stop_sell;
            break;
          case 'CTA':
            syncValue = cell.closed_to_arrival;
            break;
          case 'CTD':
            syncValue = cell.closed_to_departure;
            break;
          case 'MSA':
            syncValue = cell.min_stay_arrival;
            break;
          case 'MST':
            syncValue = cell.min_stay_through;
            break;
          case 'MXS':
            syncValue = cell.max_stay;
            break;
          case 'MAL':
            syncValue = cell.max_availability;
            break;
        }

        // Check for applicable rules
        let ruleValue: any = null;
        let ruleDetails: any = null;
        
        if (rules?.length) {
          for (const rule of rules) {
            // Check if rule applies to this cell
            const appliesToRoom = !rule.room_type_ids?.length || rule.room_type_ids.includes(cell.room_type_id);
            const appliesToRatePlan = !rule.rate_plan_ids?.length || rule.rate_plan_ids.includes(cell.rate_plan_id);
            const appliesToChannel = !rule.channels?.length || rule.channels.includes(cell.channel_id);
            
            // Check date range
            const cellDate = new Date(cell.cell_date);
            const ruleStart = rule.start_date ? new Date(rule.start_date) : null;
            const ruleEnd = rule.end_date ? new Date(rule.end_date) : null;
            const dateInRange = (!ruleStart || cellDate >= ruleStart) && (!ruleEnd || cellDate <= ruleEnd);
            
            // Check day of week
            const dayOfWeek = cellDate.getDay();
            const dayMatches = !rule.days_of_week?.length || rule.days_of_week.includes(dayOfWeek);
            
            if (appliesToRoom && appliesToRatePlan && appliesToChannel && dateInRange && dayMatches) {
              // Check rule type matches restriction
              if (rule.rule_type === restriction && rule.rule_value !== null) {
                ruleValue = rule.rule_value;
                ruleDetails = {
                  rule_id: rule.id,
                  priority: rule.priority,
                  applied_at: rule.updated_at,
                  created_by: rule.created_by
                };
                break; // First matching rule wins (highest priority)
              }
            }
          }
        }

        // Resolve final value
        const resolved = resolveCell(baseValue, syncValue, ruleValue, null, ruleDetails, null);

        gridCells.push({
          room_type_id: cell.room_type_id,
          rate_plan_id: cell.rate_plan_id,
          channel_id: cell.channel_id,
          date: cell.cell_date,
          restriction,
          final_value: resolved.value,
          state: cell.sync_status || 'SYNCED',
          source_layer: resolved.source_layer as any,
          applied_at: resolved.applied_at,
          applied_by: resolved.applied_by
        });
      }
    }

    // Generate scope hash
    const scopeHash = generateScopeHash(gridCells);

    // Build response
    const response = {
      meta: {
        timezone: params.timezone,
        last_synced_at: syncMetrics?.last_sync_at || null,
        data_version: version?.version ? `inv_v${version.version}` : 'inv_v1.0',
        scope_hash: scopeHash
      },
      grid: gridCells,
      pagination: {
        partial: gridCells.length >= (params.limit || 1000),
        next_cursor: gridCells.length >= (params.limit || 1000) 
          ? gridCells[gridCells.length - 1]?.date 
          : null,
        total_count: gridCells.length
      }
    };

    console.log(`[inventory-grid] Returning ${gridCells.length} cells, scope_hash: ${scopeHash}`);

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: unknown) {
    console.error('[inventory-grid] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'INTERNAL_ERROR'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
