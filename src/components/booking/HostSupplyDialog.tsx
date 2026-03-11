import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DollarSign, CreditCard, Home, Pencil, Trash2, Lock } from 'lucide-react';
import { HostSupplySegments } from './HostSupplySegments';
import { CreateHostDepositDialog } from './CreateHostDepositDialog';
import { EditHostDepositDialog } from './EditHostDepositDialog';
import { 
  useHostDepositRequests, 
  useDeleteHostDepositRequest,
  HostDepositPurpose,
  HostDepositRequest 
} from '@/hooks/useHostDepositRequests';
import { useHostSupplySegments } from '@/hooks/useHostSupplySegments';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface HostSupplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unifiedBookingId: string;
  checkInDate: string;
  checkOutDate: string;
  guestName: string;
  nights: number;
  stayStatus?: string;
}

export function HostSupplyDialog({
  open,
  onOpenChange,
  unifiedBookingId,
  checkInDate,
  checkOutDate,
  guestName,
  nights,
  stayStatus,
}: HostSupplyDialogProps) {
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [prepaidDialogOpen, setPrepaidDialogOpen] = useState(false);
  const [currentPurpose, setCurrentPurpose] = useState<HostDepositPurpose>('HOST_DEPOSIT');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<HostDepositRequest | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRequest, setDeletingRequest] = useState<HostDepositRequest | null>(null);
  
  const { data: depositRequests = [] } = useHostDepositRequests({
    unifiedBookingId: unifiedBookingId,
  });

  const { data: segments = [] } = useHostSupplySegments(unifiedBookingId);
  const deleteMutation = useDeleteHostDepositRequest();

  const depositItems = depositRequests.filter(r => r.purpose === 'HOST_DEPOSIT');
  const prepaidItems = depositRequests.filter(r => r.purpose === 'HOST_PREPAID');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleOpenDepositDialog = () => {
    setCurrentPurpose('HOST_DEPOSIT');
    setDepositDialogOpen(true);
  };

  const handleOpenPrepaidDialog = () => {
    setCurrentPurpose('HOST_PREPAID');
    setPrepaidDialogOpen(true);
  };

  const handleEdit = (item: HostDepositRequest) => {
    setEditingRequest(item);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (item: HostDepositRequest) => {
    setDeletingRequest(item);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingRequest) return;
    await deleteMutation.mutateAsync(deletingRequest.id);
    setDeleteDialogOpen(false);
    setDeletingRequest(null);
  };

  const canEditDelete = (item: HostDepositRequest) => {
    // Only allow edit/delete if PENDING and not linked to settlement
    return item.status === 'PENDING' && !item.settlement_id && !item.is_applied;
  };

  const renderRequestItem = (item: HostDepositRequest, type: 'deposit' | 'prepaid') => {
    const canEdit = canEditDelete(item);
    const isSettled = item.is_applied || !!item.settlement_id;

    return (
      <div key={item.id} className="flex items-center justify-between p-2 bg-background rounded border">
        <div className="flex items-center gap-2">
          <Badge 
            variant="outline" 
            className={type === 'prepaid' ? "text-xs bg-info/100/10 text-info" : "text-xs"}
          >
            {type === 'deposit' ? 'Đặt cọc' : 'Trả trước'}
          </Badge>
          <span className="text-sm">{item.partner_name}</span>
          {isSettled && (
            <Badge variant="outline" className="text-xs bg-success/100/10 text-success gap-1">
              <Lock className="h-3 w-3" />
              Đã QT
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">{formatCurrency(item.proposed_amount)}</span>
          <Badge 
            variant={
              item.is_applied ? 'default' : 
              item.status === 'PAID' ? 'secondary' : 
              item.status === 'APPROVED' ? 'outline' : 
              'secondary'
            }
            className={item.is_applied ? 'bg-success' : ''}
          >
            {item.is_applied ? 'Đã cấn trừ' : 
             item.status === 'PAID' ? 'Đã chi' :
             item.status === 'APPROVED' ? 'Đã duyệt' :
             item.status === 'PENDING' ? 'Chờ duyệt' : item.status}
          </Badge>
          {canEdit && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleEdit(item)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => handleDeleteClick(item)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Home className="h-5 w-5" />
              Host Supply (Segments)
              <Badge variant="secondary" className="ml-2">
                {nights} đêm
              </Badge>
            </DialogTitle>
            <div className="text-sm text-muted-foreground">
              {guestName} • {unifiedBookingId}
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 max-h-[calc(90vh-180px)]">
            <div className="p-6">
              <HostSupplySegments
                unifiedBookingId={unifiedBookingId}
                checkInDate={checkInDate}
                checkOutDate={checkOutDate}
                stayStatus={stayStatus}
                isReadOnly={false}
              />
            </div>
          </ScrollArea>

          {/* Deposits & Prepaids Section */}
          <div className="border-t p-4 bg-muted/30">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-primary">Đặt cọc & Trả trước Host</span>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleOpenDepositDialog}
                  disabled={segments.length === 0}
                >
                  <DollarSign className="h-4 w-4 mr-1" />
                  Ghi nhận đặt cọc
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleOpenPrepaidDialog}
                  disabled={segments.length === 0}
                >
                  <CreditCard className="h-4 w-4 mr-1" />
                  Ghi nhận trả trước
                </Button>
              </div>
            </div>

            {/* List existing deposits/prepaids */}
            {depositItems.length === 0 && prepaidItems.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                Chưa có đề xuất đặt cọc hoặc trả trước cho Host
              </div>
            ) : (
              <div className="space-y-2">
                {depositItems.map((item) => renderRequestItem(item, 'deposit'))}
                {prepaidItems.map((item) => renderRequestItem(item, 'prepaid'))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Deposit Dialog */}
      <CreateHostDepositDialog
        open={depositDialogOpen}
        onOpenChange={setDepositDialogOpen}
        unifiedBookingId={unifiedBookingId}
        purpose="HOST_DEPOSIT"
        segments={segments}
      />

      {/* Create Prepaid Dialog */}
      <CreateHostDepositDialog
        open={prepaidDialogOpen}
        onOpenChange={setPrepaidDialogOpen}
        unifiedBookingId={unifiedBookingId}
        purpose="HOST_PREPAID"
        segments={segments}
      />

      {/* Edit Dialog */}
      <EditHostDepositDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        request={editingRequest}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa đề xuất {deletingRequest?.purpose === 'HOST_DEPOSIT' ? 'đặt cọc' : 'trả trước'} này?
              <br />
              <strong>Mã: {deletingRequest?.request_code}</strong> • {formatCurrency(deletingRequest?.proposed_amount || 0)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
