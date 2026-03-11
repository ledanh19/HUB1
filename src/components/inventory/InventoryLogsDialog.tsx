import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useInventoryLogs } from "@/hooks/useInventory";

interface InventoryLogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId?: string;
}

export function InventoryLogsDialog({
  open,
  onOpenChange,
  propertyId,
}: InventoryLogsDialogProps) {
  const { data: logs = [], isLoading } = useInventoryLogs(propertyId);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Inventory Logs</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1">
          <div className="space-y-2 pr-4">
            {isLoading ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No logs available
              </div>
            ) : (
              logs.map((log: Record<string, unknown>) => (
                <div
                  key={log.id as string}
                  className="border rounded-lg p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{log.action as string}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(log.created_at as string), 'dd/MM/yyyy HH:mm:ss')}
                      </span>
                    </div>
                  </div>
                  {log.after_data && (
                    <pre className="text-xs text-muted-foreground mt-2 bg-muted p-2 rounded overflow-auto max-h-24">
                      {JSON.stringify(log.after_data, null, 2)}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
