import { useState, useEffect } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, CheckCircle2, XCircle, Clock, Building2, BedDouble, CalendarCheck, AlertTriangle, Play, Webhook, Radio, Zap, User, Mail, Phone, Globe, Key, Tags } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, formatDistanceToNow, differenceInMinutes } from "date-fns";
import { vi } from "date-fns/locale";
import { useSyncStatusRealtime } from "@/hooks/useBookingsRealtime";
import { useCurrentChannexUser, useChannexUserProperties, useSyncChannexUser, useChannexUserStats } from "@/hooks/useChannexUser";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import { FilterBar } from "@/components/ui/filter-bar";
interface SyncState {
  key: string;
  value_json: { timestamp?: string };
  updated_at: string;
}

interface SyncRun {
  id: string;
  provider: string;
  run_type: string;
  entity: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  since: string | null;
  until: string | null;
  counts: Record<string, number>;
  error: string | null;
}

interface PendingMappingBooking {
  id: string;
  unified_booking_id: string;
  guest_name: string;
  channex_property_id: string | null;
  channex_room_type_id: string | null;
  check_in_date: string;
  ota_source: string;
}

interface WebhookEvent {
  id: string;
  event_type: string;
  status: string;
  created_at: string;
  processed_at: string | null;
  error: string | null;
}

type HealthStatus = 'OK' | 'WARN' | 'ERROR';

