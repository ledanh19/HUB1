/**
 * Deterministic Tag Classifier for Email Operational Inbox V2
 * ═══════════════════════════════════════════════════════════
 * Unified taxonomy: BOOKING_SYSTEM, GUEST_MESSAGE, DISPUTE_REFUND,
 * FINANCE_PAYOUT, ADS_SPAM, INTERNAL_OTHER
 *
 * Classification priority (first match wins):
 * 1. ADS_SPAM — promotions, social, newsletters, marketing
 * 2. DISPUTE_REFUND — chargebacks, complaints, refunds, waivers
 * 3. FINANCE_PAYOUT — payouts, invoices, settlements, commissions
 * 4. GUEST_MESSAGE — messages from/about guests (OTA relay, special requests)
 * 5. BOOKING_SYSTEM — reservations, confirmations, reviews, modifications
 * 6. INTERNAL_OTHER — fallback (low confidence = needs review)
 *
 * review_flag: true when confidence < REVIEW_THRESHOLD (0.70).
 * This separates "genuinely internal" from "ambiguous/needs human review".
 */

// ─── New unified taxonomy ───────────────────────────────────
export type EmailTagV2 =
    | "BOOKING_SYSTEM"
    | "GUEST_MESSAGE"
    | "DISPUTE_REFUND"
    | "FINANCE_PAYOUT"
    | "ADS_SPAM"
    | "INTERNAL_OTHER";

// Legacy tags (kept for backward compatibility in sync trigger)
export type EmailTag =
    | "GUEST_REPLY"
    | "DISPUTE"
    | "FINANCE_ALERT"
    | "BOOKING_EXCEPTION"
    | "VIP_PARTNER"
    | "SILENT"
    | "OTHER";

export interface ClassificationInput {
    subject: string;
    snippet: string;
    labels: string[];
    senderEmail: string;
    /** Optional: primary participant domain */
    participantDomains?: string[];
}

/**
 * review_flag: true when the classifier is not confident enough.
 * UI folder "AI cần review" should show threads where review_flag = true.
 */
export interface ClassificationResultV2 {
    tag: EmailTagV2;
    legacyTag: EmailTag;
    confidence: number;
    reasons: string[];
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    model: "rules_v2";
    /** true if confidence is below REVIEW_THRESHOLD — needs human review */
    review_flag: boolean;
}

/** Threads with confidence below this are flagged for review */
const REVIEW_THRESHOLD = 0.70;

// ─── Domain lists ───────────────────────────────────────────

const OTA_RELAY_DOMAINS = [
    "property.booking.com",
    "messagedelivery.agoda.com",
    "m.expediapartnercentral.com",
    "guest.booking.com",
    "mchat.booking.com",
];

const OTA_SYSTEM_DOMAINS = [
    "booking.com",
    "expedia.com",
    "expediapartnercentral.com",
    "agoda.com",
    "agoda.global",
    "airbnb.com",
    "trip.com",
    "hotels.com",
    "vrbo.com",
    "tripadvisor.com",
    "traveloka.com",
    "fliggy.com",
    "ctrip.com",
    "tiket.com",
    "expediagroup.com",
];

const PAYMENT_GATEWAY_DOMAINS = [
    "onepay.com.vn",
    "9pay.com.vn",
    "9pay.vn",
    "vnpay.vn",
    "momo.vn",
    "stripe.com",
    "paypal.com",
];

const KNOWN_MARKETING_SENDERS = [
    "noreply", "no-reply", "newsletter", "marketing",
    "mailer-daemon", "postmaster", "donotreply",
];

// ─── Keyword lists ──────────────────────────────────────────

