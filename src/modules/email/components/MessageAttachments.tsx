import React, { useState, useCallback } from 'react';
import { Download, FileIcon, ImageIcon, Film, FileText, Paperclip, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

export interface AttachmentMeta {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface MessageAttachmentsProps {
  attachments: AttachmentMeta[];
  messageProviderMessageId: string;
  emailAccountId: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return ImageIcon;
  if (mimeType.startsWith('video/')) return Film;
  if (mimeType === 'application/pdf') return FileText;
  return FileIcon;
}

function getAttachmentUrl(params: {
  messageId: string;
  attachmentId: string;
  accountId: string;
  filename: string;
  mimeType: string;
}) {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const base = `https://${projectId}.supabase.co/functions/v1/email-attachments`;
  const qs = new URLSearchParams({
    messageId: params.messageId,
    attachmentId: params.attachmentId,
    accountId: params.accountId,
    filename: params.filename,
    mimeType: params.mimeType,
  });
  return `${base}?${qs.toString()}`;
}

export function MessageAttachments({ attachments, messageProviderMessageId, emailAccountId }: MessageAttachmentsProps) {
  if (!attachments || attachments.length === 0) return null;

  const imageAttachments = attachments.filter(a => a.mimeType.startsWith('image/'));
  const otherAttachments = attachments.filter(a => !a.mimeType.startsWith('image/'));

  return (
    <div className="mt-3 border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b">
        <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {attachments.length} tệp đính kèm
        </span>
      </div>

      {/* Image grid */}
      {imageAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3">
          {imageAttachments.map((att) => (
            <ImageAttachmentCard
              key={att.attachmentId}
              attachment={att}
              messageId={messageProviderMessageId}
              accountId={emailAccountId}
            />
          ))}
        </div>
      )}

      {/* File list */}
      {otherAttachments.length > 0 && (
        <div className={cn("flex flex-wrap gap-2 p-3", imageAttachments.length > 0 && "border-t")}>
          {otherAttachments.map((att) => (
            <FileAttachmentCard
              key={att.attachmentId}
              attachment={att}
              messageId={messageProviderMessageId}
              accountId={emailAccountId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ImageAttachmentCard({
  attachment,
  messageId,
  accountId,
}: {
  attachment: AttachmentMeta;
  messageId: string;
  accountId: string;
}) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const loadThumbnail = useCallback(async () => {
    if (thumbnailUrl || loading) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const url = getAttachmentUrl({
        messageId,
        attachmentId: attachment.attachmentId,
        accountId,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
      });

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Failed');
      const blob = await res.blob();
      setThumbnailUrl(URL.createObjectURL(blob));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [thumbnailUrl, loading, messageId, attachment, accountId]);

  // Auto-load small images
  React.useEffect(() => {
    if (attachment.size < 2 * 1024 * 1024) {
      loadThumbnail();
    }
  }, []);

  const handleDownload = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const url = getAttachmentUrl({
        messageId,
        attachmentId: attachment.attachmentId,
        accountId,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
      });
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = attachment.filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error('Download failed:', err);
    }
  }, [messageId, attachment, accountId]);

  return (
    <div className="relative group rounded-lg border overflow-hidden bg-muted/20 w-[200px]">
      {/* Thumbnail */}
      <div className="h-[140px] flex items-center justify-center bg-muted/30 overflow-hidden">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={attachment.filename}
            className="w-full h-full object-cover"
          />
        ) : loading ? (
          <div className="animate-pulse bg-muted rounded w-full h-full" />
        ) : error ? (
          <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
        ) : (
          <Button variant="ghost" size="sm" onClick={loadThumbnail}>
            <Eye className="h-4 w-4 mr-1" /> Xem
          </Button>
        )}
      </div>

      {/* Info + actions overlay */}
      <div className="px-2 py-1.5 flex items-center gap-1.5 bg-background">
        <ImageIcon className="h-3.5 w-3.5 text-destructive shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{attachment.filename}</p>
          <p className="text-micro text-muted-foreground">{formatSize(attachment.size)}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={handleDownload}
          title="Tải xuống"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function FileAttachmentCard({
  attachment,
  messageId,
  accountId,
}: {
  attachment: AttachmentMeta;
  messageId: string;
  accountId: string;
}) {
  const Icon = getIcon(attachment.mimeType);

  const handleDownload = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const url = getAttachmentUrl({
        messageId,
        attachmentId: attachment.attachmentId,
        accountId,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
      });
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = attachment.filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error('Download failed:', err);
    }
  }, [messageId, attachment, accountId]);

  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2 bg-muted/20 hover:bg-muted/40 transition-colors max-w-[280px]">
      <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{attachment.filename}</p>
        <p className="text-micro text-muted-foreground">{formatSize(attachment.size)}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={handleDownload}
        title="Tải xuống"
      >
        <Download className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
