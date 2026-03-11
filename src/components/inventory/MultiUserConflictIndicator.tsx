import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Users, UserX } from "lucide-react";
import { useConflictDetection } from "@/hooks/useInventoryEnterprise";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

interface MultiUserConflictIndicatorProps {
  propertyId?: string;
  cellKey?: string;
  showBadge?: boolean;
}

export function MultiUserConflictIndicator({ 
  propertyId, 
  cellKey,
  showBadge = false 
}: MultiUserConflictIndicatorProps) {
  const { locks, checkConflict, hasConflicts } = useConflictDetection(propertyId);

  // Show global indicator
  if (!cellKey) {
    if (!hasConflicts) return null;
    
    const otherUsers = new Set(locks.map(l => l.locked_by)).size;
    
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="gap-1.5 cursor-help">
            <Users className="h-3 w-3" />
            {otherUsers} user{otherUsers > 1 ? 's' : ''} editing
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm">
            {otherUsers} other user{otherUsers > 1 ? 's are' : ' is'} currently editing cells.
            <br />
            Conflicting cells will show a warning indicator.
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  // Show cell-specific indicator
  const conflict = checkConflict(cellKey);
  if (!conflict) return null;

  if (showBadge) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="absolute -top-1 -right-1 z-10">
            <div className="h-3 w-3 rounded-full bg-warning/100 border-2 border-background animate-pulse" />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex items-center gap-2">
            <UserX className="h-4 w-4 text-warning" />
            <div>
              <p className="font-medium">Being edited</p>
              <p className="text-xs text-muted-foreground">
                Since {formatDistanceToNow(new Date(conflict.lockedAt), { 
                  addSuffix: true,
                  locale: vi 
                })}
              </p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-1 text-warning">
      <UserX className="h-3 w-3" />
      <span className="text-xs">Editing...</span>
    </div>
  );
}
