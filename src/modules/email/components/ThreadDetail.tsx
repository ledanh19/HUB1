import React, { useMemo, useState, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { ArrowLeft, Paperclip, ChevronDown, ChevronUp, Info, Archive, Trash2, MailOpen, MoreVertical, Star, Reply, ReplyAll, Forward, Smile } from 'lucide-react';
import { MessageAttachments } from './MessageAttachments';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import type { EmailThread, EmailMessage } from '@/types/email';
import { getSenderDisplayName } from '../utils/rfc2047';

// Gmail-style avatar colors (same as ThreadListItem)
const AVATAR_COLORS = [
  'bg-red-500', 'bg-pink-500', 'bg-purple-500', 'bg-indigo-500',
  'bg-blue-500', 'bg-cyan-500', 'bg-teal-500', 'bg-green-500',
  'bg-lime-600', 'bg-amber-500', 'bg-orange-500', 'bg-rose-500',
];
function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface ThreadDetailProps {
  thread: EmailThread | undefined;
  messages: EmailMessage[];
  isLoading: boolean;
  onBack: () => void;
  children?: React.ReactNode; // Reply composer slot (desktop only)
  onMobileReply?: (mode: 'reply' | 'reply-all' | 'forward') => void; // Mobile: opens full-screen compose
}

export function ThreadDetail({ thread, messages, isLoading, onBack, children, onMobileReply }: ThreadDetailProps) {
  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Chọn một cuộc hội thoại để xem chi tiết</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full min-h-0">

        {/* ═══ MOBILE HEADER (<sm) — Gmail-style: back + action icons ═══ */}
        <div className="sm:hidden flex items-center justify-between px-2 py-1.5 border-b bg-card shrink-0 sticky top-0 z-10" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.375rem)' }}>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 rounded-full text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground">
              <Archive className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground">
              <Trash2 className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground">
              <MailOpen className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* ═══ DESKTOP HEADER (sm+) — original ═══ */}
        <div className="hidden sm:flex flex-col gap-1 px-4 py-2 border-b sticky top-0 z-10 bg-card shrink-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 h-7 w-7 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <h2 className="text-base font-semibold truncate flex-1 min-w-0 pr-2">{thread.subject || '(Không có tiêu đề)'}</h2>
              </TooltipTrigger>
              {thread.subject && thread.subject.length > 50 && (
                <TooltipContent side="bottom" align="start" className="max-w-lg">
                  {thread.subject}
                </TooltipContent>
              )}
            </Tooltip>
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1 overflow-hidden">
                {thread.participants?.slice(0, 5).map((p, i) => (
                  <Badge key={i} variant="outline" className="text-[11px] px-2 py-0 h-5 rounded-full shrink-0 whitespace-nowrap bg-[#E0EBF5] text-primary border-primary/30 font-medium">
                    {p.name || p.email}
                  </Badge>
                ))}
                {(thread.participants?.length ?? 0) > 5 && (
                  <span className="text-[11px] text-muted-foreground shrink-0 font-medium">+{(thread.participants?.length ?? 0) - 5}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 bg-[#F9FAFB] dark:bg-background">
          {/* ═══ MOBILE: Subject + label row (inside scroll area) ═══ */}
          <div className="sm:hidden px-4 pt-4 pb-2">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-xl font-normal text-foreground leading-snug flex-1 min-w-0">
                {thread.subject || '(Không có tiêu đề)'}
              </h2>
              <Star className="h-5 w-5 text-muted-foreground/40 shrink-0 mt-1" />
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded bg-muted/50 text-muted-foreground border-border/50 font-normal">
                Hộp thư đến
              </Badge>
            </div>
          </div>

          <div className="max-w-[980px] mx-auto py-2 sm:py-6 px-2 sm:px-4 space-y-2">
            {messages.map((msg, index) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isLast={index === messages.length - 1}
              />
            ))}
          </div>
        </ScrollArea>

        {/* ═══ MOBILE: Sticky bottom reply bar — Gmail-style ═══ */}
        {onMobileReply && (
          <div className="sm:hidden border-t bg-card shrink-0 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
              <button
                onClick={() => onMobileReply('reply')}
                className="flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-muted-foreground active:bg-muted/50 transition-colors"
              >
                <Reply className="h-5 w-5" />
                <span className="text-[11px] font-medium">Trả lời</span>
              </button>
              <button
                onClick={() => onMobileReply('reply-all')}
                className="flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-muted-foreground active:bg-muted/50 transition-colors"
              >
                <ReplyAll className="h-5 w-5" />
                <span className="text-[11px] font-medium">Trả lời tất cả</span>
              </button>
              <button
                onClick={() => onMobileReply('forward')}
                className="flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-muted-foreground active:bg-muted/50 transition-colors"
              >
                <Forward className="h-5 w-5" />
                <span className="text-[11px] font-medium">Chuyển tiếp</span>
              </button>
              <button
                className="w-10 flex flex-col items-center gap-1 py-2 rounded-lg text-muted-foreground active:bg-muted/50 transition-colors"
              >
                <Smile className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* Reply composer slot — desktop only */}
        {children && (
          <div className="hidden sm:block border-t bg-card shrink-0 shadow-[0_-4px_16px_rgba(0,0,0,0.02)]">
            <div className="max-w-[980px] mx-auto p-2 sm:p-4">
              {children}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function MessageBubble({ message, isLast }: { message: EmailMessage, isLast: boolean }) {
  const isOutbound = message.direction === 'OUTBOUND';
  const from = message.from_json?.[0];
  const [showHeaders, setShowHeaders] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(!isLast);
  const [showRecipients, setShowRecipients] = useState(false);

  const senderName = useMemo(() => {
    return getSenderDisplayName(from?.name, from?.email);
  }, [from]);

  const dateStr = message.date
    ? format(new Date(message.date), 'dd MMM yyyy, HH:mm', { locale: vi })
    : '';

  const mobileDateStr = message.date
    ? format(new Date(message.date), 'dd/MM, HH:mm', { locale: vi })
    : '';

  const avatarBg = useMemo(() => getAvatarColor(senderName), [senderName]);

  // Build iframe srcDoc for HTML emails
  const iframeSrcDoc = useMemo(() => {
    if (!message.body_html_sanitized) return null;
    return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<style>
body { margin: 0; padding: 12px; font-family: "Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", Arial, sans-serif !important; font-size: 14px; line-height: 1.5; color: #1f2937; word-wrap: break-word; text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased; }
body * { font-family: inherit !important; }
p, span, div, table, td, th, li, a, strong, em, b, i { font-family: inherit !important; }
img { max-width: 100%; height: auto; }
table { max-width: 100%; }
* { box-sizing: border-box; }
a { color: #1a73e8; }
blockquote { margin: 8px 0; padding-left: 12px; border-left: 3px solid #dadce0; color: #5f6368; }
@media (prefers-color-scheme: dark) {
  body { background: #1a1a1a; color: #e0e0e0; }
  a { color: #8ab4f8; }
  blockquote { border-left-color: #444; color: #aaa; }
  table, td, th { border-color: #444 !important; }
}
</style>
</head><body>${message.body_html_sanitized}</body></html>`;
  }, [message.body_html_sanitized]);

  const handleIframeLoad = useCallback((e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const iframe = e.currentTarget;
    try {
      const body = iframe.contentDocument?.body;
      if (body) {
        iframe.style.height = `${body.scrollHeight + 24}px`;
      }
    } catch {
      // Cross-origin safety
    }
  }, []);

  const recipientSummary = useMemo(() => {
    const toNames = message.to_json?.map((p) => p.name || p.email?.split('@')[0] || '').filter(Boolean) ?? [];
    if (toNames.length === 0) return '';
    if (toNames.length === 1) return `đến ${toNames[0]}`;
    return `đến ${toNames[0]} và ${toNames.length - 1} người khác`;
  }, [message.to_json]);

  return (
    <div className={`overflow-hidden transition-all bg-card ${isCollapsed ? 'cursor-pointer' : ''}`}>

      {/* ═══ MOBILE message header (<sm) — Gmail-style ═══ */}
      <div
        className={`sm:hidden px-4 flex items-start gap-3 transition-colors ${isCollapsed ? 'py-3' : 'py-3'}`}
        onClick={() => {
          if (isCollapsed) setIsCollapsed(false);
          else if (!isLast) setIsCollapsed(true);
        }}
      >
        {/* Gmail colored avatar */}
        <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white text-base font-medium shrink-0 mt-0.5 ${avatarBg}`}>
          {senderName[0]?.toUpperCase() ?? '?'}
        </div>

        <div className="flex-1 min-w-0">
          {/* Sender + time */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-semibold truncate text-foreground">{senderName}</span>
              {isOutbound && (
                <Badge variant="secondary" className="text-micro shrink-0 font-medium">Đã gửi</Badge>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-muted-foreground">{mobileDateStr}</span>
              {message.has_attachments && <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />}
              {!isCollapsed && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full text-muted-foreground"
                  onClick={(e) => { e.stopPropagation(); setShowHeaders(!showHeaders); }}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* "đến tôi ▾" — Gmail-style collapsible recipients */}
          {!isCollapsed ? (
            <button
              className="flex items-center gap-0.5 text-xs text-muted-foreground mt-0.5"
              onClick={(e) => { e.stopPropagation(); setShowRecipients(!showRecipients); }}
            >
              <span className="truncate max-w-[200px]">{recipientSummary || 'đến tôi'}</span>
              <ChevronDown className="h-3 w-3 shrink-0" />
            </button>
          ) : (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {message.body_plain ? message.body_plain.substring(0, 80) + '...' : 'Không có nội dung'}
            </p>
          )}
        </div>
      </div>

      {/* Mobile recipient details dropdown */}
      {!isCollapsed && showRecipients && (
        <div className="sm:hidden mx-4 mb-2 p-3 bg-muted/20 rounded-lg text-xs space-y-1.5 text-muted-foreground">
          {from?.email && (
            <div><span className="text-muted-foreground/70">Từ:</span> <span className="text-foreground">{from.name || from.email} &lt;{from.email}&gt;</span></div>
          )}
          {message.to_json?.length > 0 && (
            <div><span className="text-muted-foreground/70">Tới:</span> <span className="text-foreground">{message.to_json.map((p) => p.name ? `${p.name} <${p.email}>` : p.email).join(', ')}</span></div>
          )}
          {message.cc_json?.length > 0 && (
            <div><span className="text-muted-foreground/70">CC:</span> <span className="text-foreground">{message.cc_json.map((p) => p.email).join(', ')}</span></div>
          )}
          {message.date && (
            <div><span className="text-muted-foreground/70">Ngày:</span> <span className="text-foreground">{dateStr}</span></div>
          )}
        </div>
      )}

      {/* ═══ DESKTOP message header (sm+) — original style ═══ */}
      <div
        className={`hidden sm:flex px-5 justify-between items-center transition-colors ${isCollapsed ? 'py-2.5 bg-background hover:border-primary/20 hover:shadow-md' : 'py-4 bg-muted/20 border-b border-border/40'}`}
        onClick={() => {
          if (isCollapsed) setIsCollapsed(false);
          else if (!isLast) setIsCollapsed(true);
        }}
      >
        <div className="flex items-center gap-3 min-w-0 pr-4">
          <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
            {senderName[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0 flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold truncate text-foreground">{senderName}</span>
              {isOutbound && (
                <Badge variant="secondary" className="text-micro shrink-0 font-medium">Đã gửi</Badge>
              )}
            </div>
            {!isCollapsed && from?.email && (
              <span className="text-xs text-muted-foreground truncate">
                &lt;{from.email}&gt;
              </span>
            )}
            {isCollapsed && (
              <span className="text-xs text-muted-foreground truncate">
                {message.body_plain ? message.body_plain.substring(0, 60) + '...' : 'Không có nội dung'}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          {message.has_attachments && <Paperclip className="h-3.5 w-3.5" />}
          <span className="font-medium">{dateStr}</span>
          {!isCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-muted-foreground hover:bg-muted"
              onClick={(e) => { e.stopPropagation(); setShowHeaders(!showHeaders); }}
              title="Chi tiết header"
            >
              {showHeaders ? <ChevronUp className="h-4 w-4" /> : <Info className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* ═══ Expanded content (shared mobile+desktop) ═══ */}
      {!isCollapsed && (
        <div className="px-3 pb-3 pt-2 sm:p-5">
          {/* Header Details table — desktop only on mobile we use the dropdown above */}
          {showHeaders && (
            <div className="mb-4 p-4 bg-muted/10 border rounded-lg text-xs space-y-0 text-muted-foreground overflow-x-auto hidden sm:block">
              <table className="w-full">
                <tbody>
                  {from?.email && (
                    <tr>
                      <td className="text-right pr-4 py-1.5 whitespace-nowrap align-top w-[120px]">Từ:</td>
                      <td className="py-1.5 text-foreground"><span className="font-semibold">{from.name || from.email}</span> {from.name && <span className="opacity-70">&lt;{from.email}&gt;</span>}</td>
                    </tr>
                  )}
                  {message.headers?.['Reply-To'] && (
                    <tr>
                      <td className="text-right pr-4 py-1.5 whitespace-nowrap align-top">Trả lời:</td>
                      <td className="py-1.5 text-foreground">{message.headers['Reply-To']}</td>
                    </tr>
                  )}
                  {message.to_json?.length > 0 && (
                    <tr>
                      <td className="text-right pr-4 py-1.5 whitespace-nowrap align-top">Tới:</td>
                      <td className="py-1.5 text-foreground">{message.to_json.map((p) => p.name ? `${p.name} <${p.email}>` : p.email).join(', ')}</td>
                    </tr>
                  )}
                  {message.cc_json?.length > 0 && (
                    <tr>
                      <td className="text-right pr-4 py-1.5 whitespace-nowrap align-top">CC:</td>
                      <td className="py-1.5 text-foreground">{message.cc_json.map((p) => p.name ? `${p.name} <${p.email}>` : p.email).join(', ')}</td>
                    </tr>
                  )}
                  {message.headers?.['Date'] && (
                    <tr>
                      <td className="text-right pr-4 py-1.5 whitespace-nowrap align-top">Ngày:</td>
                      <td className="py-1.5 text-foreground">{message.headers['Date']}</td>
                    </tr>
                  )}
                  {message.subject && (
                    <tr>
                      <td className="text-right pr-4 py-1.5 whitespace-nowrap align-top">Tiêu đề:</td>
                      <td className="py-1.5 text-foreground font-medium">{message.subject}</td>
                    </tr>
                  )}
                  {message.headers?.['Message-ID'] && (
                    <tr>
                      <td className="text-right pr-4 py-1.5 whitespace-nowrap align-top">Message-ID:</td>
                      <td className="py-1.5 text-[10px] break-all opacity-70">{message.headers['Message-ID']}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* To / CC — desktop only (mobile uses dropdown above) */}
          <div className="hidden sm:block text-sm mb-4">
            {message.to_json?.length > 0 && (
              <span className="text-muted-foreground">Tới: <span className="text-foreground">{message.to_json.map((p) => p.name || p.email).join(', ')}</span></span>
            )}
            {message.cc_json?.length > 0 && (
              <span className="ml-3 text-muted-foreground">CC: <span className="text-foreground">{message.cc_json.map((p) => p.email).join(', ')}</span></span>
            )}
          </div>

          {/* Body */}
          <div className="w-full overflow-x-auto rounded">
            {iframeSrcDoc ? (
              <iframe
                srcDoc={iframeSrcDoc}
                onLoad={handleIframeLoad}
                className="w-full border-0 min-w-full min-h-[100px]"
                style={{ height: '300px' }}
                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                title="Email content"
              />
            ) : message.body_plain ? (
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">{message.body_plain}</pre>
            ) : (
              <p className="text-muted-foreground italic text-sm">Đang tải nội dung...</p>
            )}
          </div>

          {/* Attachments */}
          {message.has_attachments && message.attachments_json?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/40">
              <MessageAttachments
                attachments={message.attachments_json}
                messageProviderMessageId={message.provider_message_id}
                emailAccountId={message.email_account_id}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
