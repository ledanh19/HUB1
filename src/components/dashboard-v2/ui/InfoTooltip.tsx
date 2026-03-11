/**
 * InfoTooltip — Tap-friendly info icon that opens a Popover with metric explanation.
 * Works on both mobile (tap) and desktop (click).
 */
import { useState, useRef, useEffect } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
    title: string;
    children: React.ReactNode;
    className?: string;
}

export function InfoTooltip({ title, children, className }: InfoTooltipProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Close on outside click/tap
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent | TouchEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        document.addEventListener("touchstart", handler);
        return () => {
            document.removeEventListener("mousedown", handler);
            document.removeEventListener("touchstart", handler);
        };
    }, [open]);

    return (
        <div ref={ref} className={cn("relative inline-flex", className)}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center justify-center h-5 w-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                aria-label={`Giải thích: ${title}`}
            >
                <Info className="h-3.5 w-3.5" />
            </button>
            {open && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-[280px] rounded-xl bg-slate-900 text-white shadow-lg p-3 text-xs leading-relaxed animate-in fade-in-0 zoom-in-95 duration-150">
                    <p className="font-semibold text-[13px] mb-2">{title}</p>
                    {children}
                </div>
            )}
        </div>
    );
}
