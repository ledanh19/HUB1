import { useMemo, useCallback, Fragment } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { 
  InventoryCell, 
  InventoryViewMode, 
  RoomType, 
  RatePlan, 
  Channel,
  DraftChange,
} from "@/hooks/useInventory";
import { EditableCell, SyncStatus, SourceLayer } from "./EditableCell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { formatRateDisplay } from "@/lib/currencyHelpers";
import { checkRatePlanSyncEligibility } from "@/lib/syncGuards";

/**
 * Detect OTA channel from a rate plan.
 * 1. Try ALL "(ChannelName)" segments in rate_plan_name — Channex channel copies
 *    use patterns like "Plan (Agoda) - Agoda Agoda - PropertyName" where the
 *    channel name is in the middle, not necessarily at the end.
 * 2. Try matching channels[] array entries against known channel ids/names
 */
function detectChannel(rp: RatePlan, allChannels: Channel[]): Channel | null {
  // 1. All parenthesized segments — find first match against known channels
  const parenRegex = /\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = parenRegex.exec(rp.rate_plan_name)) !== null) {
    const text = m[1].trim().toLowerCase();
    const ch = allChannels.find(c =>
      c.name.toLowerCase() === text || c.id.toLowerCase() === text
    );
    if (ch) return ch;
  }

  // 2. channels[] array from rate_plans_mirror (Channex channel UUIDs)
  for (const chRef of (rp.channels || [])) {
    const chLower = chRef.toLowerCase();
    const ch = allChannels.find(c =>
      c.id.toLowerCase() === chLower || c.name.toLowerCase() === chLower
    );
    if (ch) return ch;
  }

  return null;
}

// All restriction types
export type RestrictionType = 'AVL' | 'AVO' | 'CTA' | 'CTD' | 'MAL' | 'MXS' | 'MSA' | 'MST' | 'RATE' | 'SS';

// Mapping from selection keys to restriction types
type SelectionKey = 'availability_offset' | 'availability_per_rate' | 'cta' | 'ctd' | 'max_availability' | 'max_stay' | 'min_stay_arrival' | 'min_stay_through' | 'rate' | 'stop_sell';

const SELECTION_TO_RESTRICTION: Record<SelectionKey, RestrictionType> = {
  availability_offset: 'AVO',
  availability_per_rate: 'AVL',
  cta: 'CTA',
  ctd: 'CTD',
  max_availability: 'MAL',
  max_stay: 'MXS',
  min_stay_arrival: 'MSA',
  min_stay_through: 'MST',
  rate: 'RATE',
  stop_sell: 'SS',
};

const RESTRICTION_ORDER: RestrictionType[] = ['AVL', 'AVO', 'CTA', 'CTD', 'MAL', 'MXS', 'MSA', 'MST', 'RATE', 'SS'];

const RESTRICTION_LABELS: Record<RestrictionType, string> = {
  AVL: 'AVL',
  AVO: 'AVO',
  CTA: 'CTA',
  CTD: 'CTD',
  MAL: 'MAL',
  MXS: 'MXS',
  MSA: 'MSA',
  MST: 'MST',
  RATE: 'RATE',
  SS: 'SS',
};

// Get restrictions to display based on selectedRestrictions array
function getRestrictionsFromSelection(selectedRestrictions: SelectionKey[]): RestrictionType[] {
  if (selectedRestrictions.length === 0) return ['AVL', 'RATE'];
  
  const restrictions = selectedRestrictions
    .map(key => SELECTION_TO_RESTRICTION[key])
    .filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates
  
  // Sort by standard order
  return RESTRICTION_ORDER.filter(r => restrictions.includes(r));
}

interface InventoryGridProps {
  weekDates: Date[];
  roomTypes: RoomType[];
  ratePlans: RatePlan[];
  channels: Channel[];
  cells: InventoryCell[];
  viewMode: InventoryViewMode;
  selectedRestrictions?: SelectionKey[];
  draftChanges: Map<string, DraftChange>;
  onCellEdit: (cellId: string, changes: Partial<InventoryCell>) => void;
  currentUserId?: string;
}

