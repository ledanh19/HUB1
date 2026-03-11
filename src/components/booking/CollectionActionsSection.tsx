import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MoreHorizontal, RotateCcw, XCircle, DollarSign, AlertTriangle } from "lucide-react";
import { RefundDialog } from "@/components/collection/RefundDialog";
import { VoidDialog } from "@/components/collection/VoidDialog";
import {
  useCanRefund,
  useCanVoid,
  useCollectionWithRelated,
  canRefundCollection,
  canVoidCollection,
  HotelCollect,
} from "@/hooks/useCollections";

interface CollectionActionsSectionProps {
  collection: HotelCollect;
  onActionComplete?: () => void;
}

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

export function CollectionActionsSection({ collection, onActionComplete }: CollectionActionsSectionProps) {
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);

  const { data: canRefund } = useCanRefund();
  const { data: canVoid } = useCanVoid();
  const { data: collectionWithRelated } = useCollectionWithRelated(collection.id);

  const relatedCollections = collectionWithRelated?.relatedCollections || [];
  
  const refundCheck = canRefundCollection(collection, relatedCollections);
  const voidCheck = canVoidCollection(collection, relatedCollections);

  // Skip rendering for non-COLLECT types
  if (collection.collection_type !== "COLLECT") {
    return null;
  }

  // Check if voided
  const isVoided = relatedCollections.some(c => c.collection_type === "VOID");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canRefund && refundCheck.canRefund && (
            <DropdownMenuItem onClick={() => setRefundDialogOpen(true)}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Hoàn tiền
              <span className="ml-auto text-xs text-muted-foreground">
                Tối đa: {formatCurrency(refundCheck.maxRefundAmount)}
              </span>
            </DropdownMenuItem>
          )}
          {canVoid && voidCheck.canVoid && (
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuItem onClick={() => setVoidDialogOpen(true)}>
                  <XCircle className="mr-2 h-4 w-4" />
                  Hủy thu
                </DropdownMenuItem>
              </TooltipTrigger>
              <TooltipContent>
                <p>Chỉ dùng khi tiền chưa thực thu</p>
              </TooltipContent>
            </Tooltip>
          )}
          {!refundCheck.canRefund && !voidCheck.canVoid && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              {isVoided ? "Đã hủy" : "Không có thao tác khả dụng"}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <RefundDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        collection={collection}
        maxRefundAmount={refundCheck.maxRefundAmount}
        onSuccess={onActionComplete}
      />

      <VoidDialog
        open={voidDialogOpen}
        onOpenChange={setVoidDialogOpen}
        collection={collection}
        onSuccess={onActionComplete}
      />
    </>
  );
}
