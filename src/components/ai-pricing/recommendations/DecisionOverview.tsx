import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Minus, TrendingDown, Eye, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface DecisionOverviewProps {
  increaseCount: number;
  holdCount: number;
  decreaseCount: number;
  watchCount: number;
  overallConfidence: 'high' | 'medium' | 'low';
  totalDays: number;
}

export function DecisionOverview({
  increaseCount,
  holdCount,
  decreaseCount,
  watchCount,
  overallConfidence,
  totalDays
}: DecisionOverviewProps) {
  const confidenceConfig = {
    high: { label: 'Cao', color: 'text-success', bg: 'bg-success/10 border-success/20' },
    medium: { label: 'Trung bình', color: 'text-warning', bg: 'bg-warning/10 border-warning/20' },
    low: { label: 'Thấp', color: 'text-destructive', bg: 'bg-destructive/10 border-destructive/20' },
  };

  const config = confidenceConfig[overallConfidence];

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-transparent">
      <CardContent className="pt-6">
        {/* Title */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            🎯 Tổng quan hành động
          </h2>
          <Badge variant="outline" className="text-xs">
            {totalDays} ngày phân tích
          </Badge>
        </div>

        {/* Action Summary Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {/* Increase */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-success/10 border border-success/20">
            <TrendingUp className="h-5 w-5 text-success shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Nên tăng</p>
              <p className="text-xl font-bold text-success">{increaseCount} <span className="text-sm font-normal">ngày</span></p>
            </div>
          </div>

          {/* Hold */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted border border-border">
            <Minus className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Giữ giá</p>
              <p className="text-xl font-bold text-muted-foreground">{holdCount} <span className="text-sm font-normal">ngày</span></p>
            </div>
          </div>

          {/* Decrease */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <TrendingDown className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Nên giảm</p>
              <p className="text-xl font-bold text-destructive">{decreaseCount} <span className="text-sm font-normal">ngày</span></p>
            </div>
          </div>

          {/* Watch */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-info/10 border border-info/20">
            <Eye className="h-5 w-5 text-info shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Theo dõi</p>
              <p className="text-xl font-bold text-info">{watchCount} <span className="text-sm font-normal">ngày</span></p>
            </div>
          </div>
        </div>

        {/* Overall Confidence + Disclaimer */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className={cn("inline-flex items-center gap-2 px-3 py-2 rounded-lg border", config.bg)}>
            <span className="text-sm text-muted-foreground">Độ tin cậy tổng:</span>
            <span className={cn("font-semibold", config.color)}>{config.label}</span>
          </div>
          
          <div className="flex-1 flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              <span className="font-medium text-foreground">Roomrise không tự động áp dụng giá.</span> Bạn luôn có toàn quyền quyết định.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
