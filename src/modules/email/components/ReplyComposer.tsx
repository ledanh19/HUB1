import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  Bold, Italic, Underline, Link, List, Smile, Paperclip, Trash2,
  Reply, ReplyAll, Forward, Lock, AlertCircle, X, MoreVertical, ChevronDown,
} from 'lucide-react';
import type { EmailMessage } from '@/types/email';
import { cn } from '@/lib/utils';
import { parseFromHeader } from '../utils/rfc2047';
import { isValidEmail } from '../utils/emailHelpers';
import { RecipientChipInput, type Recipient } from './RecipientChipInput';
import { AttachmentList, type AttachmentDraft } from './AttachmentList';
import {
  RichTextEditor,
  formatBold, formatItalic, formatUnderline,
  formatInsertLink, formatUnorderedList, clearEditor,
} from './RichTextEditor';

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25MB Gmail limit

// Common emoji list for quick picker
const EMOJI_LIST = ['😊', '👍', '❤️', '🎉', '🙏', '😂', '🔥', '✅', '💯', '⭐', '🤝', '💪', '😍', '🥳', '👏', '🙌'];

/** Chunked base64 conversion — avoids stack overflow for large files */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

interface ReplyComposerProps {
  lastMessage: EmailMessage | undefined;
  accountEmail: string;
  onSend: (data: {
    body: string;
    bodyHtml?: string;
    to: string;
    cc?: string;
    bcc?: string;
    reply_all?: boolean;
    isForward?: boolean;
    attachments?: Array<{ name: string; mimeType: string; base64: string }>;
  }) => void;
  isSending: boolean;
  disabled?: boolean;
  disabledReason?: string;
  allMessages?: EmailMessage[];
  // Mobile full-screen compose mode
  isMobileFullScreen?: boolean;
  initialMode?: 'reply' | 'reply-all' | 'forward';
  onClose?: () => void;
}

function emailToRecipient(email: string, name?: string): Recipient {
  return { email, name, valid: isValidEmail(email) };
}

