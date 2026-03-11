import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Lock,
  Unlock,
  Calendar,
  Loader2,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface FinancialPeriod {
  id: string;
  period_year: number;
  period_month: number;
  status: string;
  closed_at: string | null;
  closed_by: string | null;
  note: string | null;
  created_at: string;
}

const monthNames = [
  "Tháng 1",
  "Tháng 2",
  "Tháng 3",
  "Tháng 4",
  "Tháng 5",
  "Tháng 6",
  "Tháng 7",
  "Tháng 8",
  "Tháng 9",
  "Tháng 10",
  "Tháng 11",
  "Tháng 12",
];

export default function FinancePeriodsPage() {
  const [periods, setPeriods] = useState<FinancialPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<FinancialPeriod | null>(null);
  const [dialogAction, setDialogAction] = useState<"close" | "open" | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const { user, userRole } = useAuth();

  useEffect(() => {
    fetchPeriods();
  }, []);

  const fetchPeriods = async () => {
    try {
      const { data, error } = await supabase
        .from("financial_periods")
        .select("*")
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false });

      if (error) throw error;

      // Generate periods for current year if not exist
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      const existingPeriods = data || [];
      const generatedPeriods: FinancialPeriod[] = [];

      for (let month = 1; month <= 12; month++) {
        const exists = existingPeriods.some(
          (p) => p.period_year === currentYear && p.period_month === month
        );
        if (!exists) {
          generatedPeriods.push({
            id: `temp-${currentYear}-${month}`,
            period_year: currentYear,
            period_month: month,
            status: "OPEN",
            closed_at: null,
            closed_by: null,
            note: null,
            created_at: new Date().toISOString(),
          });
        }
      }

      // Combine and sort
      const allPeriods = [...existingPeriods, ...generatedPeriods].sort((a, b) => {
        if (a.period_year !== b.period_year) return b.period_year - a.period_year;
        return b.period_month - a.period_month;
      });

      setPeriods(allPeriods);
    } catch (err: any) {
      toast.error("Lỗi", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleClosePeriod = async () => {
    if (!selectedPeriod || !user) return;
    setSaving(true);

    try {
      if (selectedPeriod.id.startsWith("temp-")) {
        // Create new period record
        const { error } = await safeMutation(() => supabase.from("financial_periods").insert({
          period_year: selectedPeriod.period_year,
          period_month: selectedPeriod.period_month,
          status: "CLOSED",
          closed_at: new Date().toISOString(),
          closed_by: user.id,
          note: note || null,
        }));
        if (error) throw error;
      } else {
        // Update existing period
        const { error } = await supabase
          .from("financial_periods")
          .update({
            status: "CLOSED",
            closed_at: new Date().toISOString(),
            closed_by: user.id,
            note: note || null,
          })
          .eq("id", selectedPeriod.id);
        if (error) throw error;
      }

      toast.success("Thành công", { description: `Đã khóa kỳ ${monthNames[selectedPeriod.period_month - 1]} ${selectedPeriod.period_year}` });

      setDialogAction(null);
      setSelectedPeriod(null);
      setNote("");
      fetchPeriods();
    } catch (err: any) {
      toast.error("Lỗi", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenPeriod = async () => {
    if (!selectedPeriod || selectedPeriod.id.startsWith("temp-")) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from("financial_periods")
        .update({
          status: "OPEN",
          closed_at: null,
          closed_by: null,
          note: note ? `Mở lại: ${note}` : null,
        })
        .eq("id", selectedPeriod.id);

      if (error) throw error;

      toast.success("Thành công", { description: `Đã mở lại kỳ ${monthNames[selectedPeriod.period_month - 1]} ${selectedPeriod.period_year}` });

      setDialogAction(null);
      setSelectedPeriod(null);
      setNote("");
      fetchPeriods();
    } catch (err: any) {
      toast.error("Lỗi", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const isAdmin = userRole === "admin";
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  return (
    <>
      <Header
        title="Khóa kỳ tài chính"
        subtitle="Quản lý đóng/mở kỳ kế toán"
      />

      <PageContainer><SectionCard>
        {!isAdmin && (
          <div className="rounded-lg border border-warning/50 bg-warning/10 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
            <div>
              <p className="font-medium text-warning">Chỉ Admin mới có thể đóng/mở kỳ</p>
              <p className="text-sm text-muted-foreground mt-1">
                Bạn chỉ có thể xem trạng thái các kỳ tài chính
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {periods.map((period) => {
              const isCurrent =
                period.period_year === currentYear &&
                period.period_month === currentMonth;
              const isClosed = period.status === "CLOSED";
              const isPast =
                period.period_year < currentYear ||
                (period.period_year === currentYear &&
                  period.period_month < currentMonth);

              return (
                <div
                  key={period.id}
                  className={`rounded-xl border bg-card p-4 ${isCurrent ? "border-primary" : "border-border"
                    }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {monthNames[period.period_month - 1]} {period.period_year}
                      </span>
                    </div>
                    {isCurrent && (
                      <StatusBadge variant="info" size="sm">
                        Hiện tại
                      </StatusBadge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    {isClosed ? (
                      <Lock className="h-4 w-4 text-danger" />
                    ) : (
                      <Unlock className="h-4 w-4 text-success" />
                    )}
                    <StatusBadge
                      variant={isClosed ? "danger" : "success"}
                      size="sm"
                    >
                      {isClosed ? "Đã khóa" : "Đang mở"}
                    </StatusBadge>
                  </div>

                  {period.closed_at && (
                    <p className="text-xs text-muted-foreground mb-3">
                      Khóa lúc: {new Date(period.closed_at).toLocaleString("en-GB")}
                    </p>
                  )}

                  {isAdmin && (
                    <div className="flex gap-2">
                      {isClosed ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            setSelectedPeriod(period);
                            setDialogAction("open");
                          }}
                        >
                          <Unlock className="mr-2 h-3 w-3" />
                          Mở lại
                        </Button>
                      ) : isPast ? (
                        <Button
                          variant="default"
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            setSelectedPeriod(period);
                            setDialogAction("close");
                          }}
                        >
                          <Lock className="mr-2 h-3 w-3" />
                          Khóa kỳ
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          disabled
                        >
                          Chưa kết thúc
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard></PageContainer>

      {/* Close Period Dialog */}
      <Dialog open={dialogAction === "close"} onOpenChange={() => setDialogAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Khóa kỳ tài chính</DialogTitle>
            <DialogDescription>
              {selectedPeriod &&
                `Bạn sắp khóa kỳ ${monthNames[selectedPeriod.period_month - 1]} ${selectedPeriod.period_year}. Sau khi khóa, không thể sửa dữ liệu tài chính trong kỳ này.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
              <p className="text-sm">
                Hãy chắc chắn tất cả dữ liệu đã được đối chiếu và chính xác trước khi khóa kỳ.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Ghi chú (tùy chọn)</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Lý do khóa kỳ..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAction(null)}>
              Huỷ
            </Button>
            <Button onClick={handleClosePeriod} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xác nhận khóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Open Period Dialog */}
      <Dialog open={dialogAction === "open"} onOpenChange={() => setDialogAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mở lại kỳ tài chính</DialogTitle>
            <DialogDescription>
              {selectedPeriod &&
                `Bạn sắp mở lại kỳ ${monthNames[selectedPeriod.period_month - 1]} ${selectedPeriod.period_year}. Điều này cho phép chỉnh sửa dữ liệu tài chính.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Lý do mở lại *</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Lý do cần mở lại kỳ này..."
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAction(null)}>
              Huỷ
            </Button>
            <Button onClick={handleOpenPeriod} disabled={saving || !note.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Mở lại kỳ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
