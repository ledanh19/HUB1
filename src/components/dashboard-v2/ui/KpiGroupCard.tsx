import { cn } from "@/lib/utils";

export type KpiItem = {
    key: string;
    label: string;
    value: React.ReactNode;
    delta?: React.ReactNode;
    deltaClassName?: string;
};

export function KpiGroupCard({ items }: { items: KpiItem[] }) {
    return (
        <div className="w-full bg-card shadow-[0_2px_6px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.05)] border-y sm:border overflow-hidden rounded-none sm:rounded-2xl">
            <div className="grid grid-cols-2">
                {items.map((kpi, idx) => {
                    const isLeft = idx % 2 === 0;
                    const isTop = idx < 2;
                    return (
                        <div
                            key={kpi.key}
                            className={cn(
                                "p-3 sm:p-4",
                                isLeft && "border-r border-border/50",
                                isTop && "border-b border-border/50",
                            )}
                        >
                            <div className="text-[11px] font-medium text-muted-foreground">{kpi.label}</div>
                            <div className="mt-1 text-2xl font-semibold leading-tight text-foreground">{kpi.value}</div>
                            {kpi.delta ? (
                                <div className={cn("mt-1 text-xs font-semibold", kpi.deltaClassName)}>
                                    {kpi.delta}
                                </div>
                            ) : (
                                <div className="mt-1 text-xs text-muted-foreground">&nbsp;</div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
