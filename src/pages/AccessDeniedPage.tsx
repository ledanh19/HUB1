import { ShieldX, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link, useNavigate } from "react-router-dom";
import { AppLink } from "@/components/system/AppLink";

export default function AccessDeniedPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-4">
          <div className="text-center space-y-4">
            {/* Icon */}
            <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
              <ShieldX className="h-8 w-8 text-destructive" />
            </div>

            {/* Title */}
            <div className="space-y-2">
              <h1 className="text-hero-kpi font-bold tabular-nums tracking-tight text-foreground">
                Không có quyền truy cập
              </h1>
              <p className="text-muted-foreground">
                Bạn không có quyền xem trang này. Vui lòng liên hệ quản trị viên nếu bạn cho rằng đây là lỗi.
              </p>
            </div>

            {/* Error code */}
            <div className="py-4">
              <span className="text-6xl font-bold text-muted-foreground/20">403</span>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button
                variant="outline"
                onClick={() => navigate(-1)}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Quay lại
              </Button>
              <Button asChild className="gap-2">
                <AppLink to="/">
                  <Home className="h-4 w-4" />
                  Về trang chủ
                </AppLink>
              </Button>
            </div>

            {/* Help text */}
            <p className="text-xs text-muted-foreground pt-4">
              Mã lỗi: ACCESS_DENIED • Nếu cần trợ giúp, vui lòng liên hệ admin.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
