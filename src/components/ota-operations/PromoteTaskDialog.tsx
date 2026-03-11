/**
 * PromoteTaskDialog - Move Quick Task to a regular Project
 * 
 * Sprint 2 Feature:
 * - Shows only non-ops-bucket projects user has access to
 * - Preserves evidence, comments, audit trail
 * - Clears is_quick_task flag after promotion
 */

import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { ArrowRightCircle, Loader2, FolderOpen, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase, safeRpc } from "@/integrations/supabase";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { WORK_TYPE_CONFIG, OtaWorkType } from "@/lib/otaOps";

// ============================================================
// TYPES
// ============================================================

interface Project {
  id: string;
  name: string;
  work_type: OtaWorkType;
  status: string;
}

interface PromoteTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  taskTitle: string;
}

// ============================================================
// COMPONENT
// ============================================================

export function PromoteTaskDialog({ 
  open, 
  onOpenChange, 
  taskId,
  taskTitle,
}: PromoteTaskDialogProps) {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  
  // Fetch projects (exclude ops buckets)
  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['ota-projects-for-promote'],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from('ota_projects')
        .select('id, name, work_type, status')
        .neq('status', 'ARCHIVED')
        .neq('status', 'COMPLETED')
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as Project[];
    },
    enabled: open,
  });
  
  // Promote mutation
  const promoteMutation = useMutation({
    mutationFn: async (targetProjectId: string) => {
      const { data, error } = await safeRpc(() => supabase.rpc('ota_promote_quick_task_to_project' as any, {
        p_task_id: taskId,
        p_target_project_id: targetProjectId,
      }));
      
      if (error) throw error;
      
      const result = data as unknown as { 
        success: boolean; 
        error?: string; 
        message?: string;
        to_project_id?: string;
      };
      
      if (!result.success) {
        throw new Error(result.message || result.error || 'Failed to promote task');
      }
      
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['ota-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['ota-projects'] });
      
      const targetProject = projects.find(p => p.id === selectedProjectId);
      
      toast.success("Task đã được chuyển!", {
        description: `Đã chuyển vào project "${targetProject?.name}"`,
      });
      
      setSelectedProjectId(null);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(`Lỗi: ${error.message}`);
    },
  });
  
  const handlePromote = () => {
    if (!selectedProjectId) {
      toast.error("Vui lòng chọn project đích");
      return;
    }
    promoteMutation.mutate(selectedProjectId);
  };
  
  const selectedProject = projects.find(p => p.id === selectedProjectId);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightCircle className="h-5 w-5 text-info" />
            Chuyển vào Project
          </DialogTitle>
          <DialogDescription>
            Chuyển quick task "{taskTitle}" vào một project thường
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          {/* Search & Select Project */}
          <Command className="rounded-lg border">
            <CommandInput placeholder="Tìm project..." />
            <CommandList>
              <CommandEmpty>
                {loadingProjects ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  "Không tìm thấy project"
                )}
              </CommandEmpty>
              <CommandGroup heading="Projects">
                <ScrollArea className="h-[200px]">
                  {projects.map((project) => {
                    const workTypeConfig = WORK_TYPE_CONFIG[project.work_type] || WORK_TYPE_CONFIG.OTHER;
                    const isSelected = selectedProjectId === project.id;
                    
                    return (
                      <CommandItem
                        key={project.id}
                        value={project.name}
                        onSelect={() => setSelectedProjectId(project.id)}
                        className={cn(
                          "flex items-center gap-3 py-3 cursor-pointer",
                          isSelected && "bg-accent"
                        )}
                      >
                        <FolderOpen className={cn(
                          "h-4 w-4",
                          isSelected ? "text-primary" : "text-muted-foreground"
                        )} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{project.name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge 
                              variant="outline" 
                              className={cn("text-xs", workTypeConfig.badgeColor)}
                            >
                              {workTypeConfig.icon} {workTypeConfig.labelVi}
                            </Badge>
                            <span className="text-xs text-muted-foreground capitalize">
                              {project.status.toLowerCase().replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                        {isSelected && (
                          <Badge variant="default" className="ml-auto">
                            Đã chọn
                          </Badge>
                        )}
                      </CommandItem>
                    );
                  })}
                </ScrollArea>
              </CommandGroup>
            </CommandList>
          </Command>
          
          {/* Selected Project Preview */}
          {selectedProject && (
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <div className="text-sm font-medium">Chuyển đến:</div>
              <div className="text-base font-semibold mt-1">{selectedProject.name}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Task sẽ không còn là Quick Task sau khi chuyển
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Hủy
          </Button>
          <Button
            onClick={handlePromote}
            disabled={!selectedProjectId || promoteMutation.isPending}
            className="gap-2"
          >
            {promoteMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRightCircle className="h-4 w-4" />
            )}
            Chuyển Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
