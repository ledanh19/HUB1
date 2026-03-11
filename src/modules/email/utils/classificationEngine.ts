/**
 * Email Classification Engine — Rules + Heuristics + AI Fallback
 * ═══════════════════════════════════════════════════════════════
 * Thread-first scoring pipeline:
 *   STEP 1: Rules Engine (pattern matching on sender/subject/snippet)
 *   STEP 2: Heuristics (behavioral patterns)
 *   STEP 3: AI Fallback (Edge Function call, only if confidence < 0.80)
 *
 * Architecture:
 *   - Deterministic rules → instant, no API calls
 *   - Confidence-gated AI → only used when needed
 *   - Idempotent caching by (thread_id, last_message_id)
 *   - manual_override guard → never overwrite human decisions
 */

// ─── Types ──────────────────────────────────────────────────

export type AIClassificationTag =
    | 'BOOKING_SYSTEM'
    | 'GUEST_MESSAGE'
    | 'DISPUTE_REFUND'
    | 'FINANCE_PAYOUT'
    | 'ADS_SPAM'
    | 'INTERNAL_OTHER'
    // Legacy compatible
    | 'GUEST_REPLY'
    | 'DISPUTE'
    | 'FINANCE_ALERT'
    | 'BOOKING_EXCEPTION'
    | 'VIP_PARTNER'
    | 'SILENT'
    | 'OTHER';

export type AIWorkflowStatus =
    | 'OPEN'
    | 'ACTION_REQUIRED'
    | 'WAITING_GUEST'
    | 'INTERNAL_PENDING'
    | 'DONE';

export type AIPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type AIClassificationModel =
    | 'rules_v1'
    | 'heuristics_v1'
    | 'gemini-2.0-flash';

export interface AIClassificationResult {
    tag: AIClassificationTag;
    workflow_status: AIWorkflowStatus;
    priority: AIPriority;
    confidence: number;
    reasons: string[];
    model: AIClassificationModel;
    /** true if confidence < 0.70 — needs human review */
    review_flag?: boolean;
}

export interface ThreadClassificationInput {
    thread_id: string;
    tenant_id: string;
    subject: string | null;
    snippet: string | null;
    primary_participant: string | null;
    sender_email: string | null;
    sender_domain: string | null;
    participants_domains: string[];
    last_message_preview: string | null;
    current_tag: string;
    tag_source: string;
    manual_override: boolean;
}

// ─── Auto-Apply Thresholds ──────────────────────────────────

export const AUTO_APPLY_THRESHOLDS: Record<string, number> = {
    BOOKING_SYSTEM: 0.85,
    GUEST_MESSAGE: 0.85,
    FINANCE_PAYOUT: 0.90,
    DISPUTE_REFUND: 0.92,
    ADS_SPAM: 0.85,
    INTERNAL_OTHER: 0.80,
    // Legacy
    GUEST_REPLY: 0.85,
    DISPUTE: 0.92,
    FINANCE_ALERT: 0.90,
    BOOKING_EXCEPTION: 0.85,
    SILENT: 0.85,
    OTHER: 0.80,
};


// ═══════════════════════════════════════════════════════════
// STEP 1 — RULES ENGINE (PRIORITY 1)
// ═══════════════════════════════════════════════════════════

/** OTA sender domain allowlist */
const OTA_DOMAINS = [
    'booking.com', 'expedia.com', 'agoda.com', 'airbnb.com',
    'trip.com', 'hotels.com', 'vrbo.com', 'tripadvisor.com',
    'traveloka.com', 'fliggy.com', 'ctrip.com', 'tiket.com',
    'expediagroup.com',
    // Sub-domains (match suffix)
];

/** OTA subject keywords */
const OTA_SUBJECT_KEYWORDS = [
    'reservation', 'itinerary', 'booking id', 'booking_id',
    'modified', 'cancelled', 'cancellation', 'no-show', 'noshow', 'no show',
    'confirmation', 'check-in', 'check-out', 'guest message',
    'new reservation', 'booking confirmation',
    'special request', 'yêu cầu đặc biệt',
    'message from', 'tin nhắn từ', 'tin nhắn mới từ',
    'arrival notification', 'vip guest',
];

