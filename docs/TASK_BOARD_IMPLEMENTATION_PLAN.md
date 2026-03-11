# Task Board Implementation Plan
## Side Panel Architecture

---

## 1. New File Structure

```
src/
├── components/
│   └── ota-operations/
│       ├── TaskCard.tsx              # MODIFY - Simplify
│       ├── TaskSidePanel/
│       │   ├── index.tsx             # NEW - Main container
│       │   ├── PanelHeader.tsx       # NEW
│       │   ├── PanelTabs.tsx         # NEW
│       │   └── tabs/
│       │       ├── OverviewTab.tsx   # NEW
│       │       ├── EvidenceTab.tsx   # NEW
│       │       ├── CommentsTab.tsx   # NEW
│       │       └── HistoryTab.tsx    # NEW
│       ├── EvidenceCard.tsx          # NEW
│       ├── EvidenceUploader.tsx      # NEW
│       ├── FilePreview.tsx           # NEW
│       ├── CommentItem.tsx           # NEW
│       └── CommentInput.tsx          # NEW
├── hooks/
│   ├── useTaskPanel.ts               # NEW - Panel state
│   ├── useEvidence.ts                # NEW - Evidence CRUD
│   └── useComments.ts                # NEW - Comments CRUD
└── lib/
    └── evidence-types.ts             # NEW - Types
```

---

## 2. Types Definition

### evidence-types.ts
```typescript
// src/lib/evidence-types.ts

export type EvidenceStatus = 'pending' | 'approved' | 'rejected';

export interface Evidence {
  id: string;
  task_id: string;
  file_name: string;
  file_url: string;
  file_type: 'image' | 'pdf' | 'document' | 'other';
  file_size: number;
  thumbnail_url?: string;
  status: EvidenceStatus;
  uploaded_by: string;
  uploaded_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  content: string;
  attachments: CommentAttachment[];
  author_id: string;
  author_name: string;
  author_avatar?: string;
  created_at: string;
  updated_at?: string;
  is_deleted: boolean;
}

export interface CommentAttachment {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  thumbnail_url?: string;
}

export interface TaskHistoryEvent {
  id: string;
  task_id: string;
  event_type: 
    | 'created' 
    | 'status_changed' 
    | 'assigned' 
    | 'evidence_uploaded'
    | 'evidence_approved'
    | 'evidence_rejected'
    | 'comment_added';
  description: string;
  actor_id: string;
  actor_name: string;
  created_at: string;
  metadata?: Record<string, any>;
}

export type PanelTab = 'overview' | 'evidence' | 'comments' | 'history';

export interface TaskPanelState {
  selectedTaskId: string | null;
  isOpen: boolean;
  activeTab: PanelTab;
}
```

---

## 3. Panel State Hook

### useTaskPanel.ts
```typescript
// src/hooks/useTaskPanel.ts
import { create } from 'zustand';
import { PanelTab } from '@/lib/evidence-types';

interface TaskPanelStore {
  selectedTaskId: string | null;
  isOpen: boolean;
  activeTab: PanelTab;
  
  openTask: (taskId: string, tab?: PanelTab) => void;
  closePanel: () => void;
  setActiveTab: (tab: PanelTab) => void;
}

export const useTaskPanel = create<TaskPanelStore>((set) => ({
  selectedTaskId: null,
  isOpen: false,
  activeTab: 'overview',
  
  openTask: (taskId, tab = 'overview') => set({
    selectedTaskId: taskId,
    isOpen: true,
    activeTab: tab,
  }),
  
  closePanel: () => set({
    isOpen: false,
    // Keep selectedTaskId for animation
  }),
  
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
```

---

## 4. Component Implementations

### TaskSidePanel/index.tsx
```typescript
// src/components/ota-operations/TaskSidePanel/index.tsx
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useTaskPanel } from '@/hooks/useTaskPanel';
import { useTask } from '@/hooks/useTasks';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PanelHeader } from './PanelHeader';
import { PanelTabs } from './PanelTabs';
import { OverviewTab } from './tabs/OverviewTab';
import { EvidenceTab } from './tabs/EvidenceTab';
import { CommentsTab } from './tabs/CommentsTab';
import { HistoryTab } from './tabs/HistoryTab';

export function TaskSidePanel() {
  const { selectedTaskId, isOpen, activeTab, closePanel } = useTaskPanel();
  const { data: task } = useTask(selectedTaskId);
  
  // Close on ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closePanel();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, closePanel]);
  
  // Close on click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closePanel();
    }
  };
  
  if (!selectedTaskId) return null;
  
  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/20 z-40 transition-opacity",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={handleBackdropClick}
      />
      
      {/* Panel */}
      <div
        className={cn(
          "fixed right-0 top-0 h-full w-[480px] bg-background border-l shadow-xl z-50",
          "transform transition-transform duration-300 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4 z-10"
          onClick={closePanel}
        >
          <X className="h-4 w-4" />
        </Button>
        
        {task && (
          <div className="h-full flex flex-col">
            {/* Header */}
            <PanelHeader task={task} />
            
            {/* Tabs */}
            <PanelTabs />
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'overview' && <OverviewTab task={task} />}
              {activeTab === 'evidence' && <EvidenceTab taskId={task.id} />}
              {activeTab === 'comments' && <CommentsTab taskId={task.id} />}
              {activeTab === 'history' && <HistoryTab taskId={task.id} />}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
```

