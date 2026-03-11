# Task Board UX Specification
## Trello-style Side Panel Workspace

**Version:** 1.0  
**Date:** 2026-01-09  
**Author:** Senior Product Designer + Frontend Architect

---

## 1. Design Philosophy

### Core Principles
| Principle | Description |
|-----------|-------------|
| **Single Workspace** | Side panel is THE workspace - no page navigation |
| **Zero Context Switch** | All actions happen in-place |
| **Text-First** | Labels > Icons > Emoji (eliminate emoji entirely) |
| **Evidence-Driven** | Task completion requires proof |
| **Progressive Disclosure** | Show what matters, reveal on demand |

### Anti-Patterns to Avoid
- ❌ Clicking task opens new page
- ❌ Multiple modals stacked
- ❌ Emoji overload
- ❌ Hidden critical actions
- ❌ Scroll-heavy layouts

---

## 2. Wireframe: Task Card (Board View)

```
┌─────────────────────────────────────────────────┐
│ Task Card (Compact)                      140px │
├─────────────────────────────────────────────────┤
│                                                 │
│  [Check-in Phòng 301]                          │
│                                                 │
│  ┌────────────┐                                │
│  │ Oceanview  │  ← Project badge (text only)   │
│  └────────────┘                                │
│                                                 │
│  ┌────┐  ┌────┐  ┌─────────────┐              │
│  │ 📎2│  │ 💬3│  │ 15:00 hôm nay│              │
│  └────┘  └────┘  └─────────────┘              │
│  Evidence  Comments   Deadline                  │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Task Card Data Model
```typescript
interface TaskCardDisplay {
  id: string;
  title: string;                    // "Check-in Phòng 301"
  projectName: string;              // "Oceanview Resort"
  evidenceCount: number;            // 2
  commentCount: number;             // 3
  deadline: Date;                   // Display relative
  urgency: 'low' | 'medium' | 'high' | 'critical';
  status: TaskStatus;
}
```

### Visual Indicators (Minimal)
| State | Indicator |
|-------|-----------|
| Overdue | Red left border (4px) |
| Due Today | Orange left border |
| Normal | Gray left border |
| Completed | Green checkmark overlay |

---

## 3. Wireframe: Side Panel (Main Workspace)

### Panel Structure (480px width)

```
┌──────────────────────────────────────────────────────────┐
│ SIDE PANEL                                    [X] Close  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ HEADER                                             │  │
│  │                                                    │  │
│  │  Check-in Phòng 301 - Nguyễn Văn A                │  │
│  │                                                    │  │
│  │  ┌──────────────┐  ┌──────────────┐              │  │
│  │  │ Đang xử lý ▼ │  │ 15:00 hôm nay│              │  │
│  │  └──────────────┘  └──────────────┘              │  │
│  │      Status           Deadline                    │  │
│  │                                                    │  │
│  │  [Hoàn thành]  [Gán lại]  [···]                  │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ TABS                                               │  │
│  │                                                    │  │
│  │  [ Tổng quan ]  [ Kết quả ]  [ Bình luận ]  [ Lịch sử ]
│  │       ↑              ↑            ↑             ↑     │
│  │    Overview      Evidence      Comments      History  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ TAB CONTENT (Scrollable)                          │  │
│  │                                                    │  │
│  │  ... content based on active tab ...              │  │
│  │                                                    │  │
│  │                                                    │  │
│  │                                                    │  │
│  │                                                    │  │
│  │                                                    │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 4. Tab: Tổng quan (Overview)

