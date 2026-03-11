import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar } from "@/components/ui/filter-bar";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VNAddressCascade, VNAddressDisplay, type VNAddressValue } from "@/components/ui/VNAddressCascade";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search,
  Plus,
  Building2,
  MoreHorizontal,
  Pencil,
  Trash2,
  MapPin,
  Home,
  Users,
  Loader2,
  BedDouble,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePropertyTypeCatalog } from "@/hooks/useCatalog";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { useTablePagination } from "@/hooks/useTablePagination";

// ============================================================================
// TYPES
// ============================================================================

interface PropertyCatalog {
  id: string;
  property_name: string;
  property_code: string | null;
  property_type_id: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  // New VN address fields
  province_code: string | null;
  district_code: string | null;
  ward_code: string | null;
  province_name_snapshot: string | null;
  district_name_snapshot: string | null;
  ward_name_snapshot: string | null;
  full_address: string | null;
  description: string | null;
  total_units: number | null;
  is_active: boolean;
  created_at: string;
  property_type?: {
    code: string;
    name_vi: string;
  };
}

interface PropertyFormData {
  property_name: string;
  property_code: string;
  property_type_id: string;
  // VN Address cascade
  vnAddress: VNAddressValue;
  // Legacy text fields (kept for backward compat)
  address: string;
  district: string;
  city: string;
  description: string;
  total_units: string;
}

const initialVNAddress: VNAddressValue = {
  provinceCode: null,
  districtCode: null,
  wardCode: null,
  streetAddress: null,
  provinceNameSnapshot: null,
  districtNameSnapshot: null,
  wardNameSnapshot: null,
};

