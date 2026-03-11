import { useState, useEffect } from "react";
import { MobileTaskPage } from "@/components/booking-detail/mobile/MobileTaskPage";
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
import { Loader2 } from "lucide-react";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { AN_GIA_GROUP_ID } from "@/hooks/useAnGiaProperties";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateServiceOrders } from "@/lib/query/invalidateServiceOrders";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { createAuditLog, AuditActions } from "@/hooks/useAuditLog";

interface AddServiceFormProps {
  unifiedBookingId: string;
  onComplete: () => void;
  onSuccess?: () => void;
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

export function AddServiceForm({ unifiedBookingId, onComplete, onSuccess }: AddServiceFormProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [services, setServices] = useState<ServiceCatalog[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    service_id: "",
    partner_id: "",
    service_date_time: "",
    pax: 1,
    sale_price: 0,
    cost_price: 0,
    note: "",
  });

  useEffect(() => {
    fetchPartners();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    setFormData((prev) => ({ ...prev, service_date_time: tomorrow.toISOString().slice(0, 16) }));
  }, []);

  useEffect(() => {
    if (formData.partner_id) {
      fetchServicesByPartner(formData.partner_id);
    } else {
      setServices([]);
      setFormData((prev) => ({ ...prev, service_id: "", sale_price: 0, cost_price: 0 }));
    }
  }, [formData.partner_id]);

  useEffect(() => {
    const selectedService = services.find((s) => s.id === formData.service_id);
    if (selectedService) {
      setFormData((prev) => ({
        ...prev,
        sale_price: selectedService.base_price || 0,
        cost_price: selectedService.cost_price || 0,
      }));
    }
  }, [formData.service_id, services]);

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

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);

  const getServiceTypeLabel = (type: string) => {
    const labels: Record<string, string> = { TOUR: "Tour", PICKUP: "Đưa đón", ADDON: "Dịch vụ thêm" };
    return labels[type] || type;
  };

  const handleSubmit = async () => {
    if (!formData.partner_id) { toast.error("Vui lòng chọn đối tác dịch vụ"); return; }
    if (!formData.service_id) { toast.error("Vui lòng chọn dịch vụ"); return; }

    setSaving(true);
    try {
      const { data: newServiceOrder, error } = await safeMutation(() =>
        supabase.from("service_orders").insert({
          unified_booking_id: unifiedBookingId,
          service_id: formData.service_id,
          partner_id: formData.partner_id,
          service_date_time: formData.service_date_time,
          pax: formData.pax,
          sale_price: formData.sale_price,
          cost_price: formData.cost_price,
          note: formData.note || null,
          status: "NEW",
          service_provider_type: "PARTNER",
          collector_type: "ROOMRISE",
          property_group_id: AN_GIA_GROUP_ID,
          created_by: user?.id,
        }).select().single()
      );
      if (error) throw error;

      const selectedService = services.find((s) => s.id === formData.service_id);
      await createAuditLog({
        action: AuditActions.SERVICE_ADDED,
        entity: "booking",
        entityId: unifiedBookingId,
        afterData: {
          service_name: selectedService?.service_name,
          service_type: selectedService?.service_type,
          service_date_time: formData.service_date_time,
          pax: formData.pax,
          sale_price: formData.sale_price,
        },
      });

      toast.success("Thêm dịch vụ thành công");
      await invalidateServiceOrders(queryClient, unifiedBookingId);
      onSuccess?.();
      onComplete();
    } catch (err: any) {
      toast.error("Lỗi thêm dịch vụ: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <MobileTaskPage
      title="Thêm dịch vụ"
      onBack={onComplete}
      onSubmit={handleSubmit}
      submitLabel="Thêm dịch vụ"
      submitDisabled={saving || !formData.service_id}
      isSubmitting={saving}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Đối tác dịch vụ *</Label>
          <Select value={formData.partner_id} onValueChange={(v) => setFormData({ ...formData, partner_id: v, service_id: "" })}>
            <SelectTrigger><SelectValue placeholder={loading ? "Đang tải..." : "Chọn đối tác trước"} /></SelectTrigger>
            <SelectContent>
              {partners.map((partner) => (
                <SelectItem key={partner.id} value={partner.id}>{partner.partner_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Dịch vụ *</Label>
          <Select value={formData.service_id} onValueChange={(v) => setFormData({ ...formData, service_id: v })} disabled={!formData.partner_id}>
            <SelectTrigger>
              <SelectValue placeholder={
                !formData.partner_id ? "Chọn đối tác trước" :
                loading ? "Đang tải..." :
                services.length === 0 ? "Đối tác chưa có dịch vụ" : "Chọn dịch vụ"
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
          {formData.partner_id && services.length === 0 && !loading && (
            <p className="text-xs text-muted-foreground">Đối tác này chưa có dịch vụ nào.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Thời gian *</Label>
            <Input
              type="datetime-local"
              value={formData.service_date_time}
              onChange={(e) => setFormData({ ...formData, service_date_time: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Số khách</Label>
            <Input
              type="number"
              min={1}
              value={formData.pax}
              onChange={(e) => setFormData({ ...formData, pax: parseInt(e.target.value) || 1 })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Giá bán</Label>
            <CurrencyInput value={String(formData.sale_price)} onChange={(v) => setFormData({ ...formData, sale_price: parseFloat(v) || 0 })} />
          </div>
          <div className="space-y-2">
            <Label>Giá vốn</Label>
            <CurrencyInput value={String(formData.cost_price)} onChange={(v) => setFormData({ ...formData, cost_price: parseFloat(v) || 0 })} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Ghi chú</Label>
          <Textarea value={formData.note} onChange={(e) => setFormData({ ...formData, note: e.target.value })} placeholder="Ghi chú thêm về dịch vụ..." rows={2} />
        </div>
      </div>
    </MobileTaskPage>
  );
}
