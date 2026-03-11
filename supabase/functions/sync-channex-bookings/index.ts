import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============================================
// TYPE DEFINITIONS
// ============================================

interface ChannexGuest {
  name: string
  surname?: string
  email?: string
  phone?: string
  country?: string   // ISO Alpha-2 country code (e.g. "GB", "VN")
  city?: string
  address?: string
  zip?: string
  mail?: string      // Some OTAs use "mail" instead of "email"
}

interface ChannexRoom {
  id?: string
  reservation_room_id?: string
  room_reservation_id?: string
  room_type_id?: string
  checkin_date?: string
  checkout_date?: string
  rate_plan_title?: string
  room_type_title?: string
  guests?: ChannexGuest[]
  amount?: string
  nights?: number
  days?: Array<{
    date: string
    amount: string
  }>
  services?: Array<{
    name: string
    price: string
  }>
}

interface ChannexBooking {
  id: string
  attributes: {
    booking_id?: string
    unique_id?: string
    status: string
    arrival_date: string
    departure_date: string
    inserted_at: string
    updated_at?: string
    amount?: string
    total_amount?: string
    currency?: string
    ota_name?: string
    ota_reservation_code?: string
    property_id?: string
    property_name?: string
    payment_collect?: string
    payment_type?: string
    commission?: string
    commission_amount?: string
    remittance?: string
    net_amount?: string
    notes?: string  // Contains "Imported Booking" flag from Channex
    rooms?: ChannexRoom[]
    customer?: ChannexGuest
    revision_id?: string  // Channex revision ID - changes when booking is modified
    acknowledge_status?: string
    has_unacked_revisions?: boolean
  }
  relationships?: {
    property?: {
      data?: {
        id?: string
        type?: string
      }
    }
  }
}

interface ChannexIncluded {
  id: string
  type: string
  attributes: {
    title?: string
    name?: string
  }
}

interface ChannexResponse {
  data: ChannexBooking[]
  included?: ChannexIncluded[]
  meta: {
    page: number
    limit: number
    total: number
  }
}

interface SyncWarning {
  booking_id: string
  type: string
  message: string
}

// Standard warning codes per SOURCE OF TRUTH v1.0
const WARNING_CODES = {
  HOTEL_COLLECT_NET_ESTIMATED_FROM_OTA: 'HOTEL_COLLECT_NET_ESTIMATED_FROM_OTA',
  OTA_COLLECT_NO_REMITTANCE: 'OTA_COLLECT_NO_REMITTANCE',
  FINANCE_DATA_MISSING: 'FINANCE_DATA_MISSING',
  FINANCE_ANOMALY: 'FINANCE_ANOMALY',
  MULTI_ROOM: 'MULTI_ROOM',
  GUEST_NAME_MISSING: 'GUEST_NAME_MISSING',
  PAYMENT_TYPE_UNKNOWN: 'PAYMENT_TYPE_UNKNOWN',
  SUM_MISMATCH: 'SUM_MISMATCH',
  INITIAL_IMPORT: 'INITIAL_IMPORT',
} as const

/**
 * Extract commission from raw_message (OTA-specific nested data)
 * Channex stores original OTA booking data here which may contain commission info
 */