export default function ChannexIntegrationPage() {
  const [syncStates, setSyncStates] = useState<SyncState[]>([]);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [pendingMappings, setPendingMappings] = useState<PendingMappingBooking[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);

  // Booking sync filter (check-in from date)
  const [bookingsFromDate, setBookingsFromDate] = useState<string>("2025-12-20");

  // Channex User hooks
  const { data: channexUser, isLoading: userLoading } = useCurrentChannexUser();
  const { data: userProperties } = useChannexUserProperties(channexUser?.channex_user_id);
  const { data: userStats } = useChannexUserStats(channexUser?.channex_user_id);
  const syncUserMutation = useSyncChannexUser();

  // Enable realtime updates for sync status
  useSyncStatusRealtime(() => {
    fetchData();
  });

  const syncRunsPagination = useTablePagination(syncRuns, { defaultPageSize: 10, resetDeps: [entityFilter, statusFilter] });
  const propertiesPagination = useTablePagination(userProperties || [], { defaultPageSize: 10, resetDeps: [] });
  const pendingPagination = useTablePagination(pendingMappings, { defaultPageSize: 10, resetDeps: [] });

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch sync states
      const { data: states } = await supabase
        .from('sync_state')
        .select('*')
        .in('key', [
          'channex_properties_last_synced_at',
          'channex_roomtypes_last_synced_at',
          'channex_rateplans_last_synced_at',
          'channex_bookings_last_synced_at'
        ]);
      setSyncStates((states || []) as unknown as SyncState[]);

      // Fetch sync runs
      let runsQuery = supabase
        .from('sync_runs')
        .select('*')
        .eq('provider', 'channex')
        .order('started_at', { ascending: false })
        .limit(50);

      if (entityFilter !== 'all') {
        runsQuery = runsQuery.eq('entity', entityFilter);
      }
      if (statusFilter !== 'all') {
        runsQuery = runsQuery.eq('status', statusFilter);
      }

      const { data: runs } = await runsQuery;
      setSyncRuns((runs || []) as unknown as SyncRun[]);

      // Fetch pending mappings (no limit - show all)
      const { data: pending } = await supabase
        .from('bookings_mirror')
        .select('id, unified_booking_id, guest_name, channex_property_id, channex_room_type_id, check_in_date, ota_source')
        .eq('mapping_status', 'PENDING_MAPPING')
        .order('check_in_date', { ascending: false })
        .limit(500);
      setPendingMappings(pending || []);

      // Fetch recent webhook events
      const { data: webhooks } = await supabase
        .from('webhook_events')
        .select('id, event_type, status, created_at, processed_at, error')
        .eq('provider', 'channex')
        .order('created_at', { ascending: false })
        .limit(20);
      setWebhookEvents((webhooks || []) as unknown as WebhookEvent[]);

    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  // Calculate health status
  const getHealthStatus = (): { status: HealthStatus; message: string } => {
    const bookingsState = syncStates.find(s => s.key === 'channex_bookings_last_synced_at');
    const lastSyncTime = bookingsState?.value_json?.timestamp;

    if (!lastSyncTime) {
      return { status: 'ERROR', message: 'Chưa có đồng bộ nào' };
    }

    const lastSync = new Date(lastSyncTime);
    const minutesSinceSync = differenceInMinutes(new Date(), lastSync);

    // Check for recent failures
    const recentFailures = syncRuns.filter(r =>
      r.status === 'FAILED' &&
      differenceInMinutes(new Date(), new Date(r.started_at)) < 30
    ).length;

    if (recentFailures > 0) {
      return { status: 'ERROR', message: `${recentFailures} lỗi sync gần đây` };
    }

    if (minutesSinceSync > 30) {
      return { status: 'WARN', message: `Sync cách đây ${minutesSinceSync} phút` };
    }

    if (minutesSinceSync > 60) {
      return { status: 'ERROR', message: `Không có sync trong ${minutesSinceSync} phút` };
    }

    return { status: 'OK', message: 'Hệ thống hoạt động bình thường' };
  };

  useEffect(() => {
    fetchData();
  }, [entityFilter, statusFilter]);

  const triggerSync = async (entity: 'PROPERTIES' | 'ROOMTYPES' | 'RATEPLANS' | 'BOOKINGS') => {
    setSyncing(entity);
    try {
      const functionName = entity === 'PROPERTIES'
        ? 'channex-properties-sync'
        : entity === 'ROOMTYPES'
          ? 'channex-roomtypes-sync'
          : entity === 'RATEPLANS'
            ? 'channex-rateplans-sync'
            : 'sync-channex-bookings';

      // An Gia Residences group ID for filtering bookings
      const anGiaGroupId = '72e58e1b-1e34-4678-9100-71c778ecf6d0';

      const body = entity === 'BOOKINGS'
        ? {
          run_type: 'MANUAL',
          force_update: true,
          group_ids: [anGiaGroupId],
          // sync_all=true to fetch ALL pages; do not cap by limit (it can hide older bookings).
          filters: { arrival_date_gte: bookingsFromDate, sync_all: 'true' }
        }
        : { run_type: 'MANUAL' };

      const { data, error } = await supabase.functions.invoke(functionName, { body });

      if (error) throw error;

      toast.success(`Đồng bộ ${entity} thành công`, {
        description: `Đã xử lý trong ${data?.duration_ms || 0}ms`
      });

      // Refresh data after sync
      setTimeout(fetchData, 1000);
    } catch (err) {
      console.error(`Sync ${entity} error:`, err);
      toast.error(`Đồng bộ ${entity} thất bại`, {
        description: err instanceof Error ? err.message : 'Lỗi không xác định'
      });
    } finally {
      setSyncing(null);
    }
  };

  // Sync All: User → Properties → Room Types → Rate Plans → Bookings (sequential)
  const triggerSyncAll = async () => {
    setSyncing('ALL');
    const steps = [
      { name: 'User', fn: () => syncUserMutation.mutateAsync({ include_properties: true }) },
      { name: 'Properties', fn: () => supabase.functions.invoke('channex-properties-sync', { body: { run_type: 'MANUAL' } }) },
      { name: 'Room Types', fn: () => supabase.functions.invoke('channex-roomtypes-sync', { body: { run_type: 'MANUAL' } }) },
      { name: 'Rate Plans', fn: () => supabase.functions.invoke('channex-rateplans-sync', { body: { run_type: 'MANUAL' } }) },
      {
        name: 'Bookings', fn: () => supabase.functions.invoke('sync-channex-bookings', {
          body: {
            run_type: 'MANUAL',
            force_update: true,
            group_ids: ['72e58e1b-1e34-4678-9100-71c778ecf6d0'], // An Gia Residences
            // sync_all=true to fetch ALL pages; do not cap by limit (it can hide older bookings).
            filters: { arrival_date_gte: bookingsFromDate, sync_all: 'true' }
          }
        })
      },
    ];

    for (const step of steps) {
      try {
        toast.info(`Đang sync ${step.name}...`);
        await step.fn();
        toast.success(`✓ ${step.name} hoàn tất`);
      } catch (err) {
        console.error(`Sync ${step.name} error:`, err);
        toast.error(`✗ ${step.name} thất bại`, {
          description: err instanceof Error ? err.message : 'Lỗi không xác định'
        });
        // Continue to next step even if one fails
      }
    }

    setSyncing(null);
    toast.success('🎉 Sync tất cả hoàn tất!');
    setTimeout(fetchData, 1000);
  };

  const getSyncStateByKey = (key: string) => {
    return syncStates.find(s => s.key === key);
  };

  const formatTimestamp = (timestamp: string | undefined) => {
    if (!timestamp) return 'Chưa đồng bộ';
    try {
      const date = new Date(timestamp);
      return formatDistanceToNow(date, { addSuffix: true, locale: vi });
    } catch {
      return timestamp;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <Badge variant="default" className="bg-success"><CheckCircle2 className="h-3 w-3 mr-1" />Success</Badge>;
      case 'FAILED':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case 'RUNNING':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1 animate-spin" />Running</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <>
      <Header title="Channex Integration" subtitle="Quản lý kết nối Channex" icon={Webhook} />
      <PageContainer>
        <SectionCard>
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Quản lý đồng bộ dữ liệu từ Channex PMS</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={triggerSyncAll}
                  disabled={syncing === 'ALL' || loading}
                  className="bg-primary"
                >
                  {syncing === 'ALL' ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  Sync Tất Cả
                </Button>
                <Button variant="outline" onClick={fetchData} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Làm mới
                </Button>
              </div>
            </div>

            {/* Channex User Info Card */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Channex Account
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => syncUserMutation.mutate({ include_properties: true })}
                    disabled={syncUserMutation.isPending}
                  >
                    {syncUserMutation.isPending ? (
                      <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    Sync User
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {userLoading ? (
                  <div className="text-sm text-muted-foreground">Đang tải...</div>
                ) : channexUser ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        Email
                      </div>
                      <p className="text-sm font-medium">{channexUser.email || "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        Tên
                      </div>
                      <p className="text-sm font-medium">{channexUser.name || channexUser.company_name || "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Globe className="h-3 w-3" />
                        Timezone
                      </div>
                      <p className="text-sm font-medium">{channexUser.timezone || "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Building2 className="h-3 w-3" />
                        Properties
                      </div>
                      <p className="text-sm font-medium">{channexUser.properties_count} properties</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarCheck className="h-3 w-3" />
                        Bookings
                      </div>
                      <p className="text-sm font-medium">{userStats?.bookingCount ?? 0} bookings</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Key className="h-3 w-3" />
                        API Key
                      </div>
                      <p className="text-sm font-medium font-mono">****{channexUser.api_key_last_4}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3 w-3" />
                        Trạng thái
                      </div>
                      <Badge variant={channexUser.is_active ? "default" : "secondary"}>
                        {channexUser.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Lần sync cuối
                      </div>
                      <p className="text-sm font-medium">
                        {channexUser.last_synced_at
                          ? formatDistanceToNow(new Date(channexUser.last_synced_at), { addSuffix: true, locale: vi })
                          : "Chưa sync"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-3">Chưa có thông tin Channex user</p>
                    <Button
                      size="sm"
                      onClick={() => syncUserMutation.mutate({ include_properties: true })}
                      disabled={syncUserMutation.isPending}
                    >
                      {syncUserMutation.isPending ? (
                        <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                      ) : null}
                      Đồng bộ ngay
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sync Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Properties */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Properties
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => triggerSync('PROPERTIES')}
                      disabled={syncing === 'PROPERTIES'}
                    >
                      {syncing === 'PROPERTIES' ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Lần đồng bộ cuối:</p>
                  <p className="text-sm font-medium">
                    {formatTimestamp(getSyncStateByKey('channex_properties_last_synced_at')?.value_json?.timestamp)}
                  </p>
                </CardContent>
              </Card>

              {/* Room Types */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <BedDouble className="h-4 w-4" />
                      Room Types
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => triggerSync('ROOMTYPES')}
                      disabled={syncing === 'ROOMTYPES'}
                    >
                      {syncing === 'ROOMTYPES' ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Lần đồng bộ cuối:</p>
                  <p className="text-sm font-medium">
                    {formatTimestamp(getSyncStateByKey('channex_roomtypes_last_synced_at')?.value_json?.timestamp)}
                  </p>
                </CardContent>
              </Card>

              {/* Rate Plans */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Tags className="h-4 w-4" />
                      Rate Plans
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => triggerSync('RATEPLANS')}
                      disabled={syncing === 'RATEPLANS'}
                    >
                      {syncing === 'RATEPLANS' ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Lần đồng bộ cuối:</p>
                  <p className="text-sm font-medium">
                    {formatTimestamp(getSyncStateByKey('channex_rateplans_last_synced_at')?.value_json?.timestamp)}
                  </p>
                </CardContent>
              </Card>

              {/* Bookings */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <CalendarCheck className="h-4 w-4" />
                      Bookings
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => triggerSync('BOOKINGS')}
                      disabled={syncing === 'BOOKINGS'}
                    >
                      {syncing === 'BOOKINGS' ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Lần đồng bộ cuối:</p>
                    <p className="text-sm font-medium">
                      {formatTimestamp(getSyncStateByKey('channex_bookings_last_synced_at')?.value_json?.timestamp)}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Kéo booking (nhận phòng) từ ngày:</p>
                    <input
                      type="date"
                      value={bookingsFromDate}
                      onChange={(e) => setBookingsFromDate(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="runs" className="space-y-4">
              <TabsList>
                <TabsTrigger value="runs">Sync Runs</TabsTrigger>
                <TabsTrigger value="properties">
                  User Properties
                  {userProperties && userProperties.length > 0 && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                      {userProperties.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="pending">
                  Pending Mapping
                  {pendingMappings.length > 0 && (
                    <Badge variant="destructive" className="ml-2 h-5 px-1.5">
                      {pendingMappings.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Sync Runs Tab */}
              <TabsContent value="runs" className="space-y-4">
                {/* Filters */}
                <FilterBar
                  title="Bộ lọc"
                  subtitle="Lọc lịch sử đồng bộ"
                  hasActiveFilters={entityFilter !== 'all' || statusFilter !== 'all'}
                  onClearFilters={() => { setEntityFilter('all'); setStatusFilter('all'); }}
                >
                  <FilterBar.Field label="Loại Entity">
                    <Select value={entityFilter} onValueChange={setEntityFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Entity" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả Entity</SelectItem>
                        <SelectItem value="PROPERTIES">Properties</SelectItem>
                        <SelectItem value="ROOMTYPES">Room Types</SelectItem>
                        <SelectItem value="BOOKINGS">Bookings</SelectItem>
                      </SelectContent>
                    </Select>
                  </FilterBar.Field>

                  <FilterBar.Field label="Trạng thái">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Trạng thái" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả trạng thái</SelectItem>
                        <SelectItem value="SUCCESS">Success</SelectItem>
                        <SelectItem value="FAILED">Failed</SelectItem>
                        <SelectItem value="RUNNING">Running</SelectItem>
                      </SelectContent>
                    </Select>
                  </FilterBar.Field>
                </FilterBar>

                {/* Runs Table */}
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">Entity</TableHead>
                          <TableHead className="w-[80px]">Type</TableHead>
                          <TableHead className="w-[130px]">Started</TableHead>
                          <TableHead className="w-[90px]">Duration</TableHead>
                          <TableHead className="w-[110px]">Status</TableHead>
                          <TableHead className="w-[150px]">Counts</TableHead>
                          <TableHead className="w-[200px]">Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {syncRuns.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                              Chưa có sync runs
                            </TableCell>
                          </TableRow>
                        ) : (
                          syncRunsPagination.paginatedData.map((run) => {
                            const duration = run.ended_at
                              ? new Date(run.ended_at).getTime() - new Date(run.started_at).getTime()
                              : null;

                            return (
                              <TableRow key={run.id}>
                                <TableCell>
                                  <Badge variant="outline">{run.entity}</Badge>
                                </TableCell>
                                <TableCell className="text-xs">{run.run_type}</TableCell>
                                <TableCell className="text-xs">
                                  {format(new Date(run.started_at), 'dd/MM HH:mm:ss')}
                                </TableCell>
                                <TableCell className="text-xs">
                                  {duration ? `${(duration / 1000).toFixed(1)}s` : '-'}
                                </TableCell>
                                <TableCell>{getStatusBadge(run.status)}</TableCell>
                                <TableCell className="text-xs">
                                  {run.counts && (
                                    <div className="space-x-2">
                                      {run.counts.inserted !== undefined && (
                                        <span className="text-success">+{run.counts.inserted}</span>
                                      )}
                                      {run.counts.updated !== undefined && (
                                        <span className="text-primary">~{run.counts.updated}</span>
                                      )}
                                      {run.counts.skipped_older !== undefined && run.counts.skipped_older > 0 && (
                                        <span className="text-muted-foreground">skip:{run.counts.skipped_older}</span>
                                      )}
                                      {run.counts.errors !== undefined && run.counts.errors > 0 && (
                                        <span className="text-destructive">err:{run.counts.errors}</span>
                                      )}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs text-destructive max-w-xs truncate">
                                  {run.error}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                    <DataTablePagination
                      currentPage={syncRunsPagination.page}
                      totalPages={syncRunsPagination.totalPages}
                      totalItems={syncRunsPagination.totalCount}
                      displayedItems={syncRunsPagination.displayedCount}
                      pageSize={syncRunsPagination.pageSize}
                      onPageChange={syncRunsPagination.setPage}
                      onPageSizeChange={syncRunsPagination.setPageSize}
                      itemLabel="job"
                    />
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="properties" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      Properties của Channex User ({userProperties?.length || 0})
                    </CardTitle>
                    <CardDescription>
                      Danh sách properties mà Channex user có quyền truy cập
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[200px]">Property Name</TableHead>
                          <TableHead className="w-[200px]">Channex Property ID</TableHead>
                          <TableHead className="w-[100px]">Status</TableHead>
                          <TableHead className="w-[80px]">Primary</TableHead>
                          <TableHead className="w-[150px]">Updated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {!userProperties || userProperties.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                              {channexUser ? "Không có property nào" : "Sync Channex user để xem properties"}
                            </TableCell>
                          </TableRow>
                        ) : (
                          propertiesPagination.paginatedData.map((prop) => (
                            <TableRow key={prop.id}>
                              <TableCell className="font-medium">
                                {prop.property_name || "—"}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {prop.channex_property_id}
                              </TableCell>
                              <TableCell>
                                <Badge variant={prop.property_status === 'active' ? 'default' : 'secondary'}>
                                  {prop.property_status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {prop.is_primary && (
                                  <Badge variant="outline">Primary</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(prop.updated_at), { addSuffix: true, locale: vi })}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                    <DataTablePagination
                      currentPage={propertiesPagination.page}
                      totalPages={propertiesPagination.totalPages}
                      totalItems={propertiesPagination.totalCount}
                      displayedItems={propertiesPagination.displayedCount}
                      pageSize={propertiesPagination.pageSize}
                      onPageChange={propertiesPagination.setPage}
                      onPageSizeChange={propertiesPagination.setPageSize}
                      itemLabel="property"
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Pending Mapping Tab */}
              <TabsContent value="pending" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-warning" />
                      Bookings chờ mapping ({pendingMappings.length})
                    </CardTitle>
                    <CardDescription>
                      Các booking đã sync nhưng chưa có mapping property/room type nội bộ
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[200px]">Booking ID</TableHead>
                          <TableHead className="w-[150px]">Guest</TableHead>
                          <TableHead className="w-[100px]">OTA</TableHead>
                          <TableHead className="w-[110px]">Nhận phòng</TableHead>
                          <TableHead className="w-[200px]">Channex Property ID</TableHead>
                          <TableHead className="w-[200px]">Channex Room Type ID</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingMappings.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success" />
                              Không có booking nào chờ mapping
                            </TableCell>
                          </TableRow>
                        ) : (
                          pendingPagination.paginatedData.map((booking) => (
                            <TableRow key={booking.id}>
                              <TableCell className="font-mono text-xs">
                                {booking.unified_booking_id}
                              </TableCell>
                              <TableCell>{booking.guest_name}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{booking.ota_source}</Badge>
                              </TableCell>
                              <TableCell className="text-xs">
                                {format(new Date(booking.check_in_date), 'dd/MM/yyyy')}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {booking.channex_property_id || '-'}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {booking.channex_room_type_id || '-'}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                    <DataTablePagination
                      currentPage={pendingPagination.page}
                      totalPages={pendingPagination.totalPages}
                      totalItems={pendingPagination.totalCount}
                      displayedItems={pendingPagination.displayedCount}
                      pageSize={pendingPagination.pageSize}
                      onPageChange={pendingPagination.setPage}
                      onPageSizeChange={pendingPagination.setPageSize}
                      itemLabel="booking"
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </SectionCard>
      </PageContainer>
    </>
  );
}
