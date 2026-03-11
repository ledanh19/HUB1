import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export type MobileBookingTab = "overview" | "allocation" | "services" | "payments" | "history";

const TAB_CONFIG: { id: MobileBookingTab; label: string }[] = [
  { id: "overview", label: "Tổng quan" },
  { id: "allocation", label: "Phân bổ" },
  { id: "services", label: "Dịch vụ" },
  { id: "payments", label: "Thanh toán" },
];

interface MobileBookingTabBarProps {
  activeTab: MobileBookingTab;
  onTabChange: (tab: MobileBookingTab) => void;
  counts?: Partial<Record<MobileBookingTab, number>>;
}

export function MobileBookingTabBar({ activeTab, onTabChange, counts }: MobileBookingTabBarProps) {
  const reduced = useReducedMotion();

  return (
    <div className="bg-background border-b border-border">
      <div className="grid grid-cols-4">
        {TAB_CONFIG.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = counts?.[tab.id];
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                // 44px min touch target
                "min-h-[44px] py-2.5 text-xs font-medium whitespace-nowrap transition-colors relative text-center",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "active:bg-muted/50",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <span className="flex items-center justify-center gap-1">
                {tab.label}
                {count != null && count > 0 && (
                  <span className={cn(
                    "inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-semibold",
                    isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    {count}
                  </span>
                )}
              </span>
              {isActive && (
                reduced ? (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-primary rounded-t-full" />
                ) : (
                  <motion.span
                    layoutId="activeTabIndicator"
                    className="absolute bottom-0 left-3 right-3 h-0.5 bg-primary rounded-t-full"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