/** Finance keywords (subject + snippet) */
const FINANCE_KEYWORDS = [
    'payout', 'remittance', 'transfer advice', 'statement',
    'invoice', 'deduction', 'commission report', 'commission',
    'payment advice', 'bank transfer', 'settlement',
];

/** Dispute keywords */
const DISPUTE_KEYWORDS = [
    'chargeback', 'fraud', 'dispute', 'refund request',
    'complaint', 'claim', 'resolution center',
    'dispute resolution', 'refund',
];

/** Ads/Spam keywords */
const ADS_KEYWORDS = [
    'unsubscribe', 'hủy đăng ký', 'marketing', 'promotion', 'partnership offer',
    'special offer', 'limited time', 'click here', 'opt out', 'opt-out',
    'newsletter', 'sponsored', 'advertisement', 'webinar',
    'dynamic rates+', 'unlock higher revenue', 'price drops',
    'selected for you', 'tăng số lượng đơn đặt phòng',
    'tăng lượng đặt phòng', 'tăng sức hút',
    'thu hút thêm du khách', 'bỏ lỡ các lượt đặt phòng',
    'price alert', 'price parity', 'align your rates',
];

/**
 * Extract domain from email address.
 * e.g., "noreply@booking.com" → "booking.com"
 */
export function extractDomain(email: string | null): string | null {
    if (!email) return null;
    const match = email.match(/@([^@\s>]+)/);
    return match ? match[1].toLowerCase() : null;
}

/**
 * Check if email domain matches any OTA domain (suffix match).
 */
function isOTADomain(domain: string | null): boolean {
    if (!domain) return false;
    return OTA_DOMAINS.some(ota => domain === ota || domain.endsWith('.' + ota));
}

/**
 * Check if text contains any keyword from list (case-insensitive).
 */
function containsAny(text: string | null, keywords: string[]): string[] {
    if (!text) return [];
    const lower = text.toLowerCase();
    return keywords.filter(kw => lower.includes(kw.toLowerCase()));
}

/**
 * Public email domains → likely guest
 */
const PUBLIC_EMAIL_DOMAINS = [
    'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
    'live.com', 'icloud.com', 'me.com', 'aol.com',
    'mail.com', 'protonmail.com', 'zoho.com',
];

function isPublicEmailDomain(domain: string | null): boolean {
    if (!domain) return false;
    return PUBLIC_EMAIL_DOMAINS.includes(domain.toLowerCase());
}

/**
 * STEP 1: Rules Engine — deterministic pattern matching.
 * Returns null if no rule matches with sufficient confidence.
 */
