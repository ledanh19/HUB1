import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface MobileTaskHeaderProps {
    title: string;
    subtitle?: string;
    onBack?: () => void;
    /** Optional right-side actions (buttons, icons) */
    rightActions?: ReactNode;
    /** Optional className override */
    className?: string;
}

/**
 * Shared mobile task header — gradient top bar with back navigation.
 * Generalized from BookingDetail's MobileBookingAppBar pattern.
 *
 * Features:
 *  - Back button with 44px touch target
 *  - Title + optional subtitle
 *  - Optional right actions slot
 *  - Decorative background blobs
 */
export function MobileTaskHeader({
    title,
    subtitle,
    onBack,
    rightActions,
    className,
}: MobileTaskHeaderProps) {
    return (
        <div
            className={cn(
                "relative overflow-hidden bg-gradient-to-r from-[#0B3C5D] via-[#0E4A73] to-[#1565A0] text-white shadow-sm px-4 py-3",
                className
            )}
        >
            {/* Decorative background blobs */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
                <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5" />
            </div>

            {/* Row: Back + Title + Actions */}
            <div className="relative flex items-center min-h-[44px] gap-1">
                {onBack && (
                    <button
                        onClick={onBack}
                        className="w-11 h-11 flex items-center justify-center shrink-0 text-white rounded-full hover:bg-white/15 transition-colors active:scale-95 -ml-1.5"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                )}

                <div className="flex-1 min-w-0">
                    <h1 className="text-base font-bold tracking-tight truncate text-white">
                        {title}
                    </h1>
                    {subtitle && (
                        <p className="text-xs text-white/70 truncate">{subtitle}</p>
                    )}
                </div>

                {rightActions && (
                    <div className="flex items-center gap-1 shrink-0">
                        {rightActions}
                    </div>
                )}
            </div>
        </div>
    );
}
