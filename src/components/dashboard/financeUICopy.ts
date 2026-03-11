/**
 * Finance UI Copy - Mô tả dễ hiểu cho người dùng
 * 
 * Nguyên tắc:
 * - Ngắn gọn, không chuyên môn
 * - Giải thích "vì sao có thể khác nhau"
 * - Cho biết điều kiện để có số
 */

export const financeUICopy = {
  // ========== PERIOD / DATE RANGE ==========
  periodBasis: {
    dashboard: {
      label: "Kỳ đang xem",
      description: "Dashboard hiển thị dữ liệu theo kỳ bạn chọn. Cash tính theo ngày thu/chi, P&L tính theo ngày checkout.",
    },
    pnl: {
      label: "Tính theo ngày Trả phòng (Accrual)",
      description: "Doanh thu được ghi nhận khi khách trả phòng, không phải khi đặt phòng hay thanh toán.",
    },
    cashflow: {
      label: "Tính theo Collected_at / Paid_at (Cash)",
      description: "Ghi nhận đúng ngày tiền thực sự vào/ra tài khoản.",
    },
  },

  // ========== PROFIT vs CASH ==========
  profitVsCash: {
    title: "Lợi nhuận vs Dòng tiền",
    tooltip: "Lợi nhuận (P&L) và Dòng tiền (Cash) thường khác nhau vì tính theo cách khác.",
    helpText: `
**Lợi nhuận (P&L)**: Tính theo ngày checkout - khi khách trả phòng mới ghi nhận doanh thu.

**Dòng tiền (Cash)**: Tính theo ngày thu/chi tiền thực tế.

**Vì sao khác nhau?**
- Lợi nhuận > Dòng tiền: Có công nợ OTA chưa thu
- Lợi nhuận < Dòng tiền: Đã thu tiền nhưng khách chưa checkout
- Lợi nhuận = 0: Chưa có booking nào checkout + CONFIRMED trong kỳ
    `.trim(),
    whyZero: [
      "Chưa có booking CONFIRMED trong kỳ",
      "Booking đã CONFIRMED nhưng chưa CHECKED_OUT",
      "Trả phòng date nằm ngoài kỳ đang xem",
    ],
  },

  // ========== FORECAST 30 DAYS ==========
  forecast: {
    title: "Dự báo 30 ngày tới",
    tooltip: "Dự báo dòng tiền trong 30 ngày kế tiếp (không phụ thuộc kỳ đang xem)",
    tiers: {
      committed: {
        label: "Chắc chắn (Committed)",
        description: "OTA payout đã nhận một phần (PARTIAL) - chắc chắn sẽ về",
        condition: "ota_payouts.status = PARTIAL AND payout_date trong 30 ngày tới",
      },
      likely: {
        label: "Khả năng cao (Likely)",
        description: "OTA payout đã tạo, chờ về (PENDING)",
        condition: "ota_payouts.status = PENDING AND payout_date trong 30 ngày tới",
      },
      expected: {
        label: "Dự kiến (Expected)",
        description: "Công nợ OTA đủ điều kiện (booking đã checkout, chưa có payout)",
        condition: "OTA_COLLECT, CHECKED_OUT, chưa có ota_payout_details",
      },
    },
    whyZero: [
      "Chưa có OTA payout nào với status PARTIAL/PENDING trong 30 ngày tới",
      "Tất cả booking OTA đã checkout đều đã có payout",
      "Không có booking OTA nào đã checkout",
    ],
  },

  // ========== OTA AR ==========
  otaAr: {
    title: "Công nợ OTA chưa thu",
    tooltip: "Số tiền OTA đang nợ Roomrise - booking đã checkout nhưng chưa tạo payout",
    description: `
**Điều kiện để có số:**
1. Booking là OTA_COLLECT (OTA thu tiền khách)
2. Khách đã CHECKED_OUT
3. Chưa tạo OTA Payout (chưa có record trong ota_payout_details)

**Aging (Tuổi nợ)**: Tính từ ngày checkout thực tế
    `.trim(),
    agingBuckets: {
      "0-7": "Mới (0-7 ngày) - bình thường",
      "8-14": "Cần theo dõi (8-14 ngày)",
      "15-30": "Cảnh báo (15-30 ngày)",
      ">30": "Quá hạn (>30 ngày) - cần escalate",
    },
    whyZero: [
      "Tất cả booking OTA đã checkout đều đã tạo payout",
      "Chưa có booking OTA nào checkout",
      "Booking bị CANCELLED",
    ],
  },

  // ========== HOST AP ==========
  hostAp: {
    title: "Công nợ Host phải trả",
    tooltip: "Số tiền Roomrise đang nợ Host - từ các phiếu quyết toán chưa thanh toán hết",
    description: "Tổng remaining_amount của host_settlements chưa PAID",
    whyZero: [
      "Tất cả phiếu quyết toán Host đã thanh toán xong",
      "Chưa có phiếu quyết toán nào",
    ],
  },

  // ========== DATA QUALITY ==========
  dataQuality: {
    title: "Chất lượng dữ liệu",
    tooltip: "Các chỉ số giúp phát hiện dữ liệu thiếu hoặc sai",
    metrics: {
      fallbackRatio: {
        label: "% AR dùng ngày checkout dự kiến",
        description: "Booking OTA AR không có actual_check_out_at, phải dùng check_out_date từ booking",
        threshold: "< 20% là tốt, > 50% cần kiểm tra stays",
      },
      missingPayout: {
        label: "Booking thiếu payout mapping",
        description: "Booking OTA đã checkout nhưng chưa được map vào ota_payout_details",
        threshold: "0 là tốt, >0 cần tạo payout hoặc map",
      },
      voidedNoReversal: {
        label: "Giao dịch void chưa reversal",
        description: "hotel_collects bị void nhưng chưa có ledger_entries reversal",
        threshold: "0 là tốt, >0 cần kiểm tra kế toán",
      },
    },
  },

  // ========== CONDITIONS TABLE ==========
  conditionsTable: {
    title: "Điều kiện để có số",
    rows: [
      {
        card: "Room Revenue (P&L)",
        table: "unified_bookings",
        field: "total_amount_net",
        dateFilter: "check_out_date trong kỳ",
        statusFilter: "CONFIRMED + (CHECKED_OUT OR quá ngày checkout)",
      },
      {
        card: "Cash In",
        table: "hotel_collects",
        field: "amount_collected",
        dateFilter: "collected_at trong kỳ",
        statusFilter: "payee_type=ROOMRISE, collection_type=COLLECT, status!=VOIDED",
      },
      {
        card: "Committed (Forecast)",
        table: "ota_payouts",
        field: "total_amount",
        dateFilter: "payout_date trong 30 ngày tới",
        statusFilter: "status=PARTIAL",
      },
      {
        card: "Likely (Forecast)",
        table: "ota_payouts",
        field: "total_amount",
        dateFilter: "payout_date trong 30 ngày tới",
        statusFilter: "status=PENDING",
      },
      {
        card: "Expected In (OTA AR)",
        table: "bookings_mirror + stays + ota_payout_details",
        field: "total_amount_net",
        dateFilter: "Không có (tất cả thời gian)",
        statusFilter: "OTA_COLLECT, CHECKED_OUT, chưa có payout",
      },
      {
        card: "Expected Out (Host AP)",
        table: "host_settlements",
        field: "remaining_amount",
        dateFilter: "Không có (tất cả thời gian)",
        statusFilter: "remaining_amount > 0",
      },
    ],
  },
};

// Helper để format tooltip content
export function getTooltipContent(key: keyof typeof financeUICopy): string {
  const item = financeUICopy[key];
  if ("tooltip" in item) {
    return item.tooltip;
  }
  return "";
}
