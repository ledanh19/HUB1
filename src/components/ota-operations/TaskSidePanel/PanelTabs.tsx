/**
 * PanelTabs - Trello-style tab navigation
 * 
 * TABS:
 * - Tổng quan (Overview)
 * - Kết quả (Evidence)
 * - Bình luận (Comments)
 * - Lịch sử (History)
 * 
 * Style: Inline tabs with underline indicator
 */

import React from 'react';
import { useTaskPanel } from '@/hooks/useTaskPanel';
import { PANEL_TABS, PanelTab } from '@/lib/evidence-types';
import { cn } from '@/lib/utils';
import { FileText, Image, MessageSquare, History } from 'lucide-react';

interface TabBadgeProps {
  count?: number;
}

function TabBadge({ count }: TabBadgeProps) {
  if (!count || count === 0) return null;
  
  return (
    <span className="ml-1.5 px-1.5 py-0.5 text-micro font-medium bg-info/10 dark:bg-info text-info rounded-full">
      {count > 99 ? '99+' : count}
    </span>
  );
}

// Tab icons
const TAB_ICONS: Record<PanelTab, React.ComponentType<{ className?: string }>> = {
  overview: FileText,
  evidence: Image,
  comments: MessageSquare,
  history: History,
};

interface PanelTabsProps {
  // Optional counts for badges
  evidenceCount?: number;
  commentCount?: number;
}

export function PanelTabs({ evidenceCount, commentCount }: PanelTabsProps) {
  const { activeTab, setActiveTab } = useTaskPanel();
  
  const getTabBadge = (key: PanelTab): number | undefined => {
    switch (key) {
      case 'evidence':
        return evidenceCount;
      case 'comments':
        return commentCount;
      default:
        return undefined;
    }
  };
  
  return (
    <div className="flex gap-1 p-1 bg-muted dark:bg-muted rounded-lg" role="tablist" aria-label="Task sections">
      {PANEL_TABS.map(({ key, label }) => {
        const isActive = activeTab === key;
        const badgeCount = getTabBadge(key);
        const Icon = TAB_ICONS[key];
        
        return (
          <button
            key={key}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${key}`}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-all",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-white/50 dark:hover:bg-muted-foreground/50"
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
            <TabBadge count={badgeCount} />
          </button>
        );
      })}
    </div>
  );
}

export default PanelTabs;
