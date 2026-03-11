import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { GripVertical } from "lucide-react";
import { useInventoryRoomOrder, useUpdateRoomOrder, RoomType } from "@/hooks/useInventory";

interface InventorySettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId?: string;
  roomTypes: RoomType[];
}

export function InventorySettingsDialog({
  open,
  onOpenChange,
  propertyId,
  roomTypes,
}: InventorySettingsDialogProps) {
  const { data: roomOrder = [] } = useInventoryRoomOrder(propertyId);
  const updateOrder = useUpdateRoomOrder();
  
  const [orderedRooms, setOrderedRooms] = useState<RoomType[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  useEffect(() => {
    if (roomTypes.length > 0 && open) {
      // Sort rooms by saved order
      const orderMap = new Map(roomOrder.map((o: { room_type_id: string; display_order: number }) => [o.room_type_id, o.display_order]));
      const sorted = [...roomTypes].sort((a, b) => {
        const orderA = orderMap.get(a.id) ?? 999;
        const orderB = orderMap.get(b.id) ?? 999;
        return orderA - orderB;
      });
      setOrderedRooms(sorted);
    }
  }, [roomTypes, roomOrder, open]);
  
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };
  
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    const newOrder = [...orderedRooms];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(index, 0, removed);
    setOrderedRooms(newOrder);
    setDraggedIndex(index);
  };
  
  const handleDragEnd = () => {
    setDraggedIndex(null);
  };
  
  const handleSave = async () => {
    if (!propertyId) return;
    
    await updateOrder.mutateAsync({
      propertyId,
      orders: orderedRooms.map((rt, index) => ({
        room_type_id: rt.id,
        display_order: index,
      })),
    });
    
    onOpenChange(false);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Inventory Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label className="text-base font-semibold">Room Order</Label>
            <p className="text-sm text-muted-foreground mb-4">
              Drag to reorder rooms in the inventory grid
            </p>
            
            <div className="space-y-2">
              {orderedRooms.map((rt, index) => (
                <div
                  key={rt.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`
                    flex items-center gap-2 p-3 border rounded-lg cursor-move
                    hover:bg-muted/50 transition-colors
                    ${draggedIndex === index ? 'opacity-50' : ''}
                  `}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">{rt.room_type_name}</span>
                  <span className="text-sm text-muted-foreground">#{index + 1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateOrder.isPending}>
            Save Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
