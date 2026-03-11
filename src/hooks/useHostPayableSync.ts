import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { createAuditLog } from "./useAuditLog";

/**
 * Per-booking sync lock to prevent concurrent syncHostPayables calls
 * for the same booking within the same browser tab.
 */
const syncLocks = new Map<string, Promise<void>>();

/**
 * Sync host_payables with host_supply_segments + host_extra_charges
 * Called after any segment/charge create/update/delete
 * Creates or updates host_payables per partner for a booking
 * 
 * Uses a per-booking mutex to prevent race conditions from concurrent calls.
 */
export async function syncHostPayables(unifiedBookingId: string) {
  // Wait for any existing sync on this booking to finish
  const existing = syncLocks.get(unifiedBookingId);
  if (existing) {
    await existing;
  }

  const syncPromise = _syncHostPayablesImpl(unifiedBookingId);
  syncLocks.set(unifiedBookingId, syncPromise.then(() => {}).catch(() => {}));

  try {
    await syncPromise;
  } finally {
    syncLocks.delete(unifiedBookingId);
  }
}

async function _syncHostPayablesImpl(unifiedBookingId: string) {
  // Get all segments for this booking grouped by partner
  const { data: segments, error: segError } = await supabase
    .from("host_supply_segments")
    .select("partner_id, total_amount, nights, nightly_rate")
    .eq("unified_booking_id", unifiedBookingId);

  if (segError) throw segError;

  // Get all extra charges for this booking grouped by partner
  const { data: charges, error: chargeError } = await supabase
    .from("host_extra_charges")
    .select("partner_id, amount")
    .eq("unified_booking_id", unifiedBookingId);

  if (chargeError) throw chargeError;

  // Get all host surcharges for this booking grouped by partner
  // Phụ phí Host → tăng công nợ Host
  const { data: surcharges, error: surchargeError } = await supabase
    .from("host_surcharges")
    .select("host_partner_id, amount")
    .eq("unified_booking_id", unifiedBookingId);

  if (surchargeError) throw surchargeError;

  // Group amounts by partner
  const partnerAmounts: Record<string, number> = {};

  segments?.forEach((seg) => {
    if (!partnerAmounts[seg.partner_id]) {
      partnerAmounts[seg.partner_id] = 0;
    }
    partnerAmounts[seg.partner_id] += Number(seg.total_amount) || 0;
  });

  charges?.forEach((charge) => {
    if (!partnerAmounts[charge.partner_id]) {
      partnerAmounts[charge.partner_id] = 0;
    }
    partnerAmounts[charge.partner_id] += Number(charge.amount) || 0;
  });

  // Add host surcharges to partner amounts
  surcharges?.forEach((surcharge) => {
    if (!partnerAmounts[surcharge.host_partner_id]) {
      partnerAmounts[surcharge.host_partner_id] = 0;
    }
    partnerAmounts[surcharge.host_partner_id] += Number(surcharge.amount) || 0;
  });

  // Get existing payables for this booking
  // PHASE A: Only read base fields — payment truth checked via source tables before deletion
  const { data: existingPayables, error: payableError } = await supabase
    .from("host_payables")
    .select("id, partner_id, amount, status")
    .eq("unified_booking_id", unifiedBookingId);

  if (payableError) throw payableError;

  const existingMap: Record<string, typeof existingPayables[0]> = {};
  existingPayables?.forEach((p) => {
    existingMap[p.partner_id] = p;
  });

  // Get stay info for due_date
  const { data: stay } = await supabase
    .from("stays")
    .select("actual_check_out_at")
    .eq("unified_booking_id", unifiedBookingId)
    .maybeSingle();

  // Get booking info for payment_type - check manual_bookings first, then bookings_mirror
  let paymentType: string | null = null;

  const { data: manualBooking } = await supabase
    .from("manual_bookings")
    .select("payment_type")
    .eq("unified_booking_id", unifiedBookingId)
    .maybeSingle();

  if (manualBooking) {
    paymentType = manualBooking.payment_type;
  } else {
    const { data: mirrorBooking } = await supabase
      .from("bookings_mirror")
      .select("payment_type")
      .eq("unified_booking_id", unifiedBookingId)
      .maybeSingle();
    paymentType = mirrorBooking?.payment_type || null;
  }

  const dueDate = stay?.actual_check_out_at
    ? new Date(stay.actual_check_out_at).toISOString().split("T")[0]
    : null;

  // Both HOTEL_COLLECT and OTA_COLLECT mean Roomrise handles the money
  // (OTA pays Roomrise, then Roomrise pays Host)
  const collectionResponsibility =
    paymentType === "HOST_COLLECT" ? "HOST_COLLECTED" : "ROOMRISE_COLLECTED";

  const { data: { user } } = await supabase.auth.getUser();

  // Upsert payables for each partner
  for (const [partnerId, totalAmount] of Object.entries(partnerAmounts)) {
    const existing = existingMap[partnerId];

    if (existing) {
      // PHASE A: Update amount only — status is derived at read time
      // No longer trust dead stored paid/deposit/prepaid fields
      await supabase
        .from("host_payables")
        .update({
          amount: totalAmount,
          due_date: dueDate,
          collection_responsibility: collectionResponsibility,
        })
        .eq("id", existing.id);

      await supabase
        .from("host_payables")
        .update({
          amount: totalAmount,
          due_date: dueDate,
          collection_responsibility: collectionResponsibility,
        })
        .eq("id", existing.id);

      // Remove from existing map to track deletions
      delete existingMap[partnerId];
    } else {
      // Create new payable (use upsert to prevent duplicates on concurrent calls)
      const { data: newPayable } = await supabase
        .from("host_payables")
        .upsert({
          unified_booking_id: unifiedBookingId,
          partner_id: partnerId,
          amount: totalAmount,
          status: "PENDING",
          due_date: dueDate,
          collection_responsibility: collectionResponsibility,
        }, {
          onConflict: "unified_booking_id,partner_id",
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (newPayable) {
        await createAuditLog({
          action: "AUTO_CREATE",
          entity: "host_payables",
          entityId: newPayable.id,
          afterData: newPayable,
        });
      }
    }
  }

  // Delete payables for partners that no longer have segments
  for (const [partnerId, existing] of Object.entries(existingMap)) {
    // PHASE A FIX: Check real linked records in source tables before deleting
    const [paymentsCheck, batchCheck, depositsCheck, prepaidsCheck] = await Promise.all([
      supabase.from("host_payments").select("id").eq("payable_id", existing.id).limit(1),
      supabase.from("host_payment_batch_items").select("id").eq("payable_id", existing.id).limit(1),
      supabase.from("host_deposits").select("id").eq("applied_to_payable_id", existing.id).not("applied_at", "is", null).limit(1),
      supabase.from("host_prepaids").select("id").eq("applied_to_payable_id", existing.id).not("applied_at", "is", null).limit(1),
    ]);

    const hasLinkedRecords =
      (paymentsCheck.data?.length || 0) > 0 ||
      (batchCheck.data?.length || 0) > 0 ||
      (depositsCheck.data?.length || 0) > 0 ||
      (prepaidsCheck.data?.length || 0) > 0;

    if (!hasLinkedRecords) {
      await safeMutation(() => supabase.from("host_payables").delete().eq("id", existing.id));

      await createAuditLog({
        action: "AUTO_DELETE",
        entity: "host_payables",
        entityId: existing.id,
        beforeData: existing,
      });
    } else {
      // Just set amount to 0 but keep the record
      await supabase
        .from("host_payables")
        .update({ amount: 0 })
        .eq("id", existing.id);
    }
  }
}

/**
 * Recompute host payable status after any payment/deposit/prepaid change.
 * PHASE A FIX: Now a no-op since status is derived at read time.
 * Kept for API compatibility — callers don't need to change.
 */
export async function recomputePayableStatus(_payableId: string) {
  // Status is now derived at read time from source tables.
  // This function is intentionally a no-op to preserve call-site compatibility.
  return;
}

/**
 * Sync all host payables for all bookings that have segments
 * Used to fix data inconsistencies
 */
export async function syncAllHostPayables() {
  // Get all unique booking IDs from segments
  const { data: segments, error } = await supabase
    .from("host_supply_segments")
    .select("unified_booking_id");

  if (error) throw error;

  const uniqueBookingIds = [...new Set(segments?.map((s) => s.unified_booking_id) || [])];

  let syncedCount = 0;
  for (const bookingId of uniqueBookingIds) {
    try {
      await syncHostPayables(bookingId);
      syncedCount++;
    } catch (e) {
      console.error(`Failed to sync payable for ${bookingId}:`, e);
    }
  }

  return { syncedCount, totalBookings: uniqueBookingIds.length };
}
