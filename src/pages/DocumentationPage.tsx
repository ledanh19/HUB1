import { useState } from "react";
import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  Handshake,
  Building2,
  Plane,
  CreditCard,
  Receipt,
  AlertTriangle,
  PiggyBank,
  BarChart3,
  Settings,
  Wallet,
  ClipboardCheck,
  Clock,
  ArrowDownLeft,
  History,
  Link2,
  MessageSquare,
  LayoutGrid,
  FileText,
  Brain,
  Lightbulb,
  ListChecks,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  Info,
  ExternalLink,
  Search,
  Home,
  FileCheck,
  UserCheck,
  FlaskConical,
  Database,
  GitBranch,
  Table2,
  Workflow,
  BookOpen,
  HelpCircle,
  Layers,
  Key,
  Shield,
  Zap,
  RefreshCw,
  MapPin,
  DollarSign,
  Calculator,
  FileWarning,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import roomriseLogo from "@/assets/roomrise-logo-navy.png";
import { Link } from "react-router-dom";
import { AppLink } from "@/components/system/AppLink";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface FieldDefinition {
  name: string;
  type: string;
  description: string;
  required?: boolean;
  example?: string;
}

interface StatusDefinition {
  value: string;
  label: string;
  description: string;
  color?: string;
}

interface DataTableDoc {
  name: string;
  description: string;
  fields: FieldDefinition[];
  statuses?: StatusDefinition[];
  relationships?: string[];
  businessLogic?: string[];
}

interface DocSection {
  id: string;
  title: string;
  icon: React.ElementType;
  description: string;
  subsections?: {
    id: string;
    title: string;
    content: string;
    steps?: string[];
    tips?: string[];
    warnings?: string[];
    dataTable?: DataTableDoc;
    formulas?: { name: string; formula: string; description: string }[];
    stateMachine?: { from: string; to: string; trigger: string; conditions?: string }[];
  }[];
}

