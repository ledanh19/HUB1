import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const propertyId = url.searchParams.get('property_id');
    const version = url.searchParams.get('version');
    const asOf = url.searchParams.get('as_of');
    const limit = parseInt(url.searchParams.get('limit') || '100');

    if (!propertyId) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required parameter: property_id',
          code: 'INVALID_PARAMS'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[inventory-snapshot] Fetching snapshot for property ${propertyId}, version: ${version || 'latest'}, as_of: ${asOf || 'now'}`);

    // Build query based on parameters - use property_mapping_id instead
    let query = supabase
      .from('inventory_snapshots')
      .select('*')
      .order('snapshot_time', { ascending: false });

    if (asOf) {
      // Point-in-time query
      query = query.lte('snapshot_time', asOf);
    }

    query = query.limit(1);

    const { data: snapshot, error: snapshotError } = await query.single();

    if (snapshotError || !snapshot) {
      // If no specific snapshot found, return current state
      console.log(`[inventory-snapshot] No snapshot found, returning current state`);
      
      const { data: currentCells } = await supabase
        .from('inventory_cells')
        .select('*')
        .eq('property_id', propertyId)
        .order('cell_date')
        .limit(limit);

      const response = {
        version: 'current',
        created_at: new Date().toISOString(),
        created_by: null,
        property_id: propertyId,
        cell_count: currentCells?.length || 0,
        data: currentCells?.map(cell => ({
          room_type_id: cell.room_type_id,
          rate_plan_id: cell.rate_plan_id,
          channel_id: cell.channel_id,
          date: cell.cell_date,
          values: {
            rate: cell.rate,
            availability: cell.availability,
            stop_sell: cell.stop_sell,
            closed_to_arrival: cell.closed_to_arrival,
            closed_to_departure: cell.closed_to_departure,
            min_stay_arrival: cell.min_stay_arrival,
            min_stay_through: cell.min_stay_through,
            max_stay: cell.max_stay,
            max_availability: cell.max_availability
          },
          sync_status: cell.sync_status
        })) || [],
        is_immutable: false,
        is_current: true
      };

      return new Response(
        JSON.stringify(response),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse snapshot data
    const snapshotData = snapshot.snapshot_data || {};

    const response = {
      version: snapshot.id,
      created_at: snapshot.created_at,
      snapshot_time: snapshot.snapshot_time,
      snapshot_type: snapshot.snapshot_type,
      sync_job_id: snapshot.sync_job_id,
      property_mapping_id: snapshot.property_mapping_id,
      data: snapshotData,
      is_immutable: true,
      is_current: false
    };

    console.log(`[inventory-snapshot] Returning snapshot ${snapshot.id}`);

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[inventory-snapshot] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'INTERNAL_ERROR'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
