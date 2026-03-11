/**
 * CANONICAL PAYMENT METHOD SELECTOR
 * 
 * Component chuẩn cho CSKH chọn phương thức thanh toán.
 * 
 * 🧩 KIẾN TRÚC:
 * - CSKH chọn CANONICAL (CASH, BANK_TRANSFER, CARD, QR)
 * - CSKH có thể chọn PROVIDER (SEPAY, ONEPAY...) - optional
 * - Tài khoản được AUTO-RESOLVE - ẩn khỏi CSKH
 * - Admin/Kế toán có thể override tài khoản
 * 
 * @see docs/UX_PMS_GOVERNANCE_IMPLEMENTATION.md
 */
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Building2, Lock } from "lucide-react";
import { PaymentMethodIcon } from "@/components/ui/payment-method-icon";
import { supabase, safeRpc } from "@/integrations/supabase";
import {
  CANONICAL_COLLECT_OPTIONS,
  CANONICAL_CASHOUT_OPTIONS,
  PROVIDER_OPTIONS,
  getCanonicalPaymentIcon,
  getCanonicalPaymentLabel,
  getProviderIcon,
  getProviderLabel,
  type CanonicalPaymentMethod,
  type PaymentProvider,
} from "@/constants/paymentMethods";

interface CanonicalPaymentSelectorProps {
  /** Direction: 'IN' for collection, 'OUT' for cash out */
  direction: 'IN' | 'OUT';
  /** Selected canonical payment method */
  value: CanonicalPaymentMethod;
  /** Callback when canonical method changes */
  onChange: (value: CanonicalPaymentMethod) => void;
  /** Selected provider (optional) */
  provider?: PaymentProvider | null;
  /** Callback when provider changes */
  onProviderChange?: (value: PaymentProvider | null) => void;
  /** Override cash_account_id (admin/ke_toan only) */
  cashAccountId?: string | null;
  /** Callback when account override changes */
  onCashAccountChange?: (value: string | null) => void;
  /** Show provider selection */
  showProvider?: boolean;
  /** User role for determining if can override account */
  userRole?: string;
}

interface CashAccount {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  bank_name: string | null;
}

export function CanonicalPaymentSelector({
  direction,
  value,
  onChange,
  provider,
  onProviderChange,
  cashAccountId,
  onCashAccountChange,
  showProvider = false,
  userRole,
}: CanonicalPaymentSelectorProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Can override account: admin or ke_toan
  const canOverrideAccount = userRole === 'admin' || userRole === 'ke_toan';

  // Get default account that will be auto-used
  const { data: defaultAccount } = useQuery({
    queryKey: ["default-cash-account", value],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await safeRpc(() => supabase.rpc(
        "get_default_cash_account_for_collection",
        { p_canonical_payment: value }
      ));
      if (error) throw error;
      return data?.[0] as CashAccount | undefined;
    },
  });

  // Get all active accounts for override selection
  const { data: accounts = [] } = useQuery({
    queryKey: ["cash-accounts-for-override"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_accounts")
        .select("id, account_code, account_name, account_type, bank_name")
        .eq("is_archived", false)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("account_code", { ascending: true });
      if (error) throw error;
      return data as CashAccount[];
    },
    enabled: showAdvanced && canOverrideAccount,
  });

  const options = direction === 'IN'
    ? CANONICAL_COLLECT_OPTIONS
    : CANONICAL_CASHOUT_OPTIONS;

  // Determine which account will be used
  const resolvedAccount = cashAccountId
    ? accounts.find(a => a.id === cashAccountId)
    : defaultAccount;

  return (
    <div className="space-y-3">
      {/* Canonical Payment Method */}
      <div className="space-y-2">
        <Label>Phương thức thanh toán</Label>
        <Select value={value} onValueChange={(v) => onChange(v as CanonicalPaymentMethod)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <span className="flex items-center gap-2">
                  <PaymentMethodIcon code={opt.value} className="h-4 w-4 text-muted-foreground" />
                  <span>{opt.label}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Provider Selection (optional) */}
      {showProvider && onProviderChange && (
        <div className="space-y-2">
          <Label className="text-muted-foreground text-sm">
            Kênh thanh toán (optional)
          </Label>
          <Select
            value={provider || ''}
            onValueChange={(v) => onProviderChange(v as PaymentProvider || null)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Không qua gateway" />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value || 'none'} value={opt.value || 'none'}>
                  <span className="flex items-center gap-2">
                    {opt.value && <PaymentMethodIcon code={opt.value} className="h-4 w-4 text-muted-foreground" />}
                    <span>{opt.label}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Chỉ để theo dõi, không ảnh hưởng ghi sổ.
          </p>
        </div>
      )}

      {/* Auto-resolved Account (readonly for CSKH) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-muted-foreground text-sm flex items-center gap-1">
            <Lock className="h-3 w-3" />
            Tài khoản nhận tiền
          </Label>
          {canOverrideAccount && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Ẩn
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Đổi TK
                </>
              )}
            </Button>
          )}
        </div>

        {/* Show resolved account */}
        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          {resolvedAccount ? (
            <div className="flex-1 min-w-0">
              <p className="font-mono text-sm truncate">
                {resolvedAccount.account_code}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {resolvedAccount.account_name}
                {resolvedAccount.bank_name && ` • ${resolvedAccount.bank_name}`}
              </p>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              Tự động chọn theo cấu hình
            </span>
          )}
          {!cashAccountId && (
            <Badge variant="outline" className="text-xs shrink-0">
              Auto
            </Badge>
          )}
          {cashAccountId && (
            <Badge variant="secondary" className="text-xs shrink-0">
              Override
            </Badge>
          )}
        </div>

        {/* Override selection (admin/ke_toan only) */}
        {showAdvanced && canOverrideAccount && onCashAccountChange && (
          <div className="mt-2 p-3 border rounded-md bg-warning/10/50">
            <p className="text-xs text-warning mb-2">
              ⚠️ Chỉ kế toán mới nên đổi tài khoản. Thao tác này sẽ ghi nhận đúng vào TK bạn chọn.
            </p>
            <Select
              value={cashAccountId || 'auto'}
              onValueChange={(v) => onCashAccountChange(v === 'auto' ? null : v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  <span className="flex items-center gap-2">
                    <span>🔄</span>
                    <span>Tự động (mặc định)</span>
                  </span>
                </SelectItem>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs">{acc.account_code}</span>
                      <span>{acc.account_name}</span>
                      {acc.bank_name && (
                        <span className="text-muted-foreground text-xs">
                          ({acc.bank_name})
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact version for inline use
 */
export function CanonicalPaymentSelect({
  direction,
  value,
  onChange,
}: {
  direction: 'IN' | 'OUT';
  value: CanonicalPaymentMethod;
  onChange: (value: CanonicalPaymentMethod) => void;
}) {
  const options = direction === 'IN'
    ? CANONICAL_COLLECT_OPTIONS
    : CANONICAL_CASHOUT_OPTIONS;

  return (
    <Select value={value} onValueChange={(v) => onChange(v as CanonicalPaymentMethod)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            <div className="flex items-center gap-2">
              <PaymentMethodIcon code={opt.value} className="h-4 w-4 text-muted-foreground" />
              {opt.label}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default CanonicalPaymentSelector;
