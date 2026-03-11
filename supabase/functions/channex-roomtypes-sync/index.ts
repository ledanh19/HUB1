import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ChannexRoomType {
  id: string
  attributes: {
    title?: string
    name?: string
    occupancy?: number
    default_occupancy?: number
    updated_at?: string
    [key: string]: unknown
  }
  relationships?: {
    property?: {
      data?: {
        id?: string
      }
    }
  }
}

interface ChannexResponse {
  data: ChannexRoomType[]
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
        entity: 'ROOMTYPES',
        status: 'RUNNING',
      })
      .select('id')
      .single()

    if (syncRunError) {
      console.error('Failed to create sync run:', syncRunError)
    } else {
      syncRunId = syncRun.id
    }

    console.log(`[RoomTypes Sync] Starting sync run: ${syncRunId}`)

    // Fetch room types from Channex API
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
    const allRoomTypes: ChannexRoomType[] = []

    while (hasMore) {
      const channexUrl = new URL('https://app.channex.io/api/v1/room_types')
      channexUrl.searchParams.set('pagination[page]', String(page))
      channexUrl.searchParams.set('pagination[limit]', String(limit))

      console.log(`[RoomTypes Sync] Fetching page ${page}...`)

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
      allRoomTypes.push(...data.data)
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
        console.warn('[RoomTypes Sync] Reached page limit, stopping pagination')
        hasMore = false
      }
    }

    console.log(`[RoomTypes Sync] Fetched ${allRoomTypes.length} room types`)

    // Process each room type
    for (const roomType of allRoomTypes) {
      try {
        const roomTypeId = roomType.id
        const attrs = roomType.attributes
        const roomTypeName = attrs.title || attrs.name || `RoomType ${roomTypeId}`
        const occupancy = attrs.occupancy || attrs.default_occupancy || null
        const sourceUpdatedAt = attrs.updated_at || null
        const propertyId = roomType.relationships?.property?.data?.id || null

        if (!propertyId) {
          console.warn(`[RoomTypes Sync] Room type ${roomTypeId} has no property_id, skipping`)
          counts.skipped++
          continue
        }

        // Upsert to room_types_mirror
        const { data: existing } = await supabase
          .from('room_types_mirror')
          .select('id, source_updated_at')
          .eq('provider', 'channex')
          .eq('provider_room_type_id', roomTypeId)
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

        const roomTypeData = {
          provider: 'channex',
          provider_room_type_id: roomTypeId,
          provider_property_id: propertyId,
          room_type_name: roomTypeName,
          occupancy,
          raw_data: attrs,
          source_updated_at: sourceUpdatedAt,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        if (existing) {
          const { error } = await supabase
            .from('room_types_mirror')
            .update(roomTypeData)
            .eq('id', existing.id)

          if (error) {
            console.error(`[RoomTypes Sync] Failed to update room type ${roomTypeId}:`, error)
            counts.errors++
          } else {
            counts.updated++
          }
        } else {
          const { error } = await supabase
            .from('room_types_mirror')
            .insert(roomTypeData)

          if (error) {
            console.error(`[RoomTypes Sync] Failed to insert room type ${roomTypeId}:`, error)
            counts.errors++
          } else {
            counts.inserted++
          }
        }

        // Check if mapping exists for this room type
        const { data: existingMapping } = await supabase
          .from('channex_mappings')
          .select('id')
          .eq('channex_property_id', propertyId)
          .eq('channex_room_type_id', roomTypeId)
          .maybeSingle()

        if (existingMapping) {
          // Update existing mapping
          const { error: updateError } = await supabase
            .from('channex_mappings')
            .update({
              room_type_name: roomTypeName,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingMapping.id)

          if (updateError) {
            console.error(`[RoomTypes Sync] Failed to update mapping for ${roomTypeId}:`, updateError)
          }
        } else {
          // Insert new mapping
          const { error: insertError } = await supabase
            .from('channex_mappings')
            .insert({
              channex_property_id: propertyId,
              channex_room_type_id: roomTypeId,
              room_type_name: roomTypeName,
              status: 'PENDING',
              first_synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })

          if (insertError) {
            console.error(`[RoomTypes Sync] Failed to insert mapping for ${roomTypeId}:`, insertError)
          }
        }

      } catch (err) {
        console.error(`[RoomTypes Sync] Error processing room type:`, err)
        counts.errors++
      }
    }

    // Update sync_state
    await supabase
      .from('sync_state')
      .upsert({
        key: 'channex_roomtypes_last_synced_at',
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
    console.log(`[RoomTypes Sync] Completed in ${duration}ms:`, counts)

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
    console.error('[RoomTypes Sync] Error:', errorMessage)

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