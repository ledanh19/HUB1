import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** ISO Alpha-2 → Country name */
const ALPHA2_TO_COUNTRY: Record<string, string> = {
  VN: 'Vietnam', KR: 'South Korea', CN: 'China', US: 'United States',
  SG: 'Singapore', TH: 'Thailand', JP: 'Japan', AU: 'Australia',
  GB: 'United Kingdom', FR: 'France', DE: 'Germany', IN: 'India',
  MY: 'Malaysia', ID: 'Indonesia', PH: 'Philippines', TW: 'Taiwan',
  HK: 'Hong Kong', CA: 'Canada', RU: 'Russia', IT: 'Italy',
  ES: 'Spain', NL: 'Netherlands', KH: 'Cambodia', LA: 'Laos',
  MM: 'Myanmar', NZ: 'New Zealand', SE: 'Sweden', NO: 'Norway',
  DK: 'Denmark', CH: 'Switzerland', BR: 'Brazil', MX: 'Mexico',
  AE: 'United Arab Emirates', SA: 'Saudi Arabia', IL: 'Israel',
  ZA: 'South Africa', PL: 'Poland', CZ: 'Czech Republic', BE: 'Belgium',
  PT: 'Portugal', AT: 'Austria', FI: 'Finland', IE: 'Ireland',
  TR: 'Turkey', AR: 'Argentina', CO: 'Colombia', EG: 'Egypt',
  NG: 'Nigeria', BD: 'Bangladesh', PK: 'Pakistan', NP: 'Nepal',
  LK: 'Sri Lanka', MN: 'Mongolia', MC: 'Monaco', MV: 'Maldives',
  QA: 'Qatar', KW: 'Kuwait', BH: 'Bahrain', OM: 'Oman',
  JO: 'Jordan', LB: 'Lebanon', GR: 'Greece', HR: 'Croatia',
  RO: 'Romania', HU: 'Hungary', BG: 'Bulgaria', SK: 'Slovakia',
  SI: 'Slovenia', RS: 'Serbia', UA: 'Ukraine', BY: 'Belarus',
  LT: 'Lithuania', LV: 'Latvia', EE: 'Estonia', IS: 'Iceland',
  LU: 'Luxembourg', MT: 'Malta', CY: 'Cyprus', GE: 'Georgia',
  AM: 'Armenia', AZ: 'Azerbaijan', KZ: 'Kazakhstan', UZ: 'Uzbekistan',
  PE: 'Peru', CL: 'Chile', EC: 'Ecuador', VE: 'Venezuela',
  UY: 'Uruguay', PY: 'Paraguay', BO: 'Bolivia', CR: 'Costa Rica',
  PA: 'Panama', DO: 'Dominican Republic', CU: 'Cuba', GT: 'Guatemala',
  HN: 'Honduras', SV: 'El Salvador', NI: 'Nicaragua', JM: 'Jamaica',
  TT: 'Trinidad and Tobago', KE: 'Kenya', TZ: 'Tanzania', GH: 'Ghana',
  ET: 'Ethiopia', UG: 'Uganda', SN: 'Senegal', CI: 'Ivory Coast',
  CM: 'Cameroon', MA: 'Morocco', TN: 'Tunisia', DZ: 'Algeria',
  LY: 'Libya', SD: 'Sudan', AO: 'Angola', MZ: 'Mozambique',
  ZW: 'Zimbabwe', ZM: 'Zambia', BW: 'Botswana', NA: 'Namibia',
  MG: 'Madagascar', MU: 'Mauritius', SC: 'Seychelles', RW: 'Rwanda',
  IR: 'Iran', IQ: 'Iraq', AF: 'Afghanistan',
  KP: 'North Korea', BN: 'Brunei', FJ: 'Fiji', PG: 'Papua New Guinea',
}

function resolveCountry(code: string | null | undefined): string | null {
  if (!code) return null
  const upper = code.toUpperCase().trim()
  if (upper.length === 2) return ALPHA2_TO_COUNTRY[upper] || code
  return code // return as-is if already full name
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const channexApiKey = Deno.env.get('CHANNEX_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!channexApiKey || !supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing configuration')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get all bookings missing nationality
    const { data: missingBookings, error: fetchError } = await supabase
      .from('bookings_mirror')
      .select('id, pms_booking_id, guest_name')
      .is('nationality', null)
      .not('pms_booking_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5000)

    if (fetchError) throw fetchError

    console.log(`[Backfill] Found ${missingBookings?.length || 0} bookings missing nationality`)

    let updated = 0
    let skipped = 0
    let errors = 0
    const batchSize = 20

    for (let i = 0; i < (missingBookings?.length || 0); i += batchSize) {
      const batch = missingBookings!.slice(i, i + batchSize)
      
      const promises = batch.map(async (bm) => {
        try {
          // Fetch individual booking from Channex
          const resp = await fetch(
            `https://app.channex.io/api/v1/bookings/${bm.pms_booking_id}`,
            {
              headers: {
                'user-api-key': channexApiKey,
                'Content-Type': 'application/json',
              },
            }
          )

          if (!resp.ok) {
            if (resp.status === 404) { skipped++; return }
            console.error(`[Backfill] API error for ${bm.pms_booking_id}: ${resp.status}`)
            errors++
            return
          }

          const json = await resp.json()
          const booking = json.data
          const attrs = booking?.attributes
          
          // Try customer.country first, then first room guest
          let country: string | null = null
          const customer = attrs?.customer
          if (customer?.country) {
            country = resolveCountry(customer.country)
          }
          if (!country) {
            const firstGuest = attrs?.rooms?.[0]?.guests?.[0]
            if (firstGuest?.country) {
              country = resolveCountry(firstGuest.country)
            }
          }

          if (country) {
            const { error: updateError } = await supabase
              .from('bookings_mirror')
              .update({ nationality: country })
              .eq('id', bm.id)

            if (updateError) {
              console.error(`[Backfill] Update error for ${bm.id}:`, updateError)
              errors++
            } else {
              updated++
            }
          } else {
            skipped++
          }
        } catch (err) {
          console.error(`[Backfill] Error for ${bm.pms_booking_id}:`, err)
          errors++
        }
      })

      await Promise.all(promises)
      
      // Rate limiting - small delay between batches
      if (i + batchSize < (missingBookings?.length || 0)) {
        await new Promise(r => setTimeout(r, 200))
      }
    }

    const result = { total: missingBookings?.length || 0, updated, skipped, errors }
    console.log(`[Backfill] Complete:`, result)

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Backfill] Error:', msg)
    return new Response(JSON.stringify({ success: false, error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
