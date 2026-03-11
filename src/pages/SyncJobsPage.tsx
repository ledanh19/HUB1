import { useState, useEffect } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { KPIGrid } from "@/components/kpi/KPIGrid";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Play,
  Download,
  Eye,
  RotateCcw,
  AlertOctagon,
  Activity,
} from "lucide-react";
import {
  useSyncJobs,
  useSyncJobDetail,
  useSyncJobStats,
  useSystemHealth,
  useRetrySyncJob,
  exportSyncJobLogs,
  useInventorySnapshots,
  useCreateSnapshot,
  useExportReconciliationReport,
  SyncJob,
  SyncJobStatus,
} from "@/hooks/useSyncJobs";
import { useInventoryPermissions } from "@/hooks/useInventoryPermissions";
import { useCurrentChannexUser, useChannexUserProperties } from "@/hooks/useChannexUser";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import { getSyncJobStatusVariant, getSyncJobStatusLabel } from "@/constants/status-config";

const STATUS_CONFIG: Record<SyncJobStatus, { label: string; icon: React.ElementType }> = {
  PENDING: { label: 'Đang chờ', icon: Clock },
  RUNNING: { label: 'Đang chạy', icon: RefreshCw },
  SUCCESS: { label: 'Thành công', icon: CheckCircle2 },
  PARTIAL_FAIL: { label: 'Lỗi một phần', icon: AlertTriangle },
  FAILED: { label: 'Thất bại', icon: XCircle },
};



