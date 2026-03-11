# 🧠 AI Smart Pricing - Comprehensive Specification

## Version: 2.0 (January 2026)

---

## 📊 Tổng quan hệ thống

Hệ thống đề xuất giá thông minh dựa trên **5 nguồn dữ liệu chính**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AI SMART PRICING ENGINE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐        │
│  │ 1. HOST SEGMENT  │   │ 2. OTA DEMAND    │   │ 3. MARKET COMP   │        │
│  │    HISTORICAL    │   │    SIGNALS       │   │    (AREA/TYPE)   │        │
│  ├──────────────────┤   ├──────────────────┤   ├──────────────────┤        │
│  │ • Min/Max ADR    │   │ • Velocity       │   │ • Avg ADR same   │        │
│  │ • Volume/month   │   │ • Lead time      │   │   room type      │        │
│  │ • Booking count  │   │ • Last/Early     │   │ • Same area      │        │
│  │ • Night count    │   │ • Revenue trend  │   │ • Occupancy rate │        │
│  │ • Price trend    │   │ • Day type dist  │   │                  │        │
│  └──────────────────┘   └──────────────────┘   └──────────────────┘        │
│                                                                             │
│  ┌──────────────────┐   ┌──────────────────┐                               │
│  │ 4. SEASON        │   │ 5. DAY TYPE      │                               │
│  ├──────────────────┤   ├──────────────────┤                               │
│  │ • HIGH (peak)    │   │ • Weekday        │                               │
│  │ • LOW (off-peak) │   │ • Weekend        │                               │
│  │ • SHOULDER       │   │ • Holiday        │                               │
│  └──────────────────┘   └──────────────────┘                               │
│                                                                             │
│  ════════════════════════════════════════════════════════════════════════  │
│                                                                             │
│                      ┌─────────────────────────┐                           │
│                      │   RECOMMENDATION        │                           │
│                      ├─────────────────────────┤                           │
│                      │ • Suggested Price Range │                           │
│                      │ • Min (safe floor)      │                           │
│                      │ • Max (ceiling)         │                           │
│                      │ • Optimal (recommended) │                           │
│                      │ • Confidence Score      │                           │
│                      │ • Adjustment Reason     │                           │
│                      └─────────────────────────┘                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1️⃣ HOST SEGMENT HISTORICAL DATA

### Dữ liệu cần thu thập (per Property + Room Type + Season + DayType):

| Field | Mô tả | Nguồn |
|-------|-------|-------|
| `minAdr` | Giá thấp nhất từng nhận | `host_supply_segments` |
| `maxAdr` | Giá cao nhất từng nhận | `host_supply_segments` |
| `medianAdr` | Trung vị (giá phổ biến nhất) | calculated |
| `avgAdr` | Trung bình | calculated |
| `bookingCount` | Số lượng booking | count |
| `nightCount` | Tổng số đêm | sum(nights) |
| `recentTrend` | Xu hướng giá gần đây (3 tháng) | regression |
| `longtermTrend` | Xu hướng giá dài hạn (12 tháng) | regression |
| `priceVolatility` | Độ biến động giá | std/mean |

### Cấu trúc key:

```typescript
interface HostSegmentMetrics {
  // Key: "property|||roomType|||SEASON|||dayType"
  key: string;
  
  // Price range from history
  minAdr: number;
  maxAdr: number;
  medianAdr: number;
  avgAdr: number;
  
  // Volume metrics
  bookingCount: number;
  nightCount: number;
  
  // Trend (positive = increasing price)
  recentTrend: number;    // -1 to +1 (recent 3 months)
  longtermTrend: number;  // -1 to +1 (12 months)
  
  // Volatility
  volatility: number;     // 0-1 (std/mean)
  
  // Season + DayType
  season: 'HIGH' | 'LOW' | 'SHOULDER';
  dayType: 'weekday' | 'weekend';
  
  // Sample quality
  sampleSize: number;
  dataQuality: 'high' | 'medium' | 'low';
}
```

---

## 2️⃣ OTA DEMAND SIGNALS (per DayType)

### Dữ liệu cần thu thập:

