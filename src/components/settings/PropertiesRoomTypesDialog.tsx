import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { 
  Loader2, Plus, Home, BedDouble, Pencil, Trash2, 
  AlertTriangle, Search, Check 
} from "lucide-react";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { toast } from "sonner";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { 
  usePropertyTypeCatalog, 
  useRoomTypeCatalog,
  usePropertyRoomTypes,
  getRoomTypeDisplayName,
  PropertyTypeCatalog,
  RoomTypeCatalog,
} from "@/hooks/useCatalog";
import { createAuditLog } from "@/hooks/useAuditLog";

// ============================================================================
// TYPES
// ============================================================================

interface Partner {
  id: string;
  partner_name: string;
  partner_type: string;
}

interface HostProperty {
  id: string;
  partner_id: string;
  host_property_name: string;
  property_type_id: string | null;
  address: string | null;
  status: string | null;
  property_type?: PropertyTypeCatalog;
}

// ============================================================================
// PROPS
// ============================================================================

interface PropertiesRoomTypesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partner: Partner | null;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PropertiesRoomTypesDialog({
  open,
  onOpenChange,
  partner,
}: PropertiesRoomTypesDialogProps) {
  const queryClient = useQueryClient();
  
  // State
  const [selectedProperty, setSelectedProperty] = useState<HostProperty | null>(null);
  const [addPropertyDialogOpen, setAddPropertyDialogOpen] = useState(false);
  const [addRoomTypeDialogOpen, setAddRoomTypeDialogOpen] = useState(false);
  const [searchRoomType, setSearchRoomType] = useState("");
  
  // Property form state
  const [propertyForm, setPropertyForm] = useState({
    host_property_name: "",
    property_type_id: "",
    address: "",
  });
  
  // Edit property state
  const [editPropertyDialogOpen, setEditPropertyDialogOpen] = useState(false);
  const [editPropertyForm, setEditPropertyForm] = useState({
    id: "",
    host_property_name: "",
    property_type_id: "",
    address: "",
  });
  
  // Delete confirmation state
  const [deletePropertyDialogOpen, setDeletePropertyDialogOpen] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<HostProperty | null>(null);
  const [deleteRoomTypeDialogOpen, setDeleteRoomTypeDialogOpen] = useState(false);
  const [roomTypeToDeleteId, setRoomTypeToDeleteId] = useState<string | null>(null);
  
  // Catalog data
  const { data: propertyTypeCatalog = [] } = usePropertyTypeCatalog();
  
  // Get property type code for selected property (to filter room types)
  const selectedPropertyTypeCode = selectedProperty?.property_type_id 
    ? propertyTypeCatalog.find(pt => pt.id === selectedProperty.property_type_id)?.code 
    : undefined;
  
  const { data: roomTypeCatalog = [] } = useRoomTypeCatalog(selectedPropertyTypeCode);
  const { data: propertyRoomTypes = [], refetch: refetchPropertyRoomTypes } = usePropertyRoomTypes(selectedProperty?.id || null);
  
  // Fetch properties for this partner
  const { data: properties = [], isLoading: loadingProperties, refetch: refetchProperties } = useQuery({
    queryKey: ["host-properties-dialog", partner?.id],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!partner?.id) return [];
      const { data, error } = await (supabase
        .from("host_properties" as any)
        .select(`
          id,
          partner_id,
          host_property_name,
          property_type_id,
          address,
          status,
          property_type:property_type_catalog(id, code, name_vi, name_en, sort_order)
        `)
        .eq("partner_id", partner.id)
        .order("host_property_name") as any);
      if (error) throw error;
      return (data || []) as unknown as HostProperty[];
    },
    enabled: open && !!partner?.id,
  });
  
  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedProperty(null);
      setPropertyForm({ host_property_name: "", property_type_id: "", address: "" });
      setSearchRoomType("");
    }
  }, [open]);
  
  // ============================================================================
  // MUTATIONS
  // ============================================================================
  
  // Add property
  const addPropertyMutation = useMutation({
    mutationFn: async (data: typeof propertyForm) => {
      if (!partner) throw new Error("No partner selected");
      
      const { error } = await safeMutation(() => supabase.from("host_properties").insert({
        partner_id: partner.id,
        host_property_name: data.host_property_name,
        property_type_id: data.property_type_id || null,
        address: data.address || null,
      }));
      if (error) throw error;
      
      // Audit log
      await createAuditLog({
        action: "Tạo chỗ nghỉ",
        entity: "host_properties",
        entityId: partner.id,
        afterData: { ...data, partner_id: partner.id },
      });
    },
    onSuccess: () => {
      toast.success("Đã thêm chỗ nghỉ mới");
      setAddPropertyDialogOpen(false);
      setPropertyForm({ host_property_name: "", property_type_id: "", address: "" });
      refetchProperties();
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });
  
  // Update property
  const updatePropertyMutation = useMutation({
    mutationFn: async (data: typeof editPropertyForm) => {
      // Get current data for audit
      const { data: currentData } = await supabase
        .from("host_properties")
        .select("*")
        .eq("id", data.id)
        .single();
      
      const { error } = await supabase
        .from("host_properties")
        .update({
          host_property_name: data.host_property_name,
          property_type_id: data.property_type_id || null,
          address: data.address || null,
        })
        .eq("id", data.id);
      if (error) throw error;
      
      // Audit log
      await createAuditLog({
        action: "Cập nhật chỗ nghỉ",
        entity: "host_properties",
        entityId: data.id,
        beforeData: currentData,
        afterData: data,
      });
    },
    onSuccess: () => {
      toast.success("Đã cập nhật chỗ nghỉ");
      setEditPropertyDialogOpen(false);
      refetchProperties();
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });
  
  // Delete property (with reference check)
  const deletePropertyMutation = useMutation({
    mutationFn: async (propertyId: string) => {
      // Check for references in segments
      const { data: refs } = await supabase
        .from("host_supply_segments")
        .select("id")
        .eq("host_property_name", propertyToDelete?.host_property_name)
        .limit(1);
      
      if (refs && refs.length > 0) {
        throw new Error(`Không thể xóa chỗ nghỉ "${propertyToDelete?.host_property_name}" vì đang được sử dụng trong các booking. Vui lòng vô hiệu hóa thay vì xóa.`);
      }
      
      const { error } = await supabase
        .from("host_properties")
        .delete()
        .eq("id", propertyId);
      if (error) throw error;
      
      // Audit log
      await createAuditLog({
        action: "Xóa chỗ nghỉ",
        entity: "host_properties",
        entityId: propertyId,
        beforeData: propertyToDelete,
      });
    },
    onSuccess: () => {
      toast.success("Đã xóa chỗ nghỉ");
      setDeletePropertyDialogOpen(false);
      setPropertyToDelete(null);
      setSelectedProperty(null);
      refetchProperties();
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });
  
  // Add room type mapping
  const addRoomTypeMutation = useMutation({
    mutationFn: async (roomTypeCatalogId: string) => {
      if (!selectedProperty) throw new Error("No property selected");
      
      // Check for duplicate
      const existingIds = propertyRoomTypes.map(prt => prt.room_type_catalog_id);
      if (existingIds.includes(roomTypeCatalogId)) {
        throw new Error("Loại phòng này đã được thêm cho chỗ nghỉ này");
      }
      
      const { error } = await (safeMutation(() => supabase.from("property_room_types" as any).insert({
        property_id: selectedProperty.id,
        room_type_catalog_id: roomTypeCatalogId,
      }) as any));
      if (error) throw error;
      
      // Audit log
      const roomType = roomTypeCatalog.find(rt => rt.id === roomTypeCatalogId);
      await createAuditLog({
        action: "Thêm loại phòng cho chỗ nghỉ",
        entity: "property_room_types",
        entityId: selectedProperty.id,
        afterData: { 
          property_id: selectedProperty.id, 
          room_type_catalog_id: roomTypeCatalogId,
          room_type_name: roomType?.name_vi,
        },
      });
    },
    onSuccess: () => {
      toast.success("Đã thêm loại phòng");
      setSearchRoomType("");
      refetchPropertyRoomTypes();
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });
  
  // Remove room type mapping
  const removeRoomTypeMutation = useMutation({
    mutationFn: async (mappingId: string) => {
      // Check for references in segments
      const mapping = propertyRoomTypes.find(prt => prt.id === mappingId);
      const roomTypeName = mapping?.room_type?.name_vi;
      
      if (roomTypeName) {
        const { data: refs } = await supabase
          .from("host_supply_segments")
          .select("id")
          .eq("host_property_name", selectedProperty?.host_property_name)
          .eq("host_room_type", roomTypeName)
          .limit(1);
        
        if (refs && refs.length > 0) {
          throw new Error(`Không thể xóa loại phòng "${roomTypeName}" vì đang được sử dụng trong các booking.`);
        }
      }
      
      const { error } = await (supabase
        .from("property_room_types" as any)
        .delete()
        .eq("id", mappingId) as any);
      if (error) throw error;
      
      // Audit log
      await createAuditLog({
        action: "Xóa loại phòng khỏi chỗ nghỉ",
        entity: "property_room_types",
        entityId: mappingId,
        beforeData: mapping,
      });
    },
    onSuccess: () => {
      toast.success("Đã xóa loại phòng");
      setDeleteRoomTypeDialogOpen(false);
      setRoomTypeToDeleteId(null);
      refetchPropertyRoomTypes();
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });
  
  // ============================================================================
  // HANDLERS
  // ============================================================================
  
  const handleSelectProperty = (property: HostProperty) => {
    setSelectedProperty(property);
  };
  
  const handleOpenEditProperty = (property: HostProperty, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditPropertyForm({
      id: property.id,
      host_property_name: property.host_property_name,
      property_type_id: property.property_type_id || "",
      address: property.address || "",
    });
    setEditPropertyDialogOpen(true);
  };
  
  const handleOpenDeleteProperty = (property: HostProperty, e: React.MouseEvent) => {
    e.stopPropagation();
    setPropertyToDelete(property);
    setDeletePropertyDialogOpen(true);
  };
  
  // Filter available room types (not yet added to property)
  const availableRoomTypes = roomTypeCatalog.filter(rt => {
    const alreadyAdded = propertyRoomTypes.some(prt => prt.room_type_catalog_id === rt.id);
    const matchesSearch = rt.name_vi.toLowerCase().includes(searchRoomType.toLowerCase()) ||
                          rt.code.toLowerCase().includes(searchRoomType.toLowerCase());
    return !alreadyAdded && matchesSearch;
  });
  
  // ============================================================================
  // RENDER
  // ============================================================================
  
  return (
    <>
      {/* Main Dialog */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Home className="h-5 w-5" />
              Chỗ nghỉ & Loại phòng - {partner?.partner_name}
            </DialogTitle>
            <DialogDescription>
              Quản lý danh mục chỗ nghỉ và loại phòng từ catalog chuẩn.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-6">
            {/* Properties Column */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Chỗ nghỉ</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddPropertyDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Thêm
                </Button>
              </div>
              
              {loadingProperties ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : properties.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                  <Home className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Chưa có chỗ nghỉ</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {properties.map((property) => (
                    <div
                      key={property.id}
                      onClick={() => handleSelectProperty(property)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedProperty?.id === property.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Home className="h-4 w-4 text-primary" />
                            <span className="font-medium">{property.host_property_name}</span>
                          </div>
                          {property.property_type && (
                            <StatusBadge variant="info" size="sm">
                              {property.property_type.name_vi}
                            </StatusBadge>
                          )}
                          {property.address && (
                            <p className="text-xs text-muted-foreground">{property.address}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => handleOpenEditProperty(property, e)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={(e) => handleOpenDeleteProperty(property, e)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Room Types Column */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">
                  Loại phòng
                  {selectedProperty && (
                    <span className="text-muted-foreground font-normal ml-1">
                      - {selectedProperty.host_property_name}
                    </span>
                  )}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddRoomTypeDialogOpen(true)}
                  disabled={!selectedProperty}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Thêm
                </Button>
              </div>
              
              {!selectedProperty ? (
                <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                  <BedDouble className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Chọn chỗ nghỉ để xem loại phòng</p>
                </div>
              ) : propertyRoomTypes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                  <BedDouble className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Chưa có loại phòng</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => setAddRoomTypeDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Thêm loại phòng
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {propertyRoomTypes.map((mapping) => (
                    <div
                      key={mapping.id}
                      className="p-3 rounded-lg border border-border"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <BedDouble className="h-4 w-4 text-primary" />
                          <span>{getRoomTypeDisplayName(mapping)}</span>
                          {mapping.room_type && (
                            <span className="text-xs text-muted-foreground">
                              ({mapping.room_type.code})
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => {
                            setRoomTypeToDeleteId(mapping.id);
                            setDeleteRoomTypeDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">
              💡 <strong>Lưu ý:</strong> Loại phòng được chọn từ catalog chuẩn. Mã phòng vật lý và đơn giá 
              sẽ được nhập khi tạo booking, lưu dưới dạng snapshot theo từng booking.
            </p>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Add Property Dialog */}
      <Dialog open={addPropertyDialogOpen} onOpenChange={setAddPropertyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm chỗ nghỉ mới</DialogTitle>
            <DialogDescription>
              Thêm chỗ nghỉ cho {partner?.partner_name}
            </DialogDescription>
          </DialogHeader>
          
          <form 
            onSubmit={(e) => { 
              e.preventDefault(); 
              addPropertyMutation.mutate(propertyForm); 
            }} 
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Tên chỗ nghỉ *</Label>
              <Input
                value={propertyForm.host_property_name}
                onChange={(e) => setPropertyForm({ ...propertyForm, host_property_name: e.target.value })}
                placeholder="VD: Căn hộ A, Villa Biển Xanh..."
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label>Loại hình chỗ nghỉ *</Label>
              <Select
                value={propertyForm.property_type_id}
                onValueChange={(v) => setPropertyForm({ ...propertyForm, property_type_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn loại hình..." />
                </SelectTrigger>
                <SelectContent>
                  {propertyTypeCatalog.map((pt) => (
                    <SelectItem key={pt.id} value={pt.id}>
                      {pt.name_vi}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Địa chỉ (tùy chọn)</Label>
              <Textarea
                value={propertyForm.address}
                onChange={(e) => setPropertyForm({ ...propertyForm, address: e.target.value })}
                placeholder="Số nhà, đường, quận/huyện..."
                rows={2}
              />
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddPropertyDialogOpen(false)}>
                Huỷ
              </Button>
              <Button type="submit" disabled={addPropertyMutation.isPending || !propertyForm.property_type_id}>
                {addPropertyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Thêm chỗ nghỉ
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* Edit Property Dialog */}
      <Dialog open={editPropertyDialogOpen} onOpenChange={setEditPropertyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chỉnh sửa chỗ nghỉ</DialogTitle>
          </DialogHeader>
          
          <form 
            onSubmit={(e) => { 
              e.preventDefault(); 
              updatePropertyMutation.mutate(editPropertyForm); 
            }} 
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Tên chỗ nghỉ *</Label>
              <Input
                value={editPropertyForm.host_property_name}
                onChange={(e) => setEditPropertyForm({ ...editPropertyForm, host_property_name: e.target.value })}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label>Loại hình chỗ nghỉ</Label>
              <Select
                value={editPropertyForm.property_type_id}
                onValueChange={(v) => setEditPropertyForm({ ...editPropertyForm, property_type_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn loại hình..." />
                </SelectTrigger>
                <SelectContent>
                  {propertyTypeCatalog.map((pt) => (
                    <SelectItem key={pt.id} value={pt.id}>
                      {pt.name_vi}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Địa chỉ</Label>
              <Textarea
                value={editPropertyForm.address}
                onChange={(e) => setEditPropertyForm({ ...editPropertyForm, address: e.target.value })}
                rows={2}
              />
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditPropertyDialogOpen(false)}>
                Huỷ
              </Button>
              <Button type="submit" disabled={updatePropertyMutation.isPending}>
                {updatePropertyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Lưu
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* Delete Property Confirmation */}
      <Dialog open={deletePropertyDialogOpen} onOpenChange={setDeletePropertyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Xác nhận xóa chỗ nghỉ
            </DialogTitle>
            <DialogDescription>
              Bạn có chắc muốn xóa chỗ nghỉ "{propertyToDelete?.host_property_name}"?
            </DialogDescription>
          </DialogHeader>
          
          <Alert variant="destructive">
            <AlertDescription>
              Nếu chỗ nghỉ này đang được sử dụng trong các booking, bạn sẽ không thể xóa.
              Trong trường hợp đó, hãy vô hiệu hóa (set status = inactive) thay vì xóa.
            </AlertDescription>
          </Alert>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePropertyDialogOpen(false)}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              onClick={() => propertyToDelete && deletePropertyMutation.mutate(propertyToDelete.id)}
              disabled={deletePropertyMutation.isPending}
            >
              {deletePropertyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Add Room Type Dialog - Searchable Dropdown */}
      <Dialog open={addRoomTypeDialogOpen} onOpenChange={setAddRoomTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm loại phòng</DialogTitle>
            <DialogDescription>
              Chọn loại phòng từ catalog cho {selectedProperty?.host_property_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchRoomType}
                onChange={(e) => setSearchRoomType(e.target.value)}
                placeholder="Tìm loại phòng..."
                className="pl-10"
              />
            </div>
            
            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {availableRoomTypes.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <p className="text-sm">
                    {searchRoomType 
                      ? "Không tìm thấy loại phòng phù hợp" 
                      : "Tất cả loại phòng đã được thêm"}
                  </p>
                </div>
              ) : (
                availableRoomTypes.map((rt) => (
                  <div
                    key={rt.id}
                    onClick={() => addRoomTypeMutation.mutate(rt.id)}
                    className="p-3 rounded-lg border border-border hover:border-primary cursor-pointer transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <BedDouble className="h-4 w-4 text-primary" />
                      <span>{rt.name_vi}</span>
                      <span className="text-xs text-muted-foreground">({rt.code})</span>
                    </div>
                    <Plus className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))
              )}
            </div>
            
            {addRoomTypeMutation.isPending && (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRoomTypeDialogOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Room Type Confirmation */}
      <Dialog open={deleteRoomTypeDialogOpen} onOpenChange={setDeleteRoomTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận xóa loại phòng</DialogTitle>
            <DialogDescription>
              Bạn có chắc muốn xóa loại phòng này khỏi chỗ nghỉ?
            </DialogDescription>
          </DialogHeader>
          
          <Alert>
            <AlertDescription>
              Nếu loại phòng này đang được sử dụng trong các booking, bạn sẽ không thể xóa.
            </AlertDescription>
          </Alert>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRoomTypeDialogOpen(false)}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              onClick={() => roomTypeToDeleteId && removeRoomTypeMutation.mutate(roomTypeToDeleteId)}
              disabled={removeRoomTypeMutation.isPending}
            >
              {removeRoomTypeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