export default function SyncJobsPage() {
  const permissions = useInventoryPermissions();

  // Property selection
  const { data: channexUser } = useCurrentChannexUser();
  const { data: properties } = useChannexUserProperties(channexUser?.channex_user_id);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>();
  const [selectedJobId, setSelectedJobId] = useState<string>();

  useEffect(() => {
    if (properties && properties.length > 0 && !selectedPropertyId) {
      setSelectedPropertyId(properties[0].channex_property_id);
    }
  }, [properties, selectedPropertyId]);

  // Data fetching
  const { data: jobs = [], isLoading: jobsLoading, refetch: refetchJobs } = useSyncJobs(selectedPropertyId);
  const { data: stats, isLoading: statsLoading } = useSyncJobStats(selectedPropertyId);
  const { data: health } = useSystemHealth(selectedPropertyId);
  const { data: jobDetail, isLoading: detailLoading } = useSyncJobDetail(selectedJobId);
  const { data: snapshots = [] } = useInventorySnapshots(selectedPropertyId);

  const jobsPagination = useTablePagination(jobs, { defaultPageSize: 10, resetDeps: [selectedPropertyId] });
  const snapshotsPagination = useTablePagination(snapshots, { defaultPageSize: 10, resetDeps: [selectedPropertyId] });

  // Mutations
  const retryJob = useRetrySyncJob();
  const createSnapshot = useCreateSnapshot();
  const exportReport = useExportReconciliationReport();

  const handleRetryJob = (jobId: string) => {
    if (!permissions.canRetrySync) return;
    retryJob.mutate(jobId);
  };

  const handleExportLogs = () => {
    exportSyncJobLogs(jobs);
  };

  const handleCreateSnapshot = () => {
    if (!selectedPropertyId || !permissions.canCreateSnapshot) return;
    createSnapshot.mutate({ propertyId: selectedPropertyId });
  };

  return (
    <>
      <Header title="Sync Jobs" subtitle="Lịch sử đồng bộ" />
      <PageContainer>
        <SectionCard>
          <div className="space-y-4">
            <div className="flex items-center justify-end gap-3">
              {properties && properties.length > 1 && (
                <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Chọn property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map(p => (
                      <SelectItem key={p.channex_property_id} value={p.channex_property_id}>
                        {p.property_name || p.channex_property_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Button variant="outline" onClick={() => refetchJobs()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>

              {permissions.canExportReports && (
                <Button variant="outline" onClick={handleExportLogs}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Logs
                </Button>
              )}

              {permissions.canCreateSnapshot && (
                <Button onClick={handleCreateSnapshot} disabled={createSnapshot.isPending}>
                  <Activity className="h-4 w-4 mr-2" />
                  Create Snapshot
                </Button>
              )}
            </div>

            {/* System Health Alert */}
            {health?.isDegraded && (
              <Alert variant="destructive">
                <AlertOctagon className="h-4 w-4" />
                <AlertTitle>Hệ thống đang gặp sự cố</AlertTitle>
                <AlertDescription>
                  Tỷ lệ lỗi: {health.failRate}% | Jobs stuck: {health.stuckJobs}.
                  Bulk update đã bị tạm khóa. Vui lòng liên hệ admin.
                </AlertDescription>
              </Alert>
            )}

            {/* Stats Cards */}
            <KPIGrid columns={4}>
              {statsLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <Card key={i}><CardContent className="pt-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
                ))
              ) : (
                <>
                  <MetricCard title="Tổng Jobs" value={stats?.total || 0} icon={Activity} />
                  <MetricCard title="Đang chờ" value={stats?.pending || 0} icon={Clock} />
                  <MetricCard title="Đang chạy" value={stats?.running || 0} icon={RefreshCw} />
                  <MetricCard title="Thành công" value={stats?.success || 0} icon={CheckCircle2} />
                  <MetricCard title="Thất bại" value={(stats?.failed || 0) + (stats?.partial_fail || 0)} icon={XCircle} tone="danger" />
                </>
              )}
            </KPIGrid>

            {/* Jobs Table */}
            <Card>
              <CardHeader>
                <CardTitle>Danh sách Sync Jobs</CardTitle>
              </CardHeader>
              <CardContent>
                {jobsLoading ? (
                  <div className="space-y-2">
                    {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : jobs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Chưa có sync job nào
                  </div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">ID</TableHead>
                          <TableHead className="w-[130px]">Trạng thái</TableHead>
                          <TableHead className="w-[80px]">Cells</TableHead>
                          <TableHead className="w-[140px]">Bắt đầu</TableHead>
                          <TableHead className="w-[140px]">Hoàn thành</TableHead>
                          <TableHead className="w-[80px]">Retries</TableHead>
                          <TableHead className="w-[100px] text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {jobsPagination.paginatedData.map((job) => {
                          const config = STATUS_CONFIG[job.status as SyncJobStatus] || STATUS_CONFIG.PENDING;
                          const StatusIcon = config.icon;

                          return (
                            <TableRow key={job.id}>
                              <TableCell className="font-mono text-xs">
                                {job.id.substring(0, 8)}...
                              </TableCell>
                              <TableCell>
                                <StatusBadge variant={getSyncJobStatusVariant(job.status) as any} className="gap-1">
                                  <StatusIcon className={`h-3 w-3 ${job.status === 'RUNNING' ? 'animate-spin' : ''}`} />
                                  {config.label}
                                </StatusBadge>
                              </TableCell>
                              <TableCell>{job.cell_ids?.length || 0}</TableCell>
                              <TableCell>
                                {job.started_at ? format(new Date(job.started_at), 'dd/MM HH:mm:ss') : '-'}
                              </TableCell>
                              <TableCell>
                                {job.completed_at ? format(new Date(job.completed_at), 'dd/MM HH:mm:ss') : '-'}
                              </TableCell>
                              <TableCell>{job.retry_count || 0}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setSelectedJobId(job.id)}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  {permissions.canRetrySync && (job.status === 'FAILED' || job.status === 'PARTIAL_FAIL') && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleRetryJob(job.id)}
                                      disabled={retryJob.isPending}
                                    >
                                      <RotateCcw className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    <DataTablePagination
                      currentPage={jobsPagination.page}
                      totalPages={jobsPagination.totalPages}
                      totalItems={jobsPagination.totalCount}
                      displayedItems={jobsPagination.displayedCount}
                      pageSize={jobsPagination.pageSize}
                      onPageChange={jobsPagination.setPage}
                      onPageSizeChange={jobsPagination.setPageSize}
                      itemLabel="job"
                    />
                  </>
                )}
              </CardContent>
            </Card>

            {/* Snapshots */}
            {permissions.canViewAuditLogs && (
              <Card>
                <CardHeader>
                  <CardTitle>Inventory Snapshots</CardTitle>
                </CardHeader>
                <CardContent>
                  {snapshots.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">
                      Chưa có snapshot nào
                    </div>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[200px]">Thời gian</TableHead>
                            <TableHead className="w-[150px]">Sync Job</TableHead>
                            <TableHead className="w-[100px]">Version</TableHead>
                            <TableHead className="w-[120px] text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {snapshotsPagination.paginatedData.map((snapshot) => (
                            <TableRow key={snapshot.id}>
                              <TableCell>
                                {format(new Date(snapshot.snapshot_time), 'dd/MM/yyyy HH:mm:ss')}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {snapshot.sync_job_id?.substring(0, 8) || '-'}
                              </TableCell>
                              <TableCell>{snapshot.snapshot_type || '-'}</TableCell>
                              <TableCell className="text-right">
                                {permissions.canExportReports && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => exportReport.mutate({ snapshotId: snapshot.id })}
                                    disabled={exportReport.isPending}
                                  >
                                    <Download className="h-4 w-4 mr-2" />
                                    Export Report
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <DataTablePagination
                        currentPage={snapshotsPagination.page}
                        totalPages={snapshotsPagination.totalPages}
                        totalItems={snapshotsPagination.totalCount}
                        displayedItems={snapshotsPagination.displayedCount}
                        pageSize={snapshotsPagination.pageSize}
                        onPageChange={snapshotsPagination.setPage}
                        onPageSizeChange={snapshotsPagination.setPageSize}
                        itemLabel="snapshot"
                      />
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </SectionCard>
      </PageContainer>

      {/* Job Detail Dialog */}
      <Dialog open={!!selectedJobId} onOpenChange={(open) => !open && setSelectedJobId(undefined)}>
        <DialogContent size="2xl">
          <DialogHeader>
            <DialogTitle>Chi tiết Sync Job</DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : jobDetail ? (
            <div className="space-y-4">
              {/* Job Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">ID</p>
                  <p className="font-mono text-sm">{jobDetail.job.id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Trạng thái</p>
                  <StatusBadge variant={getSyncJobStatusVariant(jobDetail.job.status) as any}>
                    {STATUS_CONFIG[jobDetail.job.status as SyncJobStatus]?.label || jobDetail.job.status}
                  </StatusBadge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Cells</p>
                  <p>{jobDetail.job.cell_ids?.length || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Retries</p>
                  <p>{jobDetail.job.retry_count || 0}</p>
                </div>
              </div>

              {/* Error */}
              {jobDetail.job.error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{jobDetail.job.error}</AlertDescription>
                </Alert>
              )}

              {/* Failed Cells */}
              {jobDetail.failedCells.length > 0 && (
                <div>
                  <p className="font-medium mb-2">Failed Cells ({jobDetail.failedCells.length})</p>
                  <ScrollArea className="h-[200px] border rounded-lg p-2">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cell Key</TableHead>
                          <TableHead>Error</TableHead>
                          <TableHead>Retries</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {jobDetail.failedCells.map((cell) => (
                          <TableRow key={cell.id}>
                            <TableCell className="font-mono text-xs">{cell.cell_key}</TableCell>
                            <TableCell className="text-destructive text-sm">{cell.error_message}</TableCell>
                            <TableCell>{cell.retry_count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter>
            {permissions.canRetrySync && jobDetail?.job && (jobDetail.job.status === 'FAILED' || jobDetail.job.status === 'PARTIAL_FAIL') && (
              <Button onClick={() => handleRetryJob(jobDetail.job.id)} disabled={retryJob.isPending}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Retry Job
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelectedJobId(undefined)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
