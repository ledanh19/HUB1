import { Outlet, useLocation } from "react-router-dom";
import { Sidebar, SidebarProvider, useSidebar } from "./Sidebar";
import { useRealtimeSystem } from "@/hooks/useRealtimeSystem";
import { useForegroundPush } from "@/hooks/useForegroundPush";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./NotificationBell";
import { MobileSidebar } from "./MobileSidebar";
import { MobileHeader } from "./MobileHeader";
import { MobileBottomNav } from "./MobileBottomNav";
import { useIsMobile } from "@/hooks/use-mobile";
import { initUIDebug } from "@/lib/uiDebug";
import { RouteTransitionProvider } from "@/contexts/RouteTransitionContext";
import { TopRouteLoadingBar } from "@/components/system/TopRouteLoadingBar";
import { RouteTransitionOverlay } from "@/components/system/RouteTransitionOverlay";

/**
 * Layout shell — rendered ONCE at the layout-route level.
 * Sidebar, Header, NotificationBell, RealtimeSystem all stay mounted
 * across page navigations. Child pages render via <Outlet />.
 */
function MainLayoutContent() {
  const { theme, setTheme } = useTheme();
  const { collapsed } = useSidebar();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  // UI Debug Inspector — dev/staging only (?uiDebug=1 or VITE_UI_DEBUG=1)
  useEffect(() => {
    const cleanup = initUIDebug();
    return cleanup;
  }, []);

  // Initialize realtime system for the entire app — mounted ONCE
  const { isConnected } = useRealtimeSystem({
    showToasts: false,
    bufferUpdates: false,
  });

  // Initialize foreground push notifications (shows toast when app is open)
  useForegroundPush();

  useEffect(() => {
    if (isConnected) {
      console.log("[MainLayout] Realtime system connected");
    }
  }, [isConnected]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Full-bleed mobile pages: hide shell header/bottom-nav so the page controls its own chrome
  const isFullBleedMobilePage = isMobile && (
    ['/email/thread'].some((prefix) => location.pathname.startsWith(prefix)) ||
    // Messages thread view: when ?c= param present, MobileThreadHeader owns the chrome
    (location.pathname === '/ota-messages' && new URLSearchParams(location.search).has('c'))
  );

  // Pages that own their own scroll container (prevent double scrollbar)
  const isOwnScrollPage = isMobile && location.pathname.match(/^\/bookings\/[^/]+$/);

  // Email routes: full-bleed (no max-w cap), page owns its own scroll
  const isEmailRoute = location.pathname.startsWith('/email/inbox') || location.pathname.startsWith('/email/thread');

  /*
   * ══════════════════════════════════════════════════════════════
   * APP SHELL STRUCTURE
   * ──────────────────────────────────────────────────────────────
   * Root: h-screen overflow-hidden  (prevents body scrollbar)
   *   ├─ Sidebar       position:fixed, w-52/w-14
   *   ├─ Header        position:fixed, top
   *   └─ <main>        h-screen, ml-52, w-[calc(100%-13rem)]
   *       └─ content   flex-1 min-h-0
   *          └─ inner   (email: h-full | other: max-w-[1440])
   *             └─ <Outlet />
   *
   * Key: <main> has EXPLICIT width via calc(100% - sidebar),
   * NOT 100vw (which includes scrollbar gutter on Windows).
   * ══════════════════════════════════════════════════════════════
   */

  return (
    <div className="h-screen bg-background overflow-hidden">
      {/* ── Route Transition Loading Bar ── */}
      <TopRouteLoadingBar />

      {/* Desktop Sidebar — position:fixed, out of normal flow */}
      {!isMobile && <Sidebar />}

      {/* Mobile Header — hidden on full-bleed pages */}
      {isMobile && !isFullBleedMobilePage && (
        <MobileHeader onMenuClick={() => setMobileMenuOpen(true)} />
      )}

      {/* Mobile Sidebar Drawer */}
      {isMobile && (
        <MobileSidebar
          open={mobileMenuOpen}
          onOpenChange={setMobileMenuOpen}
        />
      )}

      {/* Desktop Top bar — position:fixed */}
      {!isMobile && (
        <header className={cn(
          "fixed top-0 right-0 z-40 h-10 bg-card border-b border-border flex items-center justify-end px-4 transition-all duration-300 overflow-visible",
          collapsed ? "left-14" : "left-52"
        )}>
          {/* Right actions */}
          <div className="flex items-center gap-1.5">
            <NotificationBell />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-8 w-8"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
          </div>
        </header>
      )}

      {/* ═══ MAIN CONTENT ═══
           Sidebar is position:fixed → out of flow.
           <main> needs explicit margin-left + width to stay
           within the visible area (right of sidebar, left of viewport edge).
           Using calc(100% - sidebar) is scrollbar-safe (unlike 100vw). */}
      <main className={cn(
        "h-screen flex flex-col transition-all duration-300",
        // Desktop: explicit margin + width = stable geometry
        !isMobile && (collapsed
          ? "ml-14 w-[calc(100%-3.5rem)]"
          : "ml-52 w-[calc(100%-13rem)]"
        ),
        // Desktop: account for top bar (h-10 = 40px)
        !isMobile && "pt-10",
        // Mobile: account for header + bottom nav
        isMobile && !isFullBleedMobilePage && "pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[calc(3.5rem+env(safe-area-inset-bottom))]"
      )}>
        <div className={cn(
          "flex-1 min-h-0",
          // Full-bleed, email, or own-scroll pages: no padding, no scroll — page owns its own layout
          (isFullBleedMobilePage || isEmailRoute || isOwnScrollPage)
            ? "overflow-hidden"
            : "overflow-y-auto overflow-x-hidden max-md:p-0 p-3 lg:p-4",
        )}>
          <div className={cn(
            // Non-full-bleed: centered at 1440px max
            !isEmailRoute && !isOwnScrollPage && !isFullBleedMobilePage && "max-w-[1440px] mx-auto w-full",
            // Full-height chain for pages owning their scroll
            (isFullBleedMobilePage || isEmailRoute || isOwnScrollPage) && "h-full",
            // Mobile padding adjustments (prevent double padding)
            isMobile && !isFullBleedMobilePage && !isEmailRoute && !isOwnScrollPage && "px-3 pt-0 pb-4",
            isMobile && (isFullBleedMobilePage || isOwnScrollPage) && "p-0"
          )}>
            <Outlet />
          </div>
        </div>
      </main>

      {/* ── Route Transition Overlay (timeout/error) ── */}
      <RouteTransitionOverlay />

      {/* Mobile Bottom Navigation — hidden on full-bleed pages */}
      {isMobile && !isFullBleedMobilePage && (
        <MobileBottomNav onMoreClick={() => setMobileMenuOpen(true)} />
      )}
    </div>
  );
}

export function MainLayout() {
  return (
    <SidebarProvider>
      <RouteTransitionProvider>
        <MainLayoutContent />
      </RouteTransitionProvider>
    </SidebarProvider>
  );
}
