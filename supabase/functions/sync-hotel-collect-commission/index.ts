import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Sync Commission for HOTEL_COLLECT Bookings
 * 
 * This function fetches booking details from Channex API and extracts commission
 * data that may be in the raw message or nested attributes.
 * 
 * Channex may store commission in:
 * - ota_commission (direct percent)
 * - commission (percent or object)
 * - commissions[] array
 * - commission_percent
 * - raw_message (OTA-specific nested data)
 */

interface ChannexBookingDetail {
  data: {
    id: string
    attributes: {
      ota_commission?: number | string
      commission?: number | string | { percent?: number; rate?: number }
      commissions?: Array<{ percent?: number; rate?: number; commission?: number }>
      commission_percent?: number | string
      agency_commission?: number | string
      total_amount?: string
      amount?: string
      raw?: any
      raw_message?: any
      ota_data?: any
      source_data?: any
      original_data?: any
      rooms?: Array<{
        amount?: string
        commission?: number | string
        ota_commission?: number | string
      }>
    }
  }
}

function normalizePercent(val: unknown): number | null {
  if (val === null || val === undefined) return null
  const num = typeof val === 'string' ? parseFloat(val) : (typeof val === 'number' ? val : null)
  if (num === null || isNaN(num)) return null
  // If value > 1 and <= 100, assume it's a percentage (22 -> 0.22)
  if (num > 1 && num <= 100) return num / 100
  // If value > 0 and <= 1, assume it's already decimal
  if (num > 0 && num <= 1) return num
  // If 0, return 0
  if (num === 0) return 0
  return null
}

function extractCommissionFromRawMessage(rawMessage: any): { percent: number | null; source: string } {
  if (!rawMessage) return { percent: null, source: '' }
  
  // Parse if string
  let parsed = rawMessage
  if (typeof rawMessage === 'string') {
    try {
      parsed = JSON.parse(rawMessage)
    } catch {
      return { percent: null, source: '' }
    }
  }
  
  // Priority 1: Expedia format - reservation.commissions[].percent
  if (parsed.reservation?.commissions && Array.isArray(parsed.reservation.commissions)) {
    for (const comm of parsed.reservation.commissions) {
      const percent = normalizePercent(comm.percent || comm.rate)
      if (percent !== null && percent > 0) {
        return { percent, source: 'raw_message.reservation.commissions[].percent' }
      }
    }
  }
  
  // Priority 2: Direct commissions array at root
  if (parsed.commissions && Array.isArray(parsed.commissions)) {
    for (const comm of parsed.commissions) {
      const percent = normalizePercent(comm.percent || comm.rate)
      if (percent !== null && percent > 0) {
        return { percent, source: 'raw_message.commissions[].percent' }
      }
    }
  }
  
  // Priority 3: Search common paths
  const searchPaths = [
    ['commission_percent'],
    ['ota_commission'],
    ['commission'],
    ['reservation', 'commission_percent'],
    ['reservation', 'commission'],
    ['booking', 'commission_percent'],
  ]
  
  for (const path of searchPaths) {
    let value = parsed
    for (const key of path) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key]
      } else {
        value = undefined
        break
      }
    }
    
    if (value !== undefined) {
      const percent = normalizePercent(value)
      if (percent !== null && percent > 0) {
        return { percent, source: `raw_message.${path.join('.')}` }
      }
    }
  }
  
  return { percent: null, source: '' }
}

