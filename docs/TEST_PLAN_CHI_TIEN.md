# TEST PLAN: Chi Tiền Page

**Ngày:** 2026-02-16  
**Stack:** React + TypeScript + Supabase + Vite  
**Test Framework:** Vitest (assumed based on Vite stack)

---

## 1. Test Categories

| Category | Scope | Type |
|----------|-------|------|
| Unit | Hooks (useCashOuts, useCashOutStats) | Unit |
| Integration | API calls → Database | Integration |
| Component | UI rendering | Component |
| E2E | Full user flow | E2E (optional) |

---

## 2. Existing Functionality Tests

### 2.1 List Cash Outs (useCashOuts hook)

**Test file:** `src/hooks/__tests__/useCashOuts.test.ts` (to create)

```typescript
describe('useCashOuts', () => {
  describe('fetch list', () => {
    it('should return empty array when no cash outs exist', async () => {
      // Setup: mock supabase to return empty
      // Assert: data === []
    });

    it('should return cash outs with payment request details', async () => {
      // Setup: mock with sample data
      // Assert: items have request_code, partner_name
    });

    it('should filter by date range', async () => {
      // Setup: mock with dateFrom/dateTo filters
      // Assert: query includes gte/lte filters
    });

    it('should filter by payment method', async () => {
      // Setup: mock with paymentMethod filter
      // Assert: query includes eq filter
    });

    it('should order by paid_at desc', async () => {
      // Assert: order clause present
    });
  });
});
```

### 2.2 Cash Out Stats (useCashOutStats hook)

```typescript
describe('useCashOutStats', () => {
  it('should calculate total amount correctly', async () => {
    // Setup: mock with amounts [100000, 200000, 300000]
    // Assert: totalAmount === 600000
  });

  it('should group by payment method', async () => {
    // Setup: mock with mixed methods
    // Assert: byMethod has correct counts and amounts
  });

  it('should respect date filters', async () => {
    // Setup: mock with dateFrom/dateTo
    // Assert: query filters applied
  });
});
```

### 2.3 Create Cash Out (useCreateCashOut hook)

```typescript
describe('useCreateCashOut', () => {
  it('should call create_cash_out_atomic RPC', async () => {
    // Setup: mock RPC
    // Act: mutate with valid params
    // Assert: RPC called with correct params
  });

  it('should show error when amount exceeds remaining', async () => {
    // Setup: mock RPC to throw error
    // Assert: toast.error called
  });

  it('should invalidate queries on success', async () => {
    // Setup: spy on queryClient.invalidateQueries
    // Act: successful mutation
    // Assert: cash-outs, payment-requests invalidated
  });
});
```

### 2.4 Update Receipt (useUpdateCashOutReceipt hook)

```typescript
describe('useUpdateCashOutReceipt', () => {
  it('should update receipt_image and receipt_status', async () => {
    // Setup: mock update
    // Act: mutate
    // Assert: correct fields updated
  });
});
```

---

## 3. Detail View Tests

### 3.1 Detail Dialog Rendering

**Test file:** `src/pages/__tests__/CashOutPage.test.tsx` (to create)

```typescript
describe('CashOutPage Detail Dialog', () => {
  it('should open dialog when clicking view button', async () => {
    // Setup: render page with mocked data
    // Act: click Eye button
    // Assert: dialog opens
  });

  it('should display all cash out fields', async () => {
    // Setup: render with selectedCashOut
    // Assert: request_code, paid_at, amount, payment_method visible
  });

  it('should display bank details when present', async () => {
    // Setup: cashOut with bank_name, bank_account_number
    // Assert: fields rendered
  });

  it('should display out of process badge when flagged', async () => {
    // Setup: cashOut with is_out_of_process = true
    // Assert: "Ngoài quy trình" badge visible
  });

  it('should show receipt image when available', async () => {
    // Setup: cashOut with receipt_image
    // Assert: ReceiptImagePreview rendered
  });

  it('should show upload button when no receipt', async () => {
    // Setup: cashOut without receipt_image
    // Assert: ReceiptUpload rendered
  });
});
```

---

## 4. Receipt Component Tests

**Test file:** `src/components/ui/__tests__/receipt-upload.test.tsx` (to create)

```typescript
describe('ReceiptUpload', () => {
  it('should upload file to storage bucket', async () => {
    // Setup: mock supabase.storage.upload
    // Act: select file
    // Assert: upload called with correct bucket
  });

  it('should show loading state during upload', async () => {
    // Setup: slow mock
    // Assert: Loader2 visible during upload
  });

  it('should call onChange with file path on success', async () => {
    // Setup: mock successful upload
    // Assert: onChange called with path
  });

  it('should show error toast on upload failure', async () => {
    // Setup: mock upload error
    // Assert: toast.error called
  });
});

describe('ReceiptImagePreview', () => {
  it('should load signed URL for image', async () => {
    // Setup: mock createSignedUrl
    // Assert: img src set
  });

  it('should open full view dialog on click', async () => {
    // Act: click image
    // Assert: full view dialog opens
  });
});

describe('ReceiptStatusBadge', () => {
  it('should show "Chưa có" for PENDING status', () => {
    render(<ReceiptStatusBadge status="PENDING" hasImage={false} />);
    expect(screen.getByText('Chưa có')).toBeInTheDocument();
  });

  it('should show "Đã tải" for UPLOADED status', () => {
    render(<ReceiptStatusBadge status="UPLOADED" hasImage={true} />);
    expect(screen.getByText('Đã tải')).toBeInTheDocument();
  });

  it('should show "Đã xác minh" for VERIFIED status', () => {
    render(<ReceiptStatusBadge status="VERIFIED" hasImage={true} />);
    expect(screen.getByText('Đã xác minh')).toBeInTheDocument();
  });
});
```