function extractCommissionFromRawMessage(rawMessage: any): { percent: number | null; source: string } {
  if (!rawMessage) return { percent: null, source: '' }
  
  // Helper to normalize percent value
  const normalizePercent = (val: unknown): number | null => {
    if (val === null || val === undefined) return null
    const num = typeof val === 'string' ? parseFloat(val) : (typeof val === 'number' ? val : null)
    if (num === null || isNaN(num)) return null
    if (num > 1 && num <= 100) return num / 100
    if (num > 0 && num <= 1) return num
    if (num === 0) return 0
    return null
  }
  
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
  
  // Priority 3: Search common paths for commission
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

/**
 * Parse OTA commission from Channex booking payload
 * Works for all OTAs: Booking.com, Expedia, Agoda, Airbnb, Traveloka, Trip.com
 * 
 * Commission sources (priority order):
 * 1. ota_commission (direct percent from OTA)
 * 2. commission (direct percent)
 * 3. commissions[] array (Booking.com specific - use first or weighted)
 * 4. commission_percent field (Expedia specific)
 * 5. agency_commission (some OTAs)
 * 6. rooms[].commission or rooms[].ota_commission
 * 7. raw_message (OTA-specific nested data) - IMPORTANT for many OTAs
 * 
 * Returns: { commissionPercent: number | null, commissionAmount: number | null, source: string | null }
 */
function parseOtaCommission(attrs: any, baseAmount: number): { 
  commissionPercent: number | null
  commissionAmount: number | null
  source: string | null
} {
  let commissionPercent: number | null = null
  let commissionAmount: number | null = null
  let source: string | null = null

  // Helper: normalize commission value to decimal (0.22 not 22)
  const normalizePercent = (val: unknown): number | null => {
    if (val === null || val === undefined) return null
    const num = typeof val === 'string' ? parseFloat(val) : (typeof val === 'number' ? val : null)
    if (num === null || isNaN(num)) return null
    // If value > 1 and <= 100, assume it's a percentage (22 -> 0.22)
    if (num > 1 && num <= 100) return num / 100
    // If value > 0 and <= 1, assume it's already decimal
    if (num > 0 && num <= 1) return num
    // If 0, return 0
    if (num === 0) return 0
    // Invalid range (negative or > 100)
    console.warn(`[COMMISSION] Invalid commission value: ${val}, skipping`)
    return null
  }

  // Priority 1: ota_commission (direct from OTA via Channex)
  if (attrs.ota_commission !== undefined) {
    const parsed = normalizePercent(attrs.ota_commission)
    if (parsed !== null) {
      commissionPercent = parsed
      source = 'ota_commission'
    }
  }

  // Priority 2: commission field (generic)
  if (commissionPercent === null && attrs.commission !== undefined) {
    // commission might be object like { percent: 0.15 } or direct value
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

  // Priority 3: commissions[] array (Booking.com specific)
  if (commissionPercent === null && Array.isArray(attrs.commissions) && attrs.commissions.length > 0) {
    // For now, use first commission entry's percent
    const firstCommission = attrs.commissions[0]
    const parsed = normalizePercent(firstCommission?.percent || firstCommission?.rate || firstCommission?.commission)
    if (parsed !== null) {
      commissionPercent = parsed
      source = 'commissions[0]'
    }
  }

  // Priority 4: commission_percent field (Expedia specific)
  if (commissionPercent === null && attrs.commission_percent !== undefined) {
    const parsed = normalizePercent(attrs.commission_percent)
    if (parsed !== null) {
      commissionPercent = parsed
      source = 'commission_percent'
    }
  }

  // Priority 5: agency_commission (some OTAs)
  if (commissionPercent === null && attrs.agency_commission !== undefined) {
    const parsed = normalizePercent(attrs.agency_commission)
    if (parsed !== null) {
      commissionPercent = parsed
      source = 'agency_commission'
    }
  }

  // Priority 6: Check in rooms array for commission
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

  // Priority 7: Search in raw_message (OTA-specific nested data)
  // This is CRITICAL for many OTAs like Booking.com, Expedia where commission is in raw payload
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

  // Calculate commission amount from percent and base amount
  if (commissionPercent !== null && baseAmount > 0) {
    // Round to integer for VND
    commissionAmount = Math.round(baseAmount * commissionPercent)
  }

  // Log for debugging (only if found)
  if (commissionPercent !== null) {
    console.log(`[COMMISSION] Parsed: ${(commissionPercent * 100).toFixed(2)}% from ${source}, amount: ${commissionAmount}`)
  }

  return { commissionPercent, commissionAmount, source }
}

interface BookingWarningRecord {
  unified_booking_id: string
  pms_booking_id: string
  warning_type: string
  warning_code: string
  message: string
  severity: string
  sync_run_id?: string
  metadata?: Record<string, unknown>
}

async function persistWarnings(supabase: any, warnings: BookingWarningRecord[]) {
  if (warnings.length === 0) return
  
  const { error } = await supabase
    .from('booking_warnings')
    .insert(warnings)
  
  if (error) {
    console.error('Error persisting warnings:', error)
  }
}

// ============================================
// CHANGE TRACKING
// ============================================

interface BookingChangeRecord {
  unified_booking_id: string
  pms_booking_id: string | null
  change_source: 'CHANNEX_SYNC' | 'CHANNEX_WEBHOOK' | 'MANUAL'
  change_type: 'INSERT' | 'UPDATE' | 'STATUS_CHANGE' | 'DATES_CHANGE' | 'AMOUNT_CHANGE'
  changed_fields: string[]
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  source_updated_at: string | null
  sync_run_id: string | null
}

function detectChangedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fieldsToCompare: string[]
): { changed: string[]; beforeValues: Record<string, unknown>; afterValues: Record<string, unknown> } {
  const changed: string[] = []
  const beforeValues: Record<string, unknown> = {}
  const afterValues: Record<string, unknown> = {}
  
  for (const field of fieldsToCompare) {
    const beforeVal = before[field]
    const afterVal = after[field]
    
    // Compare values (handle null vs undefined)
    const beforeStr = JSON.stringify(beforeVal ?? null)
    const afterStr = JSON.stringify(afterVal ?? null)
    
    if (beforeStr !== afterStr) {
      changed.push(field)
      beforeValues[field] = beforeVal
      afterValues[field] = afterVal
    }
  }
  
  return { changed, beforeValues, afterValues }
}

function determineChangeType(changedFields: string[]): BookingChangeRecord['change_type'] {
  if (changedFields.includes('booking_status')) return 'STATUS_CHANGE'
  if (changedFields.includes('check_in_date') || changedFields.includes('check_out_date') || changedFields.includes('nights')) return 'DATES_CHANGE'
  if (changedFields.includes('total_amount_gross') || changedFields.includes('total_amount_net')) return 'AMOUNT_CHANGE'
  return 'UPDATE'
}

async function recordBookingChange(supabase: any, change: BookingChangeRecord): Promise<void> {
  const { error } = await supabase
    .from('booking_changes')
    .insert({
      unified_booking_id: change.unified_booking_id,
      pms_booking_id: change.pms_booking_id,
      change_source: change.change_source,
      change_type: change.change_type,
      changed_fields: change.changed_fields,
      before_data: change.before_data,
      after_data: change.after_data,
      source_updated_at: change.source_updated_at,
      sync_run_id: change.sync_run_id,
    })
  
  if (error) {
    console.error('[Bookings Sync] Error recording booking change:', error)
  } else {
    console.log(`[Bookings Sync] Recorded ${change.change_type} for ${change.unified_booking_id}: ${change.changed_fields.join(', ')}`)
  }
}

// Fields to track for changes
const TRACKED_FIELDS = [
  'booking_status',
  'check_in_date',
  'check_out_date',
  'nights',
  'guest_name',
  'guest_email',
  'guest_phone',
  'room_type',
  'total_amount_gross',
  'total_amount_net',
  'commission_amount',
  'payment_type',
  'pms_property_name',
  'channex_revision_id',
  'channex_status',
]

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateUnifiedBookingId(channexBookingId: string, arrivalDate: string): string {
  const arrival = new Date(arrivalDate)
  const dateStr = arrival.toISOString().slice(2, 10).replace(/-/g, '')
  // Use last 12 characters of channex ID for uniqueness (UUID last segment is 12 chars)
  // This handles UUIDs like "02bf0598-be82-443b-9573-d362cabcfffa" -> "D362CABCFFFA"
  const shortId = channexBookingId.slice(-12).toUpperCase()
  return `OTA-${dateStr}-${shortId}`
}

function mapBookingStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'new': 'CONFIRMED',
    'confirmed': 'CONFIRMED',
    'modified': 'CONFIRMED',
    'checked_in': 'CONFIRMED',
    'cancelled': 'CANCELLED',
    'no_show': 'NO_SHOW',
    'checked_out': 'COMPLETED',
    'completed': 'COMPLETED',
  }
  return statusMap[status.toLowerCase()] || 'CONFIRMED'
}

function normalizeOtaSource(otaName: string | undefined): string {
  if (!otaName) return 'OTHER'
  const normalized = otaName.toLowerCase().trim()
  if (normalized.includes('agoda')) return 'AGODA'
  if (normalized.includes('booking.com') || normalized === 'booking') return 'BOOKING'
  if (normalized.includes('airbnb')) return 'AIRBNB'
  if (normalized.includes('expedia')) return 'EXPEDIA'
  if (normalized.includes('traveloka')) return 'TRAVELOKA'
  if (normalized.includes('ctrip') || normalized.includes('trip.com')) return 'CTRIP'
  if (normalized.includes('direct') || normalized.includes('website')) return 'DIRECT'
  if (normalized.includes('facebook') || normalized.includes('fb')) return 'FACEBOOK'
  return 'OTHER'
}

function calculateNights(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn)
  const end = new Date(checkOut)
  const diffTime = Math.abs(end.getTime() - start.getTime())
  const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return Math.max(nights, 1)
}

function extractPropertyId(booking: ChannexBooking): string | null {
  const attrs = booking.attributes
  if (booking.relationships?.property?.data?.id) {
    return booking.relationships.property.data.id
  }
  if (typeof attrs.property_id === 'string' && attrs.property_id) {
    return attrs.property_id
  }
  return null
}

/**
 * Extract OTA-specific property ID (numeric ID like "60723416" from Expedia)
 * This is different from Channex's internal UUID
 * Searches in multiple locations as Channex may nest the OTA property ID differently
 */
