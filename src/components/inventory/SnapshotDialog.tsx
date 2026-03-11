import { useState } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, Calendar, Database, Clock, Download, Eye } from "lucide-react";
import { useInventorySnapshots, useCreateSnapshot, useSnapshotDetail, InventorySnapshot } from "@/hooks/useInventoryEnterprise";
import { toast } from "sonner";

interface SnapshotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId?: string;
}

export function SnapshotDialog({ open, onOpenChange, propertyId }: SnapshotDialogProps) {
  const { data: snapshots = [], isLoading } = useInventorySnapshots(propertyId);
  const createSnapshot = useCreateSnapshot();
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | undefined>();
  const { data: selectedSnapshot } = useSnapshotDetail(selectedSnapshotId);

  const handleCreateSnapshot = () => {
    if (!propertyId) return;
    createSnapshot.mutate(propertyId);
  };

  const handleExportSnapshot = (snapshot: InventorySnapshot) => {
    const blob = new Blob([JSON.stringify(snapshot.snapshot_data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-snapshot-${format(new Date(snapshot.snapshot_time), 'yyyy-MM-dd-HHmm')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Snapshot exported');
  };

  // Get data array length safely
  const getDataLength = (data: unknown): number => {
    if (Array.isArray(data)) return data.length;
    if (data && typeof data === 'object') return Object.keys(data).length;
    return 0;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Inventory Snapshots
          </DialogTitle>
          <DialogDescription>
            Daily snapshots for audit, dispute resolution, and historical reference.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Create Snapshot Button */}
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Snapshots are created automatically at end of day.
            </p>
            <Button 
              onClick={handleCreateSnapshot}
              disabled={createSnapshot.isPending || !propertyId}
              size="sm"
            >
              <Camera className="h-4 w-4 mr-2" />
              Create Now
            </Button>
          </div>

          {/* Snapshot List */}
          <ScrollArea className="h-[400px] border rounded-lg">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1,2,3].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : snapshots.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Camera className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p>No snapshots yet</p>
                <p className="text-sm">Create the first snapshot to start tracking.</p>
              </div>
            ) : (
              <div className="divide-y">
                {snapshots.map(snapshot => {
                  const dataLength = getDataLength(snapshot.snapshot_data);
                  return (
                    <div 
                      key={snapshot.id}
                      className="p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Calendar className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {format(new Date(snapshot.snapshot_time), 'EEEE, dd/MM/yyyy', { locale: vi })}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              <span>
                                {format(new Date(snapshot.snapshot_time), 'HH:mm:ss')}
                              </span>
                              <span>·</span>
                              <span className="capitalize">{snapshot.snapshot_type}</span>
                              {dataLength > 0 && (
                                <>
                                  <span>·</span>
                                  <Database className="h-3 w-3" />
                                  <span>{dataLength.toLocaleString()} items</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {snapshot.snapshot_type}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedSnapshotId(snapshot.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleExportSnapshot(snapshot)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Selected Snapshot Preview */}
          {selectedSnapshot && (
            <div className="border rounded-lg p-4 bg-muted/30">
              <h4 className="font-medium mb-2">Snapshot Preview</h4>
              <pre className="text-xs overflow-auto max-h-32 bg-background p-2 rounded">
                {JSON.stringify(
                  Array.isArray(selectedSnapshot.snapshot_data) 
                    ? selectedSnapshot.snapshot_data.slice(0, 5) 
                    : selectedSnapshot.snapshot_data, 
                  null, 
                  2
                )}
                {Array.isArray(selectedSnapshot.snapshot_data) && selectedSnapshot.snapshot_data.length > 5 && '\n... and more'}
              </pre>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}