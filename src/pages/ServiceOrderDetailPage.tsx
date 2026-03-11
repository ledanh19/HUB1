import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { AppLink } from "@/components/system/AppLink";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { BackButton } from "@/components/ui/BackButton";
import {
  Plane,
  Car,
  Sparkles,
  CreditCard,
  Building2,
  User,
  CalendarDays,
  Clock,
  ExternalLink,
  Users,
  Loader2,
  CheckCircle,
  AlertCircle,
  Save,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { useServiceOrderById, useUpdateServiceOrder } from "@/hooks/useServiceOrders";
import { ServiceOrderStatusDialog } from "@/components/booking/ServiceOrderStatusDialog";
import { toast } from "sonner";

const formatCurrency = (amount: number | null) => {
  if (amount === null) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const SERVICE_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  TOUR: { label: "Tour", icon: Plane, color: "bg-primary/10 text-primary border-primary/30" },
  PICKUP: { label: "Đưa đón", icon: Car, color: "bg-success/10 text-success border-success/30" },
  LAUNDRY: { label: "Giặt ủi", icon: Sparkles, color: "bg-info/100/10 text-info border-info/20" },
  FNB: { label: "F&B", icon: Sparkles, color: "bg-warning/10 text-warning border-warning/30" },
  ADDON: { label: "Dịch vụ thêm", icon: Sparkles, color: "bg-primary/100/10 text-primary border-primary/30" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  NEW: { label: "Nháp", color: "bg-muted text-muted-foreground" },
  DRAFT: { label: "Nháp", color: "bg-muted text-muted-foreground" },
  CONFIRMED: { label: "Đã xác nhận", color: "bg-primary/10 text-primary" },
  ASSIGNED: { label: "Đang thực hiện", color: "bg-warning/10 text-warning" },
  IN_PROGRESS: { label: "Đang thực hiện", color: "bg-warning/10 text-warning" },
  DONE: { label: "Hoàn thành", color: "bg-success/10 text-success" },
  COMPLETED: { label: "Hoàn thành", color: "bg-success/10 text-success" },
  CANCELLED: { label: "Đã huỷ", color: "bg-destructive/10 text-destructive" },
  NO_SHOW: { label: "No-show", color: "bg-muted text-muted-foreground" },
};

// Roomrise KHÔNG BAO GIỜ là NCC dịch vụ - chỉ có HOST hoặc PARTNER
const PROVIDER_CONFIG: Record<string, { label: string; color: string }> = {
  HOST: { label: "Host", color: "text-warning" },
  PARTNER: { label: "Đối tác", color: "text-muted-foreground" },
  SERVICE_PARTNER: { label: "Đối tác", color: "text-muted-foreground" },
};

export default function ServiceOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { data: order, isLoading, error, refetch } = useServiceOrderById(orderId || "");
  const updateMutation = useUpdateServiceOrder();

  const [note, setNote] = useState<string>("");
  const [noteEdited, setNoteEdited] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);

  // Set initial note when order loads
  useEffect(() => {
    if (order && !noteEdited) {
      setNote(order.note || "");
    }
  }, [order, noteEdited]);

  if (isLoading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  if (error || !order) {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <p className="text-muted-foreground">Không tìm thấy đơn dịch vụ</p>
          <BackButton to="/services/orders" label="Quay lại" size="default" />
        </div>
      </>
    );
  }

  const typeConfig = SERVICE_TYPE_CONFIG[(order as any).service_catalog?.service_type] || {
    label: "Khác",
    icon: Sparkles,
    color: "bg-muted text-muted-foreground",
  };
  const TypeIcon = typeConfig.icon;
  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.NEW;
  const providerConfig = PROVIDER_CONFIG[order.collector_type] || { label: "Đối tác", color: "text-muted-foreground" };

  const isPaid = order.payment_status === 'PAID';
  const isPartialPaid = order.payment_status === 'PARTIAL';
  const hasDebtWarning = (order.status === 'DONE' || order.status === 'COMPLETED') && !isPaid;
  // Chỉ khóa khi booking đã quyết toán - lấy từ unified_bookings.is_settled
  const isBookingSettled = (order as any).unified_bookings?.is_settled === true;
  const canChangeStatus = !isBookingSettled && order.status !== 'CANCELLED';

  const handleSaveNote = async () => {
    await updateMutation.mutateAsync({
      id: order.id,
      note,
    });
    setNoteEdited(false);
  };

  const handleCollectPayment = () => {
    // Navigate to booking detail with collectService action to open service payment dialog
    navigate(`/bookings/${order.unified_booking_id}?action=collectService`);
  };

  return (
    <>
      <Header
        title="Chi tiết đơn dịch vụ"
        subtitle={`Mã đơn: ${order.id.slice(0, 8)}...`}
      />

      <PageContainer><SectionCard>
        {/* Back button */}
        <BackButton to="/services/orders" label="Quay lại danh sách" size="default" />

        {/* Warning for completed with debt */}
        {hasDebtWarning && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
            <div>
              <p className="font-medium text-warning">Cảnh báo: Đơn đã hoàn thành nhưng còn nợ</p>
              <p className="text-xs text-muted-foreground mt-1">
                Còn lại: {formatCurrency(order.amount_remaining || 0)}. Vui lòng thu tiền tại{" "}
                <AppLink to="/collections" className="text-primary hover:underline">Trang Thu tiền</AppLink>.
              </p>
            </div>
          </div>
        )}

        {/* Header Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-lg ${typeConfig.color}`}>
                  <TypeIcon className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">
                    {(order as any).service_catalog?.service_name || "Dịch vụ"}
                  </h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge className={typeConfig.color}>{typeConfig.label}</Badge>
                    <Badge className={statusConfig.color}>{statusConfig.label}</Badge>
                    {isPaid ? (
                      <Badge className="bg-success/10 text-success border-success/30">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Đã thu đủ
                      </Badge>
                    ) : isPartialPaid ? (
                      <Badge className="bg-warning/10 text-warning border-warning/30">
                        Thu một phần
                      </Badge>
                    ) : (
                      <Badge className="bg-destructive/10 text-destructive border-destructive/30">
                        Chưa thu
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                {canChangeStatus && (
                  <Button variant="outline" onClick={() => setStatusDialogOpen(true)}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Đổi trạng thái
                  </Button>
                )}
                {!isPaid && order.unified_booking_id && (
                  <Button onClick={handleCollectPayment}>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Thu tiền dịch vụ
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-4">
            {/* Service Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Chi tiết dịch vụ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Thời gian</p>
                      <p className="font-medium">{formatDateTime(order.service_date_time)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Số khách</p>
                      <p className="font-medium">{order.pax} pax</p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Phải thu (Giá bán)</p>
                      <p className="text-base font-semibold">
                        {formatCurrency(order.sale_price)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Đã thu</p>
                      <p className="text-base font-medium text-success">
                        {formatCurrency(order.amount_collected || 0)}
                      </p>
                      <p className="text-xs text-muted-foreground">(Roomrise / Host / Đối tác)</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Còn lại</p>
                      <p className={`text-base font-medium ${(order.amount_remaining || 0) > 0 ? 'text-destructive' : ''}`}>
                        {formatCurrency(order.amount_remaining || 0)}
                      </p>
                    </div>
                    {/* Giá vốn & Lợi nhuận chỉ hiển thị ở Trang Quyết toán dịch vụ */}
                  </div>
                </div>

                <div className="bg-muted/50 p-3 rounded-lg flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="text-xs text-muted-foreground">
                    <strong>NCC (Đối tác cung cấp dịch vụ):</strong> <span className={`font-medium ${providerConfig.color}`}>{providerConfig.label}</span>.
                    <br />
                    📌 Trang này chỉ theo dõi, không thu tiền. Thu tiền → <AppLink to="/collections" className="text-primary hover:underline">Trang Thu tiền</AppLink>.
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Ghi chú</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value);
                    setNoteEdited(true);
                  }}
                  placeholder="Thêm ghi chú về đơn dịch vụ..."
                  rows={3}
                />
                {noteEdited && (
                  <Button
                    size="sm"
                    onClick={handleSaveNote}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Lưu ghi chú
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Partner Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Đối tác dịch vụ
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(order as any).partners ? (
                  <div className="space-y-2">
                    <p className="font-medium">{(order as any).partners.partner_name}</p>
                    {(order as any).partners.phone && (
                      <p className="text-xs text-muted-foreground">{(order as any).partners.phone}</p>
                    )}
                    {(order as any).partners.email && (
                      <p className="text-xs text-muted-foreground">{(order as any).partners.email}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground">Chưa có thông tin đối tác</p>
                )}
              </CardContent>
            </Card>

            {/* Booking Link */}
            {order.unified_booking_id && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Booking liên quan
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full justify-between" asChild>
                    <Link to={`/bookings/${order.unified_booking_id}`}>
                      {((order as any).unified_bookings?.ota_booking_code || order.unified_booking_id.slice(0, 12) + "...").replace(/^[A-Za-z]+[-_]/, "")}
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Timestamps */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Lịch sử
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tạo lúc</span>
                  <span>{formatDateTime(order.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cập nhật</span>
                  <span>{formatDateTime(order.updated_at)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </SectionCard></PageContainer>

      {/* Status Dialog */}
      <ServiceOrderStatusDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        serviceOrder={order}
        onSuccess={() => refetch()}
      />
    </>
  );
}