| Field | Mô tả | Nguồn |
|-------|-------|-------|
| `velocity` | Tốc độ đặt phòng (bookings/day) | `bookings_mirror` |
| `avgLeadTime` | Số ngày trung bình từ booking → check-in | calculated |
| `lastMinuteRatio` | % booking đặt <7 ngày trước | calculated |
| `earlyBirdRatio` | % booking đặt >30 ngày trước | calculated |
| `revenueThisMonth` | Doanh thu tháng hiện tại | sum(price) |
| `revenueTrend` | So với tháng trước (+/-%) | calculated |
| `avgAdr` | Giá trung bình OTA | avg(price/nights) |
| `demandIndex` | Chỉ số cầu so với baseline | normalized |

### Phân loại Booking Timing:

```typescript
type BookingTiming = 
  | 'last-minute'   // 0-7 days before check-in
  | 'short-lead'    // 8-14 days
  | 'medium-lead'   // 15-30 days  
  | 'early-bird';   // 30+ days

interface OtaDemandSignals {
  // Per Property + Room Type + Month + DayType
  property: string;
  roomType: string;
  month: number;
  dayType: 'weekday' | 'weekend';
  
  // Velocity metrics
  bookingsPerDay: number;        // Current booking rate
  velocityRatio: number;         // vs baseline (1.0 = normal, 1.5 = 50% faster)
  
  // Timing distribution
  lastMinuteRatio: number;       // 0-1 (% of last-minute bookings)
  earlyBirdRatio: number;        // 0-1 (% of early-bird bookings)
  avgLeadTimeDays: number;       // Average days before check-in
  
  // Revenue signals
  monthlyRevenue: number;
  revenueTrend: number;          // vs previous month (-1 to +1)
  
  // Demand index (normalized 0-2, 1 = average)
  demandIndex: number;
  
  // Price trend
  adrTrend: number;              // -1 to +1 (price direction)
}
```

---

## 3️⃣ MARKET COMPARISON (Same Area + Room Type)

### So sánh với thị trường:

```typescript
interface MarketComparison {
  // Key: "area|||roomType|||season|||dayType"
  area: string;                  // Khu vực (District 2, Binh Thanh, etc.)
  roomType: string;              // e.g., "1 Phòng Ngủ"
  bedroomCount: number;
  season: 'HIGH' | 'LOW' | 'SHOULDER';
  dayType: 'weekday' | 'weekend';
  
  // Market metrics (from all properties in same area + room type)
  marketMinAdr: number;
  marketMaxAdr: number;
  marketMedianAdr: number;
  marketAvgAdr: number;
  
  // Occupancy
  marketOccupancyRate: number;   // 0-1
  
  // Current property vs market
  propertyAdr: number;
  positionVsMarket: 'below' | 'average' | 'above' | 'premium';
  percentileRank: number;        // 0-100 (where this property sits)
}
```

---

## 4️⃣ SEASON CLASSIFICATION

```typescript
// Vietnam market seasonality
const SEASON_CONFIG = {
  HIGH: [1, 2, 7, 8, 12],     // Tết, Hè, Giáng sinh
  LOW: [3, 4, 5, 9, 10, 11],  // Off-peak
  SHOULDER: [6],              // Transition
};
```

---

## 5️⃣ DAY TYPE CLASSIFICATION

```typescript
type DayType = 'weekday' | 'weekend' | 'holiday';

// Tách biệt hoàn toàn giữa weekday vs weekend
// Không mix data giữa 2 loại
```

---

## 🧮 RECOMMENDATION ALGORITHM

### Bước 1: Thu thập dữ liệu theo context

```typescript
function collectPricingContext(
  property: string,
  roomType: string,
  targetDate: Date,
  season: Season,
  dayType: DayType
): PricingContext {
  return {
    // 1. Host historical (SAME season + dayType)
    hostMetrics: getHostSegmentMetrics(property, roomType, season, dayType),
    
    // 2. OTA demand (SAME dayType)
    otaDemand: getOtaDemandSignals(property, roomType, targetDate, dayType),
    
    // 3. Market comparison (SAME area + roomType + season + dayType)
    marketComp: getMarketComparison(property, roomType, season, dayType),
    
    // 4. Season factor
    seasonFactor: getSeasonalityFactor(season),
    
    // 5. Day type factor
    dayTypeFactor: getDayTypeFactor(dayType),
  };
}
```

### Bước 2: Xác định Price Range từ Host History