// Comprehensive Documentation Data
const documentationSections: DocSection[] = [
  {
    id: "overview",
    title: "Tổng quan hệ thống",
    icon: BookOpen,
    description: "Giới thiệu về Roomrise và kiến trúc tổng thể của hệ thống quản lý khách sạn.",
    subsections: [
      {
        id: "system-overview",
        title: "Giới thiệu Roomrise",
        content: "Roomrise là hệ thống quản lý vận hành khách sạn và căn hộ cho thuê toàn diện. Hệ thống tích hợp với các kênh OTA (Booking.com, Agoda, Expedia, Ctrip, Traveloka) thông qua Channex để đồng bộ booking, quản lý inventory, và xử lý thanh toán.",
        tips: [
          "Hệ thống hỗ trợ cả booking từ OTA lẫn booking thủ công (Direct/Walk-in)",
          "Dữ liệu được đồng bộ real-time từ Channex qua webhook",
          "Tất cả thao tác đều được ghi nhật ký trong Audit Logs"
        ]
      },
      {
        id: "data-flow",
        title: "Luồng dữ liệu chính",
        content: "Dữ liệu trong Roomrise được tổ chức theo 3 tầng chính: Mirror (dữ liệu sync từ OTA), Internal (dữ liệu nội bộ), và Unified (view kết hợp).",
        steps: [
          "1. SYNC: Channex webhook → bookings_mirror, room_types_mirror, rate_plans_mirror",
          "2. MAPPING: Liên kết dữ liệu Channex với hệ thống nội bộ qua property_mappings, room_type_mappings, rate_plan_mappings",
          "3. OPERATIONS: Tạo stays, host_supply_segments, collections từ booking",
          "4. FINANCE: Tính toán host_payables, host_settlements, cashflow_entries",
          "5. REPORTING: Tổng hợp vào unified_bookings view và các báo cáo"
        ]
      },
      {
        id: "user-roles",
        title: "Vai trò người dùng",
        content: "Hệ thống phân quyền theo vai trò (Role-Based Access Control).",
        dataTable: {
          name: "user_roles",
          description: "Bảng phân quyền người dùng",
          fields: [
            { name: "user_id", type: "UUID", description: "ID người dùng từ auth.users", required: true },
            { name: "role", type: "app_role ENUM", description: "Vai trò được gán", required: true },
          ],
          statuses: [
            { value: "super_admin", label: "Super Admin", description: "Toàn quyền trên hệ thống, có thể quản lý user và cấu hình", color: "destructive" },
            { value: "admin", label: "Admin", description: "Quản lý vận hành, phê duyệt thanh toán, xem báo cáo", color: "default" },
            { value: "ke_toan", label: "Kế toán", description: "Quản lý tài chính, công nợ, đối soát OTA", color: "secondary" },
            { value: "sale", label: "Sale", description: "Tạo booking thủ công, quản lý khách hàng", color: "outline" },
            { value: "cskh", label: "CSKH", description: "Hỗ trợ khách hàng, xử lý tin nhắn OTA", color: "outline" },
          ]
        }
      }
    ]
  },
  {
    id: "bookings",
    title: "Booking & Đặt phòng",
    icon: CalendarCheck,
    description: "Quản lý toàn bộ booking từ OTA và booking thủ công.",
    subsections: [
      {
        id: "bookings-mirror",
        title: "Bảng bookings_mirror (OTA Booking)",
        content: "Lưu trữ tất cả booking được sync từ OTA thông qua Channex. Đây là bảng gốc chứa dữ liệu nguyên bản từ OTA.",
        dataTable: {
          name: "bookings_mirror",
          description: "Booking được sync từ các kênh OTA",
          fields: [
            { name: "id", type: "UUID", description: "Primary key tự động tạo", required: true },
            { name: "unified_booking_id", type: "TEXT", description: "Mã booking thống nhất dạng BK-XXXXXX, dùng để liên kết các bảng", required: true, example: "BK-2024001234" },
            { name: "pms_booking_id", type: "TEXT", description: "Mã booking từ Channex/PMS", example: "ch_abc123" },
            { name: "ota_booking_code", type: "TEXT", description: "Mã xác nhận từ OTA (confirmation number)", example: "3847291847" },
            { name: "ota_source", type: "TEXT", description: "Kênh OTA nguồn: Booking.com, Agoda, Expedia, Ctrip, Traveloka", required: true },
            { name: "guest_name", type: "TEXT", description: "Tên khách hàng", required: true },
            { name: "guest_email", type: "TEXT", description: "Email khách hàng (có thể là email proxy từ OTA)" },
            { name: "guest_phone", type: "TEXT", description: "Số điện thoại (có thể là số proxy)" },
            { name: "check_in_date", type: "DATE", description: "Ngày nhận phòng (YYYY-MM-DD)", required: true },
            { name: "check_out_date", type: "DATE", description: "Ngày trả phòng", required: true },
            { name: "nights", type: "INTEGER", description: "Số đêm = check_out - check_in", required: true },
            { name: "room_type", type: "TEXT", description: "Loại phòng được bán trên OTA" },
            { name: "total_amount_gross", type: "DECIMAL", description: "Tổng giá bán (bao gồm thuế, phí OTA)" },
            { name: "total_amount_net", type: "DECIMAL", description: "Số tiền net sau trừ commission" },
            { name: "commission_rate", type: "DECIMAL", description: "Phần trăm commission OTA (%)" },
            { name: "commission_amount", type: "DECIMAL", description: "Số tiền commission = gross × rate" },
            { name: "payment_type", type: "payment_type ENUM", description: "Hình thức thanh toán", required: true },
            { name: "booking_status", type: "booking_status ENUM", description: "Trạng thái booking", required: true },
            { name: "booking_date", type: "TIMESTAMP", description: "Thời điểm đặt phòng" },
            { name: "channex_property_id", type: "TEXT", description: "ID property trong Channex" },
            { name: "channex_room_type_id", type: "TEXT", description: "ID room type trong Channex" },
            { name: "pms_property_name", type: "TEXT", description: "Tên property từ Channex" },
            { name: "synced_at", type: "TIMESTAMP", description: "Thời điểm sync gần nhất" },
            { name: "source_updated_at", type: "TIMESTAMP", description: "Thời điểm cập nhật từ nguồn" },
          ],
          statuses: [
            { value: "PENDING", label: "Chờ xác nhận", description: "Booking mới chưa được xác nhận", color: "outline" },
            { value: "CONFIRMED", label: "Đã xác nhận", description: "Booking đã được xác nhận, chờ check-in", color: "default" },
            { value: "CHECKED_IN", label: "Đã nhận phòng", description: "Khách đã check-in", color: "secondary" },
            { value: "CHECKED_OUT", label: "Đã trả phòng", description: "Khách đã check-out", color: "default" },
            { value: "CANCELLED", label: "Đã hủy", description: "Booking bị hủy (free hoặc có phí)", color: "destructive" },
            { value: "NO_SHOW", label: "No-show", description: "Khách không đến nhận phòng", color: "destructive" },
          ],
          relationships: [
            "→ stays (1:1): Mỗi booking có tối đa 1 stay record",
            "→ host_supply_segments (1:n): Có thể gán nhiều segment cho nhiều host",
            "→ hotel_collects (1:n): Các khoản thu liên quan booking",
            "→ guest_documents (1:n): Giấy tờ tùy thân của khách",
          ],
          businessLogic: [
            "unified_booking_id là khóa chính để liên kết với tất cả bảng khác",
            "payment_type quyết định luồng thu tiền: HOTEL_COLLECT (khách trả tại khách sạn) hoặc OTA_COLLECT (OTA đã thu)",
            "Khi booking bị CANCELLED, các collection liên quan cần được xử lý (refund nếu đã thu)",
          ]
        }
      },
      {
        id: "payment-type-logic",
        title: "Logic Payment Type",
        content: "Payment Type quyết định toàn bộ luồng tài chính của booking.",
        steps: [
          "HOTEL_COLLECT (Khách sạn thu):",
          "  - Khách thanh toán trực tiếp tại khách sạn bằng tiền mặt/thẻ",
          "  - Tiền vào hotel_collects với payer_type='GUEST'",
          "  - Commission OTA sẽ được trừ vào payout tiếp theo",
          "",
          "OTA_COLLECT (OTA thu):",
          "  - OTA đã thu tiền từ khách khi đặt phòng",
          "  - Tiền sẽ về qua OTA Payout (ota_payouts)",
          "  - Khách sạn chỉ nhận số tiền net sau trừ commission",
        ],
        tips: [
          "Booking.com thường là HOTEL_COLLECT (khách trả tại khách sạn)",
          "Agoda, Expedia thường là OTA_COLLECT (đã thanh toán online)",
          "Check payment_type trước khi xử lý thu tiền để tránh thu sai"
        ]
      },
      {
        id: "manual-bookings",
        title: "Bảng manual_bookings (Booking thủ công)",
        content: "Lưu trữ booking được tạo thủ công (Direct, Walk-in, Phone, Email).",
        dataTable: {
          name: "manual_bookings",
          description: "Booking được tạo thủ công không qua OTA",
          fields: [
            { name: "unified_booking_id", type: "TEXT", description: "Mã booking thống nhất, format: MB-XXXXXX", required: true },
            { name: "source", type: "TEXT", description: "Nguồn booking: DIRECT, WALK_IN, PHONE, EMAIL, ZALO", required: true },
            { name: "guest_name", type: "TEXT", description: "Tên khách", required: true },
            { name: "guest_phone", type: "TEXT", description: "SĐT khách" },
            { name: "guest_email", type: "TEXT", description: "Email khách" },
            { name: "check_in_date", type: "DATE", description: "Ngày check-in", required: true },
            { name: "check_out_date", type: "DATE", description: "Ngày check-out", required: true },
            { name: "nights", type: "INTEGER", description: "Số đêm", required: true },
            { name: "room_type", type: "TEXT", description: "Loại phòng bán" },
            { name: "sold_room_type", type: "TEXT", description: "Loại phòng thực tế (có thể upgrade)" },
            { name: "total_amount_gross", type: "DECIMAL", description: "Tổng giá bán" },
            { name: "payment_type", type: "ENUM", description: "Luôn là HOTEL_COLLECT cho booking thủ công", required: true },
            { name: "booking_status", type: "ENUM", description: "Trạng thái booking", required: true },
            { name: "manual_property_name", type: "TEXT", description: "Tên property nội bộ" },
            { name: "note", type: "TEXT", description: "Ghi chú đặc biệt" },
            { name: "created_by", type: "UUID", description: "User tạo booking" },
          ],
          businessLogic: [
            "Booking thủ công luôn có payment_type = HOTEL_COLLECT",
            "unified_booking_id có prefix MB- để phân biệt với OTA booking (BK-)",
            "Cần gán stay và host_supply_segment sau khi tạo booking",
          ]
        }
      },
      {
        id: "booking-status-flow",
        title: "State Machine - Booking Status",
        content: "Luồng chuyển trạng thái của booking theo các sự kiện nghiệp vụ.",
        stateMachine: [
          { from: "PENDING", to: "CONFIRMED", trigger: "Xác nhận booking", conditions: "OTA gửi xác nhận hoặc tạo booking thủ công" },
          { from: "CONFIRMED", to: "CHECKED_IN", trigger: "Check-in", conditions: "Khách đến nhận phòng, có thể upload giấy tờ" },
          { from: "CHECKED_IN", to: "CHECKED_OUT", trigger: "Check-out", conditions: "Khách trả phòng, đã thanh toán đủ" },
          { from: "CONFIRMED", to: "NO_SHOW", trigger: "Đánh dấu No-show", conditions: "Khách không đến sau ngày check-in" },
          { from: "NO_SHOW", to: "CONFIRMED", trigger: "Xóa No-show", conditions: "Khách liên hệ lại, có lý do hợp lệ" },
          { from: "PENDING", to: "CANCELLED", trigger: "Hủy booking", conditions: "Khách/OTA yêu cầu hủy" },
          { from: "CONFIRMED", to: "CANCELLED", trigger: "Hủy booking", conditions: "Trong thời hạn hủy free hoặc chịu phí" },
        ],
        warnings: [
          "CHECKED_OUT là trạng thái cuối, không thể thay đổi",
          "Khi chuyển sang NO_SHOW, cần tạo no_show_records để track",
          "CANCELLED booking vẫn giữ lại trong hệ thống để đối soát"
        ]
      },
      {
        id: "booking-room-lines",
        title: "Bảng booking_room_lines_mirror",
        content: "Chi tiết từng phòng trong booking (với booking có nhiều phòng).",
        dataTable: {
          name: "booking_room_lines_mirror",
          description: "Chi tiết room line trong multi-room booking",
          fields: [
            { name: "pms_booking_id", type: "TEXT", description: "Liên kết với booking cha", required: true },
            { name: "line_key", type: "TEXT", description: "Key unique cho mỗi line", required: true },
            { name: "line_index", type: "INTEGER", description: "Số thứ tự line (0, 1, 2...)" },
            { name: "room_type", type: "TEXT", description: "Loại phòng của line này" },
            { name: "rate_plan", type: "TEXT", description: "Rate plan áp dụng" },
            { name: "check_in_date", type: "DATE", description: "Ngày check-in của line", required: true },
            { name: "check_out_date", type: "DATE", description: "Ngày check-out của line", required: true },
            { name: "nights", type: "INTEGER", description: "Số đêm của line", required: true },
            { name: "amount", type: "DECIMAL", description: "Giá tiền của line này" },
            { name: "guest_name", type: "TEXT", description: "Tên khách của line (nếu khác booking chính)" },
          ],
          businessLogic: [
            "Một booking có thể có nhiều room lines (đặt nhiều phòng cùng lúc)",
            "Mỗi line có thể có ngày check-in/out khác nhau",
            "Tổng amount các lines = total_amount của booking",
            "Sử dụng line_index để map với host_supply_segments.room_line_index"
          ]
        }
      }
    ]
  },
  {
    id: "stays-operations",
    title: "Vận hành lưu trú (Stays)",
    icon: Building2,
    description: "Quản lý quy trình check-in, check-out và phân bổ phòng host.",
    subsections: [
      {
        id: "stays-table",
        title: "Bảng stays",
        content: "Theo dõi trạng thái lưu trú thực tế của khách. Mỗi booking có 1 stay record.",
        dataTable: {
          name: "stays",
          description: "Trạng thái lưu trú của booking",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "unified_booking_id", type: "TEXT", description: "Liên kết với booking", required: true },
            { name: "stay_status", type: "stay_status ENUM", description: "Trạng thái lưu trú", required: true },
            { name: "host_room_id", type: "UUID", description: "FK đến host_rooms - phòng được gán" },
            { name: "host_room_type", type: "TEXT", description: "Loại phòng host (cache)" },
            { name: "host_property_name", type: "TEXT", description: "Tên property host (cache)" },
            { name: "host_cost", type: "DECIMAL", description: "Chi phí thuê phòng từ host" },
            { name: "actual_check_in_at", type: "TIMESTAMP", description: "Thời điểm check-in thực tế" },
            { name: "actual_check_out_at", type: "TIMESTAMP", description: "Thời điểm check-out thực tế" },
            { name: "assigned_at", type: "TIMESTAMP", description: "Thời điểm phân bổ phòng" },
            { name: "assigned_by", type: "UUID", description: "User thực hiện phân bổ phòng" },
            { name: "operation_note", type: "TEXT", description: "Ghi chú vận hành" },
          ],
          statuses: [
            { value: "WAIT_ROOM", label: "Chờ phân bổ phòng", description: "Booking mới, chưa được phân bổ phòng host", color: "outline" },
            { value: "CHECKED_IN", label: "Đã check-in", description: "Khách đã nhận phòng", color: "secondary" },
            { value: "IN_HOUSE", label: "Đang ở", description: "Khách đang lưu trú", color: "default" },
            { value: "CHECKED_OUT", label: "Đã check-out", description: "Khách đã trả phòng", color: "default" },
            { value: "NO_SHOW", label: "No-show", description: "Khách không đến", color: "destructive" },
          ],
          relationships: [
            "← bookings_mirror/manual_bookings (1:1): Mỗi stay thuộc về 1 booking",
            "→ host_rooms (n:1): Nhiều stay có thể từng dùng cùng 1 phòng",
          ],
          businessLogic: [
            "Stay được tự động tạo khi có booking mới (status = WAIT_ROOM)",
            "Phân bổ phòng: Chọn host_room → cập nhật host_room_id, assigned_at",
            "Check-in: Cập nhật actual_check_in_at, status = CHECKED_IN",
            "Check-out: Cập nhật actual_check_out_at, status = CHECKED_OUT",
          ]
        },
        stateMachine: [
          { from: "WAIT_ROOM", to: "CHECKED_IN", trigger: "Check-in", conditions: "Đã phân bổ phòng (host_room_id != null)" },
          { from: "CHECKED_IN", to: "IN_HOUSE", trigger: "Tự động sau 1 ngày", conditions: "check_in_date + 1 day" },
          { from: "IN_HOUSE", to: "CHECKED_OUT", trigger: "Check-out", conditions: "Đã thu đủ tiền" },
          { from: "WAIT_ROOM", to: "NO_SHOW", trigger: "Đánh dấu No-show", conditions: "Qua ngày check-in mà khách không đến" },
        ]
      },
      {
        id: "host-rooms",
        title: "Bảng host_rooms",
        content: "Danh sách phòng của các host/đối tác cho thuê.",
        dataTable: {
          name: "host_rooms",
          description: "Phòng của host cho thuê",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "partner_id", type: "UUID", description: "FK đến partners (host sở hữu)", required: true },
            { name: "room_code", type: "TEXT", description: "Mã phòng (VD: A101, B205)", required: true },
            { name: "room_type", type: "TEXT", description: "Loại phòng nội bộ", required: true },
            { name: "cost_per_night", type: "DECIMAL", description: "Giá thuê phòng/đêm từ host", required: true },
            { name: "active_status", type: "BOOLEAN", description: "Phòng đang hoạt động hay không" },
          ],
          businessLogic: [
            "cost_per_night là giá thuê từ host, dùng để tính host_supply_segments.nightly_rate",
            "Một partner (host) có thể có nhiều phòng",
            "Phòng inactive sẽ không hiện trong dropdown phân bổ phòng"
          ]
        }
      },
      {
        id: "guest-documents",
        title: "Bảng guest_documents",
        content: "Lưu trữ giấy tờ tùy thân của khách (CCCD, Passport) để khai báo lưu trú.",
        dataTable: {
          name: "guest_documents",
          description: "Giấy tờ tùy thân khách hàng",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "unified_booking_id", type: "TEXT", description: "Booking liên quan", required: true },
            { name: "document_type", type: "document_type ENUM", description: "Loại giấy tờ: CCCD hoặc PASSPORT", required: true },
            { name: "document_number", type: "TEXT", description: "Số CCCD/Passport" },
            { name: "guest_name", type: "TEXT", description: "Tên trên giấy tờ" },
            { name: "nationality", type: "TEXT", description: "Quốc tịch" },
            { name: "document_image", type: "TEXT", description: "URL ảnh giấy tờ (lưu trong storage)" },
            { name: "uploaded_at", type: "TIMESTAMP", description: "Thời điểm upload" },
            { name: "uploaded_by", type: "UUID", description: "User upload" },
            { name: "sent_to_host_status", type: "TEXT", description: "Trạng thái gửi cho host: PENDING, SENT" },
            { name: "sent_to_host_at", type: "TIMESTAMP", description: "Thời điểm gửi" },
          ],
          businessLogic: [
            "Upload khi check-in để khai báo lưu trú",
            "Có thể upload nhiều giấy tờ cho 1 booking (nhiều khách)",
            "Ảnh được lưu trong Supabase Storage, chỉ lưu URL trong DB"
          ]
        }
      }
    ]
  },
  {
    id: "host-supply",
    title: "Phân bổ Host (Host Supply)",
    icon: Layers,
    description: "Phân bổ booking cho các host/đối tác cho thuê phòng.",
    subsections: [
      {
        id: "host-supply-segments",
        title: "Bảng host_supply_segments",
        content: "Phân bổ chi phí phòng cho từng host. Một booking có thể có nhiều segment (nhiều host cung cấp phòng).",
        dataTable: {
          name: "host_supply_segments",
          description: "Phân bổ chi phí cho host theo segment",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "unified_booking_id", type: "TEXT", description: "Booking liên quan", required: true },
            { name: "partner_id", type: "UUID", description: "FK đến partners (host)", required: true },
            { name: "host_room_id", type: "UUID", description: "FK đến host_rooms" },
            { name: "room_code", type: "TEXT", description: "Mã phòng (cache)" },
            { name: "host_room_type", type: "TEXT", description: "Loại phòng (cache)" },
            { name: "host_property_name", type: "TEXT", description: "Tên property (cache)" },
            { name: "date_from", type: "DATE", description: "Ngày bắt đầu segment", required: true },
            { name: "date_to", type: "DATE", description: "Ngày kết thúc segment", required: true },
            { name: "nights", type: "INTEGER", description: "Số đêm = date_to - date_from", required: true },
            { name: "nightly_rate", type: "DECIMAL", description: "Giá thuê/đêm từ host", required: true },
            { name: "total_amount", type: "DECIMAL", description: "Tổng = nights × nightly_rate", required: true },
            { name: "room_line_index", type: "INTEGER", description: "Index của room line (với multi-room booking)" },
            { name: "settlement_id", type: "UUID", description: "FK đến host_settlements khi đã quyết toán" },
            { name: "locked_at", type: "TIMESTAMP", description: "Thời điểm lock (không thể sửa sau khi quyết toán)" },
            { name: "note", type: "TEXT", description: "Ghi chú" },
          ],
          businessLogic: [
            "Khi phân bổ phòng trong stays, tự động tạo host_supply_segment với toàn bộ thời gian booking",
            "Có thể chia nhỏ segment nếu khách đổi phòng giữa chừng",
            "total_amount = nights × nightly_rate",
            "Sau khi quyết toán (settlement_id != null), segment bị lock không thể sửa/xóa",
            "Segment này là cơ sở để tính host_payables"
          ]
        },
        formulas: [
          { name: "Total Amount", formula: "total_amount = nights × nightly_rate", description: "Tổng chi phí thuê host cho segment" },
          { name: "Nights", formula: "nights = date_to - date_from", description: "Số đêm của segment" },
        ]
      },
      {
        id: "extra-charges",
        title: "Bảng extra_charges (Chi phí phát sinh)",
        content: "Các khoản chi phí phát sinh ngoài tiền phòng (dọn dẹp, hư hỏng, v.v.) tính cho host.",
        dataTable: {
          name: "extra_charges",
          description: "Chi phí phát sinh tính cho host",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "unified_booking_id", type: "TEXT", description: "Booking liên quan", required: true },
            { name: "partner_id", type: "UUID", description: "Host chịu chi phí", required: true },
            { name: "charge_type", type: "TEXT", description: "Loại: CLEANING, DAMAGE, EARLY_CHECKIN, LATE_CHECKOUT, OTHER", required: true },
            { name: "amount", type: "DECIMAL", description: "Số tiền", required: true },
            { name: "description", type: "TEXT", description: "Mô tả chi tiết" },
            { name: "settlement_id", type: "UUID", description: "FK đến host_settlements" },
          ],
          businessLogic: [
            "Extra charges được cộng vào host_payables",
            "Nếu số dương: Host phải trả thêm (VD: phí dọn dẹp)",
            "Nếu số âm: Trừ vào tiền host nhận (VD: bù trừ hư hỏng)"
          ]
        }
      },
      {
        id: "host-surcharges",
        title: "Bảng host_surcharges",
        content: "Các khoản thu phí phát sinh từ khách mà host thu hộ (VD: phí hư hỏng khách trả).",
        dataTable: {
          name: "host_surcharges",
          description: "Phí phát sinh host thu từ khách",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "unified_booking_id", type: "TEXT", description: "Booking liên quan", required: true },
            { name: "host_partner_id", type: "UUID", description: "Host thu tiền", required: true },
            { name: "surcharge_type", type: "TEXT", description: "Loại: DAMAGE, LOST_KEY, CLEANING, OTHER", required: true },
            { name: "amount", type: "DECIMAL", description: "Số tiền thu", required: true },
            { name: "description", type: "TEXT", description: "Mô tả" },
            { name: "collector_type", type: "TEXT", description: "Ai thu: HOST hoặc HOTEL" },
            { name: "status", type: "TEXT", description: "Trạng thái: PENDING, COLLECTED" },
            { name: "collected_at", type: "TIMESTAMP", description: "Thời điểm thu" },
            { name: "settlement_id", type: "UUID", description: "FK khi đã quyết toán" },
          ],
          businessLogic: [
            "Nếu collector_type = HOST: Host đã thu, khoản này trừ vào tiền phải trả host",
            "Nếu collector_type = HOTEL: Khách sạn thu, cần chuyển cho host sau",
            "Được tính vào host_payables khi quyết toán"
          ]
        }
      }
    ]
  },
  {
    id: "partners",
    title: "Đối tác (Partners)",
    icon: Handshake,
    description: "Quản lý thông tin host cho thuê phòng và đối tác dịch vụ.",
    subsections: [
      {
        id: "partners-table",
        title: "Bảng partners",
        content: "Lưu trữ thông tin các đối tác: Host (chủ căn hộ) và Service Partners (đối tác dịch vụ).",
        dataTable: {
          name: "partners",
          description: "Thông tin đối tác",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "partner_code", type: "TEXT", description: "Mã đối tác (VD: HOST001, SVC001)", required: true },
            { name: "partner_name", type: "TEXT", description: "Tên đối tác/công ty", required: true },
            { name: "partner_type", type: "partner_type ENUM", description: "Loại đối tác", required: true },
            { name: "contact_name", type: "TEXT", description: "Người liên hệ" },
            { name: "contact_phone", type: "TEXT", description: "SĐT liên hệ" },
            { name: "contact_email", type: "TEXT", description: "Email liên hệ" },
            { name: "bank_name", type: "TEXT", description: "Tên ngân hàng" },
            { name: "bank_account_number", type: "TEXT", description: "Số tài khoản" },
            { name: "bank_account_name", type: "TEXT", description: "Tên chủ tài khoản" },
            { name: "tax_code", type: "TEXT", description: "Mã số thuế" },
            { name: "commission_rate", type: "DECIMAL", description: "Tỷ lệ commission (nếu có)" },
            { name: "payment_terms_days", type: "INTEGER", description: "Số ngày thanh toán (VD: 15, 30)" },
            { name: "is_active", type: "BOOLEAN", description: "Đang hoạt động" },
          ],
          statuses: [
            { value: "HOST_LANDLORD", label: "Chủ căn hộ", description: "Chủ sở hữu cho thuê dài hạn" },
            { value: "HOST_OPERATOR", label: "Vận hành", description: "Đơn vị vận hành/quản lý" },
            { value: "SERVICE_PICKUP", label: "Dịch vụ đưa đón", description: "Đối tác airport pickup" },
            { value: "SERVICE_TOUR", label: "Dịch vụ tour", description: "Đối tác tour du lịch" },
            { value: "SERVICE_OTHER", label: "Dịch vụ khác", description: "Đối tác dịch vụ khác" },
          ],
          businessLogic: [
            "HOST_LANDLORD và HOST_OPERATOR dùng cho host_supply_segments, host_payables",
            "SERVICE_* dùng cho service_orders, service_payables",
            "bank_* fields bắt buộc để chi tiền qua ngân hàng",
            "payment_terms_days quyết định due_date của payables"
          ]
        }
      }
    ]
  },
  {
    id: "collections",
    title: "Thu tiền (Collections)",
    icon: DollarSign,
    description: "Ghi nhận các khoản thu từ khách hàng, OTA và các nguồn khác.",
    subsections: [
      {
        id: "hotel-collects",
        title: "Bảng hotel_collects",
        content: "Ghi nhận tất cả các khoản thu tiền liên quan đến booking.",
        dataTable: {
          name: "hotel_collects",
          description: "Khoản thu tiền từ khách/OTA",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "unified_booking_id", type: "TEXT", description: "Booking liên quan", required: true },
            { name: "amount_collected", type: "DECIMAL", description: "Số tiền thu", required: true },
            { name: "payment_method", type: "TEXT", description: "Phương thức: CASH, CARD, BANK_TRANSFER, OTA_PAYOUT", required: true },
            { name: "collection_type", type: "TEXT", description: "Loại thu: ROOM_CHARGE, DEPOSIT, SURCHARGE, REFUND", required: true },
            { name: "payer_type", type: "TEXT", description: "Ai trả: GUEST, OTA, HOST", required: true },
            { name: "payee_type", type: "TEXT", description: "Ai nhận: HOTEL, HOST", required: true },
            { name: "collected_at", type: "TIMESTAMP", description: "Thời điểm thu" },
            { name: "collected_by", type: "UUID", description: "User thu tiền" },
            { name: "receipt", type: "TEXT", description: "Số biên lai/hóa đơn" },
            { name: "note", type: "TEXT", description: "Ghi chú" },
            { name: "status", type: "TEXT", description: "Trạng thái: ACTIVE, VOIDED, REFUNDED" },
            { name: "voided_at", type: "TIMESTAMP", description: "Thời điểm void (nếu có)" },
            { name: "related_type", type: "TEXT", description: "Loại liên kết: BOOKING, PAYOUT, SURCHARGE" },
            { name: "related_id", type: "TEXT", description: "ID của bản ghi liên quan" },
            { name: "source_payout_id", type: "UUID", description: "FK đến ota_payouts (nếu thu từ OTA)" },
          ],
          businessLogic: [
            "collection_type = ROOM_CHARGE: Thu tiền phòng",
            "collection_type = DEPOSIT: Thu đặt cọc",
            "collection_type = SURCHARGE: Thu phí phát sinh",
            "collection_type = REFUND: Hoàn tiền (amount âm)",
            "payer_type + payee_type xác định luồng tiền",
            "Khi void: status = VOIDED, không xóa record"
          ]
        },
        formulas: [
          { name: "Total Collected", formula: "SUM(amount_collected) WHERE unified_booking_id = X AND status = ACTIVE", description: "Tổng đã thu cho booking" },
          { name: "Outstanding", formula: "booking.total_amount_gross - Total Collected", description: "Số tiền còn phải thu" },
        ]
      },
      {
        id: "collection-logic",
        title: "Logic thu tiền theo Payment Type",
        content: "Xử lý thu tiền khác nhau tùy vào hình thức thanh toán của booking.",
        steps: [
          "=== HOTEL_COLLECT (Khách sạn thu) ===",
          "1. Khi check-in: Thu tiền phòng từ khách (payer_type = GUEST)",
          "2. Ghi nhận: hotel_collects với payment_method = CASH/CARD",
          "3. Tiền vào: cashflow_entries với direction = IN",
          "",
          "=== OTA_COLLECT (OTA thu) ===",
          "1. OTA đã thu tiền từ khách khi đặt phòng",
          "2. Đợi OTA chuyển tiền (ota_payouts)",
          "3. Khi nhận payout: Tạo hotel_collects với source_payout_id",
          "4. Ghi nhận: payment_method = OTA_PAYOUT, payer_type = OTA",
        ],
        tips: [
          "Với HOTEL_COLLECT, cần thu đủ tiền trước khi check-out",
          "Với OTA_COLLECT, tiền sẽ về sau qua payout, không cần thu tại chỗ",
          "Kiểm tra payment_type trước khi tạo collection"
        ]
      }
    ]
  },
  {
    id: "ota-reconciliation",
    title: "Đối soát OTA",
    icon: CreditCard,
    description: "Quản lý payout từ OTA và đối soát chênh lệch.",
    subsections: [
      {
        id: "ota-payouts",
        title: "Bảng ota_payouts",
        content: "Theo dõi các đợt thanh toán từ OTA (Booking.com, Agoda, Expedia...).",
        dataTable: {
          name: "ota_payouts",
          description: "Đợt thanh toán từ OTA",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "payout_code", type: "TEXT", description: "Mã payout (VD: PO-2024-001)", required: true },
            { name: "ota_source", type: "TEXT", description: "OTA nguồn: Booking.com, Agoda...", required: true },
            { name: "payout_date", type: "DATE", description: "Ngày nhận tiền", required: true },
            { name: "expected_amount", type: "DECIMAL", description: "Số tiền kỳ vọng (tổng các booking)" },
            { name: "actual_amount", type: "DECIMAL", description: "Số tiền thực nhận", required: true },
            { name: "currency", type: "TEXT", description: "Loại tiền: VND, USD" },
            { name: "variance_amount", type: "DECIMAL", description: "Chênh lệch = actual - expected" },
            { name: "status", type: "payout_status ENUM", description: "Trạng thái payout", required: true },
            { name: "bank_reference", type: "TEXT", description: "Mã giao dịch ngân hàng" },
            { name: "note", type: "TEXT", description: "Ghi chú" },
          ],
          statuses: [
            { value: "PENDING", label: "Chờ nhận", description: "Đã tạo, chờ tiền về" },
            { value: "RECEIVED", label: "Đã nhận đủ", description: "Đã nhận đủ tiền, khớp số liệu" },
            { value: "PARTIAL", label: "Nhận một phần", description: "Số tiền nhận ít hơn kỳ vọng" },
            { value: "DISPUTED", label: "Có tranh chấp", description: "Có chênh lệch cần xử lý" },
          ],
          businessLogic: [
            "Tạo payout khi nhận tiền từ OTA",
            "Thêm booking vào payout qua ota_payout_bookings",
            "expected_amount = SUM(booking.total_amount_net)",
            "variance_amount = actual_amount - expected_amount",
            "Nếu variance < 0: Tạo dispute để theo dõi"
          ]
        }
      },
      {
        id: "ota-payout-bookings",
        title: "Bảng ota_payout_bookings",
        content: "Liên kết giữa payout và các booking được thanh toán.",
        dataTable: {
          name: "ota_payout_bookings",
          description: "Mapping payout - booking",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "payout_id", type: "UUID", description: "FK đến ota_payouts", required: true },
            { name: "unified_booking_id", type: "TEXT", description: "Booking được thanh toán", required: true },
            { name: "expected_amount", type: "DECIMAL", description: "Số tiền kỳ vọng từ booking" },
            { name: "actual_amount", type: "DECIMAL", description: "Số tiền thực nhận" },
            { name: "variance_amount", type: "DECIMAL", description: "Chênh lệch" },
            { name: "variance_reason", type: "TEXT", description: "Lý do chênh lệch" },
          ],
          businessLogic: [
            "Mỗi booking chỉ thuộc 1 payout",
            "expected_amount lấy từ booking.total_amount_net",
            "actual_amount do user nhập khi đối soát",
            "Chênh lệch cần tạo dispute nếu đáng kể"
          ]
        }
      },
      {
        id: "ota-disputes",
        title: "Bảng ota_disputes",
        content: "Theo dõi các tranh chấp với OTA về số tiền, hủy phòng, no-show...",
        dataTable: {
          name: "ota_disputes",
          description: "Tranh chấp với OTA",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "unified_booking_id", type: "TEXT", description: "Booking liên quan", required: true },
            { name: "payout_id", type: "UUID", description: "Payout liên quan (nếu có)" },
            { name: "dispute_type", type: "TEXT", description: "Loại: COMMISSION_MISMATCH, CANCELLATION_FEE, NO_SHOW, RATE_VARIANCE...", required: true },
            { name: "amount_in_dispute", type: "DECIMAL", description: "Số tiền tranh chấp", required: true },
            { name: "status", type: "dispute_status ENUM", description: "Trạng thái", required: true },
            { name: "opened_at", type: "TIMESTAMP", description: "Thời điểm mở dispute" },
            { name: "closed_at", type: "TIMESTAMP", description: "Thời điểm đóng" },
            { name: "resolution_note", type: "TEXT", description: "Ghi chú kết quả xử lý" },
            { name: "assigned_to", type: "UUID", description: "User phụ trách" },
          ],
          statuses: [
            { value: "OPEN", label: "Đang mở", description: "Mới tạo, chưa xử lý" },
            { value: "IN_REVIEW", label: "Đang xử lý", description: "Đang liên hệ OTA" },
            { value: "WON", label: "Thắng", description: "OTA hoàn tiền/bù trừ" },
            { value: "LOST", label: "Thua", description: "Không thu được tiền" },
            { value: "PARTIAL", label: "Thu một phần", description: "Thu được một phần số tiền" },
            { value: "CLOSED", label: "Đã đóng", description: "Hoàn tất xử lý" },
          ]
        }
      }
    ]
  },
  {
    id: "host-payables",
    title: "Công nợ Host (Host Payables)",
    icon: PiggyBank,
    description: "Tính toán và quản lý công nợ phải trả cho host.",
    subsections: [
      {
        id: "host-payables-table",
        title: "Bảng host_payables",
        content: "Tổng hợp công nợ phải trả cho mỗi host theo từng booking.",
        dataTable: {
          name: "host_payables",
          description: "Công nợ phải trả host",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "unified_booking_id", type: "TEXT", description: "Booking liên quan", required: true },
            { name: "partner_id", type: "UUID", description: "Host nhận tiền", required: true },
            { name: "payable_amount", type: "DECIMAL", description: "Tổng phải trả (room + extra - surcharge)", required: true },
            { name: "paid_amount", type: "DECIMAL", description: "Đã thanh toán", required: true },
            { name: "deposited_amount", type: "DECIMAL", description: "Đã áp dụng từ deposit" },
            { name: "prepaid_amount", type: "DECIMAL", description: "Đã áp dụng từ prepaid" },
            { name: "remaining_amount", type: "DECIMAL", description: "Còn phải trả" },
            { name: "due_date", type: "DATE", description: "Ngày đến hạn thanh toán" },
            { name: "status", type: "payable_status ENUM", description: "Trạng thái", required: true },
            { name: "collection_responsibility", type: "TEXT", description: "Ai chịu trách nhiệm thu: HOTEL hoặc HOST" },
            { name: "locked_at", type: "TIMESTAMP", description: "Thời điểm lock" },
          ],
          statuses: [
            { value: "PENDING", label: "Chờ thanh toán", description: "Chưa thanh toán" },
            { value: "PARTIAL", label: "Thanh toán một phần", description: "Đã trả một phần" },
            { value: "PAID", label: "Đã thanh toán", description: "Đã thanh toán đủ" },
            { value: "OVERDUE", label: "Quá hạn", description: "Quá due_date chưa thanh toán" },
          ],
          businessLogic: [
            "Được tự động tạo/cập nhật từ host_supply_segments",
            "payable_amount = SUM(segments.total_amount) + SUM(extra_charges) - SUM(host_surcharges WHERE collector = HOST)",
            "remaining_amount = payable_amount - paid_amount - deposited_amount - prepaid_amount",
            "due_date = check_out_date + partner.payment_terms_days"
          ]
        },
        formulas: [
          { name: "Payable Amount", formula: "SUM(host_supply_segments.total_amount) + SUM(extra_charges.amount) - SUM(host_surcharges.amount WHERE collector_type = HOST)", description: "Tổng phải trả host" },
          { name: "Remaining Amount", formula: "payable_amount - paid_amount - deposited_amount - prepaid_amount", description: "Còn phải trả" },
          { name: "Due Date", formula: "booking.check_out_date + partner.payment_terms_days", description: "Ngày đến hạn" },
        ]
      },
      {
        id: "host-deposits",
        title: "Bảng host_deposits",
        content: "Quản lý tiền đặt cọc từ host (host trả trước cho khách sạn).",
        dataTable: {
          name: "host_deposits",
          description: "Tiền đặt cọc từ host",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "unified_booking_id", type: "TEXT", description: "Booking liên quan", required: true },
            { name: "partner_id", type: "UUID", description: "Host đặt cọc", required: true },
            { name: "deposit_amount", type: "DECIMAL", description: "Số tiền đặt cọc", required: true },
            { name: "deposit_date", type: "DATE", description: "Ngày đặt cọc", required: true },
            { name: "status", type: "deposit_status ENUM", description: "Trạng thái", required: true },
            { name: "approval_status", type: "TEXT", description: "Trạng thái phê duyệt: PENDING, APPROVED, REJECTED" },
            { name: "applied_to_payable_id", type: "UUID", description: "FK đến host_payables khi áp dụng" },
            { name: "applied_at", type: "TIMESTAMP", description: "Thời điểm áp dụng" },
            { name: "refunded_at", type: "TIMESTAMP", description: "Thời điểm hoàn trả (nếu có)" },
            { name: "note", type: "TEXT", description: "Ghi chú" },
          ],
          statuses: [
            { value: "HELD", label: "Đang giữ", description: "Tiền đang được giữ" },
            { value: "OFFSET", label: "Đã bù trừ", description: "Đã áp dụng vào payable" },
            { value: "REFUNDED", label: "Đã hoàn", description: "Đã hoàn trả cho host" },
            { value: "FORFEITED", label: "Tịch thu", description: "Bị giữ lại do vi phạm" },
          ],
          businessLogic: [
            "Host đặt cọc trước để đảm bảo booking",
            "Khi quyết toán, có thể áp dụng deposit vào payable",
            "Deposit được áp dụng: payable.deposited_amount += deposit.amount",
            "Cần approval trước khi áp dụng hoặc hoàn tiền"
          ]
        }
      },
      {
        id: "host-settlements",
        title: "Bảng host_settlements",
        content: "Đợt quyết toán công nợ với host (gom nhiều booking).",
        dataTable: {
          name: "host_settlements",
          description: "Đợt quyết toán host",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "settlement_code", type: "TEXT", description: "Mã quyết toán (VD: STL-2024-001)", required: true },
            { name: "partner_id", type: "UUID", description: "Host được quyết toán", required: true },
            { name: "period_from", type: "DATE", description: "Từ ngày", required: true },
            { name: "period_to", type: "DATE", description: "Đến ngày", required: true },
            { name: "total_booking_revenue", type: "DECIMAL", description: "Tổng doanh thu booking" },
            { name: "total_payable_amount", type: "DECIMAL", description: "Tổng phải trả" },
            { name: "total_host_collected", type: "DECIMAL", description: "Tổng host đã thu hộ" },
            { name: "total_deposits_applied", type: "DECIMAL", description: "Tổng deposit áp dụng" },
            { name: "total_prepaids_applied", type: "DECIMAL", description: "Tổng prepaid áp dụng" },
            { name: "total_paid_amount", type: "DECIMAL", description: "Tổng đã thanh toán" },
            { name: "remaining_amount", type: "DECIMAL", description: "Còn phải trả" },
            { name: "status", type: "TEXT", description: "DRAFT, FINALIZED, CLOSED", required: true },
            { name: "finalized_at", type: "TIMESTAMP", description: "Thời điểm chốt" },
            { name: "finalized_by", type: "UUID", description: "User chốt" },
          ],
          businessLogic: [
            "Gom nhiều host_payables vào 1 settlement",
            "Khi finalize: Lock tất cả payables, segments, extra_charges",
            "remaining_amount = total_payable_amount - total_host_collected - total_deposits_applied - total_prepaids_applied - total_paid_amount",
            "Tạo payment_request để chi tiền còn lại"
          ]
        },
        formulas: [
          { name: "Remaining", formula: "total_payable_amount - total_host_collected - total_deposits_applied - total_prepaids_applied - total_paid_amount", description: "Số tiền còn phải thanh toán cho host" },
        ]
      }
    ]
  },
  {
    id: "payments-cashflow",
    title: "Thanh toán & Dòng tiền",
    icon: Wallet,
    description: "Quản lý đề xuất thanh toán, chi tiền và dòng tiền.",
    subsections: [
      {
        id: "payment-requests",
        title: "Bảng payment_requests",
        content: "Đề xuất thanh toán chờ phê duyệt.",
        dataTable: {
          name: "payment_requests",
          description: "Đề xuất thanh toán",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "request_code", type: "TEXT", description: "Mã đề xuất (VD: PR-2024-001)", required: true },
            { name: "request_type", type: "TEXT", description: "Loại: HOST_SETTLEMENT, SERVICE_PAYMENT, REFUND, OTHER", required: true },
            { name: "partner_id", type: "UUID", description: "Đối tác nhận tiền" },
            { name: "amount", type: "DECIMAL", description: "Số tiền đề xuất", required: true },
            { name: "currency", type: "TEXT", description: "Loại tiền" },
            { name: "status", type: "TEXT", description: "PENDING, APPROVED, REJECTED, PAID", required: true },
            { name: "requested_by", type: "UUID", description: "User tạo đề xuất", required: true },
            { name: "requested_at", type: "TIMESTAMP", description: "Thời điểm tạo" },
            { name: "approved_by", type: "UUID", description: "User phê duyệt" },
            { name: "approved_at", type: "TIMESTAMP", description: "Thời điểm phê duyệt" },
            { name: "rejection_reason", type: "TEXT", description: "Lý do từ chối (nếu rejected)" },
            { name: "related_type", type: "TEXT", description: "Loại liên kết: SETTLEMENT, SERVICE_ORDER..." },
            { name: "related_id", type: "TEXT", description: "ID bản ghi liên quan" },
            { name: "bank_name", type: "TEXT", description: "Ngân hàng nhận" },
            { name: "bank_account_number", type: "TEXT", description: "Số tài khoản" },
            { name: "bank_account_name", type: "TEXT", description: "Tên chủ TK" },
          ],
          businessLogic: [
            "Tạo từ host_settlements, service_orders, hoặc thủ công",
            "Cần phê duyệt trước khi chi tiền",
            "Sau khi APPROVED, chuyển sang cash_outs để chi",
            "Có thể yêu cầu approval nhiều cấp tùy số tiền"
          ]
        }
      },
      {
        id: "cash-outs",
        title: "Bảng cash_outs",
        content: "Ghi nhận chi tiền thực tế.",
        dataTable: {
          name: "cash_outs",
          description: "Chi tiền thực tế",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "payment_request_id", type: "UUID", description: "FK đến payment_requests", required: true },
            { name: "amount", type: "DECIMAL", description: "Số tiền chi", required: true },
            { name: "currency", type: "TEXT", description: "Loại tiền" },
            { name: "payment_method", type: "TEXT", description: "Phương thức: BANK_TRANSFER, CASH, MOMO, ZALO_PAY", required: true },
            { name: "paid_at", type: "TIMESTAMP", description: "Thời điểm chi", required: true },
            { name: "paid_by", type: "UUID", description: "User thực hiện" },
            { name: "transfer_reference", type: "TEXT", description: "Mã giao dịch ngân hàng" },
            { name: "bank_name", type: "TEXT", description: "Ngân hàng" },
            { name: "bank_account_number", type: "TEXT", description: "Số TK" },
            { name: "bank_account_name", type: "TEXT", description: "Tên chủ TK" },
            { name: "recipient_name", type: "TEXT", description: "Người nhận" },
            { name: "note", type: "TEXT", description: "Ghi chú" },
            { name: "is_out_of_process", type: "BOOLEAN", description: "Chi ngoài quy trình" },
            { name: "out_of_process_reason", type: "TEXT", description: "Lý do chi ngoài" },
          ],
          businessLogic: [
            "Tạo sau khi payment_request được APPROVED",
            "Cập nhật host_payables.paid_amount sau khi chi",
            "Tạo cashflow_entries với direction = OUT",
            "is_out_of_process = true: Chi khẩn cấp không qua approval"
          ]
        }
      },
      {
        id: "cashflow-entries",
        title: "Bảng cashflow_entries",
        content: "Ghi nhận mọi dòng tiền vào/ra của doanh nghiệp.",
        dataTable: {
          name: "cashflow_entries",
          description: "Dòng tiền vào/ra",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "cash_date", type: "DATE", description: "Ngày giao dịch", required: true },
            { name: "direction", type: "TEXT", description: "Hướng: IN (thu) hoặc OUT (chi)", required: true },
            { name: "amount", type: "DECIMAL", description: "Số tiền (luôn dương)", required: true },
            { name: "currency", type: "TEXT", description: "Loại tiền" },
            { name: "source_type", type: "TEXT", description: "Nguồn: COLLECTION, PAYOUT, CASH_OUT, MANUAL", required: true },
            { name: "source_id", type: "TEXT", description: "ID bản ghi nguồn" },
            { name: "counterparty_type", type: "TEXT", description: "Đối tác: GUEST, OTA, HOST, VENDOR", required: true },
            { name: "counterparty_id", type: "TEXT", description: "ID đối tác" },
            { name: "note", type: "TEXT", description: "Ghi chú" },
            { name: "created_by", type: "UUID", description: "User tạo" },
          ],
          businessLogic: [
            "Tự động tạo từ hotel_collects (direction=IN), cash_outs (direction=OUT)",
            "Dùng để tạo báo cáo cashflow",
            "SUM(IN) - SUM(OUT) = Net Cashflow",
          ]
        }
      }
    ]
  },
  {
    id: "channel-manager",
    title: "Channel Manager & Mapping",
    icon: Link2,
    description: "Kết nối Channex và mapping dữ liệu giữa OTA và hệ thống nội bộ.",
    subsections: [
      {
        id: "mapping-overview",
        title: "Tổng quan Mapping",
        content: "Hệ thống mapping kết nối dữ liệu từ Channex (OTA) với dữ liệu nội bộ theo 3 cấp: Property → Room Type → Rate Plan.",
        steps: [
          "1. PROPERTY MAPPING: channex_property_id ↔ internal_property_id (host_properties)",
          "2. ROOM TYPE MAPPING: channex_room_type_id ↔ internal_room_type_id (host_room_types)",
          "3. RATE PLAN MAPPING: channex_rate_plan_id ↔ internal_rate_plan_id (rate_plans)",
        ],
        tips: [
          "Mapping đúng giúp đồng bộ inventory chính xác",
          "Nếu mapping lỗi, booking có thể không được xử lý đúng",
          "Kiểm tra mapping status định kỳ"
        ]
      },
      {
        id: "property-mappings",
        title: "Bảng property_mappings",
        content: "Liên kết property từ Channex với host_properties nội bộ.",
        dataTable: {
          name: "property_mappings",
          description: "Mapping property",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "channex_property_id", type: "TEXT", description: "ID property trong Channex", required: true },
            { name: "channex_user_id", type: "TEXT", description: "User Channex sở hữu" },
            { name: "internal_property_id", type: "UUID", description: "FK đến host_properties" },
            { name: "property_name", type: "TEXT", description: "Tên property" },
            { name: "status", type: "mapping_status ENUM", description: "Trạng thái mapping", required: true },
            { name: "validation_error", type: "TEXT", description: "Lỗi validation (nếu có)" },
            { name: "last_validated_at", type: "TIMESTAMP", description: "Lần validate cuối" },
          ],
          statuses: [
            { value: "MAPPED", label: "Đã map", description: "Đã liên kết thành công" },
            { value: "NOT_MAPPED", label: "Chưa map", description: "Chưa liên kết" },
            { value: "CONFLICT", label: "Xung đột", description: "Có xung đột dữ liệu" },
            { value: "INVALID", label: "Không hợp lệ", description: "Mapping không hợp lệ" },
          ]
        }
      },
      {
        id: "room-type-mappings",
        title: "Bảng room_type_mappings",
        content: "Liên kết room type từ Channex với host_room_types nội bộ.",
        dataTable: {
          name: "room_type_mappings",
          description: "Mapping room type",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "property_mapping_id", type: "UUID", description: "FK đến property_mappings", required: true },
            { name: "channex_room_type_id", type: "TEXT", description: "ID room type trong Channex", required: true },
            { name: "internal_room_type_id", type: "UUID", description: "FK đến host_room_types" },
            { name: "room_type_name", type: "TEXT", description: "Tên room type" },
            { name: "occupancy", type: "INTEGER", description: "Số người tối đa" },
            { name: "status", type: "mapping_status ENUM", description: "Trạng thái", required: true },
          ]
        }
      },
      {
        id: "rate-plan-mappings",
        title: "Bảng rate_plan_mappings",
        content: "Liên kết rate plan từ Channex với rate_plans nội bộ.",
        dataTable: {
          name: "rate_plan_mappings",
          description: "Mapping rate plan",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "room_type_mapping_id", type: "UUID", description: "FK đến room_type_mappings", required: true },
            { name: "channex_rate_plan_id", type: "TEXT", description: "ID rate plan trong Channex", required: true },
            { name: "internal_rate_plan_id", type: "UUID", description: "FK đến rate_plans" },
            { name: "rate_plan_name", type: "TEXT", description: "Tên rate plan" },
            { name: "channel_code", type: "TEXT", description: "Kênh áp dụng (nếu specific)" },
            { name: "sell_mode", type: "TEXT", description: "Per room hoặc Per person" },
            { name: "currency", type: "TEXT", description: "Loại tiền" },
            { name: "status", type: "mapping_status ENUM", description: "Trạng thái", required: true },
          ]
        }
      },
      {
        id: "inventory-cells",
        title: "Bảng inventory_cells",
        content: "Lưu trữ giá và availability theo ngày cho mỗi room type / rate plan.",
        dataTable: {
          name: "inventory_cells",
          description: "Inventory theo ngày",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "cell_key", type: "TEXT", description: "Key unique: propertyId_roomTypeId_ratePlanId_date", required: true },
            { name: "property_mapping_id", type: "UUID", description: "FK đến property_mappings", required: true },
            { name: "room_type_mapping_id", type: "UUID", description: "FK đến room_type_mappings", required: true },
            { name: "rate_plan_mapping_id", type: "UUID", description: "FK đến rate_plan_mappings" },
            { name: "cell_date", type: "DATE", description: "Ngày áp dụng", required: true },
            { name: "rate", type: "DECIMAL", description: "Giá bán" },
            { name: "availability", type: "INTEGER", description: "Số phòng còn trống" },
            { name: "min_stay", type: "INTEGER", description: "Số đêm tối thiểu" },
            { name: "max_stay", type: "INTEGER", description: "Số đêm tối đa" },
            { name: "closed_to_arrival", type: "BOOLEAN", description: "Không cho check-in ngày này" },
            { name: "closed_to_departure", type: "BOOLEAN", description: "Không cho check-out ngày này" },
            { name: "stop_sell", type: "BOOLEAN", description: "Đóng bán" },
            { name: "synced_at", type: "TIMESTAMP", description: "Lần sync cuối" },
            { name: "sync_status", type: "TEXT", description: "SYNCED, PENDING, FAILED" },
            { name: "local_version", type: "INTEGER", description: "Version local" },
            { name: "remote_version", type: "INTEGER", description: "Version từ Channex" },
          ],
          businessLogic: [
            "Mỗi cell là 1 ngày cho 1 rate plan của 1 room type",
            "Khi cập nhật local, local_version tăng",
            "Sync lên Channex: Gọi API → Cập nhật remote_version, synced_at",
            "Conflict: local_version != remote_version → Cần resolve"
          ]
        }
      }
    ]
  },
  {
    id: "services",
    title: "Dịch vụ (Services)",
    icon: Plane,
    description: "Quản lý đơn dịch vụ đưa đón, tour và addon.",
    subsections: [
      {
        id: "service-orders",
        title: "Bảng service_orders",
        content: "Đơn đặt dịch vụ từ khách (airport pickup, tour...).",
        dataTable: {
          name: "service_orders",
          description: "Đơn dịch vụ",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "order_code", type: "TEXT", description: "Mã đơn (VD: SVC-2024-001)", required: true },
            { name: "unified_booking_id", type: "TEXT", description: "Booking liên quan (nếu có)" },
            { name: "service_type", type: "service_type ENUM", description: "Loại dịch vụ", required: true },
            { name: "partner_id", type: "UUID", description: "Đối tác thực hiện" },
            { name: "customer_name", type: "TEXT", description: "Tên khách", required: true },
            { name: "customer_phone", type: "TEXT", description: "SĐT khách" },
            { name: "service_date", type: "DATE", description: "Ngày thực hiện", required: true },
            { name: "service_time", type: "TIME", description: "Giờ thực hiện" },
            { name: "pickup_location", type: "TEXT", description: "Điểm đón (với PICKUP)" },
            { name: "dropoff_location", type: "TEXT", description: "Điểm trả" },
            { name: "flight_number", type: "TEXT", description: "Số chuyến bay (với PICKUP)" },
            { name: "pax_count", type: "INTEGER", description: "Số khách" },
            { name: "selling_price", type: "DECIMAL", description: "Giá bán khách" },
            { name: "cost_price", type: "DECIMAL", description: "Giá cost (trả đối tác)" },
            { name: "profit", type: "DECIMAL", description: "Lợi nhuận = selling - cost" },
            { name: "status", type: "service_status ENUM", description: "Trạng thái", required: true },
            { name: "driver_name", type: "TEXT", description: "Tên tài xế" },
            { name: "driver_phone", type: "TEXT", description: "SĐT tài xế" },
            { name: "vehicle_plate", type: "TEXT", description: "Biển số xe" },
            { name: "note", type: "TEXT", description: "Ghi chú" },
          ],
          statuses: [
            { value: "NEW", label: "Mới", description: "Vừa tạo, chưa xác nhận" },
            { value: "CONFIRMED", label: "Đã xác nhận", description: "Đã xác nhận với đối tác" },
            { value: "ASSIGNED", label: "Đã gán xe", description: "Đã gán tài xế/xe" },
            { value: "DONE", label: "Hoàn thành", description: "Đã thực hiện xong" },
            { value: "CANCELLED", label: "Đã hủy", description: "Đơn bị hủy" },
            { value: "NO_SHOW", label: "No-show", description: "Khách không đến" },
          ]
        }
      }
    ]
  },
  {
    id: "audit-system",
    title: "Kiểm soát & Audit",
    icon: Shield,
    description: "Ghi nhật ký thao tác và kiểm soát hệ thống.",
    subsections: [
      {
        id: "audit-logs",
        title: "Bảng audit_logs",
        content: "Ghi lại tất cả thao tác thay đổi dữ liệu trong hệ thống.",
        dataTable: {
          name: "audit_logs",
          description: "Nhật ký thao tác",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "user_id", type: "UUID", description: "User thực hiện" },
            { name: "action", type: "TEXT", description: "Hành động: CREATE, UPDATE, DELETE", required: true },
            { name: "entity", type: "TEXT", description: "Bảng/Entity bị thay đổi", required: true },
            { name: "entity_id", type: "TEXT", description: "ID record bị thay đổi" },
            { name: "before_data", type: "JSONB", description: "Dữ liệu trước khi thay đổi" },
            { name: "after_data", type: "JSONB", description: "Dữ liệu sau khi thay đổi" },
            { name: "event_time", type: "TIMESTAMP", description: "Thời điểm thao tác", required: true },
            { name: "ip_address", type: "TEXT", description: "IP người dùng" },
            { name: "user_agent", type: "TEXT", description: "Browser/Device info" },
            { name: "role_snapshot", type: "app_role", description: "Role tại thời điểm thao tác" },
          ],
          businessLogic: [
            "Mọi thay đổi quan trọng đều được log",
            "before_data và after_data giúp trace back lỗi",
            "Dùng để audit và điều tra sự cố",
            "Không thể xóa audit logs"
          ]
        }
      },
      {
        id: "approvals",
        title: "Bảng approvals",
        content: "Quản lý các yêu cầu cần phê duyệt.",
        dataTable: {
          name: "approvals",
          description: "Yêu cầu phê duyệt",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "request_type", type: "TEXT", description: "Loại yêu cầu: REFUND, ADJUSTMENT, PAYMENT...", required: true },
            { name: "request_payload", type: "JSONB", description: "Nội dung yêu cầu", required: true },
            { name: "requested_by", type: "UUID", description: "User tạo yêu cầu", required: true },
            { name: "status", type: "TEXT", description: "PENDING, APPROVED, REJECTED", required: true },
            { name: "approved_by", type: "UUID", description: "User phê duyệt" },
            { name: "approved_at", type: "TIMESTAMP", description: "Thời điểm phê duyệt" },
            { name: "note", type: "TEXT", description: "Ghi chú phê duyệt" },
          ]
        }
      }
    ]
  },
  {
    id: "ai-pricing",
    title: "AI Smart Pricing",
    icon: Brain,
    description: "Hệ thống định giá thông minh dựa trên AI.",
    subsections: [
      {
        id: "ai-shadow-signals",
        title: "Bảng ai_pricing_shadow_signals",
        content: "Tín hiệu phân tích từ AI để đề xuất điều chỉnh giá.",
        dataTable: {
          name: "ai_pricing_shadow_signals",
          description: "Tín hiệu AI",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "property_id", type: "TEXT", description: "Property được phân tích", required: true },
            { name: "room_type_id", type: "TEXT", description: "Room type (nếu specific)" },
            { name: "stay_date", type: "DATE", description: "Ngày lưu trú được phân tích", required: true },
            { name: "days_to_checkin", type: "INTEGER", description: "Số ngày còn lại đến check-in", required: true },
            { name: "signal_class", type: "TEXT", description: "Loại tín hiệu: SELLOUT_RISK, VACANCY_RISK, HOLD", required: true },
            { name: "advisory_direction", type: "TEXT", description: "Đề xuất: INCREASE, DECREASE, HOLD", required: true },
            { name: "data_confidence", type: "DECIMAL", description: "Độ tin cậy dữ liệu (0-1)", required: true },
            { name: "remaining_inventory", type: "INTEGER", description: "Số phòng còn trống", required: true },
            { name: "total_inventory", type: "INTEGER", description: "Tổng số phòng" },
            { name: "booking_velocity_24h", type: "DECIMAL", description: "Tốc độ booking 24h qua" },
            { name: "booking_velocity_7d", type: "DECIMAL", description: "Tốc độ booking 7 ngày qua" },
            { name: "baseline_pace", type: "DECIMAL", description: "Pace baseline so sánh" },
            { name: "current_rate", type: "DECIMAL", description: "Giá hiện tại" },
            { name: "explanation_text", type: "TEXT", description: "Giải thích tín hiệu" },
            { name: "signal_timestamp", type: "TIMESTAMP", description: "Thời điểm tạo tín hiệu" },
          ],
          businessLogic: [
            "AI phân tích dữ liệu và tạo signals định kỳ",
            "SELLOUT_RISK: Có nguy cơ hết phòng → Đề xuất tăng giá",
            "VACANCY_RISK: Có nguy cơ trống phòng → Đề xuất giảm giá",
            "HOLD: Giữ nguyên giá hiện tại",
            "data_confidence thấp = Không đủ dữ liệu, cẩn thận khi quyết định"
          ]
        }
      },
      {
        id: "ai-recommendations",
        title: "Bảng ai_pricing_recommendations",
        content: "Đề xuất điều chỉnh giá từ AI cho user review.",
        dataTable: {
          name: "ai_pricing_recommendations",
          description: "Đề xuất giá từ AI",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "property_id", type: "TEXT", description: "Property", required: true },
            { name: "room_type_id", type: "TEXT", description: "Room type" },
            { name: "date_from", type: "DATE", description: "Từ ngày", required: true },
            { name: "date_to", type: "DATE", description: "Đến ngày", required: true },
            { name: "action", type: "TEXT", description: "Hành động: INCREASE, DECREASE, HOLD", required: true },
            { name: "action_strength", type: "TEXT", description: "Mức độ: SOFT, MODERATE, STRONG" },
            { name: "confidence", type: "DECIMAL", description: "Độ tin cậy đề xuất", required: true },
            { name: "data_confidence", type: "DECIMAL", description: "Độ tin cậy dữ liệu", required: true },
            { name: "priority", type: "TEXT", description: "Ưu tiên: LOW, MEDIUM, HIGH, URGENT" },
            { name: "business_intent", type: "TEXT", description: "Mục tiêu: MAXIMIZE_REVENUE, FILL_VACANCY, CAPTURE_DEMAND" },
            { name: "explanation_text", type: "TEXT", description: "Giải thích chi tiết" },
            { name: "expires_at", type: "TIMESTAMP", description: "Thời điểm hết hạn đề xuất" },
            { name: "occupancy_at_time", type: "DECIMAL", description: "Occupancy tại thời điểm" },
            { name: "velocity_at_time", type: "DECIMAL", description: "Velocity tại thời điểm" },
            { name: "remaining_inventory", type: "INTEGER", description: "Phòng còn trống" },
            { name: "days_to_checkin", type: "INTEGER", description: "Số ngày đến check-in" },
          ]
        }
      },
      {
        id: "ai-decision-outcomes",
        title: "Bảng ai_pricing_decision_outcomes",
        content: "Ghi nhận quyết định của user và kết quả thực tế để AI học hỏi.",
        dataTable: {
          name: "ai_pricing_decision_outcomes",
          description: "Kết quả quyết định",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "recommendation_id", type: "UUID", description: "FK đến recommendations", required: true },
            { name: "user_action", type: "TEXT", description: "Hành động user: ACCEPTED, REJECTED, MODIFIED, IGNORED", required: true },
            { name: "user_action_at", type: "TIMESTAMP", description: "Thời điểm quyết định" },
            { name: "user_id", type: "UUID", description: "User quyết định" },
            { name: "user_note", type: "TEXT", description: "Lý do/ghi chú của user" },
            { name: "price_before", type: "DECIMAL", description: "Giá trước khi thay đổi" },
            { name: "price_after", type: "DECIMAL", description: "Giá sau khi thay đổi" },
            { name: "price_change_pct", type: "DECIMAL", description: "% thay đổi giá" },
            { name: "outcome", type: "TEXT", description: "Kết quả: POSITIVE, NEGATIVE, NEUTRAL" },
            { name: "outcome_score", type: "DECIMAL", description: "Điểm kết quả (-1 đến 1)" },
            { name: "outcome_explanation", type: "TEXT", description: "Giải thích kết quả" },
            { name: "final_occupancy", type: "DECIMAL", description: "Occupancy cuối cùng" },
            { name: "final_remaining_inventory", type: "INTEGER", description: "Phòng còn lại cuối" },
            { name: "bookings_received", type: "INTEGER", description: "Số booking nhận được" },
            { name: "revenue_impact_estimate", type: "DECIMAL", description: "Ước tính impact doanh thu" },
          ],
          businessLogic: [
            "Ghi nhận mọi quyết định của user với đề xuất AI",
            "Đánh giá outcome sau khi stay date qua",
            "Dữ liệu này dùng để cải thiện model AI",
            "POSITIVE outcome = AI đề xuất đúng, user follow"
          ]
        }
      }
    ]
  },
  {
    id: "sync-system",
    title: "Đồng bộ & Webhook",
    icon: RefreshCw,
    description: "Hệ thống sync dữ liệu từ Channex và xử lý webhook.",
    subsections: [
      {
        id: "sync-runs",
        title: "Bảng sync_runs",
        content: "Ghi nhận các lần chạy sync từ Channex.",
        dataTable: {
          name: "sync_runs",
          description: "Lịch sử sync",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "entity", type: "TEXT", description: "Entity được sync: bookings, properties, room_types", required: true },
            { name: "provider", type: "TEXT", description: "Provider: channex", required: true },
            { name: "run_type", type: "TEXT", description: "Loại: FULL, INCREMENTAL, WEBHOOK" },
            { name: "status", type: "TEXT", description: "running, completed, failed", required: true },
            { name: "started_at", type: "TIMESTAMP", description: "Thời điểm bắt đầu", required: true },
            { name: "ended_at", type: "TIMESTAMP", description: "Thời điểm kết thúc" },
            { name: "since", type: "TIMESTAMP", description: "Sync dữ liệu từ thời điểm này" },
            { name: "until", type: "TIMESTAMP", description: "Sync dữ liệu đến thời điểm này" },
            { name: "counts", type: "JSONB", description: "Thống kê: created, updated, skipped, errors" },
            { name: "error", type: "TEXT", description: "Lỗi (nếu failed)" },
          ]
        }
      },
      {
        id: "webhook-events",
        title: "Bảng webhook_events",
        content: "Lưu trữ webhook events từ Channex để xử lý.",
        dataTable: {
          name: "webhook_events",
          description: "Webhook events",
          fields: [
            { name: "id", type: "UUID", description: "Primary key", required: true },
            { name: "provider", type: "TEXT", description: "Provider: channex", required: true },
            { name: "event_type", type: "TEXT", description: "Loại event: booking.new, booking.modified...", required: true },
            { name: "dedupe_key", type: "TEXT", description: "Key để chống duplicate", required: true },
            { name: "payload", type: "JSONB", description: "Nội dung webhook", required: true },
            { name: "status", type: "TEXT", description: "pending, processed, failed", required: true },
            { name: "processed_at", type: "TIMESTAMP", description: "Thời điểm xử lý" },
            { name: "retry_count", type: "INTEGER", description: "Số lần retry" },
            { name: "error", type: "TEXT", description: "Lỗi (nếu failed)" },
          ],
          businessLogic: [
            "Webhook từ Channex được lưu ngay vào bảng này",
            "Edge function xử lý và cập nhật status",
            "dedupe_key ngăn xử lý duplicate events",
            "Retry tự động nếu failed"
          ]
        }
      }
    ]
  }
];

