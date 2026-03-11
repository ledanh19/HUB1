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
    const pathParts = url.pathname.split('/');
    const batchId = pathParts[pathParts.length - 1] || url.searchParams.get('batch_id');

    if (!batchId) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing batch_id parameter',
          code: 'INVALID_PARAMS'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[inventory-batch-status] Checking status for batch ${batchId}`);

    // Find batch record by batch_id
    const { data: batchRecord, error: batchError } = await supabase
      .from('inventory_batches')
      .select('*')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (batchError || !batchRecord) {
      // Try to find sync job by id
      const { data: syncJob } = await supabase
        .from('inventory_sync_jobs')
        .select('*')
        .eq('id', batchId)
        .single();

      if (!syncJob) {
        return new Response(
          JSON.stringify({ 
            error: 'Batch not found',
            code: 'NOT_FOUND'
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Return sync job status
      const response = {
        batch_id: batchId,
        status: syncJob.status,
        total_cells: syncJob.cell_ids?.length || 0,
        synced_cells: syncJob.status === 'COMPLETED' ? (syncJob.cell_ids?.length || 0) : 0,
        failed_cells: syncJob.status === 'FAILED' ? (syncJob.cell_ids?.length || 0) : 0,
        failures: syncJob.error ? [{ error: syncJob.error }] : [],
        estimated_remaining_seconds: syncJob.status === 'PENDING' ? 5 : 0,
        completed_at: syncJob.completed_at || null,
        created_at: syncJob.created_at,
        property_id: syncJob.property_id
      };

      return new Response(
        JSON.stringify(response),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse batch metadata for failure details
    const metadata = batchRecord.metadata || {};
    const failures = metadata.failures || [];

    const response = {
      batch_id: batchId,
      status: batchRecord.status,
      total_cells: batchRecord.total_cells || 0,
      synced_cells: batchRecord.success_count || 0,
      failed_cells: batchRecord.failed_count || 0,
      failures: failures.map((f: any) => ({
        cell_key: f.cell_key,
        error: f.error
      })),
      estimated_remaining_seconds: 0,
      completed_at: batchRecord.created_at,
      created_at: batchRecord.created_at,
      property_id: batchRecord.property_id
    };

    console.log(`[inventory-batch-status] Batch ${batchId}: ${response.status}`);

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[inventory-batch-status] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'INTERNAL_ERROR'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