### PanelHeader.tsx
```typescript
// src/components/ota-operations/TaskSidePanel/PanelHeader.tsx
import React from 'react';
import { Calendar, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatRelativeTime } from '@/lib/utils';
import { OpsTask, TASK_STATUS_CONFIG } from '@/lib/otaOps';

interface PanelHeaderProps {
  task: OpsTask;
}

export function PanelHeader({ task }: PanelHeaderProps) {
  const statusConfig = TASK_STATUS_CONFIG[task.status];
  
  return (
    <div className="p-4 border-b space-y-3">
      {/* Title */}
      <h2 className="text-lg font-semibold pr-8 line-clamp-2">
        {task.title}
      </h2>
      
      {/* Status & Deadline row */}
      <div className="flex items-center gap-3">
        {/* Status dropdown */}
        <Select defaultValue={task.status}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TASK_STATUS_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* Deadline */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>{formatRelativeTime(task.deadline)}</span>
        </div>
      </div>
      
      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button size="sm">
          Hoàn thành
        </Button>
        <Button variant="outline" size="sm">
          Gán lại
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Đổi deadline</DropdownMenuItem>
            <DropdownMenuItem>Đổi ưu tiên</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              Hủy task
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
```

### PanelTabs.tsx
```typescript
// src/components/ota-operations/TaskSidePanel/PanelTabs.tsx
import React from 'react';
import { cn } from '@/lib/utils';
import { useTaskPanel } from '@/hooks/useTaskPanel';
import { PanelTab } from '@/lib/evidence-types';

const TABS: { key: PanelTab; label: string }[] = [
  { key: 'overview', label: 'Tổng quan' },
  { key: 'evidence', label: 'Kết quả' },
  { key: 'comments', label: 'Bình luận' },
  { key: 'history', label: 'Lịch sử' },
];

export function PanelTabs() {
  const { activeTab, setActiveTab } = useTaskPanel();
  
  return (
    <div className="border-b">
      <div className="flex">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex-1 px-4 py-2.5 text-sm font-medium transition-colors",
              "border-b-2 -mb-[1px]",
              activeTab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### EvidenceTab.tsx
```typescript
// src/components/ota-operations/TaskSidePanel/tabs/EvidenceTab.tsx
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useEvidence } from '@/hooks/useEvidence';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EvidenceCard } from '../../EvidenceCard';
import { EvidenceUploader } from '../../EvidenceUploader';

interface EvidenceTabProps {
  taskId: string;
}

export function EvidenceTab({ taskId }: EvidenceTabProps) {
  const { data: evidenceList = [], isLoading } = useEvidence(taskId);
  
  const hasApproved = evidenceList.some(e => e.status === 'approved');
  
  return (
    <div className="space-y-4">
      {/* Warning if no approved evidence */}
      {!hasApproved && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Cần ít nhất 1 minh chứng được duyệt để hoàn thành task này
          </AlertDescription>
        </Alert>
      )}
      
      {/* Evidence list */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          Minh chứng ({evidenceList.length})
        </h3>
        
        {evidenceList.map((evidence) => (
          <EvidenceCard key={evidence.id} evidence={evidence} />
        ))}
        
        {evidenceList.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Chưa có minh chứng nào
          </p>
        )}
      </div>
      
      {/* Uploader */}
      <EvidenceUploader taskId={taskId} />
    </div>
  );
}
```

### EvidenceCard.tsx
```typescript
// src/components/ota-operations/EvidenceCard.tsx
import React, { useState } from 'react';
import { Check, X, MessageSquare, FileText, Image as ImageIcon } from 'lucide-react';
import { Evidence } from '@/lib/evidence-types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FilePreview } from './FilePreview';
import { formatRelativeTime } from '@/lib/utils';

