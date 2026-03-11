import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ChannexAriValue {
  date: string
  rate?: number
  availability?: number
  stop_sell?: boolean
  closed_to_arrival?: boolean
  closed_to_departure?: boolean
  min_stay_arrival?: number
  min_stay_through?: number
  max_stay?: number
  max_availability?: number
  availability_offset?: number
}

interface ChannexAriResponse {
  data: {
    id: string
    type: string
    attributes: {
      property_id: string
      room_type_id: string
      rate_plan_id: string
      values: ChannexAriValue[]
    }
  }[]
  meta?: {
    total?: number
  }
}

interface SyncRequest {
  property_id?: string  // Channex property ID
  date_from?: string    // YYYY-MM-DD
  date_to?: string      // YYYY-MM-DD
  run_type?: string     // MANUAL, SCHEDULED, WEBHOOK
}

function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const current = new Date(startDate)
  const end = new Date(endDate)
  
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }
  
  return dates
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const startTime = Date.now()
  let syncRunId: string | null = null
  
  try {
    const channexApiKey = Deno.env.get('CHANNEX_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!channexApiKey) {
      throw new Error('CHANNEX_API_KEY not configured')
    }
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body
    let params: SyncRequest = {
      run_type: 'MANUAL'
    }
    
    try {
      const body = await req.json()
      params = { ...params, ...body }
    } catch {
      // No body provided - use defaults
    }

    // Default date range: today (VN timezone) + 365 days
    // PMS SOT §4.1 — all dates normalized to Asia/Ho_Chi_Minh (UTC+7)
    const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000)
    const defaultDateFrom = vnNow.toISOString().split('T')[0]
    const futureDate = new Date(vnNow)
    futureDate.setDate(futureDate.getDate() + 365)
    const defaultDateTo = futureDate.toISOString().split('T')[0]

    const dateFrom = params.date_from || defaultDateFrom
    const dateTo = params.date_to || defaultDateTo

    console.log(`[Inventory Sync] Starting sync from ${dateFrom} to ${dateTo}`)

    // Create sync run record
    const { data: syncRun, error: syncRunError } = await supabase
      .from('sync_runs')
      .insert({
        provider: 'channex',
        run_type: params.run_type,
        entity: 'INVENTORY',
        status: 'RUNNING',
      })
      .select('id')
      .single()

    if (syncRunError) {
      console.error('Failed to create sync run:', syncRunError)
    } else {
      syncRunId = syncRun.id
    }

    console.log(`[Inventory Sync] Sync run ID: ${syncRunId}`)

    // Get properties to sync
    let propertiesToSync: string[] = []
    
    if (params.property_id) {
      propertiesToSync = [params.property_id]
    } else {
      // Get all active properties from channex_user_properties
      const { data: properties, error: propError } = await supabase
        .from('channex_user_properties')
        .select('channex_property_id')
        .eq('property_status', 'active')

      if (propError) {
        throw new Error(`Failed to fetch properties: ${propError.message}`)
      }

      propertiesToSync = properties?.map(p => p.channex_property_id) || []
    }

    console.log(`[Inventory Sync] Syncing ${propertiesToSync.length} properties`)

    const counts = {
      properties_processed: 0,
      cells_fetched: 0,
      cells_inserted: 0,
      cells_updated: 0,
      cells_skipped: 0,
      errors: 0,
    }

    // Process each property
    for (const channexPropertyId of propertiesToSync) {
      try {
        console.log(`[Inventory Sync] Processing property ${channexPropertyId}`)

        // Get room types for this property
        const { data: roomTypes } = await supabase
          .from('room_types_mirror')
          .select('id, provider_room_type_id')
          .eq('provider_property_id', channexPropertyId)
          .eq('provider', 'channex')

        if (!roomTypes || roomTypes.length === 0) {
          console.log(`[Inventory Sync] No room types found for property ${channexPropertyId}`)
          continue
        }

        // Get rate plans for this property
        const { data: ratePlans } = await supabase
          .from('rate_plans_mirror')
          .select('id, provider_rate_plan_id, provider_room_type_id')
          .eq('provider_property_id', channexPropertyId)
          .eq('provider', 'channex')

        if (!ratePlans || ratePlans.length === 0) {
          console.log(`[Inventory Sync] No rate plans found for property ${channexPropertyId}`)
          continue
        }

        // Get mapping ID from channex_mappings
        // IMPORTANT: multiple rows may exist; always pick a stable one (oldest) so UI and sync match
        const { data: mappings } = await supabase
          .from('channex_mappings')
          .select('id, created_at')
          .eq('channex_property_id', channexPropertyId)
          .order('created_at', { ascending: true })
          .limit(1)

        const mapping = mappings?.[0]

        // If no mapping exists, create one
        let propertyUuid: string
        if (!mapping) {
          console.log(`[Inventory Sync] Creating mapping for ${channexPropertyId}`)
          const { data: newMapping, error: mappingError } = await supabase
            .from('channex_mappings')
            .insert({
              channex_property_id: channexPropertyId,
              property_name: channexPropertyId, // Will be updated by property sync
              status: 'PENDING'
            })
            .select('id')
            .single()
          
          if (mappingError || !newMapping) {
            console.error(`[Inventory Sync] Failed to create mapping for ${channexPropertyId}:`, mappingError)
            continue
          }
          propertyUuid = newMapping.id
        } else {
          propertyUuid = mapping.id
        }

        // Fetch ARI (Availability + Restrictions + Rates) from Channex
        // Use Restrictions endpoint which returns an object keyed by rate_plan_id
        // Docs: https://docs.channex.io/api-v.1-documentation/ari
        const channexUrl = new URL('https://app.channex.io/api/v1/restrictions')
        channexUrl.searchParams.set('filter[property_id]', channexPropertyId)
        channexUrl.searchParams.set('filter[date][gte]', dateFrom)
        channexUrl.searchParams.set('filter[date][lte]', dateTo)
        channexUrl.searchParams.set(
          'filter[restrictions]',
          [
            'availability',
            'rate',
            'min_stay_arrival',
            'min_stay_through',
            'closed_to_arrival',
            'closed_to_departure',
            'stop_sell',
            'max_stay',
            'availability_offset',
            'max_availability',
          ].join(',')
        )

        console.log(`[Inventory Sync] Fetching restrictions from Channex for property ${channexPropertyId}`)

        const response = await fetch(channexUrl.toString(), {
          method: 'GET',
          headers: {
            'user-api-key': channexApiKey,
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error(
            `[Inventory Sync] Channex API error for property ${channexPropertyId}: ${response.status} - ${errorText}`
          )
          counts.errors++
          continue
        }

        const ariData = await response.json()

        // Expected success payload:
        // { data: { [rate_plan_id]: { [YYYY-MM-DD]: { availability, rate, ... }}}}
        const dataObj = ariData?.data

        if (typeof dataObj !== 'object' || dataObj === null) {
          console.log(`[Inventory Sync] No valid data for property ${channexPropertyId}`)
          counts.properties_processed++
          continue
        }

        // Log coverage: how many rate plans Channex returned vs how many we have in mirror
        const returnedRatePlanIds = Object.keys(dataObj)
        const mirrorRatePlanIds = ratePlans.map(rp => rp.provider_rate_plan_id)
        const matchedIds = returnedRatePlanIds.filter(id => mirrorRatePlanIds.includes(id))
        const unmatchedIds = returnedRatePlanIds.filter(id => !mirrorRatePlanIds.includes(id))
        const missingFromApi = mirrorRatePlanIds.filter(id => !returnedRatePlanIds.includes(id))
        console.log(`[Inventory Sync] Restrictions coverage for ${channexPropertyId}: ` +
          `API returned ${returnedRatePlanIds.length} rate plans, mirror has ${mirrorRatePlanIds.length}, ` +
          `matched=${matchedIds.length}, unmatched=${unmatchedIds.length}, ` +
          `missing_from_api=${missingFromApi.length}`)

        const parseBool = (v: unknown): boolean => {
          if (typeof v === 'boolean') return v
          if (typeof v === 'number') return v !== 0
          if (typeof v === 'string') return v === 'true' || v === '1'
          return false
        }

        const parseNum = (v: unknown): number | null => {
          if (v === null || v === undefined) return null
          if (typeof v === 'number') return Number.isFinite(v) ? v : null
          if (typeof v === 'string') {
            const n = Number(v)
            return Number.isFinite(n) ? n : null
          }
          return null
        }

        // Collect all cells for this property, then batch upsert
        const cellsToUpsert: any[] = []

        // Process each rate plan in the response
        for (const [providerRatePlanId, dateMap] of Object.entries(dataObj)) {
          // Find internal rate plan
          const ratePlan = ratePlans.find(rp => rp.provider_rate_plan_id === providerRatePlanId)
          if (!ratePlan) {
            counts.cells_skipped++
            continue
          }

          // Find internal room type ID
          const roomType = roomTypes.find(rt => rt.provider_room_type_id === ratePlan.provider_room_type_id)
          if (!roomType) {
            counts.cells_skipped++
            continue
          }

          if (typeof dateMap !== 'object' || dateMap === null) continue

          for (const [date, restrictions] of Object.entries(dateMap as Record<string, Record<string, unknown>>)) {
            counts.cells_fetched++

            const r = restrictions || {}

            cellsToUpsert.push({
              property_id: propertyUuid,
              room_type_id: roomType.id,
              rate_plan_id: ratePlan.id,
              channel_id: null,
              cell_date: date,

              // Core values
              availability: parseNum(r['availability']) ?? 0,
              rate: parseNum(r['rate']),

              // Restrictions
              stop_sell: parseBool(r['stop_sell']),
              closed_to_arrival: parseBool(r['closed_to_arrival']),
              closed_to_departure: parseBool(r['closed_to_departure']),
              min_stay_arrival: parseNum(r['min_stay_arrival']),
              min_stay_through: parseNum(r['min_stay_through']),
              max_stay: parseNum(r['max_stay']),

              // Read-only modifiers
              availability_offset: parseNum(r['availability_offset']),
              max_availability: parseNum(r['max_availability']),

              // Metadata
              source: 'channex',
              sync_status: 'SYNCED',
              source_layer: 'SYNC',
              updated_at: new Date().toISOString(),
            })
          }
        }

        // Batch upsert cells (500 per batch for performance)
        if (cellsToUpsert.length > 0) {
          const batchSize = 500
          for (let i = 0; i < cellsToUpsert.length; i += batchSize) {
            const batch = cellsToUpsert.slice(i, i + batchSize)
            const { error: upsertError, count } = await supabase
              .from('inventory_cells')
              .upsert(batch, {
                onConflict: 'property_id,room_type_id,rate_plan_id,channel_id,cell_date',
                count: 'exact'
              })

            if (upsertError) {
              console.error(`[Inventory Sync] Batch upsert error:`, upsertError)
              counts.errors += batch.length
            } else {
              counts.cells_inserted += batch.length
            }
          }
        }

        counts.properties_processed++
        console.log(`[Inventory Sync] Completed property ${channexPropertyId} - ${cellsToUpsert.length} cells`)

      } catch (propError) {
        console.error(`[Inventory Sync] Error processing property ${channexPropertyId}:`, propError)
        counts.errors++
      }
    }
    await supabase
      .from('inventory_sync_metrics')
      .upsert({
        property_id: params.property_id || 'ALL',
        channel_id: 'channex',
        sync_type: params.run_type || 'MANUAL',
        last_sync_at: new Date().toISOString(),
        cells_synced: counts.cells_inserted,
        errors_count: counts.errors,
        status: counts.errors === 0 ? 'SUCCESS' : 'PARTIAL',
      }, { 
        onConflict: 'property_id,channel_id' 
      })

    // Update sync_state
    await supabase
      .from('sync_state')
      .upsert({
        key: 'channex_inventory_last_synced_at',
        value_json: { 
          timestamp: new Date().toISOString(),
          date_from: dateFrom,
          date_to: dateTo,
          counts 
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })

    // Update sync run
    if (syncRunId) {
      await supabase
        .from('sync_runs')
        .update({
          status: counts.errors === 0 ? 'SUCCESS' : 'PARTIAL',
          ended_at: new Date().toISOString(),
          counts,
        })
        .eq('id', syncRunId)
    }

    const duration = Date.now() - startTime
    console.log(`[Inventory Sync] Completed in ${duration}ms:`, counts)

    return new Response(
      JSON.stringify({
        success: true,
        sync_run_id: syncRunId,
        duration_ms: duration,
        date_range: { from: dateFrom, to: dateTo },
        counts,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Inventory Sync] Error:', errorMessage)

    // Update sync run with error
    if (syncRunId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        await supabase
          .from('sync_runs')
          .update({
            status: 'FAILED',
            ended_at: new Date().toISOString(),
            error: errorMessage,
          })
          .eq('id', syncRunId)
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
