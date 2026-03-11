import { cn } from "@/lib/utils";
import {
  Globe,
  Building2,
  Home,
  Briefcase,
  Users,
  Facebook,
  Music2,
} from "lucide-react";

// Import OTA logos
import agodaLogo from "@/assets/ota-logos/agoda.png";
import bookingLogo from "@/assets/ota-logos/booking.png";
import ctripLogo from "@/assets/ota-logos/ctrip.png";
import travelokaLogo from "@/assets/ota-logos/traveloka.png";
import expediaLogo from "@/assets/ota-logos/expedia.png";
import roomriseLogo from "@/assets/roomrise-logo-navy.png";

type OtaKey =
  | "BOOKING"
  | "AGODA"
  | "EXPEDIA"
  | "AIRBNB"
  | "TRAVELOKA"
  | "CTRIP"
  | "FACEBOOK"
  | "TIKTOK"
  | "WALK_IN"
  | "CORPORATE"
  | "DIRECT"
  | "OTHER";

const normalizeSource = (source: string): OtaKey => {
  const s = (source || "").trim().toUpperCase();
  if (s === "BOOKING.COM" || s === "BOOKING" || s === "BDC") return "BOOKING";
  if (s === "AGODA" || s === "AGD") return "AGODA";
  if (s === "EXPEDIA" || s === "EXP") return "EXPEDIA";
  if (s === "AIRBNB" || s === "ABB") return "AIRBNB";
  if (s === "TRAVELOKA") return "TRAVELOKA";
  if (s === "CTRIP" || s === "CTP" || s === "TRIP.COM" || s === "TRIP" || s === "TRIPCOM") return "CTRIP";
  if (s === "FACEBOOK" || s === "FB") return "FACEBOOK";
  if (s === "TIKTOK") return "TIKTOK";
  if (s === "WALK-IN" || s === "WALKIN" || s === "WALK_IN") return "WALK_IN";
  if (s === "CORPORATE") return "CORPORATE";
  if (s === "DIRECT") return "DIRECT";
  return "OTHER";
};

const displayLabel = (key: OtaKey, original: string) => {
  switch (key) {
    case "BOOKING":
      return "Booking.com";
    case "AGODA":
      return "Agoda";
    case "EXPEDIA":
      return "Expedia";
    case "AIRBNB":
      return "Airbnb";
    case "TRAVELOKA":
      return "Traveloka";
    case "CTRIP":
      return "Trip.com";
    case "FACEBOOK":
      return "Facebook";
    case "TIKTOK":
      return "TikTok";
    case "WALK_IN":
      return "Walk-in";
    case "CORPORATE":
      return "Corporate";
    case "DIRECT":
      return "Direct";
    case "OTHER":
    default:
      return original || "Other";
  }
};

// Map OTA keys to their logo images
const otaLogoImages: Record<string, string> = {
  AGODA: agodaLogo,
  BOOKING: bookingLogo,
  CTRIP: ctripLogo,
  TRAVELOKA: travelokaLogo,
  EXPEDIA: expediaLogo,
  OTHER: roomriseLogo,
};

// SVG Logo Components for OTAs without image logos
const BookingLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} fill="none">
    <rect width="32" height="32" rx="6" fill="#003580" />
    <text x="5" y="21" fontSize="9" fontWeight="700" fill="white" fontFamily="Arial, sans-serif">B.</text>
    <text x="14" y="21" fontSize="7" fill="white" fontFamily="Arial, sans-serif">com</text>
  </svg>
);

const AirbnbLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} fill="none">
    <rect width="32" height="32" rx="6" fill="#FF5A5F" />
    <path d="M16 8 C14 12 12 14 12 17 C12 19 13.5 21 16 21 C18.5 21 20 19 20 17 C20 14 18 12 16 8Z" fill="white" />
    <circle cx="16" cy="14" r="2" fill="#FF5A5F" />
  </svg>
);

const FacebookLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} fill="none">
    <rect width="32" height="32" rx="6" fill="#1877F2" />
    <path d="M18 16h2.5l1-4H18v-2c0-1 0-2 2-2h1.5V5c-.5 0-1.5-.1-3-.1-3 0-5 1.8-5 5.1V12h-3v4h3v10h4V16z" fill="white" />
  </svg>
);

const TiktokLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} fill="none">
    <rect width="32" height="32" rx="6" fill="#000000" />
    <path d="M20 10c0 2 1.5 3.5 3.5 3.5v3c-1.2 0-2.3-.3-3.5-1v6.5c0 3-2.5 5.5-5.5 5.5S9 25 9 22s2.5-5.5 5.5-5.5v3c-1.4 0-2.5 1.1-2.5 2.5s1.1 2.5 2.5 2.5 2.5-1.1 2.5-2.5V7h3v3z" fill="white" />
  </svg>
);