function extractOtaPropertyId(booking: ChannexBooking): string | null {
  const attrs = booking.attributes as any
  
  // Helper to check if value is numeric OTA ID (not UUID)
  const isOtaId = (val: unknown): val is string => {
    return typeof val === 'string' && val.length > 0 && !val.includes('-') && /^\d+$/.test(val)
  }
  
  // Priority 1: Direct property_id in attributes (if numeric)
  if (isOtaId(attrs.property_id)) {
    return attrs.property_id
  }
  
  // Priority 2: Check in raw/original booking data
  const rawData = attrs.raw || attrs.original_data || attrs.ota_data || attrs.source_data
  if (rawData && typeof rawData === 'object') {
    if (isOtaId(rawData.property_id)) return rawData.property_id
    if (isOtaId(rawData.hotel_id)) return rawData.hotel_id
    if (isOtaId(rawData.hotelId)) return rawData.hotelId
  }
  
  // Priority 3: Check in rooms array for property reference
  if (Array.isArray(attrs.rooms) && attrs.rooms.length > 0) {
    const room = attrs.rooms[0] as any
    if (isOtaId(room.property_id)) return room.property_id
    if (isOtaId(room.hotel_id)) return room.hotel_id
  }
  
  // Priority 4: Check meta or metadata
  const meta = attrs.meta || attrs.metadata
  if (meta && typeof meta === 'object') {
    if (isOtaId((meta as any).property_id)) return (meta as any).property_id
    if (isOtaId((meta as any).hotel_id)) return (meta as any).hotel_id
  }
  
  console.log(`[extractOtaPropertyId] Could not find OTA property ID. Available keys: ${Object.keys(attrs).join(', ')}`)
  
  return null
}

function extractPropertyName(booking: ChannexBooking, included: ChannexIncluded[] = []): string | null {
  const attrs = booking.attributes
  if (typeof attrs.property_name === 'string' && attrs.property_name) {
    return attrs.property_name
  }
  const propertyId = booking.relationships?.property?.data?.id
  if (propertyId && included.length > 0) {
    const property = included.find(inc => inc.id === propertyId && inc.type === 'property')
    if (property?.attributes?.title) return property.attributes.title
    if (property?.attributes?.name) return property.attributes.name
  }
  return null
}

function extractOtaBookingCode(booking: ChannexBooking): string | null {
  const attrs = booking.attributes
  if (attrs.unique_id) return attrs.unique_id
  if (attrs.ota_reservation_code) return attrs.ota_reservation_code
  return null
}

function extractRoomTypeFromRoom(room: Record<string, unknown>): string | null {
  const r = room as any
  return (
    (typeof r.room_type_title === 'string' && r.room_type_title) ||
    (typeof r.roomTypeTitle === 'string' && r.roomTypeTitle) ||
    (typeof r.room_type?.title === 'string' && r.room_type.title) ||
    (typeof r.room_type_name === 'string' && r.room_type_name) ||
    null
  )
}

function extractRoomTypeId(room: ChannexRoom): string | null {
  return room.room_type_id || null
}

function extractRatePlanFromRoom(room: Record<string, unknown>): string | null {
  const r = room as any
  return (
    (typeof r.rate_plan_title === 'string' && r.rate_plan_title) ||
    (typeof r.ratePlanTitle === 'string' && r.ratePlanTitle) ||
    (typeof r.rate_plan?.title === 'string' && r.rate_plan.title) ||
    (typeof r.rate_plan_name === 'string' && r.rate_plan_name) ||
    null
  )
}

function extractGuestName(booking: ChannexBooking): { name: string; warning: boolean } {
  const attrs = booking.attributes
  const firstRoom = attrs.rooms?.[0]
  const guest = firstRoom?.guests?.[0] || attrs.customer
  if (guest?.name) {
    const fullName = guest.surname 
      ? `${guest.name} ${guest.surname}`.trim()
      : guest.name.trim()
    if (fullName) return { name: fullName, warning: false }
  }
  return { name: 'Unknown Guest', warning: true }
}

function extractGuestContact(booking: ChannexBooking): { email: string | null; phone: string | null } {
  const attrs = booking.attributes
  const firstRoom = attrs.rooms?.[0]
  const guest = firstRoom?.guests?.[0] || attrs.customer
  return {
    email: guest?.email || guest?.mail || null,
    phone: guest?.phone || null,
  }
}

/** ISO Alpha-2 → Country name mapping for nationality */
const ALPHA2_TO_COUNTRY: Record<string, string> = {
  VN: 'Vietnam', KR: 'South Korea', CN: 'China', US: 'United States',
  SG: 'Singapore', TH: 'Thailand', JP: 'Japan', AU: 'Australia',
  GB: 'United Kingdom', FR: 'France', DE: 'Germany', IN: 'India',
  MY: 'Malaysia', ID: 'Indonesia', PH: 'Philippines', TW: 'Taiwan',
  HK: 'Hong Kong', CA: 'Canada', RU: 'Russia', IT: 'Italy',
  ES: 'Spain', NL: 'Netherlands', KH: 'Cambodia', LA: 'Laos',
  MM: 'Myanmar', NZ: 'New Zealand', SE: 'Sweden', NO: 'Norway',
  DK: 'Denmark', CH: 'Switzerland', BR: 'Brazil', MX: 'Mexico',
  AE: 'UAE', SA: 'Saudi Arabia', IL: 'Israel', ZA: 'South Africa',
  PL: 'Poland', CZ: 'Czech Republic', BE: 'Belgium', PT: 'Portugal',
  AT: 'Austria', FI: 'Finland', IE: 'Ireland', TR: 'Turkey',
  AR: 'Argentina', CO: 'Colombia', EG: 'Egypt', NG: 'Nigeria',
  BD: 'Bangladesh', PK: 'Pakistan', NP: 'Nepal', LK: 'Sri Lanka',
  MN: 'Mongolia', UA: 'Ukraine', RO: 'Romania', HU: 'Hungary',
  GR: 'Greece', HR: 'Croatia', SK: 'Slovakia', BG: 'Bulgaria',
  RS: 'Serbia', LT: 'Lithuania', LV: 'Latvia', EE: 'Estonia',
  SI: 'Slovenia', CL: 'Chile', PE: 'Peru', EC: 'Ecuador',
  UY: 'Uruguay', CR: 'Costa Rica', PA: 'Panama', DO: 'Dominican Republic',
  CU: 'Cuba', MA: 'Morocco', TN: 'Tunisia', KE: 'Kenya',
  TZ: 'Tanzania', GH: 'Ghana', ET: 'Ethiopia', QA: 'Qatar',
  KW: 'Kuwait', BH: 'Bahrain', OM: 'Oman', JO: 'Jordan',
  LB: 'Lebanon', IR: 'Iran', IQ: 'Iraq', AF: 'Afghanistan',
  UZ: 'Uzbekistan', KZ: 'Kazakhstan', GE: 'Georgia', AM: 'Armenia',
  AZ: 'Azerbaijan', BY: 'Belarus', MD: 'Moldova',
}

/**
 * Extract guest nationality/country from Channex booking.
 * Channex provides ISO Alpha-2 country code in customer.country field.
 * Returns human-readable country name for storage.
 */
function extractGuestNationality(booking: ChannexBooking): string | null {
  const attrs = booking.attributes
  const firstRoom = attrs.rooms?.[0]
  const guest = firstRoom?.guests?.[0] || attrs.customer
  
  if (!guest?.country) return null
  
  const code = guest.country.toUpperCase().trim()
  if (code.length !== 2) return guest.country // Return as-is if not Alpha-2
  
  return ALPHA2_TO_COUNTRY[code] || guest.country
}

