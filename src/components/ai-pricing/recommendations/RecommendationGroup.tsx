import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Minus, TrendingDown, Eye, ChevronRight, Flame, Clock, AlertCircle, AlertOctagon, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import type { DataEvidence, PercentRange } from "@/hooks/useAIPricingRecommendations";

export type ActionType = 'increase' | 'hold' | 'decrease' | 'watch' | 'silence';
export type Priority = 'immediate' | 'watch' | 'optional';

export interface RecommendationGroupData {
  id: string;
  dateRange: {
    start: Date;
    end: Date;
  };
  action: ActionType;
  actionStrength?: 'light' | 'moderate' | 'strong';
  priority: Priority;
  confidence: number;
  shortReason: string;
  daysCount: number;
  validity: string;
  impactHint?: string;
  dataEvidence?: DataEvidence;
  isSilenced?: boolean;
  silenceReason?: string;
  // NEW: TOP 1 spec fields
  percentRange?: PercentRange;
  decisionSentence?: string;
  keyDrivers?: string[];
  scope?: {
    roomTypes?: string[];
    ratePlans?: string[];
  };
}

interface RecommendationGroupProps {
  group: RecommendationGroupData;
  onViewDetail: (groupId: string) => void;
}

const actionConfig = {
  increase: {
    icon: TrendingUp,
    label: 'Tăng giá',
    color: 'text-success',
    bg: 'bg-success/10 border-success/20',
    iconBg: 'bg-success/10',
    percentColor: 'text-success',
  },
  hold: {
    icon: Minus,
    label: 'Giữ giá',
    color: 'text-muted-foreground',
    bg: 'bg-muted border-border',
    iconBg: 'bg-muted',
    percentColor: 'text-muted-foreground',
  },
  decrease: {
    icon: TrendingDown,
    label: 'Giảm giá',
    color: 'text-destructive',
    bg: 'bg-destructive/10 border-destructive/20',
    iconBg: 'bg-destructive/10',
    percentColor: 'text-destructive',
  },
  watch: {
    icon: Eye,
    label: 'Theo dõi',
    color: 'text-info',
    bg: 'bg-info/10 border-info/20',
    iconBg: 'bg-info/10',
    percentColor: 'text-info',
  },
  silence: {
    icon: AlertOctagon,
    label: 'Chưa đủ dữ liệu',
    color: 'text-muted-foreground',
    bg: 'bg-muted border-border border-dashed',
    iconBg: 'bg-muted',
    percentColor: 'text-muted-foreground',
  },
};

const decisionWeightConfig = {
  immediate: {
    icon: Flame,
    label: 'Cần xử lý sớm',
    color: 'text-warning',
    bg: 'bg-warning/10 border-warning/20',
  },
  watch: {
    icon: Eye,
    label: 'Nên theo dõi',
    color: 'text-warning',
    bg: 'bg-warning/10 border-warning/20',
  },
  optional: {
    icon: null,
    label: 'Ưu tiên thấp',
    color: 'text-muted-foreground',
    bg: 'bg-muted border-border',
  },
};

const strengthLabels = {
  light: 'Nhẹ',
  moderate: 'Trung bình',
  strong: 'Mạnh',
};

export function RecommendationGroup({ group, onViewDetail }: RecommendationGroupProps) {
  const config = actionConfig[group.action];
  const weightCfg = decisionWeightConfig[group.priority];
  const Icon = config.icon;
  const WeightIcon = weightCfg.icon;

  const formatDateRange = () => {
    const start = format(group.dateRange.start, 'dd/MM', { locale: vi });
    const end = format(group.dateRange.end, 'dd/MM', { locale: vi });
    return start === end ? start : `${start} – ${end}`;
  };

  // Format percent range display
  const formatPercentRange = () => {
    if (!group.percentRange) return null;
    const { min, max } = group.percentRange;
    const sign = min >= 0 ? '+' : '';
    const signMax = max >= 0 ? '+' : '';
    return `${sign}${min}% → ${signMax}${max}%`;
  };

  // Silence state
  if (group.isSilenced) {
    return (
      <Card className={cn("transition-all border-l-4 border-dashed", config.bg)}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg shrink-0", config.iconBg)}>
              <AlertOctagon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">{formatDateRange()}</span>
                <Badge variant="secondary" className="text-xs">
                  {group.daysCount} ngày
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                ⚠️ {group.silenceReason || 'Chưa đủ dữ liệu để đưa ra khuyến nghị đáng tin cậy.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("transition-all hover:shadow-md cursor-pointer border-l-4", config.bg)}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Action info */}
          <div className="flex items-start gap-3 flex-1">
            <div className={cn("p-2 rounded-lg shrink-0", config.iconBg)}>
              <Icon className={cn("h-5 w-5", config.color)} />
            </div>
            
            <div className="space-y-2 flex-1 min-w-0">
              {/* Row 1: Action badge + Strength + Confidence + Validity */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={cn("text-xs font-medium", config.color)}>
                  {config.label}
                </Badge>
                {group.actionStrength && (
                  <Badge variant="secondary" className="text-xs">
                    {strengthLabels[group.actionStrength]}
                  </Badge>
                )}
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "text-xs",
                    group.confidence >= 0.75 ? "bg-success/10 text-success" :
                    group.confidence >= 0.5 ? "bg-warning/10 text-warning" :
                    "bg-destructive/10 text-destructive"
                  )}
                >
                  {(group.confidence * 100).toFixed(0)}%
                </Badge>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {group.validity}
                </span>
              </div>

              {/* Row 2: PERCENT RANGE (Main highlight - TOP 1 spec) */}
              {group.percentRange && (
                <div className="flex items-center gap-3 py-2">
                  <span className={cn("text-2xl font-bold tracking-tight", config.percentColor)}>
                    {formatPercentRange()}
                  </span>
                  <div className="flex flex-col text-xs text-muted-foreground">
                    <span>{group.percentRange.min >= 0 ? '+' : ''}{group.percentRange.min}% ({group.percentRange.minLabel})</span>
                    <span>{group.percentRange.max >= 0 ? '+' : ''}{group.percentRange.max}% ({group.percentRange.maxLabel})</span>
                  </div>
                </div>
              )}

              {/* Row 3: Scope line */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">{group.scope?.roomTypes?.join(', ') || 'Tất cả'}</span>
                <span>·</span>
                <span>{formatDateRange()}</span>
                <span>·</span>
                <span>{group.daysCount} ngày</span>
              </div>

              {/* Row 4: Key drivers */}
              {group.keyDrivers && group.keyDrivers.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Zap className="h-3 w-3 text-warning" />
                  <span className="text-muted-foreground">Key drivers:</span>
                  <span className="font-medium text-foreground">{group.keyDrivers.join(' + ')}</span>
                </div>
              )}

              {/* Row 5: Decision Weight */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={cn("text-xs border font-medium", weightCfg.bg, weightCfg.color)}>
                  {WeightIcon && <WeightIcon className="h-3 w-3 mr-1" />}
                  {weightCfg.label}
                </Badge>
              </div>

              {/* Row 6: Impact Hint */}
              {group.impactHint && (
                <div className="flex items-start gap-1.5 text-xs text-warning bg-warning/10 px-2 py-1.5 rounded-md border border-warning/20">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{group.impactHint}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right: CTA buttons */}
          <div className="flex flex-col gap-2 shrink-0">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => onViewDetail(group.id)}
            >
              Xem chi tiết
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
