import React, { useMemo, useState, useCallback } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { SectionCard } from '@/components/layout/SectionCard';
import { Header } from '@/components/layout/Header';
import { useParams, useNavigate } from 'react-router-dom';
import { useEmailThreadDetail } from '@/modules/email/hooks/useEmailThreadDetail';
import { useEmailReply } from '@/modules/email/hooks/useEmailReply';
import { useEmailAccounts } from '@/modules/email/hooks/useEmailAccounts';
import { ThreadDetail, ReplyComposer } from '@/modules/email/components';
import { WorkflowPanel } from '@/modules/email/components/WorkflowPanel';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';

export default function EmailThreadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useEmailThreadDetail(id);
  const { accounts } = useEmailAccounts();
  const replyMutation = useEmailReply(id ?? '');
  const { userRole } = useAuth();
  const isMobile = useIsMobile();

  // Track if the composer is expanded (for mobile full-screen compose)
  const [isMobileComposeOpen, setIsMobileComposeOpen] = useState(false);
  const [mobileComposeMode, setMobileComposeMode] = useState<'reply' | 'reply-all' | 'forward'>('reply');

  const account = useMemo(() => {
    if (!data?.thread) return undefined;
    return accounts.find((a) => a.id === data.thread.email_account_id);
  }, [data?.thread, accounts]);

  const lastMessage = useMemo(() => {
    if (!data?.messages?.length) return undefined;
    return data.messages[data.messages.length - 1];
  }, [data?.messages]);

  // RBAC: only admin/super_admin/cskh can reply, AND account must be active with REPLY scope
  const hasReplyRole = userRole === 'admin' || userRole === 'super_admin' || userRole === 'cskh';

  // Compute specific disabled reason for UX clarity
  const { canReply, disabledReason } = useMemo(() => {
    if (!hasReplyRole) {
      return { canReply: false, disabledReason: `Vai trò "${userRole}" không có quyền trả lời email.` };
    }
    if (!account) {
      return { canReply: false, disabledReason: 'Không tìm thấy tài khoản email liên kết với luồng này.' };
    }
    if (account.status === 'ERROR') {
      return { canReply: false, disabledReason: `Tài khoản ${account.email_address} đang lỗi (${account.error_code || 'token expired'}). Vui lòng kết nối lại.` };
    }
    if (account.status === 'REVOKED') {
      return { canReply: false, disabledReason: `Tài khoản ${account.email_address} đã bị thu hồi. Vui lòng kết nối lại.` };
    }
    if (account.status !== 'ACTIVE') {
      return { canReply: false, disabledReason: `Tài khoản ${account.email_address} không hoạt động (${account.status}).` };
    }
    if (account.scope_level === 'READ_ONLY') {
      return { canReply: false, disabledReason: `Tài khoản ${account.email_address} chỉ có quyền đọc (READ_ONLY). Kết nối lại với quyền "Reply" để gửi email.` };
    }
    return { canReply: true, disabledReason: undefined };
  }, [hasReplyRole, userRole, account]);

  const handleOpenMobileCompose = useCallback((mode: 'reply' | 'reply-all' | 'forward') => {
    setMobileComposeMode(mode);
    setIsMobileComposeOpen(true);
  }, []);

  const handleCloseMobileCompose = useCallback(() => {
    setIsMobileComposeOpen(false);
  }, []);

  // ═══ MOBILE: Full-screen layout, no Header/PageContainer/SectionCard ═══
  if (isMobile) {
    return (
      <>
        <div className="flex flex-col h-[100dvh] bg-background">
          <ThreadDetail
            thread={data?.thread}
            messages={data?.messages ?? []}
            isLoading={isLoading}
            onBack={() => navigate('/email/inbox')}
            onMobileReply={canReply ? handleOpenMobileCompose : undefined}
          />
        </div>

        {/* Full-screen mobile compose overlay */}
        {isMobileComposeOpen && (
          <div
            className="fixed inset-0 z-50 bg-background flex flex-col"
            style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <ReplyComposer
              lastMessage={lastMessage}
              accountEmail={account?.email_address ?? ''}
              onSend={(replyData) => {
                replyMutation.mutate(replyData);
                handleCloseMobileCompose();
              }}
              isSending={replyMutation.isPending}
              disabled={!canReply}
              disabledReason={disabledReason}
              allMessages={data?.messages}
              isMobileFullScreen
              initialMode={mobileComposeMode}
              onClose={handleCloseMobileCompose}
            />
          </div>
        )}
      </>
    );
  }

  // ═══ DESKTOP: Original layout ═══
  return (
    <>
      <Header title="Chi tiết Email" />
      <PageContainer>
        <SectionCard noPadding className="overflow-hidden flex flex-col h-[calc(100vh-8rem)]">
          <div className="flex-1 flex min-h-0">
            {/* Email thread + messages */}
            <div className="flex-1 min-w-0 flex flex-col">
              <ThreadDetail
                thread={data?.thread}
                messages={data?.messages ?? []}
                isLoading={isLoading}
                onBack={() => navigate('/email/inbox')}
              >
                <ReplyComposer
                  lastMessage={lastMessage}
                  accountEmail={account?.email_address ?? ''}
                  onSend={(replyData) => replyMutation.mutate(replyData)}
                  isSending={replyMutation.isPending}
                  disabled={!canReply}
                  disabledReason={disabledReason}
                  allMessages={data?.messages}
                />
              </ThreadDetail>
            </div>

            {/* Workflow panel */}
            {id && !isLoading && (
              <WorkflowPanel
                threadId={id}
                workflow={data?.workflow ?? null}
                notes={data?.notes ?? []}
              />
            )}
          </div>
        </SectionCard>
      </PageContainer>
    </>
  );
}