const initialFormData: PropertyFormData = {
  property_name: "",
  property_code: "",
  property_type_id: "",
  vnAddress: initialVNAddress,
  address: "",
  district: "",
  city: "Hồ Chí Minh",
  description: "",
  total_units: "",
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function PropertyCatalogPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<PropertyCatalog | null>(null);
  const [formData, setFormData] = useState<PropertyFormData>(initialFormData);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<PropertyCatalog | null>(null);

  const queryClient = useQueryClient();

  // Fetch property types for dropdown
  const { data: propertyTypes = [] } = usePropertyTypeCatalog();

  // Fetch all properties
  const { data: properties = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["property-catalog"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("property_catalog")
          .select(`
            *,
            property_type:property_type_catalog(code, name_vi)
          `)
          .order("property_name", { ascending: true });

        if (error) {
          console.warn("property_catalog table not found:", error.message);
          return [] as PropertyCatalog[];
        }
        return (data || []) as unknown as PropertyCatalog[];
      } catch (e) {
        console.warn("Error fetching properties:", e);
        return [] as PropertyCatalog[];
      }
    },
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: PropertyFormData & { id?: string }) => {
      const payload = {
        property_name: data.property_name,
        property_code: data.property_code || null,
        property_type_id: data.property_type_id || null,
        // VN Address cascade fields
        province_code: data.vnAddress.provinceCode || null,
        district_code: data.vnAddress.districtCode || null,
        ward_code: data.vnAddress.wardCode || null,
        province_name_snapshot: data.vnAddress.provinceNameSnapshot || null,
        district_name_snapshot: data.vnAddress.districtNameSnapshot || null,
        ward_name_snapshot: data.vnAddress.wardNameSnapshot || null,
        // Build full_address from parts
        full_address: [
          data.vnAddress.streetAddress,
          data.vnAddress.wardNameSnapshot,
          data.vnAddress.districtNameSnapshot,
          data.vnAddress.provinceNameSnapshot,
        ].filter(Boolean).join(', ') || null,
        // Legacy fields - fallback if VN address not used
        address: data.vnAddress.streetAddress || data.address || null,
        district: data.vnAddress.districtNameSnapshot || data.district || null,
        city: data.vnAddress.provinceNameSnapshot || data.city || null,
        description: data.description || null,
        total_units: data.total_units ? parseInt(data.total_units) : null,
      };

      if (data.id) {
        const { error } = await supabase
          .from("property_catalog")
          .update(payload)
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("property_catalog")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Thành công", { description: editingProperty ? "Đã cập nhật chỗ nghỉ" : "Đã thêm chỗ nghỉ mới" });
      handleCloseDialog();
      queryClient.invalidateQueries({ queryKey: ["property-catalog"] });
    },
    onError: (err: any) => {
      toast.error("Lỗi", { description: err.message });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("property_catalog")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Thành công", { description: "Đã xóa chỗ nghỉ" });
      setDeleteDialogOpen(false);
      setPropertyToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["property-catalog"] });
    },
    onError: (err: any) => {
      toast.error("Lỗi", {
        description: err.message.includes("referenced")
          ? "Không thể xóa - chỗ nghỉ đang được sử dụng bởi đối tác hoặc booking"
          : err.message,
      });
    },
  });

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingProperty(null);
    setFormData(initialFormData);
  };

  const handleEdit = (property: PropertyCatalog) => {
    setEditingProperty(property);
    setFormData({
      property_name: property.property_name,
      property_code: property.property_code || "",
      property_type_id: property.property_type_id || "",
      vnAddress: {
        provinceCode: property.province_code,
        districtCode: property.district_code,
        wardCode: property.ward_code,
        streetAddress: property.address,
        provinceNameSnapshot: property.province_name_snapshot,
        districtNameSnapshot: property.district_name_snapshot,
        wardNameSnapshot: property.ward_name_snapshot,
      },
      address: property.address || "",
      district: property.district || "",
      city: property.city || "Hồ Chí Minh",
      description: property.description || "",
      total_units: property.total_units?.toString() || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      ...formData,
      id: editingProperty?.id,
    });
  };

  // Get unique cities for filter
  const cities = [...new Set(properties.map(p => p.city).filter(Boolean))];

  // Filter properties
  const filteredProperties = properties.filter((property) => {
    const matchesSearch =
      property.property_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.property_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.district?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCity = cityFilter === "all" || property.city === cityFilter;

    return matchesSearch && matchesCity;
  });

  const { page, pageSize, setPage, setPageSize, paginatedData, totalPages, displayedCount, totalCount } =
    useTablePagination(filteredProperties, { defaultPageSize: 10, resetDeps: [searchTerm, cityFilter] });

  return (
    <>
      <Header
        title="Danh mục Chỗ nghỉ"
        subtitle="Quản lý danh sách chỗ nghỉ chung (tòa nhà, dự án) - không phụ thuộc đối tác"
        actions={
          <div className="flex items-center gap-2">
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              if (!open) handleCloseDialog();
              else setIsDialogOpen(true);
            }}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Thêm chỗ nghỉ
                </Button>
              </DialogTrigger>
              <DialogContent size="2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingProperty ? "Chỉnh sửa chỗ nghỉ" : "Thêm chỗ nghỉ mới"}
                  </DialogTitle>
                  <DialogDescription>
                    Chỗ nghỉ trong danh mục này có thể được gán cho nhiều đối tác khác nhau
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="property_name">Tên chỗ nghỉ *</Label>
                      <Input
                        id="property_name"
                        placeholder="VD: Landmark 81"
                        value={formData.property_name}
                        onChange={(e) =>
                          setFormData({ ...formData, property_name: e.target.value })
                        }
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="property_code">Mã ngắn</Label>
                      <Input
                        id="property_code"
                        placeholder="VD: LM81"
                        value={formData.property_code}
                        onChange={(e) =>
                          setFormData({ ...formData, property_code: e.target.value.toUpperCase() })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="property_type_id">Loại chỗ nghỉ</Label>
                      <Select
                        value={formData.property_type_id}
                        onValueChange={(v) =>
                          setFormData({ ...formData, property_type_id: v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn loại..." />
                        </SelectTrigger>
                        <SelectContent>
                          {propertyTypes.map((pt) => (
                            <SelectItem key={pt.id} value={pt.id}>
                              {pt.name_vi}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="total_units">Số căn hộ/phòng</Label>
                      <Input
                        id="total_units"
                        type="number"
                        placeholder="VD: 456"
                        value={formData.total_units}
                        onChange={(e) =>
                          setFormData({ ...formData, total_units: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  {/* VN Address Cascade Dropdown */}
                  <div className="border rounded-lg p-4 bg-muted/30">
                    <Label className="text-base font-medium mb-3 block">Địa chỉ hành chính</Label>
                    <VNAddressCascade
                      value={formData.vnAddress}
                      onChange={(vnAddress) => setFormData({ ...formData, vnAddress })}
                      showStreetAddress={true}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Mô tả</Label>
                    <Textarea
                      id="description"
                      placeholder="Ghi chú về chỗ nghỉ..."
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({ ...formData, description: e.target.value })
                      }
                      rows={3}
                    />
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={handleCloseDialog}>
                      Huỷ
                    </Button>
                    <Button type="submit" disabled={saveMutation.isPending}>
                      {saveMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {editingProperty ? "Cập nhật" : "Thêm chỗ nghỉ"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <PageContainer><SectionCard>
        {/* Migration Notice Banner */}
        {properties.length === 0 && !isLoading && (
          <div className="p-4 rounded-lg border border-warning/20 bg-warning/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-warning">Chưa có dữ liệu</p>
                <p className="text-warning mt-1">
                  Bảng <code className="bg-warning/10 px-1 rounded">property_catalog</code> chưa có dữ liệu hoặc chưa được tạo.
                  Vui lòng chạy database migrations để khởi tạo hệ thống catalog.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <FilterBar
          title="Bộ lọc"
          subtitle="Tìm kiếm và lọc chỗ nghỉ"
          hasActiveFilters={searchTerm !== "" || cityFilter !== "all"}
          onClearFilters={() => {
            setSearchTerm("");
            setCityFilter("all");
          }}
        >
          <FilterBar.Field label="Tìm kiếm" colSpan={2}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Tìm theo tên, mã, địa chỉ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </FilterBar.Field>
          <FilterBar.Field label="Thành phố">
            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tất cả thành phố" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả thành phố</SelectItem>
                {cities.map((city) => (
                  <SelectItem key={city} value={city!}>
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterBar.Field>
        </FilterBar>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tổng chỗ nghỉ</p>
                <p className="text-2xl font-semibold">{properties.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-success/10 rounded-lg">
                <Home className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tổng căn hộ/phòng</p>
                <p className="text-2xl font-semibold">
                  {properties.reduce((sum, p) => sum + (p.total_units || 0), 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Thành phố</p>
                <p className="text-2xl font-semibold">{cities.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredProperties.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchTerm || cityFilter !== "all"
                ? "Không tìm thấy chỗ nghỉ phù hợp"
                : "Chưa có chỗ nghỉ nào. Nhấn 'Thêm chỗ nghỉ' để bắt đầu."}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Chỗ nghỉ</TableHead>
                    <TableHead className="w-[100px]">Mã</TableHead>
                    <TableHead className="w-[120px]">Loại</TableHead>
                    <TableHead className="w-[250px]">Địa chỉ</TableHead>
                    <TableHead className="w-[80px] text-right">Số căn</TableHead>
                    <TableHead className="w-[100px]">Trạng thái</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.map((property) => (
                    <TableRow key={property.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-muted rounded-lg">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <span className="font-medium">{property.property_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {property.property_code ? (
                          <code className="px-2 py-1 bg-muted rounded text-sm">
                            {property.property_code}
                          </code>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {property.property_type ? (
                          <StatusBadge variant="info">
                            {property.property_type.name_vi}
                          </StatusBadge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <VNAddressDisplay
                            provinceCode={property.province_code}
                            districtCode={property.district_code}
                            wardCode={property.ward_code}
                            streetAddress={property.address}
                            provinceNameSnapshot={property.province_name_snapshot}
                            districtNameSnapshot={property.district_name_snapshot}
                            wardNameSnapshot={property.ward_name_snapshot}
                            city={property.city}
                            district={property.district}
                            address={property.address}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {property.total_units?.toLocaleString() || "-"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge variant={property.is_active ? "success" : "warning"}>
                          {property.is_active ? "Hoạt động" : "Tạm ngưng"}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(property)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Chỉnh sửa
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                setPropertyToDelete(property);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Xóa
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <DataTablePagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={totalCount}
                displayedItems={displayedCount}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                itemLabel="chỗ nghỉ"
              />
            </>
          )}
        </div>

        {/* Info note */}
        <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
          <div className="flex items-start gap-3">
            <Users className="h-5 w-5 text-primary mt-0.5" />
            <div className="text-sm text-primary">
              <strong>Lưu ý:</strong> Danh mục chỗ nghỉ này là CHUNG cho toàn hệ thống.
              Khi thêm chỗ nghỉ cho đối tác, bạn sẽ chọn từ danh mục này.
              Nhiều đối tác có thể cùng quản lý một chỗ nghỉ.
            </div>
          </div>
        </div>
      </SectionCard></PageContainer>

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa chỗ nghỉ "{propertyToDelete?.property_name}"?
              <br />
              <span className="text-destructive">
                Lưu ý: Không thể xóa nếu chỗ nghỉ đang được gán cho đối tác hoặc có booking.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive"
              onClick={() => propertyToDelete && deleteMutation.mutate(propertyToDelete.id)}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
