import { useState, useMemo, useCallback, memo } from "react";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { useCurrentUserPagePermissions } from "@/hooks/useUserPagePermissions";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DebouncedSearch } from "@/components/ui/debounced-search";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { PartnerPropertiesDialog } from "@/components/settings/PartnerPropertiesDialog";
import { ArchivePartnerDialog } from "@/components/settings/ArchivePartnerDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Building2,
  Plane,
  Car,
  MoreHorizontal,
  Phone,
  Mail,
  Loader2,
  Pencil,
  BedDouble,
  CreditCard,
  Home,
  Users,
  ClipboardList,
  Archive,
  Ban,
  RotateCcw,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  PartnerStatus,
  PARTNER_STATUS_LABELS,
  PARTNER_STATUS_COLORS,
} from "@/hooks/useCatalog";

// New partner types
type PartnerType = "HOST_LANDLORD" | "HOST_OPERATOR" | "SERVICE_PICKUP" | "SERVICE_TOUR" | "SERVICE_OTHER";
type PaymentMethod = "BANK_TRANSFER" | "CASH" | "MOMO" | "VNPAY" | "OTHER";
type Region = "HCM" | "HN" | "DN" | "HP" | "CT" | "OTHER";

interface Partner {
  id: string;
  partner_name: string;
  partner_type: PartnerType;
  phone: string | null;
  email: string | null;
  payment_terms: string | null;
  status: string | null;
  partner_status: PartnerStatus | null;
  note: string | null;
  // New fields
  tax_code: string | null;
  business_license: string | null;
  contract_number: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  contact_person: string | null;
  secondary_phone: string | null;
  address: string | null;
  region: string | null;
  commission_rate: number | null;
  payment_method: string | null;
  priority_level: number | null;
  bank_account_info: any | null;
  // Archive fields
  archived_at: string | null;
  archive_reason: string | null;
  blacklisted_at: string | null;
  blacklist_reason: string | null;
  created_at: string;
  updated_at: string;
}

const regionLabels: Record<Region, string> = {
  HCM: "Hồ Chí Minh",
  HN: "Hà Nội",
  DN: "Đà Nẵng",
  HP: "Hải Phòng",
  CT: "Cần Thơ",
  OTHER: "Khác",
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  BANK_TRANSFER: "Chuyển khoản",
  CASH: "Tiền mặt",
  MOMO: "MoMo",
  VNPAY: "VNPay",
  OTHER: "Khác",
};

const partnerTypeIcons: Record<PartnerType, React.ElementType> = {
  HOST_LANDLORD: Home,
  HOST_OPERATOR: Users,
  SERVICE_PICKUP: Car,
  SERVICE_TOUR: Plane,
  SERVICE_OTHER: Building2,
};

const partnerTypeLabels: Record<PartnerType, string> = {
  HOST_LANDLORD: "Chủ nhà",
  HOST_OPERATOR: "Đơn vị vận hành",
  SERVICE_PICKUP: "Đối tác đưa đón",
  SERVICE_TOUR: "Đối tác tour",
  SERVICE_OTHER: "Đối tác dịch vụ khác",
};

const partnerTypeDescriptions: Record<PartnerType, string> = {
  HOST_LANDLORD: "Quản lý chỗ nghỉ & phòng",
  HOST_OPERATOR: "Quản lý chỗ nghỉ & phòng",
  SERVICE_PICKUP: "Dịch vụ đưa đón",
  SERVICE_TOUR: "Dịch vụ tour",
  SERVICE_OTHER: "Dịch vụ khác",
};

// Check if partner type is HOST (can manage properties/rooms)
const isHostPartner = (type: PartnerType) =>
  type === "HOST_LANDLORD" || type === "HOST_OPERATOR";

