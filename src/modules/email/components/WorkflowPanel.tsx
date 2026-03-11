import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    CircleDot, UserCircle, Link2, StickyNote, Send,
    Clock, CheckCircle2, AlertTriangle, CircleCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useThreadWorkflow } from '../hooks/useThreadWorkflow';
import { usePermissions } from '@/hooks/useAuth';
import type { EmailThreadWorkflow, EmailThreadNote, EmailWorkflowStatus } from '@/types/email';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

interface WorkflowPanelProps {
    threadId: string;
    workflow: EmailThreadWorkflow | null;
    notes: EmailThreadNote[];
}

const STATUS_CONFIG: Record<EmailWorkflowStatus, { label: string; color: string; icon: React.ReactNode }> = {
    OPEN: { label: 'Mở', color: 'bg-info/10 text-info border-info/30', icon: <CircleDot className="h-3 w-3" /> },
    IN_PROGRESS: { label: 'Đang xử lý', color: 'bg-warning/10 text-warning border-warning/30', icon: <Clock className="h-3 w-3" /> },
    NEED_FOLLOWUP: { label: 'Cần theo dõi', color: 'bg-destructive/10 text-destructive border-destructive/30', icon: <AlertTriangle className="h-3 w-3" /> },
    DONE: { label: 'Hoàn tất', color: 'bg-success/10 text-success border-success/30', icon: <CheckCircle2 className="h-3 w-3" /> },
};

