/**
 * Sync guard helpers — PMS-aligned
 * SOT: TRANSFER_SPEC_INVENTORY_RATESETUP.md §5.6
 *
 * A property syncs to Channex only when ALL guard conditions are met.
 */

export interface SyncEligibility {
  canSync: boolean;
  reason?: string;
}

/**
 * Check whether a property is eligible for Channex sync.
 *
 * Guards (§5.6):
 *  1. property.external_id (channex_property_id) must exist
 *  2. Mapping must be active (analogous to property.is_sync_enabled)
 */
export function checkPropertySyncEligibility(
  channexPropertyId: string | null | undefined,
  mappingStatus: string | null | undefined
): SyncEligibility {
  if (!channexPropertyId) {
    return { canSync: false, reason: 'No Channex property ID' };
  }
  if (mappingStatus && mappingStatus !== 'ACTIVE' && mappingStatus !== 'active') {
    return { canSync: false, reason: `Mapping status: ${mappingStatus}` };
  }
  return { canSync: true };
}

/**
 * Check whether a rate plan is eligible for Channex sync.
 *
 * Guard (§5.6 #4): RatePlanOTA.external_id (provider_rate_plan_id) must exist.
 */
export function checkRatePlanSyncEligibility(
  providerRatePlanId: string | null | undefined
): SyncEligibility {
  if (!providerRatePlanId) {
    return { canSync: false, reason: 'No Channex rate plan ID (unmapped)' };
  }
  return { canSync: true };
}

/**
 * Check whether a room type is eligible for availability sync.
 *
 * Guard (§5.6 #5): Room.external_id (provider_room_type_id) must exist.
 */
export function checkRoomTypeSyncEligibility(
  providerRoomTypeId: string | null | undefined
): SyncEligibility {
  if (!providerRoomTypeId) {
    return { canSync: false, reason: 'No Channex room type ID (unmapped)' };
  }
  return { canSync: true };
}
