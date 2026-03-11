import * as React from "react";
import { MoreHorizontal, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Button } from "./button";
import { cn } from "@/lib/utils";

export interface RowAction {
  /** Unique key for the action */
  key: string;
  /** Display label */
  label: string;
  /** Icon component */
  icon?: React.ComponentType<{ className?: string }>;
  /** Action callback */
  onClick: () => void;
  /** Whether action is disabled */
  disabled?: boolean;
  /** Tooltip when disabled */
  disabledReason?: string;
  /** Visual variant */
  variant?: "default" | "destructive";
  /** Whether to show separator after this item */
  separator?: boolean;
}

interface RowActionsProps {
  /** List of actions to display */
  actions: RowAction[];
  /** Icon orientation */
  orientation?: "horizontal" | "vertical";
  /** Custom trigger button className */
  className?: string;
  /** Alignment of dropdown */
  align?: "start" | "center" | "end";
  /** Whether the row is currently processing */
  isProcessing?: boolean;
}

/**
 * Standardized Row Actions Component
 * 
 * UX Governance Rules:
 * - Consistent dropdown menu for all row-level actions
 * - Icon + label pattern for clarity
 * - Disabled state with reason tooltip
 * - Destructive actions are visually distinct
 * 
 * Usage:
 * <RowActions
 *   actions={[
 *     { key: "view", label: "Xem chi tiết", icon: Eye, onClick: handleView },
 *     { key: "edit", label: "Sửa", icon: Edit, onClick: handleEdit },
 *     { key: "delete", label: "Xoá", icon: Trash, onClick: handleDelete, variant: "destructive" },
 *   ]}
 * />
 */
export function RowActions({
  actions,
  orientation = "horizontal",
  className,
  align = "end",
  isProcessing = false,
}: RowActionsProps) {
  const Icon = orientation === "horizontal" ? MoreHorizontal : MoreVertical;

  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 p-0 transition-all duration-150",
            "hover:bg-muted/80 focus-visible:ring-1",
            isProcessing && "opacity-50 pointer-events-none",
            className
          )}
          disabled={isProcessing}
        >
          <Icon className="h-4 w-4" />
          <span className="sr-only">Mở menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align={align} 
        className="w-48 animate-scale-in"
      >
        {actions.map((action, index) => (
          <React.Fragment key={action.key}>
            <DropdownMenuItem
              onClick={action.onClick}
              disabled={action.disabled}
              className={cn(
                "cursor-pointer transition-colors",
                action.variant === "destructive" && "text-destructive focus:text-destructive focus:bg-destructive/10"
              )}
              title={action.disabled ? action.disabledReason : undefined}
            >
              {action.icon && (
                <action.icon className="mr-2 h-4 w-4" />
              )}
              {action.label}
            </DropdownMenuItem>
            {action.separator && index < actions.length - 1 && (
              <DropdownMenuSeparator />
            )}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default RowActions;