```typescript
function getPriceRange(hostMetrics: HostSegmentMetrics): PriceRange {
  return {
    // Floor: Historical minimum (đã từng bán được)
    floor: hostMetrics.minAdr,
    
    // Ceiling: Historical maximum (đã từng bán được)
    ceiling: hostMetrics.maxAdr,
    
    // Base: Median (giá phổ biến nhất)
    base: hostMetrics.medianAdr,
    
    // Quality indicator
    confidence: hostMetrics.sampleSize >= 10 ? 'high' : 
                hostMetrics.sampleSize >= 5 ? 'medium' : 'low',
  };
}
```

### Bước 3: Điều chỉnh dựa trên OTA Signals

```typescript
function adjustForOtaDemand(
  basePrice: number, 
  otaDemand: OtaDemandSignals
): AdjustmentResult {
  let adjustment = 0;
  const reasons: string[] = [];
  
  // 1. Velocity adjustment (±5%)
  if (otaDemand.velocityRatio > 1.2) {
    adjustment += 0.03;
    reasons.push(`Tốc độ đặt cao (+${((otaDemand.velocityRatio - 1) * 100).toFixed(0)}%)`);
  } else if (otaDemand.velocityRatio < 0.8) {
    adjustment -= 0.02;
    reasons.push(`Tốc độ đặt thấp (${((otaDemand.velocityRatio - 1) * 100).toFixed(0)}%)`);
  }
  
  // 2. Timing adjustment (±3%)
  if (otaDemand.lastMinuteRatio > 0.5) {
    // Many last-minute bookings → high urgency → can charge more
    adjustment += 0.02;
    reasons.push('Nhiều booking last-minute');
  } else if (otaDemand.earlyBirdRatio > 0.4) {
    // Many early bookings → guests planning ahead → stable demand
    adjustment += 0.01;
    reasons.push('Khách đặt sớm nhiều');
  }
  
  // 3. Revenue trend (±3%)
  if (otaDemand.revenueTrend > 0.1) {
    adjustment += 0.02;
    reasons.push('Doanh thu tháng tăng');
  } else if (otaDemand.revenueTrend < -0.1) {
    adjustment -= 0.02;
    reasons.push('Doanh thu tháng giảm');
  }
  
  // 4. Demand index (±5%)
  if (otaDemand.demandIndex > 1.3) {
    adjustment += 0.03;
    reasons.push(`Cầu cao (${otaDemand.demandIndex.toFixed(1)}x)`);
  } else if (otaDemand.demandIndex < 0.7) {
    adjustment -= 0.03;
    reasons.push(`Cầu thấp (${otaDemand.demandIndex.toFixed(1)}x)`);
  }
  
  // Cap adjustment at ±10% from OTA signals alone
  adjustment = Math.max(-0.10, Math.min(0.10, adjustment));
  
  return {
    adjustedPrice: basePrice * (1 + adjustment),
    totalAdjustment: adjustment,
    reasons,
  };
}
```

### Bước 4: Smart Recommendation Logic

