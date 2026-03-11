/**
 * Sprint C: Project Completion Status Indicator
 * 
 * Shows clear visual indicators about project readiness to close:
 * - Whether all tasks are DONE
 * - Whether HANDOVER task exists
 * - Whether HANDOVER task is completed
 * 
 * Lead can see at a glance: "Project này đã bàn giao xong chưa?"
 */

import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle, 
  AlertTriangle, 
  FileCheck, 
  AlertCircle,
  Plus,
} from 'lucide-react';
import { OtaRoleGate } from '@/components/ui/OtaRoleGate';

interface TaskStats {
  total: number;
  done: number;
  cancelled?: number;
  in_progress: number;
  todo: number;
  blocked: number;
  review: number;
}

interface Task {
  id: string;
  title: string;
  status: string;
  classification?: string;
}

interface ProjectCompletionStatusProps {
  tasks: Task[];
  taskStats: TaskStats;
  projectStatus: string;
  onMarkComplete: () => void;
  onCreateHandover: () => void;
}

export function ProjectCompletionStatus({
  tasks,
  taskStats,
  projectStatus,
  onMarkComplete,
  onCreateHandover,
}: ProjectCompletionStatusProps) {
  // Skip if project already completed/archived
  if (projectStatus === 'COMPLETED' || projectStatus === 'ARCHIVED') {
    return null;
  }
  
  // Skip if no tasks
  if (taskStats.total === 0) {
    return null;
  }
  
  // Calculate completion state
  const totalCompleted = taskStats.done + (taskStats.cancelled || 0);
  const allTasksDone = totalCompleted === taskStats.total;
  
  // Find HANDOVER task (by title pattern + classification)
  const handoverTask = tasks.find(t => 
    t.title.toUpperCase().includes('[HANDOVER]') || 
    (t.classification === 'OPS' && t.title.toLowerCase().includes('bàn giao'))
  );
  
  const hasHandoverTask = !!handoverTask;
  const handoverDone = handoverTask?.status === 'DONE';
  
  // Determine state
  type CompletionState = 'NOT_READY' | 'MISSING_HANDOVER' | 'HANDOVER_PENDING' | 'READY_TO_CLOSE';
  
  let state: CompletionState = 'NOT_READY';
  
  if (!allTasksDone) {
    state = 'NOT_READY';
  } else if (!hasHandoverTask) {
    state = 'MISSING_HANDOVER';
  } else if (!handoverDone) {
    state = 'HANDOVER_PENDING';
  } else {
    state = 'READY_TO_CLOSE';
  }
  
  // Render based on state
  switch (state) {
    case 'NOT_READY':
      // Don't show anything if tasks are still in progress
      return null;
      
    case 'MISSING_HANDOVER':
      return (
        <Alert className="bg-warning/10 border-warning/20">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertTitle className="text-warning">
            Tất cả task đã DONE nhưng chưa có task HANDOVER
          </AlertTitle>
          <AlertDescription className="text-warning">
            <p className="mb-2">
              Cần tạo task <strong>[HANDOVER]</strong> để chuẩn hóa việc bàn giao project.
            </p>
            <OtaRoleGate requireRole={["ota_lead", "admin", "super_admin"]}>
              <Button 
                variant="outline" 
                size="sm" 
                className="bg-warning/10 hover:bg-warning/10 border-warning/20 text-warning"
                onClick={onCreateHandover}
              >
                <Plus className="mr-2 h-4 w-4" />
                Tạo task HANDOVER
              </Button>
            </OtaRoleGate>
          </AlertDescription>
        </Alert>
      );
      
    case 'HANDOVER_PENDING':
      return (
        <Alert className="bg-info/10 border-info/20">
          <FileCheck className="h-4 w-4 text-info" />
          <AlertTitle className="text-info">
            Task HANDOVER chưa hoàn thành
          </AlertTitle>
          <AlertDescription className="text-info">
            <p>
              Đã có task HANDOVER: <strong>{handoverTask?.title}</strong>
            </p>
            <p className="text-sm mt-1">
              Hoàn thành task HANDOVER (upload evidence + đánh dấu DONE) trước khi đóng project.
            </p>
          </AlertDescription>
        </Alert>
      );
      
    case 'READY_TO_CLOSE':
      return (
        <Alert className="bg-success/10 border-success/20">
          <CheckCircle className="h-4 w-4 text-success" />
          <AlertTitle className="text-success flex items-center gap-2">
            <span>✅ Có task HANDOVER và đã DONE</span>
          </AlertTitle>
          <AlertDescription className="text-success">
            <p className="mb-2">
              Project này đã sẵn sàng để đóng. Tất cả công việc và bàn giao đã hoàn thành.
            </p>
            <OtaRoleGate requireRole={["ota_lead", "admin", "super_admin"]}>
              <Button 
                variant="outline" 
                size="sm" 
                className="bg-success/10 hover:bg-success/20 border-success/20 text-success"
                onClick={onMarkComplete}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Đánh dấu hoàn thành Project
              </Button>
            </OtaRoleGate>
          </AlertDescription>
        </Alert>
      );
      
    default:
      return null;
  }
}
