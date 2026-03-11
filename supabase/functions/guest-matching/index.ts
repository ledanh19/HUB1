import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =============================================
// NORMALIZATION FUNCTIONS
// =============================================

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.toLowerCase().trim();
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  // Remove all non-digit characters except leading +
  let normalized = phone.replace(/[^\d+]/g, "");
  // Ensure starts with + if international
  if (normalized.startsWith("84") && !normalized.startsWith("+")) {
    normalized = "+" + normalized;
  }
  // Handle Vietnamese numbers starting with 0
  if (normalized.startsWith("0")) {
    normalized = "+84" + normalized.substring(1);
  }
  return normalized.length >= 9 ? normalized : null;
}

function normalizeName(name: string | null | undefined): string | null {
  if (!name) return null;
  // Remove Vietnamese diacritics
  const withoutDiacritics = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
  return withoutDiacritics.toLowerCase().trim().replace(/\s+/g, " ");
}

// =============================================
// PROXY PHONE DETECTION
// =============================================

// Known proxy/virtual phone patterns for OTAs
const PROXY_PHONE_PATTERNS = [
  /^\+1800/, // Toll-free
  /^\+1900/, // Toll-free
  /^\+84283/, // Agoda Vietnam virtual
  /^\+6562/, // Agoda Singapore
  /^\+65319/, // Booking.com Singapore
  /^\+442/, // UK virtual
];

// Phones seen too many times are likely proxies
const MAX_PHONE_OCCURRENCES = 5;

function isProxyPhone(
  phone: string | null,
  sourceName: string,
  existingPhoneCounts: Map<string, number>
): boolean {
  if (!phone) return false;

  const normalized = normalizePhone(phone);
  if (!normalized) return false;

  // Check known patterns
  for (const pattern of PROXY_PHONE_PATTERNS) {
    if (pattern.test(normalized)) {
      console.log(`[PROXY] Phone ${normalized} matches proxy pattern`);
      return true;
    }
  }

  // Agoda often uses proxy phones
  if (sourceName === "AGODA") {
    // Check if this phone has been used too many times
    const count = existingPhoneCounts.get(normalized) || 0;
    if (count >= MAX_PHONE_OCCURRENCES) {
      console.log(`[PROXY] Phone ${normalized} used ${count} times in Agoda - likely proxy`);
      return true;
    }
  }

  return false;
}

// =============================================
// MATCHING PIPELINE
// =============================================

interface BookingGuestData {
  unified_booking_id: string;
  guest_name: string;
  guest_email?: string | null;
  guest_phone?: string | null;
  ota_source: string;
  source_guest_key?: string | null;
}

interface MatchResult {
  guest_id: string;
  match_method: "SOURCE_KEY" | "EMAIL" | "REAL_PHONE" | "MANUAL" | "CREATED_NEW";
  confidence: "LOW" | "MED" | "HIGH";
  is_new_guest: boolean;
}

