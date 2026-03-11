/**
 * ResponsibleOwnerBadge Component
 * 
 * Displays the responsible owner and last handler for a booking.
 * Used in Booking Center (list), Booking Detail, and Ops pages.
 * 
 * Display Rules:
 * - Owner = text + icon 👤
 * - Last handler = tooltip / subline
 * - Freshness: 🟢 < 24h | 🟡 24-72h | 🔴 > 72h
 */

import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { User, Clock, UserCheck, AlertCircle, UserPlus, Edit } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MetaCard,
  MetaBlock,
  MetaLabel,
  MetaPrimaryText,
  MetaSecondaryText,
  MetaIcon,
  MetaDivider,
} from "@/components/meta";
import {
  type OwnershipInfo,
  type ResponsibleOwner,
  type LastHandler,
  DEPARTMENT_LABELS,
  DEPARTMENT_COLORS,
  calculateFreshness,
  formatRelativeTime,
  FRESHNESS_CONFIG,
} from "@/lib/responsible-owner-types";

// === TYPES ===

interface ResponsibleOwnerBadgeProps {
  /** Ownership info from useResponsibleOwner hook */
  ownershipInfo: OwnershipInfo;
  /** Display variant */
  variant?: "compact" | "full" | "inline";
  /** Show last handler info */
  showLastHandler?: boolean;
  /** Show freshness indicator */
  showFreshness?: boolean;
  /** Custom className */
  className?: string;
}

interface OwnerDisplayProps {
  owner: ResponsibleOwner;
  variant?: "compact" | "full" | "inline";
  className?: string;
}

interface LastHandlerDisplayProps {
  handler: LastHandler;
  showFreshness?: boolean;
  variant?: "compact" | "full" | "inline";
  className?: string;
}

// === SUB-COMPONENTS ===

/**
 * Display responsible owner with department badge
 */
export const OwnerDisplay: React.FC<OwnerDisplayProps> = ({
  owner,
  variant = "compact",
  className,
}) => {
  const departmentColor = DEPARTMENT_COLORS[owner.department];
  const departmentLabel = DEPARTMENT_LABELS[owner.department];

  if (variant === "inline") {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs", className)}>
        <User className="h-3 w-3 text-muted-foreground" />
        <span className="font-medium">{owner.userName}</span>
        <Badge variant="outline" className={cn("text-xs px-1.5 py-0", departmentColor)}>
          {departmentLabel}
        </Badge>
      </span>
    );
  }

  if (variant === "full") {
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <div className="flex items-center gap-2">
          <MetaIcon icon={UserCheck} className="text-primary" />
          <MetaPrimaryText>{owner.userName}</MetaPrimaryText>
          <Badge variant="outline" className={cn("h-5 px-1.5 leading-none text-micro", departmentColor)}>
            {departmentLabel}
          </Badge>
        </div>
        <MetaSecondaryText className="pl-6 block">
          Gán lúc: {formatRelativeTime(owner.assignedAt)}
          {owner.assignedBy === "MANUAL" && " (thủ công)"}
        </MetaSecondaryText>
      </div>
    );
  }

  // Compact (default)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("flex items-center gap-1.5 text-xs", className)}>
          <User className="h-3 w-3 text-muted-foreground" />
          <span className="font-medium truncate max-w-[120px]">{owner.userName}</span>
          <Badge variant="outline" className={cn("text-micro px-1 py-0", departmentColor)}>
            {departmentLabel}
          </Badge>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{owner.userName}</span>
          <span className="text-muted-foreground text-xs">
            {departmentLabel} • Gán {formatRelativeTime(owner.assignedAt)}
          </span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

/**
 * Display last handler with freshness
 */
export const LastHandlerDisplay: React.FC<LastHandlerDisplayProps> = ({
  handler,
  showFreshness = true,
  variant = "compact",
  className,
}) => {
  const freshness = calculateFreshness(handler.timestamp);
  const freshnessConfig = FRESHNESS_CONFIG[freshness];

  if (variant === "inline") {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
        {showFreshness && <span>{freshnessConfig.icon}</span>}
        <span>{handler.userName}</span>
        <span>•</span>
        <span>{handler.action}</span>
        <span>•</span>
        <span>{formatRelativeTime(handler.timestamp)}</span>
      </span>
    );
  }

  if (variant === "full") {
    const handlerName = handler.userName === '—' || handler.userName === '-' || !handler.userName
      ? 'Hệ thống'
      : handler.userName;

    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <div className="flex items-center gap-2">
          <MetaIcon icon={Clock} />
          <MetaPrimaryText className="font-medium">{handlerName}</MetaPrimaryText>
          {showFreshness && (
            <span className={cn("text-xs font-medium flex items-center gap-1", freshnessConfig.color)}>
              <span>{freshnessConfig.icon}</span>
              <span>{freshnessConfig.label}</span>
            </span>
          )}
        </div>
        <MetaSecondaryText className="pl-6 block">
          {handler.action} ({formatRelativeTime(handler.timestamp)})
        </MetaSecondaryText>
      </div>
    );
  }

  // Compact (default)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
          {showFreshness && <span>{freshnessConfig.icon}</span>}
          <span className="truncate max-w-[150px]">
            {handler.action} • {formatRelativeTime(handler.timestamp)}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-sm">
        <div className="flex flex-col gap-0.5">
          <span>{handler.userName}</span>
          <span className="text-muted-foreground text-xs">
            {handler.action} • {formatRelativeTime(handler.timestamp)}
          </span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

