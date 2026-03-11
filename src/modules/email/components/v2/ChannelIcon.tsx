/**
 * ChannelIcon — Email thread source badge
 * ═══════════════════════════════════════════════════
 * Reuses the SOT OtaBadge/OtaLogo from @/components/ui/ota-badge
 * (same component used by Booking Center).
 *
 * Detection priority:
 * 1. thread.tag → known OTA tags map directly
 * 2. thread.primary_participant sender domain → normalizeSource()
 * 3. thread.subject keywords → normalizeSource()
 * 4. Fallback → Roomrise/System icon
 *
 * NO heuristic guessing — uses the same normalizeSource() as Booking Center.
 */
import React from 'react';
import { OtaBadge, OtaLogo } from '@/components/ui/ota-badge';
import type { EmailThreadV2 } from '@/types/email-v2';

// ── Map sender domain to OTA source string (same keys as OtaBadge) ──
const DOMAIN_TO_SOURCE: Record<string, string> = {
    'agoda.com': 'AGODA',
    'agoda.net': 'AGODA',
    'booking.com': 'BOOKING',
    'expedia.com': 'EXPEDIA',
    'expediapartnercentral.com': 'EXPEDIA',
    'hotels.com': 'EXPEDIA',
    'airbnb.com': 'AIRBNB',
    'trip.com': 'CTRIP',
    'ctrip.com': 'CTRIP',
    'traveloka.com': 'TRAVELOKA',
};

/**
 * Detect OTA source from thread data.
 * Returns a source string compatible with OtaBadge's normalizeSource().
 */
export function detectSourceFromThread(thread: EmailThreadV2): string {
    const sender = (thread.primary_participant ?? '').toLowerCase();
    const subject = (thread.subject ?? '').toLowerCase();

    // 1. Check sender domain against known OTA domains
    for (const [domain, source] of Object.entries(DOMAIN_TO_SOURCE)) {
        if (sender.includes(domain)) return source;
    }

    // 2. Check subject for OTA keywords (conservative — exact brand names only)
    if (/\bagoda\b/i.test(subject)) return 'AGODA';
    if (/\bbooking\.com\b/i.test(subject)) return 'BOOKING';
    if (/\bexpedia\b/i.test(subject)) return 'EXPEDIA';
    if (/\bairbnb\b/i.test(subject)) return 'AIRBNB';
    if (/\btrip\.com\b/i.test(subject) || /\bctrip\b/i.test(subject)) return 'CTRIP';
    if (/\btraveloka\b/i.test(subject)) return 'TRAVELOKA';

    // 3. Fallback — use tag as hint
    if (thread.tag === 'BOOKING_SYSTEM' || thread.tag === 'VIP_PARTNER' || thread.tag === 'BOOKING_EXCEPTION') {
        return 'OTHER'; // OtaBadge renders Roomrise logo for OTHER
    }

    return 'OTHER';
}

// ── Compact: just the logo ──
interface ChannelIconProps {
    thread: EmailThreadV2;
    /** 'compact' = small icon only, 'full' = icon + label badge */
    variant?: 'compact' | 'full';
    className?: string;
}

export function ChannelIcon({ thread, variant = 'compact', className }: ChannelIconProps) {
    const source = detectSourceFromThread(thread);

    if (variant === 'compact') {
        return <OtaLogo source={source} size="xs" className={className} />;
    }

    return <OtaBadge source={source} size="sm" showLabel className={className} />;
}
