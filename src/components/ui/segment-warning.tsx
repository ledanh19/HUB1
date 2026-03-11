/**
 * SEGMENT GOVERNANCE WARNING BANNER
 * =================================
 * 
 * Displays governance warnings for segment analysis:
 * - Multi-host bookings
 * - Segment gaps
 * - Segment overlaps (CRITICAL)
 * - Document requirements
 */

import React from "react";
import { AlertTriangle, AlertOctagon, Info, Users, Calendar, FileWarning, Home, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { GovernanceWarning } from "@/lib/segment-governance";
import { Button } from "@/components/ui/button";

interface SegmentWarningBannerProps {
  warnings: GovernanceWarning[];
  onAction?: (warning: GovernanceWarning) => void;
  compact?: boolean;
  className?: string;
}

const warningStyles = {
  CRITICAL: {
    bg: "bg-destructive/10 border-destructive/50",
    icon: AlertOctagon,
    iconColor: "text-destructive",
  },
  WARNING: {
    bg: "bg-warning/10 border-warning/50",
    icon: AlertTriangle,
    iconColor: "text-warning",
  },
  INFO: {
    bg: "bg-info/100/10 border-info/30",
    icon: Info,
    iconColor: "text-info",
  },
};

const typeIcons = {
  MULTI_HOST: Users,
  GAP: Calendar,
  OVERLAP: AlertOctagon,
  NO_SEGMENT: Home,
  DOCUMENT_REQUIRED: FileWarning,
};

export function SegmentWarningBanner({
  warnings,
  onAction,
  compact = false,
  className,
}: SegmentWarningBannerProps) {
  if (warnings.length === 0) return null;

  // Sort by severity
  const sortedWarnings = [...warnings].sort((a, b) => {
    const order = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    return order[a.level] - order[b.level];
  });

  if (compact) {
    // Show only highest priority warning
    const topWarning = sortedWarnings[0];
    const style = warningStyles[topWarning.level];
    const TypeIcon = typeIcons[topWarning.type];

    return (
      <div className={cn("flex items-center gap-2 p-2 rounded-md border text-xs", style.bg, className)}>
        <TypeIcon className={cn("h-3.5 w-3.5 flex-shrink-0", style.iconColor)} />
        <span className="flex-1 truncate">{topWarning.message}</span>
        {topWarning.actionRequired && topWarning.actionLabel && onAction && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => onAction(topWarning)}
          >
            {topWarning.actionLabel}
          </Button>
        )}
        {sortedWarnings.length > 1 && (
          <span className="text-muted-foreground">+{sortedWarnings.length - 1}</span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {sortedWarnings.map((warning, idx) => {
        const style = warningStyles[warning.level];
        const Icon = style.icon;
        const TypeIcon = typeIcons[warning.type];

        return (
          <div
            key={`${warning.type}-${idx}`}
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border",
              style.bg
            )}
          >
            <div className="flex items-center gap-2 flex-shrink-0">
              <Icon className={cn("h-4 w-4", style.iconColor)} />
              {TypeIcon !== Icon && (
                <TypeIcon className={cn("h-4 w-4", style.iconColor)} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm font-medium", style.iconColor)}>
                {warning.message}
              </p>
            </div>
            {warning.actionRequired && warning.actionLabel && onAction && (
              <Button
                size="sm"
                variant="outline"
                className="flex-shrink-0"
                onClick={() => onAction(warning)}
              >
                {warning.actionLabel}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Segment Info Badge - compact display for segment position
 */
interface SegmentInfoBadgeProps {
  segmentIndex: number;
  totalSegments: number;
  hostName?: string | null;
  isMultiHost?: boolean;
  className?: string;
}

export function SegmentInfoBadge({
  segmentIndex,
  totalSegments,
  hostName,
  isMultiHost,
  className,
}: SegmentInfoBadgeProps) {
  if (totalSegments <= 1 && !isMultiHost) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium",
        isMultiHost
          ? "bg-info/100/10 text-info border border-info/30"
          : "bg-muted text-muted-foreground",
        className
      )}
    >
      {isMultiHost && <Users className="h-3 w-3" />}
      <span>
        Segment {segmentIndex}/{totalSegments}
        {hostName && isMultiHost && ` • ${hostName}`}
      </span>
    </div>
  );
}

/**
 * Date Mode Badge - shows OTA/OPS indicator
 */
interface DateModeBadgeProps {
  mode: "OTA" | "OPS" | "FALLBACK";
  compact?: boolean;
  className?: string;
}

export function DateModeBadge({ mode, compact, className }: DateModeBadgeProps) {
  const config = {
    OTA: {
      Icon: Calendar,
      label: "OTA",
      className: "bg-primary/100/10 text-primary border-primary/30",
    },
    OPS: {
      Icon: MapPin,
      label: "OPS",
      className: "bg-success/100/10 text-success border-success/30",
    },
    FALLBACK: {
      Icon: Calendar,
      label: compact ? "OTA" : "OTA (chưa có segment)",
      className: "bg-muted text-muted-foreground border-muted",
    },
  };

  const { Icon, label, className: modeClassName } = config[mode];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border",
        modeClassName,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {!compact && label}
    </span>
  );
}

export default SegmentWarningBanner;