```
┌────────────────────────────────────────────────────┐
│ TỔNG QUAN                                          │
├────────────────────────────────────────────────────┤
│                                                    │
│  MỤC TIÊU                                         │
│  ────────                                         │
│  Check-in khách và bàn giao phòng đúng giờ       │
│                                                    │
│  THÔNG TIN BOOKING                                │
│  ────────────────                                 │
│  Khách        Nguyễn Văn A                        │
│  Phòng        301 - Deluxe Ocean View             │
│  Check-in     15:00 - 09/01/2026                  │
│  Check-out    12:00 - 11/01/2026                  │
│  Số đêm       2 đêm                               │
│                                                    │
│  DỰ ÁN                                            │
│  ─────                                            │
│  ┌─────────────────────────────────────────────┐  │
│  │ Oceanview Resort                            │  │
│  │ Quản lý: Trần Thị B                         │  │
│  └─────────────────────────────────────────────┘  │
│                                                    │
│  NGƯỜI THỰC HIỆN                                  │
│  ──────────────                                   │
│  ┌──────┐                                        │
│  │  TT  │  Trần Thị C (FOH)                     │
│  └──────┘  Nhận việc lúc 14:30                   │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## 5. Tab: Kết quả (Evidence) - CRITICAL

```
┌────────────────────────────────────────────────────┐
│ KẾT QUẢ CÔNG VIỆC                                  │
├────────────────────────────────────────────────────┤
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  ⚠️ Cần ít nhất 1 minh chứng được duyệt     │  │
│  │     để hoàn thành task này                   │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  MINH CHỨNG (2)                                   │
│  ─────────────                                    │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │ 📄 Ảnh check-in                   APPROVED  │  │
│  │ ┌────────────────────────────────────────┐   │  │
│  │ │                                        │   │  │
│  │ │         [Image Preview]                │   │  │
│  │ │         check-in-301.jpg               │   │  │
│  │ │         (Click to expand)              │   │  │
│  │ │                                        │   │  │
│  │ └────────────────────────────────────────┘   │  │
│  │ Uploaded by Trần Thị C • 15:05              │  │
│  │                                              │  │
│  │ Reviewer: Admin • Approved 15:10            │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │ 📄 Biên bản bàn giao                PENDING │  │
│  │ ┌────────────────────────────────────────┐   │  │
│  │ │                                        │   │  │
│  │ │         [PDF Preview]                  │   │  │
│  │ │         handover-301.pdf               │   │  │
│  │ │         (Click to view)                │   │  │
│  │ │                                        │   │  │
│  │ └────────────────────────────────────────┘   │  │
│  │ Uploaded by Trần Thị C • 15:08              │  │
│  │                                              │  │
│  │ [Approve]  [Reject]  [Comment]              │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  [+] Tải lên minh chứng                     │  │
│  │                                              │  │
│  │  Drag & drop hoặc click để chọn file        │  │
│  │  Hỗ trợ: JPG, PNG, PDF (max 10MB)           │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
└────────────────────────────────────────────────────┘
```

### Evidence State Machine
```
                    ┌─────────┐
         Upload     │ PENDING │
            ────────►         │
                    └────┬────┘
                         │
              ┌──────────┴──────────┐
              │                     │
              ▼                     ▼
        ┌──────────┐          ┌──────────┐
        │ APPROVED │          │ REJECTED │
        └──────────┘          └────┬─────┘
                                   │
                            Re-upload
                                   │
                                   ▼
                              ┌─────────┐
                              │ PENDING │
                              └─────────┘
```

### Evidence Data Model
```typescript
interface Evidence {
  id: string;
  taskId: string;
  fileName: string;
  fileUrl: string;
  fileType: 'image' | 'pdf' | 'document';
  thumbnailUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  uploadedBy: string;
  uploadedAt: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
}
```

---

## 6. Tab: Bình luận (Comments)

```
┌────────────────────────────────────────────────────┐
│ BÌNH LUẬN (3)                                      │
├────────────────────────────────────────────────────┤
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  ┌────┐                                      │  │
│  │  │ AD │  Admin                    15:12     │  │
│  │  └────┘                                      │  │
│  │                                              │  │
│  │  Đã duyệt ảnh check-in. Nhớ bổ sung         │  │
│  │  biên bản bàn giao nhé.                     │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  ┌────┐                                      │  │
│  │  │ TC │  Trần Thị C               15:15     │  │
│  │  └────┘                                      │  │
│  │                                              │  │
│  │  Đã upload biên bản. Có thêm note từ khách: │  │
│  │                                              │  │
│  │  ┌────────────────────────────────────────┐  │  │
│  │  │ 📎 guest-note.jpg                      │  │  │
│  │  │ ┌──────────────────────────────────┐   │  │  │
│  │  │ │      [Image Thumbnail]           │   │  │  │
│  │  │ └──────────────────────────────────┘   │  │  │
│  │  └────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │ Viết bình luận...                           │  │
│  │                                              │  │
│  │ ┌────────────────────────────────────────┐   │  │
│  │ │                                        │   │  │
│  │ │  [Text input area]                     │   │  │
│  │ │                                        │   │  │
│  │ └────────────────────────────────────────┘   │  │
│  │                                              │  │
│  │  [📎 Đính kèm]              [Gửi]           │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
└────────────────────────────────────────────────────┘
```

### Comment Data Model
```typescript
interface Comment {
  id: string;
  taskId: string;
  content: string;
  attachments: Attachment[];
  author: {
    id: string;
    name: string;
    avatar?: string;
  };
  createdAt: Date;
  updatedAt?: Date;
}

