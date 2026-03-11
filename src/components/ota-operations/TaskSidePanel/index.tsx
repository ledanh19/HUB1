/**
 * TaskSidePanel - Trello-style CENTER MODAL
 * 
 * BEHAVIOR:
 * - CENTER MODAL (not side panel) - exactly like Trello
 * - Cover image at top of modal
 * - 2-column layout: Main content (left) + Activity (right)
 * - Click backdrop to close
 * - ESC to close
 * - Tab switching is local state (no route)
 * - Smooth scale + fade animation like Trello
 */

import React, { useEffect, useCallback, useState } from 'react';
import { X, Maximize2, CreditCard, Tag, CheckSquare, Paperclip, Image as ImageIcon, Users } from 'lucide-react';
import { useTaskPanel } from '@/hooks/useTaskPanel';
import { useOtaTaskDetail, useTaskEvidence, useTaskTodos } from '@/hooks/useOtaOperations';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { PanelHeader } from './PanelHeader';
import { PanelTabs } from './PanelTabs';
import { OverviewTab } from './tabs/OverviewTab';
import { EvidenceTab } from './tabs/EvidenceTab';
import { CommentsTab } from './tabs/CommentsTab';
import { HistoryTab } from './tabs/HistoryTab';
import { TodoSection } from './TodoSection';

