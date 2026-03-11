import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { MoreHorizontal } from "lucide-react";
import { mobileBottomNavItems } from "@/constants/navigation";

interface MobileBottomNavProps {
  onMoreClick: () => void;
}

export function MobileBottomNav({ onMoreClick }: MobileBottomNavProps) {
  const location = useLocation();

  const isActive = (item: typeof mobileBottomNavItems[0]) => {
    if (item.href === "/") return location.pathname === "/";

    if (item.matchPaths) {
      return item.matchPaths.some(path => location.pathname.startsWith(path));
    }

    return location.pathname.startsWith(item.href);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-background border-t border-border md:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-14 px-1">
        {mobileBottomNavItems.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-1.5 px-2 rounded-lg transition-colors flex-1 max-w-[72px]",
                active
                  ? "text-primary"
                  : "text-muted-foreground active:bg-muted"
              )}
            >
              <item.icon className={cn("h-5 w-5", active && "text-primary")} />
              <span className="text-micro font-medium leading-tight">{item.label}</span>
            </Link>
          );
        })}

        {/* More Button */}
        <button
          onClick={onMoreClick}
          className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-2 rounded-lg transition-colors flex-1 max-w-[72px] text-muted-foreground active:bg-muted"
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="text-micro font-medium leading-tight">Thêm</span>
        </button>
      </div>
    </nav>
  );
}