// Workflow diagrams
const workflowDiagrams = [
  {
    id: "booking-flow",
    title: "Luồng xử lý Booking",
    steps: [
      "OTA Booking → Channex Webhook → bookings_mirror",
      "Auto-create: stays (WAIT_ROOM)",
      "Phân bổ phòng: stays.host_room_id ← host_rooms",
      "Auto-create: host_supply_segments",
      "Check-in: stays.status = CHECKED_IN, upload guest_documents",
      "Thu tiền: hotel_collects (nếu HOTEL_COLLECT)",
      "Check-out: stays.status = CHECKED_OUT",
      "Sync host_payables từ segments"
    ]
  },
  {
    id: "payment-flow",
    title: "Luồng thanh toán Host",
    steps: [
      "host_supply_segments + extra_charges - host_surcharges → host_payables",
      "Tạo host_settlements (gom nhiều payables)",
      "Finalize settlement → Lock segments",
      "Tạo payment_requests",
      "Phê duyệt → APPROVED",
      "Chi tiền → cash_outs",
      "Cập nhật host_payables.paid_amount",
      "Ghi cashflow_entries"
    ]
  },
  {
    id: "ota-payout-flow",
    title: "Luồng đối soát OTA",
    steps: [
      "Nhận tiền từ OTA → Tạo ota_payouts",
      "Thêm booking vào payout → ota_payout_bookings",
      "So sánh expected vs actual amount",
      "Nếu chênh lệch → Tạo ota_disputes",
      "Theo dõi và close dispute",
      "Ghi nhận hotel_collects với source_payout_id"
    ]
  }
];

