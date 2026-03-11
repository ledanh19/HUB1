import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ChannexRatePlan {
  id: string
  attributes: {
    title?: string
    name?: string
    rate?: number
    currency?: string
    sell_mode?: string
    updated_at?: string
    [key: string]: unknown
  }
  relationships?: {
    property?: {
      data?: {
        id?: string
      }
    }
    room_type?: {
      data?: {
        id?: string
      }
    }
    channel?: {
      data?: {
        id?: string
      }
    }
  }
}

interface ChannexResponse {
  data: ChannexRatePlan[]
  meta?: {
    page: number
    limit: number
    total: number
  }
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
    let runType = 'MANUAL'
    let propertyId: string | null = null
    try {
      const body = await req.json()
      runType = body.run_type || 'MANUAL'
      propertyId = body.property_id || null
    } catch {
      // No body provided
    }

    // Create sync run record
    const { data: syncRun, error: syncRunError } = await supabase
      .from('sync_runs')
      .insert({
        provider: 'channex',
        run_type: runType,
        entity: 'RATEPLANS',
        status: 'RUNNING',
      })
      .select('id')
      .single()

    if (syncRunError) {
      console.error('Failed to create sync run:', syncRunError)
    } else {
      syncRunId = syncRun.id
    }

    console.log(`[RatePlans Sync] Starting sync run: ${syncRunId}`)

    // Fetch rate plans from Channex API
    const counts = {
      fetched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
    }

    let page = 1
    const limit = 100
    let hasMore = true
    const allRatePlans: ChannexRatePlan[] = []

    while (hasMore) {
      const channexUrl = new URL('https://app.channex.io/api/v1/rate_plans')
      channexUrl.searchParams.set('pagination[page]', String(page))
      channexUrl.searchParams.set('pagination[limit]', String(limit))
      
      // Filter by property if provided
      if (propertyId) {
        channexUrl.searchParams.set('filter[property_id]', propertyId)
      }

      console.log(`[RatePlans Sync] Fetching page ${page}...`)

      const response = await fetch(channexUrl.toString(), {
        method: 'GET',
        headers: {
          'user-api-key': channexApiKey,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Channex API error: ${response.status} - ${errorText}`)
      }

      const data: ChannexResponse = await response.json()
      allRatePlans.push(...data.data)
      counts.fetched += data.data.length

      // Check if there are more pages
      if (data.meta && data.data.length < limit) {
        hasMore = false
      } else if (data.data.length === 0) {
        hasMore = false
      } else {
        page++
      }

      // Safety limit
      if (page > 100) {
        console.warn('[RatePlans Sync] Reached page limit, stopping pagination')
        hasMore = false
      }
    }

    console.log(`[RatePlans Sync] Fetched ${allRatePlans.length} rate plans`)

    // Process each rate plan - insert into rate_plans_mirror
    for (const ratePlan of allRatePlans) {
      try {
        const ratePlanId = ratePlan.id
        const attrs = ratePlan.attributes
        const ratePlanName = attrs.title || attrs.name || `RatePlan ${ratePlanId}`
        const baseRate = attrs.rate || null
        const currency = attrs.currency || 'VND'
        const sellMode = attrs.sell_mode || null
        const channexPropertyId = ratePlan.relationships?.property?.data?.id || null
        const channexRoomTypeId = ratePlan.relationships?.room_type?.data?.id || null

        if (!channexPropertyId || !channexRoomTypeId) {
          console.warn(`[RatePlans Sync] Rate plan ${ratePlanId} missing property or room type, skipping`)
          counts.skipped++
          continue
        }

        // Determine channels - if rate plan has a channel relationship, use that
        const channelId = ratePlan.relationships?.channel?.data?.id || null
        const channels = channelId ? [channelId] : []

        const ratePlanData = {
          provider: 'channex',
          provider_property_id: channexPropertyId,
          provider_room_type_id: channexRoomTypeId,
          provider_rate_plan_id: ratePlanId,
          rate_plan_name: ratePlanName,
          rate_plan_code: ratePlanId,
          base_rate: baseRate,
          currency,
          sell_mode: sellMode,
          channels,
          raw_data: ratePlan,
          synced_at: new Date().toISOString(),
          source_updated_at: attrs.updated_at || null,
          updated_at: new Date().toISOString(),
        }

        // Upsert into rate_plans_mirror using provider_rate_plan_id as unique key
        const { error } = await supabase
          .from('rate_plans_mirror')
          .upsert(ratePlanData, {
            onConflict: 'provider_rate_plan_id',
          })

        if (error) {
          console.error(`[RatePlans Sync] Failed to upsert rate plan ${ratePlanId}:`, error)
          counts.errors++
        } else {
          counts.inserted++
        }

      } catch (err) {
        console.error(`[RatePlans Sync] Error processing rate plan:`, err)
        counts.errors++
      }
    }

    // Update sync_state
    await supabase
      .from('sync_state')
      .upsert({
        key: 'channex_rateplans_last_synced_at',
        value_json: { timestamp: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })

    // Update sync run
    if (syncRunId) {
      await supabase
        .from('sync_runs')
        .update({
          status: 'SUCCESS',
          ended_at: new Date().toISOString(),
          counts,
        })
        .eq('id', syncRunId)
    }

    const duration = Date.now() - startTime
    console.log(`[RatePlans Sync] Completed in ${duration}ms:`, counts)

    return new Response(
      JSON.stringify({
        success: true,
        sync_run_id: syncRunId,
        duration_ms: duration,
        counts,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[RatePlans Sync] Error:', errorMessage)

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