/**
 * Task Panel State Management
 * Zustand store for Trello-style side panel
 * 
 * KEY DECISIONS:
 * - Panel is THE workspace (no routing)
 * - Only ONE panel open at a time
 * - ESC / backdrop click to close
 * - Tab state persists while panel open
 */

import { create } from 'zustand';
import { PanelTab } from '@/lib/evidence-types';

// Tab constants for programmatic access
export const PANEL_TABS = {
  OVERVIEW: 'overview' as const,
  EVIDENCE: 'evidence' as const,
  COMMENTS: 'comments' as const,
  HISTORY: 'history' as const,
};

interface TaskPanelState {
  // State
  selectedTaskId: string | null;
  isOpen: boolean;
  activeTab: PanelTab;
  isClosing: boolean; // For animation
  
  // Actions
  openTask: (taskId: string, tab?: PanelTab) => void;
  closePanel: () => void;
  setActiveTab: (tab: PanelTab) => void;
  
  // Swap task without close animation (for clicking different task)
  swapTask: (taskId: string) => void;
}

export const useTaskPanel = create<TaskPanelState>((set, get) => ({
  // Initial state
  selectedTaskId: null,
  isOpen: false,
  activeTab: 'overview',
  isClosing: false,
  
  // Open panel with task
  openTask: (taskId, tab = 'overview') => {
    const { selectedTaskId, isOpen } = get();
    
    // If already open with different task, swap without animation
    if (isOpen && selectedTaskId !== taskId) {
      set({
        selectedTaskId: taskId,
        activeTab: tab,
      });
      return;
    }
    
    // Open fresh
    set({
      selectedTaskId: taskId,
      isOpen: true,
      activeTab: tab,
      isClosing: false,
    });
  },
  
  // Close panel with animation
  closePanel: () => {
    set({ isClosing: true });
    
    // Wait for animation then clear state
    setTimeout(() => {
      set({
        isOpen: false,
        isClosing: false,
        // Keep selectedTaskId for potential re-open
      });
    }, 300); // Match CSS transition duration
  },
  
  // Switch tab
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  // Swap to different task (no close animation)
  swapTask: (taskId) => {
    set({
      selectedTaskId: taskId,
      // Keep current tab
    });
  },
}));

// Selector hooks for performance
export const useSelectedTaskId = () => useTaskPanel((s) => s.selectedTaskId);
export const useIsPanelOpen = () => useTaskPanel((s) => s.isOpen);
export const useActiveTab = () => useTaskPanel((s) => s.activeTab);

// Actions (stable references)
export const taskPanelActions = {
  open: (taskId: string, tab?: PanelTab) => useTaskPanel.getState().openTask(taskId, tab),
  close: () => useTaskPanel.getState().closePanel(),
  setTab: (tab: PanelTab) => useTaskPanel.getState().setActiveTab(tab),
  swap: (taskId: string) => useTaskPanel.getState().swapTask(taskId),
};
