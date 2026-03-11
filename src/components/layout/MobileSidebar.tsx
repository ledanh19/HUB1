import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LogOut, ChevronDown, X } from "lucide-react";
import roomriseLogo from "@/assets/roomrise-logo-light.png";
import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentUserPagePermissions } from "@/hooks/useUserPagePermissions";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { navigation, sidebarBottomNavigation, roleLabels, type NavItem } from "@/constants/navigation";

interface MobileSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileSidebar({ open, onOpenChange }: MobileSidebarProps) {
  const location = useLocation();
  const { user, userRole, signOut } = useAuth();
  const { hasPageAccess, loading: permissionsLoading } = useCurrentUserPagePermissions();
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const filterNavItems = (items: NavItem[]): NavItem[] => {
    return items
      .map(item => {
        if (userRole === 'super_admin') return item;

        if (item.children && item.children.length > 0) {
          const filteredChildren = item.children.filter(child => hasPageAccess(child.href));
          if (filteredChildren.length === 0) return null;
          return { ...item, children: filteredChildren };
        }

        return hasPageAccess(item.href) ? item : null;
      })
      .filter((item): item is NavItem => item !== null);
  };

  const filteredNavigation = useMemo(() => filterNavItems(navigation), [userRole, hasPageAccess, permissionsLoading]);
  const filteredBottomNav = useMemo(() => filterNavItems(sidebarBottomNavigation), [userRole, hasPageAccess, permissionsLoading]);

  const toggleExpand = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label)
        ? prev.filter((item) => item !== label)
        : [...prev, label]
    );
  };

  const isActive = (href: string, hasChildren: boolean, depth: number) => {
    if (href === "/") return location.pathname === "/";
    if (hasChildren) return location.pathname.startsWith(href);
    if (depth > 0) return location.pathname === href || location.pathname === href + "/";
    return location.pathname.startsWith(href);
  };

  const handleNavClick = (item: NavItem, hasChildren: boolean) => {
    if (hasChildren) {
      toggleExpand(item.label);
    } else {
      onOpenChange(false);
    }
  };

  const NavLink = ({ item, depth = 0 }: { item: NavItem; depth?: number }) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.label);
    const active = isActive(item.href, hasChildren, depth);

    return (
      <div>
        <Link
          to={hasChildren ? "#" : item.href}
          onClick={(e) => {
            if (hasChildren) {
              e.preventDefault();
            }
            handleNavClick(item, hasChildren);
          }}
          className={cn(
            "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
            depth > 0 && "ml-4 pl-4 border-l border-white/10",
            active && !hasChildren
              ? "bg-white/[0.12] text-white"
              : "text-white/70 hover:bg-white/[0.08] hover:text-white"
          )}
        >
          <item.icon
            className={cn(
              "h-5 w-5 shrink-0 transition-colors duration-150",
              active && !hasChildren
                ? "text-white"
                : "text-white/70 group-hover:text-white"
            )}
          />
          <span className="flex-1">{item.label}</span>
          {item.badge && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium text-white">
              {item.badge}
            </span>
          )}
          {hasChildren && (
            <ChevronDown
              className={cn(
                "h-4 w-4 text-white/40 transition-transform duration-200 ease-out",
                isExpanded && "rotate-180"
              )}
            />
          )}
        </Link>

        {hasChildren && (
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-200 ease-out",
              isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            )}
          >
            <div className="overflow-hidden">
              <div className="mt-1 space-y-1">
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[280px] p-0 bg-[linear-gradient(180deg,#0F2D5C_0%,#0C2347_100%)] border-white/10"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Menu điều hướng</SheetTitle>
        </SheetHeader>

        {/* Logo */}
        <div className="flex h-14 items-center gap-3 border-b border-white/10 px-4">
          <img
            src={roomriseLogo}
            alt="Roomrise Logo"
            className="h-8 w-8 object-contain brightness-0 invert"
          />
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-white">
              Roomrise
            </h1>
            <p className="text-micro uppercase tracking-widest text-white/50">
              Control Hub
            </p>
          </div>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 h-[calc(100vh-14rem)]">
          <nav className="space-y-1 px-3 py-4">
            {filteredNavigation.map((item) => (
              <NavLink key={item.label} item={item} />
            ))}

            {/* Cài đặt — Bottom Nav */}
            {filteredBottomNav.length > 0 && (
              <>
                <div className="my-3 border-t border-white/10" />
                {filteredBottomNav.map((item) => (
                  <NavLink key={item.label} item={item} />
                ))}
              </>
            )}
          </nav>
        </ScrollArea>

        {/* User Info & Logout */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-sidebar">
          <div className="p-3">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center text-sm font-semibold text-white">
                {user?.email?.substring(0, 2).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white/90 truncate">
                  {userRole ? (roleLabels[userRole] || userRole.replace('_', ' ').toUpperCase()) : 'User'}
                </p>
                <p className="text-xs text-white/50 truncate">{user?.email || 'Not logged in'}</p>
              </div>
            </div>

            <button
              onClick={() => {
                signOut();
                onOpenChange(false);
              }}
              className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/60 transition-all hover:bg-white/[0.08] hover:text-white"
            >
              <LogOut className="h-5 w-5" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
