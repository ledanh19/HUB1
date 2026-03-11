import { useState } from 'react';
import {
  UserPlus,
  UserMinus,
  CheckCircle,
  ArrowUpRight,
  Loader2,
  User,
  Users,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Conversation,
  AssignedTeam,
  useClaimConversation,
  useReleaseConversation,
  useResolveConversation,
  useEscalateConversation,
} from '@/hooks/useConversations';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface ConversationOwnershipProps {
  conversation: Conversation | null;
  compact?: boolean;
}

// Team display config
const TEAM_CONFIG: Record<AssignedTeam, { label: string; color: string }> = {
  CSKH: { label: 'CSKH', color: 'bg-info/10 text-info' },
  OPS: { label: 'Vận hành', color: 'bg-success/10 text-success' },
  FINANCE: { label: 'Tài chính', color: 'bg-warning/10 text-warning' },
  TECH: { label: 'Kỹ thuật', color: 'bg-primary/10 text-primary' },
};

// Assignment status display config
const STATUS_CONFIG = {
  UNASSIGNED: { label: 'Chưa phân công', color: 'bg-muted text-muted-foreground' },
  ASSIGNED: { label: 'Đang xử lý', color: 'bg-info/10 text-info' },
  ESCALATED: { label: 'Đã chuyển lên', color: 'bg-warning/10 text-warning' },
  RESOLVED: { label: 'Đã giải quyết', color: 'bg-success/10 text-success' },
};

export function ConversationOwnership({ conversation, compact = false }: ConversationOwnershipProps) {
  const { user } = useAuth();
  const [escalateDialogOpen, setEscalateDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<AssignedTeam>('CSKH');

  const claimMutation = useClaimConversation();
  const releaseMutation = useReleaseConversation();
  const resolveMutation = useResolveConversation();
  const escalateMutation = useEscalateConversation();

  if (!conversation) return null;

  const isAssignedToMe = conversation.assigned_to_user_id === user?.id;
  const isUnassigned = conversation.assignment_status === 'UNASSIGNED';
  const isEscalated = conversation.assignment_status === 'ESCALATED';
  const isResolved = conversation.assignment_status === 'RESOLVED';
  const canClaim = isUnassigned || isEscalated;
  const canRelease = isAssignedToMe && !isResolved;
  const canResolve = isAssignedToMe && !isResolved;
  const canEscalate = isAssignedToMe && !isResolved;

  const statusConfig = STATUS_CONFIG[conversation.assignment_status];
  const teamConfig = conversation.assigned_team ? TEAM_CONFIG[conversation.assigned_team] : null;

  const handleClaim = () => {
    claimMutation.mutate({ conversationId: conversation.id });
  };

  const handleRelease = () => {
    releaseMutation.mutate({ conversationId: conversation.id });
  };

  const handleResolve = () => {
    resolveMutation.mutate(conversation.id);
  };

  const handleEscalate = () => {
    escalateMutation.mutate({
      conversationId: conversation.id,
      toTeam: selectedTeam
    });
    setEscalateDialogOpen(false);
  };

  const isPending = claimMutation.isPending || releaseMutation.isPending ||
    resolveMutation.isPending || escalateMutation.isPending;

  if (compact) {
    // Compact view for conversation list
    return (
      <div className="flex items-center gap-1.5">
        {/* Status Badge */}
        <Badge variant="secondary" className={cn("py-0", statusConfig.color)}>
          {statusConfig.label}
        </Badge>

        {/* Team Badge */}
        {teamConfig && (
          <Badge variant="secondary" className={cn("py-0", teamConfig.color)}>
            {teamConfig.label}
          </Badge>
        )}

        {/* Assignee indicator */}
        {conversation.assigned_to_name && (
          <span className="text-micro text-muted-foreground flex items-center gap-0.5">
            <User className="h-2.5 w-2.5" />
            {conversation.assigned_to_name}
          </span>
        )}
      </div>
    );
  }

  // Full view for header/panel
  return (
    <div className="space-y-3">
      {/* Status Display */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={cn(statusConfig.color)}>
            {statusConfig.label}
          </Badge>
          {teamConfig && (
            <Badge variant="secondary" className={cn(teamConfig.color)}>
              <Users className="h-3 w-3 mr-1" />
              {teamConfig.label}
            </Badge>
          )}
        </div>
      </div>

      {/* Assignee Info */}
      {conversation.assigned_to_user_id && (
        <div className="bg-muted/50 rounded-lg p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-3 w-3 text-primary" />
            </div>
            <div>
              <p className="font-medium text-xs">
                {conversation.assigned_to_name || 'Người phụ trách'}
              </p>
              {conversation.assigned_at && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Từ {format(new Date(conversation.assigned_at), 'HH:mm dd/MM', { locale: vi })}
                </p>
              )}
            </div>
          </div>

          {isAssignedToMe && (
            <p className="text-xs text-primary font-medium">
              ✓ Bạn đang phụ trách hội thoại này
            </p>
          )}
        </div>
      )}

      {/* Resolution Info */}
      {isResolved && conversation.resolved_at && (
        <div className="bg-success/10 rounded-lg p-2">
          <p className="text-xs text-success flex items-center gap-1.5">
            <CheckCircle className="h-4 w-4" />
            Đã giải quyết
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {conversation.resolved_by_name && `Bởi ${conversation.resolved_by_name} • `}
            {format(new Date(conversation.resolved_at), 'HH:mm dd/MM/yyyy', { locale: vi })}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      {!isResolved && (
        <div className="flex flex-wrap gap-2">
          {canClaim && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    onClick={handleClaim}
                    disabled={isPending}
                    className="flex-1 h-7 text-xs"
                  >
                    {claimMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4 mr-1" />
                    )}
                    Nhận xử lý
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Nhận trách nhiệm xử lý hội thoại này</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {canRelease && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRelease}
                    disabled={isPending}
                    className="h-7 text-xs"
                  >
                    {releaseMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <UserMinus className="h-4 w-4 mr-1" />
                    )}
                    Nhả
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Nhả hội thoại để người khác nhận</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {canEscalate && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEscalateDialogOpen(true)}
                    disabled={isPending}
                    className="h-7 text-xs"
                  >
                    <ArrowUpRight className="h-4 w-4 mr-1" />
                    Chuyển lên
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Chuyển hội thoại lên team khác</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {canResolve && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleResolve}
                    disabled={isPending}
                    className="bg-success hover:bg-success h-7 text-xs"
                  >
                    {resolveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-1" />
                    )}
                    Hoàn thành
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Đánh dấu hội thoại đã giải quyết xong</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}

      {/* Escalate Dialog */}
      <Dialog open={escalateDialogOpen} onOpenChange={setEscalateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chuyển hội thoại lên team khác</DialogTitle>
            <DialogDescription>
              Chọn team để chuyển hội thoại này. Hội thoại sẽ được đánh dấu là "Đã chuyển lên"
              và hiển thị trong inbox của team được chọn.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Select value={selectedTeam} onValueChange={(v) => setSelectedTeam(v as AssignedTeam)}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn team" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TEAM_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", config.color.split(' ')[0])} />
                      {config.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEscalateDialogOpen(false)}>
              Huỷ
            </Button>
            <Button
              onClick={handleEscalate}
              disabled={escalateMutation.isPending}
            >
              {escalateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Chuyển lên {TEAM_CONFIG[selectedTeam].label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
