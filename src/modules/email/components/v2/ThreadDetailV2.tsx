import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    CheckCircle2, Inbox, Flag, UserCircle, Tag,
    ChevronLeft, ChevronRight, RotateCcw,
    MessageCircle, AlertTriangle, CreditCard, CalendarX,
    BellOff, Building2, Mail, ShieldAlert, Megaphone,
    ArrowUpCircle, ArrowDownCircle, MinusCircle, AlertCircle,
    Send, ArrowDown, Lock
} from 'lucide-react';
import { useOperationalMessages } from '../../hooks/v2/useOperationalMessages';
import { useUpdateWorkflowStatus, useUpdatePriority } from '../../hooks/v2/useOperationalThreads';
import type { EmailThreadV2, EmailPriorityV2, EmailTagV2, EmailMessageV2 } from '@/types/email-v2';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ReplyComposer } from '../../components/ReplyComposer';
import { useEmailReply } from '../../hooks/useEmailReply';
import { useEmailAccounts } from '../../hooks/useEmailAccounts';
import { useAuth } from '@/hooks/useAuth';
import type { EmailMessage } from '@/types/email';
import { isValidEmail } from '../../utils/emailHelpers';
import { ChannelIcon } from './ChannelIcon';
import { EmailHtmlIframe } from './EmailHtmlIframe';

interface ThreadDetailV2Props {
    thread: EmailThreadV2 | null;
    /** Callback to sync updated thread back to parent selectedThread state */
    onThreadUpdated?: (updated: Partial<EmailThreadV2> & { id: string }) => void;
}

const PAGE_SIZE = 50;

const TAG_OPTIONS: { value: EmailTagV2; label: string; icon: React.ElementType; badge: string }[] = [
    { value: 'BOOKING_SYSTEM', label: 'Hệ thống OTA', icon: Building2, badge: 'bg-teal-50 text-teal-600 border-teal-200' },
    { value: 'GUEST_MESSAGE', label: 'Tin nhắn khách', icon: MessageCircle, badge: 'bg-blue-50 text-blue-600 border-blue-200' },
    { value: 'DISPUTE_REFUND', label: 'Tranh chấp', icon: ShieldAlert, badge: 'bg-rose-50 text-rose-600 border-rose-200' },
    { value: 'FINANCE_PAYOUT', label: 'Tài chính', icon: CreditCard, badge: 'bg-purple-50 text-purple-600 border-purple-200' },
    { value: 'ADS_SPAM', label: 'QC/Spam', icon: Megaphone, badge: 'bg-slate-100 text-slate-500 border-slate-200' },
    { value: 'INTERNAL_OTHER', label: 'Nội bộ', icon: Mail, badge: 'bg-gray-50 text-gray-500 border-gray-200' },
];

const PRIORITY_OPTIONS: { value: EmailPriorityV2; label: string; icon: React.ElementType; color: string }[] = [
    { value: 'CRITICAL', label: 'Khẩn', icon: AlertCircle, color: 'text-rose-500' },
    { value: 'HIGH', label: 'Cao', icon: ArrowUpCircle, color: 'text-orange-500' },
    { value: 'MEDIUM', label: 'TB', icon: MinusCircle, color: 'text-blue-500' },
    { value: 'LOW', label: 'Thấp', icon: ArrowDownCircle, color: 'text-slate-400' },
];

/** Extract readable text from HTML string safely */
function htmlToText(html: string): string {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent?.trim() || '';
    } catch {
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
}

// ── Helper: patch a single thread in the list cache ──
function patchThreadInListCache(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    oldData: any,
    threadId: string,
    patch: Partial<EmailThreadV2>,
) {
    if (!oldData?.threads) return oldData;
    return {
        ...oldData,
        threads: oldData.threads.map((t: EmailThreadV2) =>
            t.id === threadId ? { ...t, ...patch } : t
        ),
    };
}

// Hook: fetch team members for assign dropdown
function useTeamMembers() {
    return useQuery({
        queryKey: ['team-profiles'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .order('full_name');
            if (error) throw error;
            return data ?? [];
        },
        staleTime: 5 * 60_000,
    });
}

