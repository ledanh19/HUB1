/**
 * OTA Operations - Project Members Panel
 * 
 * Phase B: Manages project team members
 * - View all members with roles
 * - Add new members (Lead/Admin only)
 * - Remove members (Lead/Admin only)
 * - Change member roles (Admin only for Admin changes)
 */

import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  UserMinus, 
  Shield, 
  Crown,
  Loader2,
  Search,
  MoreHorizontal,
  CheckCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { 
  useOtaProjectMembers, 
  useAddProjectMember, 
  useRemoveProjectMember,
  useUpdateProjectMemberRole,
  ProjectMember,
} from '@/hooks/useOtaOperations';
import { OtaRoleGate } from '@/components/ui/OtaRoleGate';
import { toast } from "sonner";
import { supabase, safeRpc } from "@/integrations/supabase";

// ============================================================
// CONSTANTS
// ============================================================

const ROLE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  ADMIN: { label: 'Admin', icon: <Crown className="h-3 w-3" />, color: 'bg-warning/100' },
  LEAD: { label: 'Lead', icon: <Shield className="h-3 w-3" />, color: 'bg-info/100' },
  STAFF: { label: 'Staff', icon: <Users className="h-3 w-3" />, color: 'bg-muted0' },
};

// ============================================================
// COMPONENTS
// ============================================================

