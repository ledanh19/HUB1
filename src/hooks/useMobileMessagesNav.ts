import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useIsMobile } from './use-mobile';

export type MobileView = 'list' | 'thread' | 'context';

interface UseMobileMessagesNavReturn {
  /** Current view on mobile */
  currentView: MobileView;
  /** Whether we're on mobile viewport */
  isMobile: boolean;
  /** Selected conversation ID from URL */
  selectedConversationId: string | null;
  /** Context panel open state */
  isContextOpen: boolean;
  /** Navigate to conversation list */
  goToList: () => void;
  /** Navigate to thread view with conversation ID */
  goToThread: (conversationId: string) => void;
  /** Open context panel (bottom sheet on mobile) */
  openContext: () => void;
  /** Close context panel */
  closeContext: () => void;
  /** Toggle context panel */
  toggleContext: () => void;
  /** Set selected conversation and update URL */
  setSelectedConversation: (id: string | null) => void;
}

/**
 * Hook to manage mobile navigation state for Messages module.
 * Handles URL state, view transitions, and responsive behavior.
 * 
 * Mobile: 1-column layout with view switching
 * Desktop: 3-column layout with all views visible
 */
export function useMobileMessagesNav(): UseMobileMessagesNavReturn {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentView, setCurrentView] = useState<MobileView>('list');
  const [isContextOpen, setIsContextOpen] = useState(false);

  // Get conversation ID from URL
  // Canonical param: "c" (short for mobile-friendly URLs)
  // Backward compatibility: support legacy deep links like ?conversation=...
  const selectedConversationId = searchParams.get('c') || searchParams.get('conversation') || null;

  // Normalize legacy deep links to canonical "c" param
  useEffect(() => {
    const legacyConversationId = searchParams.get('conversation');
    const hasCanonical = !!searchParams.get('c');

    if (legacyConversationId && !hasCanonical) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('conversation');
      newParams.set('c', legacyConversationId);
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Sync view with URL on mobile
  useEffect(() => {
    if (isMobile) {
      if (selectedConversationId) {
        setCurrentView('thread');
      } else {
        setCurrentView('list');
      }
    }
  }, [isMobile, selectedConversationId]);

  // Navigate to list (clear conversation selection)
  const goToList = useCallback(() => {
    setCurrentView('list');
    setIsContextOpen(false);
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('c');
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Navigate to thread with conversation
  const goToThread = useCallback((conversationId: string) => {
    setCurrentView('thread');
    const newParams = new URLSearchParams(searchParams);
    newParams.set('c', conversationId);
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Context panel controls
  const openContext = useCallback(() => {
    setIsContextOpen(true);
    if (isMobile) {
      setCurrentView('context');
    }
  }, [isMobile]);

  const closeContext = useCallback(() => {
    setIsContextOpen(false);
    if (isMobile && selectedConversationId) {
      setCurrentView('thread');
    }
  }, [isMobile, selectedConversationId]);

  const toggleContext = useCallback(() => {
    if (isContextOpen) {
      closeContext();
    } else {
      openContext();
    }
  }, [isContextOpen, openContext, closeContext]);

  // Set selected conversation (used by ConversationList)
  const setSelectedConversation = useCallback((id: string | null) => {
    if (id) {
      goToThread(id);
    } else {
      goToList();
    }
  }, [goToThread, goToList]);

  // Handle browser back button on mobile
  useEffect(() => {
    if (!isMobile) return;

    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const newConversationId = params.get('c') || params.get('conversation');

      if (newConversationId) {
        setCurrentView('thread');
      } else {
        setCurrentView('list');
        setIsContextOpen(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isMobile]);

  return {
    currentView,
    isMobile,
    selectedConversationId,
    isContextOpen,
    goToList,
    goToThread,
    openContext,
    closeContext,
    toggleContext,
    setSelectedConversation,
  };
}
