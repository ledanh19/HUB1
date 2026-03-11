import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * BACKFILL SPECIFIC BOOKINGS
 * 
 * An toan tuyet doi - chi INSERT booking moi, khong UPDATE existing
 * Khong trigger logic khac (import, cashflow, notification)
 * 
 * Usage:
 * POST /backfill-specific-bookings
 * {
 *   "ota_booking_codes": ["423963843", "1689542861", "1658798354"],
 *   "dry_run": true,  // Default true for safety
 *   "force_update": false  // Set true to update existing bookings with missing data
 * }
 * 
 * Or by date range:
 * {
 *   "since": "2026-01-16",
 *   "until": "2026-01-21",
 *   "dry_run": false,
 *   "force_update": false
 * }
 */

interface BackfillResult {
  mode: "by_codes" | "by_date_range";
  dry_run: boolean;
  force_update: boolean;
  total_requested: number;
  already_exists: number;
  updated: number;
  fetched_from_channex: number;
  inserted: number;
  skipped: number;
  errors: string[];
  details: BackfillDetail[];
}

interface BackfillDetail {
  ota_booking_code: string;
  channex_id: string | null;
  guest_name: string | null;
  check_in: string | null;
  ota_source: string | null;
  status: "ALREADY_EXISTS" | "INSERTED" | "UPDATED" | "NOT_FOUND" | "ERROR" | "DRY_RUN" | "DRY_RUN_UPDATE";
  message: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("=== Backfill Specific Bookings Started ===");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const channexApiKey = Deno.env.get("CHANNEX_API_KEY");