// Map for SVG logos
const otaSvgLogos: Record<string, React.ComponentType<{ className?: string }>> = {
  AIRBNB: AirbnbLogo,
  FACEBOOK: FacebookLogo,
  TIKTOK: TiktokLogo,
};

// Fallback icons for non-OTA sources
const otaFallbackIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  WALK_IN: Users,
  CORPORATE: Briefcase,
  DIRECT: Globe,
};

interface OtaBadgeProps {
  source: string;
  className?: string;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function OtaBadge({
  source,
  className,
  showIcon = true,
  size = "md",
  showLabel = true
}: OtaBadgeProps) {
  const key = normalizeSource(source);
  const logoImage = otaLogoImages[key];
  const SvgLogo = otaSvgLogos[key];
  const FallbackIcon = otaFallbackIcons[key];

  const logoSize = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  }[size];

  const iconSize = {
    sm: "h-2.5 w-2.5",
    md: "h-3 w-3",
    lg: "h-3.5 w-3.5",
  }[size];

  const textSize = {
    sm: "text-[10px]",
    md: "text-[11px]",
    lg: "text-xs",
  }[size];

  // If we have an image logo
  if (logoImage && showIcon) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-2",
          className
        )}
        title={displayLabel(key, source)}
      >
        <img
          src={logoImage}
          alt={displayLabel(key, source)}
          className={cn(logoSize, "flex-shrink-0 rounded object-contain")}
        />
        {showLabel && (
          <span className={cn("font-medium text-inherit", textSize)}>
            {displayLabel(key, source)}
          </span>
        )}
      </span>
    );
  }

  // If we have an SVG logo
  if (SvgLogo && showIcon) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-2",
          className
        )}
        title={displayLabel(key, source)}
      >
        <SvgLogo className={cn(logoSize, "flex-shrink-0 rounded")} />
        {showLabel && (
          <span className={cn("font-medium text-inherit", textSize)}>
            {displayLabel(key, source)}
          </span>
        )}
      </span>
    );
  }

  // For non-OTA sources with fallback icons, use badge style
  const sizeClasses = size === "sm" ? "px-1 py-px" : size === "lg" ? "px-2 py-0.5" : "px-1.5 py-px";

  if (FallbackIcon) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md font-medium ring-1 ring-inset",
          "bg-muted/50 text-foreground ring-border",
          sizeClasses,
          textSize,
          className
        )}
        title={displayLabel(key, source)}
      >
        {showIcon && <FallbackIcon className={cn(iconSize, "flex-shrink-0 text-muted-foreground")} />}
        {showLabel && <span className="truncate">{displayLabel(key, source)}</span>}
      </span>
    );
  }

  // Default: use Roomrise logo for OTHER
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2",
        className
      )}
      title={displayLabel(key, source)}
    >
      {showIcon && (
        <img
          src={roomriseLogo}
          alt="Roomrise"
          className={cn(logoSize, "flex-shrink-0 rounded object-contain")}
        />
      )}
      {showLabel && (
        <span className={cn("font-medium text-inherit", textSize)}>
          {displayLabel(key, source)}
        </span>
      )}
    </span>
  );
}

// Component chỉ hiển thị logo OTA (không có label)
interface OtaLogoProps {
  source: string;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

export function OtaLogo({ source, className, size = "sm" }: OtaLogoProps) {
  const key = normalizeSource(source);
  const logoImage = otaLogoImages[key];
  const SvgLogo = otaSvgLogos[key];
  const FallbackIcon = otaFallbackIcons[key];

  const logoSize = {
    xs: "h-3.5 w-3.5",
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-7 w-7",
    xl: "h-9 w-9",
  }[size];

  // Image logo
  if (logoImage) {
    return (
      <img
        src={logoImage}
        alt={displayLabel(key, source)}
        title={displayLabel(key, source)}
        className={cn(logoSize, "flex-shrink-0 rounded object-contain", className)}
      />
    );
  }

  // SVG logo
  if (SvgLogo) {
    return <SvgLogo className={cn(logoSize, "flex-shrink-0 rounded", className)} />;
  }

  // Fallback icon
  if (FallbackIcon) {
    return <FallbackIcon className={cn(logoSize, "flex-shrink-0 text-muted-foreground", className)} />;
  }

  // Default roomrise
  return (
    <img
      src={roomriseLogo}
      alt="Roomrise"
      title={displayLabel(key, source)}
      className={cn(logoSize, "flex-shrink-0 rounded object-contain", className)}
    />
  );
}