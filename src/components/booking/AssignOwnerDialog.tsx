/**
 * AssignOwnerDialog Component
 * 
 * Dialog để gán hoặc chuyển nhân viên phụ trách cho booking.
 * Sử dụng danh sách user từ profiles table.
 */

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, UserPlus, Users, Loader2, UserMinus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  type DepartmentType,
  DEPARTMENT_LABELS,
  DEPARTMENT_COLORS,
  roleToDepartment,
} from "@/lib/responsible-owner-types";
import { useResponsibleOwner } from "@/hooks/useResponsibleOwner";
import { usePermissions } from "@/hooks/useAuth";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface AssignOwnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  currentOwnerId?: string | null;
  onAssigned?: () => void;
}

interface UserWithRole {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  department: DepartmentType;
}

export function AssignOwnerDialog({
  open,
  onOpenChange,
  bookingId,
  currentOwnerId,
  onAssigned,
}: AssignOwnerDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [isAssigning, setIsAssigning] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const { transferOwner, assignOwner, removeOwner, isOwnerAssigned } = useResponsibleOwner(bookingId);
  const { isAdmin } = usePermissions();
  const { user } = useAuth();

  // Helper to get role priority (higher = more important)
  const getPriorityRole = (role: string): number => {
    switch (role) {
      case "super_admin": return 6;
      case "admin": return 5;
      case "ke_toan": return 4;
      case "cskh": return 3;
      case "sale": return 2;
      case "ota_lead": return 1;
      case "ota_staff": return 0;
      case "foh": return 0;
      default: return -1;
    }
  };

  // Fetch users with their roles
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users_for_assignment"],
    refetchOnMount: false,
    queryFn: async (): Promise<UserWithRole[]> => {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name");

      if (profilesError) throw profilesError;

      // Fetch user roles
      const { data: userRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Map roles to users - handle multiple roles with PRIORITY
      const roleMap = new Map<string, string>();
      userRoles?.forEach((ur) => {
        const existing = roleMap.get(ur.user_id);
        // Keep highest priority role
        if (!existing || getPriorityRole(ur.role) > getPriorityRole(existing)) {
          roleMap.set(ur.user_id, ur.role);
        }
      });

      return (profiles || []).map((profile) => {
        const role = roleMap.get(profile.id) || "unknown";
        return {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          role,
          department: roleToDepartment(role as any),
        };
      });
    },
    enabled: open,
    staleTime: 2 * 60 * 1000, // Cache 2 minutes
  });

  // Filter users based on permissions
  // Non-admin can ONLY see themselves (self-assign only)
  const availableUsers = useMemo(() => {
    if (isAdmin) return users;
    // Non-admin: only show current user for self-assign
    return users.filter(u => u.id === user?.id);
  }, [users, isAdmin, user?.id]);

  // Filter users
  const filteredUsers = useMemo(() => {
    return availableUsers.filter((u) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        u.full_name?.toLowerCase().includes(searchLower) ||
        u.email.toLowerCase().includes(searchLower);

      // Department filter
      const matchesDepartment =
        departmentFilter === "all" || u.department === departmentFilter;

      return matchesSearch && matchesDepartment;
    });
  }, [availableUsers, searchQuery, departmentFilter]);

  // Get selected user info
  const selectedUser = users.find((u) => u.id === selectedUserId);

  const handleAssign = async () => {
    if (!selectedUser) {
      toast.error("Vui lòng chọn nhân viên");
      return;
    }

    setIsAssigning(true);
    try {
      const displayName = selectedUser.full_name || selectedUser.email;

      if (isOwnerAssigned) {
        // Transfer ownership - now saves to database
        await transferOwner(
          selectedUser.id,
          displayName,
          selectedUser.department
        );
        toast.success(`Đã chuyển giao cho ${displayName}`);
      } else {
        // First assignment - now saves to database
        await assignOwner("Gán thủ công", selectedUser.id, displayName, selectedUser.department);
        toast.success(`Đã gán ${displayName} phụ trách`);
      }

      onAssigned?.();
      onOpenChange(false);
      setSelectedUserId("");
      setSearchQuery("");
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setIsAssigning(false);
    }
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  // Non-admin cannot transfer when owner already assigned
  const canTransfer = isAdmin || !isOwnerAssigned;
  
  // Admin can remove owner when owner is assigned
  const canRemove = isAdmin && isOwnerAssigned;
  
  // Show info message for non-admin
  const showSelfAssignInfo = !isAdmin && !isOwnerAssigned;

  // Handle remove owner
  const handleRemoveOwner = async () => {
    setIsRemoving(true);
    try {
      const success = await removeOwner();
      if (success) {
        toast.success("Đã gỡ người phụ trách");
        onAssigned?.();
        onOpenChange(false);
      } else {
        toast.error("Không thể gỡ người phụ trách");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {isOwnerAssigned 
              ? (isAdmin ? "Chuyển giao phụ trách" : "Không thể chuyển giao") 
              : (isAdmin ? "Gán nhân viên phụ trách" : "Nhận phụ trách")}
          </DialogTitle>
        </DialogHeader>

        {/* Non-admin cannot transfer - show message */}
        {!canTransfer && (
          <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 text-sm text-warning dark:text-warning">
            <strong>Booking đã có người phụ trách.</strong>
            <br />
            Bạn không có quyền chuyển giao. Vui lòng liên hệ Admin nếu cần thay đổi.
          </div>
        )}

        {/* Self-assign info for non-admin */}
        {showSelfAssignInfo && (
          <div className="bg-info/10 border border-info/20 dark:border-info rounded-lg p-3 text-sm text-info dark:text-info">
            Bạn có thể <strong>nhận phụ trách</strong> booking này cho chính mình.
          </div>
        )}

        {canTransfer && (
        <div className="space-y-4">
          {/* Search - only show for admin */}
          {isAdmin && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm theo tên hoặc email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          )}

          {/* Department Filter - only show for admin */}
          {isAdmin && (
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Bộ phận:</Label>
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="CSKH">CSKH</SelectItem>
                <SelectItem value="FOH">FOH</SelectItem>
                <SelectItem value="SALE">Sale</SelectItem>
                <SelectItem value="KE_TOAN">Kế toán</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          )}

          {/* User List */}
          <div className="border rounded-lg max-h-[280px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Không tìm thấy nhân viên</p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredUsers.map((u) => {
                  const isSelected = selectedUserId === u.id;
                  const isCurrent = currentOwnerId === u.id;
                  const displayName = u.full_name || u.email;

                  return (
                    <button
                      key={u.id}
                      onClick={() => setSelectedUserId(u.id)}
                      disabled={isCurrent}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 text-left transition-colors",
                        "hover:bg-accent/50",
                        isSelected && "bg-primary/10 border-l-2 border-l-primary",
                        isCurrent && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {getInitials(u.full_name, u.email)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{displayName}</span>
                          {isCurrent && (
                            <Badge variant="outline" className="text-micro">
                              Hiện tại
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {u.email}
                        </p>
                      </div>

                      <Badge
                        variant="outline"
                        className={cn("text-xs shrink-0", DEPARTMENT_COLORS[u.department])}
                      >
                        {DEPARTMENT_LABELS[u.department]}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected User Preview */}
          {selectedUser && (
            <div className="p-3 rounded-lg bg-muted/50 flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback>
                  {getInitials(selectedUser.full_name, selectedUser.email)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-medium">
                  {selectedUser.full_name || selectedUser.email}
                </p>
                <p className="text-xs text-muted-foreground">
                  Sẽ được {isOwnerAssigned ? "chuyển giao" : "gán"} phụ trách booking này
                </p>
              </div>
            </div>
          )}
        </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex gap-2 w-full sm:w-auto">
            {canRemove && (
              <Button 
                variant="destructive" 
                onClick={handleRemoveOwner}
                disabled={isRemoving}
                className="flex-1 sm:flex-none"
              >
                {isRemoving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <UserMinus className="mr-2 h-4 w-4" />
                Gỡ
              </Button>
            )}
          </div>
          <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {canTransfer ? "Hủy" : "Đóng"}
            </Button>
            {canTransfer && (
            <Button
              onClick={handleAssign}
              disabled={!selectedUserId || isAssigning || currentOwnerId === selectedUserId}
            >
              {isAssigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isAdmin 
                ? (isOwnerAssigned ? "Chuyển giao" : "Gán phụ trách")
                : "Nhận phụ trách"}
            </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AssignOwnerDialog;
