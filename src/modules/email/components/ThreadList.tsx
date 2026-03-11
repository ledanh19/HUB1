import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Inbox } from 'lucide-react';
import type { EmailThread } from '@/types/email';
import { ThreadListItem } from './ThreadListItem';

interface ThreadListProps {
  threads: EmailThread[];
  isLoading: boolean;
  selectedThreadId?: string;
  onSelectThread: (threadId: string) => void;
  total: number;
  checkedIds?: Set<string>;
  onCheck?: (threadId: string, checked: boolean) => void;
}

export function ThreadList({
  threads,
  isLoading,
  selectedThreadId,
  onSelectThread,
  total,
  checkedIds,
  onCheck,
}: ThreadListProps) {
  if (isLoading && threads.length === 0) {
    return (
      <div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center h-10 px-2 border-b border-border/40 gap-2">
            <Skeleton className="h-[18px] w-[18px] rounded-sm ml-2.5" />
            <Skeleton className="h-[18px] w-[18px] rounded-full" />
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3 w-12 mr-2" />
          </div>
        ))}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <div className="rounded-full bg-muted/50 p-6 mb-4">
          <Inbox className="h-12 w-12 opacity-40" />
        </div>
        <p className="text-base font-medium mb-1">Không có email nào</p>
        <p className="text-sm text-muted-foreground/70">Hãy kết nối tài khoản Gmail để bắt đầu đồng bộ</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto min-h-0 h-full">
      {threads.map((thread) => (
        <ThreadListItem
          key={thread.id}
          thread={thread}
          isSelected={thread.id === selectedThreadId}
          isChecked={checkedIds?.has(thread.id)}
          onCheck={(checked) => onCheck?.(thread.id, checked)}
          onClick={() => onSelectThread(thread.id)}
        />
      ))}
      {threads.length < total && (
        <div className="h-10 flex items-center justify-center text-xs text-muted-foreground">
          Hiển thị {threads.length} / {total} cuộc hội thoại
        </div>
      )}
    </div>
  );
}
