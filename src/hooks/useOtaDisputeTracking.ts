// Re-export everything from the new unified dispute tracking hook
// This file is kept for backward compatibility

export {
  useDisputeTracking as useOtaDisputeTracking,
  useDisputeStats as useOtaDisputeStats,
  useCreateDispute as useCreateOtaDispute,
  useUpdateDispute as useUpdateOtaDispute,
  DISPUTE_STATUS_DISPLAY,
  ALL_DISPUTE_TYPE_DISPLAY as DISPUTE_TYPE_DISPLAY,
  OTA_DISPUTE_TYPE_DISPLAY,
  HOTEL_DISPUTE_TYPE_DISPLAY,
  type DisputeStatus as OtaDisputeStatus,
  type DisputeType as OtaDisputeType,
  type Dispute as OtaDispute,
  type DisputeCategory,
} from "./useDisputeTracking";
