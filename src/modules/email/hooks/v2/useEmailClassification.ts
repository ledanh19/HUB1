/**
 * useEmailClassification — React hook for AI thread classification.
 * ═══════════════════════════════════════════════════════════════
 * Orchestrates: classify → upsert suggestion → auto-apply (if eligible)
 *
 * Usage:
 *   const { suggestion, isScoring, scoreThread, applySuggestion, ignoreSuggestion } =
 *     useEmailClassification(thread);
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
    classifyThread,
    buildClassificationInput,
    AUTO_APPLY_THRESHOLDS,
    type AIClassificationResult,
} from '../../utils/classificationEngine';

// ─── Types ──────────────────────────────────────────────────

export interface AISuggestion {
    id: string;
    thread_id: string;
    suggested_tag: string;
    suggested_workflow_status: string | null;
    suggested_priority: string | null;
    confidence: number;
    reasons: string[];
    model: string;
    apply_status: 'SUGGESTED' | 'APPLIED' | 'IGNORED';
    scored_at: string;
    applied_at: string | null;
    applied_by: string | null;
}

interface UseEmailClassificationOptions {
    /** Thread to classify */
    thread: {
        id: string;
        tenant_id: string;
        subject: string | null;
        snippet?: string | null;
        primary_participant: string | null;
        tag: string;
        tag_source: string;
        manual_override?: boolean;
    } | null;
    /** Auto-score when thread changes */
    autoScore?: boolean;
    /** Latest inbound message for context */
    latestMessage?: {
        id?: string;
        sender?: string | null;
        body_text?: string | null;
        from_json?: unknown;
    } | null;
}

interface UseEmailClassificationReturn {
    /** Latest AI suggestion for the thread */
    suggestion: AISuggestion | null;
    /** Whether classification is in progress */
    isScoring: boolean;
    /** Whether suggestion is loading from DB */
    isLoading: boolean;
    /** Manually trigger scoring */
    scoreThread: () => void;
    /** Apply the current suggestion to the thread */
    applySuggestion: (force?: boolean) => void;
    /** Ignore the current suggestion */
    ignoreSuggestion: () => void;
    /** Whether auto-apply is eligible */
    canAutoApply: boolean;
    /** Classification result (before upsert) */
    classificationResult: AIClassificationResult | null;
}

// ─── Hook ───────────────────────────────────────────────────

