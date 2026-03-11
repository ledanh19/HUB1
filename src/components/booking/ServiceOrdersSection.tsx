import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Plane, Pencil, Trash2, Lock, Plus, RefreshCw } from "lucide-react";
import {
  useServiceOrdersByBooking,
  useDeleteServiceOrder,
  ServiceOrder
} from "@/hooks/useServiceOrders";
import { EditServiceOrderDialog } from "./EditServiceOrderDialog";
import { ServiceOrderStatusDialog } from "./ServiceOrderStatusDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ServiceOrdersSectionProps {
  unifiedBookingId: string;
  isSettled?: boolean;
  onAddService?: () => void;
}

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getStatusVariant = (status: string): "default" | "info" | "warning" | "success" | "danger" => {
  switch (status) {
    case "NEW":
    case "DRAFT":
      return "info";
    case "CONFIRMED":
    case "ASSIGNED":
      return "warning";
    case "DONE":
    case "COMPLETED":
      return "success";
    case "CANCELLED":
    case "NO_SHOW":
      return "danger";
    default:
      return "default";
  }
};

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    NEW: "Mới",
    DRAFT: "Nháp",
    CONFIRMED: "Xác nhận",
    ASSIGNED: "Đang thực hiện",
    DONE: "Hoàn thành",
    COMPLETED: "Hoàn thành",
    CANCELLED: "Đã hủy",
    NO_SHOW: "No-show",
  };
  return labels[status] || status;
};

export function ServiceOrdersSection({
  unifiedBookingId,
  isSettled = false,
  onAddService,
}: ServiceOrdersSectionProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ServiceOrder | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState<ServiceOrder | null>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusOrder, setStatusOrder] = useState<ServiceOrder | null>(null);

  const { data: serviceOrders = [], refetch } = useServiceOrdersByBooking(unifiedBookingId);
  const deleteMutation = useDeleteServiceOrder();

  const handleEdit = (order: ServiceOrder) => {
    setEditingOrder(order);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (order: ServiceOrder) => {
    setDeletingOrder(order);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingOrder) return;
    await deleteMutation.mutateAsync(deletingOrder.id);
    setDeleteDialogOpen(false);
    setDeletingOrder(null);
  };

  const handleStatusClick = (order: ServiceOrder) => {
    setStatusOrder(order);
    setStatusDialogOpen(true);
  };

  const canChangeStatus = (order: ServiceOrder) => {
    // Chỉ khóa khi booking đã quyết toán
    if (isSettled) return false;
    if (order.status === "CANCELLED") return false;
    return true;
  };

  const canEditDelete = (order: ServiceOrder) => {
    // Chỉ khóa khi booking đã quyết toán
    if (isSettled) return false;
    return true;
  };

  if (serviceOrders.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 bd-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Plane className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Dịch vụ</h3>
            <Badge variant="secondary">0</Badge>
          </div>

        </div>
        <div className="text-center py-6 text-muted-foreground">
          <Plane className="h-10 w-10 mx-auto mb-2 opacity-50 bd-empty-icon" />
          <p>Chưa có dịch vụ nào</p>
        </div>
        {onAddService && !isSettled && (
          <Button
            variant="outline"
            className="w-full mt-2"
            onClick={onAddService}
          >
            <Plane className="mr-2 h-4 w-4" />
            Thêm dịch vụ
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-6 bd-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Plane className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Dịch vụ</h3>
            <Badge variant="secondary">{serviceOrders.length}</Badge>
          </div>

        </div>

        <div className="space-y-3">
          {serviceOrders.map((order) => {
            const canEdit = canEditDelete(order);
            const canStatus = canChangeStatus(order);
            const hasPayment = (order.amount_collected || 0) > 0;
            const isCompleted = order.status === "DONE" || order.status === "COMPLETED";

            return (
              <div
                key={order.id}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg bd-service-item"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {order.service_catalog?.service_name || "Dịch vụ"}
                      </span>
                      <StatusBadge
                        variant={getStatusVariant(order.status)}
                        size="sm"
                      >
                        {getStatusLabel(order.status)}
                      </StatusBadge>
                      {isSettled && (
                        <Badge variant="outline" className="text-xs bg-success/100/10 text-success gap-1">
                          <Lock className="h-3 w-3" />
                          Đã QT
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(order.service_date_time)}
                      {order.partners?.partner_name && ` • ${order.partners.partner_name}`}
                      {order.note && ` • ${order.note}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="font-medium">{formatCurrency(order.sale_price)}</span>
                    {hasPayment && (
                      <p className="text-xs text-success">
                        Đã thu: {formatCurrency(order.amount_collected || 0)}
                      </p>
                    )}
                  </div>
                  {/* Status change button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleStatusClick(order)}
                    disabled={!canStatus}
                    aria-disabled={!canStatus}
                    title={!canStatus ? "Không thể đổi trạng thái (đã hoàn thành/đã hủy)" : "Đổi trạng thái"}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  {/* Edit button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleEdit(order)}
                    disabled={!canEdit}
                    aria-disabled={!canEdit}
                    title={!canEdit ? "Không thể chỉnh sửa (đã quyết toán/đã hoàn thành/đã thu tiền)" : "Chỉnh sửa"}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDeleteClick(order)}
                    disabled={!canEdit}
                    aria-disabled={!canEdit}
                    title={!canEdit ? "Không thể xóa (đã quyết toán/đã hoàn thành/đã thu tiền)" : "Xóa"}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Dialog */}
      <EditServiceOrderDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        serviceOrder={editingOrder}
      />

      {/* Status Dialog */}
      <ServiceOrderStatusDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        serviceOrder={statusOrder}
        onSuccess={() => refetch()}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa đơn dịch vụ này?
              <br />
              <strong>{deletingOrder?.service_catalog?.service_name}</strong> • {formatCurrency(deletingOrder?.sale_price || 0)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