const ADS_SPAM_KEYWORDS = [
    "unsubscribe", "hủy đăng ký", "opt out", "opt-out",
    "newsletter", "webinar", "promotion", "khuyến mại",
    "special offer", "limited time", "click here",
    "partnership offer", "sponsored", "advertisement",
    "dynamic rates+", "unlock higher revenue",
    "price drops", "selected for you",
    "tăng số lượng đơn đặt phòng", "tăng lượng đặt phòng",
    "tăng sức hút", "đang cân nhắc về tùy chỉnh chương trình",
    "thu hút thêm du khách", "thu hút thêm khách",
    "đơn giản hóa thanh toán", "bản tóm tắt hiệu suất",
    "ảnh chất lượng cao", "bỏ lỡ các lượt đặt phòng",
    "nơi lưu trú không có phòng", "price alert",
    "price parity", "align your", "rates now",
    "xu hướng du lịch", "cải thiện mức giảm",
    "tiện nghi", "tin bán phòng",
];

const DISPUTE_KEYWORDS = [
    "dispute", "chargeback", "bồi hoàn", "tranh chấp",
    "complaint", "khiếu nại", "refund request", "yêu cầu hoàn tiền",
    "waiver request", "resolution center", "fraud",
    "claim", "refund approval", "refund",
];

const FINANCE_KEYWORDS = [
    "payout", "remittance", "transfer advice",
    "invoice", "hóa đơn", "commission report", "commission",
    "payment advice", "settlement", "billing",
    "credit note", "đối soát", "reconciliation",
    "bank transfer", "deduction",
    "biên bản đối soát",
    "giao dịch thành công", "transaction successful",
];

const GUEST_MESSAGE_KEYWORDS = [
    "message from", "tin nhắn từ", "new message",
    "guest message", "reply from", "inquiry",
    "special request", "yêu cầu đặc biệt",
    "upcoming guest", "tin nhắn mới từ",
];

const GUEST_CONTENT_KEYWORDS = [
    "check in", "check-in", "checkin",
    "check out", "check-out", "checkout",
    "late arrival", "early check", "self check",
    "luggage", "parking", "breakfast", "wifi", "password",
    "key", "directions", "pool", "towel", "cleaning",
    "address", "airport transport",
];

const BOOKING_KEYWORDS = [
    "new reservation", "đặt phòng mới",
    "confirmed reservation", "reservation confirmed",
    "xác nhận đặt phòng", "booking confirmation",
    "booking id", "reservation id", "confirmation #",
    "check-in date", "itinerary",
];

const BOOKING_EXCEPTION_KEYWORDS = [
    "cancelled", "cancellation", "hủy",
    "modification", "modified", "thay đổi đặt phòng",
    "overbooked", "no-show", "no show", "không đến",
    "date change", "missing reservation",
];

/** OTA operational emails that are NOT guest messages */
const OTA_OPERATIONAL_KEYWORDS = [
    "new review", "nhận xét mới", "phản hồi mới",
    "phản hồi lập tức", "phản hồi tích cực", "phản hồi tiêu cực",
    "you have a new review",
    "customer contact info",
    "property id:", "mã nơi lưu trú",
    "vip guest arrival", "arrival notification",
    "nơi lưu trú", "hành động ngay",
    "cảnh báo giá", "đang mất đơn đặt phòng",
];

const SYSTEM_KEYWORDS = [
    "mã truy cập", "access code", "verification code",
    "otp", "verify", "security alert", "cảnh báo bảo mật",
    "khôi phục", "password reset", "đăng nhập",
    "thông báo bảo trì", "bảo trì hệ thống",
    "thông báo giao dịch",
];

// ─── Helper functions ───────────────────────────────────────

function extractDomain(email: string): string {
    const match = email.match(/@([^@\s>]+)/);
    return match ? match[1].toLowerCase() : "";
}

function domainEndsWith(domain: string, list: string[]): boolean {
    return list.some(d => domain === d || domain.endsWith("." + d));
}

function containsAny(text: string, keywords: string[]): string[] {
    if (!text) return [];
    const lower = text.toLowerCase();
    return keywords.filter(kw => lower.includes(kw));
}

