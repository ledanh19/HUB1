import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, LogIn, RefreshCw, Unplug, Users } from 'lucide-react';
import type { EmailAccount } from '@/types/email';
import { normalizeEmailAccountStatus, type EmailAccountUiState, type StatusTone } from '../utils/emailAccountStatus';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface EmailAccountCardProps {
  account: EmailAccount;
  onDisconnect: (id: string) => void;
  onSync: (id: string) => void;
  onReconnect: (scopeLevel: string) => void;
  isDisconnecting: boolean;
  isSyncing: boolean;
  isAdmin: boolean;
}

const toneClasses: Record<StatusTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-destructive',
  muted: 'text-muted-foreground',
  info: 'text-info',
};

const toneIcons: Record<StatusTone, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  error: <AlertCircle className="h-4 w-4" />,
  muted: <Unplug className="h-4 w-4" />,
  info: <Clock className="h-4 w-4" />,
};

export function EmailAccountCard({ account, onDisconnect, onSync, onReconnect, isDisconnecting, isSyncing, isAdmin }: EmailAccountCardProps) {
  const uiState = normalizeEmailAccountStatus(account);

  return (
    <div className="flex items-center gap-4 px-4 py-3 border rounded-lg hover:bg-muted/30 transition-colors">
      {/* Gmail avatar */}
      <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-destructive" fill="currentColor">
          <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
        </svg>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{account.email_address}</span>
          {account.visibility === 'TEAM' && (
            <Badge variant="outline" className="text-micro px-1.5 py-0 font-normal shrink-0">
              <Users className="h-3 w-3 mr-0.5" />
              Team
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {/* Status badge */}
          <span className={cn('flex items-center gap-1 text-xs', toneClasses[uiState.statusTone])}>
            {toneIcons[uiState.statusTone]}
            {uiState.statusLabel}
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground capitalize">
            {account.scope_level.toLowerCase().replace('_', ' ')}
          </span>
          {/* Sync time */}
          {account.last_sync_at && (
            <>
              <span className="text-xs text-muted-foreground">·</span>
              <span className={cn(
                'text-xs',
                uiState.staleSeverity === 'severe' ? 'text-destructive font-medium' :
                uiState.staleSeverity === 'moderate' ? 'text-warning' :
                'text-muted-foreground'
              )}>
                Sync {formatDistanceToNow(new Date(account.last_sync_at), { addSuffix: true, locale: vi })}
              </span>
            </>
          )}
        </div>
        {/* Description line */}
        {uiState.description && (
          <p className={cn(
            'text-xs mt-1 truncate',
            uiState.statusTone === 'error' ? 'text-destructive' :
            uiState.statusTone === 'warning' ? 'text-warning' :
            'text-muted-foreground'
          )}>
            {uiState.description}
          </p>
        )}
      </div>

      {/* Actions — driven entirely by uiState */}
      {isAdmin && (
        <div className="flex items-center gap-1.5 shrink-0">
          <PrimaryActionButton uiState={uiState} account={account} onReconnect={onReconnect} onSync={onSync} onDisconnect={onDisconnect} isSyncing={isSyncing} isDisconnecting={isDisconnecting} />
          <SecondaryActionButton uiState={uiState} account={account} onSync={onSync} onDisconnect={onDisconnect} isSyncing={isSyncing} isDisconnecting={isDisconnecting} />
        </div>
      )}
    </div>
  );
}

// ─── Action Buttons ────────────────────────────────────────
function PrimaryActionButton({ uiState, account, onReconnect, onSync, onDisconnect, isSyncing, isDisconnecting }: {
  uiState: EmailAccountUiState; account: EmailAccount;
  onReconnect: (s: string) => void; onSync: (id: string) => void; onDisconnect: (id: string) => void;
  isSyncing: boolean; isDisconnecting: boolean;
}) {
  switch (uiState.primaryAction) {
    case 'reconnect':
      return (
        <Button variant="default" size="sm" onClick={() => onReconnect(account.scope_level)}
          className="h-8 px-3 text-xs bg-warning hover:bg-warning/90 text-warning-foreground">
          <LogIn className="h-3.5 w-3.5 mr-1" />
          Kết nối lại
        </Button>
      );
    case 'retry_sync':
      return (
        <Button variant="outline" size="sm" onClick={() => onSync(account.id)} disabled={isSyncing} className="h-8 px-3 text-xs">
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1', isSyncing && 'animate-spin')} />
          Thử đồng bộ lại
        </Button>
      );
    case 'disconnect':
      return (
        <Button variant="ghost" size="sm" onClick={() => onDisconnect(account.id)} disabled={isDisconnecting}
          className="h-8 px-3 text-xs text-destructive hover:text-destructive hover:bg-destructive/10">
          <Unplug className="h-3.5 w-3.5 mr-1" />
          Ngắt
        </Button>
      );
    default:
      return null;
  }
}

function SecondaryActionButton({ uiState, account, onSync, onDisconnect, isSyncing, isDisconnecting }: {
  uiState: EmailAccountUiState; account: EmailAccount;
  onSync: (id: string) => void; onDisconnect: (id: string) => void;
  isSyncing: boolean; isDisconnecting: boolean;
}) {
  switch (uiState.secondaryAction) {
    case 'retry_sync':
      return (
        <Button variant="ghost" size="sm" onClick={() => onSync(account.id)} disabled={isSyncing} className="h-8 px-3 text-xs">
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1', isSyncing && 'animate-spin')} />
          Sync
        </Button>
      );
    case 'disconnect':
      return (
        <Button variant="ghost" size="sm" onClick={() => onDisconnect(account.id)} disabled={isDisconnecting}
          className="h-8 px-3 text-xs text-destructive hover:text-destructive hover:bg-destructive/10">
          <Unplug className="h-3.5 w-3.5 mr-1" />
          Ngắt
        </Button>
      );
    default:
      return null;
  }
}
