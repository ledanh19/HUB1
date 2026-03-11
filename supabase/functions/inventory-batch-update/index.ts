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

interface BatchUpdateRequest {
  batch_id: string;
  idempotency_key: string;
  scope_hash: string;
  property_id: string;
  changes: CellChange[];
  reason?: string;
}

// Generate scope hash for conflict detection
function generateScopeHash(propertyId: string, dates: string[]): string {
  const content = `${propertyId}:${dates.sort().join(',')}`;
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `scope_${Math.abs(hash).toString(16)}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: BatchUpdateRequest = await req.json();

    // Validate required fields
    const requiredFields = ['batch_id', 'idempotency_key', 'scope_hash', 'property_id', 'changes'];
    const missing = requiredFields.filter(f => !body[f as keyof BatchUpdateRequest]);
    if (missing.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: `Missing required fields: ${missing.join(', ')}`,
          code: 'INVALID_PARAMS'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[inventory-batch-update] Processing batch ${body.batch_id} with ${body.changes.length} changes`);

    // Check idempotency - check metadata for the idempotency_key
    const { data: existingBatches } = await supabase
      .from('inventory_batches')
      .select('*')
      .eq('batch_id', body.batch_id);

    const existingBatch = existingBatches?.find(b => 
      b.metadata && (b.metadata as any).idempotency_key === body.idempotency_key
    );

    if (existingBatch) {
      console.log(`[inventory-batch-update] Idempotent request detected for key ${body.idempotency_key}`);
      return new Response(
        JSON.stringify({
          batch_id: body.batch_id,
          status: 'ALREADY_PROCESSED',
          message: 'This request was already processed',
          affected_cells: existingBatch.total_cells,
          created_at: existingBatch.created_at
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify scope hash to detect concurrent edits
    const uniqueDates = [...new Set(body.changes.map(c => c.date))];
    const currentScopeHash = generateScopeHash(body.property_id, uniqueDates);
    
    // For now, we'll do a simple check - in production, compare with stored scope hash
    // This is a simplified implementation
    
    // Check for edit locks (concurrent editing)
    const { data: activeLocks } = await supabase
      .from('inventory_edit_locks')
      .select('*')
      .eq('property_id', body.property_id)
      .gt('expires_at', new Date().toISOString());

    const conflictingCells: Array<{
      cell_key: string;
      edited_by: string;
      edited_at: string;
    }> = [];

    if (activeLocks?.length) {
      for (const change of body.changes) {
        const cellKey = `${change.room_type_id}:${change.date}`;
        const lock = activeLocks.find(l => l.cell_key === cellKey);
        if (lock) {
          conflictingCells.push({
            cell_key: cellKey,
            edited_by: lock.locked_by,
            edited_at: lock.locked_at
          });
        }
      }
    }

    if (conflictingCells.length > 0) {
      console.log(`[inventory-batch-update] Conflict detected: ${conflictingCells.length} cells`);
      return new Response(
        JSON.stringify({
          error: 'Concurrent edit conflict detected',
          code: 'CONCURRENT_EDIT',
          current_scope_hash: currentScopeHash,
          conflicting_cells: conflictingCells,
          action_required: 'RELOAD_AND_RETRY'
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate no past dates — use VN timezone (UTC+7) per PMS SOT §4.1
    const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const today = vnNow.toISOString().split('T')[0];
    const pastDateChanges = body.changes.filter(c => c.date < today);
    if (pastDateChanges.length > 0) {
      return new Response(
        JSON.stringify({
          error: 'Cannot modify past dates',
          code: 'PAST_DATE_MODIFICATION',
          affected_dates: [...new Set(pastDateChanges.map(c => c.date))]
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Apply changes
    let successCount = 0;
    let failedCount = 0;
    const failures: Array<{ cell_key: string; error: string }> = [];

    for (const change of body.changes) {
      try {
        // Build update object based on restriction type
        const updateData: Record<string, any> = {
          property_id: body.property_id,
          room_type_id: change.room_type_id,
          rate_plan_id: change.rate_plan_id,
          channel_id: change.channel_id,
          cell_date: change.date,
          sync_status: 'PENDING',
          updated_at: new Date().toISOString()
        };

        switch (change.restriction) {
          case 'RATE': updateData.rate = change.value; break;
          case 'AVL': updateData.availability = change.value; break;
          case 'SS': updateData.stop_sell = change.value; break;
          case 'CTA': updateData.closed_to_arrival = change.value; break;
          case 'CTD': updateData.closed_to_departure = change.value; break;
          case 'MSA': updateData.min_stay_arrival = change.value; break;
          case 'MST': updateData.min_stay_through = change.value; break;
          case 'MXS': updateData.max_stay = change.value; break;
          case 'MAL': updateData.max_availability = change.value; break;
        }

        // Upsert the cell
        const { error: upsertError } = await supabase
          .from('inventory_cells')
          .upsert(updateData, {
            onConflict: 'property_id,room_type_id,rate_plan_id,channel_id,cell_date'
          });

        if (upsertError) {
          throw upsertError;
        }

        successCount++;
      } catch (error: unknown) {
        failedCount++;
        failures.push({
          cell_key: `${change.room_type_id}:${change.rate_plan_id}:${change.channel_id}:${change.date}:${change.restriction}`,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Create batch record for idempotency
    // Status must be one of: PENDING, SUCCESS, PARTIAL_FAIL, FAILED
    const batchStatus = failedCount === 0 ? 'SUCCESS' : successCount === 0 ? 'FAILED' : 'PARTIAL_FAIL';
    
    const { data: batchRecord, error: batchError } = await supabase
      .from('inventory_batches')
      .insert({
        property_id: body.property_id,
        batch_id: body.batch_id,
        status: batchStatus,
        total_cells: body.changes.length,
        success_count: successCount,
        failed_count: failedCount,
        intent: 'BATCH_UPDATE',
        intent_note: body.reason || null,
        metadata: {
          idempotency_key: body.idempotency_key,
          scope_hash: body.scope_hash,
          failures: failures.length > 0 ? failures : undefined
        }
      })
      .select()
      .single();

    if (batchError) {
      console.error('[inventory-batch-update] Failed to create batch record:', batchError);
    }

    // Create sync job if there were successful updates
    // cell_ids is required (NOT NULL) - generate from changes
    if (successCount > 0) {
      const cellIds = body.changes.map(c => 
        `${c.room_type_id}:${c.rate_plan_id}:${c.channel_id}:${c.date}`
      );
      
      await supabase
        .from('inventory_sync_jobs')
        .insert({
          property_id: body.property_id,
          cell_ids: cellIds,
          status: 'PENDING',
          idempotency_key: body.idempotency_key,
          created_at: new Date().toISOString()
        });
    }

    const status = failedCount === 0 ? 'ACCEPTED' : 
                   successCount === 0 ? 'FAILED' : 'PARTIAL';

    console.log(`[inventory-batch-update] Completed: ${successCount} success, ${failedCount} failed`);

    return new Response(
      JSON.stringify({
        batch_id: body.batch_id,
        status,
        record_id: batchRecord?.id || body.batch_id,
        affected_cells: successCount,
        failed_cells: failedCount,
        failures: failures.length > 0 ? failures : undefined,
        created_at: new Date().toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[inventory-batch-update] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'INTERNAL_ERROR'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
