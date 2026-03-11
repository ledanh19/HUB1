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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Loader2, Check, ChevronsUpDown, UserPlus, Info } from "lucide-react";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { createAuditLog, AuditActions } from "@/hooks/useAuditLog";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CreateManualBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Customer {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  nationality: string | null;
}

const sources = [
  { value: "Facebook", label: "Facebook" },
  { value: "TikTok", label: "TikTok" },
  { value: "Zalo", label: "Zalo" },
  { value: "Walk-in", label: "Walk-in" },
  { value: "Referral", label: "Giới thiệu" },
  { value: "Corporate", label: "Doanh nghiệp" },
  { value: "Other", label: "Khác" },
];

export function CreateManualBookingDialog({
  open,
  onOpenChange,
}: CreateManualBookingDialogProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isNewCustomer, setIsNewCustomer] = useState(true);

  const [formData, setFormData] = useState({
    guest_name: "",
    guest_phone: "",
    guest_email: "",
    nationality: "Vietnam",
    source: "Facebook",
    check_in_date: "",
    check_out_date: "",
    total_amount_net: "",
    note: "",
  });

  // Load customers when dialog opens
  useEffect(() => {
    if (open) {
      fetchCustomers();
      setSelectedCustomer(null);
      setIsNewCustomer(true);
    }
  }, [open]);

  // Update form when customer is selected
  useEffect(() => {
    if (selectedCustomer) {
      setFormData(prev => ({
        ...prev,
        guest_name: selectedCustomer.full_name,
        guest_phone: selectedCustomer.phone || "",
        guest_email: selectedCustomer.email || "",
        nationality: selectedCustomer.nationality || "Vietnam",
      }));
      setIsNewCustomer(false);
    }
  }, [selectedCustomer]);

  const fetchCustomers = async () => {
    setLoadingCustomers(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("id, full_name, phone, email, nationality")
        .order("full_name")
        .limit(100);

      if (error) throw error;
      setCustomers(data || []);
    } catch (err: any) {
      console.error("Error loading customers:", err);
    } finally {
      setLoadingCustomers(false);
    }
  };

  const calculateNights = () => {
    if (!formData.check_in_date || !formData.check_out_date) return 0;
    const checkIn = new Date(formData.check_in_date);
    const checkOut = new Date(formData.check_out_date);
    const diffTime = checkOut.getTime() - checkIn.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const generateBookingId = () => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const day = now.getDate().toString().padStart(2, "0");
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `MN-${year}${month}${day}-${random}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nights = calculateNights();
    if (nights <= 0) {
      toast.error("Ngày trả phòng phải sau ngày nhận phòng");
      return;
    }

    if (!formData.guest_name.trim()) {
      toast.error("Vui lòng nhập tên khách");
      return;
    }

    if (!formData.total_amount_net || parseFloat(formData.total_amount_net) <= 0) {
      toast.error("Vui lòng nhập tổng tiền phải thu");
      return;
    }

    setSaving(true);
    try {
      const unifiedBookingId = generateBookingId();
      const totalAmountNet = parseFloat(formData.total_amount_net) || 0;

      let customerId: string;

      // Use existing customer or create new one
      if (selectedCustomer && !isNewCustomer) {
        customerId = selectedCustomer.id;
      } else {
        const { data: customer, error: customerError } = await supabase
          .from("customers")
          .insert({
            full_name: formData.guest_name,
            phone: formData.guest_phone || null,
            email: formData.guest_email || null,
            nationality: formData.nationality || "Vietnam",
          })
          .select()
          .single();

        if (customerError) throw customerError;
        customerId = customer.id;
      }

      // Create manual booking - HOTEL_COLLECT is FIXED for manual bookings
      // Host assignment is done LATER via Segments in Booking Detail
      const { error: bookingError } = await safeMutation(() => supabase.from("manual_bookings").insert({
        unified_booking_id: unifiedBookingId,
        guest_name: formData.guest_name,
        guest_phone: formData.guest_phone || null,
        guest_email: formData.guest_email || null,
        customer_id: customerId,
        source: formData.source,
        check_in_date: formData.check_in_date,
        check_out_date: formData.check_out_date,
        nights: nights,
        booking_date: new Date().toISOString().split("T")[0],
        total_amount_net: totalAmountNet,
        total_amount_gross: totalAmountNet,
        payment_type: "HOTEL_COLLECT", // FIXED - Manual booking ONLY has HOTEL_COLLECT
        booking_status: "CONFIRMED",
        note: formData.note || null,
        created_by: user?.id,
      }));

      if (bookingError) throw bookingError;

      // Create stay record - host fields populated via Segments later
      const { error: stayError } = await safeMutation(() => supabase.from("stays").insert({
        unified_booking_id: unifiedBookingId,
        stay_status: "WAIT_ROOM",
      }));

      if (stayError) throw stayError;

      // Create audit log
      await createAuditLog({
        action: AuditActions.BOOKING_CREATED,
        entity: "booking",
        entityId: unifiedBookingId,
        afterData: {
          guest_name: formData.guest_name,
          source: formData.source,
          check_in_date: formData.check_in_date,
          check_out_date: formData.check_out_date,
          nights,
          total_amount_net: totalAmountNet,
          payment_type: "HOTEL_COLLECT",
          customer_id: customerId,
        },
      });

      toast.success("Tạo booking thành công! Vui lòng thêm Phân bổ phòng cho Host.");

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["unified_bookings"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["stays"] });

      onOpenChange(false);

      // Reset form
      setFormData({
        guest_name: "",
        guest_phone: "",
        guest_email: "",
        nationality: "Vietnam",
        source: "Facebook",
        check_in_date: "",
        check_out_date: "",
        total_amount_net: "",
        note: "",
      });
      setSelectedCustomer(null);
      setIsNewCustomer(true);

      // Navigate to new booking detail to add segments
      navigate(`/bookings/${unifiedBookingId}`);
    } catch (err: any) {
      toast.error("Lỗi tạo booking: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClearCustomer = () => {
    setSelectedCustomer(null);
    setIsNewCustomer(true);
    setFormData(prev => ({
      ...prev,
      guest_name: "",
      guest_phone: "",
      guest_email: "",
      nationality: "Vietnam",
    }));
  };

  const nights = calculateNights();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tạo Booking Manual</DialogTitle>
          <DialogDescription>
            Tạo booking từ nguồn ngoài OTA (Facebook, Walk-in, Corporate...).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Info about host assignment */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Sau khi tạo booking, bạn sẽ vào chi tiết để thêm <strong>Phân bổ phòng</strong> cho Host.
            </AlertDescription>
          </Alert>

          {/* Customer Search/Selection */}
          <div className="space-y-4 p-4 rounded-lg bg-muted/30">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Thông tin khách hàng</h3>
              {selectedCustomer && (
                <Button type="button" variant="ghost" size="sm" onClick={handleClearCustomer}>
                  Tạo khách mới
                </Button>
              )}
            </div>

            {/* Customer Search */}
            <div className="space-y-2">
              <Label>Tìm khách hàng hiện có</Label>
              <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={customerSearchOpen}
                    className="w-full justify-between"
                    type="button"
                  >
                    {selectedCustomer
                      ? `${selectedCustomer.full_name} ${selectedCustomer.phone ? `- ${selectedCustomer.phone}` : ""}`
                      : "Tìm hoặc tạo khách mới..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Tìm theo tên, SĐT..." />
                    <CommandList>
                      <CommandEmpty>
                        <div className="flex flex-col items-center gap-2 py-4">
                          <p className="text-sm text-muted-foreground">Không tìm thấy khách hàng</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setCustomerSearchOpen(false);
                              setIsNewCustomer(true);
                              setSelectedCustomer(null);
                            }}
                          >
                            <UserPlus className="mr-2 h-4 w-4" />
                            Tạo khách mới
                          </Button>
                        </div>
                      </CommandEmpty>
                      <CommandGroup heading="Khách hàng">
                        {customers.map((customer) => (
                          <CommandItem
                            key={customer.id}
                            value={`${customer.full_name} ${customer.phone || ""} ${customer.email || ""}`}
                            onSelect={() => {
                              setSelectedCustomer(customer);
                              setCustomerSearchOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedCustomer?.id === customer.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span>{customer.full_name}</span>
                              <span className="text-xs text-muted-foreground">
                                {customer.phone || ""} {customer.email ? `• ${customer.email}` : ""}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Customer Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Họ tên khách *</Label>
                <Input
                  value={formData.guest_name}
                  onChange={(e) =>
                    setFormData({ ...formData, guest_name: e.target.value })
                  }
                  placeholder="Nguyễn Văn A"
                  required
                  disabled={!!selectedCustomer && !isNewCustomer}
                />
              </div>
              <div className="space-y-2">
                <Label>Quốc tịch</Label>
                <Input
                  value={formData.nationality}
                  onChange={(e) =>
                    setFormData({ ...formData, nationality: e.target.value })
                  }
                  required
                  disabled={!!selectedCustomer && !isNewCustomer}
                />
              </div>
              <div className="space-y-2">
                <Label>Số điện thoại</Label>
                <Input
                  value={formData.guest_phone}
                  onChange={(e) =>
                    setFormData({ ...formData, guest_phone: e.target.value })
                  }
                  placeholder="0901234567"
                  disabled={!!selectedCustomer && !isNewCustomer}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.guest_email}
                  onChange={(e) =>
                    setFormData({ ...formData, guest_email: e.target.value })
                  }
                  placeholder="email@example.com"
                  disabled={!!selectedCustomer && !isNewCustomer}
                />
              </div>
            </div>
          </div>

          {/* Booking Info */}
          <div className="space-y-4 p-4 rounded-lg bg-muted/30">
            <h3 className="font-medium">Thông tin lưu trú</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nhận phòng *</Label>
                <Input
                  type="date"
                  value={formData.check_in_date}
                  onChange={(e) =>
                    setFormData({ ...formData, check_in_date: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Trả phòng *</Label>
                <Input
                  type="date"
                  value={formData.check_out_date}
                  onChange={(e) =>
                    setFormData({ ...formData, check_out_date: e.target.value })
                  }
                  required
                />
              </div>
            </div>
            {nights > 0 && (
              <p className="text-sm text-muted-foreground">
                Số đêm: <span className="font-medium text-foreground">{nights} đêm</span>
              </p>
            )}
          </div>

          {/* Source */}
          <div className="space-y-4 p-4 rounded-lg bg-muted/30">
            <h3 className="font-medium">Nguồn booking</h3>
            <div className="space-y-2">
              <Label>Nguồn *</Label>
              <Select
                value={formData.source}
                onValueChange={(v) => setFormData({ ...formData, source: v })}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Finance */}
          <div className="space-y-4 p-4 rounded-lg bg-muted/30">
            <h3 className="font-medium">Tài chính</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Số tiền phải thu (VND) *</Label>
                <CurrencyInput
                  value={formData.total_amount_net}
                  onChange={(v) =>
                    setFormData({ ...formData, total_amount_net: v })
                  }
                  placeholder="2000000"
                />
              </div>
              <div className="space-y-2">
                <Label>Hình thức thanh toán</Label>
                <Input
                  value="THU TẠI KS (Hotel Collect)"
                  disabled
                  className="bg-muted font-medium"
                />
                <p className="text-xs text-muted-foreground">
                  Manual booking chỉ có phương thức KS thu
                </p>
              </div>
            </div>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label>Ghi chú</Label>
            <Textarea
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              placeholder="Ghi chú thêm..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Tạo Booking
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
