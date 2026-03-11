import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";

export interface AuditLogParams {
  action: string;
  entity: string;
  entityId: string;
  beforeData?: Record<string, any> | null;
  afterData?: Record<string, any> | null;
}

export async function createAuditLog({
  action,
  entity,
  entityId,
  beforeData = null,
  afterData = null,
}: AuditLogParams) {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await safeMutation(() => supabase.from("audit_logs").insert({
      action,
      entity,
      entity_id: entityId,
      user_id: user?.id || null,
      before_data: beforeData,
      after_data: afterData,
    }));

    if (error) {
      console.error("Failed to create audit log:", error);
    }
  } catch (err) {
    console.error("Error creating audit log:", err);
  }
}

// Helper for common actions
export const AuditActions = {
  BOOKING_CREATED: "Tạo booking",
  BOOKING_UPDATED: "Cập nhật booking",
  BOOKING_CANCELLED: "Huỷ đặt phòng",
  CHECK_IN: "Nhận phòng",
  CHECK_OUT: "Trả phòng",
  NO_SHOW: "Đánh dấu No-show",
  ROOM_ASSIGNED: "Phân bổ phòng Host",
  ROOM_CHANGED: "Đổi phòng Host",
  PAYMENT_COLLECTED: "Thu tiền",
  SERVICE_ADDED: "Thêm dịch vụ",
  DOCUMENT_UPLOADED: "Tải lên giấy tờ",
  DOCUMENT_SENT_TO_HOST: "Gửi giấy tờ cho Host",
} as const;