export function TaskSidePanel() {
  const { selectedTaskId, isOpen, isClosing, activeTab, closePanel, setActiveTab } = useTaskPanel();
  const { data: taskResponse, isLoading } = useOtaTaskDetail(selectedTaskId || undefined);
  const [showTodos, setShowTodos] = useState(false);

  // Extract task from response and flatten assignee info for OverviewTab
  const rawTask = taskResponse?.task;
  const task = rawTask ? {
    ...rawTask,
    // Flatten assignee object to top-level fields expected by OverviewTab
    assignee_id: rawTask.assignee?.id || rawTask.assignee_id || null,
    assignee_name: rawTask.assignee?.full_name || rawTask.assignee_name || null,
    assignee_email: rawTask.assignee?.email || rawTask.assignee_email || null,
    // Flatten created_by_info for audit trail
    created_by: rawTask.created_by_info?.id || rawTask.created_by || null,
    created_by_name: rawTask.created_by_info?.full_name || rawTask.created_by_name || null,
    created_by_email: rawTask.created_by_info?.email || rawTask.created_by_email || null,
  } : null;

  // Sprint C: Check if project is completed (read-only mode)
  const projectStatus = taskResponse?.project?.status;
  const isReadOnly = projectStatus === 'COMPLETED' || projectStatus === 'ARCHIVED';

  // Fetch evidence for cover image
  const { data: evidenceData } = useTaskEvidence(rawTask?.id || '');

  // Get first image as cover - check mime_type starts with 'image/'
  const coverImage = evidenceData?.evidence?.find(e => e.mime_type?.startsWith('image/'))?.file_url;

  // ESC to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isClosing) {
        closePanel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isClosing, closePanel]);

  // Prevent body scroll when panel open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Backdrop click handler
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isClosing) {
      closePanel();
    }
  }, [closePanel, isClosing]);

  // Don't render if no task selected
  if (!selectedTaskId) return null;

  const shouldShow = isOpen || isClosing;

  return (
    <>
      {/* Backdrop - Trello style dark overlay */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-50 transition-opacity duration-200",
          shouldShow && !isClosing ? "opacity-100" : "opacity-0",
          !shouldShow && "pointer-events-none"
        )}
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* CENTER MODAL - Trello style - WIDER */}
      <div
        className={cn(
          "fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto py-8 px-4",
          !shouldShow && "pointer-events-none"
        )}
        onClick={handleBackdropClick}
      >
        <div
          className={cn(
            "relative w-full max-w-[1100px] bg-muted rounded-xl shadow-2xl",
            "transform transition-all duration-200 ease-out",
            shouldShow && !isClosing
              ? "opacity-100 scale-100 translate-y-0"
              : "opacity-0 scale-95 -translate-y-4"
          )}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button - top right corner */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 z-20 h-8 w-8 rounded-full bg-white/80 hover:bg-white dark:bg-muted dark:hover:bg-muted-foreground shadow-sm"
            onClick={closePanel}
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Cover Image - Trello style - taller */}
          {coverImage && (
            <div className="relative h-36 sm:h-44 w-full rounded-t-xl overflow-hidden bg-gradient-to-br from-info to-primary">
              <img
                src={coverImage}
                alt="Cover"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            </div>
          )}

          {/* No cover - show colored header bar */}
          {!coverImage && !isLoading && (
            <div className="h-3 w-full rounded-t-xl bg-gradient-to-r from-info to-info" />
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="p-6 space-y-4">
              <Skeleton className="h-36 w-full rounded-t-xl" />
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <div className="grid grid-cols-[1fr,280px] gap-6 mt-6">
                <div className="space-y-4">
                  <Skeleton className="h-40 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
            </div>
          )}

          {/* Content - Trello 2-column layout */}
          {task && !isLoading && (
            <div className="p-5 sm:p-6">
              {/* Sprint C: Read-only banner for COMPLETED projects */}
              {isReadOnly && (
                <div className="mb-4 px-3 py-2 bg-warning/10 dark:bg-warning/10 border border-warning/20 rounded-lg">
                  <div className="flex items-center gap-2 text-warning dark:text-warning">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                    <span className="text-sm font-medium">
                      Project đã {projectStatus === 'COMPLETED' ? 'hoàn thành' : 'lưu trữ'} - Chế độ chỉ xem
                    </span>
                  </div>
                </div>
              )}

              {/* Header with title + status */}
              <PanelHeader task={task as any} readOnly={isReadOnly} />

              {/* Quick action buttons - Trello style */}
              <div className="flex flex-wrap items-center gap-2 mt-4 mb-5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 bg-white dark:bg-muted border-border"
                  onClick={() => setActiveTab('evidence')}
                  disabled={isReadOnly}
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  Đính kèm
                </Button>
                {/* Nhãn - hidden: no backend support yet */}
                {/* 
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 gap-1.5 bg-white dark:bg-muted border-border"
                  disabled
                  title="Tính năng đang phát triển"
                >
                  <Tag className="h-3.5 w-3.5" />
                  Nhãn
                </Button>
                */}
                <Button
                  variant={showTodos ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-8 gap-1.5 border-border",
                    showTodos
                      ? "bg-primary text-primary-foreground"
                      : "bg-white dark:bg-muted"
                  )}
                  onClick={() => setShowTodos(!showTodos)}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  Việc cần làm
                </Button>
                {/* Thành viên - hidden: use assignee dropdown in OverviewTab */}
                {/*
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 gap-1.5 bg-white dark:bg-muted border-border"
                >
                  <Users className="h-3.5 w-3.5" />
                  Thành viên
                </Button>
                */}
              </div>

              {/* Todo Section - collapsible inline */}
              {showTodos && (
                <div className="mb-5 p-4 bg-white dark:bg-muted rounded-lg shadow-sm border">
                  <TodoSection taskId={task.id} readOnly={isReadOnly} />
                </div>
              )}

              {/* 2-column layout like Trello - Fixed height with internal scroll */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr,340px] gap-5 lg:gap-6">
                {/* LEFT: Main Content - with internal scroll */}
                <div className="min-w-0 flex flex-col">
                  {/* Tabs - fixed */}
                  <PanelTabs />

                  {/* Tab Content - scrollable */}
                  <div className="mt-4 bg-white dark:bg-muted rounded-lg shadow-sm flex-1 overflow-hidden">
                    <div className="h-[450px] overflow-y-auto">
                      {activeTab === 'overview' && <OverviewTab task={task as any} readOnly={isReadOnly} />}
                      {activeTab === 'evidence' && <EvidenceTab taskId={task.id} readOnly={isReadOnly} />}
                      {activeTab === 'comments' && <CommentsTab taskId={task.id} />}
                      {activeTab === 'history' && <HistoryTab taskId={task.id} />}
                    </div>
                  </div>
                </div>

                {/* RIGHT: Sidebar + Activity/Comments - Trello style */}
                <div className="hidden lg:flex lg:flex-col gap-4">
                  {/* Add to card section - compact */}
                  <div className="bg-white dark:bg-muted rounded-lg p-3 shadow-sm">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Thêm vào thẻ
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 gap-1.5 bg-muted hover:bg-muted dark:hover:bg-muted-foreground"
                        onClick={() => setActiveTab('evidence')}
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        Ảnh bìa
                      </Button>
                      <Button
                        variant={showTodos ? "default" : "secondary"}
                        size="sm"
                        className={cn(
                          "h-8 gap-1.5",
                          showTodos
                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                            : "bg-muted hover:bg-muted dark:hover:bg-muted-foreground"
                        )}
                        onClick={() => setShowTodos(!showTodos)}
                      >
                        <CheckSquare className="h-3.5 w-3.5" />
                        Việc cần làm
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 gap-1.5 bg-muted hover:bg-muted dark:hover:bg-muted-foreground"
                        onClick={() => setActiveTab('evidence')}
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        Đính kèm
                      </Button>
                    </div>
                  </div>

                  {/* Actions section - compact */}
                  <div className="bg-white dark:bg-muted rounded-lg p-3 shadow-sm">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Thao tác
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 gap-1.5 bg-muted hover:bg-muted dark:hover:bg-muted-foreground"
                      onClick={() => {
                        if (task) {
                          window.open(`/ota-operations/tasks/${task.id}`, '_blank');
                        }
                      }}
                    >
                      <Maximize2 className="h-4 w-4" />
                      Mở rộng
                    </Button>
                  </div>

                  {/* Comments Section - Trello style, scrollable */}
                  <div className="bg-white dark:bg-muted rounded-lg shadow-sm flex-1 flex flex-col overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                        </svg>
                        Nhận xét và hoạt động
                      </p>
                    </div>
                    <div className="flex-1 overflow-y-auto max-h-[280px]">
                      <CommentsTab taskId={task.id} compact />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error state */}
          {!task && !isLoading && selectedTaskId && (
            <div className="p-12 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <p>Không tìm thấy task</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={closePanel}>
                  Đóng
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default TaskSidePanel;
