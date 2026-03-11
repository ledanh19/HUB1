import { ArrowLeft, Loader2, Check } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { pageSlideIn } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface MobileTaskPageProps {
  title: string;
  onBack?: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  isSubmitting?: boolean;
  hideSubmit?: boolean;
  children: React.ReactNode;
}

export function MobileTaskPage({
  title,
  onBack,
  onSubmit,
  submitLabel = "Lưu",
  submitDisabled = false,
  isSubmitting = false,
  hideSubmit = false,
  children,
}: MobileTaskPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const reduced = useReducedMotion();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      // Smart back: try location state, then history, then fallback
      const returnTab = (location.state as any)?.returnTab;
      const bookingMatch = location.pathname.match(/\/bookings\/([^/]+)/);
      if (bookingMatch) {
        const tabParam = returnTab && returnTab !== "overview" ? `?tab=${returnTab}` : "";
        navigate(`/bookings/${bookingMatch[1]}${tabParam}`, { replace: true });
      } else if (window.history.length > 2) {
        navigate(-1);
      } else {
        navigate("/bookings", { replace: true });
      }
    }
  };

  const content = (
    <div className="flex flex-col bg-background -mx-3 -mt-0 -mb-4">
      {/* Sub-header — matches MobileBookingAppBar style */}
      <div className="sticky top-0 z-30 relative overflow-hidden bg-gradient-to-r from-[#0B3C5D] via-[#0E4A73] to-[#1565A0] text-white shadow-sm will-change-transform px-5 py-3">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5" />
        </div>
        <div className="relative flex items-center min-h-[40px] gap-0.5">
          <button
            onClick={handleBack}
            className="h-8 w-8 flex items-center justify-center text-white shrink-0 rounded-full hover:bg-white/15 transition-colors active:scale-95"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <h1 className="flex-1 text-base font-bold tracking-tight truncate ml-0.5 text-white">{title}</h1>
          {!hideSubmit && onSubmit && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onSubmit}
              disabled={submitDisabled || isSubmitting}
              className="shrink-0 h-6 px-2 text-[11px] bg-white/15 hover:bg-white/25 text-white border border-white/20 shadow-none font-semibold active:scale-95 transition-transform"
            >
              {isSubmitting ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : null}
              {submitLabel}
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 space-y-4">
          {children}
        </div>
      </div>
    </div>
  );

  if (reduced) {
    return content;
  }

  return (
    <motion.div
      initial={pageSlideIn.initial}
      animate={pageSlideIn.animate}
    >
      {content}
    </motion.div>
  );
}