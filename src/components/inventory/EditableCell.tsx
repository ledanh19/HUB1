import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Edit2,
  User,
  Layers,
  Database,
  Settings,
  Cloud,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type SyncStatus = 'PENDING' | 'SYNCED' | 'FAILED';
export type SourceLayer = 'BASE' | 'OVERRIDE' | 'RULE' | 'SYNC';
export type CellState = 'DRAFT' | 'SAVED' | 'SYNCING' | 'FAILED';

interface CellData {
  id: string;
  cell_date?: string;
  availability?: number | null;
  rate?: number | null;
  stop_sell?: boolean;
  closed_to_arrival?: boolean;
  closed_to_departure?: boolean;
  min_stay_arrival?: number | null;
  min_stay_through?: number | null;
  max_stay?: number | null;
  sync_status?: SyncStatus;
  source_layer?: SourceLayer;
  cell_state?: CellState;
  editing_by?: string | null;
  version?: number;
  updated_at?: string;
  updated_by?: string | null;
  applied_rule_id?: string | null;
  applied_override_id?: string | null;
  batch_id?: string | null;
  timezone?: string;
}

interface EditableCellProps {
  cell?: CellData;
  viewMode: string;
  isDraft?: boolean;
  onEdit: (field: string, value: unknown) => void;
  disabled?: boolean;
  currentUserId?: string;
}

const SOURCE_LAYER_CONFIG: Record<SourceLayer, { icon: React.ElementType; color: string; label: string }> = {
  BASE: { icon: Database, color: "text-muted-foreground", label: "Base Default" },
  OVERRIDE: { icon: Edit2, color: "text-info", label: "Manual Override" },
  RULE: { icon: Settings, color: "text-primary", label: "Availability Rule" },
  SYNC: { icon: Cloud, color: "text-success", label: "Synced from OTA" },
};

const SYNC_STATUS_CONFIG: Record<SyncStatus, { icon: React.ElementType; color: string; label: string }> = {
  PENDING: { icon: Loader2, color: "text-info animate-spin", label: "Syncing..." },
  SYNCED: { icon: CheckCircle2, color: "text-success", label: "Synced" },
  FAILED: { icon: AlertCircle, color: "text-destructive", label: "Sync Failed" },
};

// Cell state visual config per ABSOLUTE SPEC
const CELL_STATE_CONFIG: Record<CellState, { bgClass: string; borderClass: string; label: string }> = {
  DRAFT: { bgClass: "bg-warning/10 dark:bg-warning/10", borderClass: "ring-2 ring-warning", label: "Draft (chưa lưu)" },
  SAVED: { bgClass: "", borderClass: "", label: "Đã lưu" },
  SYNCING: { bgClass: "bg-info/10", borderClass: "ring-1 ring-info", label: "Đang sync" },
  FAILED: { bgClass: "bg-destructive/10", borderClass: "ring-1 ring-destructive", label: "Sync thất bại" },
};

