import { OtaWorkType, WORK_TYPE_CONFIG } from "@/lib/otaOps";
import { cn } from "@/lib/utils";

interface WorkTypeBadgeProps {
  workType: OtaWorkType;
  showIcon?: boolean;
  className?: string;
}

export function WorkTypeBadge({ 
  workType, 
  showIcon = true,
  className 
}: WorkTypeBadgeProps) {
  const config = WORK_TYPE_CONFIG[workType];
  
  if (!config) {
    return null;
  }
  
  return (
    <span 
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium",
        config.badgeColor,
        className
      )}
    >
      {showIcon && <span>{config.icon}</span>}
      <span>{config.labelVi}</span>
    </span>
  );
}

export function WorkTypeIndicator({ 
  workType 
}: { workType: OtaWorkType }) {
  const config = WORK_TYPE_CONFIG[workType];
  
  if (!config) {
    return null;
  }
  
  return (
    <span title={config.labelVi} className="text-base">
      {config.icon}
    </span>
  );
}
