import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { XCircle, Settings, Users, Shield, AlertTriangle, Ban } from "lucide-react";

export function WhatRecommendationsDoNot() {
  const items = [
    { icon: Settings, text: "Không tự set giá hoặc push lên OTA" },
    { icon: Shield, text: "Không override rule đã thiết lập" },
    { icon: Users, text: "Không chạy theo đối thủ" },
    { icon: AlertTriangle, text: "Không che giấu rủi ro" },
    { icon: Ban, text: "Không thay thế quyết định của bạn" },
  ];

  return (
    <Card className="border-dashed border-muted-foreground/30 bg-muted/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <XCircle className="h-4 w-4" />
          Những gì AI KHÔNG bao giờ làm
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {items.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div 
                key={idx} 
                className="flex items-center gap-2 text-xs text-muted-foreground p-2 rounded-lg bg-background/50"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                <span>{item.text}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
