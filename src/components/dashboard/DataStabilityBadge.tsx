import { Badge } from "@/components/ui/badge";
import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DATA_STABILITY } from "@/constants/dashboard_glossary";

type StabilityType = "realtime" | "locked" | "estimated";

interface DataStabilityBadgeProps {
  type: StabilityType;
  size?: "sm" | "md";
}

export function DataStabilityBadge({ type, size = "sm" }: DataStabilityBadgeProps) {
  const config = {
    realtime: {
      label: DATA_STABILITY.REALTIME.label,
      description: DATA_STABILITY.REALTIME.description,
      className: "bg-success/100/10 text-success border-success/20",
    },
    locked: {
      label: DATA_STABILITY.LOCKED.label,
      description: DATA_STABILITY.LOCKED.description,
      className: "bg-info/100/10 text-info border-info/20",
    },
    estimated: {
      label: DATA_STABILITY.ESTIMATED.label,
      description: DATA_STABILITY.ESTIMATED.description,
      className: "bg-warning/100/10 text-warning border-warning/20",
    },
  };

  const { label, description, className } = config[type];
  const sizeClass = size === "sm" ? "text-micro px-1.5 py-0" : "text-micro px-2 py-0.5";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`${className} ${sizeClass} font-normal cursor-help`}>
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {description}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ========== TIME SCOPE LABEL ==========
interface TimeScopeLabelProps {
  from: string;
  to: string;
  type?: "period" | "mtd" | "today";
}

export function TimeScopeLabel({ from, to, type = "period" }: TimeScopeLabelProps) {
  const labels = {
    today: `Hôm nay (${from})`,
    mtd: `MTD: ${from} → ${to}`,
    period: from === to ? from : `${from} → ${to}`,
  };

  return (
    <span className="text-micro text-muted-foreground">
      {labels[type]}
    </span>
  );
}

// ========== SECTION HEADER ==========
interface SectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  tooltip?: string;
  action?: React.ReactNode;
}

export function SectionHeader({ icon, title, badge, tooltip, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h3 className="text-sm md:text-base font-medium">{title}</h3>
        {badge}
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {action}
    </div>
  );
}
