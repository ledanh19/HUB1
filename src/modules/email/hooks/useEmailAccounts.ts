import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchEmailAccounts, connectGmailAccount, disconnectEmailAccount, triggerSync } from '../api';
import { toast } from 'sonner';

export function useEmailAccounts() {
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: ['email-accounts'],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: fetchEmailAccounts,
    select: (data) => data.accounts,
    refetchInterval: (query) => {
      // Stop auto-refresh if any account needs reauth (prevent noisy polling)
      const raw = query.state.data as { accounts?: Array<{ status: string }> } | undefined;
      if (raw?.accounts?.some((a) => a.status === 'REAUTH_REQUIRED')) return false;
      return 30_000;
    },
  });

  const connectMutation = useMutation({
    mutationFn: (scopeLevel: string) => connectGmailAccount(scopeLevel),
    onSuccess: (data) => {
      // Redirect to Google OAuth
      window.location.href = data.url;
    },
    onError: (err: Error) => {
      toast.error(`Không thể kết nối Gmail: ${err.message}`);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectEmailAccount,
    onSuccess: () => {
      toast.success('Đã ngắt kết nối tài khoản email');
      queryClient.invalidateQueries({ queryKey: ['email-accounts'] });
    },
    onError: (err: Error) => {
      toast.error(`Lỗi ngắt kết nối: ${err.message}`);
    },
  });

  const syncMutation = useMutation({
    mutationFn: triggerSync,
    onSuccess: (data) => {
      if (data.locked) {
        toast.warning('Đang sync bởi job khác. Vui lòng thử lại sau.');
      } else {
        toast.success(`Sync hoàn tất: ${data.syncedThreads ?? 0} threads, ${data.syncedMessages ?? 0} messages`);
      }
      queryClient.invalidateQueries({ queryKey: ['email-accounts'] });
      // Invalidate both V1 and V2 queryKeys so all inbox views refresh
      queryClient.invalidateQueries({ queryKey: ['email-threads'] });
      queryClient.invalidateQueries({ queryKey: ['email-operational-threads'] });
      queryClient.invalidateQueries({ queryKey: ['email-operational-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['email-operational-messages'] });
    },
    onError: (err: Error) => {
      toast.error(`Lỗi đồng bộ: ${err.message}`);
    },
  });

  return {
    accounts: accountsQuery.data ?? [],
    isLoading: accountsQuery.isLoading,
    error: accountsQuery.error,
    connect: connectMutation.mutate,
    isConnecting: connectMutation.isPending,
    disconnect: disconnectMutation.mutate,
    isDisconnecting: disconnectMutation.isPending,
    triggerSync: syncMutation.mutate,
    isSyncing: syncMutation.isPending,
  };
}
