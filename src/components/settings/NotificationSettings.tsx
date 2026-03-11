/**
 * NOTIFICATION SETTINGS COMPONENT
 *
 * Settings tab for managing push notifications:
 * - Enable/disable push notifications
 * - View subscription status
 * - iOS PWA installation guide
 * - Notification preferences (future)
 */

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Bell,
  BellOff,
  Smartphone,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Loader2,
  Share,
  PlusSquare,
  ChevronRight,
  Send,
  Bug,
} from 'lucide-react';
import { useNotificationCenter } from '@/hooks/useNotificationCenter';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DebugPushPanel } from './DebugPushPanel';

// ============================================
// IOS INSTALLATION GUIDE COMPONENT
// ============================================

function IOSInstallGuide() {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border-info/20 bg-info/10/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-info">
          <Smartphone className="h-5 w-5" />
          Hướng dẫn cài đặt cho iOS
        </CardTitle>
        <CardDescription className="text-info">
          Để nhận thông báo trên iPhone/iPad, bạn cần cài app lên màn hình chính
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2">
        <Button
          variant="ghost"
          className="w-full justify-between text-info hover:bg-info/10"
          onClick={() => setExpanded(!expanded)}
        >
          <span>Xem hướng dẫn chi tiết</span>
          <ChevronRight
            className={cn(
              'h-4 w-4 transition-transform',
              expanded && 'rotate-90'
            )}
          />
        </Button>

        {expanded && (
          <div className="mt-4 space-y-4">
            {/* Step 1 */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-info/100 text-white flex items-center justify-center font-semibold">
                1
              </div>
              <div className="flex-1">
                <p className="font-medium text-info">Mở Safari</p>
                <p className="text-sm text-info">
                  Mở trang web này trong trình duyệt Safari (không phải Chrome hay
                  Firefox)
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-info/100 text-white flex items-center justify-center font-semibold">
                2
              </div>
              <div className="flex-1">
                <p className="font-medium text-info flex items-center gap-2">
                  Nhấn nút Share
                  <Share className="h-4 w-4" />
                </p>
                <p className="text-sm text-info">
                  Nhấn vào biểu tượng Share (hình vuông có mũi tên lên) ở thanh công
                  cụ dưới cùng
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-info/100 text-white flex items-center justify-center font-semibold">
                3
              </div>
              <div className="flex-1">
                <p className="font-medium text-info flex items-center gap-2">
                  Thêm vào màn hình chính
                  <PlusSquare className="h-4 w-4" />
                </p>
                <p className="text-sm text-info">
                  Cuộn xuống và chọn "Thêm vào Màn hình chính" (Add to Home Screen)
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-info/100 text-white flex items-center justify-center font-semibold">
                4
              </div>
              <div className="flex-1">
                <p className="font-medium text-info">Xác nhận</p>
                <p className="text-sm text-info">
                  Nhấn "Thêm" (Add) ở góc phải để hoàn tất. Sau đó mở app từ màn hình
                  chính và bật thông báo.
                </p>
              </div>
            </div>

            <Alert className="bg-warning/10 border-warning/20">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning text-sm">
                <strong>Lưu ý:</strong> Push notification trên iOS chỉ hoạt động khi
                app được cài từ Safari và mở từ màn hình chính.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// STATUS BADGE COMPONENT
// ============================================

function StatusBadge({
  enabled,
  permission,
}: {
  enabled: boolean;
  permission: NotificationPermission | 'unsupported';
}) {
  if (permission === 'unsupported') {
    return (
      <Badge variant="secondary" className="gap-1">
        <XCircle className="h-3 w-3" />
        Không hỗ trợ
      </Badge>
    );
  }

  if (permission === 'denied') {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        Đã chặn
      </Badge>
    );
  }

  if (enabled) {
    return (
      <Badge variant="default" className="gap-1 bg-success/100">
        <CheckCircle2 className="h-3 w-3" />
        Đang bật
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1">
      <BellOff className="h-3 w-3" />
      Chưa bật
    </Badge>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function NotificationSettings() {
  const {
    pushSupported,
    pushEnabled,
    pushPermission,
    isInstalledPWA,
    isIOSSafari,
    isEnablingPush,
    error,
    enablePush,
    disablePush,
    refreshStatus,
  } = useNotificationCenter();

  // Refresh status on mount
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Handle toggle
  const handleToggle = async (enabled: boolean) => {
    if (enabled) {
      await enablePush();
    } else {
      await disablePush();
    }
  };

  // Show iOS guide if on iOS Safari and not installed
  const showIOSGuide = isIOSSafari && !isInstalledPWA;

  // Show permission denied warning
  const showPermissionDenied = pushPermission === 'denied';

  // Show not supported warning
  const showNotSupported = !pushSupported;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader className="pb-3 md:pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Bell className="h-4 w-4 md:h-5 md:w-5" />
              Thông báo đẩy
            </CardTitle>
            <StatusBadge enabled={pushEnabled} permission={pushPermission} />
          </div>
          <CardDescription className="text-xs md:text-sm">
            Nhận thông báo ngay khi có đặt phòng mới, thay đổi hoặc tin nhắn từ khách
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Main Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="push-toggle" className="text-sm font-medium">
                Bật thông báo đẩy
              </Label>
              <p className="text-xs text-muted-foreground">
                Nhận thông báo ngay cả khi không mở app
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isEnablingPush && <Loader2 className="h-4 w-4 animate-spin" />}
              <Switch
                id="push-toggle"
                checked={pushEnabled}
                onCheckedChange={handleToggle}
                disabled={
                  isEnablingPush || showNotSupported || showPermissionDenied
                }
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* iOS Installation Guide */}
      {showIOSGuide && <IOSInstallGuide />}

      {/* Permission Denied Warning */}
      {showPermissionDenied && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Quyền thông báo đã bị chặn</AlertTitle>
          <AlertDescription className="mt-2">
            <p>
              Bạn đã chặn quyền thông báo cho trang web này. Để bật lại, bạn cần:
            </p>
            <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
              <li>Mở Cài đặt trình duyệt</li>
              <li>Tìm mục Quyền riêng tư / Thông báo</li>
              <li>Cho phép thông báo cho trang web này</li>
              <li>Tải lại trang và bật lại thông báo</li>
            </ol>
          </AlertDescription>
        </Alert>
      )}

      {/* Not Supported Warning */}
      {showNotSupported && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Trình duyệt không hỗ trợ</AlertTitle>
          <AlertDescription>
            Trình duyệt của bạn không hỗ trợ thông báo đẩy. Vui lòng sử dụng Chrome,
            Firefox, Edge hoặc Safari phiên bản mới nhất.
          </AlertDescription>
        </Alert>
      )}

      {/* Notification Types Card */}
      <Card>
        <CardHeader className="pb-3 md:pb-4">
          <CardTitle className="text-base md:text-lg">
            Loại thông báo
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            Các loại sự kiện sẽ gửi thông báo đến bạn
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Booking New */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                  <span className="text-lg">🆕</span>
                </div>
                <div>
                  <p className="font-medium text-sm">Đặt phòng mới</p>
                  <p className="text-xs text-muted-foreground">
                    Khi có booking mới từ OTA
                  </p>
                </div>
              </div>
              <Switch defaultChecked disabled className="opacity-50" />
            </div>

            <Separator />

            {/* Booking Modified */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-info/10 flex items-center justify-center">
                  <span className="text-lg">✏️</span>
                </div>
                <div>
                  <p className="font-medium text-sm">Thay đổi đặt phòng</p>
                  <p className="text-xs text-muted-foreground">
                    Khi booking được sửa đổi
                  </p>
                </div>
              </div>
              <Switch defaultChecked disabled className="opacity-50" />
            </div>

            <Separator />

            {/* Booking Cancelled */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <span className="text-lg">❌</span>
                </div>
                <div>
                  <p className="font-medium text-sm">Hủy đặt phòng</p>
                  <p className="text-xs text-muted-foreground">
                    Khi booking bị hủy
                  </p>
                </div>
              </div>
              <Switch defaultChecked disabled className="opacity-50" />
            </div>

            <Separator />

            {/* Message Inbound */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-lg">💬</span>
                </div>
                <div>
                  <p className="font-medium text-sm">Tin nhắn từ khách</p>
                  <p className="text-xs text-muted-foreground">
                    Khi nhận tin nhắn mới từ OTA
                  </p>
                </div>
              </div>
              <Switch defaultChecked disabled className="opacity-50" />
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-4 text-center">
            Tùy chỉnh chi tiết sẽ có trong phiên bản sau
          </p>
        </CardContent>
      </Card>

      {/* PWA Status Card */}
      <Card>
        <CardHeader className="pb-3 md:pb-4">
          <CardTitle className="text-base md:text-lg">
            Trạng thái cài đặt
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">VAPID Key:</span>
              <span>
                {pushSupported ? '✅ Đã cấu hình (từ backend)' : '⏳ Đang kiểm tra...'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Push hỗ trợ:</span>
              <span>{pushSupported ? '✅ Có' : '❌ Không'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quyền thông báo:</span>
              <span>
                {pushPermission === 'granted'
                  ? '✅ Đã cấp'
                  : pushPermission === 'denied'
                    ? '❌ Đã chặn'
                    : '⏸️ Chưa cấp'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Đăng ký push:</span>
              <span>{pushEnabled ? '✅ Đã đăng ký' : '❌ Chưa đăng ký'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Chế độ PWA:</span>
              <span>{isInstalledPWA ? '✅ Đã cài app' : '🌐 Trình duyệt'}</span>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={refreshStatus}
            >
              Làm mới trạng thái
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Test Push Card */}
      {pushEnabled && (
        <Card>
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Send className="h-4 w-4 md:h-5 md:w-5" />
              Test Push Notification
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Gửi thử một thông báo đẩy đến thiết bị của bạn
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TestPushButton />
          </CardContent>
        </Card>
      )}

      {/* Debug Panel - Collapsible */}
      <Card>
        <CardHeader className="pb-3 md:pb-4">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <Bug className="h-4 w-4 md:h-5 md:w-5" />
            Debug Push (iOS PWA)
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            Kiểm tra toàn bộ pipeline push notification cho iOS
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DebugPushPanel />
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// TEST PUSH BUTTON COMPONENT
// ============================================

function TestPushButton() {
  const [isSending, setIsSending] = useState(false);

  const handleTestPush = async () => {
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-push', {
        body: {
          title: '🔔 Test từ Roomrise',
          message: 'Nếu bạn thấy thông báo này, Push Notification đang hoạt động!',
        },
      });

      if (error) {
        console.error('Test push error:', error);
        toast.error('Không thể gửi thông báo test', {
          description: error.message,
        });
        return;
      }

      if (data?.success) {
        toast.success('Đã gửi thông báo test!', {
          description: 'Kiểm tra thông báo trên thiết bị của bạn',
        });
      } else {
        toast.warning('Thông báo có thể không được gửi', {
          description: data?.message || 'Kiểm tra logs để biết thêm chi tiết',
        });
      }
    } catch (err) {
      console.error('Test push error:', err);
      toast.error('Lỗi khi gửi thông báo test');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Button
      onClick={handleTestPush}
      disabled={isSending}
      className="w-full gap-2"
    >
      {isSending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang gửi...
        </>
      ) : (
        <>
          <Send className="h-4 w-4" />
          Gửi thông báo test
        </>
      )}
    </Button>
  );
}

export default NotificationSettings;
