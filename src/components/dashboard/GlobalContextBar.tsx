import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Info } from "lucide-react";
import { DATA_WARNINGS } from "@/constants/dashboard_glossary";

interface GlobalContextBarProps {
  operationsCount: number;
  netCashflow: number;
  otaReceivables: number;
  forecast30Days: number;
  lastUpdated: Date;
  isExecutiveMode?: boolean;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

export function GlobalContextBar({
  operationsCount,
  netCashflow,
  otaReceivables,
  forecast30Days,
  lastUpdated,
  isExecutiveMode = false,
}: GlobalContextBarProps) {
  const contextItems = [
    {
      label: "Vận hành",
      value: `${operationsCount} booking`,
      color: operationsCount > 0 ? "text-foreground" : "text-muted-foreground",
    },
    {
      label: "Dòng tiền",
      value: formatCurrency(netCashflow),
      color: netCashflow >= 0 ? "text-success" : "text-destructive",
    },
    {
      label: "OTA nợ",
      value: formatCurrency(otaReceivables),
      color: otaReceivables > 0 ? "text-warning" : "text-success",
    },
    {
      label: "Dự báo 30d",
      value: formatCurrency(forecast30Days),
      color: forecast30Days >= 0 ? "text-info" : "text-destructive",
    },
    {
      label: "Cập nhật",
      value: format(lastUpdated, "HH:mm", { locale: vi }),
      color: "text-muted-foreground",
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      {/* Context Line */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {contextItems.map((item, index) => (
          <div key={index} className="flex items-center gap-1">
            <span className="text-muted-foreground">{item.label}:</span>
            <span className={`font-medium ${item.color}`}>{item.value}</span>
          </div>
        ))}
      </div>

      {/* Warning Line */}
      {isExecutiveMode && (
        <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-border/50">
          {isExecutiveMode && (
            <div className="flex items-center gap-1 text-micro text-muted-foreground">
              <Info className="h-3 w-3" />
              <span>{DATA_WARNINGS.EXECUTIVE_MODE}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
