import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Shield, Eye, EyeOff, Check, X, Info } from "lucide-react";

type AppRole = "admin" | "sale" | "cskh" | "ke_toan" | "ota_lead" | "ota_staff";

interface AddUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const roleLabels: Record<AppRole, string> = {
  admin: "Chủ đầu tư",
  ke_toan: "Kế toán",
  cskh: "CSKH",
  sale: "Vận hành",
  ota_lead: "OTA Lead",
  ota_staff: "OTA Staff",
};

const roleDescriptions: Record<AppRole, string> = {
  admin: "Toàn quyền quản lý nghiệp vụ",
  ke_toan: "Tài chính, Thu/Chi, Quyết toán",
  cskh: "Hỗ trợ khách hàng, Dịch vụ",
  sale: "Vận hành, Nhận/Trả phòng",
  ota_lead: "Quản lý đội OTA, Tasks, KPI",
  ota_staff: "Xử lý tasks OTA",
};

export function AddUserDialog({ open, onOpenChange }: AddUserDialogProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<AppRole>("sale");

  // Password strength validation
  const passwordStrength = useMemo(() => {
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
    };
    const score = Object.values(checks).filter(Boolean).length;
    return { checks, score, isStrong: score >= 3 && password.length >= 6 };
  }, [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !fullName || !password || !role) {
      toast.error("Vui lòng điền đầy đủ thông tin");
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Email không hợp lệ");
      return;
    }

    if (password.length < 6) {
      toast.error("Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }

    setLoading(true);

    try {
      // 1. Create user account using signUp
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      if (!signUpData.user) {
        throw new Error("Không thể tạo tài khoản");
      }

      // 2. Assign role to user
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: signUpData.user.id,
          role: role,
        });

      if (roleError) {
        console.error("Role assignment error:", roleError);
        toast.warning("Tạo tài khoản thành công nhưng chưa gán được vai trò. Vui lòng gán vai trò thủ công.");
      } else {
        toast.success(`Đã tạo tài khoản ${fullName} với vai trò ${roleLabels[role]}`);
      }

      // Reset form
      setEmail("");
      setFullName("");
      setPassword("");
      setRole("sale");

      // Refresh users list
      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });

      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating user:", error);
      if (error.message?.includes("already registered")) {
        toast.error("Email đã được sử dụng");
      } else {
        toast.error(error.message || "Lỗi khi tạo người dùng");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            Thêm người dùng mới
          </DialogTitle>
          <DialogDescription>
            Tạo tài khoản và gán vai trò. Vai trò được lưu riêng biệt, bảo mật bằng RLS.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fullName">Họ và tên <span className="text-destructive">*</span></Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.toLowerCase().trim())}
                placeholder="email@company.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Mật khẩu <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                minLength={6}
                required
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {/* Password strength indicator */}
            {password.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`h-1 flex-1 rounded-full transition-colors ${passwordStrength.score >= level
                          ? passwordStrength.score >= 3
                            ? "bg-success"
                            : passwordStrength.score >= 2
                              ? "bg-warning"
                              : "bg-destructive"
                          : "bg-muted"
                        }`}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className={`flex items-center gap-1 ${passwordStrength.checks.length ? "text-success" : "text-muted-foreground"}`}>
                    {passwordStrength.checks.length ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    Ít nhất 8 ký tự
                  </div>
                  <div className={`flex items-center gap-1 ${passwordStrength.checks.uppercase ? "text-success" : "text-muted-foreground"}`}>
                    {passwordStrength.checks.uppercase ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    Chữ hoa
                  </div>
                  <div className={`flex items-center gap-1 ${passwordStrength.checks.lowercase ? "text-success" : "text-muted-foreground"}`}>
                    {passwordStrength.checks.lowercase ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    Chữ thường
                  </div>
                  <div className={`flex items-center gap-1 ${passwordStrength.checks.number ? "text-success" : "text-muted-foreground"}`}>
                    {passwordStrength.checks.number ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    Số
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Vai trò <span className="text-destructive">*</span></Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(roleLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    <div className="flex flex-col">
                      <span>{label}</span>
                      <span className="text-xs text-muted-foreground">{roleDescriptions[value as AppRole]}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Security notice */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Người dùng sẽ nhận được email xác nhận. Vai trò có thể được thay đổi sau khi tạo tài khoản.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Tạo tài khoản
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