export function ReplyComposer({ lastMessage, accountEmail, onSend, isSending, disabled, disabledReason, allMessages, isMobileFullScreen, initialMode, onClose }: ReplyComposerProps) {
  const [isExpanded, setIsExpanded] = useState(isMobileFullScreen ?? false);
  const [replyMode, setReplyMode] = useState<'reply' | 'reply-all' | 'forward'>(initialMode || 'reply');
  const [bodyText, setBodyText] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [toRecipients, setToRecipients] = useState<Recipient[]>([]);
  const [ccRecipients, setCcRecipients] = useState<Recipient[]>([]);
  const [bccRecipients, setBccRecipients] = useState<Recipient[]>([]);
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Default reply-to — MUST resolve to a valid email or empty string.
  // Never fallback to display name / tag / subject.
  const { defaultTo, defaultToName } = useMemo(() => {
    if (!lastMessage) return { defaultTo: '', defaultToName: '' };

    // Priority 1: Reply-To header (INBOUND only)
    if (lastMessage.direction === 'INBOUND') {
      const replyToHeader = lastMessage.headers?.['Reply-To'];
      if (replyToHeader) {
        const parsed = parseFromHeader(replyToHeader);
        if (isValidEmail(parsed.email)) {
          return { defaultTo: parsed.email!, defaultToName: parsed.name || '' };
        }
      }
    }

    // Priority 2: Scan from_json (INBOUND) or to_json (OUTBOUND) for first valid email
    const candidates = lastMessage.direction === 'INBOUND'
      ? lastMessage.from_json ?? []
      : lastMessage.to_json ?? [];

    for (const entry of candidates) {
      if (isValidEmail(entry?.email)) {
        return { defaultTo: entry.email, defaultToName: entry.name || '' };
      }
    }

    // Priority 3: No valid email found — leave empty, user must input manually
    return { defaultTo: '', defaultToName: '' };
  }, [lastMessage]);

  // Reply-All CC list
  const replyAllCcRecipients = useMemo(() => {
    if (!lastMessage || !accountEmail) return [];
    const addresses = new Map<string, string>();
    lastMessage.to_json?.forEach((p) => {
      if (p.email && p.email.toLowerCase() !== accountEmail.toLowerCase()) {
        addresses.set(p.email.toLowerCase(), p.name || '');
      }
    });
    lastMessage.cc_json?.forEach((p) => {
      if (p.email && p.email.toLowerCase() !== accountEmail.toLowerCase()) {
        addresses.set(p.email.toLowerCase(), p.name || '');
      }
    });
    if (defaultTo) addresses.delete(defaultTo.toLowerCase());
    return Array.from(addresses.entries()).map(([email, name]) => emailToRecipient(email, name));
  }, [lastMessage, accountEmail, defaultTo]);

  // Build forwarded message body (Gmail-style)
  const buildForwardBody = useCallback(() => {
    if (!lastMessage) return { text: '', html: '' };
    const from = lastMessage.from_json?.[0];
    const toList = lastMessage.to_json?.map(p => p.name ? `${p.name} <${p.email}>` : p.email).join(', ') || '';
    const dateStr = lastMessage.date ? new Date(lastMessage.date).toLocaleString('vi-VN') : '';
    const subject = lastMessage.subject || '';
    const fromStr = from?.name ? `${from.name} <${from.email}>` : (from?.email || '');

    const headerBlock = `---------- Forwarded message ---------\nFrom: ${fromStr}\nDate: ${dateStr}\nSubject: ${subject}\nTo: ${toList}`;

    const headerHtml = `<br><br><div style="border-top:1px solid #ccc;padding-top:10px;margin-top:10px;color:#5f6368;font-size:12px">
<b>---------- Forwarded message ---------</b><br>
<b>Từ:</b> ${fromStr}<br>
<b>Ngày:</b> ${dateStr}<br>
<b>Tiêu đề:</b> ${subject}<br>
<b>Đến:</b> ${toList}<br>
</div><br>`;

    const originalHtml = lastMessage.body_html || '';
    const originalText = lastMessage.body_text || '';

    return {
      text: `\n\n${headerBlock}\n\n${originalText}`,
      html: `${headerHtml}${originalHtml}`,
    };
  }, [lastMessage]);

  const expandWithMode = useCallback((mode: 'reply' | 'reply-all' | 'forward') => {
    setReplyMode(mode);
    setIsExpanded(true);
    if (mode === 'forward') {
      setToRecipients([]);
      setCcRecipients([]);
      setShowCc(false);
      setShowBcc(false);
      // Pre-populate with forwarded message content
      const fwd = buildForwardBody();
      setBodyText(fwd.text);
      setBodyHtml(fwd.html);
      // Set editor content after a tick
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML = fwd.html;
        }
      }, 50);
    } else if (mode === 'reply-all') {
      setToRecipients(defaultTo ? [emailToRecipient(defaultTo, defaultToName)] : []);
      setCcRecipients(replyAllCcRecipients);
      setShowCc(replyAllCcRecipients.length > 0);
    } else {
      setToRecipients(defaultTo ? [emailToRecipient(defaultTo, defaultToName)] : []);
      setCcRecipients([]);
      setShowCc(false);
    }
    setBccRecipients([]);
    setShowBcc(false);
  }, [defaultTo, defaultToName, replyAllCcRecipients, buildForwardBody]);

  // File attachment handling — chunked base64 conversion
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments: AttachmentDraft[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACHMENT_SIZE) {
        newAttachments.push({
          id: crypto.randomUUID(),
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          file,
          status: 'FAILED',
          error: `File quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB > 25MB)`,
        });
      } else {
        newAttachments.push({
          id: crypto.randomUUID(),
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          file,
          status: 'READY',
        });
      }
    }
    setAttachments((prev) => [...prev, ...newAttachments]);
    e.target.value = '';
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Only recipients with valid emails count for sending
  const validRecipients = useMemo(() => toRecipients.filter((r) => r.valid), [toRecipients]);
  const hasInvalidRecipients = useMemo(() => {
    return [...toRecipients, ...ccRecipients, ...bccRecipients].some((r) => !r.valid);
  }, [toRecipients, ccRecipients, bccRecipients]);

  const hasFailedAttachments = attachments.some((a) => a.status === 'FAILED');

  const hasContent = !!(bodyText.trim() || (bodyHtml.trim() && bodyHtml.trim() !== '<br>'));
  const canSend = hasContent && validRecipients.length > 0 && !hasInvalidRecipients && !hasFailedAttachments && !isSending;

  const disableReason = useMemo(() => {
    if (validRecipients.length === 0) return 'Vui lòng thêm email người nhận hợp lệ';
    if (hasInvalidRecipients) return 'Có email không hợp lệ trong danh sách người nhận';
    if (hasFailedAttachments) return 'Có file đính kèm bị lỗi — hãy xóa trước khi gửi';
    if (!hasContent) return 'Vui lòng nhập nội dung email';
    return undefined;
  }, [validRecipients, hasInvalidRecipients, hasFailedAttachments, bodyText, bodyHtml]);

  const handleSend = useCallback(async () => {
    if (!canSend) return;

    // Convert attachments to base64 using chunked method
    const attachmentData: Array<{ name: string; mimeType: string; base64: string }> = [];
    for (const att of attachments.filter((a) => a.status === 'READY')) {
      try {
        const arrayBuffer = await att.file.arrayBuffer();
        attachmentData.push({
          name: att.name,
          mimeType: att.mimeType,
          base64: arrayBufferToBase64(arrayBuffer),
        });
      } catch (err) {
        console.error(`Failed to read attachment ${att.name}:`, err);
      }
    }

    onSend({
      body: bodyText.trim(),
      bodyHtml: bodyHtml.trim() || undefined,
      to: validRecipients.map((r) => r.email).join(', '),
      cc: ccRecipients.length > 0 ? ccRecipients.map((r) => r.email).join(', ') : undefined,
      bcc: bccRecipients.length > 0 ? bccRecipients.map((r) => r.email).join(', ') : undefined,
      reply_all: replyMode === 'reply-all',
      isForward: replyMode === 'forward',
      attachments: attachmentData.length > 0 ? attachmentData : undefined,
    });
    setBodyText('');
    setBodyHtml('');
    clearEditor(editorRef);
    setAttachments([]);
    setIsExpanded(false);
  }, [canSend, bodyText, bodyHtml, validRecipients, ccRecipients, bccRecipients, attachments, replyMode, onSend]);

  const handleDiscard = () => {
    if ((bodyText.trim() || attachments.length > 0) && !window.confirm("Bạn có chắc muốn hủy thư đang soạn?")) return;
    setBodyText('');
    setBodyHtml('');
    clearEditor(editorRef);
    setCcRecipients([]);
    setBccRecipients([]);
    setAttachments([]);
    setShowCc(false);
    setShowBcc(false);
    setShowEmojiPicker(false);
    setIsExpanded(false);
    setReplyMode('reply');
    // Close mobile full-screen overlay
    if (isMobileFullScreen && onClose) onClose();
  };

  // Auto-expand with initial mode on mount for mobile full-screen
  React.useEffect(() => {
    if (isMobileFullScreen && initialMode) {
      expandWithMode(initialMode);
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const insertEmoji = useCallback((emoji: string) => {
    if (editorRef.current) {
      editorRef.current.focus();
      document.execCommand('insertText', false, emoji);
    }
    setShowEmojiPicker(false);
  }, []);

  // Track active formatting state for toolbar visual feedback
  const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});
  const updateActiveFormats = useCallback(() => {
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
    });
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.addEventListener('keyup', updateActiveFormats);
    editor.addEventListener('mouseup', updateActiveFormats);
    document.addEventListener('selectionchange', updateActiveFormats);
    return () => {
      editor.removeEventListener('keyup', updateActiveFormats);
      editor.removeEventListener('mouseup', updateActiveFormats);
      document.removeEventListener('selectionchange', updateActiveFormats);
    };
  }, [isExpanded, updateActiveFormats]);

  if (disabled) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 p-3">
        <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm text-muted-foreground">
          {disabledReason || 'Không thể trả lời email từ tài khoản này.'}
        </span>
      </div>
    );
  }

  // ── Debug panel (E): ?debugEmail=1 ──
  const showDebug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debugEmail');

  if (!isExpanded) {
    return (
      <div className="space-y-2">
        {accountEmail && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            <span>Trả lời từ:</span>
            <Badge variant="outline" className="font-normal bg-[#E0EBF5] text-primary border-primary/30">
              {accountEmail}
            </Badge>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => expandWithMode('reply')}
            className="flex items-center gap-2 border rounded-full px-5 py-2 text-sm !text-muted-foreground hover:bg-accent/10 hover:!text-muted-foreground hover:shadow-sm transition-all bg-background"
          >
            <Reply className="h-4 w-4" />
            Trả lời
          </button>
          <button
            onClick={() => expandWithMode('reply-all')}
            className="flex items-center gap-2 border rounded-full px-5 py-2 text-sm !text-muted-foreground hover:bg-accent/10 hover:!text-muted-foreground hover:shadow-sm transition-all bg-background"
          >
            <ReplyAll className="h-4 w-4" />
            Trả lời tất cả
          </button>
          <button
            onClick={() => expandWithMode('forward')}
            className="flex items-center gap-2 border rounded-full px-5 py-2 text-sm !text-muted-foreground hover:bg-accent/10 hover:!text-muted-foreground hover:shadow-sm transition-all bg-background"
          >
            <Forward className="h-4 w-4" />
            Chuyển tiếp
          </button>
        </div>
      </div>
    );
  }

  const modeLabel = replyMode === 'forward' ? 'Chuyển tiếp' : replyMode === 'reply-all' ? 'Trả lời tất cả' : 'Trả lời';

  return (
    <div className={cn(
      "bg-card overflow-hidden flex flex-col",
      isMobileFullScreen ? "h-full" : "border rounded-2xl shadow-lg"
    )}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Header bar */}
      <div className={cn(
        "flex items-center gap-2 px-4 py-2 border-b shrink-0",
        isMobileFullScreen && "px-2 py-1.5"
      )}>
        {/* Mobile full-screen: × close button (like Gmail compose) */}
        {isMobileFullScreen && (
          <button
            className="h-9 w-9 flex items-center justify-center rounded-full text-foreground hover:bg-muted transition-colors"
            onClick={handleDiscard}
            title="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        <span className="text-xs font-medium text-foreground">{modeLabel}</span>
        {!isMobileFullScreen && accountEmail && (
          <Badge variant="outline" className="text-micro font-normal px-1.5 py-0.5 gap-1 bg-[#E0EBF5] text-primary border-primary/30">
            <Lock className="h-2.5 w-2.5" />
            {accountEmail}
          </Badge>
        )}
        <div className="flex-1" />

        {/* Mobile full-screen: attachment + send + more (like Gmail compose) */}
        {isMobileFullScreen ? (
          <div className="flex items-center gap-0.5">
            <button
              className="h-9 w-9 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
              onClick={() => fileInputRef.current?.click()}
              title="Đính kèm"
            >
              <Paperclip className="h-5 w-5" />
            </button>
            <button
              className={cn(
                "h-9 w-9 flex items-center justify-center rounded-full transition-colors",
                canSend ? "text-primary hover:bg-primary/10" : "text-muted-foreground/40"
              )}
              onClick={handleSend}
              disabled={!canSend}
              title="Gửi"
            >
              <Forward className="h-5 w-5" />
            </button>
            <button
              className="h-9 w-9 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
              title="Tùy chọn khác"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <>
            <button
              className="text-xs text-primary hover:text-primary/80 font-medium"
              onClick={() => setShowCc(!showCc)}
            >
              {showCc ? 'Ẩn CC' : 'CC'}
            </button>
            <button
              className="text-xs text-primary hover:text-primary/80 font-medium ml-1"
              onClick={() => setShowBcc(!showBcc)}
            >
              {showBcc ? 'Ẩn BCC' : 'BCC'}
            </button>
            <button
              className="ml-1 h-6 w-6 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={handleDiscard}
              title="Đóng"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Mode label with dropdown arrow (mobile full-screen) */}
      {isMobileFullScreen && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-b shrink-0">
          <Reply className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{modeLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}

      {/* From field (mobile full-screen only) */}
      {isMobileFullScreen && accountEmail && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b shrink-0">
          <span className="text-xs text-muted-foreground w-10 shrink-0">Từ</span>
          <span className="text-sm text-foreground truncate">{accountEmail}</span>
        </div>
      )}

      {/* To field - chip input */}
      <div className="flex items-start gap-2 px-4 py-1.5 border-b shrink-0">
        <span className="text-xs text-muted-foreground w-10 shrink-0 pt-1.5">Đến</span>
        <RecipientChipInput
          recipients={toRecipients}
          onChange={setToRecipients}
          placeholder={replyMode === 'forward' ? 'Nhập email người nhận chuyển tiếp' : 'Nhập email người nhận'}
          className="flex-1"
        />
      </div>

      {/* CC field */}
      {showCc && (
        <div className="flex items-start gap-2 px-4 py-1.5 border-b shrink-0">
          <span className="text-xs text-muted-foreground w-10 shrink-0 pt-1.5">CC</span>
          <RecipientChipInput
            recipients={ccRecipients}
            onChange={setCcRecipients}
            placeholder="cc@example.com"
            className="flex-1"
          />
        </div>
      )}

      {/* BCC field */}
      {showBcc && (
        <div className="flex items-start gap-2 px-4 py-1.5 border-b shrink-0">
          <span className="text-xs text-muted-foreground w-10 shrink-0 pt-1.5">BCC</span>
          <RecipientChipInput
            recipients={bccRecipients}
            onChange={setBccRecipients}
            placeholder="bcc@example.com"
            className="flex-1"
          />
        </div>
      )}

      {/* Subject field (mobile full-screen — for forward mode shows prefilled subject) */}
      {isMobileFullScreen && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b shrink-0">
          <span className="text-xs text-muted-foreground w-10 shrink-0">Chủ đề</span>
          <span className="text-sm text-foreground truncate">
            {replyMode === 'forward' ? `Fwd: ${lastMessage?.subject || ''}` : `Re: ${lastMessage?.subject || ''}`}
          </span>
        </div>
      )}

      {/* Body — Rich text editor */}
      <div className={cn(
        "px-4 py-3 bg-background focus-within:ring-2 focus-within:ring-primary/50 transition-shadow",
        isMobileFullScreen && "flex-1 overflow-auto"
      )}>
        <RichTextEditor
          editorRef={editorRef}
          placeholder={replyMode === 'forward' ? 'Thêm ghi chú chuyển tiếp...' : 'Nhập nội dung trả lời...'}
          autoFocus
          onHtmlChange={setBodyHtml}
          onTextChange={setBodyText}
        />
      </div>

      {/* Attachment list */}
      <AttachmentList attachments={attachments} onRemove={removeAttachment} />

      {/* Bottom toolbar — matches Gmail layout */}
      <div className="flex items-center gap-1 px-3 py-2 border-t bg-card">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  onClick={handleSend}
                  disabled={!canSend}
                  size="sm"
                  className={cn(
                    "rounded-full px-6 text-primary-foreground",
                    canSend
                      ? "bg-primary hover:bg-primary/90 cursor-pointer"
                      : "bg-muted-foreground/40 cursor-not-allowed opacity-60"
                  )}
                >
                  {isSending ? 'Đang gửi...' : 'Gửi'}
                </Button>
              </span>
            </TooltipTrigger>
            {disableReason && (
              <TooltipContent>{disableReason}</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {/* Formatting toolbar — all functional */}
        <div className="flex items-center gap-0.5 ml-2">
          <ToolbarIconBtn icon={Bold} title="In đậm" isActive={activeFormats.bold} onClick={() => { editorRef.current?.focus(); formatBold(); setTimeout(updateActiveFormats, 10); }} />
          <ToolbarIconBtn icon={Italic} title="In nghiêng" isActive={activeFormats.italic} onClick={() => { editorRef.current?.focus(); formatItalic(); setTimeout(updateActiveFormats, 10); }} />
          <ToolbarIconBtn icon={Underline} title="Gạch chân" isActive={activeFormats.underline} onClick={() => { editorRef.current?.focus(); formatUnderline(); setTimeout(updateActiveFormats, 10); }} />
          <div className="w-px h-5 bg-border mx-1" />
          <ToolbarIconBtn icon={Link} title="Chèn liên kết" onClick={() => { editorRef.current?.focus(); formatInsertLink(); }} />
          <div className="relative">
            <ToolbarIconBtn icon={Smile} title="Biểu tượng cảm xúc" onClick={() => setShowEmojiPicker(!showEmojiPicker)} />
            {showEmojiPicker && (
              <div className="absolute bottom-full left-0 mb-1 p-2 bg-popover border rounded-lg shadow-lg z-50 grid grid-cols-8 gap-1 w-[200px]">
                {EMOJI_LIST.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="text-lg hover:bg-muted rounded p-0.5 leading-none"
                    onClick={() => insertEmoji(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ToolbarIconBtn
            icon={Paperclip}
            title="Đính kèm file"
            onClick={() => fileInputRef.current?.click()}
          />
          <ToolbarIconBtn icon={List} title="Danh sách" isActive={activeFormats.insertUnorderedList} onClick={() => { editorRef.current?.focus(); formatUnorderedList(); setTimeout(updateActiveFormats, 10); }} />
        </div>

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive"
          onClick={handleDiscard}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Debug panel (E) — ?debugEmail=1 ── */}
      {showDebug && (
        <div className="px-3 py-2 border-t bg-amber-50 text-xs font-mono space-y-0.5 max-h-[120px] overflow-auto">
          <div className="font-bold text-amber-700">🐞 Debug Email</div>
          <div>threadId: {lastMessage?.thread_id ?? '(none)'}</div>
          <div>defaultTo: {defaultTo || '(empty)'} | defaultToName: {defaultToName || '(empty)'}</div>
          <div>toRecipients: [{toRecipients.map(r => `${r.email}(${r.valid ? '✓' : '✗'})`).join(', ')}]</div>
          <div>validRecipients: {validRecipients.length} | hasContent: {String(hasContent)} | hasInvalid: {String(hasInvalidRecipients)} | isSending: {String(isSending)}</div>
          <div className={canSend ? 'text-emerald-700' : 'text-rose-700'}>canSend: {String(canSend)} | reason: {disableReason ?? 'ready'}</div>
          <div>from_json: {JSON.stringify(lastMessage?.from_json?.map(f => f.email) ?? [])}</div>
        </div>
      )}
    </div>
  );
}

function ToolbarIconBtn({ icon: Icon, title, onClick, disabled, isActive }: { icon: React.ElementType; title: string; onClick?: () => void; disabled?: boolean; isActive?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "h-9 w-9 flex items-center justify-center rounded transition-colors",
        disabled
          ? "text-muted-foreground/40 cursor-not-allowed"
          : isActive
            ? "text-primary bg-primary/10 shadow-sm"
            : "text-foreground/70 hover:text-foreground hover:bg-accent hover:shadow-sm"
      )}
      title={title}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <Icon className="h-4.5 w-4.5" />
    </button>
  );
}
