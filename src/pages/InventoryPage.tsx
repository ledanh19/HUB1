import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, subDays, startOfWeek } from "date-fns";
import { vi } from "date-fns/locale";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { NewDataBanner } from "@/components/ui/new-data-banner";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { generateIdempotencyKey, hashPayload } from "@/lib/dateHelpers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Settings,
  History,
  Layers,
  Link2,
  Tag,
  Check,
  Wifi,
  WifiOff,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  useChannels,
  useRoomTypes,
  useRatePlans,
  useInventoryCells,
  useInventoryDraft,
  useBulkUpdateInventory,
  useSyncStatusCounts,
  useRetryFailedSyncs,
  useTriggerChannexPush,
  getWeekDates,
  InventoryViewMode,
  VIEW_MODE_LABELS,
  InventoryCell,
} from "@/hooks/useInventory";
import { useCurrentChannexUser, useChannexUserProperties } from "@/hooks/useChannexUser";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BulkUpdateDialog } from "@/components/inventory/BulkUpdateDialog";
import { AvailabilityRulesDialog } from "@/components/inventory/AvailabilityRulesDialog";
import { InventoryLogsDialog } from "@/components/inventory/InventoryLogsDialog";
import { InventorySettingsDialog } from "@/components/inventory/InventorySettingsDialog";
import { InventoryGrid } from "@/components/inventory/InventoryGrid";
import { SyncStatusBanner } from "@/components/inventory/SyncStatusBanner";
import { DraftChangesBar } from "@/components/inventory/DraftChangesBar";
import { InventoryVersionBadge } from "@/components/inventory/InventoryVersionBadge";
import { InventoryAlertsBanner } from "@/components/inventory/InventoryAlertsBanner";
import { MultiUserConflictIndicator } from "@/components/inventory/MultiUserConflictIndicator";
import { SnapshotDialog } from "@/components/inventory/SnapshotDialog";

