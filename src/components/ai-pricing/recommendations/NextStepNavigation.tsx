import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowLeft, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function NextStepNavigation() {
  const navigate = useNavigate();

  return (
    <Card className="border-dashed bg-muted/30">
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <p className="text-sm text-muted-foreground mb-1">
              Nếu bạn đồng ý với các gợi ý, bước tiếp theo là
            </p>
            <p className="font-medium text-foreground">Xem trước thay đổi giá trong Pricing Engine</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/ai-pricing/insights')}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Insights
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
            >
              <XCircle className="h-4 w-4 mr-1" />
              Bỏ qua
            </Button>

            <Button
              size="sm"
              onClick={() => navigate('/ai-pricing/validation')}
            >
              Xem trước giá
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
