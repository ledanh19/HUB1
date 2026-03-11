import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

export interface HealthAlert {
    label: string;
    value: number;
    ratio: number;
    action?: string;
}

function getSeverity(ratio: number): "green" | "yellow" | "red" {
    if (ratio > 0.15) return "red";
    if (ratio > 0.05) return "yellow";
    return "green";
}

const PILL_STYLE = {
    green: "bg-emerald-50/60 text-emerald-700 border-emerald-200/50",
    yellow: "bg-amber-50/60 text-amber-700 border-amber-200/50",
    red: "bg-red-50/60 text-red-700 border-red-200/50",
};

interface HealthBarProps {
    alerts: HealthAlert[];
    periodLabel?: string;
    className?: string;
}

export function HealthBar({ alerts, periodLabel, className }: HealthBarProps) {
    const { appNavigate } = useAppNavigate();
    const activeAlerts = alerts.filter((a) => a.value > 0);
    if (activeAlerts.length === 0) return null;

    return (
        <div
            className={cn(
                "flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 rounded-none sm:rounded-xl border-y border-x-0 sm:border border-amber-200/60 bg-amber-50/70 p-3 sm:px-4 sm:py-3",
                className
            )}
        >
            {/* Header row */}
            <div className="flex items-center gap-2 shrink-0">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                    Cần xử lý
                </span>
                {periodLabel && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                        • {periodLabel}
                    </span>
                )}
            </div>

            {/* Alert pills — gracefully wraps and fills remaining space */}
            <div className="flex items-center gap-2 flex-wrap">
                {activeAlerts.map((alert) => {
                    const sev = getSeverity(alert.ratio);
                    return (
                        <button
                            key={alert.label}
                            onClick={() => alert.action && appNavigate(alert.action)}
                            className={cn(
                                "dv2-alert-pill inline-flex items-center gap-1.5 rounded-full border px-2 py-1 sm:px-3 sm:py-1 text-xs font-medium",
                                "whitespace-nowrap",
                                "hover:shadow-sm hover:-translate-y-0.5 active:scale-[0.97]",
                                "transition-transform duration-150 ease-out",
                                PILL_STYLE[sev]
                            )}
                        >
                            <span className="font-bold tabular-nums">{alert.value}</span>
                            {alert.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