function RoleBadge({ role }: { role: string }) {
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.STAFF;
  return (
    <Badge className={`${config.color} text-white flex items-center gap-1`}>
      {config.icon}
      {config.label}
    </Badge>
  );
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface AddMemberDialogProps {
  projectId: string;
  existingMemberIds: string[];
  onSuccess: () => void;
}

function AddMemberDialog({ projectId, existingMemberIds, onSuccess }: AddMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<'STAFF' | 'LEAD' | 'ADMIN'>('STAFF');
  const [users, setUsers] = useState<Array<{ id: string; email: string; full_name: string }>>([]);
  const [loading, setLoading] = useState(false);
  
  const addMember = useAddProjectMember();
  
  // Search users via ota_get_staff_list RPC
  const handleSearch = async () => {
    if (searchTerm.length < 2) return;
    
    setLoading(true);
    try {
      // Use ota_get_staff_list RPC to get OTA-eligible users
      const { data, error } = await safeRpc(() => supabase.rpc('ota_get_staff_list'));
      
      if (error) {
        console.error('Search error:', error);
        setUsers([]);
      } else {
        // Filter by search term and exclude existing members
        const dataArray = Array.isArray(data) ? data : [];
        const filtered = dataArray
          .filter((u: any) => 
            !existingMemberIds.includes(u.user_id) &&
            (u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
             u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()))
          )
          .map((u: any) => ({
            id: u.user_id,
            email: u.email || '',
            full_name: u.full_name || u.email || 'Unknown',
          }));
        setUsers(filtered);
      }
    } catch (err) {
      console.error('Failed to search users:', err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };
  
  const handleAdd = async () => {
    if (!selectedUserId) return;
    
    try {
      await addMember.mutateAsync({
        projectId,
        userId: selectedUserId,
        role: selectedRole,
      });
      
      toast.success("Đã thêm thành viên", { description: "Thành viên mới đã được thêm vào project" });
      
      setOpen(false);
      setSelectedUserId('');
      setSearchTerm('');
      setUsers([]);
      onSuccess();
    } catch (err: any) {
      toast.error("Lỗi", { description: err.message || "Không thể thêm thành viên" });
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Thêm thành viên
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Thêm thành viên vào Project</DialogTitle>
          <DialogDescription>
            Tìm kiếm và thêm người dùng vào project
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Search */}
          <div className="flex gap-2">
            <Input
              placeholder="Tìm theo email hoặc tên..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button variant="outline" onClick={handleSearch} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          
          {/* User List */}
          {users.length > 0 && (
            <div className="border rounded-lg divide-y max-h-48 overflow-auto">
              {users.map((user) => (
                <div
                  key={user.id}
                  className={`p-3 cursor-pointer hover:bg-muted transition-colors flex items-center justify-between ${
                    selectedUserId === user.id ? 'bg-muted' : ''
                  }`}
                  onClick={() => setSelectedUserId(user.id)}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {getInitials(user.full_name || user.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{user.full_name || 'Chưa có tên'}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  {selectedUserId === user.id && (
                    <CheckCircle className="h-4 w-4 text-success" />
                  )}
                </div>
              ))}
            </div>
          )}
          
          {/* Role Selection */}
          {selectedUserId && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Vai trò trong project</label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STAFF">Staff - Thực hiện task được giao</SelectItem>
                  <SelectItem value="LEAD">Lead - Quản lý task & review</SelectItem>
                  <SelectItem value="ADMIN">Admin - Toàn quyền trong project</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Hủy
          </Button>
          <Button onClick={handleAdd} disabled={!selectedUserId || addMember.isPending}>
            {addMember.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Thêm thành viên
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

interface ProjectMembersPanelProps {
  projectId: string;
}

export function ProjectMembersPanel({ projectId }: ProjectMembersPanelProps) {
  
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);
  const [roleChangeDialog, setRoleChangeDialog] = useState<{
    userId: string;
    currentRole: string;
    displayName: string;
  } | null>(null);
  
  // Fetch members
  const { data: membersData, isLoading, refetch } = useOtaProjectMembers(projectId);
  
  // Mutations
  const removeMember = useRemoveProjectMember();
  const updateRole = useUpdateProjectMemberRole();
  
  // ============================================================
  // HANDLERS
  // ============================================================
  
  const handleRemoveMember = async () => {
    if (!removeMemberId) return;
    
    try {
      await removeMember.mutateAsync({
        projectId,
        userId: removeMemberId,
      });
      
      toast.success("Đã xóa thành viên", { description: "Thành viên đã được xóa khỏi project" });
      
      setRemoveMemberId(null);
    } catch (err: any) {
      toast.error("Lỗi", { description: err.message || "Không thể xóa thành viên" });
    }
  };
  
  const handleRoleChange = async (newRole: 'STAFF' | 'LEAD' | 'ADMIN') => {
    if (!roleChangeDialog) return;
    
    try {
      await updateRole.mutateAsync({
        projectId,
        userId: roleChangeDialog.userId,
        newRole,
      });
      
      toast.success("Đã cập nhật vai trò", { description: `Vai trò đã được đổi thành ${ROLE_CONFIG[newRole].label}` });
      
      setRoleChangeDialog(null);
    } catch (err: any) {
      toast.error("Lỗi", { description: err.message || "Không thể cập nhật vai trò" });
    }
  };
  
  // ============================================================
  // RENDER
  // ============================================================
  
  const members = membersData?.members || [];
  const existingMemberIds = members.map(m => m.user_id);
  const activeMembers = members.filter(m => m.is_active);
  const inactiveMembers = members.filter(m => !m.is_active);
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Thành viên Project</CardTitle>
          <CardDescription>
            {activeMembers.length} thành viên đang hoạt động
          </CardDescription>
        </div>
        <OtaRoleGate requireRole={["ota_lead", "admin", "super_admin"]}>
          <AddMemberDialog 
            projectId={projectId}
            existingMemberIds={existingMemberIds}
            onSuccess={() => refetch()}
          />
        </OtaRoleGate>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : membersData?.error === 'RPC_NOT_FOUND' ? (
          <Alert>
            <AlertDescription>
              {membersData.message || 'Chức năng quản lý thành viên chưa được cài đặt.'}
            </AlertDescription>
          </Alert>
        ) : activeMembers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Chưa có thành viên nào trong project này</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Active Members */}
            <div className="space-y-2">
              {activeMembers.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center justify-between p-4 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>
                        {getInitials(member.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{member.display_name}</p>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <RoleBadge role={member.role} />
                    <span className="text-xs text-muted-foreground">
                      Từ {format(new Date(member.assigned_at), 'dd/MM/yyyy', { locale: vi })}
                    </span>
                    
                    <OtaRoleGate requireRole={["ota_lead", "admin", "super_admin"]}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setRoleChangeDialog({
                              userId: member.user_id,
                              currentRole: member.role,
                              displayName: member.display_name,
                            })}
                          >
                            <Shield className="mr-2 h-4 w-4" />
                            Đổi vai trò
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setRemoveMemberId(member.user_id)}
                          >
                            <UserMinus className="mr-2 h-4 w-4" />
                            Xóa khỏi project
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </OtaRoleGate>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Inactive Members */}
            {inactiveMembers.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  Đã rời khỏi project ({inactiveMembers.length})
                </h4>
                <div className="space-y-2 opacity-60">
                  {inactiveMembers.map((member) => (
                    <div
                      key={member.user_id}
                      className="flex items-center justify-between p-3 rounded-lg border border-dashed"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {getInitials(member.display_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm">{member.display_name}</p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">Inactive</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Remove Confirmation Dialog */}
        <AlertDialog open={!!removeMemberId} onOpenChange={() => setRemoveMemberId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xác nhận xóa thành viên</AlertDialogTitle>
              <AlertDialogDescription>
                Thành viên này sẽ không còn quyền truy cập project. Tasks được giao cho họ sẽ vẫn được giữ lại.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleRemoveMember}
                className="bg-destructive text-destructive-foreground"
              >
                {removeMember.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Xóa thành viên
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        
        {/* Role Change Dialog */}
        <Dialog open={!!roleChangeDialog} onOpenChange={() => setRoleChangeDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Đổi vai trò thành viên</DialogTitle>
              <DialogDescription>
                Chọn vai trò mới cho {roleChangeDialog?.displayName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {(['STAFF', 'LEAD', 'ADMIN'] as const).map((role) => (
                <div
                  key={role}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    roleChangeDialog?.currentRole === role 
                      ? 'border-primary bg-primary/5' 
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => handleRoleChange(role)}
                >
                  <div className="flex items-center gap-3">
                    <RoleBadge role={role} />
                    <div>
                      <p className="font-medium">{ROLE_CONFIG[role].label}</p>
                      <p className="text-xs text-muted-foreground">
                        {role === 'STAFF' && 'Thực hiện task được giao'}
                        {role === 'LEAD' && 'Quản lý task, review evidence'}
                        {role === 'ADMIN' && 'Toàn quyền trong project'}
                      </p>
                    </div>
                    {roleChangeDialog?.currentRole === role && (
                      <CheckCircle className="ml-auto h-4 w-4 text-primary" />
                    )}
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRoleChangeDialog(null)}>
                Đóng
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
