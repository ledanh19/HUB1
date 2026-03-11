import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LogOut, ChevronDown, ChevronLeft, ChevronRight, Settings } from "lucide-react";
import roomriseLogo from "@/assets/roomrise-logo-light.png";
import { useState, useMemo, useCallback, createContext, useContext } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentUserPagePermissions } from "@/hooks/useUserPagePermissions";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { navigation, sidebarBottomNavigation, roleLabels, type NavItem } from "@/constants/navigation";
import { preloadRoute } from "@/lib/lazyPage";
import { isHeavyRoute } from "@/lib/navigation/routeLoadingPolicy";
import { createNavigateWithPrefetch } from "@/lib/navigation/navigateHoldAndPrefetch";
import { useRouteTransition } from "@/contexts/RouteTransitionContext";

// Sidebar context for collapse state
interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType>({ collapsed: false, setCollapsed: () => { } });

export const useSidebar = () => useContext(SidebarContext);

interface SidebarProviderProps {
  children: React.ReactNode;
}

export function SidebarProvider({ children }: SidebarProviderProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, userRole, signOut } = useAuth();
  const { hasPageAccess, loading: permissionsLoading } = useCurrentUserPagePermissions();
  const [expandedItems, setExpandedItems] = useState<string[]>(["Booking Center"]);
  const { collapsed, setCollapsed } = useSidebar();

  // ── Route Transition: hold + prefetch for heavy routes ──
  const { actions } = useRouteTransition();
  const navWithPrefetch = useMemo(
    () => createNavigateWithPrefetch(navigate, actions),
    [navigate, actions]
  );

  // Filter navigation items based on user's page permissions
  const filterNavItems = useCallback((items: NavItem[]): NavItem[] => {
    return items
      .map(item => {
        // Super admin and admin can see everything
        if (userRole === 'super_admin' || userRole === 'admin') return item;

        // If item has children, filter children first
        if (item.children && item.children.length > 0) {
          const filteredChildren = item.children.filter(child => hasPageAccess(child.href));
          // Parent only shows if at least one child is accessible
          if (filteredChildren.length === 0) return null;
          return { ...item, children: filteredChildren };
        }

        // Leaf item - check direct access
        return hasPageAccess(item.href) ? item : null;
      })
      .filter((item): item is NavItem => item !== null);
  }, [userRole, hasPageAccess]);

  const filteredNavigation = useMemo(() => filterNavItems(navigation), [filterNavItems]);
  const filteredBottomNav = useMemo(() => filterNavItems(sidebarBottomNavigation), [filterNavItems]);

  const toggleExpand = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label)
        ? prev.filter((item) => item !== label)
        : [...prev, label]
    );
  };

  /**
   * Active-state logic:
   *  - Parent group (depth 0, has children): active if ANY child matches
   *  - Leaf child (depth > 0): exact match only, so "/host-payables" won't
   *    light up when the URL is "/host-payables/settlement"
   *  - Leaf root (depth 0, no children): startsWith for nested routes
   */
  const isActive = (href: string, hasChildren: boolean, depth: number) => {
    if (href === "/") return location.pathname === "/";
    if (hasChildren) {
      // Parent group: active if current path starts with any child href
      return location.pathname.startsWith(href);
    }
    if (depth > 0) {
      // Child leaf: exact match (with optional trailing slash)
      return location.pathname === href || location.pathname === href + "/";
    }
    // Root leaf (no children, depth 0): prefix match
    return location.pathname.startsWith(href);
  };

  const NavLink = ({ item, depth = 0 }: { item: NavItem; depth?: number }) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.label);
    const active = isActive(item.href, hasChildren, depth);

    const linkContent = (
      <Link
        to={hasChildren ? "#" : item.href}
        onMouseEnter={() => { if (!hasChildren) preloadRoute(item.href); }}
        onClick={(e) => {
          if (hasChildren) {
            e.preventDefault();
            toggleExpand(item.label);
          } else {
            // All routes: prevent Link navigation → hold current UI + prefetch
            e.preventDefault();
            navWithPrefetch(item.href);
          }
          // If collapsed and clicking an icon, expand sidebar
          if (collapsed && depth === 0) {
            setCollapsed(false);
          }
        }}
        className={cn(
          "group flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all duration-150",
          collapsed && depth === 0 ? "justify-center px-2" : "",
          // Child items: use left padding instead of margin to avoid background overflow
          depth > 0 && "pl-9 border-l-2 border-transparent ml-0",
          depth > 0 && active && "border-l-white",
          active && !hasChildren
            ? "bg-white/[0.12] text-white"
            : "text-white/70 hover:bg-white/[0.08] hover:text-white"
        )}
      >
        <item.icon
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-colors duration-150",
            active && !hasChildren
              ? "text-white"
              : "text-white/70 group-hover:text-white"
          )}
        />
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge && (
              <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-micro font-medium text-white">
                {item.badge}
              </span>
            )}
            {hasChildren && (
              <ChevronDown
                className={cn(
                  "h-3 w-3 text-white/40 transition-transform duration-200 ease-out",
                  isExpanded && "rotate-180"
                )}
              />
            )}
          </>
        )}
      </Link>
    );

    // Wrap in tooltip when collapsed
    const wrappedLink = collapsed && depth === 0 ? (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          {linkContent}
        </TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          {item.label}
        </TooltipContent>
      </Tooltip>
    ) : linkContent;

    return (
      <div>
        {wrappedLink}
        {hasChildren && !collapsed && (
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-200 ease-out",
              isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            )}
          >
            <div className="overflow-hidden">
              <div className="mt-0.5 space-y-0.5 pl-2">
                {item.children?.map((child, index) => (
                  <div
                    key={child.href}
                    className={cn(
                      "transition-opacity duration-150",
                      isExpanded ? "opacity-100" : "opacity-0"
                    )}
                    style={{ transitionDelay: isExpanded ? `${index * 20}ms` : "0ms" }}
                  >
                    <NavLink item={child} depth={depth + 1} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen flex-col transition-all duration-300 ease-in-out",
          "bg-[linear-gradient(180deg,#0F2D5C_0%,#0C2347_100%)]",
          collapsed ? "w-14" : "w-52"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "flex h-10 items-center border-b border-white/10",
          collapsed ? "justify-center px-2" : "gap-2 px-3"
        )}>
          <img
            src={roomriseLogo}
            alt="Roomrise Logo"
            className="h-7 w-7 object-contain brightness-0 invert"
          />
          {!collapsed && (
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-white">
                Roomrise
              </h1>
              <p className="text-micro uppercase tracking-widest text-white/50">
                Control Hub
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto scrollbar-sidebar px-2 py-3">
          {filteredNavigation.map((item) => (
            <NavLink key={item.label} item={item} />
          ))}
        </nav>

        {/* Bottom Navigation */}
        <div className="border-t border-white/10 px-2 py-2">
          {filteredBottomNav.map((item) => (
            <NavLink key={item.label} item={item} />
          ))}
          <button
            onClick={() => signOut()}
            className={cn(
              "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-medium text-white/60 transition-all hover:bg-white/[0.08] hover:text-white",
              collapsed && "justify-center px-2"
            )}
          >
            <LogOut className="h-3.5 w-3.5" />
            {!collapsed && <span>Đăng xuất</span>}
          </button>
        </div>

        {/* User Info */}
        {!collapsed && (
          <div className="border-t border-white/10 p-2.5">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-white/15 flex items-center justify-center text-[10px] font-semibold text-white">
                {user?.email?.substring(0, 2).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white/90 truncate">
                  {userRole ? (roleLabels[userRole] || userRole.replace('_', ' ').toUpperCase()) : 'User'}
                </p>
                <p className="text-micro text-white/50 truncate">{user?.email || 'Not logged in'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Collapse Toggle Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-14 h-6 w-6 rounded-full border border-border bg-white text-muted-foreground hover:bg-muted hover:text-foreground shadow-sm"
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </Button>
      </aside>
    </TooltipProvider>
  );
}
