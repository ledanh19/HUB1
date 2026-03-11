import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  TrendingUp,
  Minus,
  TrendingDown,
  Eye,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ThumbsUp,
  ThumbsDown,
  X,
  Database,
  Target,
  Zap,
  Shield,
  TrendingUpIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { ActionType, Priority } from "./RecommendationGroup";
import type { TemporalContext, SilenceConditions, PercentRange } from "@/hooks/useAIPricingRecommendations";

// Data evidence for debugging (TOP 1 SPEC compliant)
export interface DataEvidence {
  soldRooms: number;
  availableRooms: number;
  totalCapacity: number;
  velocity7d: number;
  baselineVelocity: number | null; // null = không đủ dữ liệu
  baselineSampleSize?: number;
  leadTimeBucket: string;
  dataLagMinutes: number;
  occupancyPct: number;
}

export interface RecommendationDetailData {
  id: string;
  dateRange: { start: Date; end: Date };
  action: ActionType;
  actionStrength: 'light' | 'moderate' | 'strong';
  priority: Priority;
  confidence: number;
  validity: string;

  // TOP 1 SPEC: Decision sentence
  decisionSentence?: string;

  // TOP 1 SPEC: Percent range
  percentRange?: PercentRange;

  // TOP 1 SPEC: Key drivers (1-2)
  keyDrivers?: string[];

  // WHY - Observation
  observation: {
    demandLevel: 'high' | 'medium' | 'low';
    sellingSpeed: 'fast' | 'normal' | 'slow';
    inventoryTrend: 'decreasing' | 'stable' | 'high';
    description: string;
  };

  // WHY - Comparison
  comparison: {
    velocityVsBaseline: number;
    leadTimeVsBaseline: number;
    description: string;
  };

  // WHY - Implications
  implications: string;

  // WHY NOT
  whyNot: string[];

  // Scope
  scope: {
    roomTypes?: string[];
    channels?: string[];
  };

  // Data evidence (6 key metrics)
  dataEvidence?: DataEvidence;
}

interface RecommendationDetailProps {
  detail: RecommendationDetailData | null;
  open: boolean;
  onClose: () => void;
  onFeedback: (id: string, feedback: 'agree' | 'disagree', note?: string, reasons?: string[]) => void;
}

const actionConfig = {
  increase: {
    icon: TrendingUp,
    label: 'Tăng giá',
    color: 'text-success',
    bg: 'bg-success/10',
    percentColor: 'text-success',
  },
  hold: {
    icon: Minus,
    label: 'Giữ giá',
    color: 'text-muted-foreground',
    bg: 'bg-muted',
    percentColor: 'text-muted-foreground',
  },
  decrease: {
    icon: TrendingDown,
    label: 'Giảm giá',
    color: 'text-destructive',
    bg: 'bg-destructive/10',
    percentColor: 'text-destructive',
  },
  watch: {
    icon: Eye,
    label: 'Theo dõi',
    color: 'text-info',
    bg: 'bg-info/10',
    percentColor: 'text-info',
  },
  silence: {
    icon: AlertTriangle,
    label: 'Chưa đủ dữ liệu',
    color: 'text-muted-foreground',
    bg: 'bg-muted',
    percentColor: 'text-muted-foreground',
  },
};

const strengthLabels = {
  light: 'Nhẹ',
  moderate: 'Trung bình',
  strong: 'Mạnh',
};

// Structured feedback reasons (TOP 1 spec)
const DISAGREE_REASONS = [
  { id: 'priority_occupancy', label: 'Ưu tiên lấp phòng hơn tối ưu giá' },
  { id: 'competitive_market', label: 'Thị trường cạnh tranh mạnh' },
  { id: 'external_factors', label: 'Có yếu tố ngoài hệ thống (event/đối thủ/đoàn…)' },
  { id: 'data_unreliable', label: 'Dữ liệu hôm nay không đáng tin' },
  { id: 'other', label: 'Khác' },
];

