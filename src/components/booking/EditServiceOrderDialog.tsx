import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useUpdateServiceOrder, ServiceOrder } from "@/hooks/useServiceOrders";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface EditServiceOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceOrder: ServiceOrder | null;
}

interface ServiceCatalog {
  id: string;
  service_name: string;
  service_type: string;
  base_price: number | null;
  cost_price: number | null;
  default_partner_id: string | null;
}

interface Partner {
  id: string;
  partner_name: string;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
};

const getServiceTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    TOUR: "Tour",
    PICKUP: "Đưa đón",
    ADDON: "Dịch vụ thêm",
  };
  return labels[type] || type;
};

export function EditServiceOrderDialog({
  open,
  onOpenChange,
  serviceOrder,
}: EditServiceOrderDialogProps) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [services, setServices] = useState<ServiceCatalog[]>([]);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    partner_id: "",
    service_id: "",
    service_date_time: "",
    pax: 1,
    sale_price: "",
    cost_price: "",
    note: "",
  });

  const updateMutation = useUpdateServiceOrder();

  // Fetch partners on open
  useEffect(() => {
    if (open && serviceOrder) {
      fetchPartners();
    }
  }, [open, serviceOrder]);

  // Populate form when order changes
  useEffect(() => {
    if (serviceOrder && open) {
      setFormData({
        partner_id: serviceOrder.partner_id || "",
        service_id: serviceOrder.service_id || "",
        service_date_time: serviceOrder.service_date_time
          ? new Date(serviceOrder.service_date_time).toISOString().slice(0, 16)
          : "",
        pax: serviceOrder.pax || 1,
        sale_price: String(serviceOrder.sale_price || 0),
        cost_price: String(serviceOrder.cost_price || 0),
        note: serviceOrder.note || "",
      });

      // Fetch services for the partner
      if (serviceOrder.partner_id) {
        fetchServicesByPartner(serviceOrder.partner_id);
      }
    }
  }, [serviceOrder, open]);

  // Fetch services when partner changes (user selection)
  useEffect(() => {
    if (formData.partner_id && open) {
      fetchServicesByPartner(formData.partner_id);
    }
  }, [formData.partner_id]);

  const fetchPartners = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("partners")
        .select("id, partner_name")
        .in("partner_type", ["SERVICE_TOUR", "SERVICE_PICKUP", "SERVICE_OTHER"])
        .eq("status", "active")
        .order("partner_name");

      if (error) throw error;
      setPartners(data || []);
    } catch (err: any) {
      toast.error("Lỗi tải danh sách đối tác: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchServicesByPartner = async (partnerId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("service_catalog")
        .select("id, service_name, service_type, base_price, cost_price, default_partner_id")
        .eq("default_partner_id", partnerId)
        .eq("active_status", true)
        .order("service_name");

      if (error) throw error;
      setServices(data || []);
    } catch (err: any) {
      toast.error("Lỗi tải danh sách dịch vụ: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!serviceOrder) return;

    const parsedSalePrice = parseFloat(formData.sale_price.replace(/[^\d]/g, ""));
    const parsedCostPrice = parseFloat(formData.cost_price.replace(/[^\d]/g, ""));

    if (!formData.partner_id) {
      toast.error("Vui lòng chọn đối tác dịch vụ");
      return;
    }
    if (!formData.service_id) {
      toast.error("Vui lòng chọn dịch vụ");
      return;
    }
    if (!formData.service_date_time) {
      toast.error("Vui lòng chọn thời gian");
      return;
    }

    await updateMutation.mutateAsync({
      id: serviceOrder.id,
      partner_id: formData.partner_id,
      service_id: formData.service_id,
      service_date_time: formData.service_date_time,
      pax: formData.pax,
      sale_price: parsedSalePrice || 0,
      cost_price: parsedCostPrice || 0,
      note: formData.note || undefined,
    });

    onOpenChange(false);
  };

  const handleClose = () => {
    setFormData({
      partner_id: "",
      service_id: "",
      service_date_time: "",
      pax: 1,
      sale_price: "",
      cost_price: "",
      note: "",
    });
    setPartners([]);
    setServices([]);
    onOpenChange(false);
  };

  const isCompleted = serviceOrder?.status === "DONE" || serviceOrder?.status === "COMPLETED";
  const hasPayment = (serviceOrder?.amount_collected || 0) > 0;

  if (!serviceOrder) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa đơn dịch vụ</DialogTitle>
          <DialogDescription>
            Cập nhật thông tin đơn dịch vụ
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Partner */}
          <div className="space-y-2">
            <Label>Đối tác dịch vụ <span className="text-destructive">*</span></Label>
            <Select
              value={formData.partner_id}
              onValueChange={(v) => setFormData({ ...formData, partner_id: v, service_id: "" })}
              disabled={isCompleted || hasPayment}
            >
              <SelectTrigger>
                <SelectValue placeholder={loading ? "Đang tải..." : "Chọn đối tác"} />
              </SelectTrigger>
              <SelectContent>
                {partners.map((partner) => (
                  <SelectItem key={partner.id} value={partner.id}>
                    {partner.partner_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Service */}
          <div className="space-y-2">
            <Label>Dịch vụ <span className="text-destructive">*</span></Label>
            <Select
              value={formData.service_id}
              onValueChange={(v) => {
                const selectedService = services.find((s) => s.id === v);
                setFormData({
                  ...formData,
                  service_id: v,
                  sale_price: selectedService?.base_price != null ? String(selectedService.base_price) : formData.sale_price,
                  cost_price: selectedService?.cost_price != null ? String(selectedService.cost_price) : formData.cost_price,
                });
              }}
              disabled={!formData.partner_id || isCompleted || hasPayment}
            >
              <SelectTrigger>
                <SelectValue placeholder={
                  !formData.partner_id
                    ? "Chọn đối tác trước"
                    : loading
                      ? "Đang tải..."
                      : services.length === 0
                        ? "Đối tác chưa có dịch vụ"
                        : "Chọn dịch vụ"
                } />
              </SelectTrigger>
              <SelectContent>
                {services.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    [{getServiceTypeLabel(service.service_type)}] {service.service_name} - {formatCurrency(service.base_price || 0)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date Time and Pax */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Thời gian <span className="text-destructive">*</span></Label>
              <Input
                type="datetime-local"
                value={formData.service_date_time}
                onChange={(e) => setFormData({ ...formData, service_date_time: e.target.value })}
                disabled={isCompleted}
              />
            </div>

            <div className="space-y-2">
              <Label>Số khách</Label>
              <Input
                type="number"
                min={1}
                value={formData.pax}
                onChange={(e) => setFormData({ ...formData, pax: parseInt(e.target.value) || 1 })}
                disabled={isCompleted}
              />
            </div>
          </div>

          {/* Prices */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Giá bán</Label>
              <CurrencyInput
                placeholder="0"
                value={formData.sale_price}
                onChange={(v) =>
                  setFormData({ ...formData, sale_price: v })
                }
                disabled={isCompleted}
              />
              {isCompleted && (
                <p className="text-xs text-muted-foreground">
                  Không thể sửa giá sau khi đơn đã hoàn thành
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Giá vốn</Label>
              <CurrencyInput
                placeholder="0"
                value={formData.cost_price}
                onChange={(v) =>
                  setFormData({ ...formData, cost_price: v })
                }
                disabled={isCompleted}
              />
            </div>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label>Ghi chú</Label>
            <Textarea
              placeholder="Ghi chú thêm về dịch vụ..."
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!formData.partner_id || !formData.service_id || updateMutation.isPending}
          >
            {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu thay đổi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
