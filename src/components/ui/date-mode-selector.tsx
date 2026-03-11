/**
 * DATE MODE SELECTOR
 * ==================
 * 
 * UI component for switching between date filter modes:
 * - 📅 OTA: Filter by booking check-in/check-out dates
 * - 📍 OPS: Filter by segment date_from/date_to  
 * - 🔁 COMBINED: Include records matching either OTA or OPS
 */

import React from "react";
import { cn } from "@/lib/utils";
import { DateMode } from "@/lib/segment-governance";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Calendar, MapPin, Layers } from "lucide-react";

interface DateModeSelectorProps {
  value: DateMode;
  onChange: (mode: DateMode) => void;
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
}

const modeConfig = {
  OTA: {
    Icon: Calendar,
    label: "OTA",
    description: "Lọc theo ngày nhận phòng/trả phòng của booking (từ OTA)",
    shortLabel: "OTA",
  },
  OPS: {
    Icon: MapPin,
    label: "OPS",
    description: "Lọc theo ngày segment (ngày vận hành thực tế)",
    shortLabel: "OPS",
  },
  COMBINED: {
    Icon: Layers,
    label: "Tất cả",
    description: "Hiển thị cả OTA và OPS (có thể trùng)",
    shortLabel: "All",
  },
};

export function DateModeSelector({
  value,
  onChange,
  disabled = false,
  size = "default",
  className,
}: DateModeSelectorProps) {
  return (
    <TooltipProvider>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(v) => v && onChange(v as DateMode)}
        disabled={disabled}
        className={cn(
          "inline-flex rounded-md border bg-background p-0.5",
          className
        )}
      >
        {(Object.keys(modeConfig) as DateMode[]).map((mode) => {
          const config = modeConfig[mode];
          const IconComponent = config.Icon;
          return (
            <Tooltip key={mode}>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value={mode}
                  aria-label={config.label}
                  className={cn(
                    "px-2.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
                    size === "sm" ? "h-7 text-xs" : "h-8 text-sm"
                  )}
                >
                  <IconComponent className="h-4 w-4 mr-1" />
                  {size !== "sm" && config.label}
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[200px]">
                <div className="flex items-center gap-1">
                  <IconComponent className="h-3 w-3" />
                  <span className="font-medium">{config.shortLabel}</span>
                </div>
                <p className="text-xs text-muted-foreground">{config.description}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </ToggleGroup>
    </TooltipProvider>
  );
}

/**
 * Compact Date Mode Display (read-only badge)
 */
interface DateModeDisplayProps {
  mode: DateMode;
  className?: string;
}

export function DateModeDisplay({ mode, className }: DateModeDisplayProps) {
  const config = modeConfig[mode];

  const colors = {
    OTA: "bg-primary/100/10 text-primary border-primary/30",
    OPS: "bg-success/100/10 text-success border-success/30",
    COMBINED: "bg-info/100/10 text-info border-info/30",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border",
        colors[mode],
        className
      )}
    >
      <config.Icon className="h-3 w-3" />
      <span>{config.label}</span>
    </span>
  );
}

export default DateModeSelector;