interface EvidenceCardProps {
  evidence: Evidence;
  canReview?: boolean;
  onApprove?: () => void;
  onReject?: (reason: string) => void;
}

const STATUS_CONFIG = {
  pending: { label: 'Chờ duyệt', variant: 'outline' as const },
  approved: { label: 'Đã duyệt', variant: 'success' as const },
  rejected: { label: 'Từ chối', variant: 'destructive' as const },
};

export function EvidenceCard({ 
  evidence, 
  canReview = true,
  onApprove,
  onReject,
}: EvidenceCardProps) {
  const [showPreview, setShowPreview] = useState(false);
  const statusConfig = STATUS_CONFIG[evidence.status];
  
  const FileIcon = evidence.file_type === 'image' ? ImageIcon : FileText;
  
  return (
    <div className="border rounded-lg p-3 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">
            {evidence.file_name}
          </span>
        </div>
        <Badge variant={statusConfig.variant}>
          {statusConfig.label}
        </Badge>
      </div>
      
      {/* Preview */}
      <div 
        className="cursor-pointer"
        onClick={() => setShowPreview(true)}
      >
        {evidence.file_type === 'image' && evidence.thumbnail_url ? (
          <img
            src={evidence.thumbnail_url}
            alt={evidence.file_name}
            className="w-full h-32 object-cover rounded border"
          />
        ) : (
          <div className="w-full h-32 bg-muted rounded border flex items-center justify-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        <p className="text-xs text-muted-foreground text-center mt-1">
          Click để xem chi tiết
        </p>
      </div>
      
      {/* Meta */}
      <p className="text-xs text-muted-foreground">
        Uploaded bởi {evidence.uploaded_by} • {formatRelativeTime(evidence.uploaded_at)}
      </p>
      
      {/* Review info */}
      {evidence.reviewed_by && (
        <p className="text-xs text-muted-foreground">
          {evidence.status === 'approved' ? 'Duyệt' : 'Từ chối'} bởi {evidence.reviewed_by} • {formatRelativeTime(evidence.reviewed_at!)}
        </p>
      )}
      
      {/* Rejection reason */}
      {evidence.status === 'rejected' && evidence.rejection_reason && (
        <p className="text-xs text-destructive">
          Lý do: {evidence.rejection_reason}
        </p>
      )}
      
      {/* Actions */}
      {evidence.status === 'pending' && canReview && (
        <div className="flex gap-2 pt-2 border-t">
          <Button size="sm" variant="outline" className="flex-1" onClick={onApprove}>
            <Check className="h-3 w-3 mr-1" />
            Duyệt
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={() => onReject?.('')}>
            <X className="h-3 w-3 mr-1" />
            Từ chối
          </Button>
          <Button size="sm" variant="ghost" className="px-2">
            <MessageSquare className="h-3 w-3" />
          </Button>
        </div>
      )}
      
      {/* Lightbox */}
      {showPreview && (
        <FilePreview
          fileUrl={evidence.file_url}
          fileType={evidence.file_type}
          fileName={evidence.file_name}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}
```

### EvidenceUploader.tsx
```typescript
// src/components/ota-operations/EvidenceUploader.tsx
import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useUploadEvidence } from '@/hooks/useEvidence';

interface EvidenceUploaderProps {
  taskId: string;
}

const ACCEPTED_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/pdf': ['.pdf'],
};

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function EvidenceUploader({ taskId }: EvidenceUploaderProps) {
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);
  const { mutate: uploadEvidence, isPending } = useUploadEvidence();
  
  const onDrop = useCallback((acceptedFiles: File[]) => {
    setUploadQueue(prev => [...prev, ...acceptedFiles]);
    
    // Upload each file
    acceptedFiles.forEach(file => {
      uploadEvidence(
        { taskId, file },
        {
          onSuccess: () => {
            setUploadQueue(prev => prev.filter(f => f !== file));
          },
        }
      );
    });
  }, [taskId, uploadEvidence]);
  
  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    multiple: true,
  });
  
  return (
    <div className="space-y-3">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer",
          "transition-colors",
          isDragActive 
            ? "border-primary bg-primary/5" 
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        )}
      >
        <input {...getInputProps()} />
        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm font-medium">Tải lên minh chứng</p>
        <p className="text-xs text-muted-foreground mt-1">
          Drag & drop hoặc click để chọn file
        </p>
        <p className="text-xs text-muted-foreground">
          Hỗ trợ: JPG, PNG, PDF (tối đa 10MB)
        </p>
      </div>
      
      {/* Errors */}
      {fileRejections.length > 0 && (
        <div className="text-sm text-destructive">
          {fileRejections.map(({ file, errors }) => (
            <p key={file.name}>
              {file.name}: {errors.map(e => e.message).join(', ')}
            </p>
          ))}
        </div>
      )}
      
      {/* Upload queue */}
      {uploadQueue.length > 0 && (
        <div className="space-y-2">
          {uploadQueue.map((file, i) => (
            <div key={i} className="flex items-center gap-2 p-2 bg-muted rounded">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm flex-1 truncate">{file.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setUploadQueue(prev => prev.filter((_, idx) => idx !== i))}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### FilePreview.tsx (Lightbox)
```typescript
// src/components/ota-operations/FilePreview.tsx
import React from 'react';
import { X, Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FilePreviewProps {
  fileUrl: string;
  fileType: 'image' | 'pdf' | 'document' | 'other';
  fileName: string;
  onClose: () => void;
}

export function FilePreview({ fileUrl, fileType, fileName, onClose }: FilePreviewProps) {
  return (
    <div 
      className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Toolbar */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <Button variant="secondary" size="sm" asChild>
          <a href={fileUrl} download={fileName}>
            <Download className="h-4 w-4 mr-1" />
            Tải xuống
          </a>
        </Button>
        <Button variant="secondary" size="sm" asChild>
          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-1" />
            Mở tab mới
          </a>
        </Button>
        <Button variant="secondary" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Content */}
      <div 
        className="max-w-4xl max-h-[80vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        {fileType === 'image' ? (
          <img
            src={fileUrl}
            alt={fileName}
            className="max-w-full max-h-[80vh] object-contain"
          />
        ) : fileType === 'pdf' ? (
          <iframe
            src={fileUrl}
            title={fileName}
            className="w-[800px] h-[80vh] bg-white"
          />
        ) : (
          <div className="bg-white p-8 rounded text-center">
            <p className="text-lg font-medium mb-2">{fileName}</p>
            <p className="text-muted-foreground mb-4">
              Không thể preview file này
            </p>
            <Button asChild>
              <a href={fileUrl} download={fileName}>
                <Download className="h-4 w-4 mr-2" />
                Tải xuống
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 5. Integration with Board

### Update OTAOperationsPage.tsx
```typescript
// Add to existing page
import { TaskSidePanel } from '@/components/ota-operations/TaskSidePanel';

export default function OTAOperationsPage() {
  return (
    <div className="...">
      {/* Existing board content */}
      <BoardColumns ... />
      
      {/* Add Side Panel */}
      <TaskSidePanel />
    </div>
  );
}
```

### Update TaskCard.tsx
```typescript
// Replace navigation with panel open
import { useTaskPanel } from '@/hooks/useTaskPanel';

export function TaskCard({ task }: TaskCardProps) {
  const { openTask } = useTaskPanel();
  
  const handleClick = () => {
    openTask(task.id); // Opens side panel instead of navigate
  };
  
  return (
    <div onClick={handleClick} className="cursor-pointer ...">
      {/* Simplified card content */}
    </div>
  );
}
```

---

## 6. Database Schema (Supabase)

### Evidence Table
```sql
CREATE TABLE task_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES ops_tasks(id),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'image', 'pdf', 'document', 'other'
  file_size INTEGER NOT NULL,
  thumbnail_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE task_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view evidence for tasks they can access"
ON task_evidence FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM ops_tasks t 
    WHERE t.id = task_id 
    AND (t.assignee_id = auth.uid() OR is_admin())
  )
);
```

### Comments Table
```sql
CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES ops_tasks(id),
  content TEXT,
  attachments JSONB DEFAULT '[]',
  author_id UUID NOT NULL REFERENCES profiles(id),
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
```

---

## 7. Priority Order

### Week 1: Foundation
1. Create types (`evidence-types.ts`)
2. Create `useTaskPanel` hook
3. Create `TaskSidePanel` container
4. Create `PanelHeader` and `PanelTabs`

### Week 2: Evidence Tab
5. Create database tables
6. Create `useEvidence` hook
7. Create `EvidenceTab`, `EvidenceCard`, `EvidenceUploader`
8. Create `FilePreview` lightbox

### Week 3: Comments & History
9. Create `useComments` hook
10. Create `CommentsTab`, `CommentItem`, `CommentInput`
11. Create `HistoryTab` with timeline

### Week 4: Integration & Polish
12. Simplify `TaskCard`
13. Integrate panel with board
14. Add completion rules (evidence required)
15. Add realtime updates
16. Polish animations

---

**Ready for implementation!**
