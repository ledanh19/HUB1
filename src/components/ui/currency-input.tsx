import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Parse a formatted string (e.g. "1.234.567") back to a raw number.
 * Strips everything except digits and a leading minus sign.
 */
function parseFormattedValue(formatted: string, allowNegative: boolean): number {
    if (!formatted) return 0;
    const cleaned = allowNegative
        ? formatted.replace(/[^\d-]/g, "").replace(/(?!^)-/g, "")
        : formatted.replace(/\D/g, "");
    return parseInt(cleaned, 10) || 0;
}

/**
 * Format a raw number to Vietnamese style: 1234567 → "1.234.567"
 */
function formatVND(value: number): string {
    if (value === 0) return "";
    const abs = Math.abs(value);
    const formatted = abs.toLocaleString("vi-VN");
    return value < 0 ? `-${formatted}` : formatted;
}

export interface CurrencyInputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
    /** Raw numeric value (e.g. 1234567) */
    value: string | number;
    /** Called with the raw numeric string (e.g. "1234567") */
    onChange: (raw: string) => void;
    /** Allow negative values (default: false) */
    allowNegative?: boolean;
    /** Currency suffix shown inside the input (default: "₫") */
    suffix?: string;
    /** Hide the suffix (default: false) */
    hideSuffix?: boolean;
}

/**
 * CurrencyInput — Vietnamese currency input with live formatting.
 *
 * Displays "1.234.567 ₫" as the user types, but onChange returns
 * the raw numeric string "1234567" for easy parseFloat.
 *
 * @example
 * <CurrencyInput value={amount} onChange={setAmount} placeholder="VD: 100.000" />
 */
const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
    (
        {
            className,
            value,
            onChange,
            allowNegative = false,
            suffix = "₫",
            hideSuffix = false,
            onFocus,
            onBlur,
            ...props
        },
        ref,
    ) => {
        const [isFocused, setIsFocused] = React.useState(false);
        const innerRef = React.useRef<HTMLInputElement>(null);

        // Merge refs
        React.useImperativeHandle(ref, () => innerRef.current!);

        // Parse the raw value for display
        const rawNum = typeof value === "number" ? value : parseFormattedValue(String(value), allowNegative);
        const displayValue = rawNum === 0 && String(value) === "" ? "" : formatVND(rawNum);

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const input = e.target.value;

            // Allow empty
            if (!input || input === "-") {
                onChange(input === "-" && allowNegative ? "-" : "");
                return;
            }

            const parsed = parseFormattedValue(input, allowNegative);
            onChange(String(parsed));
        };

        const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
            setIsFocused(true);
            onFocus?.(e);
        };

        const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
            setIsFocused(false);
            onBlur?.(e);
        };

        // Handle paste: strip formatting
        const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
            e.preventDefault();
            const pasted = e.clipboardData.getData("text");
            const parsed = parseFormattedValue(pasted, allowNegative);
            if (parsed !== 0 || pasted.trim() === "0") {
                onChange(String(parsed));
            }
        };

        const showSuffix = !hideSuffix && displayValue !== "";

        return (
            <div className="relative">
                <input
                    ref={innerRef}
                    type="text"
                    inputMode="numeric"
                    className={cn(
                        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                        showSuffix && "pr-8",
                        className,
                    )}
                    value={displayValue}
                    onChange={handleChange}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onPaste={handlePaste}
                    autoComplete="off"
                    {...props}
                />
                {showSuffix && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none select-none">
                        {suffix}
                    </span>
                )}
            </div>
        );
    },
);

CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput, parseFormattedValue, formatVND };
