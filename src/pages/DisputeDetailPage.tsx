import { useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { AppLink } from "@/components/system/AppLink";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { BackButton } from "@/components/ui/BackButton";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  Loader2,
  Calendar,
  DollarSign,
  User,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  X,
  ExternalLink,
  MessageSquare,
  Paperclip,
  Upload,
  FileText,
  Link as LinkIcon,
  Unlink,
  CreditCard,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  useUploadDisputeAttachment,
  useDisputeAttachments,
  isDisputeOverdue,
  getOverdueDays,
} from "@/hooks/useDisputes";
import {
  CASE_STATUS_DISPLAY,
  CASE_STATUS_TRANSITIONS,
  isValidTransition,
  useUpdateCaseStatus,
  useLinkCaseRecord,
  type CaseStatus,
} from "@/hooks/useCaseCenter";
import { useCreatePaymentRequest } from "@/hooks/usePaymentRequests";
import { formatBookingCode } from "@/lib/bookingCodeFormatter";
import { Checkbox } from "@/components/ui/checkbox";

// === Helpers ===

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return "—";
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

// Map legacy status to case_status for fallback display
function legacyToCaseStatus(legacyStatus: string): CaseStatus {
  const map: Record<string, CaseStatus> = {
    OPEN: "SUBMITTED",
    NEW: "SUBMITTED",
    IN_REVIEW: "UNDER_REVIEW",
    WON: "SETTLED",
    LOST: "CLOSED",
    PARTIAL: "UNDER_REVIEW",
    CLOSED: "CLOSED",
  };
  return map[legacyStatus] || "SUBMITTED";
}

function getStatusVariant(status: string) {
  const info = CASE_STATUS_DISPLAY[status as CaseStatus];
  if (info) {
    const variantMap: Record<string, string> = {
      "Nháp": "secondary",
      "Đã gửi": "warning",
      "Đang xét": "info",
      "Đã duyệt": "success",
      "Từ chối": "destructive",
      "Đã quyết toán": "success",
      "Đóng": "default",
    };
    return variantMap[info.label] || "default";
  }
  // Legacy fallback
  switch (status) {
    case "OPEN": case "NEW": return "warning";
    case "IN_REVIEW": return "info";
    case "WON": return "success";
    case "LOST": return "destructive";
    case "CLOSED": return "default";
    default: return "secondary";
  }
}

function getStatusLabel(status: string, caseStatus?: string | null) {
  if (caseStatus && CASE_STATUS_DISPLAY[caseStatus as CaseStatus]) {
    return CASE_STATUS_DISPLAY[caseStatus as CaseStatus].label;
  }
  // Legacy fallback
  const legacy: Record<string, string> = {
    OPEN: "Mở", NEW: "Mới", IN_REVIEW: "Đang xét",
    WON: "Thắng", LOST: "Thua", PARTIAL: "Một phần", CLOSED: "Đóng",
  };
  return legacy[status] || status;
}

function getDisputeTypeLabel(type: string) {
  const map: Record<string, string> = {
    OTA_WITHHOLD: "OTA giữ tiền",
    OTA_DEDUCTION: "OTA trừ tiền",
    NO_SHOW: "No-show",
    GUEST_REFUND: "Hoàn tiền khách",
    OTA_REFUND: "OTA hoàn tiền",
    OTA_REFUND_REQUEST: "Yêu cầu OTA hoàn",
    OTA_COMPLAINT: "Khiếu nại OTA",
    CHARGEBACK: "Chargeback",
    DIRECT_REFUND: "Hoàn trực tiếp",
  };
  return map[type] || type;
}

// === Component ===