    if (!channexApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "CHANNEX_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse parameters
    let params: {
      ota_booking_codes?: string[];
      since?: string;
      until?: string;
      dry_run?: boolean;
      force_update?: boolean;
    } = {};

    if (req.method === "POST") {
      try {
        params = await req.json();
      } catch {
        params = {};
      }
    }

    // Safety: Default dry_run = true, force_update = false
    const dryRun = params.dry_run !== false;
    const forceUpdate = params.force_update === true;
    const otaBookingCodes = params.ota_booking_codes || [];
    const since = params.since;
    const until = params.until;

    const result: BackfillResult = {
      mode: otaBookingCodes.length > 0 ? "by_codes" : "by_date_range",
      dry_run: dryRun,
      force_update: forceUpdate,
      total_requested: 0,
      already_exists: 0,
      updated: 0,
      fetched_from_channex: 0,
      inserted: 0,
      skipped: 0,
      errors: [],
      details: [],
    };

    if (otaBookingCodes.length === 0 && !since) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Cần cung cấp ota_booking_codes[] hoặc since/until date range" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Backfill] Mode: ${result.mode}, Dry run: ${dryRun}, Force update: ${forceUpdate}`);
    console.log(`[Backfill] OTA codes: ${otaBookingCodes.length > 0 ? otaBookingCodes.join(', ') : 'N/A'}`);
    console.log(`[Backfill] Date range: ${since || 'N/A'} to ${until || 'N/A'}`);

    // MODE 1: By specific OTA booking codes
    if (otaBookingCodes.length > 0) {
      result.total_requested = otaBookingCodes.length;

      for (const otaCode of otaBookingCodes) {
        try {
          // Step 1: Check if already exists in bookings_mirror
          const { data: existing } = await supabase
            .from("bookings_mirror")
            .select("unified_booking_id, guest_name, ota_booking_code, ota_property_id, room_type, total_amount_net")
            .or(`ota_booking_code.eq.${otaCode},ota_booking_code.ilike.%-${otaCode}`)
            .maybeSingle();

          if (existing && !forceUpdate) {
            result.already_exists++;
            result.details.push({
              ota_booking_code: otaCode,
              channex_id: null,
              guest_name: existing.guest_name,
              check_in: null,
              ota_source: null,
              status: "ALREADY_EXISTS",
              message: `Đã tồn tại: ${existing.unified_booking_id}`,
            });
            console.log(`[Backfill] ${otaCode}: Already exists as ${existing.unified_booking_id}`);
            continue;
          }

          // If force_update mode, we need to fetch from Channex and update missing data
          const needsUpdate = existing && forceUpdate;

          // Step 2: Search in Channex by OTA reservation code
          const searchResult = await searchChannexByOtaCode(channexApiKey, otaCode);

          if (!searchResult.found) {
            result.skipped++;
            result.details.push({
              ota_booking_code: otaCode,
              channex_id: null,
              guest_name: null,
              check_in: null,
              ota_source: null,
              status: "NOT_FOUND",
              message: searchResult.message,
            });
            console.log(`[Backfill] ${otaCode}: Not found in Channex`);
            continue;
          }

          result.fetched_from_channex++;

          // Step 3: Insert or Update booking
          if (dryRun) {
            result.details.push({
              ota_booking_code: otaCode,
              channex_id: searchResult.booking!.id,
              guest_name: searchResult.booking!.guest_name,
              check_in: searchResult.booking!.check_in_date,
              ota_source: searchResult.booking!.ota_source,
              status: needsUpdate ? "DRY_RUN_UPDATE" : "DRY_RUN",
              message: needsUpdate 
                ? `Sẽ cập nhật ${existing.unified_booking_id} nếu dry_run=false`
                : "Sẽ insert nếu dry_run=false",
            });
            console.log(`[Backfill] ${otaCode}: Found, would ${needsUpdate ? 'update' : 'insert'} (dry run)`);
          } else if (needsUpdate) {
            // Update existing booking with missing data
            const updateResult = await updateBookingMissingData(supabase, existing.unified_booking_id, searchResult.booking!);
            
            if (updateResult.success) {
              result.updated++;
              result.details.push({
                ota_booking_code: otaCode,
                channex_id: searchResult.booking!.id,
                guest_name: searchResult.booking!.guest_name,
                check_in: searchResult.booking!.check_in_date,
                ota_source: searchResult.booking!.ota_source,
                status: "UPDATED",
                message: `Đã cập nhật: ${existing.unified_booking_id}`,
              });
              console.log(`[Backfill] ${otaCode}: Updated ${existing.unified_booking_id}`);
            } else {
              result.errors.push(`${otaCode}: ${updateResult.error}`);
              result.details.push({
                ota_booking_code: otaCode,
                channex_id: searchResult.booking!.id,
                guest_name: searchResult.booking!.guest_name,
                check_in: searchResult.booking!.check_in_date,
                ota_source: searchResult.booking!.ota_source,
                status: "ERROR",
                message: updateResult.error || "Unknown error",
              });
            }
          } else {
            const insertResult = await insertBookingToMirror(supabase, searchResult.booking!);
            
            if (insertResult.success) {
              result.inserted++;
              result.details.push({
                ota_booking_code: otaCode,
                channex_id: searchResult.booking!.id,
                guest_name: searchResult.booking!.guest_name,
                check_in: searchResult.booking!.check_in_date,
                ota_source: searchResult.booking!.ota_source,
                status: "INSERTED",
                message: `Đã insert: ${insertResult.unified_booking_id}`,
              });
              console.log(`[Backfill] ${otaCode}: Inserted as ${insertResult.unified_booking_id}`);
            } else {
              result.errors.push(`${otaCode}: ${insertResult.error}`);
              result.details.push({
                ota_booking_code: otaCode,
                channex_id: searchResult.booking!.id,
                guest_name: searchResult.booking!.guest_name,
                check_in: searchResult.booking!.check_in_date,
                ota_source: searchResult.booking!.ota_source,
                status: "ERROR",
                message: insertResult.error || "Unknown error",
              });
            }
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));

        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          result.errors.push(`${otaCode}: ${errorMessage}`);
          result.details.push({
            ota_booking_code: otaCode,
            channex_id: null,
            guest_name: null,
            check_in: null,
            ota_source: null,
            status: "ERROR",
            message: errorMessage,
          });
        }
      }
    }