export function classifyByRules(input: ThreadClassificationInput): AIClassificationResult | null {
    const combinedText = [input.subject, input.snippet, input.last_message_preview]
        .filter(Boolean)
        .join(' ');

    // ── Rule 1: OTA System (BOOKING_SYSTEM) ─────────────────
    if (isOTADomain(input.sender_domain)) {
        const subjectMatches = containsAny(input.subject, OTA_SUBJECT_KEYWORDS);
        const confidence = subjectMatches.length > 0 ? 0.97 : 0.95;

        return {
            tag: 'BOOKING_SYSTEM',
            workflow_status: 'OPEN',
            priority: subjectMatches.some(kw =>
                ['cancelled', 'no-show', 'noshow', 'no show', 'modified'].includes(kw)
            ) ? 'HIGH' : 'MEDIUM',
            confidence,
            reasons: [
                `Sender domain "${input.sender_domain}" matches OTA allowlist`,
                ...subjectMatches.map(kw => `Subject contains "${kw}"`),
            ],
            model: 'rules_v1',
        };
    }

    // Also check if any participant domain is OTA
    const otaParticipant = input.participants_domains.find(d => isOTADomain(d));
    if (otaParticipant) {
        const subjectMatches = containsAny(input.subject, OTA_SUBJECT_KEYWORDS);
        if (subjectMatches.length > 0) {
            return {
                tag: 'BOOKING_SYSTEM',
                workflow_status: 'OPEN',
                priority: 'MEDIUM',
                confidence: 0.92,
                reasons: [
                    `Participant domain "${otaParticipant}" matches OTA allowlist`,
                    ...subjectMatches.map(kw => `Subject contains "${kw}"`),
                ],
                model: 'rules_v1',
            };
        }
    }

    // Check OTA keywords in subject even without OTA domain
    const otaSubjectHits = containsAny(input.subject, OTA_SUBJECT_KEYWORDS);
    if (otaSubjectHits.length >= 2) {
        return {
            tag: 'BOOKING_SYSTEM',
            workflow_status: 'OPEN',
            priority: 'MEDIUM',
            confidence: 0.88,
            reasons: otaSubjectHits.map(kw => `Subject contains OTA keyword "${kw}"`),
            model: 'rules_v1',
        };
    }

    // ── Rule 2: Finance/Payout (FINANCE_PAYOUT) ─────────────
    const financeHits = containsAny(combinedText, FINANCE_KEYWORDS);
    if (financeHits.length >= 1) {
        const confidence = financeHits.length >= 2 ? 0.94 : 0.92;
        return {
            tag: 'FINANCE_PAYOUT',
            workflow_status: 'ACTION_REQUIRED',
            priority: 'HIGH',
            confidence,
            reasons: financeHits.map(kw => `Contains finance keyword "${kw}"`),
            model: 'rules_v1',
        };
    }

    // ── Rule 3: Dispute/Refund (DISPUTE_REFUND) ─────────────
    const disputeHits = containsAny(combinedText, DISPUTE_KEYWORDS);
    if (disputeHits.length >= 1) {
        const confidence = disputeHits.length >= 2 ? 0.95 : 0.93;
        return {
            tag: 'DISPUTE_REFUND',
            workflow_status: 'ACTION_REQUIRED',
            priority: 'CRITICAL',
            confidence,
            reasons: disputeHits.map(kw => `Contains dispute keyword "${kw}"`),
            model: 'rules_v1',
        };
    }

    // ── Rule 4: Ads/Spam (ADS_SPAM) ─────────────────────────
    const adsHits = containsAny(combinedText, ADS_KEYWORDS);
    if (adsHits.length >= 2) {
        return {
            tag: 'ADS_SPAM',
            workflow_status: 'DONE',
            priority: 'LOW',
            confidence: 0.88,
            reasons: adsHits.map(kw => `Contains ads/spam keyword "${kw}"`),
            model: 'rules_v1',
        };
    }
    if (adsHits.length === 1) {
        return {
            tag: 'ADS_SPAM',
            workflow_status: 'DONE',
            priority: 'LOW',
            confidence: 0.85,
            reasons: adsHits.map(kw => `Contains ads/spam keyword "${kw}"`),
            model: 'rules_v1',
        };
    }

    return null; // No rule matched → proceed to heuristics
}


// ═══════════════════════════════════════════════════════════
// STEP 2 — HEURISTICS
// ═══════════════════════════════════════════════════════════

/** Guest-related keywords */
const GUEST_KEYWORDS = [
    'check in', 'check-in', 'checkin',
    'check out', 'check-out', 'checkout',
    'address', 'key', 'late arrival', 'luggage',
    'early check', 'self check', 'wifi', 'password',
    'directions', 'parking', 'breakfast',
    'pool', 'room', 'towel', 'cleaning',
];

/**
 * STEP 2: Heuristics — behavioral pattern matching.
 * Runs only if rules engine returned null.
 */
export function classifyByHeuristics(input: ThreadClassificationInput): AIClassificationResult | null {
    const combinedText = [input.subject, input.snippet, input.last_message_preview]
        .filter(Boolean)
        .join(' ');

    // ── Heuristic 1: Public email + guest keywords → GUEST_MESSAGE
    if (isPublicEmailDomain(input.sender_domain)) {
        const guestHits = containsAny(combinedText, GUEST_KEYWORDS);
        if (guestHits.length >= 1) {
            const confidence = guestHits.length >= 2 ? 0.85 : 0.80;
            return {
                tag: 'GUEST_MESSAGE',
                workflow_status: 'ACTION_REQUIRED',
                priority: 'MEDIUM',
                confidence,
                reasons: [
                    `Sender from public email domain "${input.sender_domain}"`,
                    ...guestHits.map(kw => `Contains guest keyword "${kw}"`),
                ],
                model: 'heuristics_v1',
            };
        }
    }

    // ── Heuristic 2: Public email without keywords → likely guest (lower confidence)
    if (isPublicEmailDomain(input.sender_domain)) {
        return {
            tag: 'GUEST_MESSAGE',
            workflow_status: 'OPEN',
            priority: 'MEDIUM',
            confidence: 0.65, // Below threshold → will trigger AI fallback
            reasons: [
                `Sender from public email domain "${input.sender_domain}"`,
                'No specific guest keywords found — low confidence',
            ],
            model: 'heuristics_v1',
        };
    }

    return null; // No heuristic matched → proceed to AI fallback
}


