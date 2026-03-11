import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Lock, Loader2 } from 'lucide-react';
import { toast } from "sonner";
import { z } from 'zod';
import authBg from '@/assets/auth-background.jpg';
import logoLight from '@/assets/roomrise-logo-light.png';

const loginSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
});

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { signIn, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const validateForm = () => {
    try {
      loginSchema.parse({ email, password });
      setErrors({});
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        err.errors.forEach((e) => {
          if (e.path[0]) {
            newErrors[e.path[0] as string] = e.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error('Đăng nhập thất bại', {
          description: error.message === 'Invalid login credentials'
            ? 'Email hoặc mật khẩu không đúng'
            : error.message,
        });
      } else {
        toast.success('Đăng nhập thành công', {
          description: 'Chào mừng bạn quay trở lại!',
        });
        navigate('/');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Background Image with Branding */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        {/* Background Image */}
        <img
          src={authBg}
          alt="Roomrise Control Hub"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(222,47%,11%)]/95 via-[hsl(222,47%,11%)]/80 to-[hsl(222,47%,11%)]/60" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          {/* Logo */}
          <div>
            <img
              src={logoLight}
              alt="Roomrise"
              className="h-16 w-auto"
            />
          </div>

          {/* Main Text */}
          <div className="max-w-md">
            <h1 className="text-5xl font-bold leading-snug mb-4">
              <span className="text-white drop-shadow-lg">Operation & Finance</span>
              <br />
              <span className="text-[hsl(45,93%,58%)] drop-shadow-lg">Control Hub</span>
            </h1>
            <p className="text-lg text-white/90 leading-relaxed drop-shadow-md">
              Nền tảng quản lý vận hành và tài chính toàn diện cho ngành hospitality. Tập trung. Chính xác. Hiệu quả.
            </p>

            {/* Feature highlights */}
            <div className="mt-10 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-[hsl(45,93%,58%)] shadow-lg shadow-[hsl(45,93%,58%)]/30" />
                <span className="text-white/80 text-sm font-medium">Quản lý booking đa kênh OTA</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-[hsl(45,93%,58%)] shadow-lg shadow-[hsl(45,93%,58%)]/30" />
                <span className="text-white/80 text-sm font-medium">Theo dõi công nợ & quyết toán Host</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-[hsl(45,93%,58%)] shadow-lg shadow-[hsl(45,93%,58%)]/30" />
                <span className="text-white/80 text-sm font-medium">Báo cáo tài chính realtime</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-white/40 text-sm">
            © 2025 Roomrise. All rights reserved.
          </div>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-12 bg-background">
        <div className="w-full max-w-sm">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <img
              src={logoLight}
              alt="Roomrise"
              className="h-8 w-auto mx-auto mb-2 dark:block hidden"
            />
            <img
              src={logoLight}
              alt="Roomrise"
              className="h-8 w-auto mx-auto mb-2 dark:hidden filter invert"
            />
            <p className="text-xs text-muted-foreground">
              Operation & Finance Control Hub
            </p>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight">
              Chào mừng trở lại
            </h2>
            <p className="text-muted-foreground mt-2">
              Nhập thông tin đăng nhập để tiếp tục
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="email@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-11 bg-muted/50 border-border/50 focus:bg-background transition-colors"
                />
              </div>
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Mật khẩu
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-11 bg-muted/50 border-border/50 focus:bg-background transition-colors"
                />
              </div>
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-11 font-medium text-sm"
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Đăng nhập
            </Button>
          </form>

          {/* Internal app notice */}
          <div className="mt-8 text-center">
            <p className="text-xs text-muted-foreground">
              Đây là ứng dụng nội bộ. Liên hệ quản trị viên để được cấp tài khoản.
            </p>
          </div>

          {/* Mobile Footer */}
          <p className="lg:hidden text-center text-xs text-muted-foreground mt-8">
            © 2025 Roomrise. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
