import React from 'react';
import { cn } from '@/lib/utils';
import {
    AlertCircle, MessageCircle, CreditCard,
    Inbox, FolderOpen, Building2,
    Sparkles, ShieldAlert, Megaphone
} from 'lucide-react';
import type { OperationalFolder } from '../../hooks/v2/useOperationalThreads';

interface FolderItem {
    id: OperationalFolder;
    label: string;
    icon: React.ElementType;
    activeColor: string;
    iconColor: string;
    /** Tag key for per‑tag count lookup. null = special (ACTION_REQUIRED, ALL) */
    tagKey: string | null;
}

/**
 * ONE unified folder list — no legacy group.
 * Legacy tags are mapped to these folders in the query layer.
 */
const folders: FolderItem[] = [
    { id: 'ACTION_REQUIRED', label: 'Cần xử lý', icon: AlertCircle, activeColor: 'bg-rose-50 border-rose-200 text-rose-700', iconColor: 'text-rose-500', tagKey: null },
    { id: 'BOOKING_SYSTEM', label: 'Hệ thống OTA', icon: Building2, activeColor: 'bg-teal-50 border-teal-200 text-teal-700', iconColor: 'text-teal-500', tagKey: 'BOOKING_SYSTEM' },
    { id: 'GUEST_MESSAGE', label: 'Tin nhắn khách', icon: MessageCircle, activeColor: 'bg-blue-50 border-blue-200 text-blue-700', iconColor: 'text-blue-500', tagKey: 'GUEST_MESSAGE' },
    { id: 'DISPUTE_REFUND', label: 'Tranh chấp', icon: ShieldAlert, activeColor: 'bg-amber-50 border-amber-200 text-amber-700', iconColor: 'text-amber-500', tagKey: 'DISPUTE_REFUND' },
    { id: 'FINANCE_PAYOUT', label: 'Tài chính', icon: CreditCard, activeColor: 'bg-purple-50 border-purple-200 text-purple-700', iconColor: 'text-purple-500', tagKey: 'FINANCE_PAYOUT' },
    { id: 'ADS_SPAM', label: 'QC/Spam', icon: Megaphone, activeColor: 'bg-slate-50 border-slate-200 text-slate-600', iconColor: 'text-slate-400', tagKey: 'ADS_SPAM' },
    { id: 'AI_NEEDS_REVIEW', label: 'AI Cần review', icon: Sparkles, activeColor: 'bg-violet-50 border-violet-200 text-violet-700', iconColor: 'text-violet-500', tagKey: null },
    { id: 'ALL', label: 'Tất cả', icon: Inbox, activeColor: 'bg-primary/5 border-primary/20 text-primary', iconColor: 'text-primary/70', tagKey: null },
];

interface SmartFolderSidebarV2Props {
    currentFolder: OperationalFolder;
    onSelectFolder: (folder: OperationalFolder) => void;
    analytics?: {
        actionRequiredCount?: number;
        perTag?: Record<string, number>;
    };
}

export function SmartFolderSidebarV2({ currentFolder, onSelectFolder, analytics }: SmartFolderSidebarV2Props) {
    const perTag = analytics?.perTag ?? {};

    return (
        <div className="w-48 shrink-0 border-r border-border/30 bg-white flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-3 pt-3 pb-1.5 shrink-0">
                <div className="flex items-center gap-1.5">
                    <FolderOpen className="h-3.5 w-3.5 text-primary/50" />
                    <h2 className="text-[11px] font-semibold text-muted-foreground/70 tracking-widest uppercase">Thư mục</h2>
                </div>
            </div>

            {/* Folder list — single unified set */}
            <nav className="flex-1 px-1.5 space-y-0.5 overflow-y-auto pb-2">
                {folders.map((folder) => {
                    const isActive = currentFolder === folder.id;
                    const Icon = folder.icon;

                    let count: number | undefined;
                    if (folder.id === 'ACTION_REQUIRED') {
                        count = analytics?.actionRequiredCount;
                    } else if (folder.tagKey) {
                        count = perTag[folder.tagKey];
                    }

                    return (
                        <button
                            key={folder.id}
                            className={cn(
                                "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] font-medium",
                                "transition-all duration-150 border border-transparent",
                                isActive
                                    ? cn("shadow-sm", folder.activeColor)
                                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                            )}
                            onClick={() => onSelectFolder(folder.id)}
                        >
                            <Icon className={cn(
                                "h-3.5 w-3.5 shrink-0",
                                isActive ? '' : folder.iconColor
                            )} />
                            <span className="truncate">{folder.label}</span>
                            {count != null && count > 0 && (
                                <span className={cn(
                                    "ml-auto text-[10px] font-bold min-w-[18px] text-center px-1 py-0 rounded-full leading-relaxed",
                                    folder.id === 'ACTION_REQUIRED'
                                        ? "bg-rose-500 text-white"
                                        : "bg-muted text-muted-foreground"
                                )}>
                                    {count > 999 ? '999+' : count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}
