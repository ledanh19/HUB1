import { Clock, Globe, DollarSign } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { PaymentMethodIcon } from "@/components/ui/payment-method-icon";
import { getPaymentMethodLabel } from "@/constants/paymentMethods";
import { CollectionTableActions } from "@/components/booking/CollectionTableActions";
import { FIELD_LABELS, CHANGE_TYPE_LABELS, CHANGE_SOURCE_LABELS, OTA_SKIP_FIELDS } from "@/hooks/useBookingChanges";
import type { HotelCollect } from "@/hooks/useCollections";

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);
};
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
};

interface MobileHistoryTabProps {
  auditLogs: any[];
  auditProfiles: Record<string, any>;
  bookingChanges: any[];
  hotelCollects?: any[];
  onCollectionComplete?: () => void;
}

export function MobileHistoryTab({ auditLogs, auditProfiles, bookingChanges, hotelCollects = [], onCollectionComplete }: MobileHistoryTabProps) {
  return (
    <div className="space-y-3 p-3">
      {/* Internal Audit Logs */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-3.5 w-3.5 text-primary" />
          <p className="text-[10px] uppercase text-muted-foreground font-medium tracking-wider">
            Nhật ký thao tác ({auditLogs.length})
          </p>
        </div>

        {auditLogs.length > 0 ? (
          <div className="relative">
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
            <div className="space-y-0">
              {auditLogs.map((log: any) => {
                const actionColors: Record<string, string> = {
                  "Nhận phòng": "bg-success", "Check-in": "bg-success",
                  "Trả phòng": "bg-primary", "Check-out": "bg-primary",
                  "Thu tiền": "bg-success", "CREATE": "bg-success",
                  "UPDATE": "bg-warning", "DELETE": "bg-destructive",
                  "VOID": "bg-destructive", "REFUND": "bg-warning",
                };
                const dotColor = actionColors[log.action] || "bg-muted-foreground";
                const profile = log.user_id ? auditProfiles[log.user_id] : null;
                const userName = profile?.full_name || profile?.email?.split("@")[0] || "Hệ thống";

                const entityMap: Record<string, string> = {
                  booking: "Booking", stays: "Lưu trú", hotel_collects: "Thu tiền",
                  host_supply_segments: "Phân bổ", guest_documents: "Giấy tờ",
                };
                const entityLabel = entityMap[log.entity] || log.entity;

                return (
                  <div key={log.id} className="relative flex gap-2.5 pb-3 last:pb-0">
                    <div className="relative z-10 flex items-center justify-center shrink-0 w-[23px]">
                      <div className={`w-2 h-2 rounded-full ring-2 ring-card ${dotColor}`} />
                    </div>
                    <div className="flex-1 min-w-0 -mt-0.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs font-medium">{log.action}</span>
                        <span className="text-[10px] text-muted-foreground">{entityLabel}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">{formatDateTime(log.event_time)}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{userName}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-3">Chưa có hoạt động</p>
        )}
      </div>

      {/* OTA/PMS Changes */}
      {bookingChanges.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="h-3.5 w-3.5 text-primary" />
            <p className="text-[10px] uppercase text-muted-foreground font-medium tracking-wider">
              Thay đổi từ kênh ({bookingChanges.length})
            </p>
          </div>
          <div className="relative">
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
            <div className="space-y-0">
              {bookingChanges.map((change: any) => {
                const changeTypeLabel = CHANGE_TYPE_LABELS[change.change_type] || change.change_type;
                const visibleFields = (change.changed_fields || []).filter((f: string) => !OTA_SKIP_FIELDS.has(f));
                const fieldLabels = visibleFields.map((f: string) => FIELD_LABELS[f] || f);
                const dotColor = change.change_type === "INSERT" ? "bg-success"
                  : change.change_type === "STATUS_CHANGE" ? "bg-warning" : "bg-info";

                const formatFieldValue = (field: string, val: unknown): string => {
                  if (val === null || val === undefined) return "—";
                  const s = String(val);
                  if ((field.includes("amount") || field === "commission_amount") && !isNaN(Number(val))) return formatCurrency(Number(val));
                  if ((field === "check_in_date" || field === "check_out_date") && s.includes("-")) return formatDate(s);
                  return s;
                };

                return (
                  <div key={change.id} className="relative flex gap-2.5 pb-3 last:pb-0">
                    <div className="relative z-10 flex items-center justify-center shrink-0 w-[23px]">
                      <div className={`w-2 h-2 rounded-full ring-2 ring-card ${dotColor}`} />
                    </div>
                    <div className="flex-1 min-w-0 -mt-0.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        <StatusBadge
                          variant={change.change_type === "INSERT" ? "success" : change.change_type === "STATUS_CHANGE" ? "warning" : "info"}
                          size="sm"
                        >
                          {changeTypeLabel}
                        </StatusBadge>
                        <span className="text-[10px] text-muted-foreground ml-auto">{formatDateTime(change.created_at)}</span>
                      </div>
                      {fieldLabels.length > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{fieldLabels.join(", ")}</p>
                      )}
                      {change.before_data && change.after_data && visibleFields.length > 0 && (
                        <div className="mt-1 p-1.5 rounded bg-muted/40 text-[10px] space-y-0.5">
                          {visibleFields.map((field: string) => (
                            <div key={field} className="flex items-center gap-1">
                              <span className="text-muted-foreground/70">{FIELD_LABELS[field] || field}:</span>
                              <span className="text-destructive line-through">{formatFieldValue(field, change.before_data?.[field])}</span>
                              <span className="text-muted-foreground/50">→</span>
                              <span className="font-medium">{formatFieldValue(field, change.after_data?.[field])}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Collection History */}
      {hotelCollects.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="h-3.5 w-3.5 text-primary" />
            <p className="text-[10px] uppercase text-muted-foreground font-medium tracking-wider">
              Lịch sử thu tiền ({hotelCollects.length})
            </p>
          </div>
          <div className="relative">
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
            <div className="space-y-0">
              {hotelCollects.map((collect: any) => {
                const collectionType = collect.collection_type || "COLLECT";
                const relatedType = collect.related_type || "ROOM";
                const isVoided = collectionType === "VOID" || collect.voided_at;
                const isRefund = collectionType === "REFUND";
                const typeLabel = relatedType === "SERVICE" ? "Dịch vụ"
                  : (relatedType === "FEE" || relatedType === "EXTRA") ? "Phụ phí" : "Tiền phòng";
                const dotColor = isRefund ? "bg-warning" : isVoided ? "bg-muted-foreground" : "bg-success";

                return (
                  <div key={collect.id} className={`relative flex gap-2.5 pb-3 last:pb-0 ${isVoided ? "opacity-50" : ""}`}>
                    <div className="relative z-10 flex items-center justify-center shrink-0 w-[23px]">
                      <div className={`w-2 h-2 rounded-full ring-2 ring-card ${dotColor}`} />
                    </div>
                    <div className="flex-1 min-w-0 -mt-0.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge variant={isRefund ? "warning" : isVoided ? "default" : "success"} size="sm">
                            {isRefund ? "Hoàn" : isVoided ? "Hủy" : "Thu"}
                          </StatusBadge>
                          <span className="text-[10px] text-muted-foreground">{typeLabel}</span>
                        </div>
                        <span className={`text-xs font-semibold tabular-nums ${isRefund ? "text-warning" : isVoided ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {isRefund ? "-" : ""}{formatCurrency(Math.abs(collect.amount_collected || 0))}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <PaymentMethodIcon code={collect.payment_method || ''} className="h-3 w-3 shrink-0" />
                          <span>{getPaymentMethodLabel(collect.payment_method || '')}</span>
                        </div>
                        <span>•</span>
                        <span>{formatDateTime(collect.collected_at)}</span>
                        {collectionType === "COLLECT" && !isVoided && onCollectionComplete && (
                          <div className="ml-auto">
                            <CollectionTableActions collection={collect as unknown as HotelCollect} onActionComplete={onCollectionComplete} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
