import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sendEmailReply } from '../api';
import type { EmailReplyRequest } from '@/types/email';
import { toast } from 'sonner';

export function useEmailReply(threadId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: EmailReplyRequest) => sendEmailReply(threadId, body),
    onSuccess: () => {
      toast.success('Đã gửi email trả lời');
      queryClient.invalidateQueries({ queryKey: ['email-thread-detail', threadId] });
      queryClient.invalidateQueries({ queryKey: ['email-threads'] });
    },
    onError: (err: Error) => {
      toast.error(`Gửi thất bại: ${err.message}`);
    },
  });
}