interface Attachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  thumbnailUrl?: string;
}
```

---

## 7. Tab: Lịch sử (History)

```
┌────────────────────────────────────────────────────┐
│ LỊCH SỬ THAY ĐỔI                                   │
├────────────────────────────────────────────────────┤
│                                                    │
│  15:10 • Duyệt minh chứng                         │
│  │      Admin duyệt "Ảnh check-in"               │
│  │                                                │
│  15:08 • Upload minh chứng                        │
│  │      Trần Thị C upload "Biên bản bàn giao"    │
│  │                                                │
│  15:05 • Upload minh chứng                        │
│  │      Trần Thị C upload "Ảnh check-in"         │
│  │                                                │
│  14:30 • Nhận việc                                │
│  │      Trần Thị C nhận task                     │
│  │                                                │
│  14:00 • Tạo task                                 │
│  │      Hệ thống tự động tạo từ booking          │
│  │                                                │
│  ●                                                │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## 8. Component Breakdown

### Component Tree
```
TaskBoard/
├── BoardColumn.tsx           # Kanban column
├── TaskCard.tsx              # Card trong column (SIMPLIFIED)
├── TaskSidePanel/            # Main workspace
│   ├── TaskSidePanel.tsx     # Container + state
│   ├── PanelHeader.tsx       # Title, status, actions
│   ├── PanelTabs.tsx         # Tab navigation
│   ├── tabs/
│   │   ├── OverviewTab.tsx   # Tổng quan
│   │   ├── EvidenceTab.tsx   # Kết quả + upload
│   │   ├── CommentsTab.tsx   # Bình luận
│   │   └── HistoryTab.tsx    # Lịch sử
│   └── components/
│       ├── EvidenceCard.tsx  # Evidence item + preview
│       ├── EvidenceUploader.tsx
│       ├── FilePreview.tsx   # Inline preview (img/pdf)
│       ├── CommentItem.tsx
│       ├── CommentInput.tsx
│       └── TimelineEvent.tsx
└── hooks/
    ├── useTaskPanel.ts       # Panel open/close state
    ├── useEvidence.ts        # CRUD evidence
    └── useComments.ts        # CRUD comments
```

### Key Components Specs

#### TaskCard.tsx (Simplified)
```typescript
interface TaskCardProps {
  task: TaskCardDisplay;
  onClick: () => void;  // Opens side panel, NOT navigate
}

// REMOVE: timeline, emoji, action buttons
// KEEP: title, project, counts, deadline, urgency indicator
```

#### TaskSidePanel.tsx
```typescript
interface TaskSidePanelProps {
  taskId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

// Features:
// - Slide in from right (480px)
// - Click outside to close
// - ESC to close
// - Tabs with lazy loading
```

#### EvidenceCard.tsx
```typescript
interface EvidenceCardProps {
  evidence: Evidence;
  onApprove: () => void;
  onReject: (reason: string) => void;
  canReview: boolean;
}

// Features:
// - Inline preview (thumbnail)
// - Click to expand (lightbox for images, viewer for PDF)
// - Status badge
// - Review actions (if canReview)
```

---

## 9. UX Rules & Edge Cases

### Task Completion Rules
| Rule | Description |
|------|-------------|
| **R1** | Task CANNOT be marked "Done" without ≥1 approved evidence |
| **R2** | If all evidence rejected, task auto-moves to "Cần xử lý" |
| **R3** | Admin can override and mark Done without evidence (audit logged) |
| **R4** | Evidence rejection requires reason (mandatory) |

