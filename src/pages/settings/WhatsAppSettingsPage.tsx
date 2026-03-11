import { useState, useEffect, useMemo } from 'react';
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import {
  useWhatsAppIntegration,
  useSaveWhatsAppIntegration,
  useTestSendWhatsApp,
  useWhatsAppHealth,
  generateVerifyToken,
} from '@/hooks/useWhatsAppIntegration';
import {
  MessageCircle,
  Check,
  X,
  Copy,
  RefreshCw,
  Send,
  Shield,
  AlertTriangle,
  ExternalLink,
  Eye,
  EyeOff,
  QrCode,
  Loader2,
  Info,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// =========================================================================
// Minimal QR Code component — uses external API with offline fallback.
// If image fails to load (offline / service down), shows plain link + copy.
// =========================================================================
function QRCodeDisplay({ url }: { url: string }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    // Offline / service-down fallback — show copyable link
    return (
      <div className="flex flex-col items-center gap-3 p-4 border rounded-lg bg-muted/30">
        <QrCode className="h-12 w-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">
          QR không khả dụng (offline). Sử dụng link bên dưới:
        </p>
        <code className="text-xs bg-muted p-2 rounded break-all max-w-72 select-all">
          {url}
        </code>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="border rounded-lg p-2 bg-white">
        <img
          src={qrUrl}
          alt="QR Code"
          className="w-48 h-48"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      </div>
      <p className="text-xs text-muted-foreground text-center max-w-64">
        Quét mã QR bằng điện thoại để mở trang kết nối WhatsApp
      </p>
    </div>
  );
}

// =========================================================================
// MAIN PAGE
// =========================================================================
export default function WhatsAppSettingsPage() {
  const { user, userRole } = useAuth();
  const { data: integration, isLoading } = useWhatsAppIntegration();
  const saveMutation = useSaveWhatsAppIntegration();
  const testSendMutation = useTestSendWhatsApp();
  const { data: health } = useWhatsAppHealth(integration?.phone_number_id);

  // Form state
  const [wabaId, setWabaId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [displayPhone, setDisplayPhone] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [accessTokenRef, setAccessTokenRef] = useState('');
  const [appSecretRef, setAppSecretRef] = useState('');

  // Test send
  const [testPhone, setTestPhone] = useState('');

  // UI
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showAppSecret, setShowAppSecret] = useState(false);

  // Populate form from existing integration
  useEffect(() => {
    if (integration) {
      setWabaId(integration.waba_id || '');
      setPhoneNumberId(integration.phone_number_id || '');
      setDisplayPhone(integration.display_phone || '');
      setVerifyToken(integration.verify_token || '');
      // Don't populate secret refs — they are masked
      setAccessTokenRef('');
      setAppSecretRef('');
    }
  }, [integration]);

  // Computed
  const isConnected = integration?.status === 'active';
  const isUpdate = !!integration;
  const webhookUrl = useMemo(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) return '(Không xác định)';
    return `${supabaseUrl}/functions/v1/whatsapp-webhook`;
  }, []);

  const connectUrl = useMemo(() => {
    const origin = window.location.origin;
    return `${origin}/settings/whatsapp?tenant=${user?.id || ''}`;
  }, [user?.id]);

  // Permission check
  const canManage = userRole === 'admin' || userRole === 'super_admin';

  if (!canManage) {
    return (
      <>
        <div className="flex items-center justify-center h-[60vh]">
          <Alert className="max-w-md">
            <Shield className="h-4 w-4" />
            <AlertDescription>
              Bạn không có quyền quản lý kết nối WhatsApp. Vui lòng liên hệ Admin.
            </AlertDescription>
          </Alert>
        </div>
      </>
    );
  }

  // Validation
  const formValid =
    wabaId.trim().length > 0 &&
    phoneNumberId.trim().length > 0 &&
    verifyToken.trim().length > 0 &&
    (isUpdate || (accessTokenRef.trim().length > 0 && appSecretRef.trim().length > 0));

  const handleSave = async () => {
    if (!formValid) return;
    await saveMutation.mutateAsync({
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      display_phone: displayPhone,
      verify_token: verifyToken,
      access_token_ref: accessTokenRef,
      app_secret_ref: appSecretRef,
    });
  };

  const handleTestSend = async () => {
    if (!testPhone.trim() || !integration?.phone_number_id) return;
    await testSendMutation.mutateAsync({
      toPhone: testPhone,
      phoneNumberId: integration.phone_number_id,
    });
  };

  const handleGenerateToken = () => {
    setVerifyToken(generateVerifyToken());
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Đã copy ${label}`);
  };

  if (isLoading) {
    return (
      <>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="WhatsApp Settings" subtitle="Cài đặt WhatsApp" />
      <PageContainer>
        <SectionCard>
          <div className="space-y-4">
            {/* ============================================================ */}
            {/* Card 1: Connection Status */}
            {/* ============================================================ */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Trạng thái kết nối
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 mb-4">
                  <Badge
                    variant={isConnected ? 'default' : 'secondary'}
                    className={cn(
                      'text-sm px-3 py-1',
                      isConnected && 'bg-success/10 text-success dark:bg-success/10'
                    )}
                  >
                    {isConnected ? (
                      <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Đã kết nối</>
                    ) : (
                      <><XCircle className="h-3.5 w-3.5 mr-1.5" /> Chưa kết nối</>
                    )}
                  </Badge>
                </div>

                {isConnected && integration && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">WABA ID:</span>
                      <span className="ml-2 font-mono">{integration.waba_id}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Phone Number ID:</span>
                      <span className="ml-2 font-mono">{integration.phone_number_id}</span>
                    </div>
                    {integration.display_phone && (
                      <div>
                        <span className="text-muted-foreground">Số điện thoại:</span>
                        <span className="ml-2">{integration.display_phone}</span>
                      </div>
                    )}
                    {health?.last_webhook_received_at && (
                      <div>
                        <span className="text-muted-foreground">Webhook cuối:</span>
                        <span className="ml-2">
                          {formatDistanceToNow(new Date(health.last_webhook_received_at), { addSuffix: true, locale: vi })}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {!isConnected && (
                  <p className="text-sm text-muted-foreground">
                    Chưa có kết nối WhatsApp nào. Điền thông tin bên dưới để bắt đầu.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* ============================================================ */}
            {/* Card 2: QR / Mobile Connect */}
            {/* ============================================================ */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <QrCode className="h-4 w-4" />
                  Kết nối bằng QR
                </CardTitle>
                <CardDescription>
                  Quét mã QR trên điện thoại hoặc chia sẻ link để mở trang cấu hình
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <QRCodeDisplay url={connectUrl} />
                  <div className="flex flex-col gap-3 flex-1">
                    <div className="border rounded-lg p-3 bg-muted/50">
                      <p className="text-xs text-muted-foreground mb-1">Link kết nối:</p>
                      <code className="text-xs break-all select-all">{connectUrl}</code>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(connectUrl, 'link')}
                      >
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Copy link
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(connectUrl, '_blank')}
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Mở trên điện thoại
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ============================================================ */}
            {/* Card 3: Configuration Form */}
            {/* ============================================================ */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  Thông tin cấu hình
                </CardTitle>
                <CardDescription>
                  Nhập thông tin từ Meta Developer Portal để kết nối WhatsApp Business API
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Guide */}
                <Alert className="border-info/20 bg-info/10 dark:border-info">
                  <Info className="h-4 w-4 text-info" />
                  <AlertDescription className="text-info text-xs space-y-1">
                    <p><strong>Lấy thông tin ở đâu trên Meta:</strong></p>
                    <ul className="list-disc ml-4 space-y-0.5">
                      <li><strong>WABA ID:</strong> WhatsApp Manager → Business Account Settings</li>
                      <li><strong>Phone Number ID:</strong> Meta Developer → WhatsApp → API Setup</li>
                      <li><strong>App Secret:</strong> Meta Developer → Settings → Basic</li>
                      <li><strong>Access Token:</strong> Meta Developer → WhatsApp → API Setup (temporary) hoặc System User token</li>
                    </ul>
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* WABA ID */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">
                      WABA ID <span className="text-destructive">*</span>
                    </label>
                    <Input
                      value={wabaId}
                      onChange={(e) => setWabaId(e.target.value)}
                      placeholder="Ví dụ: 123456789012345"
                    />
                  </div>

                  {/* Phone Number ID */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">
                      Phone Number ID <span className="text-destructive">*</span>
                    </label>
                    <Input
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                      placeholder="Ví dụ: 109876543210"
                    />
                  </div>

                  {/* Display Phone */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Số điện thoại hiển thị</label>
                    <Input
                      value={displayPhone}
                      onChange={(e) => setDisplayPhone(e.target.value)}
                      placeholder="Ví dụ: +84 901 234 567"
                    />
                    <p className="text-xs text-muted-foreground">Tùy chọn, chỉ để hiển thị</p>
                  </div>

                  {/* Verify Token */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">
                      Verify Token <span className="text-destructive">*</span>
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={verifyToken}
                        onChange={(e) => setVerifyToken(e.target.value)}
                        placeholder="rr_verify_..."
                        className="flex-1"
                      />
                      <Button variant="outline" size="icon" onClick={handleGenerateToken} title="Tạo token ngẫu nhiên">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Copy vào Meta Webhook settings → Verify Token</p>
                  </div>
                </div>

                <Separator />

                {/* Secrets Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-warning" />
                    <span className="text-sm font-medium">Secrets (ENV references)</span>
                  </div>

                  <Alert className="border-warning/20 bg-warning/10">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    <AlertDescription className="text-warning text-xs">
                      <strong>Bảo mật:</strong> Nhập tên biến môi trường (ENV var name) đã được set trên Supabase,
                      ví dụ: <code className="bg-warning/10 dark:bg-warning px-1 rounded">WHATSAPP_ACCESS_TOKEN</code>.
                      Không nhập token/secret trực tiếp. Giá trị thật được lưu trong Supabase Secrets.
                      {isUpdate && (
                        <span className="block mt-1">
                          Để trống nếu không muốn thay đổi giá trị hiện tại.
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Access Token Ref */}
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">
                        Access Token Ref {!isUpdate && <span className="text-destructive">*</span>}
                      </label>
                      <div className="relative">
                        <Input
                          type={showAccessToken ? 'text' : 'password'}
                          value={accessTokenRef}
                          onChange={(e) => setAccessTokenRef(e.target.value)}
                          placeholder={isUpdate ? '(giữ nguyên)' : 'WHATSAPP_ACCESS_TOKEN'}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAccessToken(!showAccessToken)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showAccessToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {isUpdate && integration?.access_token_ref && (
                        <p className="text-xs text-muted-foreground">
                          Hiện tại: <code className="bg-muted px-1 rounded">{integration.access_token_ref}</code>
                        </p>
                      )}
                    </div>

                    {/* App Secret Ref */}
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">
                        App Secret Ref {!isUpdate && <span className="text-destructive">*</span>}
                      </label>
                      <div className="relative">
                        <Input
                          type={showAppSecret ? 'text' : 'password'}
                          value={appSecretRef}
                          onChange={(e) => setAppSecretRef(e.target.value)}
                          placeholder={isUpdate ? '(giữ nguyên)' : 'WHATSAPP_APP_SECRET'}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAppSecret(!showAppSecret)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showAppSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {isUpdate && integration?.app_secret_ref && (
                        <p className="text-xs text-muted-foreground">
                          Hiện tại: <code className="bg-muted px-1 rounded">{integration.app_secret_ref}</code>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Webhook URL (read-only) */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Webhook URL</label>
                  <div className="flex gap-2">
                    <Input
                      value={webhookUrl}
                      readOnly
                      className="bg-muted font-mono text-xs"
                    />
                    <Button variant="outline" size="icon" onClick={() => handleCopy(webhookUrl, 'Webhook URL')}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Paste URL này vào Meta Developer → WhatsApp → Configuration → Webhook URL
                  </p>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleSave}
                    disabled={!formValid || saveMutation.isPending}
                    className="min-w-[160px]"
                  >
                    {saveMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Đang lưu...</>
                    ) : (
                      <><Check className="h-4 w-4 mr-2" /> {isUpdate ? 'Cập nhật' : 'Lưu & Kết nối'}</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ============================================================ */}
            {/* Card 4: Testing */}
            {/* ============================================================ */}
            {isConnected && integration && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    Kiểm tra
                  </CardTitle>
                  <CardDescription>
                    Gửi tin nhắn test hoặc kiểm tra trạng thái webhook
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Test Send */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Gửi tin test (template: hello_world)</label>
                    <div className="flex gap-2">
                      <Input
                        value={testPhone}
                        onChange={(e) => setTestPhone(e.target.value)}
                        placeholder="Số điện thoại test (VD: 84901234567)"
                        className="flex-1"
                      />
                      <Button
                        onClick={handleTestSend}
                        disabled={!testPhone.trim() || testSendMutation.isPending}
                        variant="outline"
                      >
                        {testSendMutation.isPending ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Đang gửi...</>
                        ) : (
                          <><Send className="h-4 w-4 mr-2" /> Gửi test</>
                        )}
                      </Button>
                    </div>
                    {testSendMutation.isSuccess && (
                      <Alert className="border-success/20 bg-success/10 dark:bg-success/10">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <AlertDescription className="text-success text-sm">
                          Tin nhắn test đã gửi thành công! Kiểm tra WhatsApp trên điện thoại.
                        </AlertDescription>
                      </Alert>
                    )}
                    {testSendMutation.isError && (
                      <Alert variant="destructive">
                        <XCircle className="h-4 w-4" />
                        <AlertDescription className="text-sm">
                          {testSendMutation.error?.message || 'Gửi test thất bại'}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <Separator />

                  {/* Webhook Health */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Webhook Health
                    </label>
                    {health ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="border rounded-lg p-3 text-center">
                          <div className="text-hero-kpi font-bold tabular-nums tracking-tight">{health.total_webhooks_24h}</div>
                          <p className="text-xs text-muted-foreground">Webhook 24h</p>
                        </div>
                        <div className="border rounded-lg p-3 text-center">
                          <div className={cn(
                            'text-hero-kpi font-bold tabular-nums tracking-tight',
                            health.signature_invalid_24h > 0 ? 'text-destructive' : 'text-success'
                          )}>
                            {health.signature_invalid_24h}
                          </div>
                          <p className="text-xs text-muted-foreground">Signature lỗi 24h</p>
                        </div>
                        <div className="border rounded-lg p-3 text-center">
                          {health.last_webhook_received_at ? (
                            <>
                              <div className="text-sm font-medium">
                                {format(new Date(health.last_webhook_received_at), 'HH:mm dd/MM', { locale: vi })}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(health.last_webhook_received_at), { addSuffix: true, locale: vi })}
                              </p>
                            </>
                          ) : (
                            <>
                              <div className="text-sm font-medium text-muted-foreground">—</div>
                              <p className="text-xs text-muted-foreground">Chưa có webhook</p>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Chưa có dữ liệu webhook. Hãy nhắn tin vào số WhatsApp Business để test.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </SectionCard>
      </PageContainer>
    </>
  );
}