/**
 * "Not Assigned" placeholder
 */
export const NotAssignedBadge: React.FC<{ className?: string; variant?: "compact" | "full" | "inline" }> = ({
  className,
  variant = "compact",
}) => {
  if (variant === "full") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <MetaIcon icon={AlertCircle} />
        <MetaSecondaryText>Chưa gán người phụ trách</MetaSecondaryText>
      </div>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
      <User className="h-3 w-3" />
      <span className="italic">Chưa gán</span>
    </span>
  );
};

// === MAIN COMPONENT ===

/**
 * Main component to display responsible owner and last handler
 */
export const ResponsibleOwnerBadge: React.FC<ResponsibleOwnerBadgeProps> = ({
  ownershipInfo,
  variant = "compact",
  showLastHandler = true,
  showFreshness = true,
  className,
}) => {
  const { responsibleOwner, lastHandler, isOwnerAssigned } = ownershipInfo;

  if (variant === "full") {
    return (
      <div className={className}>
        <MetaBlock>
          <MetaLabel>Phụ trách</MetaLabel>
          {isOwnerAssigned && responsibleOwner ? (
            <OwnerDisplay owner={responsibleOwner} variant="full" />
          ) : (
            <NotAssignedBadge variant="full" />
          )}
        </MetaBlock>

        {showLastHandler && lastHandler && (
          <>
            <MetaDivider />
            <MetaBlock>
              <MetaLabel>Hoạt động gần nhất</MetaLabel>
              <LastHandlerDisplay
                handler={lastHandler}
                showFreshness={showFreshness}
                variant="full"
              />
            </MetaBlock>
          </>
        )}
      </div>
    );
  }

  // Compact / Inline
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      {/* Owner */}
      <div className="flex items-center gap-1">
        <User className="h-3 w-3 text-muted-foreground" />
        {isOwnerAssigned && responsibleOwner ? (
          <OwnerDisplay owner={responsibleOwner} variant={variant} />
        ) : (
          <NotAssignedBadge variant={variant} />
        )}
      </div>

      {/* Last Handler (subline) */}
      {showLastHandler && lastHandler && (
        <LastHandlerDisplay
          handler={lastHandler}
          showFreshness={showFreshness}
          variant={variant}
        />
      )}
    </div>
  );
};

// === CONVENIENCE COMPONENTS ===

/**
 * For Booking List cards/rows - most compact
 */
export const BookingOwnerCell: React.FC<{
  ownershipInfo: OwnershipInfo;
  className?: string;
}> = ({ ownershipInfo, className }) => (
  <ResponsibleOwnerBadge
    ownershipInfo={ownershipInfo}
    variant="compact"
    showLastHandler={true}
    showFreshness={true}
    className={className}
  />
);

/**
 * For Booking Detail header/section - with assign button
 */
/**
 * For Booking Detail header/section — caller MUST wrap in MetaCard.
 * Renders owner badge + optional assign button, no card container.
 */
export const BookingOwnerSection: React.FC<{
  ownershipInfo: OwnershipInfo;
  bookingId?: string;
  className?: string;
  showAssignButton?: boolean;
  onAssignClick?: () => void;
}> = ({ ownershipInfo, bookingId, className, showAssignButton = true, onAssignClick }) => (
  <div className={cn("flex flex-col gap-4", className)}>
    <ResponsibleOwnerBadge
      ownershipInfo={ownershipInfo}
      variant="full"
      showLastHandler={true}
      showFreshness={true}
    />
    {showAssignButton && onAssignClick && (
      <Button
        variant="outline"
        size="sm"
        onClick={onAssignClick}
        className="w-full bg-background"
      >
        {ownershipInfo.isOwnerAssigned ? (
          <>
            <Edit className="h-4 w-4 mr-2" />
            Chuyển giao phụ trách
          </>
        ) : (
          <>
            <UserPlus className="h-4 w-4 mr-2" />
            Gán người phụ trách
          </>
        )}
      </Button>
    )}
  </div>
);

/**
 * For Ops list - inline compact
 */
export const OpsOwnerBadge: React.FC<{
  ownershipInfo: OwnershipInfo;
  className?: string;
}> = ({ ownershipInfo, className }) => (
  <ResponsibleOwnerBadge
    ownershipInfo={ownershipInfo}
    variant="inline"
    showLastHandler={false}
    showFreshness={false}
    className={className}
  />
);

export default ResponsibleOwnerBadge;
