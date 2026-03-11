import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Loader2, Info, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCreateOtaPayout, OTA_SOURCES, useOtaPropertyIdsBySource } from "@/hooks/useOtaPayouts";

interface CreatePayoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (payoutId: string) => void;
}

export function CreatePayoutDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreatePayoutDialogProps) {
  const [otaSource, setOtaSource] = useState("");
  const [otaPropertyId, setOtaPropertyId] = useState("");
  const [payoutDate, setPayoutDate] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [providerPayoutId, setProviderPayoutId] = useState("");

  const createMutation = useCreateOtaPayout();
  const { data: otaPropertyIds = [], isLoading: loadingPropertyIds } = useOtaPropertyIdsBySource(otaSource);

  // Reset ota_property_id when OTA source changes
  useEffect(() => {
    setOtaPropertyId("");
  }, [otaSource]);

  const handleSubmit = async () => {
    if (!otaSource || !payoutDate || !otaPropertyId) {
      return;
    }

    const result = await createMutation.mutateAsync({
      ota_source: otaSource,
      payout_date: payoutDate,
      payout_period_from: periodFrom || undefined,
      payout_period_to: periodTo || undefined,
      payout_method: 'BANK_TRANSFER',
      ota_property_id: otaPropertyId,
      provider_payout_id: providerPayoutId?.trim() || undefined,
    });

    onOpenChange(false);
    resetForm();
    onSuccess?.(result.id);
  };

  const resetForm = () => {
    setOtaSource("");
    setOtaPropertyId("");
    setPayoutDate("");
    setPeriodFrom("");
    setPeriodTo("");
    setProviderPayoutId("");
  };

  const isValid = otaSource && payoutDate && otaPropertyId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tạo OTA Payout (Theo dõi)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Warning about internal tracking */}
          <div className="bg-info/10 dark:bg-info/10 border border-info/20 dark:border-info rounded-lg p-3 text-sm text-info">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <strong>Lưu ý:</strong> Đây là hồ sơ theo dõi kỳ vọng tiền từ OTA.
                <br />
                <span className="text-xs opacity-80">
                  Phương thức thanh toán và tài khoản nhận sẽ được chọn khi <strong>ghi nhận tiền về</strong>.
                </span>
              </div>
            </div>
          </div>

          {/* OTA Source */}
          <div className="space-y-2">
            <Label>OTA Channel *</Label>
            <Select value={otaSource} onValueChange={setOtaSource}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn OTA" />
              </SelectTrigger>
              <SelectContent>
                {OTA_SOURCES.map((ota) => (
                  <SelectItem key={ota.value} value={ota.value}>
                    {ota.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* OTA Property ID - Searchable Combobox */}
          <div className="space-y-2">
            <Label>ID chỗ nghỉ OTA *</Label>
            <PropertyIdCombobox
              value={otaPropertyId}
              onValueChange={setOtaPropertyId}
              options={otaPropertyIds}
              disabled={!otaSource || loadingPropertyIds}
              placeholder={
                !otaSource ? "Chọn OTA Channel trước" :
                loadingPropertyIds ? "Đang tải..." :
                otaPropertyIds.length === 0 ? "Không tìm thấy ID" :
                "Tìm hoặc chọn ID chỗ nghỉ OTA"
              }
            />
            {otaSource && !loadingPropertyIds && otaPropertyIds.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Không tìm thấy ID chỗ nghỉ OTA nào cho {otaSource}. Kiểm tra lại dữ liệu booking.
              </p>
            )}
          </div>

          {/* Payout Date */}
          <div className="space-y-2">
            <Label>Ngày payout *</Label>
            <Input
              type="date"
              value={payoutDate}
              onChange={(e) => setPayoutDate(e.target.value)}
            />
          </div>

          {/* Period */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Kỳ từ ngày</Label>
              <Input
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Đến ngày</Label>
              <Input
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
              />
            </div>
          </div>
          {/* ID Payout (từ OTA) */}
          <div className="space-y-2">
            <Label>ID Payout (từ OTA)</Label>
            <Input
              value={providerPayoutId}
              onChange={(e) => setProviderPayoutId(e.target.value)}
              placeholder="Mã payout từ Booking.com, Agoda..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Tạo payout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PropertyIdCombobox({
  value,
  onValueChange,
  options,
  disabled,
  placeholder,
}: {
  value: string;
  onValueChange: (val: string) => void;
  options: string[];
  disabled: boolean;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground"
          )}
        >
          {value || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Tìm ID chỗ nghỉ..." />
          <CommandList>
            <CommandEmpty>Không tìm thấy.</CommandEmpty>
            <CommandGroup>
              {options.map((id) => (
                <CommandItem
                  key={id}
                  value={id}
                  onSelect={() => {
                    onValueChange(id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="font-mono text-sm">{id}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
