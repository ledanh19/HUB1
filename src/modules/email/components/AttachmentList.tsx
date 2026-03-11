import React from 'react';
import { X, FileIcon, ImageIcon, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AttachmentDraft {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  file: File;
  status: 'READY' | 'FAILED';
  error?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachmentListProps {
  attachments: AttachmentDraft[];
  onRemove: (id: string) => void;
}

export function AttachmentList({ attachments, onRemove }: AttachmentListProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-4 py-2 border-t">
      {attachments.map((att) => {
        const isImage = att.mimeType.startsWith('image/');
        const Icon = att.status === 'FAILED' ? AlertCircle : isImage ? ImageIcon : FileIcon;

        return (
          <div
            key={att.id}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs max-w-[240px]',
              att.status === 'FAILED'
                ? 'border-destructive/30 bg-destructive/5 text-destructive'
                : 'bg-muted/50'
            )}
            title={att.status === 'FAILED' ? att.error : att.name}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{att.name}</span>
            <span className="text-muted-foreground shrink-0">{formatSize(att.size)}</span>
            <button
              type="button"
              onClick={() => onRemove(att.id)}
              className="shrink-0 rounded-full hover:bg-foreground/10 p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
