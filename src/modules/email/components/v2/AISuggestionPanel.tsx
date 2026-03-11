/**
 * AISuggestionPanel — Shows AI classification suggestion in thread detail.
 * ═══════════════════════════════════════════════════════════════
 * Displays: suggested tag, confidence, reasons, apply/ignore actions.
 * Shown only when a pending suggestion exists.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Sparkles, Check, X, RefreshCw, ChevronDown, ChevronUp,
    ShieldAlert, AlertTriangle
} from 'lucide-react';
import type { AISuggestion } from '../../hooks/v2/useEmailClassification';
import type { EmailTagV2 } from '@/types/email-v2';

interface AISuggestionPanelProps {
    suggestion: AISuggestion | null;
    isScoring: boolean;
    onApply: (force?: boolean) => void;
    onIgnore: () => void;
    onRescore: () => void;
    /** Whether the thread has manual_override */
    hasManualOverride?: boolean;
}

/** Tag display labels */
const TAG_LABELS: Record<string, string> = {
    BOOKING_SYSTEM: 'Hệ thống OTA',
    GUEST_MESSAGE: 'Tin nhắn khách',
    DISPUTE_REFUND: 'Tranh chấp / Hoàn tiền',
    FINANCE_PAYOUT: 'Tài chính / Payout',
    ADS_SPAM: 'Quảng cáo / Spam',
    INTERNAL_OTHER: 'Nội bộ / Khác',
    // Legacy
    GUEST_REPLY: 'Khách trả lời',
    DISPUTE: 'Tranh chấp',
    FINANCE_ALERT: 'Tài chính',
    BOOKING_EXCEPTION: 'Booking Exception',
    VIP_PARTNER: 'Đối tác VIP',
    SILENT: 'Im lặng',
    OTHER: 'Khác',
};

/** Sensitive tags that need higher review */
const SENSITIVE_TAGS = ['DISPUTE_REFUND', 'FINANCE_PAYOUT', 'DISPUTE', 'FINANCE_ALERT'];

function getConfidenceColor(confidence: number): string {
    if (confidence >= 0.92) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (confidence >= 0.85) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (confidence >= 0.70) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-rose-600 bg-rose-50 border-rose-200';
}

function getConfidenceLabel(confidence: number): string {
    if (confidence >= 0.92) return 'Rất cao';
    if (confidence >= 0.85) return 'Cao';
    if (confidence >= 0.70) return 'Trung bình';
    return 'Thấp';
}

export function AISuggestionPanel({
    suggestion,
    isScoring,
    onApply,
    onIgnore,
    onRescore,
    hasManualOverride = false,
}: AISuggestionPanelProps) {
    const [expanded, setExpanded] = React.useState(false);

    // Loading state
    if (isScoring) {
        return (
            <div className="border border-primary/20 rounded-lg p-3 bg-primary/5 animate-pulse">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary animate-spin" />
                    <span className="text-xs font-medium text-primary">Đang phân loại bằng AI...</span>
                </div>
            </div>
        );
    }

    // No suggestion or already applied/ignored
    if (!suggestion || suggestion.apply_status !== 'SUGGESTED') {
        if (suggestion?.apply_status === 'APPLIED') {
            return (
                <div className="border border-emerald-200 rounded-lg p-2.5 bg-emerald-50/50">
                    <div className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-[11px] text-emerald-600">
                            AI đã phân loại: <strong>{TAG_LABELS[suggestion.suggested_tag] || suggestion.suggested_tag}</strong>
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                            onClick={onRescore}
                        >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Chạy lại
                        </Button>
                    </div>
                </div>
            );
        }
        return null;
    }

    const isSensitive = SENSITIVE_TAGS.includes(suggestion.suggested_tag);
    const confidenceColor = getConfidenceColor(suggestion.confidence);
    const confidenceLabel = getConfidenceLabel(suggestion.confidence);

    return (
        <div className={cn(
            "border rounded-lg overflow-hidden transition-all duration-200",
            isSensitive
                ? "border-amber-300 bg-amber-50/30"
                : "border-primary/20 bg-primary/5"
        )}>
            {/* Header */}
            <div className="px-3 py-2.5 flex items-center gap-2">
                <Sparkles className={cn(
                    "w-4 h-4 shrink-0",
                    isSensitive ? "text-amber-500" : "text-primary"
                )} />

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-foreground">
                            AI gợi ý:
                        </span>
                        <Badge
                            variant="outline"
                            className={cn("text-[10px] px-1.5 py-0 h-[18px]", confidenceColor)}
                        >
                            {TAG_LABELS[suggestion.suggested_tag] || suggestion.suggested_tag}
                        </Badge>
                        <span className={cn(
                            "text-[10px] font-medium px-1.5 py-0 rounded-full border",
                            confidenceColor
                        )}>
                            {(suggestion.confidence * 100).toFixed(0)}% — {confidenceLabel}
                        </span>
                    </div>

                    {/* Sensitive warning */}
                    {isSensitive && (
                        <div className="flex items-center gap-1 mt-1">
                            <ShieldAlert className="w-3 h-3 text-amber-500" />
                            <span className="text-[10px] text-amber-600 font-medium">
                                Thể loại nhạy cảm — cần review trước khi áp dụng
                            </span>
                        </div>
                    )}
                </div>

                {/* Expand toggle */}
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="shrink-0 p-1 rounded hover:bg-black/5 transition-colors"
                >
                    {expanded
                        ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                        : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    }
                </button>
            </div>

            {/* Expanded: Reasons + Actions */}
            {expanded && (
                <div className="px-3 pb-3 space-y-2 border-t border-border/20 pt-2">
                    {/* Reasons */}
                    {suggestion.reasons && suggestion.reasons.length > 0 && (
                        <div className="space-y-1">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                Lý do
                            </span>
                            <ul className="space-y-0.5">
                                {suggestion.reasons.map((reason, i) => (
                                    <li key={i} className="text-[11px] text-foreground/70 flex items-start gap-1.5">
                                        <span className="text-primary/50 mt-0.5">•</span>
                                        {reason}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Model info */}
                    <div className="text-[10px] text-muted-foreground/60">
                        Model: {suggestion.model} | Scored: {new Date(suggestion.scored_at).toLocaleTimeString('vi-VN')}
                    </div>

                    {/* Manual override warning */}
                    {hasManualOverride && (
                        <div className="flex items-center gap-1 px-2 py-1 rounded bg-amber-100/50 border border-amber-200">
                            <AlertTriangle className="w-3 h-3 text-amber-500" />
                            <span className="text-[10px] text-amber-600">
                                Thread đã có manual override. Cần bấm "Bắt buộc áp dụng".
                            </span>
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 pt-1">
                        <Button
                            size="sm"
                            className={cn(
                                "h-7 text-[11px] gap-1",
                                isSensitive
                                    ? "bg-amber-500 hover:bg-amber-600 text-white"
                                    : ""
                            )}
                            onClick={() => onApply(false)}
                        >
                            <Check className="w-3 h-3" />
                            Áp dụng
                        </Button>

                        {hasManualOverride && (
                            <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 text-[11px] gap-1"
                                onClick={() => onApply(true)}
                            >
                                Bắt buộc áp dụng
                            </Button>
                        )}

                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] gap-1"
                            onClick={onIgnore}
                        >
                            <X className="w-3 h-3" />
                            Bỏ qua
                        </Button>

                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px] gap-1 ml-auto text-muted-foreground"
                            onClick={onRescore}
                        >
                            <RefreshCw className="w-3 h-3" />
                            Chạy lại
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
