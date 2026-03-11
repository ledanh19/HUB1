import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Lock, Shield } from "lucide-react";
import { useInventoryVersion } from "@/hooks/useInventoryEnterprise";

export function InventoryVersionBadge() {
  const { data: version, isLoading } = useInventoryVersion();

  if (isLoading || !version) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          variant="outline" 
          className="gap-1.5 font-mono text-xs border-primary/30 bg-primary/5 text-primary cursor-help"
        >
          <Lock className="h-3 w-3" />
          {version.version}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-sm">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="font-semibold">Version {version.version}</span>
          </div>
          {version.description && (
            <p className="text-sm text-muted-foreground">
              {version.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Updated: {new Date(version.updated_at).toLocaleDateString('vi-VN')}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