export default function DisputeDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [newCaseStatus, setNewCaseStatus] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [createPR, setCreatePR] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  const updateCaseStatusMutation = useUpdateCaseStatus();
  const uploadMutation = useUploadDisputeAttachment();
  const linkMutation = useLinkCaseRecord();
  const createPRMutation = useCreatePaymentRequest();

  // Fetch dispute
  const { data: dispute, isLoading } = useQuery({
    queryKey: ["ota_dispute", id],
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ota_disputes")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: attachments = [] } = useDisputeAttachments(id || "");

  // Fetch booking data for formatted booking code
  const { data: bookingInfo } = useQuery({
    queryKey: ["booking_code_info", dispute?.unified_booking_id],
    staleTime: 60_000,
    enabled: !!dispute?.unified_booking_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("unified_bookings")
        .select("unified_booking_id, ota_booking_code, source, check_in_date")
        .eq("unified_booking_id", dispute!.unified_booking_id)
        .maybeSingle();
      return data;
    },
  });

  // Fetch audit logs for timeline
  const { data: auditLogs = [] } = useQuery({
    queryKey: ["dispute_audit_logs", id],
    staleTime: 30_000,
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("entity_id", id)
        .order("event_time", { ascending: false })
        .limit(50);
      if (error) {
        console.warn("Failed to fetch audit logs:", error);
        return [];
      }
      return data || [];
    },
  });

  // Fetch user profiles for audit log user_ids
  const auditUserIds = [...new Set(auditLogs.map((l: any) => l.user_id).filter(Boolean))] as string[];
  const { data: auditProfiles = [] } = useQuery({
    queryKey: ["audit_profiles", auditUserIds.join(",")],
    staleTime: 300_000,
    enabled: auditUserIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", auditUserIds);
      return data || [];
    },
  });

  const profilesMap: Record<string, { full_name: string | null; email: string | null }> = {};
  auditProfiles.forEach((p: any) => { profilesMap[p.id] = p; });
  const getUserName = (userId: string | null) => {
    if (!userId) return "Hệ thống";
    const profile = profilesMap[userId];
    return profile?.full_name || profile?.email || userId.slice(0, 8);
  };

  const displayBookingCode = bookingInfo
    ? formatBookingCode(bookingInfo.unified_booking_id, bookingInfo.ota_booking_code, bookingInfo.source, bookingInfo.check_in_date)
    : dispute?.unified_booking_id?.slice(0, 12) || "—";

  // Effective case status (with legacy fallback)
  const effectiveCaseStatus: CaseStatus = (dispute as any)?.case_status || legacyToCaseStatus(dispute?.status || "OPEN");
  const isLegacyMapped = !(dispute as any)?.case_status;

  // Available transitions from current status
  const allowedTransitions = CASE_STATUS_TRANSITIONS[effectiveCaseStatus] || [];

  // === Handlers ===

  const handleOpenUpdateModal = () => {
    setNewCaseStatus("");
    setStatusNote("");
    setPendingFiles([]);
    setCreatePR(false);
    setUpdateDialogOpen(true);
  };

  const handleModalFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) setPendingFiles(prev => [...prev, ...Array.from(files)]);
    if (modalFileInputRef.current) modalFileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateSubmit = async () => {
    if (!dispute || !newCaseStatus) return;

    // Upload attachments first
    for (const file of pendingFiles) {
      await uploadMutation.mutateAsync({
        disputeId: dispute.id,
        file,
        fileType: file.type.includes("pdf") ? "EMAIL" : "EVIDENCE",
      });
    }

    // Update case status via state machine
    await updateCaseStatusMutation.mutateAsync({
      id: dispute.id,
      case_status: newCaseStatus as CaseStatus,
      resolution_note: statusNote || undefined,
    });

    // If user confirmed: create GUEST_REFUND payment request
    if (createPR && ["GUEST_REFUND", "OTA_REFUND"].includes(dispute.dispute_type)) {
      try {
        const amount = Number((dispute as any).amount_requested || dispute.amount_in_dispute || 0);
        const guestName = (dispute as any).guest_name || "Khách";

        const pr = await createPRMutation.mutateAsync({
          payment_type: "GUEST_REFUND",
          source_amount: amount,
          proposed_amount: amount,
          recipient_name: guestName,
          note: `Hoàn tiền từ Case #${dispute.id.slice(0, 8)} — ${dispute.dispute_type || "GUEST_REFUND"}${statusNote ? " — " + statusNote : ""}`,
        });

        // Link PR back to case
        if (pr?.id) {
          await supabase
            .from("ota_disputes")
            .update({
              payment_request_id: pr.id,
              last_activity_at: new Date().toISOString(),
            })
            .eq("id", dispute.id);

          // Audit log for PR creation from case
          try {
            const { createAuditLog } = await import("@/hooks/useAuditLog");
            await createAuditLog({
              action: "CREATE_PAYMENT_REQUEST_FROM_CASE",
              entity: "ota_disputes",
              entityId: dispute.id,
              afterData: {
                payment_request_id: pr.id,
                request_code: pr.request_code,
                amount,
                guest_name: guestName,
              },
            });
          } catch { /* audit non-critical */ }
        }
      } catch (prError) {
        toast.error("Đã cập nhật trạng thái nhưng lỗi tạo đề xuất: " + (prError as Error).message);
      }
    }

    queryClient.invalidateQueries({ queryKey: ["ota_dispute", id] });
    queryClient.invalidateQueries({ queryKey: ["dispute_audit_logs", id] });
    queryClient.invalidateQueries({ queryKey: ["dispute_attachments", id] });
    queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
    setUpdateDialogOpen(false);
    setPendingFiles([]);
    setCreatePR(false);
  };

  const handleQuickUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !dispute) return;

    for (const file of Array.from(files)) {
      await uploadMutation.mutateAsync({
        disputeId: dispute.id,
        file,
        fileType: file.type.includes("pdf") ? "EMAIL" : "EVIDENCE",
      });
    }

    // Audit log for attachment
    try {
      const { createAuditLog } = await import("@/hooks/useAuditLog");
      await createAuditLog({
        action: "UPLOAD_ATTACHMENT",
        entity: "ota_disputes",
        entityId: dispute.id,
        afterData: { files: Array.from(files).map(f => f.name) },
      });
    } catch { /* non-critical */ }

    queryClient.invalidateQueries({ queryKey: ["dispute_attachments", id] });
    queryClient.invalidateQueries({ queryKey: ["dispute_audit_logs", id] });
  };

  const handleUnlink = async (field: string) => {
    if (!dispute) return;
    try {
      await supabase
        .from("ota_disputes")
        .update({ [field]: null, last_activity_at: new Date().toISOString() })
        .eq("id", dispute.id);

      // Audit
      try {
        const { createAuditLog } = await import("@/hooks/useAuditLog");
        await createAuditLog({
          action: "UNLINK_FINANCIAL_RECORD",
          entity: "ota_disputes",
          entityId: dispute.id,
          afterData: { unlinked_field: field },
        });
      } catch { /* non-critical */ }

      queryClient.invalidateQueries({ queryKey: ["ota_dispute", id] });
      queryClient.invalidateQueries({ queryKey: ["dispute_audit_logs", id] });
      toast.success("Đã gỡ liên kết");
    } catch {
      toast.error("Lỗi gỡ liên kết");
    }
  };

  // === Build timeline from audit logs ===
  const buildTimeline = () => {
    const events: { title: string; description?: string; date: string; icon: React.ReactNode; userName?: string }[] = [];

    // From audit_logs
    for (const log of auditLogs) {
      const actionMap: Record<string, { title: string; icon: React.ReactNode }> = {
        CREATE_CASE: { title: "Tạo case", icon: <CheckCircle className="h-3 w-3 text-success" /> },
        UPDATE_CASE_STATUS: { title: "Cập nhật trạng thái", icon: <Clock className="h-3 w-3 text-primary" /> },
        UPLOAD_ATTACHMENT: { title: "Tải bằng chứng", icon: <Paperclip className="h-3 w-3 text-primary" /> },
        LINK_FINANCIAL_RECORD: { title: "Liên kết chứng từ", icon: <LinkIcon className="h-3 w-3 text-success" /> },
        UNLINK_FINANCIAL_RECORD: { title: "Gỡ liên kết chứng từ", icon: <Unlink className="h-3 w-3 text-warning" /> },
        UPDATE_CANCELLATION_TRACKING: { title: "Cập nhật hủy booking", icon: <AlertCircle className="h-3 w-3 text-warning" /> },
        CLOSE_CASE: { title: "Đóng case", icon: <XCircle className="h-3 w-3 text-muted-foreground" /> },
        CREATE_PAYMENT_REQUEST_FROM_CASE: { title: "Tạo đề xuất thanh toán", icon: <CreditCard className="h-3 w-3 text-success" /> },
      };

      const info = actionMap[log.action] || { title: log.action, icon: <Clock className="h-3 w-3 text-muted-foreground" /> };
      const afterData = typeof log.after_data === "object" ? log.after_data : {};
      const note = (afterData as any)?.note || (afterData as any)?.resolution_note;

      events.push({
        title: info.title,
        description: note || undefined,
        date: log.event_time,
        icon: info.icon,
        userName: getUserName(log.user_id),
      });
    }

    // Fallback: if no audit logs, show basic events from dispute data
    if (events.length === 0 && dispute) {
      events.push({
        title: "Case được tạo",
        date: dispute.opened_at || dispute.created_at,
        icon: <CheckCircle className="h-3 w-3 text-success" />,
      });
      if (dispute.closed_at) {
        events.push({
          title: "Case đóng",
          date: dispute.closed_at,
          icon: <XCircle className="h-3 w-3 text-muted-foreground" />,
        });
      }
    }

    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const timeline = buildTimeline();

  // === Linked records ===
  const linkedRecords: { field: string; label: string; id: string | null; navTo: string }[] = dispute ? [
    { field: "payout_id", label: "Payout", id: (dispute as any).payout_id, navTo: `/ota-payouts/${(dispute as any).payout_id}` },
    { field: "ota_adjustment_record_id", label: "Adjustment", id: (dispute as any).ota_adjustment_record_id, navTo: `/ota-adjustment-records` },
    { field: "ota_debit_note_record_id", label: "Debit Note", id: (dispute as any).ota_debit_note_record_id, navTo: `/ota-adjustment-records` },
    { field: "ota_payout_record_id", label: "Payout Record", id: (dispute as any).ota_payout_record_id, navTo: `/ota-payouts/${(dispute as any).ota_payout_record_id}` },
  ].filter(r => r.id) : [];

  // === Render ===

  if (isLoading) {
    return (
      <>
        <Header title="Chi tiết Case" />
        <PageContainer><SectionCard>
          <div className="flex items-center justify-center h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </SectionCard></PageContainer>
      </>
    );
  }

  if (!dispute) {
    return (
      <>
        <Header title="Chi tiết Case" />
        <PageContainer><SectionCard>
          <div className="flex flex-col items-center justify-center h-screen gap-4">
            <AlertTriangle className="h-12 w-12 text-warning" />
            <h2 className="text-base font-semibold">Không tìm thấy case</h2>
            <Button asChild variant="outline">
              <AppLink to="/disputes">Quay lại danh sách</AppLink>
            </Button>
          </div>
        </SectionCard></PageContainer>
      </>
    );
  }

  const overdue = !["SETTLED", "CLOSED", "REJECTED"].includes(effectiveCaseStatus) && isDisputeOverdue(dispute.last_activity_at);
  const overdueDays = getOverdueDays(dispute.last_activity_at);

  return (
    <>
      <Header title="Chi tiết Case" />
      <PageContainer><SectionCard className="overflow-hidden">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-border bg-background/98">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 sm:px-6 py-4">
            <div className="flex items-center gap-4">
              <BackButton to="/disputes" />
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-semibold">Case #{dispute.id.slice(0, 8)}</h1>
                  <StatusBadge variant={getStatusVariant(effectiveCaseStatus) as any} dot>
                    {getStatusLabel(dispute.status, (dispute as any).case_status)}
                  </StatusBadge>
                  {isLegacyMapped && (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      Legacy
                    </span>
                  )}
                  {overdue && (
                    <span className="text-xs text-destructive flex items-center gap-1 bg-destructive/10 px-2 py-1 rounded">
                      <AlertCircle className="h-3 w-3" />
                      Quá hạn {overdueDays} ngày
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Booking: <AppLink to={`/bookings/${dispute.unified_booking_id}`} className="text-primary hover:underline">#{displayBookingCode}</AppLink>
                  {(dispute as any).case_type && (
                    <span className="ml-2 text-muted-foreground">• {(dispute as any).case_type === "REFUND" ? "Hoàn tiền" : "Tranh chấp"}</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Show "Create PR" button for APPROVED refund cases without linked PR */}
              {["GUEST_REFUND", "OTA_REFUND"].includes(dispute.dispute_type) &&
                effectiveCaseStatus === "APPROVED" &&
                !(dispute as any).payment_request_id && (
                  <Button
                    size="sm"
                    variant="default"
                    disabled={createPRMutation.isPending}
                    onClick={async () => {
                      try {
                        const amount = Number((dispute as any).amount_requested || dispute.amount_in_dispute || 0);
                        const guestName = (dispute as any).guest_name || "Khách";

                        const pr = await createPRMutation.mutateAsync({
                          payment_type: "GUEST_REFUND",
                          source_amount: amount,
                          proposed_amount: amount,
                          recipient_name: guestName,
                          note: `Hoàn tiền từ Case #${dispute.id.slice(0, 8)} — ${dispute.dispute_type}`,
                        });

                        if (pr?.id) {
                          await supabase
                            .from("ota_disputes")
                            .update({
                              payment_request_id: pr.id,
                              last_activity_at: new Date().toISOString(),
                            })
                            .eq("id", dispute.id);

                          try {
                            const { createAuditLog } = await import("@/hooks/useAuditLog");
                            await createAuditLog({
                              action: "CREATE_PAYMENT_REQUEST_FROM_CASE",
                              entity: "ota_disputes",
                              entityId: dispute.id,
                              afterData: {
                                payment_request_id: pr.id,
                                request_code: pr.request_code,
                                amount,
                              },
                            });
                          } catch { /* audit non-critical */ }

                          queryClient.invalidateQueries({ queryKey: ["ota_dispute", id] });
                          queryClient.invalidateQueries({ queryKey: ["dispute_audit_logs", id] });
                          queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
                        }
                      } catch (err) {
                        toast.error("Lỗi tạo đề xuất: " + (err as Error).message);
                      }
                    }}
                  >
                    {createPRMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <CreditCard className="h-4 w-4 mr-2" />
                    Tạo đề xuất thanh toán
                  </Button>
                )}
              <Button size="sm" variant="outline" onClick={handleOpenUpdateModal}>
                Cập nhật tiến độ
              </Button>
            </div>
          </div>
        </header>

        <div className="p-4 overflow-x-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* === Left Column === */}
            <div className="lg:col-span-2 space-y-4">
              {/* Summary Cards (tracking only) */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* Estimated amount (readonly, informational) */}
                <div className="p-4 bg-card rounded-xl border border-border">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <DollarSign className="h-4 w-4" />
                    <span className="text-xs">Ảnh hưởng ước tính</span>
                  </div>
                  <p className="text-base font-semibold">
                    {formatCurrency(Number(dispute.amount_in_dispute || 0))}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Chỉ tham khảo • Tiền xử lý tại OTA Payout</p>
                </div>
                <div className="p-4 bg-card rounded-xl border border-border">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Calendar className="h-4 w-4" />
                    <span className="text-xs">Ngày mở</span>
                  </div>
                  <p className="text-xs font-medium">
                    {formatDateTime(dispute.opened_at)}
                  </p>
                </div>
                <div className="p-4 bg-card rounded-xl border border-border">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Clock className="h-4 w-4" />
                    <span className="text-xs">Cập nhật cuối</span>
                  </div>
                  <p className="text-xs font-medium">
                    {formatDateTime(dispute.last_activity_at)}
                  </p>
                </div>
              </div>

              {/* Case Info */}
              <div className="p-4 bg-card rounded-xl border border-border space-y-4">
                <h3 className="font-medium">Thông tin case</h3>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-muted-foreground">Loại tranh chấp</p>
                    <p className="font-medium">{getDisputeTypeLabel(dispute.dispute_type)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Booking</p>
                    <AppLink to={`/bookings/${dispute.unified_booking_id}`} className="font-medium text-primary hover:underline flex items-center gap-1">
                      #{displayBookingCode}
                      <ExternalLink className="h-3 w-3" />
                    </AppLink>
                  </div>
                  {(dispute as any).refund_channel && (
                    <div>
                      <p className="text-muted-foreground">Kênh hoàn tiền</p>
                      <p className="font-medium">
                        {(dispute as any).refund_channel === "VIA_OTA" ? "Qua OTA" : "Trực tiếp cho khách"}
                      </p>
                    </div>
                  )}
                  {(dispute as any).booking_cancellation_expected && (
                    <div>
                      <p className="text-muted-foreground">Hủy booking</p>
                      <p className="font-medium">
                        {(dispute as any).booking_cancellation_status === "CANCELLED"
                          ? "✅ Đã hủy"
                          : (dispute as any).booking_cancellation_status === "CANCEL_FAILED"
                            ? "❌ Hủy thất bại"
                            : "⏳ Chờ OTA duyệt"}
                      </p>
                    </div>
                  )}
                </div>
                {dispute.resolution_note && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Ghi chú</p>
                    <div className="p-3 bg-muted/50 rounded-lg text-xs">
                      <MessageSquare className="h-4 w-4 text-muted-foreground inline mr-2" />
                      {dispute.resolution_note}
                    </div>
                  </div>
                )}
              </div>

              {/* Attachments (evidence) */}
              <div className="p-4 bg-card rounded-xl border border-border space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium flex items-center gap-2">
                    <Paperclip className="h-4 w-4" />
                    Bằng chứng đính kèm ({attachments.length})
                  </h3>
                  <div>
                    <input
                      type="file"
                      id="quick-upload"
                      ref={fileInputRef}
                      onChange={handleQuickUpload}
                      accept=".pdf,.eml,.jpg,.jpeg,.png,.gif"
                      multiple
                      className="hidden"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadMutation.isPending}
                    >
                      {uploadMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      Tải lên
                    </Button>
                  </div>
                </div>

                {attachments.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Chưa có file đính kèm
                  </p>
                ) : (
                  <div className="space-y-2">
                    {attachments.map((att) => (
                      <a
                        key={att.id}
                        href={att.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-primary" />
                          <div>
                            <p className="text-xs font-medium">{att.file_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {att.file_type} • {formatDateTime(att.uploaded_at)}
                            </p>
                          </div>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* === Right Column === */}
            <div className="space-y-4">
              {/* Linked OTA Payout Records */}
              <div className="p-4 bg-card rounded-xl border border-border space-y-3">
                <h3 className="font-medium flex items-center gap-2">
                  <LinkIcon className="h-4 w-4" />
                  Liên kết chứng từ OTA Payout
                </h3>

                {linkedRecords.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    Chưa liên kết chứng từ nào
                  </p>
                ) : (
                  <div className="space-y-2">
                    {linkedRecords.map((record) => (
                      <div
                        key={record.field}
                        className="flex items-center justify-between p-2 bg-primary/5 rounded-lg border border-primary/20"
                      >
                        <AppLink
                          to={record.navTo}
                          className="flex items-center gap-2 text-xs text-primary hover:underline"
                        >
                          <LinkIcon className="h-3 w-3" />
                          {record.label} #{record.id?.slice(0, 8)}
                          <ExternalLink className="h-3 w-3" />
                        </AppLink>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleUnlink(record.field)}
                        >
                          <X className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Liên kết chứng từ từ OTA Payout Detail
                </p>
              </div>

              {/* Timeline */}
              <div className="p-4 bg-card rounded-xl border border-border">
                <h3 className="font-medium mb-4 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Lịch sử hoạt động
                </h3>
                {timeline.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Chưa có hoạt động
                  </p>
                ) : (
                  <div className="relative">
                    <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />
                    <div className="space-y-4">
                      {timeline.map((event, idx) => (
                        <div key={idx} className="flex gap-3 relative">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-background border-2 border-border flex items-center justify-center z-10">
                            {event.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{event.title}</p>
                            {event.userName && (
                              <p className="text-xs text-primary flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {event.userName}
                              </p>
                            )}
                            {event.description && (
                              <p className="text-xs text-muted-foreground truncate">{event.description}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDateTime(event.date)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </SectionCard></PageContainer>

      {/* === Status Update Modal (SINGLE, case_status state machine) === */}
      <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Cập nhật tiến độ case</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Current status */}
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <span className="text-muted-foreground">Trạng thái hiện tại: </span>
              <StatusBadge variant={getStatusVariant(effectiveCaseStatus) as any} dot>
                {getStatusLabel(dispute.status, (dispute as any).case_status)}
              </StatusBadge>
            </div>

            {/* New status */}
            <div className="space-y-2">
              <Label>Trạng thái mới *</Label>
              {allowedTransitions.length === 0 ? (
                <p className="text-xs text-muted-foreground">Case đã ở trạng thái cuối — không thể chuyển tiếp.</p>
              ) : (
                <Select value={newCaseStatus} onValueChange={setNewCaseStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn trạng thái..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedTransitions.map((status) => (
                      <SelectItem key={status} value={status}>
                        <div>
                          <div>{CASE_STATUS_DISPLAY[status]?.label || status}</div>
                          <div className="text-xs text-muted-foreground">
                            {CASE_STATUS_DISPLAY[status]?.description || ""}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Attach evidence */}
            <div className="space-y-2">
              <Label>Đính kèm bằng chứng (tùy chọn)</Label>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={modalFileInputRef}
                  onChange={handleModalFileSelect}
                  accept=".pdf,.eml,.jpg,.jpeg,.png,.gif"
                  multiple
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => modalFileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Chọn file
                </Button>
              </div>
              {pendingFiles.length > 0 && (
                <div className="space-y-1 mt-2">
                  {pendingFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm bg-muted/50 px-2 py-1 rounded">
                      <span className="truncate max-w-xs">{file.name}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFile(idx)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label>Ghi chú</Label>
              <Textarea
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder="Mô tả tiến độ, kết quả..."
                rows={3}
              />
            </div>

            {/* Auto-create Payment Request checkbox (for refund-type cases) */}
            {["GUEST_REFUND", "OTA_REFUND"].includes(dispute.dispute_type) && ["UNDER_REVIEW", "APPROVED"].includes(newCaseStatus) && !(dispute as any).payment_request_id && (
              <div className="flex items-start gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
                <Checkbox
                  id="create-pr"
                  checked={createPR}
                  onCheckedChange={(checked) => setCreatePR(checked === true)}
                />
                <div className="space-y-1">
                  <label htmlFor="create-pr" className="text-sm font-medium cursor-pointer">
                    Tạo đề xuất thanh toán hoàn tiền
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Tự động tạo đề xuất thanh toán loại "Hoàn tiền khách" với số tiền {formatCurrency(Number((dispute as any).amount_requested || dispute.amount_in_dispute || 0))} và liên kết vào case này.
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateDialogOpen(false)}>Huỷ</Button>
            <Button
              onClick={handleUpdateSubmit}
              disabled={updateCaseStatusMutation.isPending || uploadMutation.isPending || !newCaseStatus}
            >
              {(updateCaseStatusMutation.isPending || uploadMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Cập nhật
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
