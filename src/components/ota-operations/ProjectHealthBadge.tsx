/**
 * ProjectHealthBadge - Reusable health indicator for projects
 * 
 * Shows RED/YELLOW/GREEN status with icon
 * Can be used in list views, detail pages, cards
 */

import { Badge } from "@/components/ui/badge";
import { AlertCircle, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// TYPES
// ============================================================

export type ProjectHealth = "RED" | "YELLOW" | "GREEN";

interface ProjectHealthBadgeProps {
  health: ProjectHealth;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

// ============================================================
// CONFIG
// ============================================================

const HEALTH_CONFIG: Record<
  ProjectHealth,
  {
    label: string;
    color: string;
    bgColor: string;
    icon: typeof CheckCircle;
  }
> = {
  RED: {
    label: "Critical",
    color: "text-destructive",
    bgColor: "bg-destructive/10 border-destructive/20",
    icon: AlertCircle,
  },
  YELLOW: {
    label: "Warning",
    color: "text-warning",
    bgColor: "bg-warning/10 border-warning/20",
    icon: AlertTriangle,
  },
  GREEN: {
    label: "Healthy",
    color: "text-success",
    bgColor: "bg-success/10 border-success/20",
    icon: CheckCircle,
  },
};

// ============================================================
// COMPONENT
// ============================================================

export function ProjectHealthBadge({
  health,
  size = "md",
  showLabel = true,
  className,
}: ProjectHealthBadgeProps) {
  const config = HEALTH_CONFIG[health];
  const Icon = config.icon;

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  const textSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  if (!showLabel) {
    // Icon only mode
    return (
      <div
        className={cn(
          "inline-flex items-center justify-center rounded-full",
          config.bgColor,
          "p-1",
          className
        )}
        title={`Health: ${config.label}`}
      >
        <Icon className={cn(iconSizes[size], config.color)} />
      </div>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-1.5",
        config.bgColor,
        config.color,
        textSizes[size],
        className
      )}
    >
      <Icon className={iconSizes[size]} />
      {config.label}
    </Badge>
  );
}

// ============================================================
// HELPER: Get health emoji for text display
// ============================================================

export function getHealthEmoji(health: ProjectHealth): string {
  const emojis: Record<ProjectHealth, string> = {
    RED: "🔴",
    YELLOW: "🟡",
    GREEN: "🟢",
  };
  return emojis[health];
}