function parseOtaCommissionFromBooking(attrs: any, baseAmount: number): {
  commissionPercent: number | null
  commissionAmount: number | null
  source: string | null
} {
  let commissionPercent: number | null = null
  let source: string | null = null

  // Priority 1: ota_commission
  if (attrs.ota_commission !== undefined) {
    const parsed = normalizePercent(attrs.ota_commission)
    if (parsed !== null) {
      commissionPercent = parsed
      source = 'ota_commission'
    }
  }

  // Priority 2: commission field
  if (commissionPercent === null && attrs.commission !== undefined) {
    if (typeof attrs.commission === 'object' && attrs.commission !== null) {
      const parsed = normalizePercent(attrs.commission.percent || attrs.commission.rate)
      if (parsed !== null) {
        commissionPercent = parsed
        source = 'commission.percent'
      }
    } else {
      const parsed = normalizePercent(attrs.commission)
      if (parsed !== null) {
        commissionPercent = parsed
        source = 'commission'
      }
    }
  }

  // Priority 3: commissions[] array
  if (commissionPercent === null && Array.isArray(attrs.commissions) && attrs.commissions.length > 0) {
    const firstCommission = attrs.commissions[0]
    const parsed = normalizePercent(firstCommission?.percent || firstCommission?.rate || firstCommission?.commission)
    if (parsed !== null) {
      commissionPercent = parsed
      source = 'commissions[0]'
    }
  }

  // Priority 4: commission_percent
  if (commissionPercent === null && attrs.commission_percent !== undefined) {
    const parsed = normalizePercent(attrs.commission_percent)
    if (parsed !== null) {
      commissionPercent = parsed
      source = 'commission_percent'
    }
  }

  // Priority 5: agency_commission
  if (commissionPercent === null && attrs.agency_commission !== undefined) {
    const parsed = normalizePercent(attrs.agency_commission)
    if (parsed !== null) {
      commissionPercent = parsed
      source = 'agency_commission'
    }
  }

  // Priority 6: Check in rooms
  if (commissionPercent === null && Array.isArray(attrs.rooms)) {
    for (const room of attrs.rooms) {
      if (room.commission !== undefined) {
        const parsed = normalizePercent(room.commission)
        if (parsed !== null) {
          commissionPercent = parsed
          source = 'rooms[].commission'
          break
        }
      }
      if (room.ota_commission !== undefined) {
        const parsed = normalizePercent(room.ota_commission)
        if (parsed !== null) {
          commissionPercent = parsed
          source = 'rooms[].ota_commission'
          break
        }
      }
    }
  }

  // Priority 7: Search in raw message
  if (commissionPercent === null) {
    const rawSources = [attrs.raw, attrs.raw_message, attrs.ota_data, attrs.source_data, attrs.original_data]
    for (const rawSource of rawSources) {
      if (rawSource) {
        const result = extractCommissionFromRawMessage(rawSource)
        if (result.percent !== null) {
          commissionPercent = result.percent
          source = result.source
          break
        }
      }
    }
  }

  // Calculate amount
  let commissionAmount: number | null = null
  if (commissionPercent !== null && baseAmount > 0) {
    commissionAmount = Math.round(baseAmount * commissionPercent)
  }

  return { commissionPercent, commissionAmount, source }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const CHANNEX_API_KEY = Deno.env.get('CHANNEX_API_KEY') || Deno.env.get('CHANNEX_USER_API_KEY')

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: 'Missing Supabase configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!CHANNEX_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Missing Channex API key' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Parse request body for options
    let options: { limit?: number; dryRun?: boolean; bookingIds?: string[] } = {}
    try {
      const body = await req.json()
      options = body || {}
    } catch {
      // No body or invalid JSON - use defaults
    }

    const limit = options.limit || 50
    const dryRun = options.dryRun || false
    const specificBookingIds = options.bookingIds

    console.log(`[Commission Sync] Starting sync with limit=${limit}, dryRun=${dryRun}`)

    // Fetch HOTEL_COLLECT bookings without commission
    let query = supabase
      .from('bookings_mirror')
      .select('id, pms_booking_id, ota_source, total_amount_gross, commission_rate, commission_amount')
      .eq('payment_type', 'HOTEL_COLLECT')
      .or('commission_rate.eq.0,commission_rate.is.null')
      .order('check_in_date', { ascending: false })
      .limit(limit)

    if (specificBookingIds && specificBookingIds.length > 0) {
      query = supabase
        .from('bookings_mirror')
        .select('id, pms_booking_id, ota_source, total_amount_gross, commission_rate, commission_amount')
        .eq('payment_type', 'HOTEL_COLLECT')
        .in('pms_booking_id', specificBookingIds)
        .limit(limit)
    }

    const { data: bookings, error: fetchError } = await query

    if (fetchError) {
      console.error('[Commission Sync] Failed to fetch bookings:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch bookings', details: fetchError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!bookings || bookings.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No HOTEL_COLLECT bookings need commission sync',
          stats: { total: 0, updated: 0, failed: 0 }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Commission Sync] Found ${bookings.length} bookings to process`)

    const results = {
      total: bookings.length,
      updated: 0,
      noCommissionFound: 0,
      failed: 0,
      details: [] as Array<{
        pms_booking_id: string
        ota_source: string
        status: string
        commission_rate?: number
        commission_amount?: number
        source?: string
        error?: string
      }>
    }

    // Process each booking
    for (const booking of bookings) {
      const pmsBookingId = booking.pms_booking_id

      try {
        // Fetch booking detail from Channex API
        const channexUrl = `https://app.channex.io/api/v1/bookings/${pmsBookingId}`
        
        console.log(`[Commission Sync] Fetching booking ${pmsBookingId} from Channex`)
        
        const channexResponse = await fetch(channexUrl, {
          method: 'GET',
          headers: {
            'user-api-key': CHANNEX_API_KEY,
            'Content-Type': 'application/json',
          },
        })

        if (!channexResponse.ok) {
          const errorText = await channexResponse.text()
          console.error(`[Commission Sync] Channex API error for ${pmsBookingId}: ${channexResponse.status}`)
          results.failed++
          results.details.push({
            pms_booking_id: pmsBookingId,
            ota_source: booking.ota_source,
            status: 'error',
            error: `Channex API error: ${channexResponse.status} - ${errorText.substring(0, 100)}`,
          })
          continue
        }

        const channexData: ChannexBookingDetail = await channexResponse.json()
        const attrs = channexData.data?.attributes

        if (!attrs) {
          console.warn(`[Commission Sync] No attributes found for booking ${pmsBookingId}`)
          results.failed++
          results.details.push({
            pms_booking_id: pmsBookingId,
            ota_source: booking.ota_source,
            status: 'error',
            error: 'No attributes in Channex response',
          })
          continue
        }

        // Debug: Log available fields and commission-related values
        console.log(`[Commission Sync] Booking ${pmsBookingId} attrs keys:`, Object.keys(attrs).join(', '))
        console.log(`[Commission Sync] Booking ${pmsBookingId} ota_commission:`, attrs.ota_commission)
        
        // Parse raw_message to search for commission
        let rawMessageObj: any = null
        if (attrs.raw_message) {
          try {
            rawMessageObj = typeof attrs.raw_message === 'string' 
              ? JSON.parse(attrs.raw_message) 
              : attrs.raw_message
          } catch {
            console.log(`[Commission Sync] Booking ${pmsBookingId} raw_message is not valid JSON`)
          }
        }
        
        // Log full raw_message for first booking (debugging)
        if (rawMessageObj) {
          const fullJson = JSON.stringify(rawMessageObj)
          console.log(`[Commission Sync] Booking ${pmsBookingId} raw_message LENGTH:`, fullJson.length)
          console.log(`[Commission Sync] Booking ${pmsBookingId} raw_message PART1:`, fullJson.substring(0, 2000))
          console.log(`[Commission Sync] Booking ${pmsBookingId} raw_message PART2:`, fullJson.substring(2000, 4000))
          console.log(`[Commission Sync] Booking ${pmsBookingId} raw_message PART3:`, fullJson.substring(4000, 6000))
          
          // Search for 'commission' anywhere in the message
          const commissionIndex = fullJson.toLowerCase().indexOf('commission')
          if (commissionIndex >= 0) {
            console.log(`[Commission Sync] Booking ${pmsBookingId} FOUND 'commission' at index ${commissionIndex}:`, 
              fullJson.substring(Math.max(0, commissionIndex - 50), commissionIndex + 100))
          } else {
            console.log(`[Commission Sync] Booking ${pmsBookingId} NO 'commission' found in raw_message`)
          }
        }
        
        // Calculate base amount
        const baseAmount = booking.total_amount_gross || parseFloat(attrs.total_amount || attrs.amount || '0') || 0
        
        // Parse commission
        const commissionData = parseOtaCommissionFromBooking(attrs, baseAmount)

        if (commissionData.commissionPercent === null || commissionData.commissionPercent === 0) {
          console.log(`[Commission Sync] No commission found for booking ${pmsBookingId}`)
          results.noCommissionFound++
          results.details.push({
            pms_booking_id: pmsBookingId,
            ota_source: booking.ota_source,
            status: 'no_commission',
          })
          continue
        }

        const commissionRate = commissionData.commissionPercent * 100 // Store as percentage (e.g., 22.0)
        const commissionAmount = commissionData.commissionAmount || 0

        console.log(`[Commission Sync] Found commission for ${pmsBookingId}: ${commissionRate}% (${commissionAmount}) from ${commissionData.source}`)

        if (!dryRun) {
          // Update booking_mirror
          const { error: updateError } = await supabase
            .from('bookings_mirror')
            .update({
              commission_rate: commissionRate,
              commission_amount: commissionAmount,
              updated_at: new Date().toISOString(),
            })
            .eq('id', booking.id)

          if (updateError) {
            console.error(`[Commission Sync] Failed to update booking ${pmsBookingId}:`, updateError)
            results.failed++
            results.details.push({
              pms_booking_id: pmsBookingId,
              ota_source: booking.ota_source,
              status: 'error',
              error: updateError.message,
            })
            continue
          }
        }

        results.updated++
        results.details.push({
          pms_booking_id: pmsBookingId,
          ota_source: booking.ota_source,
          status: dryRun ? 'would_update' : 'updated',
          commission_rate: commissionRate,
          commission_amount: commissionAmount,
          source: commissionData.source || undefined,
        })

      } catch (error) {
        console.error(`[Commission Sync] Error processing booking ${pmsBookingId}:`, error)
        results.failed++
        results.details.push({
          pms_booking_id: pmsBookingId,
          ota_source: booking.ota_source,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    const duration = Date.now() - startTime

    return new Response(
      JSON.stringify({
        success: true,
        dryRun,
        stats: {
          total: results.total,
          updated: results.updated,
          noCommissionFound: results.noCommissionFound,
          failed: results.failed,
        },
        details: results.details,
        durationMs: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Commission Sync] Fatal error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
