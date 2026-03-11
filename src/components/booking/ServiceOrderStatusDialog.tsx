import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useUpdateServiceOrder, ServiceOrder } from "@/hooks/useServiceOrders";
import { Loader2, CheckCircle2, Clock, XCircle, Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface ServiceOrderStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceOrder: ServiceOrder | null;
  onSuccess?: () => void;
}

const STATUS_OPTIONS = [
  {
    value: "DRAFT",
    dbValue: "NEW",
    label: "Nháp",
    description: "Đơn mới tạo, chưa xác nhận",
    icon: Clock,
    color: "bg-muted text-muted-foreground border-muted",
  },
  {
    value: "CONFIRMED",
    dbValue: "CONFIRMED",
    label: "Đã xác nhận",
    description: "Đã xác nhận với đối tác",
    icon: CheckCircle2,
    color: "bg-info/100/10 text-info border-info/30",
  },
  {
    value: "IN_PROGRESS",
    dbValue: "ASSIGNED",
    label: "Đang thực hiện",
    description: "Đối tác đang thực hiện dịch vụ",
    icon: Play,
    color: "bg-warning/100/10 text-warning border-warning/30",
  },
  {
    value: "COMPLETED",
    dbValue: "DONE",
    label: "Hoàn thành",
    description: "Khách đã sử dụng xong dịch vụ",
    icon: CheckCircle2,
    color: "bg-success/100/10 text-success border-success/30",
  },
  {
    value: "CANCELLED",
    dbValue: "CANCELLED",
    label: "Đã hủy",
    description: "Dịch vụ đã bị hủy",
    icon: XCircle,
    color: "bg-destructive/100/10 text-destructive border-destructive/30",
  },
];

// Map DB status to display status
const mapDbToDisplayStatus = (dbStatus: string): string => {
  const statusMap: Record<string, string> = {
    'NEW': 'DRAFT',
    'CONFIRMED': 'CONFIRMED',
    'ASSIGNED': 'IN_PROGRESS',
    'DONE': 'COMPLETED',
    'COMPLETED': 'COMPLETED',
    'CANCELLED': 'CANCELLED',
    'NO_SHOW': 'CANCELLED',
  };
  return statusMap[dbStatus] || dbStatus;
};

export function ServiceOrderStatusDialog({
  open,
  onOpenChange,
  serviceOrder,
  onSuccess,
}: ServiceOrderStatusDialogProps) {
  const updateMutation = useUpdateServiceOrder();
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // Get current display status
  const currentDisplayStatus = serviceOrder ? mapDbToDisplayStatus(serviceOrder.status) : "";
  
  // Use selected or current status
  const effectiveStatus = selectedStatus || currentDisplayStatus;

  const handleSubmit = async () => {
    if (!serviceOrder || !selectedStatus) return;

    try {
      await updateMutation.mutateAsync({
        id: serviceOrder.id,
        status: selectedStatus,
        note: note || undefined,
      });
      onOpenChange(false);
      setSelectedStatus(null);
      setNote("");
      onSuccess?.();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedStatus(null);
      setNote("");
    }
    onOpenChange(open);
  };

  // Determine which statuses can be selected based on current status
  const getSelectableStatuses = () => {
    // If already COMPLETED/DONE, cannot change
    if (currentDisplayStatus === "COMPLETED") {
      return [];
    }
    // If already CANCELLED, cannot change
    if (currentDisplayStatus === "CANCELLED") {
      return [];
    }
    // Otherwise, show all except current
    return STATUS_OPTIONS.filter(s => s.value !== currentDisplayStatus);
  };

  const selectableStatuses = getSelectableStatuses();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cập nhật trạng thái đơn dịch vụ</DialogTitle>
          <DialogDescription>
            {serviceOrder?.service_catalog?.service_name || "Dịch vụ"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current Status */}
          <div className="space-y-2">
            <Label>Trạng thái hiện tại</Label>
            <div className="flex items-center gap-2">
              {STATUS_OPTIONS.find(s => s.value === currentDisplayStatus) && (
                <Badge className={STATUS_OPTIONS.find(s => s.value === currentDisplayStatus)?.color}>
                  {STATUS_OPTIONS.find(s => s.value === currentDisplayStatus)?.label}
                </Badge>
              )}
            </div>
          </div>

          {/* Status Options */}
          {selectableStatuses.length > 0 ? (
            <div className="space-y-2">
              <Label>Chọn trạng thái mới</Label>
              <div className="grid gap-2">
                {selectableStatuses.map((status) => {
                  const Icon = status.icon;
                  const isSelected = selectedStatus === status.value;
                  
                  return (
                    <button
                      key={status.value}
                      type="button"
                      onClick={() => setSelectedStatus(status.value)}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      )}
                    >
                      <div className={cn("p-2 rounded-lg", status.color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{status.label}</p>
                        <p className="text-xs text-muted-foreground">{status.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              <p>Đơn đã hoàn thành hoặc đã hủy, không thể thay đổi trạng thái.</p>
            </div>
          )}

          {/* Note */}
          {selectedStatus && (
            <div className="space-y-2">
              <Label htmlFor="status-note">Ghi chú (tùy chọn)</Label>
              <Textarea
                id="status-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Thêm ghi chú về việc thay đổi trạng thái..."
                rows={2}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedStatus || updateMutation.isPending}
          >
            {updateMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Cập nhật
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