export default function InventoryPage() {
  const { user } = useAuth();
  
  // Individual restrictions that can be selected
  type RestrictionKey = 'availability_offset' | 'availability_per_rate' | 'cta' | 'ctd' | 'max_availability' | 'max_stay' | 'min_stay_arrival' | 'min_stay_through' | 'rate' | 'stop_sell';
  
  const INDIVIDUAL_RESTRICTIONS: { key: RestrictionKey; label: string }[] = [
    { key: 'availability_offset', label: 'Availability Offset' },
    { key: 'availability_per_rate', label: 'Availability Per Rate' },
    { key: 'cta', label: 'Closed To Arrival' },
    { key: 'ctd', label: 'Closed To Departure' },
    { key: 'max_availability', label: 'Max Availability' },
    { key: 'max_stay', label: 'Max Stay' },
    { key: 'min_stay_arrival', label: 'Min Stay Arrival' },
    { key: 'min_stay_through', label: 'Min Stay Through' },
    { key: 'rate', label: 'Rate' },
    { key: 'stop_sell', label: 'Stop Sell' },
  ];
  
  // State
  const [selectedRestrictions, setSelectedRestrictions] = useState<RestrictionKey[]>(['rate', 'availability_per_rate']);
  const [startDate, setStartDate] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [selectedRatePlans, setSelectedRatePlans] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [hasNewData, setHasNewData] = useState(false);
  
  // Compute viewMode from selectedRestrictions
  const viewMode: InventoryViewMode = useMemo(() => {
    if (selectedRestrictions.length === 0) return 'rate_and_availability';
    if (selectedRestrictions.length === INDIVIDUAL_RESTRICTIONS.length) return 'all_restrictions';
    if (selectedRestrictions.length === 1) {
      return selectedRestrictions[0] as InventoryViewMode;
    }
    // Check for presets
    const hasRate = selectedRestrictions.includes('rate');
    const hasAvlPerRate = selectedRestrictions.includes('availability_per_rate');
    if (hasRate && hasAvlPerRate && selectedRestrictions.length === 2) {
      return 'rate_and_availability';
    }
    if (hasAvlPerRate && selectedRestrictions.length === 1) {
      return 'only_availability';
    }
    // Custom selection - use all_restrictions mode
    return 'all_restrictions';
  }, [selectedRestrictions]);
  
  // Check which preset is currently active
  const isAllRestrictionsActive = selectedRestrictions.length === INDIVIDUAL_RESTRICTIONS.length;
  const isOnlyAvailabilityActive = selectedRestrictions.length === 1 && selectedRestrictions.includes('availability_per_rate');
  const isRateAndAvailabilityActive = selectedRestrictions.length === 2 && 
    selectedRestrictions.includes('rate') && 
    selectedRestrictions.includes('availability_per_rate');
  
  // Get display label for current selection
  const getSelectionLabel = () => {
    if (selectedRestrictions.length === 0) return 'Select restrictions';
    if (isAllRestrictionsActive) return 'All Restrictions';
    if (isRateAndAvailabilityActive) return 'Rate and Availability';
    if (isOnlyAvailabilityActive) return 'Only Availability';
    
    return `${selectedRestrictions.length} restrictions`;
  };
  
  // Toggle a single restriction
  const toggleRestriction = (key: RestrictionKey) => {
    setSelectedRestrictions(prev => 
      prev.includes(key) 
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };
  
  // Preset handlers
  const selectAllRestrictions = () => {
    setSelectedRestrictions(INDIVIDUAL_RESTRICTIONS.map(r => r.key));
  };
  
  const selectOnlyAvailability = () => {
    setSelectedRestrictions(['availability_per_rate']);
  };
  
  const selectRateAndAvailability = () => {
    setSelectedRestrictions(['rate', 'availability_per_rate']);
  };
  
  // Dialogs
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Draft state
  const { drafts, addDraft, clearDrafts, draftCount } = useInventoryDraft();
  
  // Get current Channex user and properties
  const { data: channexUser } = useCurrentChannexUser();
  const { data: properties } = useChannexUserProperties(channexUser?.channex_user_id);
  const [selectedChannexPropertyId, setSelectedChannexPropertyId] = useState<string>();
  
  // Lookup the actual property_id from channex_mappings
  const { data: mappingData } = useQuery({
    queryKey: ['channex_mapping_lookup', selectedChannexPropertyId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!selectedChannexPropertyId) return null;
       const { data, error } = await supabase
         .from('channex_mappings')
         .select('id, channex_property_id, property_name, created_at')
         .eq('channex_property_id', selectedChannexPropertyId)
         .order('created_at', { ascending: true })
         .limit(1);
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!selectedChannexPropertyId,
  });
  
  // This is the actual property_id stored in inventory_cells
  const selectedPropertyId = mappingData?.id;
  
  // Set first property as default
  useEffect(() => {
    if (properties && properties.length > 0 && !selectedChannexPropertyId) {
      setSelectedChannexPropertyId(properties[0].channex_property_id);
    }
  }, [properties, selectedChannexPropertyId]);
  
  // Get dates - 14 days default
  const weekDates = useMemo(() => getWeekDates(startDate, 14), [startDate]);
  const endDate = weekDates[weekDates.length - 1];
  
  // Data fetching - use channex_property_id for room_types and rate_plans
  const { data: channels = [], isLoading: channelsLoading } = useChannels();
  const { data: roomTypes = [], isLoading: roomTypesLoading } = useRoomTypes(selectedChannexPropertyId);
  const { data: allRatePlans = [], isLoading: ratePlansLoading } = useRatePlans(selectedChannexPropertyId);
  
  // Filter rate plans by selected channels (based on channel name in rate plan name)
  const ratePlans = useMemo(() => {
    if (selectedChannels.length === 0) return allRatePlans;
    
    return allRatePlans.filter(rp => {
      // Extract channel name from rate plan name (e.g., "Standard (Agoda)")
      const channelMatch = rp.rate_plan_name.match(/\(([^)]+)\)\s*$/);
      if (!channelMatch) return false;
      
      const channelName = channelMatch[1].toLowerCase();
      return selectedChannels.some(chId => {
        const channel = channels.find(c => c.id === chId);
        return channel && (
          channel.name.toLowerCase().includes(channelName) ||
          channelName.includes(channel.name.toLowerCase())
        );
      });
    });
  }, [allRatePlans, selectedChannels, channels]);
  
  // Use the mapped property_id for inventory_cells query
  const { data: inventoryCells = [], isLoading: cellsLoading, refetch: refetchCells } = useInventoryCells(
    selectedPropertyId,
    startDate,
    endDate,
    selectedRoomTypes.length > 0 ? selectedRoomTypes : undefined,
    undefined // Don't filter by channel_id in inventory_cells since it's not used
  );
  
  // Sync status
  const { data: syncCounts = { pending: 0, synced: 0, failed: 0 } } = useSyncStatusCounts(selectedPropertyId, startDate, endDate);
  const retryMutation = useRetryFailedSyncs();
  const bulkUpdateMutation = useBulkUpdateInventory();
  const triggerPush = useTriggerChannexPush();
  
  // Realtime subscription
  useEffect(() => {
    if (!selectedPropertyId) return;
    
    const channel = supabase
      .channel(`inventory_${selectedPropertyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_cells',
          filter: `property_id=eq.${selectedPropertyId}`,
        },
        () => {
          setHasNewData(true);
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedPropertyId]);
  
  // Navigation - 14 days
  const goToPrevWeek = () => setStartDate(prev => subDays(prev, 14));
  const goToNextWeek = () => setStartDate(prev => addDays(prev, 14));
  
  // Handle cell edit (local draft state)
  const handleCellEdit = useCallback((cellId: string, changes: Partial<InventoryCell>) => {
    const cell = inventoryCells.find(c => c.id === cellId);
    if (cell) {
      addDraft(cell.room_type_id, cell.rate_plan_id, cell.channel_id, cell.cell_date, changes, cell.version);
    }
  }, [inventoryCells, addDraft]);
  
  // Save all changes
  const saveChanges = async () => {
    if (draftCount === 0 || !selectedPropertyId) return;
    
    try {
      const draftArray = Array.from(drafts.values());
      const payloadHash = await hashPayload(draftArray);
      const deterministicKey = await generateIdempotencyKey(
        selectedPropertyId,
        `drafts_${draftArray.length}`,
        payloadHash
      );

      const result = await bulkUpdateMutation.mutateAsync({
        propertyId: selectedPropertyId,
        drafts: draftArray,
        idempotencyKey: deterministicKey,
        userId: user?.id,
      });
      
      if (result.failed_cells.length > 0) {
        toast.warning(`${result.updated_cells.length} cells updated, ${result.failed_cells.length} failed`);
      } else {
        toast.success(`${result.updated_cells.length} cells updated successfully`);
      }
      
      clearDrafts();
      refetchCells();

      // Trigger outbound push to Channex (fire and forget)
      if (result.updated_cells.length > 0) {
        triggerPush.mutate(selectedPropertyId);
      }
    } catch (error) {
      toast.error('Failed to save changes');
    }
  };
  
  // Reset changes
  const resetChanges = () => {
    clearDrafts();
  };
  
  // Retry failed syncs — also triggers push after resetting cells
  const handleRetryFailed = () => {
    if (selectedPropertyId) {
      retryMutation.mutate(selectedPropertyId, {
        onSuccess: () => {
          // After resetting to PENDING, trigger push to Channex
          triggerPush.mutate(selectedPropertyId);
        },
      });
    }
  };
  
  // Load new data
  const handleLoadNewData = () => {
    refetchCells();
    setHasNewData(false);
  };
  
  // Sync from Channex — FULL recovery sync (users, properties, room types, rate plans, inventory)
  const handleSyncFromChannex = async () => {
    if (!selectedChannexPropertyId) {
      toast.error('Vui lòng chọn property');
      return;
    }
    
    setIsSyncing(true);
    const toastId = toast.loading('Đang đồng bộ từ Channex...', {
      description: 'Users → Properties → Room Types → Rate Plans → Inventory',
    });

    try {
      const { data, error } = await supabase.functions.invoke('channex-full-sync', {
        body: { property_id: selectedChannexPropertyId }
      });
      
      if (error) throw error;
      
      if (data.success || data.status === 'PARTIAL') {
        const steps = (data.steps || []) as Array<{step: string; status: string; error?: string}>;
        const succeeded = steps.filter((s: {status: string}) => s.status === 'SUCCESS').length;
        const failed = steps.filter((s: {status: string}) => s.status === 'FAILED');
        
        if (failed.length > 0) {
          toast.warning(`Đồng bộ hoàn tất (${succeeded}/${steps.length} bước thành công)`, {
            id: toastId,
            description: `Lỗi: ${failed.map((f: {step: string}) => f.step).join(', ')}`,
            duration: 8000,
          });
        } else {
          toast.success(`Đã đồng bộ đầy đủ từ Channex (${data.duration_ms}ms)`, {
            id: toastId,
            description: 'Users, Properties, Room Types, Rate Plans, Inventory',
          });
        }
        // Refetch all local data
        refetchCells();
      } else {
        toast.error(data.error || 'Đồng bộ thất bại', { id: toastId });
      }
    } catch (error: any) {
      console.error('Full sync error:', error);
      toast.error(error.message || 'Không thể kết nối đến server', { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };
  
  const isLoading = channelsLoading || roomTypesLoading || ratePlansLoading || cellsLoading;
  
  return (
    <>
      <Header title="Quản lý tồn kho" subtitle="Inventory management" icon={Layers} />
      <PageContainer>
        <SectionCard>
      <div className="space-y-3 md:space-y-4">
        {/* Header - Responsive */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-xs md:text-sm text-muted-foreground hidden md:block">
                Quản lý giá, tồn kho và điều kiện bán
              </p>
            </div>
            <InventoryVersionBadge />
          </div>
          
          <div className="flex items-center gap-2">
            {/* Multi-user indicator */}
            <MultiUserConflictIndicator propertyId={selectedPropertyId} />
            
            {/* Property Selector */}
            {properties && properties.length > 1 && (
              <Select value={selectedChannexPropertyId || ""} onValueChange={setSelectedChannexPropertyId}>
                <SelectTrigger className="w-full md:w-[250px] h-9">
                  <SelectValue placeholder="Chọn property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map(p => (
                    <SelectItem key={p.channex_property_id} value={p.channex_property_id}>
                      {p.property_name || p.channex_property_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        
        {/* Alerts Banner */}
        <InventoryAlertsBanner propertyId={selectedPropertyId} />
        
        {/* New Data Banner */}
        {hasNewData && (
          <NewDataBanner
            count={1}
            message="Có dữ liệu mới từ hệ thống"
            onRefresh={handleLoadNewData}
          />
        )}
        
        {/* Sync Status Banner */}
        <SyncStatusBanner
          counts={syncCounts}
          isRetrying={retryMutation.isPending}
          onRetryFailed={handleRetryFailed}
        />
        
        {/* Control Bar - Mobile optimized */}
        <Card>
          <CardContent className="p-3 md:p-4">
            {/* Mobile: Date Nav on top */}
            <div className="md:hidden flex items-center justify-between gap-2 mb-3">
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={goToPrevWeek}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="flex-1 h-9 text-xs">
                    <CalendarIcon className="h-3 w-3 mr-1" />
                    {format(startDate, 'dd/MM', { locale: vi })} - {format(endDate, 'dd/MM', { locale: vi })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => date && setStartDate(startOfWeek(date, { weekStartsOn: 1 }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={goToNextWeek}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              
              {/* More Actions - Mobile */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleSyncFromChannex} disabled={isSyncing}>
                    {isSyncing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Đồng bộ Channex
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setBulkUpdateOpen(true)}>
                    <Layers className="h-4 w-4 mr-2" />
                    Bulk Update
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setRulesOpen(true)}>
                    <Settings className="h-4 w-4 mr-2" />
                    Availability Rules
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSnapshotOpen(true)}>
                    <History className="h-4 w-4 mr-2" />
                    Snapshots
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLogsOpen(true)}>
                    <History className="h-4 w-4 mr-2" />
                    Activity Logs
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            {/* Filters - Horizontal scroll on mobile */}
            <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 -mx-3 px-3 md:mx-0 md:px-0 md:flex-wrap scrollbar-hide">
              {/* Restrictions Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="flex-shrink-0 min-w-[140px] md:min-w-[200px] justify-between h-9">
                    <span className="text-xs md:text-sm truncate">{getSelectionLabel()}</span>
                    <ChevronDown className="h-4 w-4 ml-1 opacity-50 flex-shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 bg-background" align="start">
                  {/* Presets */}
                  <DropdownMenuItem 
                    onClick={selectAllRestrictions}
                    className={cn(
                      "cursor-pointer flex items-center justify-between",
                      isAllRestrictionsActive && "bg-accent"
                    )}
                  >
                    <span>All</span>
                    {isAllRestrictionsActive && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={selectOnlyAvailability}
                    className={cn(
                      "cursor-pointer flex items-center justify-between",
                      isOnlyAvailabilityActive && "bg-accent"
                    )}
                  >
                    <span>Availability</span>
                    {isOnlyAvailabilityActive && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={selectRateAndAvailability}
                    className={cn(
                      "cursor-pointer flex items-center justify-between",
                      isRateAndAvailabilityActive && "bg-accent"
                    )}
                  >
                    <span>Rate & Avl</span>
                    {isRateAndAvailabilityActive && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator />
                  
                  {/* Individual restrictions */}
                  <div className="p-1 max-h-[300px] overflow-y-auto">
                    {INDIVIDUAL_RESTRICTIONS.map(({ key, label }) => (
                      <label 
                        key={key} 
                        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-accent rounded-sm"
                      >
                        <Checkbox
                          checked={selectedRestrictions.includes(key)}
                          onCheckedChange={() => toggleRestriction(key)}
                        />
                        <span className="text-sm flex-1">{label}</span>
                      </label>
                    ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Room Type Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="flex-shrink-0 min-w-[90px] md:min-w-[120px] h-9">
                    <Layers className="h-4 w-4 mr-1" />
                    <span className="text-xs md:text-sm">Room{selectedRoomTypes.length > 0 && ` (${selectedRoomTypes.length})`}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <div className="p-2 space-y-2 max-h-[250px] overflow-y-auto">
                    {roomTypes.map(rt => (
                      <label key={rt.id} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={selectedRoomTypes.includes(rt.id)}
                          onCheckedChange={(checked) => {
                            setSelectedRoomTypes(prev =>
                              checked
                                ? [...prev, rt.id]
                                : prev.filter(id => id !== rt.id)
                            );
                          }}
                        />
                        <span className="text-sm truncate">{rt.room_type_name}</span>
                      </label>
                    ))}
                    {roomTypes.length === 0 && (
                      <p className="text-sm text-muted-foreground">No room types</p>
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Rates Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="flex-shrink-0 min-w-[90px] md:min-w-[120px] h-9">
                    <Tag className="h-4 w-4 mr-1" />
                    <span className="text-xs md:text-sm">Rate{selectedRatePlans.length > 0 && ` (${selectedRatePlans.length})`}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-72 max-h-[300px] overflow-y-auto">
                  <div className="p-2 space-y-2">
                    {ratePlans.map(rp => (
                      <label key={rp.id} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={selectedRatePlans.includes(rp.id)}
                          onCheckedChange={(checked) => {
                            setSelectedRatePlans(prev =>
                              checked
                                ? [...prev, rp.id]
                                : prev.filter(id => id !== rp.id)
                            );
                          }}
                        />
                        <span className="text-sm truncate">{rp.rate_plan_name}</span>
                      </label>
                    ))}
                    {ratePlans.length === 0 && (
                      <p className="text-sm text-muted-foreground">No rate plans</p>
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Channel Filter */}
              <TooltipProvider>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="flex-shrink-0 min-w-[100px] md:min-w-[140px] h-9">
                      <Link2 className="h-4 w-4 mr-1" />
                      <span className="text-xs md:text-sm">Ch{selectedChannels.length > 0 && ` (${selectedChannels.length})`}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-64 bg-background">
                    <div className="p-2 space-y-2 max-h-[250px] overflow-y-auto">
                      {channels.map(ch => {
                        const hasRatePlans = allRatePlans.some(rp => {
                          const match = rp.rate_plan_name.match(/\(([^)]+)\)\s*$/);
                          if (!match) return false;
                          const chName = match[1].toLowerCase();
                          return ch.name.toLowerCase().includes(chName) || chName.includes(ch.name.toLowerCase());
                        });
                        
                        return (
                          <label key={ch.id} className="flex items-center gap-2 cursor-pointer hover:bg-accent rounded px-1 py-0.5">
                            <Checkbox
                              checked={selectedChannels.includes(ch.id)}
                              onCheckedChange={(checked) => {
                                setSelectedChannels(prev =>
                                  checked
                                    ? [...prev, ch.id]
                                    : prev.filter(id => id !== ch.id)
                                );
                              }}
                            />
                            <span 
                              className="text-sm flex-1 truncate"
                              style={{ color: ch.color || undefined }}
                            >
                              {ch.name}
                            </span>
                            {hasRatePlans ? (
                              <Wifi className="h-3.5 w-3.5 text-success flex-shrink-0" />
                            ) : (
                              <WifiOff className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TooltipProvider>
              
              {/* Desktop: Date Navigation */}
              <div className="hidden md:flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={goToPrevWeek}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="min-w-[150px]">
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {format(startDate, 'dd MMM', { locale: vi })} - {format(endDate, 'dd MMM yyyy', { locale: vi })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={(date) => date && setStartDate(startOfWeek(date, { weekStartsOn: 1 }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                
                <Button variant="outline" size="icon" onClick={goToNextWeek}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="hidden md:block flex-1" />
              
              {/* Desktop: Sync Button */}
              <Button 
                variant="outline" 
                onClick={handleSyncFromChannex}
                disabled={isSyncing || !selectedChannexPropertyId}
                className="hidden md:flex"
              >
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ Channex'}
              </Button>
              
              {/* Desktop: More Actions */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="hidden md:flex">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setBulkUpdateOpen(true)}>
                    <Layers className="h-4 w-4 mr-2" />
                    Bulk Update
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setRulesOpen(true)}>
                    <Settings className="h-4 w-4 mr-2" />
                    Availability Rules
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSnapshotOpen(true)}>
                    <History className="h-4 w-4 mr-2" />
                    Snapshots (Audit)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLogsOpen(true)}>
                    <History className="h-4 w-4 mr-2" />
                    Activity Logs
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>
        
        {/* Inventory Grid */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <InventoryGrid
                weekDates={weekDates}
                roomTypes={roomTypes}
                ratePlans={selectedRatePlans.length > 0 
                  ? ratePlans.filter(rp => selectedRatePlans.includes(rp.id))
                  : ratePlans
                }
                channels={channels}
                cells={inventoryCells}
                viewMode={viewMode}
                selectedRestrictions={selectedRestrictions}
                draftChanges={drafts}
                onCellEdit={handleCellEdit}
                currentUserId={user?.id}
              />
            )}
          </CardContent>
        </Card>
      </div>
        </SectionCard>
      </PageContainer>
      
      {/* Draft Changes Bar */}
      <DraftChangesBar
        changesCount={draftCount}
        onSave={saveChanges}
        onReset={resetChanges}
        isSaving={bulkUpdateMutation.isPending}
      />
      
      {/* Dialogs */}
      <BulkUpdateDialog
        open={bulkUpdateOpen}
        onOpenChange={setBulkUpdateOpen}
        propertyId={selectedPropertyId}
        roomTypes={roomTypes}
        ratePlans={ratePlans}
        channels={channels}
      />
      
      <AvailabilityRulesDialog
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        propertyId={selectedPropertyId}
        roomTypes={roomTypes}
        channels={channels}
      />
      
      <InventoryLogsDialog
        open={logsOpen}
        onOpenChange={setLogsOpen}
        propertyId={selectedPropertyId}
      />
      
      <InventorySettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        propertyId={selectedPropertyId}
        roomTypes={roomTypes}
      />
      
      <SnapshotDialog
        open={snapshotOpen}
        onOpenChange={setSnapshotOpen}
        propertyId={selectedPropertyId}
      />
    </>
  );
}