// Hook: update thread tag — WITH OPTIMISTIC UPDATE
function useUpdateTag(onThreadUpdated?: (updated: Partial<EmailThreadV2> & { id: string }) => void) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ threadId, newTag }: { threadId: string; newTag: EmailTagV2 }) => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { error } = await (supabase.rpc as any)('email_update_tag', {
                    p_thread_id: threadId,
                    p_new_tag: newTag,
                    p_user_id: (await supabase.auth.getSession()).data.session?.user?.id,
                });
                if (error) throw error;
            } catch {
                const { error } = await supabase
                    .from('email_threads')
                    .update({ tag: newTag, tag_source: 'MANUAL', updated_at: new Date().toISOString() } as Record<string, unknown>)
                    .eq('id', threadId);
                if (error) throw error;
            }
            return { threadId, newTag };
        },
        onMutate: async ({ threadId, newTag }) => {
            // Cancel running fetches to avoid overwriting optimistic update
            await queryClient.cancelQueries({ queryKey: ['email-operational-threads'] });
            // Snapshot previous data
            const previousData = queryClient.getQueriesData({ queryKey: ['email-operational-threads'] });
            // Optimistically update ALL matching thread list queries
            queryClient.setQueriesData(
                { queryKey: ['email-operational-threads'] },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (old: any) => patchThreadInListCache(old, threadId, { tag: newTag, tag_source: 'MANUAL' }),
            );
            // Sync selected thread in parent
            onThreadUpdated?.({ id: threadId, tag: newTag, tag_source: 'MANUAL' });
            return { previousData };
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (_err: Error, _vars: any, ctx: any) => {
            // Rollback
            if (ctx?.previousData) {
                for (const [key, data] of ctx.previousData) {
                    queryClient.setQueryData(key, data);
                }
            }
            toast.error(`Lỗi: ${_err.message}`);
        },
        onSuccess: () => {
            toast.success('Đã cập nhật nhãn');
            queryClient.invalidateQueries({ queryKey: ['email-operational-threads'] });
            queryClient.invalidateQueries({ queryKey: ['email-operational-analytics'] });
        },
    });
}

// Hook: assign thread to a user — WITH OPTIMISTIC UPDATE
function useAssignThread(onThreadUpdated?: (updated: Partial<EmailThreadV2> & { id: string }) => void) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ threadId, ownerId }: { threadId: string; ownerId: string | null }) => {
            const { data: session } = await supabase.auth.getSession();
            const userId = session.session?.user?.id;
            if (!userId) throw new Error('Not authenticated');

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.rpc as any)('email_assign_thread', {
                p_thread_id: threadId,
                p_owner_id: ownerId,
                p_user_id: userId,
            });
            if (error) throw error;
            return { threadId, ownerId };
        },
        onMutate: async ({ threadId, ownerId }) => {
            await queryClient.cancelQueries({ queryKey: ['email-operational-threads'] });
            const previousData = queryClient.getQueriesData({ queryKey: ['email-operational-threads'] });
            queryClient.setQueriesData(
                { queryKey: ['email-operational-threads'] },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (old: any) => patchThreadInListCache(old, threadId, { owner_id: ownerId }),
            );
            onThreadUpdated?.({ id: threadId, owner_id: ownerId });
            return { previousData };
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (_err: Error, _vars: any, ctx: any) => {
            if (ctx?.previousData) {
                for (const [key, data] of ctx.previousData) {
                    queryClient.setQueryData(key, data);
                }
            }
            toast.error(`Lỗi: ${_err.message}`);
        },
        onSuccess: () => {
            toast.success('Đã giao việc');
            queryClient.invalidateQueries({ queryKey: ['email-operational-threads'] });
            queryClient.invalidateQueries({ queryKey: ['email-operational-analytics'] });
        },
    });
}

/**
 * Extract a valid email from a participant entry.
 * Handles cases where the email is stored in the name field,
 * or the entry is in "Name <email@example.com>" format.
 */
