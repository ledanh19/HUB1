import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CellChange {
  room_type_id: string;
  rate_plan_id: string;
  channel_id: string;
  date: string;
  restriction: string;
  value: number | boolean;
}

interface DryRunRequest {
  property_id: string;
  changes: CellChange[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: DryRunRequest = await req.json();

    if (!body.property_id || !body.changes?.length) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required: property_id and changes array',
          code: 'INVALID_PARAMS'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[inventory-dry-run] Simulating ${body.changes.length} changes for property ${body.property_id}`);

    // Collect unique dates for blast radius
    const uniqueRoomTypes = new Set<string>();
    const uniqueRatePlans = new Set<string>();
    const uniqueChannels = new Set<string>();
    const uniqueDates = new Set<string>();
    const uniqueRestrictions = new Set<string>();

    for (const change of body.changes) {
      uniqueRoomTypes.add(change.room_type_id);
      uniqueRatePlans.add(change.rate_plan_id);
      uniqueChannels.add(change.channel_id);
      uniqueDates.add(change.date);
      uniqueRestrictions.add(change.restriction);
    }

    // Fetch current values for affected cells
    const preview: Array<{
      cell: CellChange;
      before_value: any;
      after_value: any;
    }> = [];

    const warnings: Array<{
      type: string;
      message: string;
      affected_count: number;
    }> = [];

    // Check for past dates
    const today = new Date().toISOString().split('T')[0];
    const pastDates = body.changes.filter(c => c.date < today);
    if (pastDates.length > 0) {
      warnings.push({
        type: 'PAST_DATE',
        message: 'Some changes affect past dates which may be rejected',
        affected_count: pastDates.length
      });
    }

    // Fetch existing cells to get before values
    for (const change of body.changes) {
      const { data: existingCell } = await supabase
        .from('inventory_cells')
        .select('*')
        .eq('property_id', body.property_id)
        .eq('room_type_id', change.room_type_id)
        .eq('rate_plan_id', change.rate_plan_id)
        .eq('channel_id', change.channel_id)
        .eq('cell_date', change.date)
        .single();

      let beforeValue: any = null;
      if (existingCell) {
        switch (change.restriction) {
          case 'RATE': beforeValue = existingCell.rate; break;
          case 'AVL': beforeValue = existingCell.availability; break;
          case 'SS': beforeValue = existingCell.stop_sell; break;
          case 'CTA': beforeValue = existingCell.closed_to_arrival; break;
          case 'CTD': beforeValue = existingCell.closed_to_departure; break;
          case 'MSA': beforeValue = existingCell.min_stay_arrival; break;
          case 'MST': beforeValue = existingCell.min_stay_through; break;
          case 'MXS': beforeValue = existingCell.max_stay; break;
          case 'MAL': beforeValue = existingCell.max_availability; break;
        }
      }

      // Check for large rate changes (> 50%)
      if (change.restriction === 'RATE' && beforeValue !== null && typeof change.value === 'number') {
        const percentChange = Math.abs((change.value - beforeValue) / beforeValue * 100);
        if (percentChange > 50) {
          const existingWarning = warnings.find(w => w.type === 'LARGE_RATE_CHANGE');
          if (existingWarning) {
            existingWarning.affected_count++;
          } else {
            warnings.push({
              type: 'LARGE_RATE_CHANGE',
              message: 'Some rate changes exceed 50% difference from current value',
              affected_count: 1
            });
          }
        }
      }

      preview.push({
        cell: change,
        before_value: beforeValue,
        after_value: change.value
      });
    }

    // Blast radius check
    const totalCells = body.changes.length;
    if (totalCells > 100) {
      warnings.push({
        type: 'LARGE_BLAST_RADIUS',
        message: `This update affects ${totalCells} cells. Please review carefully.`,
        affected_count: totalCells
      });
    }

    const blastRadius = {
      room_types: uniqueRoomTypes.size,
      rate_plans: uniqueRatePlans.size,
      channels: uniqueChannels.size,
      dates: uniqueDates.size,
      restrictions: uniqueRestrictions.size,
      total_cells: totalCells
    };

    console.log(`[inventory-dry-run] Blast radius: ${JSON.stringify(blastRadius)}`);

    const response = {
      affected_cells: totalCells,
      preview,
      warnings,
      blast_radius: blastRadius,
      validation: {
        is_valid: pastDates.length === 0,
        errors: pastDates.length > 0 ? [`${pastDates.length} changes affect past dates`] : []
      }
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[inventory-dry-run] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'INTERNAL_ERROR'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
