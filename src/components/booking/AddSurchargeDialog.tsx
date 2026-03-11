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
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAddHostSurcharge } from "@/hooks/useSurcharges";

interface AddSurchargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unifiedBookingId: string;
  hostPartnerId?: string | null;
}

const hostSurchargeTypes = [
  { value: "CLEANING", label: "Phí dọn phòng" },
  { value: "EARLY_CHECKIN", label: "Nhận phòng sớm" },
  { value: "LATE_CHECKOUT", label: "Trả phòng trễ" },
  { value: "UTILITY", label: "Phí điện/nước" },
  { value: "OTHER", label: "Phí khác" },
];

export function AddSurchargeDialog({
  open,
  onOpenChange,
  unifiedBookingId,
  hostPartnerId,
}: AddSurchargeDialogProps) {
  const [formData, setFormData] = useState({
    surcharge_type: "CLEANING",
    description: "",
    amount: "",
    host_partner_id: hostPartnerId || "",
  });

  const addHostSurcharge = useAddHostSurcharge();

  // Detect post-settlement: check if booking has settled segments for selected partner
  const { data: hasSettledSegments } = useQuery({
    queryKey: ['settled-segments-check', unifiedBookingId, formData.host_partner_id],
    staleTime: 30_000,
    queryFn: async () => {
      if (!formData.host_partner_id) return false;
      const { data, error } = await supabase
        .from('host_supply_segments')
        .select('id')
        .eq('unified_booking_id', unifiedBookingId)
        .eq('partner_id', formData.host_partner_id)
        .not('settlement_id', 'is', null)
        .limit(1);
      if (error) return false;
      return (data?.length || 0) > 0;
    },
    enabled: !!formData.host_partner_id && open,
  });

  // Fetch HOST partners
  const { data: hostPartners = [] } = useQuery({
    queryKey: ["host_partners"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partners")
        .select("id, partner_name")
        .in("partner_type", ["HOST_LANDLORD", "HOST_OPERATOR"])
        .eq("status", "active");
      if (error) throw error;
      return data;
    },
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setFormData({
        surcharge_type: "CLEANING",
        description: "",
        amount: "",
        host_partner_id: hostPartnerId || "",
      });
    }
  }, [open, hostPartnerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      return;
    }

    if (!formData.host_partner_id) {
      return;
    }

    // Phụ phí Host - mặc định ROOMRISE thu, thêm vào chi phí host
    addHostSurcharge.mutate({
      unified_booking_id: unifiedBookingId,
      host_partner_id: formData.host_partner_id,
      surcharge_type: formData.surcharge_type,
      description: formData.description || undefined,
      amount,
      collector_type: "ROOMRISE", // Mặc định ROOMRISE thu
    }, {
      onSuccess: () => onOpenChange(false),
    });
  };

  const isLoading = addHostSurcharge.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm phụ phí Host</DialogTitle>
          <DialogDescription>
            Phụ phí phát sinh từ Host (dọn phòng, điện nước, nhận phòng sớm...)
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Post-settlement warning */}
          {hasSettledSegments && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
              <span className="mt-0.5">⚠️</span>
              <span>Booking đã có segment quyết toán. Phụ phí sẽ được tính vào <strong>kỳ quyết toán tiếp theo</strong>.</span>
            </div>
          )}
          <div className="space-y-2">
            <Label>Host *</Label>
            <Select
              value={formData.host_partner_id}
              onValueChange={(v) => setFormData({ ...formData, host_partner_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn Host" />
              </SelectTrigger>
              <SelectContent>
                {hostPartners.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.partner_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Loại phụ phí *</Label>
            <Select
              value={formData.surcharge_type}
              onValueChange={(v) => setFormData({ ...formData, surcharge_type: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hostSurchargeTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Số tiền (VND) *</Label>
            <CurrencyInput
              value={formData.amount}
              onChange={(v) => setFormData({ ...formData, amount: v })}
              placeholder="100.000"
            />
          </div>

          <div className="space-y-2">
            <Label>Mô tả</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Ghi chú thêm..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !formData.host_partner_id || !formData.amount}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Thêm phụ phí
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