function determinePaymentType(booking: ChannexBooking): { type: string; warning: string | null } {
  const attrs = booking.attributes
  const paymentCollect = attrs.payment_collect?.toLowerCase()
  const paymentType = attrs.payment_type?.toLowerCase()
  
  if (paymentCollect === 'ota' || paymentType === 'ota_collect') {
    return { type: 'OTA_COLLECT', warning: null }
  }
  if (paymentCollect === 'hotel' || paymentCollect === 'property' || paymentType === 'hotel_collect') {
    return { type: 'HOTEL_COLLECT', warning: null }
  }
  if (attrs.remittance || attrs.net_amount) {
    return { type: 'OTA_COLLECT', warning: null }
  }
  return { 
    type: 'OTA_COLLECT', 
    warning: 'payment_type not explicitly provided, defaulting to OTA_COLLECT' 
  }
}

/**
 * SOURCE OF TRUTH v2.0 - FINANCE LOGIC (ROOMRISE CHANNEX)
 * 
 * A) OTA_COLLECT:
 *    - Channex returns NET by default (already deducted commission)
 *    - If has remittance → NET = remittance_amount (priority)
 *    - Else → NET = channex_returned_amount (it's already net)
 *    - GROSS = 0 (don't guess if not provided)
 *    - Commission = 0 (don't guess if not provided)
 * 
 * B) HOTEL_COLLECT:
 *    - Revenue = Total Amount (guest pays at hotel)
 *    - GROSS = total_amount
 *    - NET = total_amount
 *    - Commission = 0
 * 
 * C) Initial Import:
 *    - All revenue = 0, needs manual override
 */
function calculateFinancials(booking: ChannexBooking, paymentType: string, isInitialImport: boolean = false): {
  gross: number
  net: number
  commission: number
  commissionRate: number
  warnings: string[]
} {
  const attrs = booking.attributes
  const warnings: string[] = []
  
  // Initial import: all revenue = 0, needs manual entry
  if (isInitialImport) {
    warnings.push('INITIAL_IMPORT_REVENUE_REQUIRED: Booking from initial import, requires manual revenue entry')
    return { gross: 0, net: 0, commission: 0, commissionRate: 0, warnings }
  }
  
  // Calculate total amount from rooms/services (this is the Channex-returned amount)
  let channexAmount = parseFloat(attrs.total_amount || attrs.amount || '0') || 0
  if (channexAmount === 0 && attrs.rooms?.length) {
    channexAmount = attrs.rooms.reduce((sum, room) => {
      const roomAmount = parseFloat(room.amount || '0') || 0
      return sum + roomAmount
    }, 0)
  }
  
  // Extract remittance - check multiple locations in Channex data
  let rawRemittance = 0
  const attrsAny = attrs as any
  
  // Debug: Log notes content for bookings (where remittance might be)
  const bookingCode = attrsAny.ota_reservation_code || attrsAny.unique_id || booking.id
  if (attrsAny.notes) {
    console.log(`[calculateFinancials] Booking ${bookingCode} - notes: ${JSON.stringify(attrsAny.notes).substring(0, 500)}`)
  }
  
  // Priority 1: Parse from notes array (Channex stores special_requests here with remittance text)
  if (rawRemittance === 0 && attrsAny.notes) {
    const notes = attrsAny.notes
    if (Array.isArray(notes)) {
      for (const note of notes) {
        const text = typeof note === 'string' ? note : (note?.text || note?.content || note?.message)
        if (typeof text === 'string' && text.toLowerCase().includes('remittance')) {
          const match = text.match(/remittance[^:]*:\s*([\d,\.]+)/i)
          if (match) {
            rawRemittance = parseFloat(match[1].replace(/,/g, '')) || 0
            if (rawRemittance > 0) {
              console.log(`[calculateFinancials] Parsed remittance from notes: ${rawRemittance}`)
              break
            }
          }
        }
      }
    } else if (typeof notes === 'string' && notes.toLowerCase().includes('remittance')) {
      const match = notes.match(/remittance[^:]*:\s*([\d,\.]+)/i)
      if (match) {
        rawRemittance = parseFloat(match[1].replace(/,/g, '')) || 0
        if (rawRemittance > 0) {
          console.log(`[calculateFinancials] Parsed remittance from notes string: ${rawRemittance}`)
        }
      }
    }
  }
  
  // Priority 2: Direct remittance field in attrs
  if (rawRemittance === 0) {
    const remittanceData = attrsAny.remittance
    if (typeof remittanceData === 'string') {
      rawRemittance = parseFloat(remittanceData) || 0
    } else if (typeof remittanceData === 'object' && remittanceData !== null) {
      rawRemittance = parseFloat(remittanceData.amount || '0') || 0
    }
  }
  
  // Priority 3: Parse from remarks array
  if (rawRemittance === 0 && attrsAny.remarks) {
    const remarks = attrsAny.remarks
    if (Array.isArray(remarks)) {
      for (const remark of remarks) {
        const text = typeof remark === 'string' ? remark : remark?.text
        if (typeof text === 'string' && text.toLowerCase().includes('remittance')) {
          const match = text.match(/remittance[^:]*:\s*([\d,\.]+)/i)
          if (match) {
            rawRemittance = parseFloat(match[1].replace(/,/g, '')) || 0
            if (rawRemittance > 0) {
              console.log(`[calculateFinancials] Parsed remittance from remarks: ${rawRemittance}`)
              break
            }
          }
        }
      }
    }
  }
  
  // Priority 5: Fallback to net_amount field in attrs
  if (rawRemittance === 0) {
    rawRemittance = parseFloat(attrs.net_amount || '0') || 0
  }
  
  // HOTEL_COLLECT: revenue = total_amount (guest pays at hotel)
  if (paymentType === 'HOTEL_COLLECT') {
    if (channexAmount === 0) {
      warnings.push('HOTEL_COLLECT_TOTAL_ONLY: Total amount is 0')
    }
    
    // Parse commission from OTA data for HOTEL_COLLECT bookings
    // This is important for fee calculation - OTA still charges commission even though hotel collects
    const commissionData = parseOtaCommission(attrsAny, channexAmount)
    let commissionAmount = 0
    let commissionRate = 0
    
    if (commissionData.commissionPercent !== null) {
      commissionRate = commissionData.commissionPercent * 100 // Store as percentage (22.0)
      commissionAmount = commissionData.commissionAmount || 0
      console.log(`[HOTEL_COLLECT] Commission parsed: ${commissionRate}% = ${commissionAmount} from ${commissionData.source}`)
    }
    
    return { 
      gross: channexAmount, 
      net: channexAmount, 
      commission: commissionAmount, 
      commissionRate: commissionRate, 
      warnings 
    }
  }
  
  // OTA_COLLECT: Channex returns NET by default (already deducted commission)
  let net = 0
  let commission = 0
  let commissionRate = 0
  
  if (rawRemittance > 0) {
    // Has remittance - use it as NET (highest priority)
    net = rawRemittance
    // For OTA_COLLECT, commission might be in remittance.commission (amount) or parse from percent
    const remittanceCommission = parseFloat((attrsAny.remittance as any)?.commission || '0') || 0
    if (remittanceCommission > 0) {
      commission = remittanceCommission
      // Try to calculate rate from gross if available
      if (channexAmount > 0 && remittanceCommission > 0) {
        commissionRate = (remittanceCommission / channexAmount) * 100
      }
    } else {
      // Fallback to parsing commission percent
      const commissionData = parseOtaCommission(attrsAny, channexAmount)
      if (commissionData.commissionPercent !== null) {
        commissionRate = commissionData.commissionPercent * 100
        commission = commissionData.commissionAmount || 0
      }
    }
  } else {
    // No remittance - Channex amount is already NET
    net = channexAmount
    if (channexAmount > 0) {
      warnings.push('OTA_COLLECT_NET_ONLY: No remittance data, using Channex amount as NET')
    }
  }
  
  if (net === 0) {
    warnings.push('FINANCE_DATA_MISSING: NET amount is 0')
  }
  
  // Don't guess gross - set to 0 if not explicitly provided by Channex
  return { 
    gross: 0, // Don't guess gross
    net, 
    commission, 
    commissionRate, 
    warnings 
  }
}