// ═══════════════════════════════════════════════════════════
// STEP 3 — AI FALLBACK (stub — calls Edge Function)
// ═══════════════════════════════════════════════════════════

/**
 * Redact sensitive patterns (phone, passport, ID numbers).
 */
export function redactSensitive(text: string | null): string {
    if (!text) return '';
    return text
        // Phone numbers (various formats)
        .replace(/\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g, '[PHONE]')
        // Passport-like patterns
        .replace(/\b[A-Z]{1,2}\d{6,9}\b/g, '[ID]')
        // Email addresses in body (keep sender, redact others)
        .replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, '[EMAIL]');
}

/**
 * Build AI prompt payload (STRICT: no full body, max 500 chars each).
 */
export function buildAIPayload(input: ThreadClassificationInput): Record<string, unknown> {
    return {
        subject: redactSensitive(input.subject)?.slice(0, 500) || '',
        snippet: redactSensitive(input.snippet)?.slice(0, 500) || '',
        sender_domain: input.sender_domain || '',
        participants_domains: input.participants_domains,
        last_message_preview: redactSensitive(input.last_message_preview)?.slice(0, 500) || '',
    };
}

/**
 * STEP 3: AI Fallback — calls Edge Function for classification.
 * Only called when confidence < 0.80 from rules + heuristics.
 *
 * NOTE: This returns a default INTERNAL_OTHER with low confidence
 * if the Edge Function is not available. The actual Edge Function
 * should be deployed separately.
 */
export async function classifyByAI(
    input: ThreadClassificationInput,
    supabaseClient: { functions: { invoke: (name: string, options: { body: unknown }) => Promise<{ data: unknown; error: unknown }> } }
): Promise<AIClassificationResult> {
    const payload = buildAIPayload(input);

    try {
        const { data, error } = await supabaseClient.functions.invoke(
            'email-classify-thread',
            { body: payload }
        );

        if (error || !data) {
            console.warn('[EmailClassification] AI fallback failed:', error);
            return fallbackResult(input);
        }

        const result = data as {
            tag?: string;
            workflow_status?: string;
            priority?: string;
            confidence?: number;
            reasons?: string[];
        };

        // Validate response format
        if (!result.tag || typeof result.confidence !== 'number') {
            console.warn('[EmailClassification] Invalid AI response:', result);
            return fallbackResult(input);
        }

        return {
            tag: result.tag as AIClassificationTag,
            workflow_status: (result.workflow_status as AIWorkflowStatus) || 'OPEN',
            priority: (result.priority as AIPriority) || 'MEDIUM',
            confidence: Math.min(Math.max(result.confidence, 0), 1),
            reasons: result.reasons || ['AI model classification'],
            model: 'gemini-2.0-flash',
        };
    } catch (err) {
        console.warn('[EmailClassification] AI call error:', err);
        return fallbackResult(input);
    }
}

function fallbackResult(input: ThreadClassificationInput): AIClassificationResult {
    return {
        tag: 'INTERNAL_OTHER',
        workflow_status: 'OPEN',
        priority: 'MEDIUM',
        confidence: 0.30,
        reasons: [
            'AI fallback unavailable — defaulting to INTERNAL_OTHER',
            `Subject: "${input.subject?.slice(0, 100) || 'N/A'}"`,
        ],
        model: 'rules_v1',
    };
}