async function matchOrCreateGuest(
  supabase: any,
  booking: BookingGuestData
): Promise<MatchResult> {
  const emailNorm = normalizeEmail(booking.guest_email);
  const phoneNorm = normalizePhone(booking.guest_phone);
  const nameNorm = normalizeName(booking.guest_name);

  console.log(`[MATCH] Processing booking ${booking.unified_booking_id}`);
  console.log(`[MATCH] Name: ${booking.guest_name} -> ${nameNorm}`);
  console.log(`[MATCH] Email: ${booking.guest_email} -> ${emailNorm}`);
  console.log(`[MATCH] Phone: ${booking.guest_phone} -> ${phoneNorm}`);
  console.log(`[MATCH] Source: ${booking.ota_source}, Key: ${booking.source_guest_key}`);

  // Get phone usage counts for proxy detection
  const { data: phoneCounts } = await supabase
    .from("guest_identities")
    .select("phone_norm")
    .eq("source_name", booking.ota_source)
    .not("phone_norm", "is", null);

  const phoneCountMap = new Map<string, number>();
  phoneCounts?.forEach((row: { phone_norm: string }) => {
    const count = phoneCountMap.get(row.phone_norm) || 0;
    phoneCountMap.set(row.phone_norm, count + 1);
  });

  const phoneIsProxy = isProxyPhone(phoneNorm, booking.ota_source, phoneCountMap);
  console.log(`[MATCH] Phone is proxy: ${phoneIsProxy}`);

  // =============================================
  // STEP 1: Try SOURCE_KEY match (HIGH confidence)
  // =============================================
  if (booking.source_guest_key) {
    console.log(`[MATCH] Step 1: Trying SOURCE_KEY match...`);
    const { data: keyMatch } = await supabase
      .from("guest_identities")
      .select("guest_id")
      .eq("source_name", booking.ota_source)
      .eq("source_guest_key", booking.source_guest_key)
      .limit(1)
      .single();

    if (keyMatch) {
      console.log(`[MATCH] ✓ Found by SOURCE_KEY: ${keyMatch.guest_id}`);
      return {
        guest_id: keyMatch.guest_id,
        match_method: "SOURCE_KEY",
        confidence: "HIGH",
        is_new_guest: false,
      };
    }
  }

  // =============================================
  // STEP 2: Try EMAIL match (HIGH confidence)
  // =============================================
  if (emailNorm) {
    console.log(`[MATCH] Step 2: Trying EMAIL match...`);
    const { data: emailMatch } = await supabase
      .from("guests")
      .select("id")
      .eq("primary_email", emailNorm)
      .limit(1)
      .single();

    if (emailMatch) {
      console.log(`[MATCH] ✓ Found by EMAIL: ${emailMatch.id}`);
      return {
        guest_id: emailMatch.id,
        match_method: "EMAIL",
        confidence: "HIGH",
        is_new_guest: false,
      };
    }
  }

  // =============================================
  // STEP 3: Try REAL_PHONE match (MED confidence)
  // =============================================
  if (phoneNorm && !phoneIsProxy) {
    console.log(`[MATCH] Step 3: Trying REAL_PHONE match...`);
    const { data: phoneMatch } = await supabase
      .from("guests")
      .select("id")
      .eq("primary_phone", phoneNorm)
      .limit(1)
      .single();

    if (phoneMatch) {
      console.log(`[MATCH] ✓ Found by REAL_PHONE: ${phoneMatch.id}`);
      return {
        guest_id: phoneMatch.id,
        match_method: "REAL_PHONE",
        confidence: "MED",
        is_new_guest: false,
      };
    }
  }

  // =============================================
  // STEP 4: CREATE NEW GUEST (LOW confidence)
  // =============================================
  console.log(`[MATCH] Step 4: Creating new guest...`);

  // Determine initial confidence based on available data
  let initialConfidence: "LOW" | "MED" | "HIGH" = "LOW";
  if (emailNorm) {
    initialConfidence = "MED";
  }
  if (emailNorm && phoneNorm && !phoneIsProxy) {
    initialConfidence = "HIGH";
  }

  const { data: newGuest, error: createError } = await supabase
    .from("guests")
    .insert({
      full_name: booking.guest_name,
      primary_email: emailNorm,
      primary_phone: phoneIsProxy ? null : phoneNorm,
      confidence_level: initialConfidence,
    })
    .select("id")
    .single();

  if (createError) {
    console.error(`[MATCH] Error creating guest:`, createError);
    throw new Error(`Failed to create guest: ${createError.message}`);
  }

  console.log(`[MATCH] ✓ Created new guest: ${newGuest.id} with confidence ${initialConfidence}`);

  return {
    guest_id: newGuest.id,
    match_method: "CREATED_NEW",
    confidence: initialConfidence,
    is_new_guest: true,
  };
}

