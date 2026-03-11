import React from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { SectionCard } from '@/components/layout/SectionCard';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Plus, ArrowLeft, Mail } from 'lucide-react';
import { useEmailAccounts } from '@/modules/email/hooks';
import { EmailAccountCard } from '@/modules/email/components';
import { deduplicateEmailAccounts } from '@/modules/email/utils/emailAccountStatus';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/useAuth';

export default function EmailAccountsPage() {
  const { accounts: rawAccounts, isLoading, connect, isConnecting, disconnect, isDisconnecting, triggerSync, isSyncing } = useEmailAccounts();
  const accounts = deduplicateEmailAccounts(rawAccounts);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAdmin } = usePermissions();

  // Handle OAuth callback redirect params
  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected) {
      toast.success(`Đã kết nối ${connected}`);
    }
    if (error) {
      const errorMessages: Record<string, string> = {
        oauth_denied: 'Bạn đã từ chối quyền truy cập Gmail',
        missing_params: 'Thiếu tham số từ Google',
        invalid_state: 'Phiên kết nối hết hạn. Thử lại.',
        no_tokens: 'Không nhận được token từ Google',
        no_email: 'Không lấy được địa chỉ email',
        exchange_failed: 'Lỗi xác thực với Google',
      };
      toast.error(errorMessages[error] ?? `Lỗi: ${error}`);
    }
  }, [searchParams]);

  return (
    <>
      <Header title="Email Accounts" subtitle="Quản lý tài khoản email" />
      <PageContainer><SectionCard noPadding className="overflow-hidden">
        <div className="flex flex-col h-[calc(100vh-10rem)] sm:h-[calc(100vh-14rem)]">
          {/* Back to inbox button */}
          <div className="flex items-center h-12 px-4 border-b shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate('/email/inbox')}
            >
              <ArrowLeft className="h-4 w-4" />
              Quay lại hộp thư
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="py-6 px-4 space-y-4">
              {/* Description */}
              <div className="text-sm text-muted-foreground">
                Quản lý các tài khoản Gmail được kết nối với hệ thống. Email sẽ được đồng bộ tự động và hiển thị cho toàn team.
              </div>

              {/* Connect buttons – admin/super_admin only */}
              {isAdmin && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={() => connect('READ_ONLY')}
                    disabled={isConnecting}
                    variant="outline"
                    className="rounded-full"
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    {isConnecting ? 'Đang kết nối...' : 'Thêm Gmail (Đọc)'}
                  </Button>
                  <Button
                    onClick={() => connect('REPLY')}
                    disabled={isConnecting}
                    className="rounded-full bg-info hover:bg-info text-white"
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    {isConnecting ? 'Đang kết nối...' : 'Thêm Gmail (Đọc + Trả lời)'}
                  </Button>
                </div>
              )}

              {/* Account list */}
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : accounts.length === 0 ? (
                <div className="flex flex-col items-center py-20 text-muted-foreground">
                  <div className="rounded-full bg-muted/50 p-5 mb-4">
                    <Mail className="h-12 w-12 opacity-40" />
                  </div>
                  <p className="text-base font-medium mb-1">Chưa có tài khoản email nào</p>
                  <p className="text-sm text-muted-foreground/70">Bấm "Thêm Gmail" để kết nối tài khoản Gmail đầu tiên</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {accounts.map((account) => (
                    <EmailAccountCard
                      key={account.id}
                      account={account}
                      onDisconnect={disconnect}
                      onSync={triggerSync}
                      onReconnect={connect}
                      isDisconnecting={isDisconnecting}
                      isSyncing={isSyncing}
                      isAdmin={isAdmin}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </SectionCard></PageContainer>
    </>
  );
}
