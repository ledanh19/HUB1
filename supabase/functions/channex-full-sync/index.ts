import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

/**
 * channex-full-sync
 * -----------------
 * Master sync function that orchestrates pulling ALL data from Channex
 * into local Supabase mirror tables. This is intended for error recovery
 * or initial setup — NOT for normal operation.
 *
 * Normal flow: Roomrise Control Hub (local DB) → push to Channex
 * Recovery flow: Channex → pull into local DB (this function)
 *
 * Sync order (sequential, with dependencies):
 * 1. Users        → channex_users, channex_user_properties
 * 2. Properties   → properties_mirror
 * 3. Room Types   → room_types_mirror
 * 4. Rate Plans   → rate_plans_mirror
 * 5. Inventory    → inventory_cells
 */

interface StepResult {
  step: string
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED'
  duration_ms: number
  counts?: Record<string, number>
  error?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const startTime = Date.now()
  
  // Forward the original auth header to sub-functions
  const authHeader = req.headers.get('Authorization') || ''
  const apikeyHeader = req.headers.get('apikey') || ''

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse optional parameters
    let propertyId: string | null = null
    let skipSteps: string[] = []
    try {
      const body = await req.json()
      propertyId = body.property_id || null
      skipSteps = body.skip_steps || []
    } catch {
      // No body
    }

    // Create sync run record for audit
    const { data: syncRun } = await supabase
      .from('sync_runs')
      .insert({
        provider: 'channex',
        run_type: 'MANUAL_FULL',
        entity: 'FULL_SYNC',
        status: 'RUNNING',
      })
      .select('id')
      .single()

    const syncRunId = syncRun?.id || null
    const results: StepResult[] = []

    // Helper to invoke another edge function via direct HTTP call
    const invokeStep = async (
      stepName: string,
      functionName: string,
      body: Record<string, unknown>
    ): Promise<StepResult> => {
      if (skipSteps.includes(stepName)) {
        return { step: stepName, status: 'SKIPPED', duration_ms: 0 }
      }

      const stepStart = Date.now()
      try {
        console.log(`[Full Sync] Starting step: ${stepName}`)
        
        const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
            'apikey': apikeyHeader,
          },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`${functionName} returned ${response.status}: ${errorText}`)
        }

        const data = await response.json()

        const result: StepResult = {
          step: stepName,
          status: 'SUCCESS',
          duration_ms: Date.now() - stepStart,
          counts: data?.counts || undefined,
        }
        console.log(`[Full Sync] ✓ ${stepName} completed in ${result.duration_ms}ms`)
        return result
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.error(`[Full Sync] ✗ ${stepName} failed:`, errorMsg)
        return {
          step: stepName,
          status: 'FAILED',
          duration_ms: Date.now() - stepStart,
          error: errorMsg,
        }
      }
    }

    // Step 1: Sync Users
    results.push(await invokeStep(
      'users',
      'channex-user-sync',
      { run_type: 'MANUAL_FULL', include_properties: true }
    ))

    // Step 2: Sync Properties
    results.push(await invokeStep(
      'properties',
      'channex-properties-sync',
      { run_type: 'MANUAL_FULL' }
    ))

    // Step 3: Sync Room Types
    const roomTypesBody: Record<string, unknown> = { run_type: 'MANUAL_FULL' }
    if (propertyId) roomTypesBody.property_id = propertyId
    results.push(await invokeStep(
      'room_types',
      'channex-roomtypes-sync',
      roomTypesBody
    ))

    // Step 4: Sync Rate Plans
    const ratePlansBody: Record<string, unknown> = { run_type: 'MANUAL_FULL' }
    if (propertyId) ratePlansBody.property_id = propertyId
    results.push(await invokeStep(
      'rate_plans',
      'channex-rateplans-sync',
      ratePlansBody
    ))

    // Step 5: Sync Inventory (restrictions/ARI)
    // IMPORTANT: channex-inventory-sync expects `property_id` (not channexPropertyId)
    // Pull a full year of data to cover all dates with pricing in Channex
    const inventoryBody: Record<string, unknown> = { run_type: 'MANUAL_FULL' }
    if (propertyId) inventoryBody.property_id = propertyId
    // Extend date range: today → today + 365 days
    const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000)
    inventoryBody.date_from = vnNow.toISOString().split('T')[0]
    const futureDate = new Date(vnNow)
    futureDate.setDate(futureDate.getDate() + 365)
    inventoryBody.date_to = futureDate.toISOString().split('T')[0]
    results.push(await invokeStep(
      'inventory',
      'channex-inventory-sync',
      inventoryBody
    ))

    // Summarise
    const failed = results.filter(r => r.status === 'FAILED')
    const succeeded = results.filter(r => r.status === 'SUCCESS')
    const overallStatus = failed.length === 0 ? 'SUCCESS' : (succeeded.length > 0 ? 'PARTIAL' : 'FAILED')

    // Update sync run
    if (syncRunId) {
      await supabase
        .from('sync_runs')
        .update({
          status: overallStatus,
          ended_at: new Date().toISOString(),
          counts: {
            total_steps: results.length,
            succeeded: succeeded.length,
            failed: failed.length,
            skipped: results.filter(r => r.status === 'SKIPPED').length,
          },
        })
        .eq('id', syncRunId)
    }

    const totalDuration = Date.now() - startTime
    console.log(`[Full Sync] Completed in ${totalDuration}ms — ${overallStatus}`)

    return new Response(
      JSON.stringify({
        success: overallStatus !== 'FAILED',
        status: overallStatus,
        sync_run_id: syncRunId,
        duration_ms: totalDuration,
        steps: results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: overallStatus === 'FAILED' ? 500 : 200,
      }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Full Sync] Fatal error:', errorMessage)

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