function normalizeParticipant(entry: { name?: string; email?: string }): { name: string; email: string } {
    const emailRegex = /[^\s@]+@[^\s@]+\.[^\s@]+/;
    // If the email field has a valid email, use it
    if (entry.email && emailRegex.test(entry.email)) {
        return { name: entry.name || '', email: entry.email };
    }
    // If the name field contains a valid email, swap
    if (entry.name && emailRegex.test(entry.name)) {
        const match = entry.name.match(emailRegex);
        if (match) {
            // Extract bracketed email: "Display Name <email@x.com>"
            const bracketMatch = entry.name.match(/<([^>]+)>/);
            const email = bracketMatch?.[1] || match[0];
            const displayName = entry.name.replace(/<[^>]+>/, '').replace(email, '').trim();
            return { name: displayName || entry.email || '', email };
        }
    }
    // If email field has "Name <email>" format
    if (entry.email) {
        const bracketMatch = entry.email.match(/<([^>]+)>/);
        if (bracketMatch && emailRegex.test(bracketMatch[1])) {
            const displayName = entry.email.replace(/<[^>]+>/, '').trim();
            return { name: displayName || entry.name || '', email: bracketMatch[1] };
        }
    }
    // Last resort — use whatever we have
    // Mark email empty if not valid so downstream (ReplyComposer) can detect it
    const fallbackEmail = entry.email || '';
    return { name: entry.name || '', email: isValidEmail(fallbackEmail) ? fallbackEmail : '' };
}

/**
 * Bridge V2 message to V1 EmailMessage shape (for ReplyComposer compatibility).
 */
function v2ToV1Message(msg: EmailMessageV2, threadSubject: string | null, threadParticipant?: string | null): EmailMessage {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = msg as any;

    // Normalize from_json entries with waterfall fallback
    let fromJson: Array<{ name: string; email: string }> = [];

    // Step 1: Try raw.from_json
    if (raw.from_json) {
        const rawFrom = Array.isArray(raw.from_json) ? raw.from_json : [raw.from_json];
        fromJson = rawFrom.map((e: any) => normalizeParticipant(e));
    }

    // Step 2: If from_json produced NO valid emails, fallback to msg.sender
    const hasValidFrom = fromJson.some(e => isValidEmail(e.email));
    if (!hasValidFrom && msg.sender && isValidEmail(msg.sender)) {
        // Preserve name from from_json if available
        const existingName = fromJson[0]?.name || '';
        fromJson = [{ name: existingName, email: msg.sender }];
    }

    // Step 3: If still no valid email, try thread primary_participant (INBOUND only)
    if (!fromJson.some(e => isValidEmail(e.email)) && threadParticipant && msg.direction === 'INBOUND') {
        fromJson = [normalizeParticipant({ email: threadParticipant })];
    }

    // Normalize to_json entries
    let toJson: Array<{ name: string; email: string }> = [];
    if (raw.to_json) {
        const rawTo = Array.isArray(raw.to_json) ? raw.to_json : [raw.to_json];
        toJson = rawTo.map((e: any) => normalizeParticipant(e));
    } else if (msg.recipients) {
        toJson = msg.recipients.map((e) => normalizeParticipant(e));
    }

    return {
        id: msg.id,
        tenant_id: msg.tenant_id,
        email_account_id: msg.email_account_id,
        thread_id: msg.thread_id,
        provider_message_id: msg.provider_message_id,
        direction: msg.direction,
        from_json: fromJson,
        to_json: toJson,
        cc_json: raw.cc_json ?? [],
        bcc_json: raw.bcc_json ?? [],
        date: msg.sent_at ?? msg.created_at,
        sent_at: msg.sent_at ?? msg.created_at,
        subject: raw.subject ?? threadSubject,
        headers: raw.headers ?? {},
        body_text: msg.body_text,
        body_html: msg.body_html,
        body_plain: msg.body_text,
        body_html_sanitized: msg.body_html,
        has_attachments: raw.has_attachments ?? false,
        attachments_json: raw.attachments_json ?? [],
        created_at: msg.created_at,
        updated_at: msg.created_at,
    };
}

