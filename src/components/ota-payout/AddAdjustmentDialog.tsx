import { useState, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { Loader2, ArrowDown, ArrowUp, ArrowUpDown, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAddPayoutDeduction, useOtaPayoutDetails, ADJUSTMENT_TYPES } from "@/hooks/useOtaPayouts";

const DIRECTION_ICONS = {
    negative: ArrowDown,
    positive: ArrowUp,
    any: ArrowUpDown,
} as const;

interface AddAdjustmentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    payoutId: string;
}

export function AddAdjustmentDialog({
    open,
    onOpenChange,
    payoutId,
}: AddAdjustmentDialogProps) {
    const [adjustmentType, setAdjustmentType] = useState("");
    const [reasonCategory, setReasonCategory] = useState("");
    const [amount, setAmount] = useState("");
    const [reasonNote, setReasonNote] = useState("");
    const [selectedBookingId, setSelectedBookingId] = useState("");
    const [bookingPopoverOpen, setBookingPopoverOpen] = useState(false);

    const addMutation = useAddPayoutDeduction();
    const { data: payoutDetails } = useOtaPayoutDetails(payoutId);

    const selectedType = useMemo(
        () => ADJUSTMENT_TYPES.find((t) => t.value === adjustmentType),
        [adjustmentType],
    );

    const bookingOptions = useMemo(() => {
        if (!payoutDetails) return [];
        return payoutDetails.map((d) => ({
            value: d.unified_booking_id,
            bookingCode: (d.booking_code || d.unified_booking_id).replace(/^[A-Za-z]+-/, ""),
            guestName: d.guest_name || "—",
        }));
    }, [payoutDetails]);

    const selectedBookingLabel = useMemo(() => {
        if (!selectedBookingId || selectedBookingId === "__none__") return null;
        const found = bookingOptions.find((b) => b.value === selectedBookingId);
        return found ? `${found.bookingCode} — ${found.guestName}` : selectedBookingId.slice(0, 16);
    }, [selectedBookingId, bookingOptions]);

    const handleTypeChange = (val: string) => {
        setAdjustmentType(val);
        setReasonCategory("");
    };

    const handleSubmit = async () => {
        if (!adjustmentType || !amount || !reasonNote.trim()) return;

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount === 0) return;

        const finalAmount =
            selectedType?.defaultSign === "negative"
                ? -Math.abs(numAmount)
                : selectedType?.defaultSign === "positive"
                    ? Math.abs(numAmount)
                    : numAmount;

        const reasonLabel = selectedType?.reasons.find(r => r.value === reasonCategory)?.label;
        const fullNote = reasonLabel
            ? `[${reasonLabel}] ${reasonNote.trim()}`
            : reasonNote.trim();

        await addMutation.mutateAsync({
            payout_id: payoutId,
            deduction_type: adjustmentType,
            amount: finalAmount,
            reason_note: fullNote,
            unified_booking_id: selectedBookingId && selectedBookingId !== "__none__" ? selectedBookingId : undefined,
        });

        resetForm();
        onOpenChange(false);
    };

    const resetForm = () => {
        setAdjustmentType("");
        setReasonCategory("");
        setAmount("");
        setReasonNote("");
        setSelectedBookingId("");
    };

    const isValid = adjustmentType && reasonCategory && parseFloat(amount) !== 0 && !isNaN(parseFloat(amount)) && reasonNote.trim();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md" onInteractOutside={(e) => {
                if (bookingPopoverOpen) e.preventDefault();
            }}>
                <DialogHeader>
                    <DialogTitle>Thêm điều chỉnh Payout</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Direction selector */}
                    <div className="space-y-2">
                        <Label>Loại điều chỉnh *</Label>
                        <Select value={adjustmentType} onValueChange={handleTypeChange}>
                            <SelectTrigger>
                                <SelectValue placeholder="Chọn loại điều chỉnh" />
                            </SelectTrigger>
                            <SelectContent className="z-[9999]">
                                {ADJUSTMENT_TYPES.map((type) => {
                                    const Icon = DIRECTION_ICONS[type.defaultSign];
                                    return (
                                        <SelectItem key={type.value} value={type.value}>
                                            <span className="flex items-center gap-2">
                                                <Icon className="h-3.5 w-3.5 shrink-0" />
                                                {type.label}
                                            </span>
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Reason category dropdown */}
                    {selectedType && (
                        <div className="space-y-2">
                            <Label>Lý do cụ thể *</Label>
                            <Select value={reasonCategory} onValueChange={setReasonCategory}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Chọn lý do" />
                                </SelectTrigger>
                                <SelectContent className="z-[9999]">
                                    {selectedType.reasons.map((r) => (
                                        <SelectItem key={r.value} value={r.value}>
                                            {r.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Booking selector — searchable combobox */}
                    {bookingOptions.length > 0 && (
                        <div className="space-y-2">
                            <Label>Gán cho đặt phòng</Label>
                            <Popover open={bookingPopoverOpen} onOpenChange={setBookingPopoverOpen} modal={true}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        className="w-full justify-between font-normal h-8 text-xs"
                                    >
                                        <span className="truncate">
                                            {selectedBookingLabel || "— Chung (không gán booking)"}
                                        </span>
                                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 z-[9999]" align="start">
                                    <Command>
                                        <CommandInput placeholder="Tìm mã booking hoặc tên khách..." />
                                        <CommandList>
                                            <CommandEmpty>Không tìm thấy</CommandEmpty>
                                            <CommandGroup>
                                                <CommandItem
                                                    value="__none__"
                                                    onSelect={() => {
                                                        setSelectedBookingId("");
                                                        setBookingPopoverOpen(false);
                                                    }}
                                                >
                                                    <Check className={cn("mr-2 h-3.5 w-3.5", !selectedBookingId || selectedBookingId === "__none__" ? "opacity-100" : "opacity-0")} />
                                                    — Chung (không gán booking)
                                                </CommandItem>
                                                {bookingOptions.map((opt) => (
                                                    <CommandItem
                                                        key={opt.value}
                                                        value={`${opt.bookingCode} ${opt.guestName}`}
                                                        onSelect={() => {
                                                            setSelectedBookingId(opt.value);
                                                            setBookingPopoverOpen(false);
                                                        }}
                                                    >
                                                        <Check className={cn("mr-2 h-3.5 w-3.5", selectedBookingId === opt.value ? "opacity-100" : "opacity-0")} />
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-medium">{opt.bookingCode}</span>
                                                            <span className="text-[11px] text-muted-foreground">{opt.guestName}</span>
                                                        </div>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                    )}

                    {/* Amount */}
                    <div className="space-y-2">
                        <Label>
                            Số tiền *
                            {selectedType?.defaultSign === "negative" && (
                                <span className="text-destructive ml-1 font-normal">(sẽ tự động trừ)</span>
                            )}
                            {selectedType?.defaultSign === "positive" && (
                                <span className="text-success ml-1 font-normal">(sẽ tự động cộng)</span>
                            )}
                            {selectedType?.defaultSign === "any" && (
                                <span className="text-muted-foreground ml-1 font-normal">(nhập âm/dương)</span>
                            )}
                        </Label>
                        <CurrencyInput
                            value={amount}
                            onChange={setAmount}
                            allowNegative={selectedType?.defaultSign === "any"}
                            placeholder={
                                selectedType?.defaultSign === "any"
                                    ? "VD: -50.000 hoặc 30.000"
                                    : "VD: 100.000"
                            }
                        />
                    </div>

                    {/* Reason — required, free text */}
                    <div className="space-y-2">
                        <Label>Lý do chi tiết (bắt buộc) *</Label>
                        <Textarea
                            value={reasonNote}
                            onChange={(e) => setReasonNote(e.target.value)}
                            placeholder="Nhập lý do cụ thể, VD: Chargeback booking #12345, Bù thiếu tháng 1..."
                            rows={3}
                        />
                        <p className="text-xs text-muted-foreground">
                            Mô tả rõ lý do để audit trail. Không giới hạn nội dung.
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Huỷ
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!isValid || addMutation.isPending}
                    >
                        {addMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Thêm điều chỉnh
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
