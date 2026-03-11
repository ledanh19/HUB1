/**
 * PaymentMethodIcon - Shared component for rendering payment method icons
 * 
 * Maps icon identifier strings from paymentMethods.ts constants to Lucide React icons.
 * Used consistently across CollectionsPage, BookingDetailPage, CollectionEventItem, etc.
 */
import {
    Banknote,
    Building2,
    CreditCard,
    QrCode,
    Link2,
    Globe,
    Wallet,
    Smartphone,
    Receipt,
    Home,
    Shield,
    type LucideIcon,
} from "lucide-react";

// Map icon string identifiers → Lucide icon components
const ICON_MAP: Record<string, LucideIcon> = {
    // Payment Methods
    banknote: Banknote,
    building2: Building2,
    'credit-card': CreditCard,
    'qr-code': QrCode,
    'link-2': Link2,
    globe: Globe,
    wallet: Wallet,
    smartphone: Smartphone,
    home: Home,
    shield: Shield,
    // Payment Method codes (for backward compatibility with PAYMENT_METHOD_ICONS mapping)
    CASH: Banknote,
    BANK_TRANSFER: Building2,
    CARD: CreditCard,
    QR: QrCode,
    PAYMENT_LINK: Link2,
    OTA_COLLECT: Globe,
    EWALLET: Wallet,
    // Link Provider codes
    ONEPAY: CreditCard,
    NINEPAY: Wallet,
    VNPAY: QrCode,
    MOMO: Smartphone,
    ZALOPAY: Wallet,
    OTHER: Link2,
    // Provider codes
    DIRECT: Home,
    SEPAY: Shield,
};

interface PaymentMethodIconProps {
    /** Icon identifier string (from paymentMethods.ts) or payment method code */
    code: string;
    className?: string;
}

/**
 * Renders a Lucide icon based on the icon identifier string or payment method code.
 * Falls back to Receipt icon if no match found.
 */
export function PaymentMethodIcon({ code, className = "h-4 w-4 text-muted-foreground" }: PaymentMethodIconProps) {
    const Icon = ICON_MAP[code] || Receipt;
    return <Icon className={className} />;
}

/**
 * Get the Lucide icon component for a given code.
 * Useful when you need the component reference rather than JSX.
 */
export function getIconComponent(code: string): LucideIcon {
    return ICON_MAP[code] || Receipt;
}
