import { Menu, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { NotificationBell } from "./NotificationBell";
import roomriseLogo from "@/assets/roomrise-logo-navy.png";

interface MobileHeaderProps {
  onMenuClick: () => void;
}

export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-card border-b border-border flex items-center justify-between px-3 md:hidden pt-[env(safe-area-inset-top)] h-[calc(3.5rem+env(safe-area-inset-top))]">
      {/* Left: Menu + Logo */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="h-10 w-10 text-foreground hover:bg-muted"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2">
          <img
            src={roomriseLogo}
            alt="Roomrise"
            className="h-6 w-6 object-contain"
          />
          <span className="text-sm font-semibold text-foreground">Roomrise</span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-0.5">
        <NotificationBell />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="h-10 w-10 text-foreground hover:bg-muted"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </div>
    </header>
  );
}