async function createGuestIdentity(
  supabase: any,
  guestId: string,
  booking: BookingGuestData
): Promise<void> {
  const emailNorm = normalizeEmail(booking.guest_email);
  const phoneNorm = normalizePhone(booking.guest_phone);
  const nameNorm = normalizeName(booking.guest_name);

  // Get phone usage for proxy detection
  const { data: phoneCounts } = await supabase
    .from("guest_identities")
    .select("phone_norm")
    .eq("source_name", booking.ota_source)
    .not("phone_norm", "is", null);

  const phoneCountMap = new Map<string, number>();
  phoneCounts?.forEach((row: { phone_norm: string }) => {
    const count = phoneCountMap.get(row.phone_norm) || 0;
    phoneCountMap.set(row.phone_norm, count + 1);
  });

  const phoneIsProxy = isProxyPhone(phoneNorm, booking.ota_source, phoneCountMap);

  // Determine source type
  const sourceType = ["AGODA", "BOOKING", "EXPEDIA", "TRAVELOKA", "CTRIP", "TRIP"].includes(
    booking.ota_source
  )
    ? "OTA"
    : booking.ota_source === "WALKIN" || booking.ota_source === "DIRECT"
    ? "MANUAL"
    : "OTA";

  // Check if identity already exists
  const { data: existing } = await supabase
    .from("guest_identities")
    .select("id")
    .eq("guest_id", guestId)
    .eq("source_name", booking.ota_source)
    .eq("source_guest_key", booking.source_guest_key || null)
    .limit(1)
    .single();

  if (existing) {
    console.log(`[IDENTITY] Identity already exists for guest ${guestId}`);
    return;
  }

  const { error } = await supabase.from("guest_identities").insert({
    guest_id: guestId,
    source_type: sourceType,
    source_name: booking.ota_source,
    source_guest_key: booking.source_guest_key || null,
    email_raw: booking.guest_email,
    email_norm: emailNorm,
    phone_raw: booking.guest_phone,
    phone_norm: phoneNorm,
    phone_is_proxy: phoneIsProxy,
    name_raw: booking.guest_name,
    name_norm: nameNorm,
  });

  if (error) {
    console.error(`[IDENTITY] Error creating identity:`, error);
    throw new Error(`Failed to create guest identity: ${error.message}`);
  }

  console.log(`[IDENTITY] Created identity for guest ${guestId}`);
}