function generateLineKey(bookingId: string, room: ChannexRoom, index: number): string {
  const roomId = room.id || room.reservation_room_id || room.room_reservation_id
  if (roomId) return roomId
  return `${bookingId}:${index}`
}

function extractRoomGuest(room: ChannexRoom): { name: string | null; email: string | null; phone: string | null } {
  const guest = room.guests?.[0]
  if (!guest) return { name: null, email: null, phone: null }
  const name = guest.surname 
    ? `${guest.name} ${guest.surname}`.trim()
    : guest.name?.trim() || null
  return { name, email: guest.email || null, phone: guest.phone || null }
}

// ============================================
// MAIN HANDLER
// ============================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const startTime = Date.now()
  let syncRunId: string | null = null

  try {
    const channexApiKey = Deno.env.get('CHANNEX_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!channexApiKey) throw new Error('CHANNEX_API_KEY not configured')
    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase configuration missing')

    // In-code JWT validation (verify_jwt=false in config.toml)
    // Allow service_role key OR valid user JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ code: 401, message: 'Missing Authorization header' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const token = authHeader.replace('Bearer ', '')
    const apikeyHeader = req.headers.get('apikey')
    const isServiceRole = token === supabaseServiceKey || apikeyHeader === supabaseServiceKey

    if (!isServiceRole) {
      // Validate user JWT
      const authClient = createClient(supabaseUrl, supabaseAnonKey!, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data, error: authError } = await authClient.auth.getUser(token)
      if (authError || !data?.user) {
        console.error('[Bookings Sync] JWT validation failed:', authError?.message)
        return new Response(JSON.stringify({ code: 401, message: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      console.log(`[Bookings Sync] Authenticated user: ${data.user.id}`)
    } else {
      console.log('[Bookings Sync] Service role authentication')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body
    let filters: Record<string, string> = {}
    let isInitialImport = false
    let forceUpdate = false
    let runType = 'MANUAL'
    let since: string | null = null
    let groupIds: string[] = []
    let propertyIds: string[] = []
    let mode: 'bulk' | 'single_booking' = 'bulk'
    let singleBookingId: string | null = null
    
    try {
      const body = await req.json()
      filters = body.filters || {}
      isInitialImport = body.initial_import === true
      forceUpdate = body.force_update === true
      runType = body.run_type || 'MANUAL'
      since = body.since || null
      mode = body.mode === 'single_booking' ? 'single_booking' : 'bulk'
      singleBookingId = body.booking_id || null
      
      // Support direct top-level params (in addition to filters object)
      if (body.arrival_date_gte) filters.arrival_date_gte = body.arrival_date_gte
      if (body.arrival_date_lte) filters.arrival_date_lte = body.arrival_date_lte
      if (body.sync_all) filters.sync_all = String(body.sync_all)
      if (body.limit) filters.limit = String(body.limit)
      if (body.page) filters.page = String(body.page)
      if (body.property_id) filters.property_id = body.property_id
      
      // Support property_ids array (for batch sync)
      if (body.property_ids && Array.isArray(body.property_ids)) {
        propertyIds = body.property_ids
      }
      
      // Support single group_id or array of group_ids
      if (body.group_id) {
        groupIds = Array.isArray(body.group_id) ? body.group_id : [body.group_id]
      }
      if (body.group_ids) {
        groupIds = Array.isArray(body.group_ids) ? body.group_ids : [body.group_ids]
      }
    } catch {
      // No body provided
    }

    // If group_ids provided, get property IDs from those groups
    let groupPropertyIds: string[] = []
    if (groupIds.length > 0) {
      console.log(`[Bookings Sync] Filtering by group IDs: ${groupIds.join(', ')}`)
      
      const { data: propertyLinks, error: linkError } = await supabase
        .from('channex_property_groups')
        .select('channex_property_id')
        .in('channex_group_id', groupIds)
      
      if (linkError) {
        console.error('[Bookings Sync] Error fetching group properties:', linkError)
      } else if (propertyLinks && propertyLinks.length > 0) {
        groupPropertyIds = propertyLinks.map(link => link.channex_property_id)
        console.log(`[Bookings Sync] Found ${groupPropertyIds.length} properties in groups: ${groupPropertyIds.join(', ')}`)
      } else {
        console.log('[Bookings Sync] No properties found in specified groups')
        return new Response(
          JSON.stringify({
            success: true,
            message: 'No properties found in specified groups',
            results: { total: 0, inserted: 0, updated: 0 }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Get since from sync_state if not provided
    if (!since && !filters.arrival_date_gte) {
      const { data: syncState } = await supabase
        .from('sync_state')
        .select('value_json')
        .eq('key', 'channex_bookings_last_synced_at')
        .maybeSingle()
      
      if (syncState?.value_json?.timestamp) {
        since = syncState.value_json.timestamp
        console.log(`[Bookings Sync] Using since from sync_state: ${since}`)
      } else {
        // Default to 30 days ago
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        since = thirtyDaysAgo.toISOString()
        console.log(`[Bookings Sync] No sync_state found, defaulting to 30 days ago: ${since}`)
      }
    }

    // Create sync run record
    const { data: syncRun, error: syncRunError } = await supabase
      .from('sync_runs')
      .insert({
        provider: 'channex',
        run_type: runType,
        entity: 'BOOKINGS',
        status: 'RUNNING',
        since: since,
      })
      .select('id')
      .single()

    if (syncRunError) {
      console.error('Failed to create sync run:', syncRunError)
    } else {
      syncRunId = syncRun.id
    }

    console.log(`[Bookings Sync] Starting sync run: ${syncRunId}`)

    // Pagination support for full sync
    const syncAllPages = filters.sync_all === 'true' || forceUpdate
    const limit = parseInt(filters.limit || '100', 10)
    let currentPage = parseInt(filters.page || '1', 10)
    let hasMorePages = true
    let allBookings: ChannexBooking[] = []
    let allIncluded: ChannexIncluded[] = []
    let apiMeta: { page: number; limit: number; total: number } | null = null

    // Determine which property IDs to fetch
    // Priority: 1) direct property_ids array, 2) group-based property IDs, 3) single property_id filter, 4) all properties
    const propertyIdsToFetch = propertyIds.length > 0 
      ? propertyIds 
      : (groupPropertyIds.length > 0 
        ? groupPropertyIds 
        : (filters.property_id ? [filters.property_id] : [null])) // null means fetch all

    // Fast path for retry/reconciliation: fetch exactly one booking by booking_id
    if (mode === 'single_booking' && singleBookingId) {
      const singleBookingUrl = new URL(`https://app.channex.io/api/v1/bookings/${singleBookingId}`)
      singleBookingUrl.searchParams.set('include', 'property,rooms')

      console.log(`[Bookings Sync] Single-booking mode for ${singleBookingId}`)

      const singleResponse = await fetch(singleBookingUrl.toString(), {
        method: 'GET',
        headers: {
          'user-api-key': channexApiKey,
          'Content-Type': 'application/json',
        },
      })

      if (!singleResponse.ok) {
        const errorText = await singleResponse.text()
        throw new Error(`Channex API error (single_booking): ${singleResponse.status} - ${errorText}`)
      }

      const singleData = await singleResponse.json()
      if (!singleData?.data?.id) {
        throw new Error(`Booking not found in Channex for booking_id=${singleBookingId}`)
      }

      allBookings = [singleData.data]
      allIncluded = singleData.included || []
      apiMeta = { page: 1, limit: 1, total: 1 }
    } else {
      for (const propertyId of propertyIdsToFetch) {
        currentPage = 1
        hasMorePages = true

        while (hasMorePages) {
          // Build Channex API URL
          const channexUrl = new URL('https://app.channex.io/api/v1/bookings')
          channexUrl.searchParams.set('pagination[page]', String(currentPage))
          channexUrl.searchParams.set('pagination[limit]', String(limit))
          // When using arrival_date filter, sort by arrival_date to avoid missing older inserted_at records.
          if (filters.arrival_date_gte) {
            channexUrl.searchParams.set('order[arrival_date]', 'asc')
          } else {
            channexUrl.searchParams.set('order[inserted_at]', 'desc')
          }
          channexUrl.searchParams.set('include', 'property,rooms')

          if (propertyId) {
            channexUrl.searchParams.set('filter[property_id]', propertyId)
          }
          if (filters.arrival_date_gte) {
            channexUrl.searchParams.set('filter[arrival_date][gte]', filters.arrival_date_gte)
          }

          console.log(`[Bookings Sync] Fetching page ${currentPage}${propertyId ? ` for property ${propertyId}` : ''} from Channex:`, channexUrl.toString())

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

          const channexData: ChannexResponse = await channexResponse.json()
          const pageBookings = channexData.data || []
          console.log(`[Bookings Sync] Page ${currentPage}: Received ${pageBookings.length} bookings (total in API: ${channexData.meta?.total || 'unknown'})`)

          allBookings = [...allBookings, ...pageBookings]
          if (channexData.included) {
            allIncluded = [...allIncluded, ...channexData.included]
          }
          if (!apiMeta && channexData.meta) {
            apiMeta = channexData.meta
          }

          // Check if we should fetch more pages
          if (syncAllPages) {
            const totalFromApi = channexData.meta?.total ?? null
            const totalPages = totalFromApi ? Math.ceil(totalFromApi / limit) : null
            const MAX_PAGES = 200

            if (totalPages) {
              if (currentPage < Math.min(totalPages, MAX_PAGES)) {
                currentPage++
                hasMorePages = true
              } else {
                if (totalPages > MAX_PAGES) {
                  console.log(`[Bookings Sync] Reached MAX_PAGES (${MAX_PAGES}) while API indicates ${totalPages} pages; stopping pagination to stay safe.`)
                }
                hasMorePages = false
              }
            } else {
              // Fallback when meta.total is missing: keep paginating while we receive full pages
              if (pageBookings.length === limit && currentPage < MAX_PAGES) {
                currentPage++
                hasMorePages = true
              } else {
                hasMorePages = false
              }
            }
          } else {
            hasMorePages = false
          }
        }
      }
    }

    console.log(`[Bookings Sync] Total bookings to process: ${allBookings.length}`)

    const results = {
      total: allBookings.length,
      inserted: 0,
      updated: 0,
      skipped_older: 0,
      skipped_date_filter: 0,
      skipped_unchanged: 0,
      pending_mapping: 0,
      roomLinesInserted: 0,
      roomLinesDeleted: 0,
      errors: [] as string[],
      warnings: [] as SyncWarning[],
    }

    let maxUpdatedAt: string | null = null

    // Process each booking
    for (const booking of allBookings) {
      try {
        const attrs = booking.attributes
        const bookingWarnings: string[] = []

        // Enforce arrival_date_gte (check-in cutoff) at processing level too.
        // This prevents importing older stays that were updated recently.
        if (filters.arrival_date_gte && attrs.arrival_date < filters.arrival_date_gte) {
          results.skipped_date_filter++
          continue
        }
        
        const providerBookingId = booking.id
        const sourceUpdatedAt = attrs.updated_at || attrs.inserted_at || null
        const channexPropertyId = extractPropertyId(booking)
        const channexRoomTypeId = attrs.rooms?.[0] ? extractRoomTypeId(attrs.rooms[0]) : null

        // Track max updated_at for sync_state
        if (sourceUpdatedAt) {
          if (!maxUpdatedAt || sourceUpdatedAt > maxUpdatedAt) {
            maxUpdatedAt = sourceUpdatedAt
          }
        }

        // Check if booking already exists (idempotency check)
        // Fetch ALL tracked fields for change comparison
        const selectFields = ['id', 'unified_booking_id', 'source_updated_at', ...TRACKED_FIELDS].join(', ')
        const { data: existing, error: existingError } = await supabase
          .from('bookings_mirror')
          .select(selectFields)
          .eq('provider', 'channex')
          .eq('provider_booking_id', providerBookingId)
          .maybeSingle()

        // Fallback: check by pms_booking_id for backwards compatibility
        let existingRecord: Record<string, any> | null = existingError ? null : existing
        if (!existingRecord) {
          const { data: legacyExisting, error: legacyError } = await supabase
            .from('bookings_mirror')
            .select(selectFields)
            .eq('pms_booking_id', providerBookingId)
            .maybeSingle()
          existingRecord = legacyError ? null : legacyExisting
        }

        // Out-of-order guard (skip if force_update is enabled)
        // Also check revision_id - if it changed, process even if source_updated_at is same
        const incomingRevisionId = attrs.revision_id || null
        const existingRevisionId = existingRecord?.channex_revision_id || null
        const revisionChanged = incomingRevisionId && existingRevisionId && incomingRevisionId !== existingRevisionId
        
        // Log when revision change is detected
        if (revisionChanged) {
          console.log(`[Bookings Sync] Revision changed for booking ${booking.id}: ${existingRevisionId} -> ${incomingRevisionId} (status: ${attrs.status})`)
        }
        
        if (!forceUpdate && existingRecord && !revisionChanged && sourceUpdatedAt && existingRecord.source_updated_at) {
          const incomingDate = new Date(sourceUpdatedAt)
          const currentDate = new Date(existingRecord.source_updated_at)
          if (incomingDate <= currentDate) {
            results.skipped_older++
            continue
          }
        }

        // Check mapping status and get first_synced_at for initial import detection
        // IMPORTANT: Booking should be MAPPED if property exists in channex_mappings
        // internal_property_id is optional - admin maps later in Channex Integration page
        // PENDING_MAPPING only when NO property record exists at all
        let mappingStatus = 'MAPPED'
        let propertyFirstSyncedAt: string | null = null
        if (channexPropertyId) {
          // First check property-level mapping
          const { data: propertyMapping } = await supabase
            .from('channex_mappings')
            .select('status, internal_property_id, first_synced_at')
            .eq('channex_property_id', channexPropertyId)
            .is('channex_room_type_id', null)
            .maybeSingle()
          
          // Also check room-type-level mapping if room type exists
          let roomTypeMapping = null
          if (channexRoomTypeId) {
            const { data: rtMapping } = await supabase
              .from('channex_mappings')
              .select('status, internal_property_id, first_synced_at')
              .eq('channex_property_id', channexPropertyId)
              .eq('channex_room_type_id', channexRoomTypeId)
              .maybeSingle()
            roomTypeMapping = rtMapping
          }
          
          // Use the best available mapping
          const bestMapping = roomTypeMapping || propertyMapping
          
          if (!bestMapping) {
            // No mapping record exists at all - create one automatically
            mappingStatus = 'PENDING_MAPPING'
            results.pending_mapping++
            
            // Auto-create property mapping for unknown property
            const { error: autoCreateError } = await supabase
              .from('channex_mappings')
              .insert({
                channex_property_id: channexPropertyId,
                channex_room_type_id: null,
                property_name: extractPropertyName(booking, allIncluded) || 'Unknown Property',
                status: 'PENDING',
                first_synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
            if (autoCreateError && !autoCreateError.message?.includes('duplicate')) {
              console.error(`[Bookings Sync] Failed to auto-create mapping for ${channexPropertyId}:`, autoCreateError)
            } else {
              console.log(`[Bookings Sync] Auto-created property mapping for ${channexPropertyId}`)
            }
          } else {
            // Mapping exists - booking is MAPPED regardless of internal_property_id
            // internal_property_id is for HOST assignment, not for booking validity
            mappingStatus = 'MAPPED'
          }
          propertyFirstSyncedAt = bestMapping?.first_synced_at || propertyMapping?.first_synced_at || null
        } else {
          // No channex_property_id at all - this is an error case
          mappingStatus = 'PENDING_MAPPING'
          results.pending_mapping++
          console.warn(`[Bookings Sync] Booking ${booking.id} has no channex_property_id`)
        }

        // Determine if this is an imported booking from OTA
        // Check if "Imported Booking" appears in the notes field from Channex
        const bookingNotes = attrs.notes || ''
        const isImportedBooking = /imported\s*booking/i.test(bookingNotes)
        
        if (isImportedBooking) {
          console.log(`[Bookings Sync] Booking ${providerBookingId} detected as IMPORTED from notes`)
        }

        // Extract guest info
        const guestInfo = extractGuestName(booking)
        if (guestInfo.warning) {
          bookingWarnings.push('guest_name not available, using "Unknown Guest"')
        }
        
        const contactInfo = extractGuestContact(booking)
        const guestNationality = extractGuestNationality(booking)
        const paymentTypeResult = determinePaymentType(booking)
        if (paymentTypeResult.warning) {
          bookingWarnings.push(paymentTypeResult.warning)
        }
        
        // Calculate financials with imported booking detection
        const financials = calculateFinancials(booking, paymentTypeResult.type, isImportedBooking)
        bookingWarnings.push(...financials.warnings)
        
        const finalGross = financials.gross
        const finalNet = financials.net
        const finalCommission = financials.commission
        const finalCommissionRate = financials.commissionRate

        const unifiedBookingId = existingRecord?.unified_booking_id || 
          generateUnifiedBookingId(booking.id, attrs.arrival_date)

        const roomsCount = attrs.rooms?.length || 0
        if (roomsCount > 1) {
          bookingWarnings.push(`Multi-room booking with ${roomsCount} rooms`)
        }

        // Lookup property_name from properties_mirror
        let propertyName: string | null = null
        if (channexPropertyId) {
          const { data: propertyData } = await supabase
            .from('properties_mirror')
            .select('property_name')
            .eq('provider_property_id', channexPropertyId)
            .maybeSingle()
          propertyName = propertyData?.property_name || null
        }
        // Fallback to extractPropertyName if not found in mirror
        if (!propertyName) {
          propertyName = extractPropertyName(booking, allIncluded)
        }

        // Lookup channex_user_id from channex_user_properties
        let channexUserId: string | null = null
        if (channexPropertyId) {
          const { data: userPropertyData } = await supabase
            .from('channex_user_properties')
            .select('channex_user_id')
            .eq('channex_property_id', channexPropertyId)
            .maybeSingle()
          channexUserId = userPropertyData?.channex_user_id || null
          if (channexUserId) {
            console.log(`[Bookings Sync] Linked booking to Channex user: ${channexUserId}`)
          }
        }

        // Lookup room_type from room_types_mirror
        let roomTypeName: string | null = null
        if (channexRoomTypeId) {
          const { data: roomTypeData } = await supabase
            .from('room_types_mirror')
            .select('room_type_name')
            .eq('provider_room_type_id', channexRoomTypeId)
            .maybeSingle()
          roomTypeName = roomTypeData?.room_type_name || null
        }
        // Fallback to extractRoomTypeFromRoom if not found in mirror
        if (!roomTypeName) {
          roomTypeName = extractRoomTypeFromRoom((attrs.rooms?.[0] as any) || {}) || null
        }

        // Extract OTA-specific IDs from raw booking data
        // The raw data might have numeric booking_id like "1679390099" (OTA reservation number)
        // and property_id that's numeric like "60723416" (Expedia hotel ID)
        const rawBookingId = (attrs as any).booking_id || null
        const otaPropertyId = extractOtaPropertyId(booking)

        const bookingData = {
          provider: 'channex',
          provider_booking_id: providerBookingId,
          source_updated_at: sourceUpdatedAt,
          channex_property_id: channexPropertyId,
          channex_room_type_id: channexRoomTypeId,
          channex_user_id: channexUserId, // Link to Channex user who owns this property
          mapping_status: mappingStatus,
          pms_booking_id: booking.id,
          unified_booking_id: unifiedBookingId,
          ota_booking_code: extractOtaBookingCode(booking) || rawBookingId,
          ota_source: normalizeOtaSource(attrs.ota_name),
          booking_status: mapBookingStatus(attrs.status),
          booking_date: attrs.inserted_at?.split('T')[0] || null,
          check_in_date: attrs.arrival_date,
          check_out_date: attrs.departure_date,
          nights: calculateNights(attrs.arrival_date, attrs.departure_date),
          guest_name: guestInfo.name,
          guest_email: contactInfo.email,
          guest_phone: contactInfo.phone,
          nationality: guestNationality,
          room_type: roomTypeName,
          total_amount_gross: finalGross,
          total_amount_net: finalNet,
          commission_rate: finalCommissionRate,
          commission_amount: finalCommission,
          payment_type: paymentTypeResult.type,
          pms_property_id: channexPropertyId,
          pms_property_name: propertyName,
          ota_property_id: otaPropertyId, // OTA's actual property ID (e.g., "60723416")
          booking_type: isImportedBooking ? 'IMPORTED' : 'SYNCED', // Track imported bookings from OTA (detected from notes)
          channex_revision_id: attrs.revision_id || null, // Track revision for modification detection
          channex_status: attrs.status || null, // Raw Channex status (new, modified, cancelled, etc.)
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        // Persist warnings to database (SOURCE OF TRUTH v1.0 X)
        if (bookingWarnings.length > 0) {
          const warningRecords: BookingWarningRecord[] = bookingWarnings.map(warningMsg => {
            // Determine warning code from message
            let warningCode = 'DATA_QUALITY'
            if (warningMsg.includes('HOTEL_COLLECT_NET_ESTIMATED')) warningCode = WARNING_CODES.HOTEL_COLLECT_NET_ESTIMATED_FROM_OTA
            else if (warningMsg.includes('OTA_COLLECT_NO_REMITTANCE')) warningCode = WARNING_CODES.OTA_COLLECT_NO_REMITTANCE
            else if (warningMsg.includes('FINANCE_DATA_MISSING') || warningMsg.includes('gross amount is 0')) warningCode = WARNING_CODES.FINANCE_DATA_MISSING
            else if (warningMsg.includes('FINANCE_ANOMALY')) warningCode = WARNING_CODES.FINANCE_ANOMALY
            else if (warningMsg.includes('Multi-room')) warningCode = WARNING_CODES.MULTI_ROOM
            else if (warningMsg.includes('guest_name') || warningMsg.includes('Unknown Guest')) warningCode = WARNING_CODES.GUEST_NAME_MISSING
            else if (warningMsg.includes('payment_type')) warningCode = WARNING_CODES.PAYMENT_TYPE_UNKNOWN
            else if (warningMsg.includes('Initial import')) warningCode = WARNING_CODES.INITIAL_IMPORT
            
            return {
              unified_booking_id: unifiedBookingId,
              pms_booking_id: booking.id,
              warning_type: 'data_quality',
              warning_code: warningCode,
              message: warningMsg,
              severity: warningCode === WARNING_CODES.MULTI_ROOM ? 'INFO' : 'WARNING',
              sync_run_id: syncRunId || undefined,
            }
          })
          
          await persistWarnings(supabase, warningRecords)
          
          results.warnings.push({
            booking_id: booking.id,
            type: 'data_quality',
            message: bookingWarnings.join('; '),
          })
        }

        // UPSERT booking with change tracking
        if (existingRecord) {
          // Detect changes before updating
          const { changed, beforeValues, afterValues } = detectChangedFields(
            existingRecord as Record<string, unknown>,
            bookingData as Record<string, unknown>,
            TRACKED_FIELDS
          )
          
          const { error: updateError } = await supabase
            .from('bookings_mirror')
            .update(bookingData)
            .eq('id', existingRecord.id)

          if (updateError) {
            console.error('[Bookings Sync] Update error:', booking.id, updateError)
            results.errors.push(`Update failed for ${booking.id}: ${updateError.message}`)
            continue
          } else {
            results.updated++
            
            // Record change if there were actual changes
            if (changed.length > 0) {
              await recordBookingChange(supabase, {
                unified_booking_id: unifiedBookingId,
                pms_booking_id: booking.id,
                change_source: 'CHANNEX_SYNC',
                change_type: determineChangeType(changed),
                changed_fields: changed,
                before_data: beforeValues,
                after_data: afterValues,
                source_updated_at: sourceUpdatedAt,
                sync_run_id: syncRunId,
              })
            }
          }
        } else {
          const { error: insertError } = await supabase
            .from('bookings_mirror')
            .insert(bookingData)

          if (insertError) {
            console.error('[Bookings Sync] Insert error:', booking.id, insertError)
            results.errors.push(`Insert failed for ${booking.id}: ${insertError.message}`)
            continue
          } else {
            results.inserted++
            
            // Record INSERT change
            await recordBookingChange(supabase, {
              unified_booking_id: unifiedBookingId,
              pms_booking_id: booking.id,
              change_source: 'CHANNEX_SYNC',
              change_type: 'INSERT',
              changed_fields: TRACKED_FIELDS,
              before_data: null,
              after_data: {
                booking_status: bookingData.booking_status,
                check_in_date: bookingData.check_in_date,
                check_out_date: bookingData.check_out_date,
                nights: bookingData.nights,
                guest_name: bookingData.guest_name,
                total_amount_net: bookingData.total_amount_net,
                payment_type: bookingData.payment_type,
                pms_property_name: bookingData.pms_property_name,
              },
              source_updated_at: sourceUpdatedAt,
              sync_run_id: syncRunId,
            })
          }
        }

        // Sync room lines (replace strategy)
        const { data: deletedLines } = await supabase
          .from('booking_room_lines_mirror')
          .delete()
          .eq('pms_booking_id', booking.id)
          .select('id')

        results.roomLinesDeleted += deletedLines?.length || 0

        if (attrs.rooms && attrs.rooms.length > 0) {
          const roomLines = attrs.rooms.map((room: ChannexRoom, index: number) => {
            const roomGuest = extractRoomGuest(room)
            const roomCheckIn = room.checkin_date || attrs.arrival_date
            const roomCheckOut = room.checkout_date || attrs.departure_date
            const roomNights = room.nights ?? calculateNights(roomCheckIn, roomCheckOut)

            return {
              pms_booking_id: booking.id,
              line_key: generateLineKey(booking.id, room, index),
              line_index: index,
              room_type: extractRoomTypeFromRoom(room as any),
              rate_plan: extractRatePlanFromRoom(room as any),
              check_in_date: roomCheckIn,
              check_out_date: roomCheckOut,
              nights: roomNights,
              amount: parseFloat(room.amount || '0') || null,
              guest_name: roomGuest.name,
              guest_email: roomGuest.email,
              guest_phone: roomGuest.phone,
              synced_at: new Date().toISOString(),
            }
          })

          const { error: insertLinesError } = await supabase
            .from('booking_room_lines_mirror')
            .insert(roomLines)

          if (insertLinesError) {
            results.errors.push(`Insert room lines failed for ${booking.id}: ${insertLinesError.message}`)
          } else {
            results.roomLinesInserted += roomLines.length
          }
        }

      } catch (bookingError: unknown) {
        const errorMessage = bookingError instanceof Error ? bookingError.message : String(bookingError)
        console.error('[Bookings Sync] Error processing booking:', booking.id, bookingError)
        results.errors.push(`Processing failed for ${booking.id}: ${errorMessage}`)
      }
    }

    // Update sync_state with max updated_at
    const syncTimestamp = maxUpdatedAt || new Date().toISOString()
    await supabase
      .from('sync_state')
      .upsert({
        key: 'channex_bookings_last_synced_at',
        value_json: { timestamp: syncTimestamp },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })

    // Update sync run
    if (syncRunId) {
      await supabase
        .from('sync_runs')
        .update({
          status: 'SUCCESS',
          ended_at: new Date().toISOString(),
          counts: results,
        })
        .eq('id', syncRunId)
    }

    const duration = Date.now() - startTime
    console.log(`[Bookings Sync] Completed in ${duration}ms:`, results)

    return new Response(
      JSON.stringify({
        success: true,
        sync_run_id: syncRunId,
        duration_ms: duration,
        message: `Synced ${results.inserted} new, ${results.updated} updated, ${results.skipped_older} skipped (older). Pending mapping: ${results.pending_mapping}`,
        results,
        meta: apiMeta,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[Bookings Sync] Error:', error)

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
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})