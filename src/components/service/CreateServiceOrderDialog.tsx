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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCreateServiceOrder } from "@/hooks/useServiceOrders";
import { toast } from "sonner";

interface CreateServiceOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId?: string;
  customerName?: string;
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

export function CreateServiceOrderDialog({
  open,
  onOpenChange,
  bookingId,
  customerName,
}: CreateServiceOrderDialogProps) {
  const createMutation = useCreateServiceOrder();
  const [services, setServices] = useState<ServiceCatalog[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    service_id: "",
    partner_id: "",
    service_date_time: "",
    pax: 1,
    sale_price: 0,
    cost_price: 0,
    service_provider_type: "PARTNER" as "HOST" | "PARTNER",
    collector_type: "ROOMRISE" as "ROOMRISE" | "PARTNER",
    note: "",
    customer_name: customerName || "",
  });

  useEffect(() => {
    if (open) {
      fetchData();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(8, 0, 0, 0);
      setFormData((prev) => ({
        ...prev,
        service_date_time: tomorrow.toISOString().slice(0, 16),
        customer_name: customerName || "",
      }));
    }
  }, [open, customerName]);

  useEffect(() => {
    const selectedService = services.find((s) => s.id === formData.service_id);
    if (selectedService) {
      setFormData((prev) => ({
        ...prev,
        sale_price: selectedService.base_price || 0,
        cost_price: selectedService.cost_price || 0,
        partner_id: selectedService.default_partner_id || prev.partner_id,
      }));
    }
  }, [formData.service_id, services]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [servicesRes, partnersRes] = await Promise.all([
        supabase
          .from("service_catalog")
          .select("id, service_name, service_type, base_price, cost_price, default_partner_id")
          .eq("active_status", true),
        supabase
          .from("partners")
          .select("id, partner_name")
          .in("partner_type", ["SERVICE_TOUR", "SERVICE_PICKUP", "SERVICE_OTHER"])
          .eq("status", "active"),
      ]);

      if (servicesRes.error) throw servicesRes.error;
      if (partnersRes.error) throw partnersRes.error;

      setServices(servicesRes.data || []);
      setPartners(partnersRes.data || []);
    } catch (err: any) {
      toast.error("Lỗi tải dữ liệu: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.service_id) {
      toast.error("Vui lòng chọn dịch vụ");
      return;
    }
    // partner_id is always required - Roomrise does not provide services
    if (!formData.partner_id) {
      toast.error("Vui lòng chọn đối tác/Host cung cấp dịch vụ");
      return;
    }
    if (formData.sale_price <= 0) {
      toast.error("Số tiền phải lớn hơn 0");
      return;
    }

    await createMutation.mutateAsync({
      unified_booking_id: bookingId,
      service_id: formData.service_id,
      partner_id: formData.partner_id,
      service_date_time: formData.service_date_time,
      pax: formData.pax,
      sale_price: formData.sale_price,
      cost_price: formData.cost_price,
      service_provider_type: formData.service_provider_type,
      collector_type: formData.collector_type,
      note: formData.note,
      customer_name: formData.customer_name,
    });

    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      service_id: "",
      partner_id: "",
      service_date_time: "",
      pax: 1,
      sale_price: 0,
      cost_price: 0,
      service_provider_type: "PARTNER" as "HOST" | "PARTNER",
      collector_type: "ROOMRISE" as "ROOMRISE" | "PARTNER",
      note: "",
      customer_name: "",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getServiceTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      TOUR: "Tour",
      PICKUP: "Đưa đón",
      LAUNDRY: "Giặt ủi",
      FNB: "F&B",
      ADDON: "Dịch vụ thêm",
    };
    return labels[type] || type;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tạo đơn dịch vụ mới</DialogTitle>
          <DialogDescription>
            {bookingId
              ? `Thêm dịch vụ cho booking ${bookingId}`
              : "Tạo đơn dịch vụ độc lập (không gắn booking)"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Dịch vụ *</Label>
            <Select
              value={formData.service_id}
              onValueChange={(v) => setFormData({ ...formData, service_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={loading ? "Đang tải..." : "Chọn dịch vụ"} />
              </SelectTrigger>
              <SelectContent>
                {services.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    [{getServiceTypeLabel(service.service_type)}] {service.service_name} -{" "}
                    {formatCurrency(service.base_price || 0)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Loại nhà cung cấp *</Label>
            <RadioGroup
              value={formData.service_provider_type}
              onValueChange={(v) => setFormData({ ...formData, service_provider_type: v as "HOST" | "PARTNER", partner_id: "" })}
              className="flex gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="HOST" id="provider-host" />
                <Label htmlFor="provider-host" className="font-normal cursor-pointer">
                  Host
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="PARTNER" id="provider-partner" />
                <Label htmlFor="provider-partner" className="font-normal cursor-pointer">
                  Đối tác dịch vụ
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Chọn {formData.service_provider_type === "HOST" ? "Host" : "Đối tác"} *</Label>
            <Select
              value={formData.partner_id}
              onValueChange={(v) => setFormData({ ...formData, partner_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={`Chọn ${formData.service_provider_type === "HOST" ? "Host" : "Đối tác"}`} />
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Thời gian dịch vụ *</Label>
              <Input
                type="datetime-local"
                value={formData.service_date_time}
                onChange={(e) =>
                  setFormData({ ...formData, service_date_time: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Số khách</Label>
              <Input
                type="number"
                min={1}
                value={formData.pax}
                onChange={(e) =>
                  setFormData({ ...formData, pax: parseInt(e.target.value) || 1 })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Giá bán *</Label>
              <CurrencyInput
                value={String(formData.sale_price)}
                onChange={(v) =>
                  setFormData({ ...formData, sale_price: parseFloat(v) || 0 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Giá vốn</Label>
              <CurrencyInput
                value={String(formData.cost_price)}
                onChange={(v) =>
                  setFormData({ ...formData, cost_price: parseFloat(v) || 0 })
                }
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Ai thu tiền? *</Label>
            <RadioGroup
              value={formData.collector_type}
              onValueChange={(v) => setFormData({ ...formData, collector_type: v as "ROOMRISE" | "PARTNER" })}
              className="flex gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="ROOMRISE" id="collector-roomrise" />
                <Label htmlFor="collector-roomrise" className="font-normal cursor-pointer">
                  Roomrise thu
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="PARTNER" id="collector-partner" />
                <Label htmlFor="collector-partner" className="font-normal cursor-pointer">
                  NCC thu trực tiếp
                </Label>
              </div>
            </RadioGroup>
            {formData.collector_type !== "ROOMRISE" && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Nhà cung cấp thu tiền trực tiếp từ khách. Không tạo giao dịch thu tiền trong hệ thống.
                </span>
              </div>
            )}
          </div>

          {!bookingId && (
            <div className="space-y-2">
              <Label>Tên khách hàng</Label>
              <Input
                value={formData.customer_name}
                onChange={(e) =>
                  setFormData({ ...formData, customer_name: e.target.value })
                }
                placeholder="Nhập tên khách hàng"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Ghi chú</Label>
            <Textarea
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              placeholder="Ghi chú thêm về dịch vụ..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || !formData.service_id || !formData.partner_id}
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Tạo đơn dịch vụ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
