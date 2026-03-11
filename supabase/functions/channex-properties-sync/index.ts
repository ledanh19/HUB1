import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ChannexProperty {
  id: string
  attributes: {
    title?: string
    name?: string
    address?: string
    city?: string
    country?: string
    timezone?: string
    currency?: string
    updated_at?: string
    [key: string]: unknown
  }
}

interface ChannexResponse {
  data: ChannexProperty[]
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
    try {
      const body = await req.json()
      runType = body.run_type || 'MANUAL'
    } catch {
      // No body provided
    }

    // Create sync run record
    const { data: syncRun, error: syncRunError } = await supabase
      .from('sync_runs')
      .insert({
        provider: 'channex',
        run_type: runType,
        entity: 'PROPERTIES',
        status: 'RUNNING',
      })
      .select('id')
      .single()

    if (syncRunError) {
      console.error('Failed to create sync run:', syncRunError)
    } else {
      syncRunId = syncRun.id
    }

    console.log(`[Properties Sync] Starting sync run: ${syncRunId}`)

    // Fetch properties from Channex API
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
    const allProperties: ChannexProperty[] = []

    while (hasMore) {
      const channexUrl = new URL('https://app.channex.io/api/v1/properties')
      channexUrl.searchParams.set('pagination[page]', String(page))
      channexUrl.searchParams.set('pagination[limit]', String(limit))

      console.log(`[Properties Sync] Fetching page ${page}...`)

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
      allProperties.push(...data.data)
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
        console.warn('[Properties Sync] Reached page limit, stopping pagination')
        hasMore = false
      }
    }

    console.log(`[Properties Sync] Fetched ${allProperties.length} properties`)

    // Process each property
    for (const property of allProperties) {
      try {
        const propertyId = property.id
        const attrs = property.attributes
        const propertyName = attrs.title || attrs.name || `Property ${propertyId}`
        const sourceUpdatedAt = attrs.updated_at || null

        // Upsert to properties_mirror
        const { data: existing } = await supabase
          .from('properties_mirror')
          .select('id, source_updated_at')
          .eq('provider', 'channex')
          .eq('provider_property_id', propertyId)
          .maybeSingle()

        // Out-of-order guard
        if (existing && sourceUpdatedAt && existing.source_updated_at) {
          const incomingDate = new Date(sourceUpdatedAt)
          const currentDate = new Date(existing.source_updated_at)
          if (incomingDate <= currentDate) {
            counts.skipped++
            continue
          }
        }

        const propertyData = {
          provider: 'channex',
          provider_property_id: propertyId,
          property_name: propertyName,
          address: attrs.address || null,
          city: attrs.city || null,
          country: attrs.country || null,
          timezone: attrs.timezone || null,
          currency: attrs.currency || null,
          raw_data: attrs,
          source_updated_at: sourceUpdatedAt,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        if (existing) {
          const { error } = await supabase
            .from('properties_mirror')
            .update(propertyData)
            .eq('id', existing.id)

          if (error) {
            console.error(`[Properties Sync] Failed to update property ${propertyId}:`, error)
            counts.errors++
          } else {
            counts.updated++
          }
        } else {
          const { error } = await supabase
            .from('properties_mirror')
            .insert(propertyData)

          if (error) {
            console.error(`[Properties Sync] Failed to insert property ${propertyId}:`, error)
            counts.errors++
          } else {
            counts.inserted++
          }
        }

        // Check if mapping already exists
        const { data: existingMapping } = await supabase
          .from('channex_mappings')
          .select('id, first_synced_at, status')
          .eq('channex_property_id', propertyId)
          .is('channex_room_type_id', null)
          .maybeSingle()

        // Upsert to channex_mappings (property-level mapping)
        // Set first_synced_at only on first insert (for IMPORTED booking detection)
        const mappingData: Record<string, unknown> = {
          channex_property_id: propertyId,
          channex_room_type_id: null,
          property_name: propertyName,
          status: existingMapping?.id ? existingMapping.status || 'PENDING' : 'PENDING',
          updated_at: new Date().toISOString(),
        }
        
        // Only set first_synced_at on first insert
        if (!existingMapping) {
          mappingData.first_synced_at = new Date().toISOString()
          console.log(`[Properties Sync] Setting first_synced_at for property ${propertyId}`)
        }

        // Use insert with manual conflict handling instead of upsert
        if (existingMapping) {
          // Update existing mapping
          const { error: updateError } = await supabase
            .from('channex_mappings')
            .update({
              property_name: propertyName,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingMapping.id)

          if (updateError) {
            console.error(`[Properties Sync] Failed to update mapping for ${propertyId}:`, updateError)
          }
        } else {
          // Insert new mapping
          const { error: insertError } = await supabase
            .from('channex_mappings')
            .insert({
              channex_property_id: propertyId,
              channex_room_type_id: null,
              property_name: propertyName,
              status: 'PENDING',
              first_synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })

          if (insertError) {
            console.error(`[Properties Sync] Failed to insert mapping for ${propertyId}:`, insertError)
          } else {
            console.log(`[Properties Sync] Created mapping for property ${propertyId}`)
          }
        }

      } catch (err) {
        console.error(`[Properties Sync] Error processing property:`, err)
        counts.errors++
      }
    }

    // Update sync_state
    await supabase
      .from('sync_state')
      .upsert({
        key: 'channex_properties_last_synced_at',
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
    console.log(`[Properties Sync] Completed in ${duration}ms:`, counts)

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
    console.error('[Properties Sync] Error:', errorMessage)

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