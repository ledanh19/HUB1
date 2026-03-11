/**
 * DEBUG PUSH PANEL
 *
 * Comprehensive diagnostic panel for iOS PWA push notification debugging.
 * Includes Re-subscribe button for manual subscription renewal.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { toast } from "sonner";
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  isPushSupported,
  isInstalledPWA,
  isIOSSafari,
  getRegistrationStatus,
  setupPushNotifications,
  getCurrentPushSubscription,
  unsubscribeFromPush,
  savePushSubscriptionToBackend,
  removePushSubscriptionFromBackend,
  getVapidKeyInfo,
  fullResubscribeWithNewVapidKey,
  type RegistrationStatus,
  type VapidKeyInfo,
} from '@/pwa/registerSW';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Bell,
  Send,
  RefreshCw,
  Bug,
  Info,
  RotateCcw,
  Trash2,
  Key,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

type CheckStatus = 'pass' | 'fail' | 'warning' | 'loading' | 'unknown';

interface CheckResult {
  id: string;
  name: string;
  status: CheckStatus;
  details: string;
  action?: string;
}

interface SubscriptionInfo {
  endpoint: string;
  endpointShort: string;
  created_at: string | null;
  is_active: boolean;
  consecutive_failures: number;
}

interface TestPushResult {
  success: boolean;
  summary?: {
    total: number;
    sent: number;
    failed: number;
    expired: number;
    duplicates: number;
  };
  failures?: Array<{
    endpointShort: string;
    userId: string;
    statusCode: number | null;
    reason: string;
    bodySnippet: string | null;
  }>;
  needResubscribe?: boolean;
  vapidFingerprint?: string;
  requestId?: string;
}

// ============================================
// COMPONENT
// ============================================

export function DebugPushPanel() {
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isTestingPush, setIsTestingPush] = useState(false);
  const [isResubscribing, setIsResubscribing] = useState(false);
  const [isFullResubscribing, setIsFullResubscribing] = useState(false);
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<TestPushResult | null>(null);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [vapidInfo, setVapidInfo] = useState<VapidKeyInfo | null>(null);

  // Quick state
  const [isPWA, setIsPWA] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [swState, setSwState] = useState('unknown');
  const [backendSubCount, setBackendSubCount] = useState(0);

  // Add log entry
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toISOString().substring(11, 23);
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 49)]);
  }, []);

  // Get endpoint short helper
  const getEndpointShort = (endpoint: string) => {
    if (!endpoint || endpoint.length < 30) return endpoint;
    return `${endpoint.substring(0, 20)}...${endpoint.substring(endpoint.length - 6)}`;
  };

  // ============================================
  // CHECKS
  // ============================================

  const runAllChecks = useCallback(async () => {
    setIsLoading(true);
    setLogs([]);
    addLog('Starting diagnostics...');

    const results: CheckResult[] = [];

    // B1: PWA Mode
    const isPWAMode = isInstalledPWA();
    const isIOSSafari_ = isIOSSafari();
    setIsPWA(isPWAMode);
    setIsIOS(isIOSSafari_);
    addLog(`PWA: ${isPWAMode}, iOS: ${isIOSSafari_}`);
    results.push({
      id: 'B1',
      name: 'PWA Mode',
      status: isPWAMode ? 'pass' : 'warning',
      details: isPWAMode ? 'Running as installed PWA' : 'Running in browser. Add to Home Screen for reliable push.',
    });

    // B2: Service Worker
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const reg = registrations.find(r => r.scope.endsWith('/'));
        const state = reg?.active ? 'ACTIVE' : reg?.waiting ? 'WAITING' : reg?.installing ? 'INSTALLING' : 'NONE';
        setSwState(state);
        addLog(`SW state: ${state}`);
        results.push({
          id: 'B2',
          name: 'Service Worker',
          status: state === 'ACTIVE' ? 'pass' : state === 'NONE' ? 'fail' : 'warning',
          details: `State: ${state}`,
        });
      } catch (err) {
        results.push({ id: 'B2', name: 'Service Worker', status: 'fail', details: `Error: ${err}` });
      }
    } else {
      results.push({ id: 'B2', name: 'Service Worker', status: 'fail', details: 'Not supported' });
    }

    // B3: Permission
    if ('Notification' in window) {
      const perm = Notification.permission;
      setPermission(perm);
      addLog(`Permission: ${perm}`);
      results.push({
        id: 'B3',
        name: 'Notification Permission',
        status: perm === 'granted' ? 'pass' : perm === 'denied' ? 'fail' : 'warning',
        details: `Permission: ${perm}`,
        action: perm === 'denied' ? 'Go to iOS Settings > Safari > Notifications to enable' : undefined,
      });
    } else {
      setPermission('unsupported');
      results.push({ id: 'B3', name: 'Notification Permission', status: 'fail', details: 'Not supported' });
    }

    // B4: Subscription
    const localSub = await getCurrentPushSubscription();
    let backendSubs: SubscriptionInfo[] = [];
    
    if (user?.id) {
      const { data } = await supabase
        .from('push_subscriptions')
        .select('endpoint, created_at, is_active, consecutive_failures')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (data) {
        backendSubs = data.map(s => ({
          endpoint: s.endpoint,
          endpointShort: getEndpointShort(s.endpoint),
          created_at: s.created_at,
          is_active: s.is_active,
          consecutive_failures: s.consecutive_failures || 0,
        }));
        setBackendSubCount(data.length);
        if (data.length > 0) {
          setSubscriptionInfo(backendSubs[0]);
        }
      }
    }

    addLog(`Local sub: ${!!localSub}, Backend subs: ${backendSubs.length}`);
    results.push({
      id: 'B4',
      name: 'Push Subscription',
      status: localSub && backendSubs.length > 0 ? 'pass' : 'fail',
      details: `Local: ${localSub ? 'YES' : 'NO'}, Backend: ${backendSubs.length}`,
      action: !localSub ? 'Click "Enable Push" to subscribe' : undefined,
    });

    // B5: VAPID - with detailed validation info
    try {
      const info = await getVapidKeyInfo();
      setVapidInfo(info);
      
      if (info?.publicKey && info.validated) {
        addLog(`VAPID: validated, fingerprint=${info.fingerprint}, version=${info.version}`);
        results.push({ 
          id: 'B5', 
          name: 'VAPID Config', 
          status: 'pass', 
          details: `Validated ✓ | Fingerprint: ...${info.fingerprint} | Version: ${info.version}` 
        });
      } else if (info?.publicKey && !info.validated) {
        addLog(`VAPID: present but not validated, fingerprint=${info.fingerprint}`);
        results.push({ 
          id: 'B5', 
          name: 'VAPID Config', 
          status: 'warning', 
          details: `Key present but not validated: ...${info.fingerprint}` 
        });
      } else if (info?.error) {
        addLog(`VAPID error: ${info.error}`);
        results.push({ 
          id: 'B5', 
          name: 'VAPID Config', 
          status: 'fail', 
          details: `Error: ${info.error}`,
          action: 'Generate new keys with: npx web-push generate-vapid-keys'
        });
      } else {
        results.push({ 
          id: 'B5', 
          name: 'VAPID Config', 
          status: 'fail', 
          details: 'No VAPID key configured' 
        });
      }
    } catch (err) {
      results.push({ id: 'B5', name: 'VAPID Config', status: 'fail', details: `Error: ${err}` });
    }

    // B6: Test Push placeholder
    results.push({
      id: 'B6',
      name: 'Test Push',
      status: 'unknown',
      details: 'Click "Send Test Push" to verify end-to-end delivery',
    });

    results.sort((a, b) => a.id.localeCompare(b.id));
    setChecks(results);
    setIsLoading(false);
    addLog('Diagnostics complete');
  }, [user?.id, addLog]);

  // ============================================
  // ACTIONS
  // ============================================

  const handleEnablePush = async () => {
    addLog('Enabling push notifications...');
    const result = await setupPushNotifications();
    addLog(`Enable result: success=${result.success}, error=${result.error || 'none'}`);

    if (result.success) {
      toast.success("Push Enabled", { description: "Push notifications are now active" });
    } else {
      toast.error("Enable Failed", { description: result.error || "Unknown error" });
    }

    await runAllChecks();
  };

  const sendTestPush = async () => {
    setIsTestingPush(true);
    setTestResult(null);
    addLog('Sending test push...');

    try {
      const { data, error } = await supabase.functions.invoke('test-push', {
        body: { title: 'Roomrise Test', message: 'Hello from push test' },
      });

      if (error) {
        addLog(`Test push error: ${error.message}`);
        setTestResult({ success: false });
        toast.error("Test Push Failed", { description: error.message });
      } else {
        addLog(`Test push result: ${JSON.stringify(data)}`);
        setTestResult(data);

        const sent = data?.summary?.sent || 0;
        if (sent > 0) {
          toast.success("Test Push Sent!", { description: `Sent to ${sent} device(s). Check your notification.` });
        } else {
          toast.error("No Push Sent", { description: `Sent: ${sent}. Check failures below.` });
        }
      }
    } catch (err) {
      addLog(`Test push exception: ${err}`);
      setTestResult({ success: false });
    } finally {
      setIsTestingPush(false);
    }
  };

  // ============================================
  // RE-SUBSCRIBE FLOW
  // ============================================

  const handleResubscribe = async () => {
    setIsResubscribing(true);
    addLog('Starting re-subscribe flow...');

    try {
      // Step 1: Get current local subscription
      const oldSub = await getCurrentPushSubscription();
      if (oldSub) {
        addLog(`Unsubscribing old: ${getEndpointShort(oldSub.endpoint)}`);
        
        // Remove from backend first
        await removePushSubscriptionFromBackend(oldSub.endpoint);
        
        // Unsubscribe locally
        await oldSub.unsubscribe();
        addLog('Old subscription removed');
      }

      // Step 2: Deactivate all backend subscriptions for this user
      if (user?.id) {
        const { error } = await supabase
          .from('push_subscriptions')
          .update({ is_active: false, last_failure_reason: 'MANUAL_RESUBSCRIBE' })
          .eq('user_id', user.id);
        
        if (error) {
          addLog(`Failed to deactivate backend subs: ${error.message}`);
        } else {
          addLog('Backend subscriptions deactivated');
        }
      }

      // Step 3: Create new subscription
      addLog('Creating new subscription...');
      const result = await setupPushNotifications();

      if (result.success && result.status.subscription) {
        const newEndpoint = result.status.subscription.endpoint;
        addLog(`New subscription created: ${getEndpointShort(newEndpoint)}`);

        // Get the new subscription info from backend
        if (user?.id) {
          const { data } = await supabase
            .from('push_subscriptions')
            .select('endpoint, created_at, is_active, consecutive_failures')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1);

          if (data && data.length > 0) {
            setSubscriptionInfo({
              endpoint: data[0].endpoint,
              endpointShort: getEndpointShort(data[0].endpoint),
              created_at: data[0].created_at,
              is_active: data[0].is_active,
              consecutive_failures: data[0].consecutive_failures || 0,
            });
          }
        }

        toast.success("Re-subscribe Success", { description: "New push subscription created" });
      } else {
        addLog(`Re-subscribe failed: ${result.error}`);
        toast.error("Re-subscribe Failed", { description: result.error || "Unknown error" });
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`Re-subscribe error: ${errorMsg}`);
      toast.error("Re-subscribe Failed", { description: errorMsg });
    } finally {
      setIsResubscribing(false);
      await runAllChecks();
    }
  };

  // ============================================
  // FULL RE-SUBSCRIBE WITH NEW VAPID KEY
  // ============================================

  const handleFullResubscribeNewVapid = async () => {
    setIsFullResubscribing(true);
    addLog('Starting FULL re-subscribe with NEW VAPID key...');
    addLog('This will DELETE all existing subscriptions and create fresh ones');

    try {
      const result = await fullResubscribeWithNewVapidKey(true);

      if (result.success) {
        addLog(`Full re-subscribe SUCCESS!`);
        addLog(`New VAPID fingerprint: ${result.vapidInfo?.fingerprint}`);
        addLog(`New endpoint: ${getEndpointShort(result.subscription?.endpoint || '')}`);
        
        toast.success("Re-subscribe Success", { description: `Subscription renewed with VAPID ${result.vapidInfo?.fingerprint}` });
      } else {
        addLog(`Full re-subscribe FAILED: ${result.message}`);
        toast.error("Re-subscribe Failed", { description: result.message });
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`Full re-subscribe error: ${errorMsg}`);
      toast.error("Re-subscribe Failed", { description: errorMsg });
    } finally {
      setIsFullResubscribing(false);
      await runAllChecks();
    }
  };

  const handleClearSubscriptions = async () => {
    addLog('Clearing all subscriptions...');

    try {
      // Unsubscribe local
      await unsubscribeFromPush();

      // Deactivate all backend
      if (user?.id) {
        await supabase
          .from('push_subscriptions')
          .update({ is_active: false, last_failure_reason: 'MANUAL_CLEAR' })
          .eq('user_id', user.id);
      }

      setSubscriptionInfo(null);
      setBackendSubCount(0);
      addLog('All subscriptions cleared');
      toast.success("Cleared", { description: "All push subscriptions removed" });
    } catch (err) {
      addLog(`Clear error: ${err}`);
    }

    await runAllChecks();
  };

  // Initial check
  useEffect(() => {
    runAllChecks();
  }, []);

  // ============================================
  // RENDER HELPERS
  // ============================================

  const getStatusIcon = (status: CheckStatus) => {
    switch (status) {
      case 'pass': return <CheckCircle2 className="h-5 w-5 text-success" />;
      case 'fail': return <XCircle className="h-5 w-5 text-destructive" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-warning" />;
      case 'loading': return <Loader2 className="h-5 w-5 text-info animate-spin" />;
      default: return <Info className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: CheckStatus) => {
    switch (status) {
      case 'pass': return <Badge className="bg-success/10 text-success">PASS</Badge>;
      case 'fail': return <Badge variant="destructive">FAIL</Badge>;
      case 'warning': return <Badge className="bg-warning/10 text-warning">WARN</Badge>;
      default: return <Badge variant="outline">N/A</Badge>;
    }
  };

  const passCount = checks.filter(c => c.status === 'pass').length;
  const failCount = checks.filter(c => c.status === 'fail').length;
  const firstFailure = checks.find(c => c.status === 'fail');

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bug className="h-5 w-5" />
          Push Notification Debug Panel
        </CardTitle>
        <CardDescription>
          Diagnostic checklist for iOS PWA push notifications
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Summary */}
        <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
          <div className="flex-1">
            <div className="text-sm font-medium">Pipeline Status</div>
            <div className="flex gap-4 mt-1 text-sm">
              <span className="text-success">✓ {passCount} Pass</span>
              <span className="text-destructive">✗ {failCount} Fail</span>
            </div>
          </div>
          <Button onClick={runAllChecks} variant="outline" size="sm" disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Re-check
          </Button>
        </div>

        {/* First Failure Alert */}
        {firstFailure && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>{firstFailure.id}: {firstFailure.name}</AlertTitle>
            <AlertDescription>
              {firstFailure.details}
              {firstFailure.action && <div className="mt-2 font-medium">→ {firstFailure.action}</div>}
            </AlertDescription>
          </Alert>
        )}

        {/* Checklist */}
        <div className="space-y-2">
          {checks.map((check) => (
            <div key={check.id} className="flex items-start gap-3 p-3 border rounded-lg">
              {getStatusIcon(check.status)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{check.id}. {check.name}</span>
                  {getStatusBadge(check.status)}
                </div>
                <div className="text-sm text-muted-foreground mt-1 truncate">{check.details}</div>
              </div>
            </div>
          ))}
        </div>

        <Separator />

        {/* Subscription Info */}
        {subscriptionInfo && (
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <div className="text-sm font-medium">Current Subscription</div>
            <div className="text-xs font-mono text-muted-foreground">
              <div>Endpoint: {subscriptionInfo.endpointShort}</div>
              <div>Created: {subscriptionInfo.created_at ? new Date(subscriptionInfo.created_at).toLocaleString() : 'N/A'}</div>
              <div>Active: {subscriptionInfo.is_active ? 'Yes' : 'No'}</div>
              <div>Failures: {subscriptionInfo.consecutive_failures}</div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleEnablePush} disabled={isLoading}>
            <Bell className="h-4 w-4 mr-2" />
            Enable Push
          </Button>

          <Button onClick={sendTestPush} variant="secondary" disabled={isTestingPush || backendSubCount === 0}>
            {isTestingPush ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Send Test Push
          </Button>

          <Button onClick={handleResubscribe} variant="outline" disabled={isResubscribing || permission !== 'granted'}>
            {isResubscribing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
            Re-subscribe
          </Button>

          <Button onClick={handleClearSubscriptions} variant="ghost" size="sm" className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All
          </Button>
        </div>

        {/* Re-subscribe with New VAPID Key - for when VAPID keys are regenerated */}
        <div className="p-4 border rounded-lg bg-warning/10 dark:bg-warning/10">
          <div className="flex items-start gap-3">
            <Key className="h-5 w-5 text-warning mt-0.5" />
            <div className="flex-1 space-y-2">
              <div className="font-medium text-sm">VAPID Key Changed?</div>
              <div className="text-xs text-muted-foreground">
                If VAPID keys were regenerated, click this button to delete ALL existing subscriptions 
                and create a fresh subscription with the new VAPID key.
              </div>
              {vapidInfo && (
                <div className="text-xs font-mono text-muted-foreground">
                  Current VAPID: {vapidInfo.validated ? '✓' : '⚠'} ...{vapidInfo.fingerprint} ({vapidInfo.version})
                </div>
              )}
              <Button 
                onClick={handleFullResubscribeNewVapid} 
                variant="outline" 
                size="sm"
                disabled={isFullResubscribing || permission !== 'granted'}
                className="border-warning text-warning hover:bg-warning/10 dark:hover:bg-warning/30"
              >
                {isFullResubscribing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Key className="h-4 w-4 mr-2" />
                )}
                Re-subscribe with New VAPID Key
              </Button>
            </div>
          </div>
        </div>

        {/* Test Push Result */}
        {testResult && (
          <Alert variant={testResult.summary?.sent ? 'default' : 'destructive'}>
            <Info className="h-4 w-4" />
            <AlertTitle>Test Push Result</AlertTitle>
            <AlertDescription>
              <div className="mt-2 text-xs font-mono space-y-1">
                {testResult.summary && (
                  <div>
                    Total: {testResult.summary.total} | 
                    Sent: <span className="text-success">{testResult.summary.sent}</span> | 
                    Failed: <span className="text-destructive">{testResult.summary.failed}</span> | 
                    Expired: {testResult.summary.expired} | 
                    Duplicates: {testResult.summary.duplicates}
                  </div>
                )}
                {testResult.vapidFingerprint && (
                  <div>VAPID: ...{testResult.vapidFingerprint}</div>
                )}
                {testResult.failures && testResult.failures.length > 0 && (
                  <div className="mt-2 border-t pt-2">
                    <div className="font-medium mb-1">Failures:</div>
                    {testResult.failures.map((f, i) => (
                      <div key={i} className="text-destructive">
                        [{f.statusCode || 'N/A'}] {f.reason}: {f.bodySnippet?.substring(0, 100) || 'No details'}
                      </div>
                    ))}
                  </div>
                )}
                {testResult.needResubscribe && (
                  <div className="mt-2 text-warning font-medium">
                    ⚠ Subscription expired. Click "Re-subscribe" to renew.
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Separator />

        {/* Debug Log */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Bug className="h-4 w-4" />
            <span className="font-medium text-sm">Debug Log</span>
          </div>
          <div className="bg-muted-foreground text-muted p-3 rounded-lg text-xs font-mono max-h-48 overflow-auto">
            {logs.length === 0 ? (
              <div className="text-muted-foreground">No logs yet...</div>
            ) : (
              logs.map((log, i) => <div key={i} className="text-muted-foreground">{log}</div>)
            )}
          </div>
        </div>

        {/* Quick Info */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div><span className="text-muted-foreground">Device:</span> {isIOS ? 'iOS Safari' : 'Other'}</div>
          <div><span className="text-muted-foreground">PWA:</span> {isPWA ? 'Yes' : 'No'}</div>
          <div><span className="text-muted-foreground">SW:</span> {swState}</div>
          <div><span className="text-muted-foreground">Permission:</span> {permission}</div>
          <div><span className="text-muted-foreground">User:</span> {user?.id?.substring(0, 8) || 'N/A'}...</div>
          <div><span className="text-muted-foreground">Backend Subs:</span> {backendSubCount}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default DebugPushPanel;
