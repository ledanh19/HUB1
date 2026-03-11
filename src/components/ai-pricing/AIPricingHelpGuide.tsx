import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  HelpCircle, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  Info,
  ShieldCheck
} from "lucide-react";

export function AIPricingHelpGuide() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <HelpCircle className="h-4 w-4" />
          Hướng dẫn
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            AI Smart Pricing / Insights - Hướng dẫn sử dụng
          </DialogTitle>
          <DialogDescription>
            Hiểu đúng để sử dụng hiệu quả
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6 text-sm">
            {/* Section 1: Definition */}
            <section>
              <h3 className="font-semibold text-foreground mb-2">1. AI Smart Pricing là gì?</h3>
              <p className="text-muted-foreground mb-3">
                AI Smart Pricing / Insights là công cụ phân tích thị trường OTA dựa trên dữ liệu đặt phòng thực tế, giúp bạn:
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                <li>Hiểu khách đang đặt nhanh hay chậm</li>
                <li>Phát hiện ngày có nguy cơ bán hết sớm</li>
                <li>Phát hiện ngày có nguy cơ trống phòng</li>
                <li>Hỗ trợ ra quyết định giá chính xác hơn</li>
              </ul>
              
              <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="font-medium text-destructive mb-2">⚠️ AI Smart Pricing KHÔNG:</p>
                <ul className="list-disc list-inside space-y-1 text-destructive/80 ml-2">
                  <li>Tự động thay đổi giá</li>
                  <li>Áp dụng giá lên OTA</li>
                  <li>Thay thế quyết định của con người</li>
                </ul>
              </div>
            </section>

            <Separator />

            {/* Section 2: Data Sources */}
            <section>
              <h3 className="font-semibold text-foreground mb-2">2. AI đang dựa trên dữ liệu gì?</h3>
              
              <div className="space-y-3">
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                  <p className="font-medium text-foreground mb-1">Đặt phòng thực tế từ OTA</p>
                  <p className="text-muted-foreground text-xs">
                    AI phân tích các đặt phòng OTA đã xảy ra (Booking, Agoda, Expedia…), 
                    thời điểm khách đặt, ngày lưu trú, số lượng phòng.
                  </p>
                </div>
                
                <div className="p-3 bg-muted/50 border rounded-lg">
                  <p className="font-medium text-foreground mb-1">Tồn phòng (Inventory) từ Channex</p>
                  <p className="text-muted-foreground text-xs">
                    Inventory dùng để biết còn phòng hay không, tính tỷ lệ lấp phòng - 
                    KHÔNG dùng để đo nhu cầu.
                  </p>
                </div>
              </div>
            </section>

            <Separator />

            {/* Section 3: Limitations */}
            <section>
              <h3 className="font-semibold text-foreground mb-2">3. AI KHÔNG biết những gì?</h3>
              <div className="p-3 bg-warning/100/10 border border-warning/20 rounded-lg">
                <ul className="list-disc list-inside space-y-1 text-warning text-xs">
                  <li>Khách đã xem phòng nhưng không đặt</li>
                  <li>Khách bỏ đi vì giá cao</li>
                  <li>Search volume, impression OTA</li>
                  <li>Sự kiện địa phương, lễ hội</li>
                  <li>Chiến dịch marketing của bạn</li>
                  <li>Chiến lược giữ phòng nội bộ</li>
                </ul>
                <p className="mt-2 text-warning font-medium text-xs">
                  → AI chỉ phản ánh những gì đã xảy ra, KHÔNG đảm bảo dự đoán tương lai chính xác.
                </p>
              </div>
            </section>

            <Separator />

            {/* Section 4: Metrics Explanation */}
            <section>
              <h3 className="font-semibold text-foreground mb-2">4. Giải thích các chỉ số</h3>
              
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-0.5">8/40</Badge>
                  <div>
                    <p className="font-medium text-foreground">Tồn phòng</p>
                    <p className="text-muted-foreground text-xs">
                      8 = còn bán được, 40 = tổng số phòng. Khi = 0, có thể bán hết hoặc đang khóa bán.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-0.5">75%</Badge>
                  <div>
                    <p className="font-medium text-foreground">Tỷ lệ lấp phòng (Occupancy)</p>
                    <p className="text-muted-foreground text-xs">
                      75% số phòng đã được bán hoặc khóa.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-0.5 bg-success/100/10">+100% (+1)</Badge>
                  <div>
                    <p className="font-medium text-foreground">Tốc độ đặt phòng (Velocity)</p>
                    <p className="text-muted-foreground text-xs">
                      AI luôn hiển thị cả % và số lượng thật để tránh hiểu nhầm. 
                      +100% (+1 booking) = nhanh hơn bình thường nhưng chỉ tăng 1 phòng.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <Separator />

            {/* Section 5: Data Confidence */}
            <section>
              <h3 className="font-semibold text-foreground mb-2">5. "Data Confidence" là gì?</h3>
              <div className="p-3 bg-info/100/10 border border-info/20 rounded-lg">
                <p className="text-info mb-2">
                  <strong>Data Confidence = Độ tin cậy của dữ liệu</strong>
                </p>
                <p className="text-info text-xs mb-2">
                  Nó phản ánh: Dữ liệu có mới không, có đủ lịch sử để so sánh không, có dấu hiệu bất thường không.
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <XCircle className="h-3 w-3 text-destructive" />
                  <span className="text-destructive">
                    KHÔNG phải độ chính xác của AI hay dự đoán kết quả.
                  </span>
                </div>
              </div>
            </section>

            <Separator />

            {/* Section 6: Flags */}
            <section>
              <h3 className="font-semibold text-foreground mb-2">6. Các cảnh báo (Flags)</h3>
              <div className="space-y-2">
                {[
                  { flag: "LV", name: "LOW VOLUME", desc: "Ít dữ liệu, chỉ 1–2 booking" },
                  { flag: "BL", name: "BASELINE WEAK", desc: "So sánh quá khứ chưa đủ tin cậy" },
                  { flag: "⚡", name: "DATA LAG", desc: "Dữ liệu chưa cập nhật gần đây" },
                  { flag: "🔒", name: "STOP SELL", desc: "Phòng đang khóa bán" },
                  { flag: "?", name: "INTENT UNKNOWN", desc: "Không rõ lý do tồn = 0" },
                ].map(item => (
                  <div key={item.flag} className="flex items-center gap-3 text-xs">
                    <Badge variant="outline" className="w-8 justify-center">{item.flag}</Badge>
                    <span className="font-medium w-32">{item.name}</span>
                    <span className="text-muted-foreground">{item.desc}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground italic">
                Khi có cảnh báo, AI sẽ hạn chế hoặc không đưa ra tín hiệu giá.
              </p>
            </section>

            <Separator />

            {/* Section 10: Checklist */}
            <section>
              <h3 className="font-semibold text-foreground mb-2">7. Checklist trước khi tin AI</h3>
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
                {[
                  "Dữ liệu hôm nay có đủ tin cậy không?",
                  "Có cảnh báo nào đang bật không?",
                  "AI có biết bối cảnh đặc biệt hôm nay không?",
                  "Nếu AI sai, hậu quả có lớn không?",
                  "Quyết định này có phù hợp chiến lược của tôi không?",
                ].map((q, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="font-medium text-primary">{i + 1}.</span>
                    <span className="text-muted-foreground">{q}</span>
                  </div>
                ))}
                <p className="mt-2 text-xs font-medium text-destructive">
                  ⚠️ Nếu 2 câu trở lên là "KHÔNG" → KHÔNG nên làm theo AI.
                </p>
              </div>
            </section>

            <Separator />

            {/* Section 11: Responsibility */}
            <section>
              <h3 className="font-semibold text-foreground mb-2">8. Trách nhiệm sử dụng</h3>
              <div className="p-3 bg-muted/50 border rounded-lg">
                <p className="text-muted-foreground text-xs">
                  AI Smart Pricing chỉ cung cấp thông tin tham khảo. 
                  Mọi quyết định giá và kết quả kinh doanh thuộc trách nhiệm của người vận hành.
                </p>
              </div>
              <p className="mt-3 text-center text-muted-foreground italic text-xs">
                "AI giúp bạn nhìn thị trường rõ hơn, nhưng quyết định cuối cùng vẫn luôn là của bạn."
              </p>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// Tooltips chuẩn cho các chỉ số
export const METRIC_TOOLTIPS = {
  dataConfidence: {
    title: "Data Confidence",
    description: "Độ tin cậy của dữ liệu đầu vào, KHÔNG phải xác suất thành công của quyết định pricing. Phản ánh: dữ liệu có mới không, có đủ lịch sử so sánh không, có bất thường không.",
  },
  velocity: {
    title: "Booking Velocity",
    description: "Tốc độ đặt phòng so với baseline (cùng thứ, 8 tuần trước). AI luôn hiển thị cả % và số lượng thật để tránh hiểu nhầm.",
  },
  occupancy: {
    title: "Occupancy Rate",
    description: "Tỷ lệ phòng đã bán/khóa so với tổng số phòng. Inventory = 0 có thể là bán hết hoặc đang khóa bán.",
  },
  baseline: {
    title: "Baseline",
    description: "So sánh với các ngày cùng thứ trong 8 tuần gần nhất. Nếu baseline yếu (ít dữ liệu), độ tin cậy sẽ giảm.",
  },
  pricingSignal: {
    title: "Pricing Signal",
    description: "Tín hiệu THAM KHẢO (có thể tăng/giảm/giữ giá). Đây KHÔNG phải hành động bắt buộc. Mỗi tín hiệu có mức độ (Low/Med/High) và giải thích.",
  },
  inventoryIntent: {
    title: "Inventory Intent",
    description: "Khi tồn phòng = 0: có thể là SOLD_OUT_REAL (bán hết thật) hoặc OPS_BLOCK/OWNER_HOLD (đang khóa). Nếu UNKNOWN, AI sẽ không đưa tín hiệu.",
  },
} as const;

// Warning descriptions
export const WARNING_DESCRIPTIONS = {
  LOW_VOLUME: "Ít dữ liệu booking, chỉ 1-2 đơn. Tỷ lệ % có thể gây hiểu nhầm.",
  BASELINE_LOW: "Thiếu dữ liệu lịch sử để so sánh. Baseline reliability thấp.",
  DATA_LAG: "Dữ liệu inventory chưa được cập nhật gần đây.",
  STOP_SELL: "Phòng đang được khóa bán.",
  INTENT_UNKNOWN: "Không rõ lý do tồn phòng = 0 (bán hết hay khóa?).",
  INVENTORY_BOOKING_MISMATCH: "Tồn phòng và số booking không khớp.",
  RATEPLAN_UNCERTAIN: "Không xác định được rate plan chính.",
} as const;
