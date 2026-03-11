import { useQuery } from '@tanstack/react-query';
import { fetchEmailThreads } from '../api';
import type { EmailInboxFilters } from '@/types/email';

export function useEmailThreads(filters: EmailInboxFilters) {
  return useQuery({
    queryKey: ['email-threads', filters],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: () => fetchEmailThreads(filters),
    refetchInterval: 60_000, // refresh every 1 minute
    placeholderData: (prev) => prev, // keep previous while loading
  });
}