### Panel Behavior
| Scenario | Behavior |
|----------|----------|
| Click task | Open panel, focus first tab |
| Click outside panel | Close panel |
| Press ESC | Close panel |
| Click different task | Swap panel content (no close/open animation) |
| Panel open + navigate away | Close panel |
| Upload in progress + close | Confirm dialog |

### Evidence Upload
| Scenario | Behavior |
|----------|----------|
| Drag file to panel | Upload starts immediately |
| File > 10MB | Show error, prevent upload |
| Invalid file type | Show error, prevent upload |
| Upload fails | Show retry option |
| Multiple files | Queue uploads, show progress |

### Comment Behavior
| Scenario | Behavior |
|----------|----------|
| Empty comment + attachment | Allow (attachment-only comment) |
| Long comment | Expand textarea, no limit |
| @mention | Future feature (not in scope) |
| Edit comment | Within 5 minutes only |
| Delete comment | Soft delete, show "[Đã xóa]" |

### Status Transitions
```
┌───────────┐     ┌───────────┐     ┌───────────┐     ┌──────┐
│ Chờ nhận  │────►│ Đang làm  │────►│ Chờ duyệt │────►│ Done │
└───────────┘     └───────────┘     └───────────┘     └──────┘
                        │                 │
                        │                 │ (rejected)
                        │                 ▼
                        │           ┌───────────┐
                        └──────────►│ Cần xử lý │
                                    └───────────┘
```

### Permission Matrix
| Action | Admin | Manager | Staff |
|--------|-------|---------|-------|
| View task | ✅ | ✅ | ✅ (assigned) |
| Upload evidence | ✅ | ✅ | ✅ (assigned) |
| Approve evidence | ✅ | ✅ | ❌ |
| Reject evidence | ✅ | ✅ | ❌ |
| Mark Done | ✅ | ✅ | ❌ |
| Override Done (no evidence) | ✅ | ❌ | ❌ |
| Delete evidence | ✅ | ❌ | ❌ |
| Re-assign task | ✅ | ✅ | ❌ |

---

## 10. Migration Plan

### Phase 1: TaskCard Simplification
- [ ] Remove emoji from cards
- [ ] Remove inline timeline
- [ ] Remove inline actions
- [ ] Add onClick → openPanel handler

### Phase 2: Side Panel Foundation
- [ ] Create TaskSidePanel container
- [ ] Implement PanelHeader
- [ ] Implement tab navigation
- [ ] Add open/close animations

### Phase 3: Overview Tab
- [ ] Display task details
- [ ] Display booking info
- [ ] Display assignee

### Phase 4: Evidence Tab (Critical)
- [ ] Create Evidence data model
- [ ] Implement EvidenceUploader
- [ ] Implement FilePreview (inline)
- [ ] Implement approval workflow

### Phase 5: Comments Tab
- [ ] Create Comment data model
- [ ] Implement CommentInput with attachments
- [ ] Implement CommentList
- [ ] Add inline attachment preview

### Phase 6: History Tab
- [ ] Create history events from audit_logs
- [ ] Implement Timeline component

### Phase 7: Integration
- [ ] Wire up completion rules
- [ ] Add realtime updates
- [ ] Polish animations

---

## 11. Technical Considerations

### State Management
```typescript
// Panel state (Zustand or Context)
interface TaskPanelState {
  selectedTaskId: string | null;
  isOpen: boolean;
  activeTab: 'overview' | 'evidence' | 'comments' | 'history';
  openTask: (id: string) => void;
  closePanel: () => void;
  setActiveTab: (tab: string) => void;
}
```

### File Preview Strategy
| File Type | Preview Method |
|-----------|----------------|
| JPG/PNG/GIF | `<img>` with lightbox on click |
| PDF | `<iframe>` or PDF.js viewer |
| DOC/XLS | Show icon + download link |
| Video | `<video>` player (future) |

### Realtime Updates
- Evidence status changes → Supabase realtime
- New comments → Supabase realtime
- Task status changes → Supabase realtime

---

## 12. Success Metrics

| Metric | Target |
|--------|--------|
| Time to complete task | -30% |
| Page navigations per task | 0 (from current 2-3) |
| Evidence upload success rate | >95% |
| User satisfaction (feedback) | >4/5 |

---

**END OF SPECIFICATION**
