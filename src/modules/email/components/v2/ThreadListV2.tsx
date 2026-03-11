import React from 'react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { CheckCircle2 } from 'lucide-react';
import type { EmailThreadV2, EmailWorkflowStatusV2 } from '@/types/email-v2';

interface ThreadListV2Props {
    threads: EmailThreadV2[];
    isLoading: boolean;
    selectedThreadId: string | null;
    onSelectThread: (thread: EmailThreadV2) => void;
}

const formatThreadDate = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const diffH = (Date.now() - date.getTime()) / 3.6e6;
    if (diffH < 24) return formatDistanceToNow(date, { addSuffix: true, locale: vi });
    if (diffH < 168) return format(date, 'EEEE', { locale: vi });
    return format(date, 'dd/MM');
};

const getSLAColor = (dateString: string | null, status: EmailWorkflowStatusV2) => {
    if (!dateString || status === 'DONE') return 'text-muted-foreground/60';
    const hours = (Date.now() - new Date(dateString).getTime()) / 3.6e6;
    if (hours > 8) return 'text-rose-500 font-semibold';
    if (hours > 4) return 'text-orange-500';
    if (hours > 1) return 'text-amber-500';
    return 'text-emerald-500';
};

export function ThreadListV2({ threads, isLoading, selectedThreadId, onSelectThread }: ThreadListV2Props) {
    if (isLoading && threads.length === 0) {
        return (
            <div className="flex flex-col flex-1 items-center justify-center p-8 space-y-3">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-xs text-muted-foreground">Đang tải...</p>
            </div>
        );
    }

    if (threads.length === 0) {
        return (
            <div className="flex flex-col flex-1 items-center justify-center p-8 text-center h-full">
                <div className="bg-emerald-50 p-3 rounded-full mb-3">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                </div>
                <h3 className="font-semibold text-sm">Inbox Zero!</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                    Không có email chờ xử lý.
                </p>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto">
            {threads.map((thread) => {
                const isSelected = selectedThreadId === thread.id;
                const timeText = formatThreadDate(thread.last_message_at || thread.created_at);

                const title = thread.subject?.trim() || thread.snippet?.trim() || '(Không có tiêu đề)';
                const preview = (thread.subject && thread.snippet) ? thread.snippet : '';
                const assignLabel = thread.owner_id ? 'Đã giao' : 'Chưa giao';
                const assignColor = thread.owner_id ? 'text-sky-600' : 'text-muted-foreground/40';

                return (
                    <div
                        key={thread.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectThread(thread)}
                        onKeyDown={(e) => { if (e.key === 'Enter') onSelectThread(thread); }}
                        className={cn(
                            "flex flex-col text-left px-3 py-2 cursor-pointer",
                            "transition-colors duration-100 border-l-2 border-l-transparent",
                            "border-b border-b-border/20",
                            isSelected
                                ? "bg-primary/5 border-l-primary"
                                : "hover:bg-muted/40"
                        )}
                    >
                        {/* ═══ Row 1: Subject + Time ═══ */}
                        <div className="flex items-baseline gap-2 overflow-hidden">
                            <span
                                className={cn(
                                    "font-semibold text-[13px] leading-5 truncate flex-1 min-w-0",
                                    thread.workflow_status !== 'DONE' ? "text-foreground" : "text-muted-foreground"
                                )}
                            >
                                {title}
                            </span>

                            {timeText && (
                                <span
                                    className={cn(
                                        "text-[11px] whitespace-nowrap shrink-0",
                                        getSLAColor(thread.last_message_at, thread.workflow_status)
                                    )}
                                >
                                    {timeText}
                                </span>
                            )}
                        </div>

                        {/* ═══ Row 2: Preview — Assignment ═══ */}
                        <div className="flex items-center gap-2 overflow-hidden mt-0.5">
                            <span className={cn(
                                "text-[11px] truncate flex-1 min-w-0",
                                thread.workflow_status !== 'DONE' ? "text-foreground/50" : "text-muted-foreground/40"
                            )}>
                                {preview || '\u00A0'}
                            </span>

                            <span className={cn("text-[10px] font-medium whitespace-nowrap shrink-0", assignColor)}>
                                {assignLabel}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
