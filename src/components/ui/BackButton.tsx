import { ArrowLeft } from "lucide-react";
import { useLocation } from "react-router-dom";
import { AppLink } from "@/components/system/AppLink";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { Button } from "./button";
import { cn } from "@/lib/utils";

interface BackButtonProps {
  /** 
   * Explicit back destination. If not provided, will use smart back logic.
   */
  to?: string;
  /** 
   * Label to show next to icon. Default: none (icon only)
   */
  label?: string;
  /**
   * Custom className
   */
  className?: string;
  /**
   * Size variant
   */
  size?: "sm" | "default" | "icon";
}

/**
 * Standardized Back Button Component
 * 
 * UX Governance Rules:
 * - Always provides visual back navigation (no reliance on browser back)
 * - Smart destination: referrer > parent route > fallback
 * - Preserves scroll position via sessionStorage
 * 
 * Usage:
 * <BackButton /> // Smart back
 * <BackButton to="/bookings" /> // Explicit destination
 * <BackButton to="/bookings" label="Danh sách" /> // With label
 */
export function BackButton({
  to,
  label,
  className,
  size = "icon"
}: BackButtonProps) {
  const location = useLocation();
  const { appNavigate, navigate } = useAppNavigate();

  // Smart back logic
  const handleClick = () => {
    if (to) {
      appNavigate(to);
      return;
    }

    // Check if we have a referrer in state
    const referrer = location.state?.from;
    if (referrer) {
      appNavigate(referrer);
      return;
    }

    // Try browser history
    if (window.history.length > 2) {
      navigate(-1);
      return;
    }

    // Fallback to parent route
    const parentRoute = getParentRoute(location.pathname);
    appNavigate(parentRoute);
  };

  // If explicit destination, use Link for better SEO and hover preview
  if (to) {
    return (
      <Button
        variant="ghost"
        size={size}
        asChild
        className={cn(
          "transition-all duration-150",
          "hover:bg-muted/80",
          className
        )}
      >
        <AppLink to={to}>
          <ArrowLeft className="h-4 w-4" />
          {label && <span className="ml-2">{label}</span>}
        </AppLink>
      </Button>
    );
  }

  // Smart back uses onClick
  return (
    <Button
      variant="ghost"
      size={size}
      onClick={handleClick}
      className={cn(
        "transition-all duration-150",
        "hover:bg-muted/80",
        className
      )}
    >
      <ArrowLeft className="h-4 w-4" />
      {label && <span className="ml-2">{label}</span>}
    </Button>
  );
}

/**
 * Get parent route from current path
 * /bookings/123 -> /bookings
 * /host-payables/settlement -> /host-payables
 */
function getParentRoute(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length <= 1) return '/';
  parts.pop();
  return '/' + parts.join('/');
}

export default BackButton;
