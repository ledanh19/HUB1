import { useState, useMemo } from "react";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { useCurrentUserPagePermissions } from "@/hooks/useUserPagePermissions";
import { OtaRoleGate } from "@/components/ui/OtaRoleGate";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { KPIGrid } from "@/components/kpi/KPIGrid";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import { FilterBar } from "@/components/ui/filter-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  FolderKanban,
  Loader2,
  Plus,
  Eye,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  Ban,
} from "lucide-react";
import { useOtaProjects, useOtaTasks, OtaProject, OtaProjectStatus } from "@/hooks/useOtaOperations";
import { calculateProjectHealth, ProjectHealthData } from "@/lib/otaOps";
import { ProjectHealthBadge, ProjectHealth } from "@/components/ota-operations/ProjectHealthBadge";
import { WorkTypeBadge } from "@/components/ota-operations/WorkTypeBadge";
import { format } from "date-fns";
import { getOtaProjectStatusVariant, getOtaProjectStatusLabel } from "@/constants/status-config";
import { Link } from "react-router-dom";
import { CreateProjectDialog } from "@/components/ota-operations/CreateProjectDialog";

const formatDate = (date: string | null) => {
  if (!date) return "—";
  return format(new Date(date), "dd/MM/yyyy");
};

export default function ProjectsPage() {
  const { hasPageAccess } = useCurrentUserPagePermissions();
  const canAccess = hasPageAccess("/ota-operations/projects");

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data: projects, isLoading, error } = useOtaProjects();
  const { data: allTasks, isLoading: tasksLoading } = useOtaTasks();

  // Calculate health for each project
  const projectsWithHealth = useMemo(() => {
    if (!projects || !allTasks) return [];

    return projects.map(project => {
      const health = calculateProjectHealth(project.id, allTasks);
      return { ...project, health };
    });
  }, [projects, allTasks]);

  // Filter projects
  const filteredProjects = (projectsWithHealth || []).filter(project => {
    const matchesSearch =
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (project.property_name || "").toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || project.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Sort by health: RED first, then YELLOW, then GREEN
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    const healthOrder = { RED: 0, YELLOW: 1, GREEN: 2 };
    const healthDiff = healthOrder[a.health.health] - healthOrder[b.health.health];

    if (healthDiff !== 0) return healthDiff;

    // Within same health, sort by overdue count
    return b.health.overdueCount - a.health.overdueCount;
  });

  const { page, pageSize, setPage, setPageSize, paginatedData, totalPages, displayedCount, totalCount } =
    useTablePagination(sortedProjects, { defaultPageSize: 10, resetDeps: [searchTerm, statusFilter] });

  // Stats
  const stats = {
    total: projectsWithHealth?.length || 0,
    inProgress: projectsWithHealth?.filter(p => p.status === "IN_PROGRESS").length || 0,
    completed: projectsWithHealth?.filter(p => p.status === "COMPLETED").length || 0,
    planning: projectsWithHealth?.filter(p => p.status === "PLANNING").length || 0,
    red: projectsWithHealth?.filter(p => p.health.health === "RED").length || 0,
    yellow: projectsWithHealth?.filter(p => p.health.health === "YELLOW").length || 0,
  };

  if (!canAccess) {
    return (
      <>
        <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
          <div className="text-center">
            <h2 className="text-hero-kpi font-bold tabular-nums tracking-tight mb-2">Không có quyền truy cập</h2>
            <p className="text-muted-foreground">Bạn không có quyền xem trang này.</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="OTA Projects"
        subtitle="Quản lý các dự án OTA Operations"
      />

      <PageContainer><SectionCard>
        {/* Stats Cards */}
        <KPIGrid columns={3}>
          <MetricCard title="Tổng Projects" value={stats.total} icon={FolderKanban} />
          <MetricCard title="🔴 CẦN CAN THIỆP" value={stats.red} icon={AlertTriangle} tone="danger" className="border-l-4 border-l-red-500" />
          <MetricCard title="🟡 CHÚ Ý" value={stats.yellow} icon={AlertCircle} tone="warning" className="border-l-4 border-l-yellow-500" />
          <MetricCard title="Đang thực hiện" value={stats.inProgress} icon={Clock} tone="info" />
          <MetricCard title="Hoàn thành" value={stats.completed} icon={CheckCircle2} tone="success" />
          <MetricCard title="Lên kế hoạch" value={stats.planning} icon={Calendar} />
        </KPIGrid>

        {/* Actions */}
        <div className="flex justify-end">
          <OtaRoleGate
            requireRole={["ota_lead", "admin", "super_admin"]}
            fallback="disable"
            disabledMessage="Chỉ OTA Lead/Admin mới có thể tạo Project"
          >
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Tạo Project
            </Button>
          </OtaRoleGate>
        </div>

        {/* Filters */}
        <FilterBar
          title="Bộ lọc"
          subtitle="Tìm kiếm và lọc dự án"
          hasActiveFilters={!!(searchTerm || statusFilter !== 'all')}
          onClearFilters={() => { setSearchTerm(''); setStatusFilter('all'); }}
        >
          <FilterBar.Field label="Tìm kiếm" colSpan={2}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Tìm theo tên project hoặc property..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </FilterBar.Field>

          <FilterBar.Field label="Trạng thái">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                <SelectItem value="PLANNING">Lên kế hoạch</SelectItem>
                <SelectItem value="IN_PROGRESS">Đang thực hiện</SelectItem>
                <SelectItem value="ON_HOLD">Tạm dừng</SelectItem>
                <SelectItem value="COMPLETED">Hoàn thành</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar.Field>
        </FilterBar>

        {/* Projects Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading || tasksLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-muted-foreground">Đang tải...</div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-destructive">Lỗi tải dữ liệu</div>
              </div>
            ) : sortedProjects.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-muted-foreground">Không có project nào</div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Health</TableHead>
                    <TableHead className="w-[200px]">Tên Project</TableHead>
                    <TableHead className="w-[120px]">Loại</TableHead>
                    <TableHead className="w-[150px]">Property</TableHead>
                    <TableHead className="w-[120px]">Trạng thái</TableHead>
                    <TableHead className="w-[140px]">Progress</TableHead>
                    <TableHead className="w-[120px]">Cảnh báo</TableHead>
                    <TableHead className="w-[150px] text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.map((project) => {
                    const { health } = project;

                    return (
                      <TableRow key={project.id} className="hover:bg-accent/50 transition-colors">
                        <TableCell>
                          <ProjectHealthBadge health={health.health} showLabel={false} />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{project.name}</p>
                            {health.health === 'RED' && (
                              <Badge variant="destructive" className="mt-1 text-xs">
                                CẦN CAN THIỆP
                              </Badge>
                            )}
                            {project.description && (
                              <p className="text-sm text-muted-foreground line-clamp-1">
                                {project.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {project.work_type && (
                            <WorkTypeBadge workType={project.work_type} showIcon={true} />
                          )}
                        </TableCell>
                        <TableCell>{project.property_name || '—'}</TableCell>
                        <TableCell>
                          <StatusBadge variant={getOtaProjectStatusVariant(project.status) as any}>
                            {getOtaProjectStatusLabel(project.status)}
                          </StatusBadge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">
                                {health.completedTasks}/{health.totalTasks} tasks
                              </span>
                              <span className="font-medium">{health.completionPercent}%</span>
                            </div>
                            <div className="w-24 h-2 bgadient-to-r from-success to-success transition-all duration-1000 ease-out overflow-hidden">
                              <div
                                className="h-full bg-success/100 transition-all"
                                style={{ width: `${health.completionPercent}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-xs">
                            {health.overdueCount > 0 && (
                              <div className="flex items-center gap-1 text-destructive">
                                <Clock className="h-3 w-3" />
                                <span>{health.overdueCount} trễ</span>
                              </div>
                            )}
                            {health.blockedCount > 0 && (
                              <div className="flex items-center gap-1 text-warning">
                                <Ban className="h-3 w-3" />
                                <span>{health.blockedCount} block</span>
                                {health.maxBlockedHours > 48 && (
                                  <span className="text-destructive font-bold">
                                    ({Math.floor(health.maxBlockedHours / 24)}d)
                                  </span>
                                )}
                              </div>
                            )}
                            {health.overdueCount === 0 && health.blockedCount === 0 && (
                              <span className="text-success">✓ OK</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link to={`/ota-operations/projects/${project.id}`}>
                              <Button
                                variant={health.health === 'RED' ? 'default' : 'ghost'}
                                size="sm"
                                className={health.health === 'RED' ? 'bg-destructive hover:bg-destructive' : ''}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                {health.health === 'RED' ? 'XEM NGAY' : 'Chi tiết'}
                              </Button>
                            </Link>
                            <Link to={`/ota-operations/tasks?project=${project.id}`}>
                              <Button variant="ghost" size="sm">
                                <FolderKanban className="h-4 w-4 mr-1" />
                                Tasks
                              </Button>
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {sortedProjects.length > 0 && (
              <DataTablePagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={totalCount}
                displayedItems={displayedCount}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                itemLabel="project"
              />
            )}
          </CardContent>
        </Card>

        <CreateProjectDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
        />
      </SectionCard></PageContainer>
    </>
  );
}