```typescript
function generateRecommendation(
  priceRange: PriceRange,
  otaAdjustment: AdjustmentResult,
  hostMetrics: HostSegmentMetrics,
  marketComp: MarketComparison
): PriceRecommendation {
  
  // Rule 1: Volume-based sanity check
  // "Booking ít nhưng giá cao → giảm giá"
  // "Booking nhiều nhưng giá thấp → tăng giá"
  
  const isLowVolume = hostMetrics.bookingCount < 5;
  const isHighVolume = hostMetrics.bookingCount > 15;
  const isPriceHigh = hostMetrics.medianAdr > marketComp.marketMedianAdr * 1.2;
  const isPriceLow = hostMetrics.medianAdr < marketComp.marketMedianAdr * 0.8;
  
  let volumeAdjustment = 0;
  let volumeReason = '';
  
  if (isLowVolume && isPriceHigh) {
    // Low volume + high price → should decrease
    volumeAdjustment = -0.05;
    volumeReason = '⚠️ Booking ít + giá cao so với thị trường → nên giảm để tăng volume';
  } else if (isHighVolume && isPriceLow) {
    // High volume + low price → can increase
    volumeAdjustment = +0.05;
    volumeReason = '📈 Booking nhiều + giá thấp → có thể tăng giá';
  } else if (isHighVolume && !isPriceLow) {
    // High volume, normal/high price → doing well
    volumeReason = '✅ Đang pricing tốt, volume cao';
  }
  
  // Rule 2: Market position check
  let marketAdjustment = 0;
  let marketReason = '';
  
  if (marketComp.percentileRank > 80) {
    // Premium pricing, check if volume supports it
    if (isLowVolume) {
      marketAdjustment = -0.03;
      marketReason = '💰 Giá premium nhưng volume thấp';
    } else {
      marketReason = '💎 Giá premium, volume ổn';
    }
  } else if (marketComp.percentileRank < 20) {
    // Below market, might be leaving money on table
    if (isHighVolume) {
      marketAdjustment = +0.05;
      marketReason = '📊 Dưới thị trường + volume cao → có room tăng giá';
    }
  }
  
  // Rule 3: Trend check
  let trendAdjustment = 0;
  let trendReason = '';
  
  if (hostMetrics.recentTrend > 0.1 && otaAdjustment.totalAdjustment > 0) {
    // Both host and OTA trending up
    trendAdjustment = +0.02;
    trendReason = '📈 Cả Host và OTA đều đang tăng giá';
  } else if (hostMetrics.recentTrend < -0.1 && otaAdjustment.totalAdjustment < 0) {
    // Both trending down
    trendAdjustment = -0.02;
    trendReason = '📉 Cả Host và OTA đều đang giảm';
  }
  
  // Calculate final recommendation
  const basePrice = priceRange.base;
  const totalAdjustment = otaAdjustment.totalAdjustment + volumeAdjustment + marketAdjustment + trendAdjustment;
  const cappedAdjustment = Math.max(-0.15, Math.min(0.15, totalAdjustment));
  
  const recommendedPrice = basePrice * (1 + cappedAdjustment);
  
  // Ensure within historical range
  const finalPrice = Math.max(
    priceRange.floor,
    Math.min(priceRange.ceiling, recommendedPrice)
  );
  
  return {
    // Price range from history
    minPrice: priceRange.floor,
    maxPrice: priceRange.ceiling,
    
    // AI recommendation
    recommendedPrice: finalPrice,
    
    // Adjustment breakdown
    adjustment: {
      total: cappedAdjustment,
      ota: otaAdjustment.totalAdjustment,
      volume: volumeAdjustment,
      market: marketAdjustment,
      trend: trendAdjustment,
    },
    
    // Explanation
    reasons: [
      ...otaAdjustment.reasons,
      volumeReason,
      marketReason,
      trendReason,
    ].filter(Boolean),
    
    // Confidence
    confidence: priceRange.confidence,
    dataQuality: hostMetrics.dataQuality,
  };
}
```

---

## 📋 DATA REQUIREMENTS CHECKLIST

### ✅ Đã có (Current):
- [x] Host ADR từ `host_supply_segments`
- [x] Season classification (HIGH/LOW/SHOULDER)
- [x] Day type (weekday/weekend)
- [x] OTA ADR trend
- [x] Demand index
- [x] Velocity (partial - đã thêm)

### ❌ Cần thêm (Missing):
- [ ] Host Min/Max ADR (per property + roomType + season + dayType)
- [ ] Host booking count per month
- [ ] Host night count per month
- [ ] Host price trend (recent vs longterm)
- [ ] OTA Lead time analysis (last-minute vs early-bird)
- [ ] OTA Revenue by month
- [ ] Market comparison (same area + room type)
- [ ] Volume-based recommendation logic

---

## 🚀 Implementation Priority

### Phase 1 (Immediate):
1. Add Min/Max ADR to Host Segment data structure
2. Add booking count + night count metrics
3. Implement volume-based sanity check

### Phase 2 (Next):
1. Add lead time analysis (last-minute/early-bird)
2. Add revenue trend by month
3. Implement market comparison

### Phase 3 (Future):
1. Machine learning model for prediction
2. A/B testing framework
3. Auto-pricing recommendations

---

## 📝 Notes

- **Tất cả metrics phải tách theo dayType** (weekday vs weekend)
- **Tất cả metrics phải tách theo season** (HIGH/LOW/SHOULDER)
- **Volume là yếu tố quan trọng** - giá cao nhưng không bán được = giá sai
- **Historical range (min-max) là boundaries** - không đề xuất ngoài range đã bán được
