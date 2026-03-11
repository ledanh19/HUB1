/**
 * DateAuthorityBadge Component
 * 
 * Displays date with authority level indicator (Actual > Updated > Original)
 * Shows visual distinction for modified dates vs original dates.
 * 
 * @see docs/PMS_OPERATIONS_GOVERNANCE.md for Date Authority specification
 */

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar, CalendarCheck, CalendarClock, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type StayDates,
  type DateAuthorityResult,
  resolveCheckInDate,
  resolveCheckOutDate,
  formatDisplayDate,
  formatDisplayDateTime,
  hasDateChanges,
} from "@/lib/pms-date-utils";

// === Types ===

interface DateAuthorityBadgeProps {
  /** The resolved date authority result */
  result: DateAuthorityResult;
  /** Show time along with date */
  showTime?: boolean;
  /** Size variant */
  size?: "sm" | "default" | "lg";
  /** Show authority label */
  showLabel?: boolean;
  /** Show icon */
  showIcon?: boolean;
  /** Custom className */
  className?: string;
}

interface StayDateBadgeProps {
  /** Stay dates object */
  dates: StayDates;
  /** Which date to show */
  type: "checkIn" | "checkOut";
  /** Show time along with date */
  showTime?: boolean;
  /** Size variant */
  size?: "sm" | "default" | "lg";
  /** Show authority label */
  showLabel?: boolean;
  /** Custom className */
  className?: string;
}

interface DateComparisonBadgeProps {
  /** Stay dates object */
  dates: StayDates;
  /** Compact single-line mode */
  compact?: boolean;
  /** Custom className */
  className?: string;
}

// === Icon Map ===
const AuthorityIcon: Record<string, React.FC<{ className?: string }>> = {
  actual: CalendarCheck,
  updated: CalendarClock,
  original: Calendar,
};

// === Size Config ===
const sizeConfig = {
  sm: {
    badge: "text-[11px] px-1 py-px",
    icon: "h-2.5 w-2.5",
  },
  default: {
    badge: "text-xs px-1.5 py-0.5",
    icon: "h-3.5 w-3.5",
  },
  lg: {
    badge: "text-sm px-2 py-1",
    icon: "h-4 w-4",
  },
};

// === Components ===

/**
 * Display a date with its authority level badge
 */
export const DateAuthorityBadge: React.FC<DateAuthorityBadgeProps> = ({
  result,
  showTime = false,
  size = "default",
  showLabel = true,
  showIcon = true,
  className,
}) => {
  const config = sizeConfig[size];
  const Icon = AuthorityIcon[result.authority] || Calendar;

  const dateStr = showTime
    ? formatDisplayDateTime(result.date)
    : formatDisplayDate(result.date);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            config.badge,
            result.badgeColor,
            "font-medium inline-flex items-center gap-1.5 border-0",
            className
          )}
        >
          {showIcon && <Icon className={config.icon} />}
          <span>{dateStr}</span>
          {showLabel && result.isModified && (
            <span className="opacity-70 text-caption">
              ({result.authorityLabel})
            </span>
          )}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <div className="flex flex-col gap-1">
          <span className="font-medium">Nguồn: {result.authorityLabel}</span>
          {result.isModified && (
            <span className="text-muted-foreground text-xs">
              Đã thay đổi so với ngày gốc
            </span>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

/**
 * Display check-in or check-out date with authority
 */
export const StayDateBadge: React.FC<StayDateBadgeProps> = ({
  dates,
  type,
  showTime = false,
  size = "default",
  showLabel = true,
  className,
}) => {
  const result = type === "checkIn"
    ? resolveCheckInDate(dates)
    : resolveCheckOutDate(dates);

  return (
    <DateAuthorityBadge
      result={result}
      showTime={showTime}
      size={size}
      showLabel={showLabel}
      className={className}
    />
  );
};

/**
 * Display both dates with change indicator
 */
export const DateComparisonBadge: React.FC<DateComparisonBadgeProps> = ({
  dates,
  compact = false,
  className,
}) => {
  const checkIn = resolveCheckInDate(dates);
  const checkOut = resolveCheckOutDate(dates);
  const changes = hasDateChanges(dates);

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2 text-xs", className)}>
        <StayDateBadge dates={dates} type="checkIn" size="sm" showLabel={false} />
        <span className="text-muted-foreground">→</span>
        <StayDateBadge dates={dates} type="checkOut" size="sm" showLabel={false} />
        {changes.hasAnyChange && (
          <Tooltip>
            <TooltipTrigger>
              <AlertCircle className="h-3.5 w-3.5 text-warning" />
            </TooltipTrigger>
            <TooltipContent>
              Ngày đã được thay đổi so với booking gốc
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Nhận phòng:</span>
        <StayDateBadge dates={dates} type="checkIn" size="sm" />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Trả phòng:</span>
        <StayDateBadge dates={dates} type="checkOut" size="sm" />
      </div>
    </div>
  );
};

/**
 * Inline date with change indicator icon
 */
export const InlineDateWithAuthority: React.FC<{
  dates: StayDates;
  type: "checkIn" | "checkOut";
  className?: string;
}> = ({ dates, type, className }) => {
  const result = type === "checkIn"
    ? resolveCheckInDate(dates)
    : resolveCheckOutDate(dates);

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span>{formatDisplayDate(result.date)}</span>
      {result.isModified && result.authority !== "original" && (
        <Tooltip>
          <TooltipTrigger>
            <Info className="h-3.5 w-3.5 text-warning" />
          </TooltipTrigger>
          <TooltipContent>
            {result.authorityLabel}
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );
};

/**
 * Warning banner for date changes
 */
export const DateChangeWarning: React.FC<{
  dates: StayDates;
  className?: string;
}> = ({ dates, className }) => {
  const changes = hasDateChanges(dates);

  if (!changes.hasAnyChange) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 p-2 rounded-md",
        "bg-warning/10 border border-warning/20 text-warning",
        "",
        className
      )}
    >
      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="text-xs">
        {changes.checkInChanged && changes.checkOutChanged
          ? "Ngày nhận phòng và trả phòng đã được thay đổi"
          : changes.checkInChanged
            ? "Ngày nhận phòng đã được thay đổi"
            : "Ngày trả phòng đã được thay đổi"}
      </span>
    </div>
  );
};

export default DateAuthorityBadge;