export function ThreadDetailV2({ thread, onThreadUpdated }: ThreadDetailV2Props) {
    const [msgPage, setMsgPage] = useState(1);

    const { data: msgData, isLoading } = useOperationalMessages({
        threadId: thread?.id ?? null,
        threadSnippet: thread?.snippet ?? null,
        page: msgPage,
        pageSize: PAGE_SIZE,
    });

    const updateStatus = useUpdateWorkflowStatus(onThreadUpdated);
    const updatePriority = useUpdatePriority(onThreadUpdated);
    const updateTag = useUpdateTag(onThreadUpdated);
    const assignThread = useAssignThread(onThreadUpdated);
    const { data: teamMembers } = useTeamMembers();

    // ── Reply infrastructure ──
    const { accounts } = useEmailAccounts();
    const { userRole } = useAuth();
    const replyMutation = useEmailReply(thread?.id ?? '');

    const messages = msgData?.messages ?? [];
    const totalMessages = msgData?.total ?? 0;

    useEffect(() => { setMsgPage(1); }, [thread?.id]);

    // ── Reply: resolve account email + compute canReply ──
    const account = useMemo(() => {
        if (!thread?.email_account_id) return undefined;
        return accounts.find((a) => a.id === thread.email_account_id);
    }, [thread?.email_account_id, accounts]);

    const hasReplyRole = userRole === 'admin' || userRole === 'super_admin' || userRole === 'cskh';

    const { canReply, disabledReason } = useMemo(() => {
        if (!hasReplyRole) {
            return { canReply: false, disabledReason: `Vai trò "${userRole}" không có quyền trả lời.` };
        }
        if (!thread?.email_account_id) {
            return { canReply: false, disabledReason: 'Không xác định được mailbox cho thread này.' };
        }
        if (!account) {
            return { canReply: false, disabledReason: 'Tài khoản email không tìm thấy.' };
        }
        if (account.status !== 'ACTIVE') {
            return { canReply: false, disabledReason: `Tài khoản ${account.email_address} không hoạt động (${account.status}).` };
        }
        if (account.scope_level === 'READ_ONLY') {
            return { canReply: false, disabledReason: `Tài khoản chỉ có quyền đọc (READ_ONLY). Kết nối lại với quyền Reply.` };
        }
        return { canReply: true, disabledReason: undefined };
    }, [hasReplyRole, userRole, thread?.email_account_id, account]);

    // Bridge last V2 message → V1 for ReplyComposer
    const lastMessageV1 = useMemo(() => {
        if (!messages.length) return undefined;
        const lastMsg = messages[messages.length - 1];
        return v2ToV1Message(lastMsg, thread?.subject ?? null, thread?.primary_participant);
    }, [messages, thread?.subject, thread?.primary_participant]);

    const handleMarkDone = useCallback(() => {
        if (!thread) return;
        updateStatus.mutate({ threadId: thread.id, newStatus: 'DONE' });
    }, [thread, updateStatus]);

    const handleReopen = useCallback(() => {
        if (!thread) return;
        updateStatus.mutate({ threadId: thread.id, newStatus: 'OPEN' });
    }, [thread, updateStatus]);

    // ── Empty state ──
    if (!thread) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-white">
                <div className="rounded-full bg-muted/30 p-5 mb-4">
                    <Inbox className="h-10 w-10 text-muted-foreground/25" />
                </div>
                <h3 className="font-medium text-base text-muted-foreground">Chọn email để xem</h3>
                <p className="text-sm text-muted-foreground/60 mt-1">Chọn một thread từ danh sách bên trái</p>
            </div>
        );
    }

    const currentTagOption = TAG_OPTIONS.find(t => t.value === thread.tag);

    return (
        <div className="flex flex-col h-full bg-white min-w-0 min-h-0 overflow-hidden max-h-full" style={{ isolation: 'isolate' }}>
            {/* ── Sticky Header — fixed height, no content-dependent resizing ── */}
            <div className="flex flex-col border-b border-border/40 px-4 py-2 shrink-0 bg-white sticky top-0 z-10 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                {/* Row 1: Subject + Done button */}
                <div className="flex items-start justify-between gap-3 mb-1.5 min-w-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <ChannelIcon thread={thread} variant="full" />
                        <h2 className="text-sm font-semibold tracking-tight leading-snug truncate min-w-0 flex-1 text-foreground"
                            title={thread.subject || '(Không có tiêu đề)'}>
                            {thread.subject || '(Không có tiêu đề)'}
                        </h2>
                    </div>
                    <div className="shrink-0">
                        {thread.workflow_status === 'DONE' ? (
                            <Button size="sm" variant="outline" onClick={handleReopen} disabled={updateStatus.isPending} className="h-7 text-xs gap-1">
                                <RotateCcw className="w-3 h-3" />
                                Mở lại
                            </Button>
                        ) : (
                            <Button size="sm" onClick={handleMarkDone} disabled={updateStatus.isPending} className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                                <CheckCircle2 className="w-3 h-3" />
                                Hoàn tất
                            </Button>
                        )}
                    </div>
                </div>

                {/* Row 2: Sender badge + Action selects */}
                <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                    {/* Sender badge */}
                    <Badge variant="outline" className="text-[11px] font-medium h-6 px-2 bg-blue-50 text-blue-700 border-blue-200 shrink-0 max-w-[160px] truncate">
                        {thread.primary_participant || 'N/A'}
                    </Badge>

                    {/* Tag select with color badge */}
                    <Select
                        value={thread.tag}
                        onValueChange={(val) => updateTag.mutate({ threadId: thread.id, newTag: val as EmailTagV2 })}
                    >
                        <SelectTrigger className={cn(
                            "h-6 w-auto min-w-[90px] max-w-[130px] text-[11px] px-2 gap-1 rounded-md border",
                            currentTagOption?.badge ?? "border-border/50 bg-white"
                        )}>
                            {currentTagOption && <currentTagOption.icon className="w-3 h-3 shrink-0" />}
                            <span className="truncate">{currentTagOption?.label ?? thread.tag}</span>
                        </SelectTrigger>
                        <SelectContent>
                            {TAG_OPTIONS.map((opt) => {
                                const OptIcon = opt.icon;
                                return (
                                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                        <span className="flex items-center gap-1.5">
                                            <OptIcon className="w-3 h-3" />
                                            {opt.label}
                                        </span>
                                    </SelectItem>
                                );
                            })}
                        </SelectContent>
                    </Select>

                    {/* Priority select with color */}
                    {(() => {
                        const currentPri = PRIORITY_OPTIONS.find(p => p.value === thread.priority);
                        return (
                            <Select
                                value={thread.priority}
                                onValueChange={(val) => updatePriority.mutate({ threadId: thread.id, newPriority: val as EmailPriorityV2 })}
                            >
                                <SelectTrigger className="h-6 w-auto min-w-[70px] max-w-[100px] text-[11px] px-2 gap-1 border border-border/50 rounded-md bg-white">
                                    {currentPri && <currentPri.icon className={cn("w-3 h-3 shrink-0", currentPri.color)} />}
                                    <span className="truncate">{currentPri?.label ?? thread.priority}</span>
                                </SelectTrigger>
                                <SelectContent>
                                    {PRIORITY_OPTIONS.map((opt) => {
                                        const OptIcon = opt.icon;
                                        return (
                                            <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                                <span className={cn("flex items-center gap-1.5", opt.color)}>
                                                    <OptIcon className="w-3 h-3" />
                                                    {opt.label}
                                                </span>
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        );
                    })()}

                    {/* Assign select */}
                    <Select
                        value={thread.owner_id ?? 'unassigned'}
                        onValueChange={(val) => assignThread.mutate({
                            threadId: thread.id,
                            ownerId: val === 'unassigned' ? null : val,
                        })}
                    >
                        <SelectTrigger className="h-6 w-auto min-w-[80px] max-w-[130px] text-[11px] px-2 gap-1 border border-border/50 rounded-md bg-white">
                            <UserCircle className="w-3 h-3 shrink-0 text-muted-foreground/50" />
                            <SelectValue placeholder="Giao..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="unassigned" className="text-xs">Chưa giao</SelectItem>
                            {teamMembers?.map((member) => (
                                <SelectItem key={member.id} value={member.id} className="text-xs">
                                    {member.full_name || member.email}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* ── Scrollable Message Timeline ── */}
            <ScrollArea className="flex-1 min-h-0 bg-white">
                {isLoading ? (
                    <div className="flex items-center justify-center h-32">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 p-4">
                        {messages.length === 0 && (
                            <div className="text-center py-12">
                                <Mail className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3" />
                                <p className="text-sm text-muted-foreground">Chưa có tin nhắn nào</p>
                            </div>
                        )}

                        {messages.map((msg, idx) => {
                            const isOutbound = msg.direction === 'OUTBOUND';
                            const displayDate = msg.sent_at ?? msg.created_at;

                            // Sender: use msg.sender directly, fallback to thread participant
                            const senderDisplay = isOutbound
                                ? 'Roomrise'
                                : (msg.sender || thread.primary_participant || 'N/A');

                            // Body: prefer body_html (rendered as HTML), fallback to body_text
                            const hasHtmlBody = !!msg.body_html && msg.body_html.trim().length > 0;
                            const bodyText = msg.body_text || (msg.body_html ? htmlToText(msg.body_html) : '');
                            const bodyEmpty = !hasHtmlBody && !bodyText;

                            return (
                                <div
                                    key={msg.id}
                                    className={cn(
                                        'flex flex-col w-full animate-[premium-fade-in-up_0.3s_ease-out_forwards] opacity-0',
                                        isOutbound ? 'items-end' : 'items-start'
                                    )}
                                    style={{ animationDelay: `${idx * 30}ms` }}
                                >
                                    {/* Meta row */}
                                    <div className={cn('flex items-center gap-2 mb-1 px-1 w-full', isOutbound ? 'flex-row-reverse' : 'flex-row')}>
                                        {isOutbound ? (
                                            <Send className="w-3 h-3 text-primary/60" />
                                        ) : (
                                            <ArrowDown className="w-3 h-3 text-emerald-500/60" />
                                        )}
                                        <span className="text-[11px] font-medium text-foreground/80">
                                            {senderDisplay}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground/60">
                                            {displayDate ? format(new Date(displayDate), 'dd/MM/yyyy HH:mm') : ''}
                                        </span>
                                    </div>

                                    {/* Email content — full width for inbound, slightly narrower for outbound */}
                                    <div
                                        className={cn(
                                            'px-4 py-3 rounded-xl border text-[13px] break-words leading-relaxed overflow-hidden min-w-0',
                                            'transition-shadow duration-200 hover:shadow-sm',
                                            isOutbound
                                                ? 'bg-primary/90 text-primary-foreground border-primary/60 rounded-tr-sm max-w-[85%]'
                                                : 'bg-slate-50 border-border/40 rounded-tl-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] w-full'
                                        )}
                                    >
                                        {bodyEmpty ? (
                                            <span className="italic text-muted-foreground/50">(Nội dung trống)</span>
                                        ) : hasHtmlBody ? (
                                            <EmailHtmlIframe html={msg.body_html!} className="w-full" />
                                        ) : (
                                            <span className="whitespace-pre-wrap">{bodyText}</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </ScrollArea>

            {/* ── Pagination ── */}
            {totalMessages > PAGE_SIZE && (
                <div className="flex items-center justify-between px-4 py-1.5 border-t border-border/40 shrink-0 bg-white text-[11px] text-muted-foreground">
                    <Button variant="ghost" size="sm" className="h-6 text-[11px]" disabled={msgPage <= 1} onClick={() => setMsgPage((p) => p - 1)}>
                        <ChevronLeft className="w-3 h-3 mr-0.5" /> Cũ hơn
                    </Button>
                    <span>{msgPage * PAGE_SIZE - PAGE_SIZE + 1}–{Math.min(msgPage * PAGE_SIZE, totalMessages)} / {totalMessages}</span>
                    <Button variant="ghost" size="sm" className="h-6 text-[11px]" disabled={msgPage * PAGE_SIZE >= totalMessages} onClick={() => setMsgPage((p) => p + 1)}>
                        Mới hơn <ChevronRight className="w-3 h-3 ml-0.5" />
                    </Button>
                </div>
            )}

            {/* ── Sticky Reply Composer ── */}
            <div className="shrink-0 border-t border-border/40 bg-white px-3 py-2 sticky bottom-0 z-10 shadow-[0_-1px_3px_rgba(0,0,0,0.04)]">
                {!thread.email_account_id ? (
                    /* Mailbox unresolved warning */
                    <div className="flex items-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-3">
                        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                        <span className="text-sm text-amber-700">
                            Không xác định được mailbox. Mở chi tiết email để trả lời.
                        </span>
                    </div>
                ) : (
                    <ReplyComposer
                        key={thread.id}
                        lastMessage={lastMessageV1}
                        accountEmail={account?.email_address ?? ''}
                        onSend={(replyData) => replyMutation.mutate(replyData)}
                        isSending={replyMutation.isPending}
                        disabled={!canReply}
                        disabledReason={disabledReason}
                    />
                )}
            </div>
        </div>
    );
}