async function linkBookingToGuest(
  supabase: any,
  bookingId: string,
  guestId: string,
  matchMethod: MatchResult["match_method"],
  confidence: MatchResult["confidence"]
): Promise<void> {
  // Check if link already exists
  const { data: existing } = await supabase
    .from("booking_guest_links")
    .select("id")
    .eq("unified_booking_id", bookingId)
    .eq("role", "PRIMARY")
    .limit(1)
    .single();

  if (existing) {
    // Update existing link
    const { error } = await supabase
      .from("booking_guest_links")
      .update({
        guest_id: guestId,
        match_method: matchMethod,
        confidence: confidence,
        matched_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) {
      console.error(`[LINK] Error updating link:`, error);
      throw new Error(`Failed to update booking link: ${error.message}`);
    }
    console.log(`[LINK] Updated booking link ${existing.id}`);
    return;
  }

  // Create new link
  const { error } = await supabase.from("booking_guest_links").insert({
    unified_booking_id: bookingId,
    guest_id: guestId,
    role: "PRIMARY",
    match_method: matchMethod,
    confidence: confidence,
  });

  if (error) {
    console.error(`[LINK] Error creating link:`, error);
    throw new Error(`Failed to create booking link: ${error.message}`);
  }
  console.log(`[LINK] Created booking link for ${bookingId} -> ${guestId}`);
}

async function suggestMergeIfSimilar(
  supabase: any,
  newGuestId: string,
  booking: BookingGuestData
): Promise<void> {
  const nameNorm = normalizeName(booking.guest_name);
  if (!nameNorm) return;

  // Find guests with similar names
  const { data: similarGuests } = await supabase
    .from("guests")
    .select("id, full_name")
    .neq("id", newGuestId)
    .limit(100);

  if (!similarGuests || similarGuests.length === 0) return;

  for (const guest of similarGuests) {
    const existingNameNorm = normalizeName(guest.full_name);
    if (!existingNameNorm) continue;

    // Simple similarity check - exact normalized name match
    if (existingNameNorm === nameNorm) {
      console.log(`[SUGGEST] Found similar guest: ${guest.id} (${guest.full_name})`);

      // Check if suggestion already exists
      const { data: existingSuggestion } = await supabase
        .from("guest_merge_suggestions")
        .select("id")
        .or(
          `and(source_guest_id.eq.${newGuestId},target_guest_id.eq.${guest.id}),and(source_guest_id.eq.${guest.id},target_guest_id.eq.${newGuestId})`
        )
        .limit(1)
        .single();

      if (existingSuggestion) continue;

      await supabase.from("guest_merge_suggestions").insert({
        source_guest_id: newGuestId,
        target_guest_id: guest.id,
        suggestion_reason: `Same normalized name: "${nameNorm}"`,
        confidence_score: 0.6,
      });

      console.log(`[SUGGEST] Created merge suggestion: ${newGuestId} -> ${guest.id}`);
    }
  }
}

// =============================================
// MAIN HANDLER
// =============================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action, booking, bookings } = body;

    console.log(`[GUEST-MATCHING] Action: ${action}`);

    if (action === "match_single") {
      // Match a single booking
      if (!booking) {
        throw new Error("Missing booking data");
      }

      const result = await matchOrCreateGuest(supabase, booking);
      await createGuestIdentity(supabase, result.guest_id, booking);
      await linkBookingToGuest(
        supabase,
        booking.unified_booking_id,
        result.guest_id,
        result.match_method,
        result.confidence
      );

      // If new guest, check for merge suggestions
      if (result.is_new_guest) {
        await suggestMergeIfSimilar(supabase, result.guest_id, booking);
      }

      return new Response(
        JSON.stringify({
          success: true,
          result,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "match_batch") {
      // Match multiple bookings
      if (!bookings || !Array.isArray(bookings)) {
        throw new Error("Missing bookings array");
      }

      const results = [];
      for (const booking of bookings) {
        try {
          const result = await matchOrCreateGuest(supabase, booking);
          await createGuestIdentity(supabase, result.guest_id, booking);
          await linkBookingToGuest(
            supabase,
            booking.unified_booking_id,
            result.guest_id,
            result.match_method,
            result.confidence
          );

          if (result.is_new_guest) {
            await suggestMergeIfSimilar(supabase, result.guest_id, booking);
          }

          results.push({ booking_id: booking.unified_booking_id, ...result });
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(`[BATCH] Error for ${booking.unified_booking_id}:`, err);
          results.push({
            booking_id: booking.unified_booking_id,
            error: errorMessage,
          });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          results,
          processed: results.filter((r) => !r.error).length,
          errors: results.filter((r) => r.error).length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "sync_all_existing") {
      // First, get all booking IDs that already have guest links
      const { data: linkedBookingIds, error: linkError } = await supabase
        .from("booking_guest_links")
        .select("unified_booking_id");

      if (linkError) {
        throw new Error(`Failed to fetch linked bookings: ${linkError.message}`);
      }

      const linkedIds = (linkedBookingIds || []).map((l: { unified_booking_id: string }) => l.unified_booking_id);
      console.log(`[SYNC] Found ${linkedIds.length} already linked bookings`);

      // Then fetch bookings that are NOT in the linked list
      let query = supabase
        .from("bookings_mirror")
        .select("unified_booking_id, guest_name, guest_email, guest_phone, ota_source");

      // Only add the NOT IN filter if there are linked IDs
      if (linkedIds.length > 0) {
        query = query.not("unified_booking_id", "in", `(${linkedIds.join(",")})`);
      }

      const { data: unlinkedBookings, error } = await query.limit(500);

      if (error) {
        throw new Error(`Failed to fetch unlinked bookings: ${error.message}`);
      }

      console.log(`[SYNC] Found ${unlinkedBookings?.length || 0} unlinked bookings`);

      const results = [];
      for (const booking of unlinkedBookings || []) {
        try {
          const result = await matchOrCreateGuest(supabase, booking);
          await createGuestIdentity(supabase, result.guest_id, booking);
          await linkBookingToGuest(
            supabase,
            booking.unified_booking_id,
            result.guest_id,
            result.match_method,
            result.confidence
          );

          if (result.is_new_guest) {
            await suggestMergeIfSimilar(supabase, result.guest_id, booking);
          }

          results.push({ booking_id: booking.unified_booking_id, ...result });
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(`[SYNC] Error for ${booking.unified_booking_id}:`, err);
          results.push({
            booking_id: booking.unified_booking_id,
            error: errorMessage,
          });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          total_found: unlinkedBookings?.length || 0,
          results,
          processed: results.filter((r) => !r.error).length,
          errors: results.filter((r) => r.error).length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[GUEST-MATCHING] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
