import { useState, useRef, KeyboardEvent, useEffect, ChangeEvent, useCallback } from 'react';
import { Send, Paperclip, AlertCircle, Clock, X, Image as ImageIcon, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Conversation } from '@/hooks/useConversations';
import { QuickReplyDropdown } from './QuickReplyDropdown';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';

interface Attachment {
  file: File;
  preview: string;
  type: 'image' | 'file';
}

interface ReplyInputProps {
  conversation: Conversation | null;
  onSend: (message: string, attachments?: File[]) => void;
  isSending?: boolean;
  disabled?: boolean;
  hasPendingMessages?: boolean;
}

const MAX_CHARS = 2000;
const COOLDOWN_SECONDS = 3;
const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function ReplyInput({
  conversation,
  onSend,
  isSending = false,
  disabled = false,
  hasPendingMessages = false
}: ReplyInputProps) {
  const isMobile = useIsMobile();
  const [message, setMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isQuickReplyOpen, setIsQuickReplyOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // iOS keyboard handling - adjust viewport
  useEffect(() => {
    if (!isMobile) return;

    const handleFocus = () => {
      // Scroll input into view when keyboard opens
      setTimeout(() => {
        containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 300);
    };

    const textarea = textareaRef.current;
    textarea?.addEventListener('focus', handleFocus);

    return () => {
      textarea?.removeEventListener('focus', handleFocus);
    };
  }, [isMobile]);

  // Determine disabled reason
  const getDisabledReason = (): string | null => {
    if (!conversation) return null;
    if (!conversation.is_messaging_supported) return 'Kênh này không hỗ trợ nhắn tin';
    if (conversation.status === 'CLOSED') return 'Hội thoại đã đóng';
    if (isSending || hasPendingMessages) return 'Đang gửi tin nhắn...';
    if (cooldown > 0) return `Vui lòng chờ ${cooldown}s...`;
    return null;
  };

  const disabledReason = getDisabledReason();

  // WhatsApp 24h window check
  const isWhatsApp = conversation?.channel_type === 'WHATSAPP';
  const isOutside24h = (() => {
    if (!isWhatsApp) return false;
    // No inbound at all = outside window (must use template)
    if (!conversation?.last_inbound_at) return true;
    const lastInbound = new Date(conversation.last_inbound_at).getTime();
    const now = Date.now();
    return (now - lastInbound) > 24 * 60 * 60 * 1000;
  })();

  // Handle file selection
  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remainingSlots = MAX_ATTACHMENTS - attachments.length;
    if (files.length > remainingSlots) {
      toast.warning(`Chỉ có thể đính kèm tối đa ${MAX_ATTACHMENTS} tệp`);
    }

    const validFiles = files.slice(0, remainingSlots).filter(file => {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`Tệp "${file.name}" quá lớn (tối đa 10MB)`);
        return false;
      }
      return true;
    });

    const newAttachments: Attachment[] = validFiles.map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
      type: file.type.startsWith('image/') ? 'image' : 'file',
    }));

    setAttachments(prev => [...prev, ...newAttachments]);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Remove attachment
  const removeAttachment = (index: number) => {
    setAttachments(prev => {
      const newAttachments = [...prev];
      // Revoke object URL to prevent memory leak
      if (newAttachments[index].preview) {
        URL.revokeObjectURL(newAttachments[index].preview);
      }
      newAttachments.splice(index, 1);
      return newAttachments;
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      attachments.forEach(att => {
        if (att.preview) URL.revokeObjectURL(att.preview);
      });
    };
  }, []);

  // Handle quick reply template selection
  const handleTemplateSelect = (content: string) => {
    setMessage(content);
    textareaRef.current?.focus();
  };

  const canSend = conversation &&
    conversation.is_messaging_supported &&
    conversation.status === 'OPEN' &&
    (message.trim().length > 0 || attachments.length > 0) &&
    message.length <= MAX_CHARS &&
    !isSending &&
    !disabled &&
    !hasPendingMessages &&
    cooldown === 0;

  const handleSend = () => {
    if (!canSend) return;

    const files = attachments.map(a => a.file);
    onSend(message.trim(), files.length > 0 ? files : undefined);

    // Cleanup previews
    attachments.forEach(att => {
      if (att.preview) URL.revokeObjectURL(att.preview);
    });

    setMessage('');
    setAttachments([]);
    setCooldown(COOLDOWN_SECONDS);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter (without Shift for new line)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  if (!conversation) {
    return null;
  }

  // Channel doesn't support messaging - show contact alternatives
  if (!conversation.is_messaging_supported) {
    return (
      <div className="border-t p-4 bg-background">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <span className="font-medium">Kênh này không hỗ trợ nhắn tin</span>
            <p className="text-sm mt-1">
              OTA này không hỗ trợ nhắn tin qua Channex. Vui lòng liên hệ khách qua:
            </p>
            {conversation.guest_email && (
              <span className="block mt-1">
                📧 Email: <a href={`mailto:${conversation.guest_email}`} className="underline font-medium">
                  {conversation.guest_email}
                </a>
              </span>
            )}
            {conversation.guest_phone && (
              <span className="block mt-1">
                📞 Điện thoại: <a href={`tel:${conversation.guest_phone}`} className="underline font-medium">
                  {conversation.guest_phone}
                </a>
              </span>
            )}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Conversation is closed
  if (conversation.status === 'CLOSED') {
    return (
      <div className="border-t p-4 bg-background">
        <Alert>
          <X className="h-4 w-4" />
          <AlertDescription>
            <span className="font-medium">Hội thoại đã đóng</span>
            <p className="text-sm mt-1 text-muted-foreground">
              Case này đã được đóng. Nếu khách liên hệ lại, hội thoại sẽ tự động mở lại.
            </p>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "border-t w-full bg-background",
        // Mobile safe-area padding
        isMobile ? "p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]" : "px-3 py-2"
      )}
    >
      {/* WhatsApp 24h window warning */}
      {isWhatsApp && isOutside24h && (
        <Alert className="mb-3 border-warning/20 bg-warning/10">
          <Clock className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning">
            <span className="font-medium">Ngoài cửa sổ 24 giờ</span>
            <p className="text-xs mt-1">
              Khách chưa nhắn tin trong 24h qua. Bạn cần sử dụng tin nhắn mẫu (template) để liên hệ lại.
            </p>
          </AlertDescription>
        </Alert>
      )}
      {isWhatsApp && !isOutside24h && (
        <div className="flex items-center gap-1.5 mb-2 text-xs text-success">
          <Clock className="h-3 w-3" />
          <span>Cửa sổ nhắn tin WhatsApp đang mở</span>
        </div>
      )}
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Quick Reply + Disabled reason - Mobile uses bottom sheet */}
      <div className="flex items-center justify-between mb-1.5">
        {isMobile ? (
          <Drawer open={isQuickReplyOpen} onOpenChange={setIsQuickReplyOpen}>
            <DrawerTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                disabled={isSending || disabled || hasPendingMessages || cooldown > 0}
              >
                <Zap className="h-4 w-4 mr-1.5" />
                Mẫu trả lời
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Chọn mẫu trả lời nhanh</DrawerTitle>
              </DrawerHeader>
              <div className="p-4 max-h-[60dvh] overflow-auto">
                <QuickReplyDropdown
                  conversation={conversation}
                  onSelectTemplate={(content) => {
                    handleTemplateSelect(content);
                    setIsQuickReplyOpen(false);
                  }}
                  disabled={isSending || disabled || hasPendingMessages || cooldown > 0}
                />
              </div>
            </DrawerContent>
          </Drawer>
        ) : (
          <QuickReplyDropdown
            conversation={conversation}
            onSelectTemplate={handleTemplateSelect}
            disabled={isSending || disabled || hasPendingMessages || cooldown > 0}
          />
        )}

        {disabledReason && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{disabledReason}</span>
          </div>
        )}
      </div>

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((att, index) => (
            <div key={index} className="relative group">
              {att.type === 'image' ? (
                <img
                  src={att.preview}
                  alt={att.file.name}
                  className="h-14 w-14 object-cover rounded-md border"
                />
              ) : (
                <div className="h-14 w-14 flex items-center justify-center bg-muted rounded-md border">
                  <Paperclip className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <button
                type="button"
                onClick={() => removeAttachment(index)}
                className="absolute -top-1.5 -right-1.5 h-6 w-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex gap-2 items-end">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isMobile ? "Nhập tin nhắn..." : "Nhập tin nhắn... (Enter để gửi, Shift+Enter xuống dòng)"}
            className={cn(
              "resize-none pr-12 !bg-white dark:!bg-card",
              isMobile ? "min-h-[44px] max-h-[120px] text-base" : "min-h-[60px] max-h-[160px]",
              (isSending || hasPendingMessages || cooldown > 0) && "opacity-50",
              message.length > MAX_CHARS && "border-destructive"
            )}
            disabled={isSending || disabled || hasPendingMessages || cooldown > 0}
          />

          {/* Character count - only show when approaching limit */}
          {message.length > MAX_CHARS * 0.8 && (
            <span className={cn(
              "absolute bottom-2 right-2 text-xs",
              message.length > MAX_CHARS ? "text-destructive" : "text-muted-foreground"
            )}>
              {message.length}/{MAX_CHARS}
            </span>
          )}
        </div>

        {/* Action buttons - vertical on desktop, horizontal on mobile */}
        <div className={cn("flex gap-2", isMobile ? "flex-row" : "flex-col")}>
          <Button
            variant="outline"
            size="icon"
            onClick={openFilePicker}
            disabled={isSending || disabled || hasPendingMessages || cooldown > 0 || attachments.length >= MAX_ATTACHMENTS}
            title={attachments.length >= MAX_ATTACHMENTS ? `Tối đa ${MAX_ATTACHMENTS} ảnh` : "Đính kèm ảnh"}
            className="h-9 w-9"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>

          <Button
            size="icon"
            onClick={handleSend}
            disabled={!canSend}
            title={canSend ? "Gửi tin nhắn" : disabledReason || "Nhập tin nhắn để gửi"}
            className="h-9 w-9"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}