export function RecommendationDetail({ detail, open, onClose, onFeedback }: RecommendationDetailProps) {
  const [feedbackNote, setFeedbackNote] = useState("");
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [showDisagreeForm, setShowDisagreeForm] = useState(false);

  if (!detail) return null;

  const config = actionConfig[detail.action];
  const Icon = config.icon;

  const formatDateRange = () => {
    const start = format(detail.dateRange.start, 'dd/MM/yyyy', { locale: vi });
    const end = format(detail.dateRange.end, 'dd/MM/yyyy', { locale: vi });
    return start === end ? start : `${start} – ${end}`;
  };

  const handleAgree = () => {
    onFeedback(detail.id, 'agree', feedbackNote || undefined);
    setFeedbackNote("");
    onClose();
  };

  const handleDisagree = () => {
    if (selectedReasons.length === 0) {
      setShowDisagreeForm(true);
      return;
    }
    onFeedback(detail.id, 'disagree', feedbackNote || undefined, selectedReasons);
    setFeedbackNote("");
    setSelectedReasons([]);
    setShowDisagreeForm(false);
    onClose();
  };

  const toggleReason = (reasonId: string) => {
    setSelectedReasons(prev =>
      prev.includes(reasonId)
        ? prev.filter(r => r !== reasonId)
        : [...prev, reasonId]
    );
  };

  // Format percent range for display
  const formatPercentRange = () => {
    if (!detail.percentRange) return null;
    const { min, max } = detail.percentRange;
    const sign = min >= 0 ? '+' : '';
    const signMax = max >= 0 ? '+' : '';
    return `${sign}${min}% → ${signMax}${max}%`;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="recommendation-detail-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={cn("h-5 w-5", config.color)} />
            Chi tiết gợi ý – {formatDateRange()}
          </DialogTitle>
          <p id="recommendation-detail-description" className="sr-only">
            Chi tiết phân tích và lý do cho gợi ý giá
          </p>
        </DialogHeader>

        <div className="space-y-5">
          {/* DECISION SENTENCE (TOP 1 spec - must be first) */}
          {detail.decisionSentence && (
            <Card className="border-2 border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
              <CardContent className="pt-4">
                <p className="text-base font-medium text-foreground leading-relaxed">
                  {detail.decisionSentence}
                </p>
              </CardContent>
            </Card>
          )}

          {/* PERCENT RANGE BLOCK (TOP 1 spec) */}
          {detail.percentRange && (
            <Card className={cn("border-2", config.bg)}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Khuyến nghị điều chỉnh (bạn quyết định)</p>
                    <p className={cn("text-3xl font-bold tracking-tight", config.percentColor)}>
                      {formatPercentRange()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Độ tin cậy</p>
                    <p className={cn(
                      "text-2xl font-bold",
                      detail.confidence >= 0.75 ? "text-success" :
                        detail.confidence >= 0.5 ? "text-warning" : "text-destructive"
                    )}>
                      {(detail.confidence * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>

                {/* Risk labels */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-success/10/50 border border-success/20">
                    <Shield className="h-4 w-4 text-success" />
                    <div>
                      <p className="text-xs font-medium text-success">
                        {detail.percentRange.min >= 0 ? '+' : ''}{detail.percentRange.min}%
                      </p>
                      <p className="text-xs text-success">{detail.percentRange.minLabel}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-warning/10/50 border border-warning/20">
                    <TrendingUpIcon className="h-4 w-4 text-warning" />
                    <div>
                      <p className="text-xs font-medium text-warning">
                        {detail.percentRange.max >= 0 ? '+' : ''}{detail.percentRange.max}%
                      </p>
                      <p className="text-xs text-warning">{detail.percentRange.maxLabel}</p>
                    </div>
                  </div>
                </div>

                {/* Recommended point */}
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">AI đề xuất:</span>
                  <span className="text-xs font-bold text-primary">
                    {detail.percentRange.recommended >= 0 ? '+' : ''}{detail.percentRange.recommended}%
                  </span>
                  <span className="text-xs text-muted-foreground">(đánh giá lại sau {detail.validity})</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Scope & Key Drivers */}
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Phạm vi:</span>
              <Badge variant="outline">{detail.scope.roomTypes?.join(', ') || 'Tất cả room types'}</Badge>
            </div>
            {detail.keyDrivers && detail.keyDrivers.length > 0 && (
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-warning" />
                <span className="text-muted-foreground">Key drivers:</span>
                <span className="font-medium">{detail.keyDrivers.join(' + ')}</span>
              </div>
            )}
          </div>

          <Separator />

          {/* DATA EVIDENCE (6 key metrics - TOP 1 spec) */}
          {detail.dataEvidence && (
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground flex items-center gap-2 text-xs">
                <Database className="h-4 w-4 text-muted-foreground" />
                Dữ liệu nền (Evidence)
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">Occupancy</p>
                  <p className="font-mono font-bold text-lg">{detail.dataEvidence.occupancyPct}%</p>
                </div>
                <div className="p-2 rounded bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">Sold / Remaining / Cap</p>
                  <p className="font-mono font-bold">
                    {detail.dataEvidence.soldRooms} / {detail.dataEvidence.availableRooms} / {detail.dataEvidence.totalCapacity}
                  </p>
                </div>
                <div className="p-2 rounded bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">Velocity 7d</p>
                  <p className="font-mono font-bold">{detail.dataEvidence.velocity7d.toFixed(2)}/ngày</p>
                </div>
                <div className="p-2 rounded bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">Baseline velocity</p>
                  {detail.dataEvidence.baselineVelocity !== null ? (
                    <p className="font-mono font-bold">{detail.dataEvidence.baselineVelocity.toFixed(2)}/ngày</p>
                  ) : (
                    <p className="text-xs text-warning font-medium">Không đủ dữ liệu</p>
                  )}
                  {detail.dataEvidence.baselineSampleSize !== undefined && (
                    <p className="text-xs text-muted-foreground">({detail.dataEvidence.baselineSampleSize} mẫu)</p>
                  )}
                </div>
                <div className="p-2 rounded bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">Lead time bucket</p>
                  <p className="font-mono font-bold text-xs">{detail.dataEvidence.leadTimeBucket}</p>
                </div>
                <div className="p-2 rounded bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">Data lag</p>
                  <p className={cn(
                    "font-mono font-bold",
                    detail.dataEvidence.dataLagMinutes > 120 ? "text-warning" : ""
                  )}>
                    {detail.dataEvidence.dataLagMinutes} phút
                  </p>
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* WHY Section (compact) */}
          <div className="space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2 text-xs">
              <CheckCircle className="h-4 w-4 text-success" />
              Vì sao AI gợi ý như vậy
            </h3>
            <div className="pl-4 border-l-2 border-success/20 space-y-2">
              <p className="text-xs text-muted-foreground">{detail.observation.description}</p>
              <p className="text-xs">
                <span className="text-muted-foreground">Velocity vs baseline: </span>
                <span className={cn(
                  "font-medium",
                  detail.comparison.velocityVsBaseline > 0 ? "text-success" :
                    detail.comparison.velocityVsBaseline < 0 ? "text-destructive" : "text-muted-foreground"
                )}>
                  {detail.comparison.velocityVsBaseline > 0 ? '+' : ''}{detail.comparison.velocityVsBaseline}%
                </span>
              </p>
            </div>
          </div>

          {/* Implications */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <p className="text-xs text-warning">{detail.implications}</p>
          </div>

          <Separator />

          {/* WHY NOT Section */}
          <div className="space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2 text-xs">
              <XCircle className="h-4 w-4 text-destructive" />
              Vì sao AI KHÔNG gợi ý hành động khác
            </h3>
            <ul className="space-y-1.5 pl-4">
              {detail.whyNot.map((reason, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <X className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                  {reason}
                </li>
              ))}
            </ul>
          </div>

          <Separator />

          {/* Priority & Validity */}
          <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Ưu tiên:</span>
              <Badge variant="outline" className={cn(
                detail.priority === 'immediate' ? "text-destructive bg-destructive/10" :
                  detail.priority === 'watch' ? "text-warning bg-warning/10" : ""
              )}>
                {detail.priority === 'immediate' ? 'Xử lý sớm' :
                  detail.priority === 'watch' ? 'Theo dõi' : 'Ưu tiên thấp'}
              </Badge>
            </div>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Hiệu lực:</span>
              <span className="font-medium">{detail.validity}</span>
            </div>
          </div>

          <Separator />

          {/* STRUCTURED FEEDBACK (TOP 1 spec) */}
          <div className="space-y-3">
            <p className="text-xs font-medium">Phản hồi của bạn</p>

            {showDisagreeForm ? (
              <div className="space-y-3 p-3 bg-destructive/10/50 rounded-lg border border-destructive/20">
                <p className="text-xs text-destructive font-medium">Vui lòng chọn lý do:</p>
                <div className="space-y-2">
                  {DISAGREE_REASONS.map(reason => (
                    <label key={reason.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={selectedReasons.includes(reason.id)}
                        onCheckedChange={() => toggleReason(reason.id)}
                      />
                      <span>{reason.label}</span>
                    </label>
                  ))}
                </div>
                {selectedReasons.includes('other') && (
                  <Textarea
                    placeholder="Mô tả lý do khác..."
                    value={feedbackNote}
                    onChange={(e) => setFeedbackNote(e.target.value)}
                    className="min-h-[60px] text-xs"
                  />
                )}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowDisagreeForm(false);
                      setSelectedReasons([]);
                    }}
                  >
                    Hủy
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDisagree}
                    disabled={selectedReasons.length === 0}
                  >
                    Gửi phản hồi
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleAgree}
                  className="flex-1 border-success/20 text-success hover:bg-success/10"
                >
                  <ThumbsUp className="h-4 w-4 mr-2" />
                  Đồng ý
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowDisagreeForm(true)}
                  className="flex-1 border-destructive/20 text-destructive hover:bg-destructive/10"
                >
                  <ThumbsDown className="h-4 w-4 mr-2" />
                  Không đồng ý
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
