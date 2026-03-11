import { useQuery } from '@tanstack/react-query';
import { fetchEmailThreadDetail } from '../api';

export function useEmailThreadDetail(threadId: string | undefined) {
  return useQuery({
    queryKey: ['email-thread-detail', threadId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: () => fetchEmailThreadDetail(threadId!),
    enabled: !!threadId,
  });
}