---

## 5. Integration Tests

### 5.1 API → DB Integration

```typescript
describe('Cash Out API Integration', () => {
  beforeEach(async () => {
    // Setup: seed test data
  });

  afterEach(async () => {
    // Cleanup: remove test data
  });

  it('should fetch cash outs from database', async () => {
    // Direct supabase call
    // Assert: data matches seeded records
  });

  it('should create cash out with atomic function', async () => {
    // Call create_cash_out_atomic RPC
    // Assert: record created, ledger entry created, cashflow entry created
  });

  it('should prevent creating cash out exceeding remaining', async () => {
    // Setup: payment_request with remaining = 100
    // Act: try create cash_out with amount = 200
    // Assert: error thrown
  });
});
```

---

## 6. E2E Test Scenarios

### 6.1 Happy Path: View Cash Out Detail

```typescript
test('user can view cash out detail', async ({ page }) => {
  // Navigate to /payments/cashout
  await page.goto('/payments/cashout');
  
  // Wait for table to load
  await page.waitForSelector('table');
  
  // Click first Eye button
  await page.click('button:has(svg.lucide-eye)');
  
  // Assert dialog opens
  await expect(page.locator('role=dialog')).toBeVisible();
  
  // Assert key fields visible
  await expect(page.locator('text=Mã đề xuất')).toBeVisible();
  await expect(page.locator('text=Số tiền')).toBeVisible();
});
```

### 6.2 Happy Path: Upload Receipt

```typescript
test('user can upload receipt image', async ({ page }) => {
  // Navigate and open detail
  await page.goto('/payments/cashout');
  await page.click('button:has(svg.lucide-eye)');
  
  // Click upload button
  await page.click('button:has-text("Tải ảnh")');
  
  // Upload file
  const fileChooser = await page.waitForEvent('filechooser');
  await fileChooser.setFiles('test-receipt.jpg');
  
  // Assert success
  await expect(page.locator('text=Đã tải')).toBeVisible();
});
```

### 6.3 View Receipt Image

```typescript
test('user can view uploaded receipt', async ({ page }) => {
  // Assuming cash out already has receipt_image
  await page.goto('/payments/cashout');
  await page.click('button:has(svg.lucide-eye)');
  
  // Click view button
  await page.click('button:has-text("Xem")');
  
  // Assert image modal opens
  await expect(page.locator('img[alt="Receipt"]')).toBeVisible();
});
```

---

## 7. Test Data Setup

### 7.1 Mock Data Factory

```typescript
// src/test/factories/cashOut.ts
export const createMockCashOut = (overrides = {}) => ({
  id: 'test-cash-out-id',
  payment_request_id: 'test-request-id',
  request_code: 'PAY-000001',
  payment_type: 'HOST_PAYMENT',
  partner_name: 'Test Partner',
  amount: 1000000,
  currency: 'VND',
  paid_at: '2026-02-16T10:00:00Z',
  payment_method: 'BANK_TRANSFER',
  bank_name: 'Vietcombank',
  bank_account_number: '1234567890',
  bank_account_name: 'NGUYEN VAN A',
  transfer_reference: 'REF-001',
  recipient_name: 'Test Recipient',
  is_out_of_process: false,
  note: 'Test note',
  receipt_image: null,
  receipt_status: 'PENDING',
  created_at: '2026-02-16T10:00:00Z',
  ...overrides,
});
```

---

## 8. Test Commands

```bash
# Run all tests
npm run test

# Run specific hook tests
npm run test -- --grep "useCashOuts"

# Run component tests
npm run test -- --grep "CashOutPage"

# Run with coverage
npm run test -- --coverage

# Run E2E tests (if configured with Playwright)
npx playwright test
```

---

## 9. Coverage Requirements

| Area | Target | Current |
|------|--------|---------|
| useCashOuts | 80% | TBD |
| useCreateCashOut | 80% | TBD |
| CashOutPage | 70% | TBD |
| ReceiptUpload | 80% | TBD |

---

## 10. Test Implementation Priority

| Priority | Test | Reason |
|----------|------|--------|
| P1 | useCashOuts fetch | Core data loading |
| P1 | useCreateCashOut | Core business logic |
| P1 | ReceiptStatusBadge | Simple, high visibility |
| P2 | Detail Dialog rendering | UI correctness |
| P2 | ReceiptUpload | File handling |
| P3 | E2E flows | Full coverage |

---

## 11. Pre-Implementation Verification

Trước khi thực hiện các thay đổi từ IMPLEMENT_PLAN:

```bash
# 1. Verify build succeeds
npm run build

# 2. Verify existing tests pass (if any)
npm run test

# 3. Verify TypeScript types
npm run typecheck

# 4. Verify lint
npm run lint
```

---

## 12. Post-Implementation Verification

Sau khi implement các changes:

```bash
# 1. Run build
npm run build

# 2. Run type check
npm run typecheck

# 3. Run new tests
npm run test

# 4. Manual verification
# - Open /payments/cashout
# - Verify list loads
# - Click view detail
# - Verify new fields display (payment_gateway, paid_by_name)
# - Upload receipt
# - Verify receipt displays
```