export default function PartnersPage() {
  const { canUsePage } = useCurrentUserPagePermissions();
  const canPerformActions = canUsePage('/partners');

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [formData, setFormData] = useState({
    // Thông tin chung
    partner_name: "",
    partner_type: "HOST_LANDLORD" as PartnerType,
    region: "HCM" as Region,
    priority_level: 3,
    // Pháp lý & thanh toán
    tax_code: "",
    business_license: "",
    contract_number: "",
    contract_start_date: "",
    contract_end_date: "",
    payment_terms: "",
    payment_method: "BANK_TRANSFER" as PaymentMethod,
    commission_rate: "",
    bank_name: "",
    bank_account: "",
    bank_holder: "",
    // Liên hệ & vận hành
    contact_person: "",
    phone: "",
    secondary_phone: "",
    email: "",
    address: "",
    note: "",
  });

  // Properties & Room Types dialog state (now handled by PartnerPropertiesDialog component)
  const [propertiesDialogOpen, setPropertiesDialogOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);

  // Service catalog dialog state for service partners
  const [serviceCatalogDialogOpen, setServiceCatalogDialogOpen] = useState(false);
  const [serviceCatalog, setServiceCatalog] = useState<any[]>([]);
  const [loadingServiceCatalog, setLoadingServiceCatalog] = useState(false);

  // Add service form state
  const [addServiceDialogOpen, setAddServiceDialogOpen] = useState(false);
  const [serviceFormData, setServiceFormData] = useState({
    service_name: "",
    service_type: "PICKUP" as "PICKUP" | "TOUR" | "ADDON",
    description: "",
  });

  // Archive dialog state (replaces delete)
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveAction, setArchiveAction] = useState<"archive" | "blacklist" | "reactivate">("archive");
  const [partnerToArchive, setPartnerToArchive] = useState<Partner | null>(null);

  // Show archived partners toggle
  const [showArchived, setShowArchived] = useState(false);

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch partners (with optional archived)
  const { data: partners = [], isLoading, refetch } = useQuery({
    queryKey: ["partners", showArchived],
    staleTime: 30000, // 30 seconds - don't refetch if data is fresh
    gcTime: 5 * 60 * 1000, // 5 minutes cache
    queryFn: async () => {
      try {
        const query = supabase
          .from("partners")
          .select("id, partner_name, partner_type, phone, email, status, partner_status, region, priority_level, archived_at, blacklisted_at, created_at")
          .order("created_at", { ascending: false })
          .limit(100); // Limit initial load

        // Filter by status if not showing archived
        // Note: partner_status may not exist yet, so we handle the error gracefully
        if (!showArchived) {
          // First try with partner_status filter
          const { data, error } = await query.or("partner_status.is.null,partner_status.in.(ACTIVE,INACTIVE)");

          if (error) {
            // If partner_status column doesn't exist, fall back to simple query
            console.warn("partner_status column may not exist, using fallback query");
            const { data: fallbackData, error: fallbackError } = await supabase
              .from("partners")
              .select("*")
              .order("created_at", { ascending: false });

            if (fallbackError) throw fallbackError;
            return (fallbackData || []) as unknown as Partner[];
          }

          return (data || []) as unknown as Partner[];
        } else {
          const { data, error } = await query;
          if (error) throw error;
          return (data || []) as unknown as Partner[];
        }
      } catch (e) {
        console.error("Error fetching partners:", e);
        return [] as Partner[];
      }
    },
  });

  // Create/Update partner mutation
  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData & { id?: string }) => {
      // Build bank_account_info JSON
      const bankAccountInfo = (data.bank_name || data.bank_account || data.bank_holder) ? {
        bank_name: data.bank_name || null,
        account_number: data.bank_account || null,
        account_holder: data.bank_holder || null,
      } : null;

      const payload = {
        partner_name: data.partner_name,
        partner_type: data.partner_type,
        region: data.region || null,
        priority_level: data.priority_level || 3,
        // Legal & Payment
        tax_code: data.tax_code || null,
        business_license: data.business_license || null,
        contract_number: data.contract_number || null,
        contract_start_date: data.contract_start_date || null,
        contract_end_date: data.contract_end_date || null,
        payment_terms: data.payment_terms || null,
        payment_method: data.payment_method || null,
        commission_rate: data.commission_rate ? parseFloat(data.commission_rate) : null,
        bank_account_info: bankAccountInfo,
        // Contact & Operation
        contact_person: data.contact_person || null,
        phone: data.phone || null,
        secondary_phone: data.secondary_phone || null,
        email: data.email || null,
        address: data.address || null,
        note: data.note || null,
      };

      if (data.id) {
        const { error } = await supabase
          .from("partners")
          .update(payload)
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await safeMutation(() => supabase.from("partners").insert(payload));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Thành công", {
        description: editingPartner ? "Đã cập nhật đối tác" : "Đã thêm đối tác mới",
      });
      handleCloseDialog();
      queryClient.invalidateQueries({ queryKey: ["partners"] });
    },
    onError: (err: any) => {
      toast.error("Lỗi", { description: err.message });
    },
  });

  // Add service mutation
  const addServiceMutation = useMutation({
    mutationFn: async (data: {
      service_name: string;
      service_type: "PICKUP" | "TOUR" | "ADDON";
      description?: string;
      base_price?: number;
      default_partner_id: string;
    }) => {
      const { error } = await safeMutation(() => supabase.from("service_catalog").insert({
        service_name: data.service_name,
        service_type: data.service_type,
        description: data.description || null,
        base_price: data.base_price || null,
        default_partner_id: data.default_partner_id,
        active_status: true,
      }));
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Thành công", { description: "Đã thêm dịch vụ mới" });
      setAddServiceDialogOpen(false);
      setServiceFormData({
        service_name: "",
        service_type: "PICKUP",
        description: "",
      });
      if (selectedPartner) {
        fetchServiceCatalog(selectedPartner.id);
      }
    },
    onError: (err: any) => {
      toast.error("Lỗi", { description: err.message });
    },
  });

  // Archive action handlers
  const openArchiveDialog = (partner: Partner, action: "archive" | "blacklist" | "reactivate") => {
    setPartnerToArchive(partner);
    setArchiveAction(action);
    setArchiveDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingPartner(null);
    setFormData({
      partner_name: "",
      partner_type: "HOST_LANDLORD",
      region: "HCM",
      priority_level: 3,
      tax_code: "",
      business_license: "",
      contract_number: "",
      contract_start_date: "",
      contract_end_date: "",
      payment_terms: "",
      payment_method: "BANK_TRANSFER",
      commission_rate: "",
      bank_name: "",
      bank_account: "",
      bank_holder: "",
      contact_person: "",
      phone: "",
      secondary_phone: "",
      email: "",
      address: "",
      note: "",
    });
  };

  const handleEdit = (partner: Partner) => {
    setEditingPartner(partner);
    const bankInfo = partner.bank_account_info || {};
    setFormData({
      partner_name: partner.partner_name,
      partner_type: partner.partner_type,
      region: (partner.region as Region) || "HCM",
      priority_level: partner.priority_level || 3,
      tax_code: partner.tax_code || "",
      business_license: partner.business_license || "",
      contract_number: partner.contract_number || "",
      contract_start_date: partner.contract_start_date || "",
      contract_end_date: partner.contract_end_date || "",
      payment_terms: partner.payment_terms || "",
      payment_method: (partner.payment_method as PaymentMethod) || "BANK_TRANSFER",
      commission_rate: partner.commission_rate?.toString() || "",
      bank_name: bankInfo.bank_name || "",
      bank_account: bankInfo.account_number || "",
      bank_holder: bankInfo.account_holder || "",
      contact_person: partner.contact_person || "",
      phone: partner.phone || "",
      secondary_phone: partner.secondary_phone || "",
      email: partner.email || "",
      address: partner.address || "",
      note: partner.note || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      ...formData,
      id: editingPartner?.id,
    });
  };

  const openPropertiesDialog = (partner: Partner) => {
    setSelectedPartner(partner);
    setPropertiesDialogOpen(true);
  };

  // Fetch service catalog for a service partner
  const fetchServiceCatalog = async (partnerId: string) => {
    setLoadingServiceCatalog(true);
    try {
      const { data, error } = await supabase
        .from("service_catalog")
        .select("*")
        .eq("default_partner_id", partnerId)
        .order("service_name", { ascending: true });

      if (error) throw error;
      setServiceCatalog(data || []);
    } catch (err: any) {
      toast.error("Lỗi", { description: err.message });
    } finally {
      setLoadingServiceCatalog(false);
    }
  };

  const openServiceCatalogDialog = (partner: Partner) => {
    setSelectedPartner(partner);
    setServiceCatalogDialogOpen(true);
    fetchServiceCatalog(partner.id);
  };

  const handleAddService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartner) return;

    addServiceMutation.mutate({
      service_name: serviceFormData.service_name,
      service_type: serviceFormData.service_type,
      description: serviceFormData.description || undefined,
      default_partner_id: selectedPartner.id,
    });
  };

  // Memoize filtered partners to prevent recalculation on every render
  const filteredPartners = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    return partners.filter((partner) => {
      const matchesSearch = !searchTerm ||
        partner.partner_name.toLowerCase().includes(searchLower) ||
        partner.phone?.includes(searchTerm) ||
        partner.email?.toLowerCase().includes(searchLower);

      let matchesType = typeFilter === "all";
      if (typeFilter === "HOST") {
        matchesType = isHostPartner(partner.partner_type);
      } else if (typeFilter === "SERVICE") {
        matchesType = !isHostPartner(partner.partner_type);
      } else if (typeFilter !== "all") {
        matchesType = partner.partner_type === typeFilter;
      }

      return matchesSearch && matchesType;
    });
  }, [partners, searchTerm, typeFilter]);

  return (
    <>
      <Header
        title="Đối tác"
        subtitle="Quản lý Host (Chủ nhà, Vận hành) và đối tác dịch vụ"
        actions={
          <div className="flex items-center gap-2">
            {/* Toggle archived visibility */}
            <Button
              variant={showArchived ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowArchived(!showArchived)}
              className="gap-2"
            >
              {showArchived ? (
                <>
                  <EyeOff className="h-4 w-4" />
                  Ẩn lưu trữ
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  Hiển thị lưu trữ
                </>
              )}
            </Button>
            {canPerformActions && (
              <Dialog open={isDialogOpen} onOpenChange={(open) => {
                if (!open) handleCloseDialog();
                else setIsDialogOpen(true);
              }}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Thêm đối tác
                  </Button>
                </DialogTrigger>
                <DialogContent size="3xl" className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {editingPartner ? "Chỉnh sửa đối tác" : "Thêm đối tác mới"}
                    </DialogTitle>
                    <DialogDescription>
                      Nhập thông tin đối tác để {editingPartner ? "cập nhật" : "thêm vào"} hệ thống
                    </DialogDescription>
                  </DialogHeader>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* SECTION 1: Thông tin chung */}
                    <div className="space-y-4">
                      <h3 className="font-semibold text-sm flex items-center gap-2 text-primary border-b pb-2">
                        <Building2 className="h-4 w-4" />
                        Thông tin chung
                      </h3>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="partner_name">Tên đối tác *</Label>
                          <Input
                            id="partner_name"
                            value={formData.partner_name}
                            onChange={(e) =>
                              setFormData({ ...formData, partner_name: e.target.value })
                            }
                            placeholder="VD: Công ty ABC"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="partner_type">Loại đối tác *</Label>
                          <Select
                            value={formData.partner_type}
                            onValueChange={(v: PartnerType) =>
                              setFormData({ ...formData, partner_type: v })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="HOST_LANDLORD">Chủ nhà</SelectItem>
                              <SelectItem value="HOST_OPERATOR">Đơn vị vận hành</SelectItem>
                              <SelectItem value="SERVICE_PICKUP">Đối tác đưa đón</SelectItem>
                              <SelectItem value="SERVICE_TOUR">Đối tác tour</SelectItem>
                              <SelectItem value="SERVICE_OTHER">Đối tác dịch vụ khác</SelectItem>
                            </SelectContent>
                          </Select>
                          {isHostPartner(formData.partner_type) && (
                            <p className="text-xs text-primary">
                              ✓ Loại này có thể quản lý Chỗ nghỉ và Loại phòng
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="region">Khu vực hoạt động *</Label>
                          <Select
                            value={formData.region}
                            onValueChange={(v: Region) =>
                              setFormData({ ...formData, region: v })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(regionLabels).map(([key, label]) => (
                                <SelectItem key={key} value={key}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="priority_level">Mức độ ưu tiên</Label>
                          <Select
                            value={formData.priority_level.toString()}
                            onValueChange={(v) =>
                              setFormData({ ...formData, priority_level: parseInt(v) })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1 - Thấp</SelectItem>
                              <SelectItem value="2">2 - Trung bình thấp</SelectItem>
                              <SelectItem value="3">3 - Trung bình</SelectItem>
                              <SelectItem value="4">4 - Cao</SelectItem>
                              <SelectItem value="5">5 - Rất cao</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 2: Pháp lý & Thanh toán */}
                    <div className="space-y-4">
                      <h3 className="font-semibold text-sm flex items-center gap-2 text-primary border-b pb-2">
                        <CreditCard className="h-4 w-4" />
                        Pháp lý & Thanh toán
                      </h3>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="tax_code">Mã số thuế</Label>
                          <Input
                            id="tax_code"
                            value={formData.tax_code}
                            onChange={(e) =>
                              setFormData({ ...formData, tax_code: e.target.value })
                            }
                            placeholder="VD: 0123456789"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="business_license">Số giấy phép KD</Label>
                          <Input
                            id="business_license"
                            value={formData.business_license}
                            onChange={(e) =>
                              setFormData({ ...formData, business_license: e.target.value })
                            }
                            placeholder="VD: GP-123456"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="contract_number">Số hợp đồng</Label>
                          <Input
                            id="contract_number"
                            value={formData.contract_number}
                            onChange={(e) =>
                              setFormData({ ...formData, contract_number: e.target.value })
                            }
                            placeholder="VD: HD-2026-001"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="commission_rate">Tỷ lệ hoa hồng (%)</Label>
                          <Input
                            id="commission_rate"
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={formData.commission_rate}
                            onChange={(e) =>
                              setFormData({ ...formData, commission_rate: e.target.value })
                            }
                            placeholder="VD: 15"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="contract_start_date">Ngày bắt đầu HĐ</Label>
                          <Input
                            id="contract_start_date"
                            type="date"
                            value={formData.contract_start_date}
                            onChange={(e) =>
                              setFormData({ ...formData, contract_start_date: e.target.value })
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="contract_end_date">Ngày kết thúc HĐ</Label>
                          <Input
                            id="contract_end_date"
                            type="date"
                            value={formData.contract_end_date}
                            onChange={(e) =>
                              setFormData({ ...formData, contract_end_date: e.target.value })
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="payment_method">Phương thức thanh toán</Label>
                          <Select
                            value={formData.payment_method}
                            onValueChange={(v: PaymentMethod) =>
                              setFormData({ ...formData, payment_method: v })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(paymentMethodLabels).map(([key, label]) => (
                                <SelectItem key={key} value={key}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="payment_terms">Điều khoản thanh toán</Label>
                          <Input
                            id="payment_terms"
                            value={formData.payment_terms}
                            onChange={(e) =>
                              setFormData({ ...formData, payment_terms: e.target.value })
                            }
                            placeholder="VD: Thanh toán sau 7 ngày"
                          />
                        </div>
                      </div>

                      {/* Bank info */}
                      <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                        <div className="space-y-2">
                          <Label htmlFor="bank_name">Ngân hàng</Label>
                          <Input
                            id="bank_name"
                            value={formData.bank_name}
                            onChange={(e) =>
                              setFormData({ ...formData, bank_name: e.target.value })
                            }
                            placeholder="VD: Vietcombank"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="bank_account">Số tài khoản</Label>
                          <Input
                            id="bank_account"
                            value={formData.bank_account}
                            onChange={(e) =>
                              setFormData({ ...formData, bank_account: e.target.value })
                            }
                            placeholder="VD: 0123456789"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="bank_holder">Chủ tài khoản</Label>
                          <Input
                            id="bank_holder"
                            value={formData.bank_holder}
                            onChange={(e) =>
                              setFormData({ ...formData, bank_holder: e.target.value })
                            }
                            placeholder="VD: NGUYEN VAN A"
                          />
                        </div>
                      </div>
                    </div>

                    {/* SECTION 3: Liên hệ & Vận hành */}
                    <div className="space-y-4">
                      <h3 className="font-semibold text-sm flex items-center gap-2 text-primary border-b pb-2">
                        <Phone className="h-4 w-4" />
                        Liên hệ & Vận hành
                      </h3>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="contact_person">Người liên hệ</Label>
                          <Input
                            id="contact_person"
                            value={formData.contact_person}
                            onChange={(e) =>
                              setFormData({ ...formData, contact_person: e.target.value })
                            }
                            placeholder="VD: Nguyễn Văn A"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="email">Email *</Label>
                          <Input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={(e) =>
                              setFormData({ ...formData, email: e.target.value })
                            }
                            placeholder="VD: contact@company.com"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="phone">Điện thoại chính *</Label>
                          <Input
                            id="phone"
                            value={formData.phone}
                            onChange={(e) =>
                              setFormData({ ...formData, phone: e.target.value })
                            }
                            placeholder="VD: 0901234567"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="secondary_phone">Điện thoại phụ</Label>
                          <Input
                            id="secondary_phone"
                            value={formData.secondary_phone}
                            onChange={(e) =>
                              setFormData({ ...formData, secondary_phone: e.target.value })
                            }
                            placeholder="VD: 0907654321"
                          />
                        </div>

                        <div className="col-span-2 space-y-2">
                          <Label htmlFor="address">Địa chỉ</Label>
                          <Input
                            id="address"
                            value={formData.address}
                            onChange={(e) =>
                              setFormData({ ...formData, address: e.target.value })
                            }
                            placeholder="VD: 123 Nguyễn Huệ, Q.1, TP.HCM"
                          />
                        </div>

                        <div className="col-span-2 space-y-2">
                          <Label htmlFor="note">Ghi chú</Label>
                          <Textarea
                            id="note"
                            value={formData.note}
                            onChange={(e) =>
                              setFormData({ ...formData, note: e.target.value })
                            }
                            placeholder="Ghi chú thêm về đối tác..."
                            rows={2}
                          />
                        </div>
                      </div>
                    </div>

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCloseDialog}
                      >
                        Huỷ
                      </Button>
                      <Button type="submit" disabled={saveMutation.isPending}>
                        {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {editingPartner ? "Cập nhật" : "Thêm đối tác"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        }
      />

      <PageContainer><SectionCard>
        {/* Filters */}
        <FilterBar
          title="Bộ lọc"
          subtitle="Tìm kiếm và lọc đối tác"
          hasActiveFilters={searchTerm !== "" || typeFilter !== "all"}
          onClearFilters={() => { setSearchTerm(""); setTypeFilter("all"); }}
        >
          <FilterBar.Field label="Tìm kiếm" colSpan={2}>
            <DebouncedSearch
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Tìm đối tác..."
            />
          </FilterBar.Field>
          <FilterBar.Field label="Loại đối tác">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Loại" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="HOST">Đối tác Host</SelectItem>
                <SelectItem value="SERVICE">Đối tác dịch vụ</SelectItem>
                <SelectItem value="HOST_LANDLORD">Chủ nhà</SelectItem>
                <SelectItem value="HOST_OPERATOR">Đơn vị vận hành</SelectItem>
                <SelectItem value="SERVICE_PICKUP">Đưa đón</SelectItem>
                <SelectItem value="SERVICE_TOUR">Tour</SelectItem>
                <SelectItem value="SERVICE_OTHER">Dịch vụ khác</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar.Field>
          <FilterBar.Field>
            <div className="flex items-end h-full">
              <div className="text-sm text-muted-foreground">
                {showArchived ? (
                  <span className="text-warning">Đang hiển thị cả đối tác đã lưu trữ</span>
                ) : (
                  <span>Chỉ hiển thị đối tác đang hoạt động</span>
                )}
              </div>
            </div>
          </FilterBar.Field>
        </FilterBar>

        {/* Partners Grid */}
        {isLoading ? (
          <PageSkeleton cards={0} rows={6} columns={6} />
        ) : filteredPartners.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Chưa có đối tác nào</p>
            {canPerformActions && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setIsDialogOpen(true)}
              >
                Thêm đối tác đầu tiên
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPartners.map((partner) => {
              const Icon = partnerTypeIcons[partner.partner_type] || Building2;
              const isHost = isHostPartner(partner.partner_type);

              return (
                <div
                  key={partner.id}
                  className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${isHost ? "bg-primary/10" : "bg-muted"
                        }`}>
                        <Icon className={`h-5 w-5 ${isHost ? "text-primary" : "text-muted-foreground"
                          }`} />
                      </div>
                      <div>
                        <p className="font-medium">{partner.partner_name}</p>
                        <div className="flex items-center gap-2">
                          <StatusBadge
                            variant={isHost ? "info" : "default"}
                            size="sm"
                          >
                            {partnerTypeLabels[partner.partner_type]}
                          </StatusBadge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {partnerTypeDescriptions[partner.partner_type]}
                        </p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canPerformActions && (
                          <>
                            <DropdownMenuItem onClick={() => handleEdit(partner)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Chỉnh sửa
                            </DropdownMenuItem>
                            {isHost && (
                              <DropdownMenuItem onClick={() => openPropertiesDialog(partner)}>
                                <BedDouble className="h-4 w-4 mr-2" />
                                Quản lý chỗ nghỉ
                              </DropdownMenuItem>
                            )}
                            {!isHost && (
                              <DropdownMenuItem onClick={() => openServiceCatalogDialog(partner)}>
                                <ClipboardList className="h-4 w-4 mr-2" />
                                Xem dịch vụ
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                        <DropdownMenuItem
                          onClick={() => navigate(`/host-payables?partner=${partner.id}`)}
                        >
                          <CreditCard className="h-4 w-4 mr-2" />
                          Xem công nợ
                        </DropdownMenuItem>
                        {canPerformActions && (
                          <>
                            <DropdownMenuSeparator />
                            {/* Archive/Reactivate actions based on status */}
                            {partner.partner_status === "ARCHIVED" || partner.partner_status === "BLACKLISTED" ? (
                              <DropdownMenuItem
                                onClick={() => openArchiveDialog(partner, "reactivate")}
                                className="text-success focus:text-success"
                              >
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Kích hoạt lại
                              </DropdownMenuItem>
                            ) : (
                              <>
                                <DropdownMenuItem
                                  onClick={() => openArchiveDialog(partner, "archive")}
                                  className="text-warning focus:text-warning"
                                >
                                  <Archive className="h-4 w-4 mr-2" />
                                  Lưu trữ
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openArchiveDialog(partner, "blacklist")}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Ban className="h-4 w-4 mr-2" />
                                  Đưa vào danh sách đen
                                </DropdownMenuItem>
                              </>
                            )}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="space-y-2 text-sm">
                    {partner.phone && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {partner.phone}
                      </div>
                    )}
                    {partner.email && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        {partner.email}
                      </div>
                    )}
                    {partner.payment_terms && (
                      <p className="text-muted-foreground">
                        {partner.payment_terms}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                    <StatusBadge
                      variant={
                        partner.partner_status === "ACTIVE" || (!partner.partner_status && partner.status === "active")
                          ? "success"
                          : partner.partner_status === "INACTIVE"
                            ? "warning"
                            : partner.partner_status === "ARCHIVED"
                              ? "default"
                              : partner.partner_status === "BLACKLISTED"
                                ? "danger"
                                : "default"
                      }
                      size="sm"
                    >
                      {partner.partner_status
                        ? PARTNER_STATUS_LABELS[partner.partner_status]
                        : partner.status === "active" ? "Đang hoạt động" : "Ngừng"}
                    </StatusBadge>
                    {isHost ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openPropertiesDialog(partner)}
                        className="text-primary hover:text-primary"
                      >
                        <Building2 className="h-4 w-4 mr-1" />
                        Quản lý chỗ nghỉ
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openServiceCatalogDialog(partner)}
                        className="text-primary hover:text-primary"
                      >
                        <ClipboardList className="h-4 w-4 mr-1" />
                        Xem dịch vụ
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard></PageContainer>

      {/* Partner Properties Dialog - Using Catalog */}
      <PartnerPropertiesDialog
        open={propertiesDialogOpen}
        onOpenChange={setPropertiesDialogOpen}
        partner={selectedPartner}
      />

      {/* Service Catalog Dialog for Service Partners */}
      <Dialog open={serviceCatalogDialogOpen} onOpenChange={setServiceCatalogDialogOpen}>
        <DialogContent size="2xl" className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  Danh mục dịch vụ - {selectedPartner?.partner_name}
                </DialogTitle>
                <DialogDescription>
                  Các dịch vụ mà đối tác này cung cấp
                </DialogDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddServiceDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Thêm dịch vụ
              </Button>
            </div>
          </DialogHeader>

          {loadingServiceCatalog ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : serviceCatalog.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
              <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Hiện tại không có dịch vụ nào liên kết với đối tác này</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setAddServiceDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Thêm dịch vụ đầu tiên
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {serviceCatalog.map((service) => (
                <div
                  key={service.id}
                  className="p-4 rounded-lg border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">{service.service_name}</p>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="px-2 py-0.5 rounded bg-muted text-xs">
                          {service.service_type === "PICKUP" ? "Đưa đón" :
                            service.service_type === "TOUR" ? "Tour" :
                              service.service_type === "ADDON" ? "Addon" : "Khác"}
                        </span>
                      </div>
                      {service.description && (
                        <p className="text-sm text-muted-foreground">{service.description}</p>
                      )}
                    </div>
                    <div className="text-right">
                      {service.base_price && (
                        <p className="font-semibold text-primary">
                          {new Intl.NumberFormat("vi-VN").format(service.base_price)}đ
                        </p>
                      )}
                      <StatusBadge
                        variant={service.active_status ? "success" : "default"}
                        size="sm"
                      >
                        {service.active_status ? "Đang hoạt động" : "Ngừng"}
                      </StatusBadge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Service Dialog */}
      <Dialog open={addServiceDialogOpen} onOpenChange={setAddServiceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm dịch vụ mới</DialogTitle>
            <DialogDescription>
              Thêm dịch vụ cho {selectedPartner?.partner_name}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddService} className="space-y-4">
            <div className="space-y-2">
              <Label>Tên dịch vụ *</Label>
              <Input
                value={serviceFormData.service_name}
                onChange={(e) => setServiceFormData({ ...serviceFormData, service_name: e.target.value })}
                placeholder="VD: Đón sân bay Nội Bài, Tour Hạ Long..."
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Loại dịch vụ *</Label>
              <Select
                value={serviceFormData.service_type}
                onValueChange={(v: "PICKUP" | "TOUR" | "ADDON") =>
                  setServiceFormData({ ...serviceFormData, service_type: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PICKUP">Đưa đón</SelectItem>
                  <SelectItem value="TOUR">Tour</SelectItem>
                  <SelectItem value="ADDON">Addon</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Mô tả</Label>
              <Textarea
                value={serviceFormData.description}
                onChange={(e) => setServiceFormData({ ...serviceFormData, description: e.target.value })}
                placeholder="Mô tả chi tiết dịch vụ..."
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddServiceDialogOpen(false)}>
                Huỷ
              </Button>
              <Button type="submit" disabled={addServiceMutation.isPending}>
                {addServiceMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Thêm dịch vụ
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Archive Partner Dialog */}
      <ArchivePartnerDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        partner={partnerToArchive}
        action={archiveAction}
      />
    </>
  );
}
