/**
 * OverviewTab - Task overview and booking context - Trello style
 * 
 * DISPLAYS:
 * - Task objective/description with edit button
 * - Classification & Issue Tag (Sprint 1)
 * - Effort tracking with "Log effort" action (Sprint 2)
 * - Booking info (if linked)
 * - Project info
 * - Assignee info with change capability
 * - Due date with picker
 */

import React, { useState } from 'react';
import { User, Building2, Calendar, AlignLeft, Pencil, Users, Tag, Clock, Zap, Timer, Loader2, CalendarIcon, Check, ChevronsUpDown, UserCircle, History, X } from 'lucide-react';
import { OtaTask, CLASSIFICATION_CONFIG, COMMON_ISSUE_TAGS, OtaTaskClassification } from '@/lib/otaOps';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  useUpdateTaskEffort, 
  useUpdateOtaTaskAssignee, 
  useUpdateOtaTaskDueDate,
  useUpdateOtaTaskDescription,
  useOtaProjectMembers,
  useUpdateTaskClassification,
} from '@/hooks/useOtaOperations';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface OverviewTabProps {
  task: OtaTask;
  readOnly?: boolean; // Sprint C: disable editing for completed projects
}

// Section component for consistent styling - Trello style
function Section({ 
  title, 
  icon: Icon,
  action,
  children 
}: { 
  title: string; 
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  children: React.ReactNode 
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          <h3 className="text-sm font-semibold text-foreground">
            {title}
          </h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function OverviewTab({ task, readOnly = false }: OverviewTabProps) {
  const [showEffortPopover, setShowEffortPopover] = useState(false);
  const [showAssigneePopover, setShowAssigneePopover] = useState(false);
  const [showDueDatePopover, setShowDueDatePopover] = useState(false);
  const [showDescriptionDialog, setShowDescriptionDialog] = useState(false);
  const [showClassificationPopover, setShowClassificationPopover] = useState(false);
  const [editDescription, setEditDescription] = useState(task.description || '');
  const [expectedHours, setExpectedHours] = useState(task.expected_effort_minutes ? Math.floor(task.expected_effort_minutes / 60) : 0);
  const [expectedMinutes, setExpectedMinutes] = useState(task.expected_effort_minutes ? task.expected_effort_minutes % 60 : 0);
  const [actualHours, setActualHours] = useState(task.actual_effort_minutes ? Math.floor(task.actual_effort_minutes / 60) : 0);
  const [actualMinutes, setActualMinutes] = useState(task.actual_effort_minutes ? task.actual_effort_minutes % 60 : 0);
  
  // Mutations
  const updateEffortMutation = useUpdateTaskEffort();
  const updateClassificationMutation = useUpdateTaskClassification();
  const updateAssigneeMutation = useUpdateOtaTaskAssignee();
  const updateDueDateMutation = useUpdateOtaTaskDueDate();
  const updateDescriptionMutation = useUpdateOtaTaskDescription();
  
  // Fetch project members for assignee dropdown
  const { data: membersData } = useOtaProjectMembers(task.project_id || undefined);
  const members = membersData?.members || [];
  
  // Format dates
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('vi-VN', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  
  // Get initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };
  
  // Handle effort save
  const handleSaveEffort = async () => {
    const expectedTotal = expectedHours * 60 + expectedMinutes;
    const actualTotal = actualHours * 60 + actualMinutes;
    
    try {
      await updateEffortMutation.mutateAsync({
        taskId: task.id,
        expectedEffortMinutes: expectedTotal || null,
        actualEffortMinutes: actualTotal || null,
      });
      setShowEffortPopover(false);
      toast.success('Đã cập nhật thời gian');
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };
  
  // Handle description save
  const handleSaveDescription = async () => {
    try {
      await updateDescriptionMutation.mutateAsync({
        taskId: task.id,
        description: editDescription.trim() || null,
      });
      setShowDescriptionDialog(false);
      toast.success('Đã cập nhật mô tả');
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  return (
    <div 
      id="panel-overview" 
      role="tabpanel" 
      aria-labelledby="tab-overview"
      className="p-5 space-y-6"
    >
      {/* Creator & Timestamps - Audit info */}
      <Section title="Thông tin tạo" icon={UserCircle}>
        <div className="bg-muted dark:bg-muted/30 rounded-lg p-3 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Người tạo:</span>
            <span className="font-medium">{task.created_by_name || task.created_by_email || 'Hệ thống'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Ngày tạo:</span>
            <span>{task.created_at ? format(new Date(task.created_at), 'dd/MM/yyyy HH:mm', { locale: vi }) : '—'}</span>
          </div>
          {task.updated_at && task.updated_at !== task.created_at && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Cập nhật lần cuối:</span>
              <span>{format(new Date(task.updated_at), 'dd/MM/yyyy HH:mm', { locale: vi })}</span>
            </div>
          )}
        </div>
      </Section>
      
      {/* Description - Trello style with working edit - LARGER */}
      <Section 
        title="Mô tả" 
        icon={AlignLeft}
        action={!readOnly && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 text-xs gap-1"
            onClick={() => {
              setEditDescription(task.description || '');
              setShowDescriptionDialog(true);
            }}
          >
            <Pencil className="h-3 w-3" />
            Chỉnh sửa
          </Button>
        )}
      >
        <div className="bg-muted dark:bg-muted/50 rounded-lg p-4 min-h-[120px]">
          {task.description ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {task.description}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Thêm mô tả chi tiết cho task này...
            </p>
          )}
        </div>
      </Section>
      
      {/* Assignee - Trello style */}
      <Section title="Người thực hiện" icon={Users}>
        {task.assignee_id ? (
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-info/100 text-white text-sm">
                {getInitials(task.assignee_name || task.assignee_email || 'U')}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="text-sm font-medium">
                {task.assignee_name || task.assignee_email || 'Unknown'}
              </div>
            </div>
            <Popover open={showAssigneePopover && !readOnly} onOpenChange={setShowAssigneePopover}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" disabled={readOnly}>
                  Thay đổi
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="end">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground px-2 py-1">Chọn người thực hiện</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-sm h-9"
                    onClick={async () => {
                      try {
                        await updateAssigneeMutation.mutateAsync({ taskId: task.id, assigneeId: null });
                        toast.success('Đã bỏ gán người thực hiện');
                        setShowAssigneePopover(false);
                      } catch (err) {
                        toast.error('Lỗi cập nhật');
                      }
                    }}
                  >
                    <User className="h-4 w-4 mr-2 text-muted-foreground" />
                    Bỏ gán
                  </Button>
                  {members.map((member: any) => (
                    <Button
                      key={member.user_id}
                      variant={task.assignee_id === member.user_id ? "secondary" : "ghost"}
                      size="sm"
                      className="w-full justify-start text-sm h-9"
                      onClick={async () => {
                        if (task.assignee_id === member.user_id) return;
                        try {
                          await updateAssigneeMutation.mutateAsync({ taskId: task.id, assigneeId: member.user_id });
                          toast.success(`Đã gán cho ${member.full_name || member.email}`);
                          setShowAssigneePopover(false);
                        } catch (err) {
                          toast.error('Lỗi cập nhật');
                        }
                      }}
                    >
                      <Avatar className="h-6 w-6 mr-2">
                        <AvatarFallback className="text-xs bg-primary/10">
                          {getInitials(member.full_name || member.email)}
                        </AvatarFallback>
                      </Avatar>
                      {member.full_name || member.email}
                      {task.assignee_id === member.user_id && <Check className="h-4 w-4 ml-auto" />}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3 border-2 border-dashed rounded-lg">
            <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-sm text-muted-foreground">Chưa gán người thực hiện</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="ml-auto h-7 text-xs">
                  + Thêm
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="end">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground px-2 py-1">Chọn người thực hiện</p>
                  {members.map((member: any) => (
                    <Button
                      key={member.user_id}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-sm h-9"
                      onClick={async () => {
                        try {
                          await updateAssigneeMutation.mutateAsync({ taskId: task.id, assigneeId: member.user_id });
                          toast.success(`Đã gán cho ${member.full_name || member.email}`);
                        } catch (err) {
                          toast.error('Lỗi cập nhật');
                        }
                      }}
                    >
                      <Avatar className="h-6 w-6 mr-2">
                        <AvatarFallback className="text-xs bg-primary/10">
                          {getInitials(member.full_name || member.email)}
                        </AvatarFallback>
                      </Avatar>
                      {member.full_name || member.email}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </Section>
      
      {/* Classification - Sprint 1 (EDITABLE) */}
      <Section title="Phân loại tác vụ" icon={Zap}>
        <div className="flex flex-wrap items-center gap-2">
          {task.classification && CLASSIFICATION_CONFIG[task.classification as OtaTaskClassification] ? (
            <Badge 
              variant="secondary" 
              className={`px-3 py-1 ${CLASSIFICATION_CONFIG[task.classification as OtaTaskClassification].badgeColor}`}
            >
              {CLASSIFICATION_CONFIG[task.classification as OtaTaskClassification].icon} {CLASSIFICATION_CONFIG[task.classification as OtaTaskClassification].labelVi}
            </Badge>
          ) : (
            <Badge variant="outline" className="px-3 py-1 text-muted-foreground">
              ⚡ Thực thi (mặc định)
            </Badge>
          )}
          
          {/* Editable classification dropdown */}
          {!readOnly && task.status !== 'DONE' && task.status !== 'CANCELLED' && (
            <Popover open={showClassificationPopover} onOpenChange={setShowClassificationPopover}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
                  Thay đổi
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="start">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Đổi phân loại sẽ thay đổi yêu cầu minh chứng
                  </p>
                  {(['EXECUTION', 'PREP', 'AUTO', 'OPS'] as const).map((cls) => {
                    const config = CLASSIFICATION_CONFIG[cls];
                    const isSelected = (task.classification || 'EXECUTION') === cls;
                    return (
                      <Button
                        key={cls}
                        variant={isSelected ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start text-sm h-auto py-2"
                        disabled={updateClassificationMutation.isPending}
                        onClick={async () => {
                          if (isSelected) return;
                          try {
                            await updateClassificationMutation.mutateAsync({
                              taskId: task.id,
                              newClassification: cls,
                              reason: `Changed from ${task.classification || 'EXECUTION'} to ${cls}`,
                            });
                            toast.success(`Đã đổi phân loại sang ${config.labelVi}`);
                            setShowClassificationPopover(false);
                          } catch (err) {
                            toast.error(`Lỗi: ${(err as Error).message}`);
                          }
                        }}
                      >
                        <div className="flex flex-col items-start">
                          <span className="flex items-center gap-1">
                            {config.icon} {config.labelVi}
                            {cls === 'EXECUTION' && <span className="text-xs text-warning ml-1">(cần MC)</span>}
                          </span>
                          <span className="text-xs text-muted-foreground font-normal">
                            {config.description}
                          </span>
                        </div>
                        {isSelected && <Check className="h-4 w-4 ml-auto" />}
                      </Button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          )}
          
          {/* Evidence requirement indicator */}
          <span className="text-xs text-muted-foreground">
            {(task.require_evidence ?? (task.classification === 'EXECUTION' || !task.classification)) 
              ? `• Cần ${task.min_evidence_count || 1} minh chứng` 
              : '• Không cần minh chứng'}
          </span>
        </div>
      </Section>
      
      {/* Issue Tag - Sprint 1 (only show if has issue_tag) */}
      {task.issue_tag && (
        <Section title="Nhãn vấn đề" icon={Tag}>
          <div className="flex flex-wrap gap-2">
            {(() => {
              const tagConfig = COMMON_ISSUE_TAGS.find(t => t.value === task.issue_tag);
              return (
                <Badge 
                  variant="secondary" 
                  className={`px-3 py-1 ${tagConfig?.color || 'bg-muted text-muted-foreground'}`}
                >
                  {tagConfig?.label || task.issue_tag}
                </Badge>
              );
            })()}
          </div>
        </Section>
      )}
      
      {/* Effort Tracking - Sprint 2: Enhanced with Log effort */}
      <Section 
        title="Thời gian thực hiện" 
        icon={Clock}
        action={
          <Popover open={showEffortPopover} onOpenChange={setShowEffortPopover}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                <Timer className="h-3 w-3" />
                Log effort
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-4" align="end">
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Cập nhật thời gian</h4>
                
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Dự kiến</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={expectedHours || ''}
                      onChange={(e) => setExpectedHours(parseInt(e.target.value) || 0)}
                      className="w-16 h-8"
                    />
                    <span className="text-xs text-muted-foreground">giờ</span>
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      placeholder="0"
                      value={expectedMinutes || ''}
                      onChange={(e) => setExpectedMinutes(parseInt(e.target.value) || 0)}
                      className="w-16 h-8"
                    />
                    <span className="text-xs text-muted-foreground">phút</span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Thực tế</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={actualHours || ''}
                      onChange={(e) => setActualHours(parseInt(e.target.value) || 0)}
                      className="w-16 h-8"
                    />
                    <span className="text-xs text-muted-foreground">giờ</span>
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      placeholder="0"
                      value={actualMinutes || ''}
                      onChange={(e) => setActualMinutes(parseInt(e.target.value) || 0)}
                      className="w-16 h-8"
                    />
                    <span className="text-xs text-muted-foreground">phút</span>
                  </div>
                </div>
                
                <Button 
                  size="sm" 
                  className="w-full"
                  onClick={handleSaveEffort}
                  disabled={updateEffortMutation.isPending}
                >
                  {updateEffortMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Lưu
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        }
      >
        <div className="flex gap-4 text-sm">
          {task.expected_effort_minutes ? (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Dự kiến:</span>
              <span className="font-medium">{Math.floor(task.expected_effort_minutes / 60)}h {task.expected_effort_minutes % 60}m</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>Dự kiến: —</span>
            </div>
          )}
          {task.actual_effort_minutes ? (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Thực tế:</span>
              <span className="font-medium">{Math.floor(task.actual_effort_minutes / 60)}h {task.actual_effort_minutes % 60}m</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>Thực tế: —</span>
            </div>
          )}
        </div>
      </Section>
      
      {/* Work Type - Trello label style */}
      <Section title="Loại công việc">
        <div className="flex flex-wrap gap-2">
          <Badge 
            variant="secondary" 
            className="px-3 py-1 bg-info/10 text-info hover:bg-info/10"
          >
            {task.work_type || 'Chưa phân loại'}
          </Badge>
          {/* Hidden: no label system yet */}
          {/*
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
            + Thêm nhãn
          </Button>
          */}
        </div>
      </Section>
      
      {/* Due Date - with date picker */}
      <Section 
        title="Hạn hoàn thành" 
        icon={Calendar}
        action={
          <Popover open={showDueDatePopover} onOpenChange={setShowDueDatePopover}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                <Pencil className="h-3 w-3" />
                {task.due_date ? 'Thay đổi' : 'Thêm'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <CalendarComponent
                mode="single"
                selected={task.due_date ? new Date(task.due_date) : undefined}
                onSelect={async (date) => {
                  try {
                    await updateDueDateMutation.mutateAsync({
                      taskId: task.id,
                      dueDate: date ? date.toISOString() : null,
                    });
                    toast.success(date ? 'Đã cập nhật hạn hoàn thành' : 'Đã xóa hạn hoàn thành');
                    setShowDueDatePopover(false);
                  } catch (err) {
                    toast.error('Lỗi cập nhật');
                  }
                }}
                locale={vi}
                initialFocus
              />
              {task.due_date && (
                <div className="p-2 border-t">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="w-full text-destructive hover:text-destructive"
                    onClick={async () => {
                      try {
                        await updateDueDateMutation.mutateAsync({
                          taskId: task.id,
                          dueDate: null,
                        });
                        toast.success('Đã xóa hạn hoàn thành');
                        setShowDueDatePopover(false);
                      } catch (err) {
                        toast.error('Lỗi cập nhật');
                      }
                    }}
                  >
                    Xóa hạn
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        }
      >
        {task.due_date ? (
          <div className={cn(
            "inline-flex items-center gap-2 px-3 py-2 rounded-lg",
            new Date(task.due_date) < new Date() 
              ? "bg-destructive/10 text-destructive dark:text-destructive"
              : "bg-warning/10 text-warning dark:text-warning"
          )}>
            <CalendarIcon className="h-4 w-4" />
            <span className="text-sm font-medium">
              {format(new Date(task.due_date), 'EEEE, dd/MM/yyyy HH:mm', { locale: vi })}
            </span>
            {new Date(task.due_date) < new Date() && (
              <Badge variant="destructive" className="text-xs">Quá hạn</Badge>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">Chưa đặt hạn hoàn thành</p>
        )}
      </Section>
      
      {/* Project - Trello style with link to Inputs */}
      {task.project_name && (
        <Section title="Dự án" icon={Building2}>
          <div className="flex items-center gap-3 p-3 bg-muted dark:bg-muted/50 rounded-lg">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-info to-primary flex items-center justify-center">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">{task.project_name}</div>
              {task.property_name && (
                <div className="text-xs text-muted-foreground">
                  {task.property_name}
                </div>
              )}
            </div>
            {task.project_id && (
              <a
                href={`/ota-operations/projects/${task.project_id}?tab=inputs`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
                title="Xem hướng dẫn/input của project"
              >
                📋 Xem Input
              </a>
            )}
          </div>
        </Section>
      )}
      
      {/* Edit Description Dialog */}
      <Dialog open={showDescriptionDialog} onOpenChange={setShowDescriptionDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa mô tả</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Nhập mô tả chi tiết cho task..."
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={6}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDescriptionDialog(false)}>
              Hủy
            </Button>
            <Button 
              onClick={handleSaveDescription}
              disabled={updateDescriptionMutation.isPending}
            >
              {updateDescriptionMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default OverviewTab;
