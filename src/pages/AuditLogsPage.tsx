import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Loader2,
  History,
  User,
  FileText,
  Eye,
  Download,
  Calendar,
} from "lucide-react";
import { FilterBar } from "@/components/ui/filter-bar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTablePagination } from "@/hooks/useTablePagination";
import { DataTablePagination } from "@/components/ui/data-table-pagination";

interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before_data: unknown;
  after_data: unknown;
  ip_address: string | null;
  user_agent: string | null;
  role_snapshot: string | null;
  event_time: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
}

const actionLabels: Record<string, string> = {
  CREATE: "Tạo mới",
  UPDATE: "Cập nhật",
  DELETE: "Xóa",
  APPROVE: "Phê duyệt",
  REJECT: "Từ chối",
  EXPORT: "Xuất dữ liệu",
  LOGIN: "Đăng nhập",
  LOGOUT: "Đăng xuất",
};

const entityLabels: Record<string, string> = {
  booking: "Booking",
  stay: "Lưu trú",
  payment: "Thanh toán",
  partner: "Đối tác",
  service: "Dịch vụ",
  dispute: "Tranh chấp",
  payout: "Payout",
  user: "Người dùng",
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, entityFilter]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("event_time", { ascending: false })
        .limit(200);

      if (actionFilter !== "all") {
        query = query.eq("action", actionFilter);
      }

      if (entityFilter !== "all") {
        query = query.eq("entity", entityFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      setLogs(data || []);

      // Fetch profiles for user names
      const userIds = [...new Set((data || []).map((l) => l.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds as string[]);

        const profilesMap: Record<string, Profile> = {};
        (profilesData || []).forEach((p) => {
          profilesMap[p.id] = p;
        });
        setProfiles(profilesMap);
      }
    } catch (err: any) {
      toast.error("Lỗi", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      log.entity_id?.toLowerCase().includes(search) ||
      log.entity.toLowerCase().includes(search) ||
      log.action.toLowerCase().includes(search)
    );
  });

  // Pagination
  const { page, pageSize, setPage, setPageSize, paginatedData, totalPages, displayedCount, totalCount } =
    useTablePagination(filteredLogs, { defaultPageSize: 10, resetDeps: [searchTerm, actionFilter, entityFilter] });

  const getUserName = (userId: string | null) => {
    if (!userId) return "Hệ thống";
    const profile = profiles[userId];
    return profile?.full_name || profile?.email || userId.slice(0, 8);
  };

  return (
    <>
      <Header
        title="Audit Logs"
        subtitle="Nhật ký hoạt động hệ thống"
        actions={
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Xuất Log
          </Button>
        }
      />

      <PageContainer>
        <SectionCard>
          {/* Filters */}
          <FilterBar
            title="Bộ lọc"
            subtitle="Tìm kiếm và lọc nhật ký"
            hasActiveFilters={!!(searchTerm || actionFilter !== "all" || entityFilter !== "all")}
            onClearFilters={() => {
              setSearchTerm("");
              setActionFilter("all");
              setEntityFilter("all");
            }}
          >
            <FilterBar.Field label="Tìm kiếm" colSpan={2}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Tìm theo entity ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </FilterBar.Field>

            <FilterBar.Field label="Hành động">
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="CREATE">Tạo mới</SelectItem>
                  <SelectItem value="UPDATE">Cập nhật</SelectItem>
                  <SelectItem value="DELETE">Xóa</SelectItem>
                  <SelectItem value="APPROVE">Phê duyệt</SelectItem>
                  <SelectItem value="EXPORT">Xuất dữ liệu</SelectItem>
                </SelectContent>
              </Select>
            </FilterBar.Field>

            <FilterBar.Field label="Đối tượng">
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="booking">Booking</SelectItem>
                  <SelectItem value="payment">Thanh toán</SelectItem>
                  <SelectItem value="partner">Đối tác</SelectItem>
                  <SelectItem value="service">Dịch vụ</SelectItem>
                  <SelectItem value="payout">Payout</SelectItem>
                </SelectContent>
              </Select>
            </FilterBar.Field>
          </FilterBar>

          {/* Logs Table */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Chưa có log nào</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[180px]">
                      Thời gian
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[160px]">
                      Người thực hiện
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[100px]">
                      Hành động
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[120px]">
                      Đối tượng
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[120px]">
                      ID
                    </th>
                    <th className="px-4 py-3 w-[50px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedData.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {new Date(log.event_time).toLocaleString("en-GB")}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{getUserName(log.user_id)}</span>
                          {log.role_snapshot && (
                            <span className="text-xs text-muted-foreground">
                              ({log.role_snapshot})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-sm font-medium ${log.action === "DELETE"
                              ? "text-danger"
                              : log.action === "CREATE"
                                ? "text-success"
                                : "text-foreground"
                            }`}
                        >
                          {actionLabels[log.action] || log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            {entityLabels[log.entity] || log.entity}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                        {log.entity_id?.slice(0, 12) || "-"}
                      </td>
                      <td className="px-4 py-3">
                        {(log.before_data || log.after_data) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setSelectedLog(log)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <DataTablePagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={totalCount}
                displayedItems={displayedCount}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                itemLabel="log"
              />
            </div>
          )}
        </SectionCard>
      </PageContainer>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent size="2xl" className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chi tiết thay đổi</DialogTitle>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Thời gian:</span>
                  <p className="font-medium">
                    {new Date(selectedLog.event_time).toLocaleString("en-GB")}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Người thực hiện:</span>
                  <p className="font-medium">{getUserName(selectedLog.user_id)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Hành động:</span>
                  <p className="font-medium">
                    {actionLabels[selectedLog.action] || selectedLog.action}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Đối tượng:</span>
                  <p className="font-medium">
                    {entityLabels[selectedLog.entity] || selectedLog.entity} -{" "}
                    {selectedLog.entity_id}
                  </p>
                </div>
              </div>

              {selectedLog.before_data && (
                <div>
                  <h4 className="font-medium mb-2 text-danger">Trước thay đổi:</h4>
                  <pre className="p-3 rounded-lg bg-muted text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.before_data, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.after_data && (
                <div>
                  <h4 className="font-medium mb-2 text-success">Sau thay đổi:</h4>
                  <pre className="p-3 rounded-lg bg-muted text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.after_data, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.ip_address && (
                <div className="text-xs text-muted-foreground">
                  IP: {selectedLog.ip_address}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
