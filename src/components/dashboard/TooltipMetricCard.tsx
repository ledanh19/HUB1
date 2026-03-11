import { MetricCard, MetricCardProps } from "@/components/ui/metric-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TooltipMetricCardProps extends MetricCardProps {
  /** Tooltip text to display on hover */
  tooltip?: string;
  /** Additional items to show in tooltip as bullet points */
  tooltipItems?: string[];
  /** Show info icon next to title */
  showInfoIcon?: boolean;
}

/**
 * MetricCard wrapper với tooltip support
 * Dùng cho Dashboard finance cards để giải thích cách tính
 */
export function TooltipMetricCard({
  tooltip,
  tooltipItems,
  showInfoIcon = true,
  title,
  className,
  ...props
}: TooltipMetricCardProps) {
  // If no tooltip content, just render normal MetricCard
  if (!tooltip && (!tooltipItems || tooltipItems.length === 0)) {
    return <MetricCard title={title} className={className} {...props} />;
  }

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <div className="relative">
          <MetricCard 
            title={title} 
            className={cn(className, "group/tooltip")} 
            {...props} 
          />
          {showInfoIcon && (
            <Info className="absolute top-3 right-3 h-3.5 w-3.5 text-muted-foreground/50 opacity-0 group-hover/tooltip:opacity-100 transition-opacity" />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent 
        side="bottom" 
        className="max-w-xs text-left"
        sideOffset={5}
      >
        {tooltip && <p className="text-sm">{tooltip}</p>}
        {tooltipItems && tooltipItems.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {tooltipItems.map((item, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="text-primary/70">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// Re-export for convenience
export { MetricCard } from "@/components/ui/metric-card";