    // MODE 2: By date range - fetch from Channex and insert missing
    else if (since) {
      const untilDate = until || new Date().toISOString().slice(0, 10);
      console.log(`[Backfill] Fetching Channex bookings from ${since} to ${untilDate}...`);

      // Get all active properties
      const { data: properties } = await supabase
        .from("channex_user_properties")
        .select("channex_property_id")
        .eq("property_status", "active");

      const propertyIds = (properties || []).map(p => p.channex_property_id);
      console.log(`[Backfill] Found ${propertyIds.length} active properties`);

      // Fetch from Channex
      const channexBookings: Map<string, any> = new Map();
      
      for (const propertyId of propertyIds) {
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= 50) {
          const channexUrl = new URL("https://app.channex.io/api/v1/bookings");
          channexUrl.searchParams.set("pagination[page]", String(page));
          channexUrl.searchParams.set("pagination[limit]", "100");
          channexUrl.searchParams.set("filter[property_id]", propertyId);
          channexUrl.searchParams.set("filter[arrival_date][gte]", since);
          channexUrl.searchParams.set("filter[arrival_date][lte]", untilDate);

          const response = await fetch(channexUrl.toString(), {
            headers: {
              "user-api-key": channexApiKey,
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) break;

          const data = await response.json();
          const bookings = data.data || [];

          for (const booking of bookings) {
            channexBookings.set(booking.id, booking);
          }

          if (bookings.length < 100) {
            hasMore = false;
          } else {
            page++;
          }

          await new Promise(resolve => setTimeout(resolve, 150));
        }
      }

      console.log(`[Backfill] Found ${channexBookings.size} bookings in Channex for date range`);
      result.total_requested = channexBookings.size;

      // Check which ones are missing
      const channexIds = Array.from(channexBookings.keys());
      const { data: existingBookings } = await supabase
        .from("bookings_mirror")
        .select("provider_booking_id")
        .eq("provider", "channex")
        .in("provider_booking_id", channexIds);

      const existingSet = new Set((existingBookings || []).map(b => b.provider_booking_id));
      result.already_exists = existingSet.size;

      // Insert missing bookings
      for (const [channexId, rawBooking] of channexBookings.entries()) {
        if (existingSet.has(channexId)) continue;

        const parsedBooking = parseChannexBooking(rawBooking);
        result.fetched_from_channex++;

        if (dryRun) {
          result.details.push({
            ota_booking_code: parsedBooking.ota_booking_code || channexId,
            channex_id: channexId,
            guest_name: parsedBooking.guest_name,
            check_in: parsedBooking.check_in_date,
            ota_source: parsedBooking.ota_source,
            status: "DRY_RUN",
            message: "Sẽ insert nếu dry_run=false",
          });
        } else {
          const insertResult = await insertBookingToMirror(supabase, parsedBooking);
          
          if (insertResult.success) {
            result.inserted++;
            result.details.push({
              ota_booking_code: parsedBooking.ota_booking_code || channexId,
              channex_id: channexId,
              guest_name: parsedBooking.guest_name,
              check_in: parsedBooking.check_in_date,
              ota_source: parsedBooking.ota_source,
              status: "INSERTED",
              message: `Đã insert: ${insertResult.unified_booking_id}`,
            });
          } else {
            result.errors.push(`${channexId}: ${insertResult.error}`);
          }
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`[Backfill] Complete. Inserted: ${result.inserted}, Errors: ${result.errors.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        result,
        message: dryRun
          ? `DRY RUN: Tìm thấy ${result.fetched_from_channex} booking thiếu trong ${result.total_requested} được yêu cầu`
          : `Đã insert ${result.inserted} booking mới, ${result.errors.length} lỗi`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Backfill] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Search Channex API by OTA reservation code
 */
async function searchChannexByOtaCode(
  apiKey: string,
  otaCode: string
): Promise<{ found: boolean; booking?: any; message: string }> {
  try {
    // Search using ota_reservation_code filter
    const searchUrl = new URL("https://app.channex.io/api/v1/bookings");
    searchUrl.searchParams.set("filter[ota_reservation_code]", otaCode);
    searchUrl.searchParams.set("pagination[limit]", "10");

    const response = await fetch(searchUrl.toString(), {
      headers: {
        "user-api-key": apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return { found: false, message: `Channex API error: ${response.status}` };
    }

    const data = await response.json();
    const bookings = data.data || [];

    if (bookings.length === 0) {
      return { found: false, message: "Không tìm thấy trong Channex" };
    }

    // Return first match (should be exact match)
    const booking = bookings[0];
    return {
      found: true,
      booking: parseChannexBooking(booking),
      message: "Found",
    };

  } catch (err) {
    return { 
      found: false, 
      message: `Search error: ${err instanceof Error ? err.message : "Unknown"}` 
    };
  }
}

/**
 * Parse Channex booking to our format
 */
function parseChannexBooking(rawBooking: any): any {
  const attrs = rawBooking.attributes || rawBooking;
  const rooms = attrs.rooms || [];
  const firstRoom = rooms[0] || {};
  const guest = firstRoom.guests?.[0] || attrs.customer || {};

  const checkInDate = attrs.arrival_date || firstRoom.checkin_date;
  const checkOutDate = attrs.departure_date || firstRoom.checkout_date;

  const nights = checkInDate && checkOutDate
    ? Math.ceil((new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) / (1000 * 60 * 60 * 24))
    : 1;

  // Normalize OTA source
  const otaName = attrs.ota_name || "Direct";
  const normalizedOta = normalizeOtaSource(otaName);

  // Determine booking status
  let bookingStatus = "CONFIRMED";
  const rawStatus = (attrs.status || "").toLowerCase();
  if (rawStatus.includes("cancel")) bookingStatus = "CANCELLED";
  else if (rawStatus.includes("no_show") || rawStatus.includes("noshow")) bookingStatus = "NO_SHOW";

  // Determine payment type - must match enum: HOTEL_COLLECT, OTA_COLLECT
  let paymentType = "HOTEL_COLLECT"; // Default to hotel collect
  const paymentCollect = typeof attrs.payment_collect === 'string' 
    ? attrs.payment_collect 
    : attrs.payment_collect?.type;
  
  if (paymentCollect) {
    const pc = paymentCollect.toLowerCase();
    if (pc.includes("ota") || pc.includes("channel")) paymentType = "OTA_COLLECT";
    else if (pc.includes("property") || pc.includes("hotel")) paymentType = "HOTEL_COLLECT";
  }

  const propertyId = attrs.property_id || 
    rawBooking.relationships?.property?.data?.id ||
    attrs.property?.id;

  // Extract OTA property ID (can be hotel_id, property_code, etc.)
  const otaPropertyId = attrs.ota_hotel_id || 
    attrs.ota_property_id || 
    attrs.hotel_id ||
    null;

  // Extract room type ID from Channex
  const channexRoomTypeId = firstRoom.room_type_id || 
    rawBooking.relationships?.room_type?.data?.id ||
    null;

  // Calculate amounts - Channex provides total amount, commission rate
  const totalAmountGross = parseFloat(attrs.amount || "0") || 0;
  
  // Commission rate from Channex (can be in different fields)
  let commissionRate = 0;
  if (attrs.commission_percent) {
    commissionRate = parseFloat(attrs.commission_percent) || 0;
  } else if (attrs.commission) {
    // Sometimes commission is already an amount, calculate rate
    const commAmount = parseFloat(attrs.commission) || 0;
    if (totalAmountGross > 0 && commAmount > 0) {
      commissionRate = (commAmount / totalAmountGross) * 100;
    }
  }

  // Calculate commission amount and net amount
  const commissionAmount = totalAmountGross * (commissionRate / 100);
  const totalAmountNet = totalAmountGross - commissionAmount;

  return {
    id: rawBooking.id,
    provider: "channex",
    provider_booking_id: rawBooking.id,
    channex_property_id: propertyId,
    channex_revision_id: attrs.revision_id || null,
    channex_room_type_id: channexRoomTypeId,
    channex_status: attrs.status || null,
    ota_source: normalizedOta,
    ota_booking_code: attrs.ota_reservation_code || null,
    ota_property_id: otaPropertyId,
    guest_name: guest.name || attrs.customer?.name || "Unknown Guest",
    guest_email: guest.email || attrs.customer?.email || null,
    guest_phone: guest.phone || attrs.customer?.phone || null,
    check_in_date: checkInDate,
    check_out_date: checkOutDate,
    nights,
    room_type: firstRoom.room_type_name || null,
    total_amount_gross: totalAmountGross || null,
    total_amount_net: totalAmountNet || null,
    commission_amount: commissionAmount || null,
    commission_rate: commissionRate || null,
    booking_status: bookingStatus,
    payment_type: paymentType,
    booking_date: attrs.inserted_at ? new Date(attrs.inserted_at).toISOString().slice(0, 10) : null,
    source_updated_at: attrs.updated_at || null,
  };
}

function normalizeOtaSource(otaName: string): string {
  const normalized = otaName?.toLowerCase() || "";
  if (normalized.includes("booking")) return "Booking.com";
  if (normalized.includes("agoda")) return "Agoda";
  if (normalized.includes("expedia")) return "Expedia";
  if (normalized.includes("airbnb")) return "Airbnb";
  if (normalized.includes("traveloka")) return "Traveloka";
  if (normalized.includes("trip") || normalized.includes("ctrip")) return "Trip.com";
  return otaName || "Direct";
}

/**
 * Insert booking to bookings_mirror - ONLY INSERT, NO UPDATE
 */
async function insertBookingToMirror(
  supabase: any,
  booking: any
): Promise<{ success: boolean; unified_booking_id?: string; error?: string }> {
  try {
    const unifiedBookingId = `CHX-${booking.provider_booking_id.slice(0, 8)}`;

    // Check property mapping
    let pmsPropertyId = null;
    if (booking.channex_property_id) {
      const { data: mapping } = await supabase
        .from("channex_mappings")
        .select("internal_property_id, status")
        .eq("channex_property_id", booking.channex_property_id)
        .maybeSingle();

      if (mapping?.status === "MAPPED" && mapping.internal_property_id) {
        pmsPropertyId = mapping.internal_property_id;
      }
    }

    const bookingData = {
      unified_booking_id: unifiedBookingId,
      provider: booking.provider,
      provider_booking_id: booking.provider_booking_id,
      channex_property_id: booking.channex_property_id,
      channex_revision_id: booking.channex_revision_id,
      channex_room_type_id: booking.channex_room_type_id,
      channex_status: booking.channex_status,
      pms_property_id: pmsPropertyId,
      ota_source: booking.ota_source,
      ota_booking_code: booking.ota_booking_code,
      ota_property_id: booking.ota_property_id,
      guest_name: booking.guest_name,
      guest_email: booking.guest_email,
      guest_phone: booking.guest_phone,
      check_in_date: booking.check_in_date,
      check_out_date: booking.check_out_date,
      nights: booking.nights,
      room_type: booking.room_type,
      total_amount_gross: booking.total_amount_gross,
      total_amount_net: booking.total_amount_net,
      commission_amount: booking.commission_amount,
      commission_rate: booking.commission_rate,
      booking_status: booking.booking_status,
      payment_type: booking.payment_type,
      booking_date: booking.booking_date,
      source_updated_at: booking.source_updated_at,
      synced_at: new Date().toISOString(),
      mapping_status: pmsPropertyId ? "MAPPED" : "UNMAPPED",
    };

    // INSERT with ON CONFLICT DO NOTHING
    const { error } = await supabase
      .from("bookings_mirror")
      .insert(bookingData)
      .select()
      .single();

    if (error) {
      // Check if it's a duplicate key error (already exists)
      if (error.code === "23505") {
        return { success: true, unified_booking_id: unifiedBookingId };
      }
      return { success: false, error: error.message };
    }

    return { success: true, unified_booking_id: unifiedBookingId };

  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : "Unknown error" 
    };
  }
}

/**
 * Update existing booking with missing data from Channex
 * Only updates fields that are null/missing
 */
async function updateBookingMissingData(
  supabase: any,
  unifiedBookingId: string,
  booking: any
): Promise<{ success: boolean; error?: string }> {
  try {
    // Build update object with only non-null values from Channex
    const updateData: Record<string, any> = {};

    // Only update if we have data and field might be missing
    if (booking.ota_property_id) updateData.ota_property_id = booking.ota_property_id;
    if (booking.channex_room_type_id) updateData.channex_room_type_id = booking.channex_room_type_id;
    if (booking.total_amount_net != null) updateData.total_amount_net = booking.total_amount_net;
    if (booking.commission_amount != null) updateData.commission_amount = booking.commission_amount;
    if (booking.commission_rate != null) updateData.commission_rate = booking.commission_rate;
    if (booking.channex_revision_id) updateData.channex_revision_id = booking.channex_revision_id;

    // Lookup room_type from channex_mappings if we have channex_room_type_id
    if (booking.channex_room_type_id && !booking.room_type) {
      const { data: roomMapping } = await supabase
        .from("channex_mappings")
        .select("room_type_name")
        .eq("channex_room_type_id", booking.channex_room_type_id)
        .maybeSingle();
      
      if (roomMapping?.room_type_name) {
        updateData.room_type = roomMapping.room_type_name;
      }
    } else if (booking.room_type) {
      updateData.room_type = booking.room_type;
    }

    // Always update synced_at
    updateData.updated_at = new Date().toISOString();

    if (Object.keys(updateData).length === 1) {
      // Only updated_at, nothing else to update
      return { success: true };
    }

    console.log(`[Backfill] Updating ${unifiedBookingId} with:`, JSON.stringify(updateData));

    const { error } = await supabase
      .from("bookings_mirror")
      .update(updateData)
      .eq("unified_booking_id", unifiedBookingId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };

  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : "Unknown error" 
    };
  }
}
