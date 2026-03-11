import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { 
  Loader2, Plus, Home, BedDouble, Trash2, 
  Search, Check, ChevronsUpDown, Building2
} from "lucide-react";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { toast } from "sonner";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { 
  useRoomTypeCatalog,
  RoomTypeCatalog,
} from "@/hooks/useCatalog";
import { createAuditLog } from "@/hooks/useAuditLog";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface Partner {
  id: string;
  partner_name: string;
  partner_type: string;
}

interface PropertyCatalog {
  id: string;
  property_name: string;
  property_code: string | null;
  property_type_id: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  property_type?: {
    code: string;
    name_vi: string;
  };
}

interface PartnerPropertyMapping {
  id: string;
  partner_id: string;
  property_id: string;
  role: string | null;
  is_active: boolean;
  property?: PropertyCatalog;
}

interface PartnerPropertyRoomType {
  id: string;
  partner_property_id: string;
  room_type_catalog_id: string;
  display_name_override: string | null;
  default_capacity: number | null;
  default_price: number | null;
  is_active: boolean;
  room_type?: RoomTypeCatalog;
}

// ============================================================================
// PROPS
// ============================================================================

interface PartnerPropertiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partner: Partner | null;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PartnerPropertiesDialog({
  open,
  onOpenChange,
  partner,
}: PartnerPropertiesDialogProps) {
  const queryClient = useQueryClient();
  
  // State
  const [selectedMapping, setSelectedMapping] = useState<PartnerPropertyMapping | null>(null);
  const [addPropertyOpen, setAddPropertyOpen] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [addRoomTypeOpen, setAddRoomTypeOpen] = useState(false);
  const [searchRoomType, setSearchRoomType] = useState("");
  
  // Fetch all properties from catalog for dropdown
  const { data: propertyCatalog = [], isLoading: loadingCatalog } = useQuery({
    queryKey: ["property-catalog-all"],
    staleTime: 60000, // 1 minute cache
    gcTime: 5 * 60 * 1000, // 5 minutes
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_catalog")
        .select(`
          id,
          property_name,
          property_code,
          property_type_id,
          address,
          district,
          city,
          property_type:property_type_catalog(code, name_vi)
        `)
        .eq("is_active", true)
        .order("property_name")
        .limit(200); // Limit for performance
      if (error) throw error;
      return (data || []) as PropertyCatalog[];
    },
    enabled: open,
  });
  
  // Fetch partner's property mappings
  const { data: partnerProperties = [], isLoading: loadingMappings, refetch: refetchMappings } = useQuery({
    queryKey: ["partner-property-mappings", partner?.id],
    staleTime: 30000, // 30 seconds cache
    queryFn: async () => {
      if (!partner?.id) return [];
      const { data, error } = await supabase
        .from("partner_property_mapping")
        .select(`
          id,
          partner_id,
          property_id,
          role,
          is_active,
          property:property_catalog(
            id,
            property_name,
            property_code,
            property_type_id,
            address,
            district,
            city,
            property_type:property_type_catalog(code, name_vi)
          )
        `)
        .eq("partner_id", partner.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PartnerPropertyMapping[];
    },
    enabled: open && !!partner?.id,
  });
  
  // Get selected property's type code for room type filtering
  const selectedPropertyTypeCode = selectedMapping?.property?.property_type?.code;
  
  // Fetch room types catalog (filtered by property type)
  const { data: roomTypeCatalog = [] } = useRoomTypeCatalog(selectedPropertyTypeCode);
  
  // Fetch room types for selected partner-property mapping (partner_property_room_types - mỗi host có room types riêng)
  const { data: partnerPropertyRoomTypes = [], refetch: refetchRoomTypes } = useQuery({
    queryKey: ["partner-property-room-types", selectedMapping?.id],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!selectedMapping?.id) return [];
      const { data, error } = await supabase
        .from("partner_property_room_types")
        .select(`
          id,
          partner_property_id,
          room_type_catalog_id,
          display_name_override,
          default_capacity,
          default_price,
          is_active,
          room_type:room_type_catalog(id, code, name_vi, name_en)
        `)
        .eq("partner_property_id", selectedMapping.id)
        .eq("is_active", true);
      if (error) throw error;
      return (data || []) as PartnerPropertyRoomType[];
    },
    enabled: !!selectedMapping?.id,
  });
  
  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedMapping(null);
      setSelectedPropertyId("");
      setSearchRoomType("");
    }
  }, [open]);
  
  // Memoize available properties to prevent recalculation
  const assignedPropertyIds = useMemo(() => 
    partnerProperties.map(pp => pp.property_id), 
    [partnerProperties]
  );
  
  const availableProperties = useMemo(() => 
    propertyCatalog.filter(p => !assignedPropertyIds.includes(p.id)),
    [propertyCatalog, assignedPropertyIds]
  );
  
  // ============================================================================
  // MUTATIONS
  // ============================================================================
  
  // Add property mapping (assign property to partner)
  const addPropertyMutation = useMutation({
    mutationFn: async (propertyId: string) => {
      if (!partner) throw new Error("No partner selected");
      
      const { error } = await safeMutation(() => supabase.from("partner_property_mapping").insert({
        partner_id: partner.id,
        property_id: propertyId,
        role: "MANAGER",
        is_active: true,
      }));
      if (error) throw error;
      
      const property = propertyCatalog.find(p => p.id === propertyId);
      await createAuditLog({
        action: "Gán chỗ nghỉ cho đối tác",
        entity: "partner_property_mapping",
        entityId: partner.id,
        afterData: { 
          partner_id: partner.id, 
          partner_name: partner.partner_name,
          property_id: propertyId,
          property_name: property?.property_name,
        },
      });
    },
    onSuccess: () => {
      toast.success("Đã thêm chỗ nghỉ cho đối tác");
      setAddPropertyOpen(false);
      setSelectedPropertyId("");
      refetchMappings();
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });
  
  // Remove property mapping
  const removePropertyMutation = useMutation({
    mutationFn: async (mappingId: string) => {
      const mapping = partnerProperties.find(pp => pp.id === mappingId);
      
      const { error } = await supabase
        .from("partner_property_mapping")
        .delete()
        .eq("id", mappingId);
      if (error) throw error;
      
      await createAuditLog({
        action: "Xóa chỗ nghỉ khỏi đối tác",
        entity: "partner_property_mapping",
        entityId: mappingId,
        beforeData: mapping,
      });
    },
    onSuccess: () => {
      toast.success("Đã xóa chỗ nghỉ khỏi đối tác");
      if (selectedMapping) setSelectedMapping(null);
      refetchMappings();
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });
  
  // Add room type to partner-property mapping (partner_property_room_types - mỗi host có room types riêng)
  const addRoomTypeMutation = useMutation({
    mutationFn: async (roomTypeCatalogId: string) => {
      if (!selectedMapping?.id) throw new Error("Chưa chọn chỗ nghỉ");
      
      const existingIds = partnerPropertyRoomTypes.map(prt => prt.room_type_catalog_id);
      if (existingIds.includes(roomTypeCatalogId)) {
        throw new Error("Loại phòng này đã được thêm");
      }
      
      const { error } = await safeMutation(() => supabase.from("partner_property_room_types").insert({
        partner_property_id: selectedMapping.id,
        room_type_catalog_id: roomTypeCatalogId,
        is_active: true,
      }));
      if (error) throw error;
      
      const roomType = roomTypeCatalog.find(rt => rt.id === roomTypeCatalogId);
      await createAuditLog({
        action: "Thêm loại phòng cho đối tác - chỗ nghỉ",
        entity: "partner_property_room_types",
        entityId: selectedMapping.id,
        afterData: { 
          partner_property_id: selectedMapping.id, 
          partner_name: partner?.partner_name,
          property_name: selectedMapping.property?.property_name,
          room_type_name: roomType?.name_vi,
        },
      });
    },
    onSuccess: () => {
      toast.success("Đã thêm loại phòng");
      setAddRoomTypeOpen(false);
      setSearchRoomType("");
      refetchRoomTypes();
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });
  
  // Remove room type from partner-property mapping (partner_property_room_types)
  const removeRoomTypeMutation = useMutation({
    mutationFn: async (mappingId: string) => {
      const mapping = partnerPropertyRoomTypes.find(prt => prt.id === mappingId);
      
      const { error } = await supabase
        .from("partner_property_room_types")
        .delete()
        .eq("id", mappingId);
      if (error) throw error;
      
      await createAuditLog({
        action: "Xóa loại phòng khỏi đối tác - chỗ nghỉ",
        entity: "partner_property_room_types",
        entityId: mappingId,
        beforeData: mapping,
      });
    },
    onSuccess: () => {
      toast.success("Đã xóa loại phòng");
      refetchRoomTypes();
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });
  
  // Filter room types not yet added
  const existingRoomTypeIds = partnerPropertyRoomTypes.map(prt => prt.room_type_catalog_id);
  const availableRoomTypes = roomTypeCatalog.filter(rt => !existingRoomTypeIds.includes(rt.id));
  const filteredRoomTypes = availableRoomTypes.filter(rt => 
    rt.name_vi.toLowerCase().includes(searchRoomType.toLowerCase()) ||
    rt.code.toLowerCase().includes(searchRoomType.toLowerCase())
  );
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Home className="h-5 w-5" />
            Chỗ nghỉ & Loại phòng - {partner?.partner_name}
          </DialogTitle>
          <DialogDescription>
            Gán chỗ nghỉ từ danh mục chung và quản lý loại phòng cho đối tác này
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-6 h-[60vh]">
          {/* Left: Properties List */}
          <div className="flex flex-col h-full min-h-0">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <h3 className="font-semibold text-sm">Chỗ nghỉ</h3>
              
              {/* Add Property Dropdown */}
              <Popover open={addPropertyOpen} onOpenChange={setAddPropertyOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <Plus className="h-4 w-4" />
                    Thêm
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[350px] p-0" align="end">
                  <Command>
                    <CommandInput placeholder="Tìm chỗ nghỉ..." />
                    <CommandList className="max-h-[300px] overflow-auto">
                      <CommandEmpty>
                        {loadingCatalog ? "Đang tải..." : "Không tìm thấy chỗ nghỉ"}
                      </CommandEmpty>
                      <CommandGroup heading="Chọn từ danh mục">
                        {availableProperties.map((property) => (
                          <CommandItem
                            key={property.id}
                            value={property.property_name}
                            onSelect={() => {
                              addPropertyMutation.mutate(property.id);
                            }}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{property.property_name}</div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {[property.district, property.city].filter(Boolean).join(", ")}
                                </div>
                              </div>
                              {property.property_code && (
                                <code className="text-xs bg-muted px-1 rounded shrink-0">
                                  {property.property_code}
                                </code>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            
            {/* Properties List */}
            <div className="flex-1 overflow-y-auto border rounded-lg min-h-0">
              {loadingMappings ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : partnerProperties.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <Building2 className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">Chưa có chỗ nghỉ</p>
                  <p className="text-xs">Nhấn "Thêm" để gán chỗ nghỉ</p>
                </div>
              ) : (
                <div className="divide-y">
                  {partnerProperties.map((mapping) => (
                    <div
                      key={mapping.id}
                      className={cn(
                        "p-3 cursor-pointer hover:bg-muted transition-colors",
                        selectedMapping?.id === mapping.id && "bg-info/10 border-l-2 border-l-blue-500"
                      )}
                      onClick={() => setSelectedMapping(mapping)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Home className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium text-sm">
                              {mapping.property?.property_name}
                            </div>
                            {mapping.property?.property_type && (
                              <StatusBadge variant="info" className="text-xs mt-1">
                                {mapping.property.property_type.name_vi}
                              </StatusBadge>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            removePropertyMutation.mutate(mapping.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Right: Room Types for Selected Property */}
          <div className="flex flex-col h-full min-h-0">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <h3 className="font-semibold text-sm">
                Loại phòng {selectedMapping?.property?.property_name && `- ${selectedMapping.property.property_name}`}
              </h3>
              
              {selectedMapping && (
                <Popover open={addRoomTypeOpen} onOpenChange={setAddRoomTypeOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1">
                      <Plus className="h-4 w-4" />
                      Thêm
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="end">
                    <Command>
                      <CommandInput 
                        placeholder="Tìm loại phòng..." 
                        value={searchRoomType}
                        onValueChange={setSearchRoomType}
                      />
                      <CommandList className="max-h-[300px] overflow-auto">
                        <CommandEmpty>Không tìm thấy loại phòng</CommandEmpty>
                        <CommandGroup heading="Chọn từ catalog">
                          {filteredRoomTypes.map((roomType) => (
                            <CommandItem
                              key={roomType.id}
                              value={roomType.name_vi}
                              onSelect={() => {
                                addRoomTypeMutation.mutate(roomType.id);
                              }}
                            >
                              <BedDouble className="h-4 w-4 mr-2 text-muted-foreground" />
                              <span>{roomType.name_vi}</span>
                              <code className="ml-auto text-xs text-muted-foreground">
                                {roomType.code}
                              </code>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            
            {/* Room Types List */}
            <div className="flex-1 overflow-y-auto border rounded-lg min-h-0">
              {!selectedMapping ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <BedDouble className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">Chọn chỗ nghỉ bên trái</p>
                  <p className="text-xs">để xem và thêm loại phòng</p>
                </div>
              ) : partnerPropertyRoomTypes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <BedDouble className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">Chưa có loại phòng</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2"
                    onClick={() => setAddRoomTypeOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Thêm loại phòng
                  </Button>
                </div>
              ) : (
                <div className="divide-y">
                  {partnerPropertyRoomTypes.map((mapping) => (
                    <div
                      key={mapping.id}
                      className="p-3 flex items-center justify-between hover:bg-muted"
                    >
                      <div className="flex items-center gap-2">
                        <BedDouble className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium text-sm">
                            {mapping.room_type?.name_vi}
                          </div>
                          <code className="text-xs text-muted-foreground">
                            {mapping.room_type?.code}
                          </code>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => removeRoomTypeMutation.mutate(mapping.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Footer Note */}
        <div className="mt-4 p-3 bg-warning/10 rounded-lg border border-warning/20">
          <p className="text-xs text-warning">
            <strong>💡 Lưu ý:</strong> Chỗ nghỉ được chọn từ danh mục chung (Settings → Danh mục Chỗ nghỉ). 
            Nhiều đối tác có thể cùng quản lý một chỗ nghỉ. Loại phòng được chọn từ catalog chuẩn.
          </p>
        </div>
        
        {/* Close button */}
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