export function useEmailClassification({
    thread,
    autoScore = true,
    latestMessage,
}: UseEmailClassificationOptions): UseEmailClassificationReturn {
    const queryClient = useQueryClient();
    const [classificationResult, setClassificationResult] = useState<AIClassificationResult | null>(null);
    const scoredThreadRef = useRef<string | null>(null);

    // ── Fetch existing suggestion from DB ────────────────────
    const { data: suggestion, isLoading } = useQuery({
        queryKey: ['ai-suggestion', thread?.id],
        queryFn: async () => {
            if (!thread?.id) return null;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any)
                .from('email_thread_ai_suggestions')
                .select('*')
                .eq('thread_id', thread.id)
                .order('scored_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) {
                console.warn('[useEmailClassification] Fetch error:', error);
                return null;
            }

            if (!data) return null;

            return {
                id: data.id,
                thread_id: data.thread_id,
                suggested_tag: data.suggested_tag,
                suggested_workflow_status: data.suggested_workflow_status,
                suggested_priority: data.suggested_priority,
                confidence: Number(data.confidence),
                reasons: data.reasons || [],
                model: data.model,
                apply_status: data.apply_status,
                scored_at: data.scored_at,
                applied_at: data.applied_at,
                applied_by: data.applied_by,
            } as AISuggestion;
        },
        enabled: !!thread?.id,
        staleTime: 120_000,
    });

    // ── Score Thread Mutation ─────────────────────────────────
    const scoreMutation = useMutation({
        mutationFn: async () => {
            if (!thread) throw new Error('No thread to score');

            const input = buildClassificationInput(thread, latestMessage);
            const result = await classifyThread(input, supabase);
            setClassificationResult(result);

            // Upsert suggestion to DB
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).rpc('email_upsert_ai_suggestion', {
                p_thread_id: thread.id,
                p_tenant_id: thread.tenant_id,
                p_last_message_id: latestMessage?.id || null,
                p_suggested_tag: result.tag,
                p_suggested_workflow_status: result.workflow_status,
                p_suggested_priority: result.priority,
                p_confidence: result.confidence,
                p_reasons: result.reasons,
                p_model: result.model,
                p_prompt_version: 'v1',
            });

            if (error) {
                console.warn('[useEmailClassification] Upsert error:', error);
                // Don't throw — suggestion was computed even if storage failed
            }

            return result;
        },
        onSuccess: (result) => {
            // Refetch suggestion from DB
            queryClient.invalidateQueries({ queryKey: ['ai-suggestion', thread?.id] });

            // Check auto-apply eligibility
            if (thread && canAutoApplyResult(thread, result)) {
                // Auto-apply silently
                applyMutation.mutate(false);
            }
        },
        onError: (err) => {
            console.error('[useEmailClassification] Score error:', err);
        },
    });

    // ── Apply Suggestion Mutation ────────────────────────────
    const applyMutation = useMutation({
        mutationFn: async (force: boolean = false) => {
            if (!thread) throw new Error('No thread');

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('email_apply_ai_suggestion', {
                p_thread_id: thread.id,
                p_user_id: null, // Will use auth.uid() on server
                p_force: force,
            });

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ai-suggestion', thread?.id] });
            queryClient.invalidateQueries({ queryKey: ['email-operational-threads'] });
            toast.success('Đã áp dụng phân loại AI');
        },
        onError: (err: Error) => {
            console.error('[useEmailClassification] Apply error:', err);
            toast.error(`Không thể áp dụng: ${err.message}`);
        },
    });

    // ── Ignore Suggestion Mutation ───────────────────────────
    const ignoreMutation = useMutation({
        mutationFn: async () => {
            if (!thread) throw new Error('No thread');

            const { data: { user } } = await supabase.auth.getUser();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).rpc('email_ignore_ai_suggestion', {
                p_thread_id: thread.id,
                p_user_id: user?.id || null,
            });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ai-suggestion', thread?.id] });
            toast.info('Đã bỏ qua gợi ý AI');
        },
        onError: (err: Error) => {
            console.error('[useEmailClassification] Ignore error:', err);
        },
    });

    // ── Auto-score on thread change ──────────────────────────
    useEffect(() => {
        if (!autoScore || !thread?.id) return;
        if (thread.manual_override && thread.tag_source === 'MANUAL') return;
        if (scoredThreadRef.current === thread.id) return; // Already scored this thread

        scoredThreadRef.current = thread.id;
        // Slight delay to not block initial render
        const timer = setTimeout(() => {
            scoreMutation.mutate();
        }, 500);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [thread?.id, autoScore]);

    // ── Computed: can auto-apply ─────────────────────────────
    const canAutoApply = thread ? canAutoApplyResult(
        thread,
        classificationResult || (suggestion ? {
            tag: suggestion.suggested_tag,
            confidence: suggestion.confidence,
        } as AIClassificationResult : null)
    ) : false;

    return {
        suggestion: suggestion ?? null,
        isScoring: scoreMutation.isPending,
        isLoading,
        scoreThread: () => {
            scoredThreadRef.current = null; // Reset to allow re-scoring
            scoreMutation.mutate();
        },
        applySuggestion: (force = false) => applyMutation.mutate(force),
        ignoreSuggestion: () => ignoreMutation.mutate(),
        canAutoApply,
        classificationResult,
    };
}


// ─── Helpers ────────────────────────────────────────────────

function canAutoApplyResult(
    thread: { tag: string; tag_source: string; manual_override?: boolean },
    result: AIClassificationResult | null,
): boolean {
    if (!result) return false;
    if (thread.manual_override) return false;
    if (thread.tag !== 'OTHER' && thread.tag !== 'INTERNAL_OTHER' && thread.tag_source === 'MANUAL') return false;

    // Only auto-apply if current tag is OTHER/INTERNAL_OTHER (unclassified)
    if (thread.tag !== 'OTHER' && thread.tag !== 'INTERNAL_OTHER') return false;

    // Never auto-apply if review_flag is true (low confidence)
    if (result.review_flag) return false;

    const threshold = AUTO_APPLY_THRESHOLDS[result.tag] ?? 0.80;
    return result.confidence >= threshold;
}