// ═══════════════════════════════════════════════════════════
// PIPELINE ORCHESTRATOR
// ═══════════════════════════════════════════════════════════

const CONFIDENCE_THRESHOLD_FOR_AI = 0.80;
const REVIEW_THRESHOLD = 0.70;

/** Attach review_flag based on confidence */
function withReviewFlag(result: AIClassificationResult): AIClassificationResult {
    return { ...result, review_flag: result.confidence < REVIEW_THRESHOLD };
}

/**
 * Main classification pipeline.
 * Runs: Rules → Heuristics → AI Fallback (if needed).
 *
 * Does NOT auto-apply. Returns the suggestion for the caller to decide.
 */
export async function classifyThread(
    input: ThreadClassificationInput,
    supabaseClient?: { functions: { invoke: (name: string, options: { body: unknown }) => Promise<{ data: unknown; error: unknown }> } }
): Promise<AIClassificationResult> {
    // Guard: skip if manual override
    if (input.manual_override && input.tag_source === 'MANUAL') {
        return withReviewFlag({
            tag: input.current_tag as AIClassificationTag,
            workflow_status: 'OPEN',
            priority: 'MEDIUM',
            confidence: 0,
            reasons: ['Thread has manual override — skipping AI classification'],
            model: 'rules_v1',
        });
    }

    // STEP 1: Rules Engine
    const rulesResult = classifyByRules(input);
    if (rulesResult && rulesResult.confidence >= CONFIDENCE_THRESHOLD_FOR_AI) {
        return withReviewFlag(rulesResult);
    }

    // STEP 2: Heuristics
    const heuristicsResult = classifyByHeuristics(input);
    if (heuristicsResult && heuristicsResult.confidence >= CONFIDENCE_THRESHOLD_FOR_AI) {
        return withReviewFlag(heuristicsResult);
    }

    // STEP 3: AI Fallback (only if we have a supabase client)
    if (supabaseClient) {
        return withReviewFlag(await classifyByAI(input, supabaseClient));
    }

    // No AI available — return best result so far or fallback
    return withReviewFlag(heuristicsResult || rulesResult || fallbackResult(input));
}


// ═══════════════════════════════════════════════════════════
// HELPERS — Build input from thread data
// ═══════════════════════════════════════════════════════════

/**
 * Build classification input from an EmailThreadV2 object.
 * Used by the hook to prepare data for the pipeline.
 */
export function buildClassificationInput(
    thread: {
        id: string;
        tenant_id: string;
        subject: string | null;
        snippet?: string | null;
        primary_participant: string | null;
        tag: string;
        tag_source: string;
        manual_override?: boolean;
    },
    latestMessage?: {
        sender?: string | null;
        body_text?: string | null;
        from_json?: unknown;
    } | null,
): ThreadClassificationInput {
    // Extract sender email from various sources
    let senderEmail: string | null = null;
    if (latestMessage?.sender) {
        senderEmail = latestMessage.sender;
    } else if (latestMessage?.from_json) {
        const fromJson = latestMessage.from_json;
        if (Array.isArray(fromJson) && fromJson[0]?.email) {
            senderEmail = fromJson[0].email;
        } else if (typeof fromJson === 'object' && fromJson && 'email' in fromJson) {
            senderEmail = (fromJson as { email: string }).email;
        }
    }

    const senderDomain = extractDomain(senderEmail);

    // Extract participant email from primary_participant if it looks like an email
    const participantDomains: string[] = [];
    if (thread.primary_participant?.includes('@')) {
        const d = extractDomain(thread.primary_participant);
        if (d) participantDomains.push(d);
    }
    if (senderDomain && !participantDomains.includes(senderDomain)) {
        participantDomains.push(senderDomain);
    }

    return {
        thread_id: thread.id,
        tenant_id: thread.tenant_id,
        subject: thread.subject,
        snippet: thread.snippet || null,
        primary_participant: thread.primary_participant,
        sender_email: senderEmail,
        sender_domain: senderDomain,
        participants_domains: participantDomains,
        last_message_preview: latestMessage?.body_text?.slice(0, 500) || null,
        current_tag: thread.tag,
        tag_source: thread.tag_source,
        manual_override: thread.manual_override ?? false,
    };
}
