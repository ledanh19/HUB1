/**
 * Hook: useCashAccounts
 * Quản lý cash_accounts cho việc chọn tài khoản nhận tiền
 * 
 * Sử dụng trong OTA Payout flow - MANUAL SELECTION ONLY
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CashAccount {
  id: string;
  account_code: string;
  account_name: string;
  account_type: "BANK" | "CASH" | "DIGITAL_WALLET";
  bank_name: string | null;
  account_number: string | null;
  is_default: boolean;
  is_active: boolean;
  is_archived: boolean;
  created_at: string;
}

export interface CashAccountOption {
  value: string;
  label: string;
  description: string;
  accountType: string;
  bankName: string | null;
  accountNumber: string | null;
  isDefault: boolean;
}

/**
 * Fetch active cash accounts for selection dropdown
 * Only returns active, non-archived accounts
 */
export function useCashAccounts() {
  return useQuery({
    queryKey: ["cash-accounts-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_accounts")
        .select("*")
        .eq("is_archived", false)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("account_name", { ascending: true });

      if (error) throw error;
      return data as CashAccount[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get formatted options for Select component
 */
export function useCashAccountOptions() {
  const { data: accounts = [], isLoading, error } = useCashAccounts();

  const options: CashAccountOption[] = accounts.map((account) => {
    // Format display label
    let label = account.account_name;
    if (account.bank_name) {
      label = `${account.account_name} (${account.bank_name})`;
    }
    if (account.is_default) {
      label = `⭐ ${label}`;
    }

    // Format description with masked account number
    let description: string = account.account_type;
    if (account.account_number) {
      const masked = maskAccountNumber(account.account_number);
      description = `${account.account_type} • ${masked}`;
    }
    if (account.bank_name) {
      description = `${account.bank_name} • ${description}`;
    }

    return {
      value: account.id,
      label,
      description,
      accountType: account.account_type,
      bankName: account.bank_name,
      accountNumber: account.account_number,
      isDefault: account.is_default,
    };
  });

  return { options, isLoading, error };
}

/**
 * Get account by ID
 */
export function useCashAccountById(accountId: string | null) {
  return useQuery({
    queryKey: ["cash-account", accountId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!accountId) return null;
      
      const { data, error } = await supabase
        .from("cash_accounts")
        .select("*")
        .eq("id", accountId)
        .single();

      if (error) throw error;
      return data as CashAccount;
    },
    enabled: !!accountId,
  });
}

/**
 * Helper: Mask account number for display
 * Example: "1234567890" -> "••••••7890"
 */
export function maskAccountNumber(accountNumber: string): string {
  if (!accountNumber || accountNumber.length < 4) {
    return accountNumber || "";
  }
  const lastFour = accountNumber.slice(-4);
  const maskedPart = "•".repeat(Math.min(accountNumber.length - 4, 6));
  return `${maskedPart}${lastFour}`;
}

/**
 * Format account for display in ledger/reports
 */
export function formatCashAccountDisplay(account: CashAccount | null): string {
  if (!account) return "—";
  
  let display = account.account_name;
  if (account.bank_name) {
    display += ` (${account.bank_name})`;
  }
  return display;
}

/**
 * Get account type label in Vietnamese
 */
export function getAccountTypeLabel(type: string): string {
  switch (type) {
    case "BANK":
      return "Ngân hàng";
    case "CASH":
      return "Tiền mặt";
    case "DIGITAL_WALLET":
      return "Ví điện tử";
    default:
      return type;
  }
}