// Quick links
const quickLinks = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Booking Center", path: "/bookings", icon: CalendarCheck },
  { label: "Stays Board", path: "/stays", icon: Building2 },
  { label: "Host Payables", path: "/host-payables", icon: PiggyBank },
  { label: "OTA Payouts", path: "/ota-payouts", icon: CreditCard },
  { label: "Inventory", path: "/inventory", icon: LayoutGrid },
  { label: "Settings", path: "/settings", icon: Settings },
];

export default function DocumentationPage() {
  const [activeSection, setActiveSection] = useState("overview");
  const [expandedSubsections, setExpandedSubsections] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const toggleSubsection = (id: string) => {
    setExpandedSubsections((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const filteredSections = documentationSections.filter(
    (section) =>
      section.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      section.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      section.subsections?.some(
        (sub) =>
          sub.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          sub.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  const activeDocSection = documentationSections.find(
    (s) => s.id === activeSection
  );

  const renderFieldsTable = (fields: FieldDefinition[]) => (
    <div className="overflow-x-auto mt-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Trường</TableHead>
            <TableHead className="w-[120px]">Kiểu dữ liệu</TableHead>
            <TableHead>Mô tả</TableHead>
            <TableHead className="w-[80px]">Bắt buộc</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.map((field) => (
            <TableRow key={field.name}>
              <TableCell className="font-mono text-sm font-medium">{field.name}</TableCell>
              <TableCell className="text-xs">
                <Badge variant="outline" className="font-mono">{field.type}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {field.description}
                {field.example && (
                  <span className="block text-xs text-primary mt-1">VD: {field.example}</span>
                )}
              </TableCell>
              <TableCell>
                {field.required && <Badge variant="destructive" className="text-xs">Yes</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const renderStatusesTable = (statuses: StatusDefinition[]) => (
    <div className="overflow-x-auto mt-4">
      <h5 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <Zap className="h-4 w-4" />
        Các giá trị trạng thái
      </h5>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[150px]">Giá trị</TableHead>
            <TableHead className="w-[150px]">Hiển thị</TableHead>
            <TableHead>Mô tả</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {statuses.map((status) => (
            <TableRow key={status.value}>
              <TableCell className="font-mono text-sm">{status.value}</TableCell>
              <TableCell>
                <Badge variant={status.color as any || "default"}>{status.label}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{status.description}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const renderFormulas = (formulas: { name: string; formula: string; description: string }[]) => (
    <div className="mt-4 space-y-2">
      <h5 className="text-sm font-semibold flex items-center gap-2">
        <Calculator className="h-4 w-4" />
        Công thức tính toán
      </h5>
      <div className="space-y-2">
        {formulas.map((f) => (
          <div key={f.name} className="bg-muted/50 p-3 rounded-lg">
            <div className="font-medium text-sm">{f.name}</div>
            <code className="text-xs bg-background px-2 py-1 rounded block mt-1 font-mono">{f.formula}</code>
            <div className="text-xs text-muted-foreground mt-1">{f.description}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderStateMachine = (transitions: { from: string; to: string; trigger: string; conditions?: string }[]) => (
    <div className="mt-4 space-y-2">
      <h5 className="text-sm font-semibold flex items-center gap-2">
        <Workflow className="h-4 w-4" />
        State Machine - Chuyển trạng thái
      </h5>
      <div className="space-y-2">
        {transitions.map((t, idx) => (
          <div key={idx} className="flex items-center gap-2 text-sm bg-muted/30 p-2 rounded-lg">
            <Badge variant="outline">{t.from}</Badge>
            <ArrowRight className="h-4 w-4 text-primary" />
            <Badge variant="secondary">{t.to}</Badge>
            <span className="text-muted-foreground">|</span>
            <span className="font-medium">{t.trigger}</span>
            {t.conditions && (
              <span className="text-xs text-muted-foreground ml-2">({t.conditions})</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AppLink to="/">
              <img src={roomriseLogo} alt="Roomrise" className="h-8" />
            </AppLink>
            <div className="h-6 w-px bg-border" />
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <span className="font-semibold">Documentation</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <AppLink to="/">
              <Button variant="ghost" size="sm">
                <Home className="h-4 w-4 mr-2" />
                Về Dashboard
              </Button>
            </AppLink>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-80 border-r bg-muted/30 hidden lg:block">
          <div className="sticky top-[57px] h-[calc(100vh-57px)] flex flex-col">
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm kiếm..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <ScrollArea className="flex-1 p-4">
              <nav className="space-y-1">
                {filteredSections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                        activeSection === section.id
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="text-sm font-medium truncate">{section.title}</span>
                    </button>
                  );
                })}
              </nav>

              <Separator className="my-4" />

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3">
                  Quick Links
                </h4>
                {quickLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.path}
                      to={link.path}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span>{link.label}</span>
                      <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
                    </Link>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="container mx-auto px-4 py-8 max-w-5xl">
            {activeDocSection && (
              <>
                {/* Section Header */}
                <div className="mb-8">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-primary/10">
                      {(() => {
                        const Icon = activeDocSection.icon;
                        return <Icon className="h-6 w-6 text-primary" />;
                      })()}
                    </div>
                    <h1 className="text-hero-kpi font-bold tabular-nums tracking-tight">{activeDocSection.title}</h1>
                  </div>
                  <p className="text-lg text-muted-foreground">
                    {activeDocSection.description}
                  </p>
                </div>

                {/* Subsections */}
                <Accordion type="multiple" className="space-y-4">
                  {activeDocSection.subsections?.map((subsection) => (
                    <AccordionItem
                      key={subsection.id}
                      value={subsection.id}
                      className="border rounded-lg px-4"
                    >
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-2">
                          {subsection.dataTable ? (
                            <Database className="h-4 w-4 text-primary" />
                          ) : subsection.stateMachine ? (
                            <Workflow className="h-4 w-4 text-primary" />
                          ) : (
                            <FileText className="h-4 w-4 text-primary" />
                          )}
                          <span className="font-semibold">{subsection.title}</span>
                          {subsection.dataTable && (
                            <Badge variant="outline" className="ml-2 text-xs">Table</Badge>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-4">
                        <div className="prose prose-sm max-w-none dark:prose-invert">
                          <p className="text-muted-foreground">{subsection.content}</p>

                          {/* Data Table Documentation */}
                          {subsection.dataTable && (
                            <div className="mt-4 space-y-4">
                              <div className="bg-muted/50 p-4 rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                  <Table2 className="h-4 w-4" />
                                  <span className="font-mono font-semibold">{subsection.dataTable.name}</span>
                                </div>
                                <p className="text-sm text-muted-foreground">{subsection.dataTable.description}</p>
                              </div>

                              <h5 className="text-sm font-semibold flex items-center gap-2 mt-4">
                                <Key className="h-4 w-4" />
                                Cấu trúc trường dữ liệu
                              </h5>
                              {renderFieldsTable(subsection.dataTable.fields)}

                              {subsection.dataTable.statuses && renderStatusesTable(subsection.dataTable.statuses)}

                              {subsection.dataTable.relationships && (
                                <div className="mt-4">
                                  <h5 className="text-sm font-semibold flex items-center gap-2 mb-2">
                                    <GitBranch className="h-4 w-4" />
                                    Quan hệ với bảng khác
                                  </h5>
                                  <ul className="space-y-1">
                                    {subsection.dataTable.relationships.map((rel, idx) => (
                                      <li key={idx} className="text-sm text-muted-foreground font-mono bg-muted/30 px-3 py-1 rounded">
                                        {rel}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {subsection.dataTable.businessLogic && (
                                <div className="mt-4">
                                  <h5 className="text-sm font-semibold flex items-center gap-2 mb-2">
                                    <Lightbulb className="h-4 w-4" />
                                    Logic nghiệp vụ
                                  </h5>
                                  <ul className="space-y-1">
                                    {subsection.dataTable.businessLogic.map((logic, idx) => (
                                      <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                                        <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                                        {logic}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Steps */}
                          {subsection.steps && (
                            <div className="mt-4">
                              <h5 className="text-sm font-semibold mb-2">Các bước thực hiện:</h5>
                              <ol className="space-y-2">
                                {subsection.steps.map((step, idx) => (
                                  <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                                    {step.startsWith("===") ? (
                                      <span className="font-semibold text-foreground">{step.replace(/=/g, "")}</span>
                                    ) : step.trim() === "" ? (
                                      <span>&nbsp;</span>
                                    ) : (
                                      <>
                                        <ArrowRight className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                                        <span className="font-mono text-xs">{step}</span>
                                      </>
                                    )}
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}

                          {/* Formulas */}
                          {subsection.formulas && renderFormulas(subsection.formulas)}

                          {/* State Machine */}
                          {subsection.stateMachine && renderStateMachine(subsection.stateMachine)}

                          {/* Tips */}
                          {subsection.tips && subsection.tips.length > 0 && (
                            <div className="mt-4 p-4 bg-info/10 dark:bg-info/10 rounded-lg border border-info/20 dark:border-info">
                              <h5 className="text-sm font-semibold flex items-center gap-2 text-info mb-2">
                                <Lightbulb className="h-4 w-4" />
                                Mẹo sử dụng
                              </h5>
                              <ul className="space-y-1">
                                {subsection.tips.map((tip, idx) => (
                                  <li key={idx} className="text-sm text-info flex items-start gap-2">
                                    <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                    {tip}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Warnings */}
                          {subsection.warnings && subsection.warnings.length > 0 && (
                            <div className="mt-4 p-4 bg-warning/10 dark:bg-warning/10 rounded-lg border border-warning/20 dark:border-warning">
                              <h5 className="text-sm font-semibold flex items-center gap-2 text-warning mb-2">
                                <AlertCircle className="h-4 w-4" />
                                Lưu ý quan trọng
                              </h5>
                              <ul className="space-y-1">
                                {subsection.warnings.map((warning, idx) => (
                                  <li key={idx} className="text-sm text-warning flex items-start gap-2">
                                    <FileWarning className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                    {warning}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>

                {/* Workflow Diagrams (only for overview section) */}
                {activeSection === "overview" && (
                  <div className="mt-12">
                    <h2 className="text-hero-kpi font-bold tabular-nums tracking-tight mb-4">Workflow Diagrams</h2>
                    <div className="grid gap-4">
                      {workflowDiagrams.map((diagram) => (
                        <Card key={diagram.id}>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <Workflow className="h-5 w-5 text-primary" />
                              {diagram.title}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              {diagram.steps.map((step, idx) => (
                                <div key={idx} className="flex items-center gap-3">
                                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                                    {idx + 1}
                                  </div>
                                  <span className="text-sm font-mono">{step}</span>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t py-6 bg-muted/30">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Roomrise. All rights reserved.</p>
          <p className="mt-1">Version 2.0 - Comprehensive Documentation</p>
        </div>
      </footer>
    </div>
  );
}
