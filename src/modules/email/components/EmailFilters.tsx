import React, { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  Search,
  RefreshCw,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Archive,
  Trash2,
  Mail,
  Tag,
  X,
} from 'lucide-react';
import type { EmailAccount, EmailInboxFilters } from '@/types/email';
import { cn } from '@/lib/utils';

interface EmailFiltersProps {
  filters: EmailInboxFilters;
  onFiltersChange: (filters: Partial<EmailInboxFilters>) => void;
  accounts: EmailAccount[];
  total?: number;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onSelectAll?: (checked: boolean) => void;
  isAllChecked?: boolean;
  settingsAction?: React.ReactNode;
}

const LABELS = [
  { value: '_all', label: 'Tất cả' },
  { value: 'INBOX', label: 'Hộp thư đến' },
  { value: 'SENT', label: 'Đã gửi' },
  { value: 'STARRED', label: 'Gắn sao' },
  { value: 'IMPORTANT', label: 'Quan trọng' },
];

export function EmailFilters({
  filters,
  onFiltersChange,
  accounts,
  total = 0,
  isRefreshing,
  onRefresh,
  onSelectAll,
  isAllChecked,
  settingsAction,
}: EmailFiltersProps) {
  const [searchFocused, setSearchFocused] = useState(false);
  const pageSize = 50;
  const start = (filters.page - 1) * pageSize + 1;
  const end = Math.min(filters.page * pageSize, total);
  const hasNext = filters.page * pageSize < total;
  const hasPrev = filters.page > 1;

  const activeLabel = LABELS.find(
    (l) => filters.label === l.value || (filters.label === '' && l.value === '_all')
  );

  return (
    <TooltipProvider>
      <div className="space-y-0">

        {/* ═══ MOBILE search bar (<sm) — Gmail rounded pill style ═══ */}
        <div className={cn(
          'flex items-center gap-2 px-3 py-2 sm:hidden',
        )}>
          <div className={cn(
            'flex-1 flex items-center gap-2 rounded-full px-3 py-1.5 transition-shadow border',
            searchFocused ? 'shadow-lg bg-background border-primary/30' : 'bg-muted/30 hover:shadow-md border-border/50',
          )}>
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="Tìm trong thư"
              value={filters.search}
              onChange={(e) => onFiltersChange({ search: e.target.value, page: 1 })}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="border-0 h-7 text-sm bg-transparent focus-visible:ring-0 shadow-none px-1 min-w-0"
            />
            {filters.search && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full shrink-0"
                onClick={() => onFiltersChange({ search: '', page: 1 })}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {settingsAction}
        </div>

        {/* ═══ MOBILE label row + account filter (<sm) ═══ */}
        <div className="sm:hidden flex items-center gap-1 px-3 pb-1.5 overflow-x-auto scrollbar-hide">
          {/* Account filter pill */}
          <Select
            value={filters.accountId}
            onValueChange={(val) => onFiltersChange({ accountId: val, page: 1 })}
          >
            <SelectTrigger className="w-auto border bg-muted/20 shadow-none h-7 text-xs gap-1 rounded-full px-2.5 shrink-0 max-w-[130px]">
              <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="truncate"><SelectValue placeholder="Tất cả" /></span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả tài khoản</SelectItem>
              {accounts
                .filter((a) => a.status === 'ACTIVE')
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.email_address}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <div className="w-px h-4 bg-border mx-0.5 shrink-0" />

          {/* Label tabs */}
          {LABELS.map((l) => {
            const isActive = (filters.label === '' && l.value === '_all') ||
              filters.label === l.value;
            return (
              <button
                key={l.value}
                onClick={() => onFiltersChange({ label: l.value === '_all' ? '' : l.value, page: 1 })}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0',
                  isActive
                    ? 'bg-info/15 text-info border border-info/30'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {l.label}
              </button>
            );
          })}

          {/* Refresh */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full shrink-0 ml-auto"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
          </Button>
        </div>

        {/* ═══ DESKTOP search bar (sm+) — original ═══ */}
        <div className={cn(
          'hidden sm:flex items-center gap-1.5 px-3 py-1 border-b transition-shadow',
          searchFocused ? 'shadow-lg bg-background' : 'bg-muted/40 hover:shadow-md',
        )}>
          <Search className="h-4 w-4 text-muted-foreground ml-2 shrink-0" />
          <Input
            placeholder="Tìm kiếm email..."
            value={filters.search}
            onChange={(e) => onFiltersChange({ search: e.target.value, page: 1 })}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="border-0 h-7 text-xs bg-transparent focus-visible:ring-0 shadow-none px-2"
          />
          {filters.search && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full shrink-0"
              onClick={() => onFiltersChange({ search: '', page: 1 })}
            >
              <X className="h-4 w-4" />
            </Button>
          )}

          {/* Account filter */}
          <Select
            value={filters.accountId}
            onValueChange={(val) => onFiltersChange({ accountId: val, page: 1 })}
          >
            <SelectTrigger className="w-auto border-0 bg-transparent shadow-none h-8 text-xs gap-1 hover:bg-muted rounded-full px-3">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả tài khoản</SelectItem>
              {accounts
                .filter((a) => a.status === 'ACTIVE')
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.email_address}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {settingsAction}
        </div>

        {/* ═══ DESKTOP toolbar row (sm+) — original ═══ */}
        <div className="hidden sm:flex items-center h-8 px-2 border-b">
          {/* Left: checkbox + actions */}
          <div className="flex items-center gap-0.5">
            <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isAllChecked}
                onCheckedChange={(val) => onSelectAll?.(!!val)}
                className="h-[18px] w-[18px] rounded-sm border-muted-foreground/40 ml-2.5 mr-1.5"
              />
              <ChevronDown className="h-3 w-3 text-muted-foreground cursor-pointer" />
            </div>

            <div className="w-px h-5 bg-border mx-1.5" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Làm mới</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Thêm</TooltipContent>
            </Tooltip>
          </div>

          {/* Center: label tabs */}
          <div className="flex items-center gap-0 ml-4">
            {LABELS.map((l) => {
              const isActive = (filters.label === '' && l.value === '_all') ||
                filters.label === l.value ||
                (filters.label === '' && l.value === '_all');
              return (
                <button
                  key={l.value}
                  onClick={() => onFiltersChange({ label: l.value === '_all' ? '' : l.value, page: 1 })}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
                    isActive
                      ? 'bg-info/10 text-info'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {l.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1" />

          {/* Right: pagination */}
          {total > 0 && (
            <div className="flex items-center gap-0.5 text-xs text-muted-foreground mr-1">
              <span className="tabular-nums">
                {start}–{end} / {total}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    disabled={!hasPrev}
                    onClick={() => onFiltersChange({ page: filters.page - 1 })}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Mới hơn</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    disabled={!hasNext}
                    onClick={() => onFiltersChange({ page: filters.page + 1 })}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Cũ hơn</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
