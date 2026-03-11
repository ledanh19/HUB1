import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ChannexGroup {
  id: string
  attributes: {
    title: string
    properties?: Array<{ id: string }>
  }
  relationships?: {
    properties?: {
      data?: Array<{ id: string; type: string }>
    }
  }
}

interface ChannexGroupsResponse {
  data: ChannexGroup[]
  meta?: {
    page: number
    limit: number
    total: number
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const channexApiKey = Deno.env.get('CHANNEX_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!channexApiKey) throw new Error('CHANNEX_API_KEY not configured')
    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase configuration missing')

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body for optional channex_user_id filter
    let channexUserId: string | null = null
    try {
      const body = await req.json()
      channexUserId = body.channex_user_id || null
    } catch {
      // No body provided
    }

    console.log(`[Groups Sync] Starting sync${channexUserId ? ` for user: ${channexUserId}` : ''}`)

    // Fetch groups from Channex
    const channexUrl = new URL('https://app.channex.io/api/v1/groups')
    channexUrl.searchParams.set('pagination[limit]', '100')

    console.log(`[Groups Sync] Fetching from Channex:`, channexUrl.toString())

    const channexResponse = await fetch(channexUrl.toString(), {
      method: 'GET',
      headers: {
        'user-api-key': channexApiKey,
        'Content-Type': 'application/json',
      },
    })

    if (!channexResponse.ok) {
      const errorText = await channexResponse.text()
      throw new Error(`Channex API error: ${channexResponse.status} - ${errorText}`)
    }

    const channexData: ChannexGroupsResponse = await channexResponse.json()
    const groups = channexData.data || []

    console.log(`[Groups Sync] Received ${groups.length} groups from Channex`)

    const results = {
      total: groups.length,
      groups_synced: 0,
      property_links_synced: 0,
      errors: [] as string[],
    }

    // Process each group
    for (const group of groups) {
      try {
        const groupId = group.id
        const title = group.attributes.title

        // Upsert group
        const { error: groupError } = await supabase
          .from('channex_groups')
          .upsert({
            channex_group_id: groupId,
            title: title,
            channex_user_id: channexUserId,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'channex_group_id',
          })

        if (groupError) {
          console.error(`[Groups Sync] Error upserting group ${groupId}:`, groupError)
          results.errors.push(`Group ${groupId}: ${groupError.message}`)
          continue
        }

        results.groups_synced++

        // Get properties for this group
        const propertyIds = group.relationships?.properties?.data?.map(p => p.id) || []
        
        if (propertyIds.length > 0) {
          // Delete existing property links for this group
          await supabase
            .from('channex_property_groups')
            .delete()
            .eq('channex_group_id', groupId)

          // Insert new property links
          const propertyLinks = propertyIds.map(propertyId => ({
            channex_group_id: groupId,
            channex_property_id: propertyId,
          }))

          const { error: linkError } = await supabase
            .from('channex_property_groups')
            .insert(propertyLinks)

          if (linkError) {
            console.error(`[Groups Sync] Error inserting property links for group ${groupId}:`, linkError)
            results.errors.push(`Property links for group ${groupId}: ${linkError.message}`)
          } else {
            results.property_links_synced += propertyIds.length
          }
        }

        console.log(`[Groups Sync] Synced group "${title}" with ${propertyIds.length} properties`)
      } catch (groupErr) {
        const errMsg = groupErr instanceof Error ? groupErr.message : String(groupErr)
        results.errors.push(`Group ${group.id}: ${errMsg}`)
      }
    }

    console.log(`[Groups Sync] Completed: ${results.groups_synced} groups, ${results.property_links_synced} property links`)

    return new Response(
      JSON.stringify({
        success: true,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Groups Sync] Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
