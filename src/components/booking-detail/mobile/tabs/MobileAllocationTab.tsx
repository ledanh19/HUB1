import { Pencil, Trash2, Lock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { HostSupplySegments } from "@/components/booking/HostSupplySegments";
import { MobileDetailRow, MobileSection } from "../MobileDetailRow";
import type { HostDepositRequest } from "@/hooks/useHostDepositRequests";

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
};

interface MobileAllocationTabProps {
  booking: any;
  coverageStatus: any;
  hostSegments: any[];
  totalHostCost: number;
  depositRequests: HostDepositRequest[];
  prepaidRequests: HostDepositRequest[];
  onAddSegment: () => void;
  onAddExtraCharge: () => void;
  onDeposit: () => void;
  onPrepaid: () => void;
  onEditDeposit: (r: HostDepositRequest) => void;
  onDeleteDeposit: (r: HostDepositRequest) => void;
}

export function MobileAllocationTab({
  booking,
  coverageStatus,
  hostSegments,
  totalHostCost,
  depositRequests,
  prepaidRequests,
  onAddSegment,
  onAddExtraCharge,
  onDeposit,
  onPrepaid,
  onEditDeposit,
  onDeleteDeposit,
}: MobileAllocationTabProps) {
  const hasMissing = coverageStatus && !coverageStatus.isComplete && coverageStatus.missingNights > 0;
  const hasOverlap = coverageStatus?.hasOverlap;

  return (
    <div className="space-y-[1px] bg-muted/30">

      {/* Warning */}
      {(hasMissing || hasOverlap) && (
        <div className="bg-warning/5 px-4 py-1.5 flex items-center gap-2 border-b border-warning/20">
          <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
          <span className="text-[11px] text-warning font-medium">
            {hasOverlap
              ? "Phân bổ bị chồng ngày"
              : `Thiếu ${coverageStatus.missingNights} đêm — chưa thể nhận phòng`}
          </span>
        </div>
      )}

      {/* Allocation component */}
      <div className="bg-card mobile-flat">
        <HostSupplySegments
          unifiedBookingId={booking.unified_booking_id || ""}
          checkInDate={booking.check_in_date}
          checkOutDate={booking.check_out_date}
          stayStatus={booking.stay_status || undefined}
          isReadOnly={false}
          hideCoverageSummary
          hideGrandTotal
          hideAddButton
          onAddSegmentExternal={onAddSegment}
          onDeposit={onDeposit}
          depositDisabled={!hostSegments.length}
          onAddExtraChargeExternal={onAddExtraCharge}
        />
      </div>

      {/* Host cost summary */}
      {totalHostCost > 0 && (
        <MobileSection title="Chi phí Host">
          <div className="divide-y divide-border/40">
            <MobileDetailRow label="Tổng chi phí">
              <span className="text-sm font-bold text-destructive tabular-nums">{formatCurrency(totalHostCost)}</span>
            </MobileDetailRow>
          </div>
        </MobileSection>
      )}

      {/* Deposits */}
      {depositRequests.length > 0 && (
        <MobileSection title="Đặt cọc">
          <div className="divide-y divide-border/40">
            {depositRequests.map((r) => (
              <DepositRow key={r.id} request={r} onEdit={onEditDeposit} onDelete={onDeleteDeposit} />
            ))}
          </div>
        </MobileSection>
      )}

      {/* Prepaid */}
      {prepaidRequests.length > 0 && (
        <MobileSection title="Trả trước">
          <div className="divide-y divide-border/40">
            {prepaidRequests.map((r) => (
              <DepositRow key={r.id} request={r} onEdit={onEditDeposit} onDelete={onDeleteDeposit} />
            ))}
          </div>
        </MobileSection>
      )}
    </div>
  );
}

function DepositRow({ request: r, onEdit, onDelete }: {
  request: HostDepositRequest;
  onEdit: (r: HostDepositRequest) => void;
  onDelete: (r: HostDepositRequest) => void;
}) {
  const statusMeta: Record<string, { variant: any; label: string }> = {
    PENDING: { variant: "warning", label: "Chờ" },
    APPROVED: { variant: "info", label: "Duyệt" },
    PAID: { variant: "success", label: "Đã chi" },
    REJECTED: { variant: "danger", label: "Từ chối" },
  };
  const meta = statusMeta[r.status] || { variant: "default", label: r.status };
  const canEdit = r.status === "PENDING" && !r.settlement_id && !r.is_applied;

  return (
    <div className="flex items-center justify-between py-[5px] min-h-[24px]">
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <StatusBadge variant={meta.variant} size="sm">{meta.label}</StatusBadge>
        <span className="text-xs font-semibold tabular-nums">{formatCurrency(r.proposed_amount)}</span>
        {(r.is_applied || r.settlement_id) && (
          <Badge variant="outline" className="text-[10px] bg-success/10 text-success gap-0.5 h-4">
            <Lock className="h-2.5 w-2.5" />QT
          </Badge>
        )}
      </div>
      {canEdit && (
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(r)}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onDelete(r)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