export function EditableCell({
  cell,
  viewMode,
  isDraft,
  onEdit,
  disabled,
  currentUserId,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  
  const syncStatus = cell?.sync_status;
  const sourceLayer = cell?.source_layer || 'BASE';
  const isBeingEditedByOther = cell?.editing_by && cell.editing_by !== currentUserId;
  
  // Format rate for display - compact on mobile
  const formatRate = (rate: number | null | undefined): string => {
    if (rate === null || rate === undefined) return '-';
    // Convert to millions for compact display
    if (rate >= 1000000) {
      const millions = rate / 1000000;
      return `${millions.toFixed(1)}Tr`;
    }
    if (rate >= 1000) {
      const thousands = rate / 1000;
      return `${thousands.toFixed(0)}K`;
    }
    return new Intl.NumberFormat('vi-VN').format(rate);
  };
  
  // Get cell values
  const availability = cell?.availability;
  const rate = cell?.rate;
  const stopSell = cell?.stop_sell;
  const cta = cell?.closed_to_arrival;
  const ctd = cell?.closed_to_departure;
  const minStayArrival = cell?.min_stay_arrival;
  
  const isStopSell = stopSell === true;
  const hasNoAvailability = availability === 0;
  
  // Handle save
  const handleSave = () => {
    Object.entries(editValues).forEach(([field, value]) => {
      onEdit(field, value);
    });
    setIsEditing(false);
    setEditValues({});
  };
  
  // Handle cancel
  const handleCancel = () => {
    setIsEditing(false);
    setEditValues({});
  };
  
  // Render source layer indicator
  const renderSourceIndicator = () => {
    const config = SOURCE_LAYER_CONFIG[sourceLayer];
    const Icon = config.icon;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Icon className={cn("h-3 w-3", config.color)} />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {config.label}
        </TooltipContent>
      </Tooltip>
    );
  };
  
  // Render sync status indicator
  const renderSyncIndicator = () => {
    if (!syncStatus) return null;
    const config = SYNC_STATUS_CONFIG[syncStatus];
    const Icon = config.icon;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Icon className={cn("h-3 w-3", config.color)} />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {config.label}
        </TooltipContent>
      </Tooltip>
    );
  };
  
  // Get cell state for styling
  const cellState = cell?.cell_state || 'SAVED';
  const cellStateConfig = CELL_STATE_CONFIG[cellState];
  
  // Cell container classes - using cell_state per ABSOLUTE SPEC
  const cellClass = cn(
    "relative p-1 sm:p-1.5 min-w-[50px] sm:min-w-[70px] md:min-w-[80px] max-w-[80px] cursor-pointer transition-colors group overflow-hidden",
    // Cell state styling (priority)
    cellStateConfig.bgClass,
    cellStateConfig.borderClass,
    // Override with draft prop if provided
    isDraft && CELL_STATE_CONFIG.DRAFT.bgClass,
    isDraft && CELL_STATE_CONFIG.DRAFT.borderClass,
    // Visual indicators for restrictions
    isStopSell && !isDraft && "bg-destructive/10",
    hasNoAvailability && !isStopSell && !isDraft && "bg-warning/10 dark:bg-warning/10",
    isBeingEditedByOther && "bg-primary/10",
    !disabled && "hover:bg-accent/50"
  );
  
  // Render display content based on view mode
  const renderContent = () => {
    switch (viewMode) {
      case 'only_availability':
        return (
          <span className={cn("font-medium text-xs sm:text-sm", hasNoAvailability && "text-destructive")}>
            {availability ?? '-'}
          </span>
        );
        
      case 'rate':
        return <span className="text-micro sm:text-sm truncate block">{formatRate(rate)}</span>;
        
      case 'rate_and_availability':
        return (
          <>
            <div className={cn("font-medium text-micro sm:text-sm", hasNoAvailability && "text-destructive")}>
              {availability ?? '-'}
            </div>
            <div className="text-micro sm:text-xs text-muted-foreground truncate">{formatRate(rate)}</div>
          </>
        );
        
      case 'stop_sell':
        return (
          <Badge variant={stopSell ? 'destructive' : 'secondary'} className="text-xs">
            {stopSell ? 'STOP' : 'OPEN'}
          </Badge>
        );
        
      case 'cta':
        return (
          <Badge variant={cta ? 'destructive' : 'secondary'} className="text-xs">
            {cta ? 'CLOSED' : 'OPEN'}
          </Badge>
        );
        
      case 'ctd':
        return (
          <Badge variant={ctd ? 'destructive' : 'secondary'} className="text-xs">
            {ctd ? 'CLOSED' : 'OPEN'}
          </Badge>
        );
        
      case 'min_stay_arrival':
        return <span className="text-sm">{minStayArrival ?? '-'}</span>;
        
      case 'all_restrictions':
      default:
        return (
          <div className="text-xs space-y-0.5">
            <div className={cn(hasNoAvailability && "text-destructive font-medium")}>
              AVL: {availability ?? '-'}
            </div>
            <div>Rate: {formatRate(rate)}</div>
            {stopSell && <Badge variant="destructive" className="text-micro px-1">STOP</Badge>}
            {cta && <Badge variant="outline" className="text-micro px-1">CTA</Badge>}
          </div>
        );
    }
  };
  
  // Render edit form
  const renderEditForm = () => {
    return (
      <div className="space-y-3 p-1">
        <div className="space-y-2">
          <Label className="text-xs">Availability</Label>
          <Input
            ref={inputRef}
            type="number"
            min={0}
            defaultValue={availability ?? ''}
            onChange={(e) => setEditValues(prev => ({
              ...prev,
              availability: e.target.value ? parseInt(e.target.value) : null
            }))}
            className="h-8"
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs">Rate</Label>
          <Input
            type="number"
            min={0}
            defaultValue={rate ?? ''}
            onChange={(e) => setEditValues(prev => ({
              ...prev,
              rate: e.target.value ? parseFloat(e.target.value) : null
            }))}
            className="h-8"
          />
        </div>
        
        <div className="flex items-center justify-between">
          <Label className="text-xs">Stop Sell</Label>
          <Switch
            defaultChecked={stopSell}
            onCheckedChange={(checked) => setEditValues(prev => ({
              ...prev,
              stop_sell: checked
            }))}
          />
        </div>
        
        <div className="flex items-center justify-between">
          <Label className="text-xs">CTA</Label>
          <Switch
            defaultChecked={cta}
            onCheckedChange={(checked) => setEditValues(prev => ({
              ...prev,
              closed_to_arrival: checked
            }))}
          />
        </div>
        
        <div className="flex items-center justify-between">
          <Label className="text-xs">CTD</Label>
          <Switch
            defaultChecked={ctd}
            onCheckedChange={(checked) => setEditValues(prev => ({
              ...prev,
              closed_to_departure: checked
            }))}
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs">Min Stay (Arrival)</Label>
          <Input
            type="number"
            min={1}
            defaultValue={minStayArrival ?? ''}
            onChange={(e) => setEditValues(prev => ({
              ...prev,
              min_stay_arrival: e.target.value ? parseInt(e.target.value) : null
            }))}
            className="h-8"
          />
        </div>
        
        <div className="flex gap-2 pt-2">
          <Button size="sm" onClick={handleSave} className="flex-1">
            Apply
          </Button>
          <Button size="sm" variant="outline" onClick={handleCancel} className="flex-1">
            Cancel
          </Button>
        </div>
      </div>
    );
  };
  
  if (disabled || !cell) {
    return (
      <div className={cn(cellClass, "cursor-default")}>
        <div className="text-center">{renderContent()}</div>
      </div>
    );
  }
  
  return (
    <Popover open={isEditing} onOpenChange={setIsEditing}>
      <PopoverTrigger asChild>
        <div className={cellClass}>
          {/* Indicators in top right */}
          <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5">
            {renderSourceIndicator()}
            {renderSyncIndicator()}
            {isBeingEditedByOther && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <User className="h-3 w-3 text-primary" />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Being edited by another user
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          
          {/* Content */}
          <div className="text-center pt-2">{renderContent()}</div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        {/* Cell Info Header - Explainability */}
        <div className="border-b pb-2 mb-3">
          <div className="text-sm font-medium mb-2">Chi tiết Cell</div>
          <div className="text-xs space-y-1 text-muted-foreground">
            <div className="flex justify-between">
              <span>Ngày:</span>
              <span className="font-medium text-foreground">{cell?.cell_date || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span>Source Layer:</span>
              <span className="font-medium text-foreground">{SOURCE_LAYER_CONFIG[sourceLayer].label}</span>
            </div>
            <div className="flex justify-between">
              <span>Sync Status:</span>
              <span className={cn("font-medium", syncStatus === 'SYNCED' ? 'text-success' : syncStatus === 'FAILED' ? 'text-destructive' : 'text-info')}>
                {syncStatus || 'N/A'}
              </span>
            </div>
            {cell?.applied_rule_id && (
              <div className="flex justify-between">
                <span>Rule ID:</span>
                <span className="font-mono text-micro text-foreground">{cell.applied_rule_id.slice(0, 8)}...</span>
              </div>
            )}
            {cell?.batch_id && (
              <div className="flex justify-between">
                <span>Batch ID:</span>
                <span className="font-mono text-micro text-foreground">{cell.batch_id.slice(0, 8)}...</span>
              </div>
            )}
            {cell?.updated_at && (
              <div className="flex justify-between">
                <span>Cập nhật lúc:</span>
                <span className="text-foreground">{new Date(cell.updated_at).toLocaleString('vi-VN')}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Version:</span>
              <span className="font-medium text-foreground">v{cell?.version || 1}</span>
            </div>
          </div>
        </div>
        <div className="text-sm font-medium mb-2">Chỉnh sửa</div>
        {renderEditForm()}
      </PopoverContent>
    </Popover>
  );
}