function isOTARelay(domain: string): boolean {
    return OTA_RELAY_DOMAINS.some(d => domain.includes(d));
}

function isMarketingSender(email: string): boolean {
    const lower = email.toLowerCase();
    return KNOWN_MARKETING_SENDERS.some(s => lower.includes(s));
}

function buildResult(
    tag: EmailTagV2,
    legacyTag: EmailTag,
    confidence: number,
    reasons: string[],
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
): ClassificationResultV2 {
    return {
        tag,
        legacyTag,
        confidence,
        reasons,
        priority,
        model: "rules_v2",
        review_flag: confidence < REVIEW_THRESHOLD,
    };
}

// ═══════════════════════════════════════════════════════════
// V2 CLASSIFIER — New unified taxonomy
// ═══════════════════════════════════════════════════════════

export function classifyEmailTagV2(input: ClassificationInput): ClassificationResultV2 {
    const { subject, snippet, labels, senderEmail } = input;
    const sub = (subject || "").toLowerCase();
    const snip = (snippet || "").toLowerCase();
    const sender = (senderEmail || "").toLowerCase();
    const domain = extractDomain(sender);
    const combined = `${sub} ${snip}`;

    // ── 1. ADS_SPAM — Promotions, Social, Marketing ──────────
    // Gmail category labels are very reliable
    if (labels.includes("CATEGORY_PROMOTIONS") || labels.includes("CATEGORY_SOCIAL")) {
        // Protect guest messages relayed through promo-labeled emails
        const guestHits = containsAny(combined, GUEST_MESSAGE_KEYWORDS);
        // Protect booking confirmations/cancellations
        const bookingHits = containsAny(combined, [...BOOKING_KEYWORDS, ...BOOKING_EXCEPTION_KEYWORDS]);
        if (guestHits.length === 0 && bookingHits.length === 0) {
            return buildResult("ADS_SPAM", "SILENT", 0.95,
                [`Gmail label: ${labels.includes("CATEGORY_PROMOTIONS") ? "PROMOTIONS" : "SOCIAL"}`],
                "LOW");
        }
    }

    // Marketing sender + marketing keywords (exclude OTA domains)
    if (isMarketingSender(sender) && !isOTARelay(domain) && !domainEndsWith(domain, OTA_SYSTEM_DOMAINS)) {
        const adsHits = containsAny(combined, ADS_SPAM_KEYWORDS);
        if (adsHits.length >= 1) {
            return buildResult("ADS_SPAM", "SILENT", 0.90,
                [`Marketing sender "${sender}"`, ...adsHits.map(k => `Keyword: "${k}"`)],
                "LOW");
        }
    }

    // Pure keyword-based spam detection (≥2 hits, not OTA relay)
    const adsHits = containsAny(combined, ADS_SPAM_KEYWORDS);
    if (adsHits.length >= 2 && !isOTARelay(domain)) {
        // If from OTA system domain, it might be operational — lower confidence
        const conf = domainEndsWith(domain, OTA_SYSTEM_DOMAINS) ? 0.75 : 0.88;
        return buildResult("ADS_SPAM", "SILENT", conf,
            adsHits.map(k => `Ads keyword: "${k}"`),
            "LOW");
    }

    // ── 2. DISPUTE_REFUND — Chargebacks, Complaints ─────────
    const disputeHits = containsAny(combined, DISPUTE_KEYWORDS);
    if (disputeHits.length >= 1) {
        return buildResult("DISPUTE_REFUND", "DISPUTE",
            disputeHits.length >= 2 ? 0.95 : 0.93,
            disputeHits.map(k => `Dispute keyword: "${k}"`),
            "CRITICAL");
    }

    // ── 3. FINANCE_PAYOUT — Payments, Invoices, Settlements ─
    if (domainEndsWith(domain, PAYMENT_GATEWAY_DOMAINS)) {
        return buildResult("FINANCE_PAYOUT", "FINANCE_ALERT", 0.95,
            [`Payment gateway domain: "${domain}"`],
            "HIGH");
    }

    const financeHits = containsAny(combined, FINANCE_KEYWORDS);
    if (financeHits.length >= 1) {
        const bookingHits = containsAny(combined, BOOKING_KEYWORDS);
        if (financeHits.length >= 2 || bookingHits.length === 0) {
            return buildResult("FINANCE_PAYOUT", "FINANCE_ALERT",
                financeHits.length >= 2 ? 0.94 : 0.90,
                financeHits.map(k => `Finance keyword: "${k}"`),
                "HIGH");
        }
    }

    // ── 4. GUEST_MESSAGE — Guest communications ─────────────
    // OTA relay domain + guest message signal → high confidence guest message
    if (isOTARelay(domain)) {
        const guestMsgHits = containsAny(combined, GUEST_MESSAGE_KEYWORDS);
        // Relay domains with guest message keywords = definite guest message
        if (guestMsgHits.length >= 1) {
            return buildResult("GUEST_MESSAGE", "GUEST_REPLY", 0.97,
                [`OTA relay domain: "${domain}"`, ...guestMsgHits.map(k => `Keyword: "${k}"`)],
                "MEDIUM");
        }
        // Relay domain without explicit guest keywords — still likely guest but lower confidence
        // Check for OTA operational keywords (reviews, alerts)
        const opHits = containsAny(combined, OTA_OPERATIONAL_KEYWORDS);
        if (opHits.length >= 1) {
            return buildResult("BOOKING_SYSTEM", "VIP_PARTNER", 0.90,
                [`OTA relay domain: "${domain}"`, ...opHits.map(k => `Operational keyword: "${k}"`)],
                "MEDIUM");
        }
        // Relay domain alone — still guest message but slightly lower confidence
        return buildResult("GUEST_MESSAGE", "GUEST_REPLY", 0.88,
            [`OTA relay domain: "${domain}" (no explicit guest keyword, but relay = guest-facing)`],
            "MEDIUM");
    }

    // ── 4a. BOOKING_SYSTEM — Confirmations/Cancellations (BEFORE guest) ─
    // These are OTA system emails, not guest messages, even though they
    // contain guest-content keywords like "check-in" and "booking id".
    const bookingHits = containsAny(combined, BOOKING_KEYWORDS);
    const exceptionHits = containsAny(combined, BOOKING_EXCEPTION_KEYWORDS);

    // Explicit booking confirmation/cancellation subjects take precedence
    if ((bookingHits.length >= 1 || exceptionHits.length >= 1) && domainEndsWith(domain, OTA_SYSTEM_DOMAINS)) {
        // But protect genuine guest messages (relay messages, special requests)
        const guestMsgHits = containsAny(combined, GUEST_MESSAGE_KEYWORDS);
        const isGenuineGuestMessage = guestMsgHits.length >= 1 &&
            !sub.includes("confirmed") && !sub.includes("cancelled") &&
            !sub.includes("cancellation") && !sub.includes("- confirmed") &&
            !sub.includes("- cancelled");

        if (!isGenuineGuestMessage) {
            if (exceptionHits.length >= 1) {
                return buildResult("BOOKING_SYSTEM", "BOOKING_EXCEPTION", 0.95,
                    [`OTA domain: "${domain}"`, ...exceptionHits.map(k => `Exception: "${k}"`)],
                    "HIGH");
            }
            return buildResult("BOOKING_SYSTEM", "GUEST_REPLY",
                bookingHits.length >= 2 ? 0.93 : 0.90,
                [`OTA domain: "${domain}"`, ...bookingHits.map(k => `Booking keyword: "${k}"`)],
                "MEDIUM");
        }
    }

    // ── 4b. GUEST_MESSAGE — Guest communications ────────────
    // Guest message keywords (from OTA forwarded emails)
    const guestMsgHits = containsAny(combined, GUEST_MESSAGE_KEYWORDS);
    if (guestMsgHits.length >= 1) {
        return buildResult("GUEST_MESSAGE", "GUEST_REPLY",
            guestMsgHits.length >= 2 ? 0.93 : 0.90,
            guestMsgHits.map(k => `Guest message keyword: "${k}"`),
            "MEDIUM");
    }

    // Guest content keywords + OTA domain
    const guestContentHits = containsAny(combined, GUEST_CONTENT_KEYWORDS);
    if (guestContentHits.length >= 1 && domainEndsWith(domain, OTA_SYSTEM_DOMAINS)) {
        return buildResult("GUEST_MESSAGE", "GUEST_REPLY", 0.85,
            [`OTA domain: "${domain}"`, ...guestContentHits.map(k => `Guest keyword: "${k}"`)],
            "MEDIUM");
    }

    // ── 5. BOOKING_SYSTEM — Reservations, OTA operations ────
    // OTA operational keywords (reviews, alerts, property management)
    const opHits = containsAny(combined, OTA_OPERATIONAL_KEYWORDS);
    if (opHits.length >= 1 && domainEndsWith(domain, OTA_SYSTEM_DOMAINS)) {
        return buildResult("BOOKING_SYSTEM", "VIP_PARTNER", 0.90,
            [`OTA domain: "${domain}"`, ...opHits.map(k => `Operational: "${k}"`)],
            "MEDIUM");
    }

    // Booking exception keywords + OTA domain (non-OTA-domain cases not caught above)
    if (exceptionHits.length >= 1 && domainEndsWith(domain, OTA_SYSTEM_DOMAINS)) {
        return buildResult("BOOKING_SYSTEM", "BOOKING_EXCEPTION", 0.95,
            [`OTA domain: "${domain}"`, ...exceptionHits.map(k => `Exception: "${k}"`)],
            "HIGH");
    }

    // Booking confirmation keywords (non-OTA-domain fallback)
    if (bookingHits.length >= 1) {
        return buildResult("BOOKING_SYSTEM", "GUEST_REPLY",
            bookingHits.length >= 2 ? 0.93 : 0.90,
            bookingHits.map(k => `Booking keyword: "${k}"`),
            "MEDIUM");
    }

    // System keywords (OTP, security, maintenance)
    const systemHits = containsAny(combined, SYSTEM_KEYWORDS);
    if (systemHits.length >= 1) {
        return buildResult("BOOKING_SYSTEM", "OTHER", 0.88,
            systemHits.map(k => `System keyword: "${k}"`),
            "MEDIUM");
    }

    // OTA domain without specific keywords = generic OTA system email
    if (domainEndsWith(domain, OTA_SYSTEM_DOMAINS)) {
        return buildResult("BOOKING_SYSTEM", "VIP_PARTNER", 0.82,
            [`OTA domain: "${domain}" (no specific keyword match)`],
            "MEDIUM");
    }

    // Exception keywords without OTA domain
    if (exceptionHits.length >= 1) {
        return buildResult("BOOKING_SYSTEM", "BOOKING_EXCEPTION", 0.85,
            exceptionHits.map(k => `Exception keyword: "${k}"`),
            "HIGH");
    }

    // ── 6. Fallback — INTERNAL_OTHER with review flag ───────
    // confidence 0.30 → review_flag = true (below REVIEW_THRESHOLD 0.70)
    return buildResult("INTERNAL_OTHER", "OTHER", 0.30,
        ["No rules matched — needs review"],
        "MEDIUM");
}

// ═══════════════════════════════════════════════════════════
// LEGACY WRAPPER — backward compatible with existing sync code
// ═══════════════════════════════════════════════════════════

/**
 * Legacy wrapper: returns old-style EmailTag for backward compatibility.
 * New code should use classifyEmailTagV2 instead.
 */
export function classifyEmailTag(input: ClassificationInput): EmailTag {
    const result = classifyEmailTagV2(input);
    return result.legacyTag;
}