export function WorkflowPanel({ threadId, workflow, notes }: WorkflowPanelProps) {
    const { updateWorkflow, isUpdatingWorkflow, addNote, isAddingNote } = useThreadWorkflow(threadId);
    const { isAdmin, userRole } = usePermissions();
    const canEdit = isAdmin || userRole === 'super_admin' || userRole === 'cskh';

    const [noteText, setNoteText] = useState('');
    const [bookingInput, setBookingInput] = useState(workflow?.booking_unified_id ?? '');

    // Fetch user profiles for assignment dropdown
    const { data: profiles } = useQuery({
        queryKey: ['user_profiles_for_assign'],
        queryFn: async () => {
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .order('full_name');
            return data ?? [];
        },
        staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    });

    // Lookup assigned user name
    const assignedName = useMemo(() => {
        if (!workflow?.assigned_to || !profiles) return null;
        const p = profiles.find(u => u.id === workflow.assigned_to);
        return p?.full_name || p?.email || workflow.assigned_to;
    }, [workflow?.assigned_to, profiles]);

    const currentStatus = (workflow?.status ?? 'OPEN') as EmailWorkflowStatus;

    const handleSubmitNote = () => {
        if (!noteText.trim()) return;
        addNote(noteText.trim());
        setNoteText('');
    };

    const handleLinkBooking = () => {
        if (bookingInput.trim() === (workflow?.booking_unified_id ?? '')) return;
        updateWorkflow({ bookingUnifiedId: bookingInput.trim() || null });
    };

    return (
        <div className="border-l bg-card hidden lg:flex flex-col w-[320px] shrink-0 overflow-y-auto">
            {/* Header */}
            <div className="px-4 py-2.5 border-b flex flex-col justify-center shrink-0">
                <h3 className="text-sm font-semibold text-foreground leading-5">Workflow</h3>
                <p className="text-xs text-muted-foreground">Quản lý quy trình</p>
            </div>

            {/* Status */}
            <div className="px-4 py-3 border-b space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <CircleDot className="h-3.5 w-3.5" /> Trạng thái
                </label>
                {canEdit ? (
                    <Select
                        value={currentStatus}
                        onValueChange={(val) => updateWorkflow({ status: val })}
                        disabled={isUpdatingWorkflow}
                    >
                        <SelectTrigger className="h-8 text-xs bg-card border-border">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {(Object.entries(STATUS_CONFIG) as [EmailWorkflowStatus, typeof STATUS_CONFIG[EmailWorkflowStatus]][]).map(([key, cfg]) => (
                                <SelectItem key={key} value={key}>
                                    <span className="flex items-center gap-1.5">
                                        {cfg.icon} {cfg.label}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <Badge variant="outline" className={cn('text-xs', STATUS_CONFIG[currentStatus].color)}>
                        {STATUS_CONFIG[currentStatus].icon}
                        <span className="ml-1">{STATUS_CONFIG[currentStatus].label}</span>
                    </Badge>
                )}
            </div>

            {/* Assignment */}
            <div className="px-4 py-3 border-b space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <UserCircle className="h-3.5 w-3.5" /> Phụ trách
                </label>
                {canEdit ? (
                    <Select
                        value={workflow?.assigned_to ?? '_none'}
                        onValueChange={(val) => updateWorkflow({ assignedTo: val === '_none' ? null : val })}
                        disabled={isUpdatingWorkflow}
                    >
                        <SelectTrigger className="h-8 text-xs bg-card border-border">
                            <SelectValue placeholder="Chưa gán" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="_none">Chưa gán</SelectItem>
                            {profiles?.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                    {p.full_name || p.email}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <span className="text-xs text-foreground">
                        {assignedName ?? <span className="text-muted-foreground italic">Chưa gán</span>}
                    </span>
                )}
            </div>

            {/* Booking Link */}
            <div className="px-4 py-3 border-b space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Link2 className="h-3.5 w-3.5" /> Liên kết Booking
                </label>
                {canEdit ? (
                    <div className="flex gap-1.5">
                        <Input
                            value={bookingInput}
                            onChange={(e) => setBookingInput(e.target.value)}
                            placeholder="Mã booking (unified ID)"
                            className="h-8 text-xs flex-1 bg-card border-border"
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2 text-xs shrink-0"
                            onClick={handleLinkBooking}
                            disabled={isUpdatingWorkflow || bookingInput.trim() === (workflow?.booking_unified_id ?? '')}
                        >
                            <Link2 className="h-3 w-3" />
                        </Button>
                    </div>
                ) : (
                    <span className="text-xs text-foreground">
                        {workflow?.booking_unified_id ?? <span className="text-muted-foreground italic">Chưa liên kết</span>}
                    </span>
                )}
            </div>

            {/* Notes */}
            <div className="px-4 py-3 flex-1 flex flex-col min-h-0">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                    <StickyNote className="h-3.5 w-3.5" /> Ghi chú nội bộ ({notes.length})
                </label>

                {/* Add note */}
                {canEdit && (
                    <div className="flex gap-1.5 mb-3">
                        <Textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Thêm ghi chú..."
                            className="text-xs min-h-[60px] resize-none flex-1 bg-card border-border"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                    e.preventDefault();
                                    handleSubmitNote();
                                }
                            }}
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2 self-end shrink-0"
                            onClick={handleSubmitNote}
                            disabled={isAddingNote || !noteText.trim()}
                        >
                            <Send className="h-3 w-3" />
                        </Button>
                    </div>
                )}

                {/* Notes list */}
                <div className="flex-1 overflow-y-auto space-y-2">
                    {notes.map((n) => (
                        <div key={n.id} className="bg-muted/40 rounded-lg px-3 py-2">
                            <p className="text-xs text-foreground whitespace-pre-wrap">{n.note}</p>
                            <p className="text-micro text-muted-foreground mt-1">
                                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: vi })}
                            </p>
                        </div>
                    ))}
                    {notes.length === 0 && (
                        <p className="text-xs text-muted-foreground italic text-center py-4">Chưa có ghi chú</p>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * Compact status badge for use in inbox thread list
 */
export function WorkflowStatusBadge({ status }: { status?: EmailWorkflowStatus | null }) {
    const s = status ?? 'OPEN';
    const cfg = STATUS_CONFIG[s];
    if (!cfg || s === 'OPEN') return null; // Don't show badge for default OPEN status
    return (
        <Badge variant="outline" className={cn('text-micro px-1.5 py-0 shrink-0 gap-0.5', cfg.color)}>
            {cfg.icon}
            {cfg.label}
        </Badge>
    );
}