export function InventoryGrid({
  weekDates,
  roomTypes,
  ratePlans,
  channels,
  cells,
  viewMode,
  selectedRestrictions,
  draftChanges,
  onCellEdit,
  currentUserId,
}: InventoryGridProps) {
  // Create a lookup map for cells
  const cellMap = useMemo(() => {
    const map = new Map<string, InventoryCell>();
    cells.forEach(cell => {
      // Key by room_type_id, rate_plan_id, channel_id and date
      const key = `${cell.room_type_id}_${cell.rate_plan_id || ''}_${cell.channel_id || ''}_${cell.cell_date}`;
      map.set(key, cell);
    });
    return map;
  }, [cells]);
  
  // Get cell by composite key
  const getCell = useCallback(
    (roomTypeId: string, ratePlanId: string | null, channelId: string | null, date: Date): InventoryCell | undefined => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const key = `${roomTypeId}_${ratePlanId || ''}_${channelId || ''}_${dateStr}`;
      const direct = cellMap.get(key);
      // Fallback: many datasets keep channel_id null even when rate_plan name implies a channel
      if (!direct && channelId) {
        const fallbackKey = `${roomTypeId}_${ratePlanId || ''}__${dateStr}`;
        return cellMap.get(fallbackKey);
      }
      return direct;
    },
    [cellMap]
  );
  
  // Get merged cell data (original + draft changes)
  const getMergedCell = useCallback((cell: InventoryCell | undefined): InventoryCell | undefined => {
    if (!cell) return undefined;
    const draft = draftChanges.get(cell.id);
    if (!draft) return cell;
    return { ...cell, ...draft.changes };
  }, [draftChanges]);
  
  // Check if cell has draft changes
  const hasDraft = useCallback((cellId: string): boolean => {
    return draftChanges.has(cellId);
  }, [draftChanges]);
  
  // Handle cell edit
  const handleCellEdit = useCallback((cell: InventoryCell, field: string, value: unknown) => {
    onCellEdit(cell.id, { [field]: value });
  }, [onCellEdit]);
  
  // Get restrictions to display - use selectedRestrictions if provided, otherwise fall back to viewMode
  const restrictionsToShow = useMemo(() => {
    if (selectedRestrictions && selectedRestrictions.length > 0) {
      return getRestrictionsFromSelection(selectedRestrictions);
    }
    // Fallback for backward compatibility
    return ['AVL', 'RATE'] as RestrictionType[];
  }, [selectedRestrictions]);

  // AVL is a room-type-level concept (PMS §1.1), not per rate plan.
  // Rate plan rows should only show per-rate-plan restrictions (RATE, SS, CTA, CTD, etc.)
  const ratePlanRestrictions = useMemo(() => {
    return restrictionsToShow.filter(r => r !== 'AVL');
  }, [restrictionsToShow]);

  // When the only selected restriction is AVL, we show ONLY room type rows (no rate plan sub-rows)
  const isOnlyAvlMode = restrictionsToShow.length === 1 && restrictionsToShow[0] === 'AVL';
  
  // Format values for display — uses PMS-aligned currency helper
  const formatRate = (rate: number | null | undefined, ratePlan?: RatePlan): string => {
    // Show base rate fallback in parentheses when cell has no override
    if (rate === null || rate === undefined) {
      if (ratePlan?.base_rate) {
        return formatRateDisplay(ratePlan.base_rate, ratePlan.currency || 'VND');
      }
      return '—';
    }
    return formatRateDisplay(rate, 'VND');
  };
  
  // Render cell value based on restriction type
  const renderCellValue = (
    cell: InventoryCell | undefined, 
    restriction: RestrictionType,
    onEdit: (field: string, value: unknown) => void,
    isDraft: boolean
  ) => {
    if (!cell) {
      return <span className="text-muted-foreground text-xs">—</span>;
    }
    
    const baseClass = "text-sm";
    
    switch (restriction) {
      case 'AVL': {
        const avl = cell.availability ?? 0;
        const avlSsWarning = avl === 0 && !(cell.stop_sell);
        return (
          <span className={cn(
            baseClass,
            avl === 0 && "text-destructive font-medium",
            avlSsWarning && "underline decoration-dotted decoration-yellow-500"
          )}
          title={avlSsWarning ? 'Availability = 0 nhưng Stop Sell chưa bật' : undefined}
          >
            {avl}
          </span>
        );
      }
      case 'AVO': {
        const avo = cell.availability_offset;
        return (
          <span className={cn(baseClass, avo !== null && avo !== 0 && (avo > 0 ? "text-success" : "text-destructive"))}>
            {avo ?? 0}
          </span>
        );
      }
      case 'CTA':
        return (
          <Checkbox 
            checked={cell.closed_to_arrival ?? false}
            onCheckedChange={(checked) => onEdit('closed_to_arrival', checked)}
            className={cn(isDraft && "ring-2 ring-warning")}
          />
        );
      case 'CTD':
        return (
          <Checkbox 
            checked={cell.closed_to_departure ?? false}
            onCheckedChange={(checked) => onEdit('closed_to_departure', checked)}
            className={cn(isDraft && "ring-2 ring-warning")}
          />
        );
      case 'MAL': {
        const mal = cell.max_availability;
        return (
          <span className={cn(baseClass, "text-muted-foreground")}>
            {mal ?? 'N/A'}
          </span>
        );
      }
      case 'MXS':
        return (
          <span className={baseClass}>
            {cell.max_stay ?? 0}
          </span>
        );
      case 'MSA':
        return (
          <span className={baseClass}>
            {cell.min_stay_arrival ?? 1}
          </span>
        );
      case 'MST':
        return (
          <span className={baseClass}>
            {cell.min_stay_through ?? 1}
          </span>
        );
      case 'RATE':
        return (
          <span className={cn(baseClass, "text-primary text-micro sm:text-sm truncate block max-w-[50px] sm:max-w-[65px] md:max-w-none")}>
            {formatRate(cell.rate)}
          </span>
        );
      case 'SS': {
        const ssAvlWarning = (cell.stop_sell ?? false) && (cell.availability ?? 0) > 0;
        return (
          <div className="flex items-center gap-1">
            <Checkbox 
              checked={cell.stop_sell ?? false}
              onCheckedChange={(checked) => onEdit('stop_sell', checked)}
              className={cn(isDraft && "ring-2 ring-warning")}
            />
            {ssAvlWarning && (
              <span
                className="text-warning text-xs font-bold"
                title={`Stop Sell đang bật nhưng availability = ${cell.availability}`}
              >
                ⚠
              </span>
            )}
          </div>
        );
      }
      default:
        return null;
    }
  };

  if (roomTypes.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No room types found</p>
        <p className="text-sm mt-1">Please sync room types from Channel Manager first</p>
      </div>
    );
  }
  
  return (
    <TooltipProvider>
      <div className="overflow-auto -mx-2 sm:mx-0">
        <Table className="min-w-[600px]">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background z-10 min-w-[120px] sm:min-w-[200px] md:min-w-[280px]">
                <span className="hidden sm:inline">Room / Rate Plan</span>
                <span className="sm:hidden text-xs">Room</span>
              </TableHead>
              <TableHead className="sticky left-[120px] sm:left-[200px] md:left-[280px] bg-background z-10 min-w-[40px] sm:min-w-[60px] text-center">
                <span className="text-micro sm:text-xs">Type</span>
              </TableHead>
              {weekDates.map(date => (
                <TableHead key={date.toISOString()} className="text-center min-w-[55px] sm:min-w-[70px] md:min-w-[80px] p-1 sm:p-2">
                  <div className="font-medium text-micro sm:text-xs">{format(date, 'EEE', { locale: vi })}</div>
                  <div className="text-xs font-semibold">{format(date, 'dd')}</div>
                  <div className="text-micro sm:text-micro text-muted-foreground">{format(date, 'MMM')}</div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {roomTypes.map(roomType => {
              // SOT: join strictly by Channex room_type_id (provider_room_type_id)
              const allRoomRatePlans = ratePlans.filter(rp =>
                rp.provider_room_type_id === roomType.provider_room_type_id
              );

              // Only show rate plans that have at least 1 inventory cell in the
              // visible date range. Channex's /api/v1/restrictions only returns data
              // for rate plans with explicit values — derived/channel rate plans
              // without their own ARI entries would show all "—" which is noise.
              const roomRatePlans = allRoomRatePlans.filter(rp => {
                return weekDates.some(date => {
                  const cell = getCell(roomType.id, rp.id, null, date);
                  return cell !== undefined;
                });
              });
              
              // Helper to get aggregated availability for room type
              const getRoomTypeAvailability = (date: Date): number => {
                for (const rp of allRoomRatePlans) {
                  const cell = getCell(roomType.id, rp.id, null, date);
                  if (cell) return cell.availability ?? 0;
                }
                return 0;
              };
              
              return (
                <Fragment key={roomType.id}>
                  {/* Room Type Header - AVL row */}
                  <TableRow className="bg-primary/5 hover:bg-primary/10">
                    <TableCell className="sticky left-0 bg-primary/5 font-semibold min-w-[120px] sm:min-w-[200px] md:min-w-[280px] text-primary p-2">
                      <span className="text-xs sm:text-sm truncate block max-w-[100px] sm:max-w-[180px] md:max-w-[260px]">{roomType.room_type_name}</span>
                    </TableCell>
                    <TableCell className="sticky left-[120px] sm:left-[200px] md:left-[280px] bg-primary/5 text-center min-w-[40px] sm:min-w-[60px] p-1">
                      <Badge variant="outline" className="text-micro sm:text-xs font-medium px-1">AVL</Badge>
                    </TableCell>
                    {weekDates.map(date => {
                      const avl = getRoomTypeAvailability(date);
                      return (
                        <TableCell 
                          key={date.toISOString()} 
                          className={cn(
                            "text-center min-w-[55px] sm:min-w-[70px] md:min-w-[80px] p-1 sm:p-2",
                            avl === 0 && "bg-destructive/10"
                          )}
                        >
                          <span className={cn(
                            "font-semibold text-xs sm:text-sm",
                            avl === 0 && "text-destructive"
                          )}>
                            {avl}
                          </span>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                  
                  {/* Rate Plan rows — 1 row per rate plan, matching Channex exactly */}
                  {!isOnlyAvlMode && roomRatePlans.map(ratePlan => {
                    const syncEligibility = checkRatePlanSyncEligibility(ratePlan.provider_rate_plan_id);
                    const channel = detectChannel(ratePlan, channels);
                    
                    // Use ratePlanRestrictions (excludes AVL — AVL shows in room type header only)
                    const rpRestrictions = ratePlanRestrictions.length > 0 ? ratePlanRestrictions : ['RATE'] as RestrictionType[];
                    
                    return rpRestrictions.map((restriction, idx) => (
                      <TableRow 
                        key={`${roomType.id}-${ratePlan.id}-${restriction}`}
                        className={cn(
                          restriction === 'RATE' && "bg-destructive/10/50 dark:bg-destructive/10"
                        )}
                      >
                        <TableCell className={cn(
                          "sticky left-0 bg-background min-w-[120px] sm:min-w-[200px] md:min-w-[280px] p-1 sm:p-2",
                          restriction === 'RATE' && "bg-destructive/10/50 dark:bg-destructive/10"
                        )}>
                          {idx === 0 ? (
                            <div className="flex items-center gap-1 sm:gap-2 text-micro sm:text-sm pl-2 sm:pl-4">
                              <span 
                                className="truncate max-w-[80px] sm:max-w-[160px] md:max-w-[220px]"
                                title={ratePlan.rate_plan_name}
                              >
                                {ratePlan.rate_plan_name}
                              </span>
                              {channel && (
                                <Badge 
                                  variant="outline" 
                                  className="text-micro sm:text-micro shrink-0 px-1 py-0 hidden sm:inline-flex"
                                  style={{ borderColor: channel.color || undefined, color: channel.color || undefined }}
                                >
                                  {channel.name}
                                </Badge>
                              )}
                              {!syncEligibility.canSync && (
                                <Badge variant="destructive" className="text-micro sm:text-micro shrink-0 px-1 py-0 hidden sm:inline-flex">
                                  Unmapped
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-transparent select-none pl-2 sm:pl-4">-</span>
                          )}
                        </TableCell>
                        <TableCell className={cn(
                          "sticky left-[120px] sm:left-[200px] md:left-[280px] bg-background text-center min-w-[40px] sm:min-w-[60px] p-1",
                          restriction === 'RATE' && "bg-destructive/10/50 dark:bg-destructive/10"
                        )}>
                          <Badge 
                            variant="secondary" 
                            className={cn(
                              "text-micro sm:text-micro font-medium px-1 py-0",
                              restriction === 'RATE' && "bg-primary/10 text-primary"
                            )}
                          >
                            {RESTRICTION_LABELS[restriction]}
                          </Badge>
                        </TableCell>
                        {weekDates.map(date => {
                          const cell = getCell(roomType.id, ratePlan.id, null, date);
                          const mergedCell = getMergedCell(cell);
                          const isDraft = cell ? hasDraft(cell.id) : false;
                          
                          // RATE fallback: show base_rate from mirror when no cell
                          const showBaseRate = !mergedCell && restriction === 'RATE' && ratePlan.base_rate;
                          
                          return (
                            <TableCell 
                              key={date.toISOString()} 
                              className={cn(
                                "text-center min-w-[55px] sm:min-w-[70px] md:min-w-[80px] p-1 sm:p-2",
                                isDraft && "bg-warning/10 dark:bg-warning/10",
                                restriction === 'RATE' && "bg-destructive/10/50 dark:bg-destructive/10"
                              )}
                            >
                              {showBaseRate ? (
                                <span className="text-muted-foreground/60 text-micro sm:text-xs italic" title="Giá gốc từ rate plan">
                                  {formatRate(ratePlan.base_rate)}
                                </span>
                              ) : (
                                renderCellValue(
                                  mergedCell, 
                                  restriction,
                                  (field, value) => cell && handleCellEdit(cell, field, value),
                                  isDraft
                                )
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ));
                  })}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}