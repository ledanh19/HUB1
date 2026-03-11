/**
 * NAVIGATION – Single Source of Truth
 * ====================================
 * All navigation arrays (Sidebar, MobileSidebar, MobileBottomNav)
 * MUST import from this file. Never duplicate nav items.
 */
import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  Handshake,
  Building,
  Building2,
  Plane,
  CreditCard,
  Receipt,
  AlertTriangle,
  PiggyBank,
  BarChart3,
  Settings,
  FileCheck,
  UserCheck,
  Wallet,
  ClipboardCheck,
  Clock,
  ArrowDownLeft,
  ArrowRightLeft,
  History,
  Link2,
  MessageSquare,
  LayoutGrid,
  FileText,
  Brain,
  Lightbulb,
  ListChecks,
  ShieldCheck,
  Landmark,
  BookOpen,
  GitBranch,
  Calendar,
  Briefcase,
  FolderKanban,
  TrendingUp,
  MessageCircle,
  Mail,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  children?: NavItem[];
}

/**
 * Main navigation tree – authoritative for the entire app.
 * Both desktop Sidebar and MobileSidebar render from this.
 */
export const navigation: NavItem[] = [
  // 🧭 Dashboard
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  // 🤝 Đối tác
  {
    label: "Đối tác",
    href: "/partners",
    icon: Handshake,
  },
  // 🏨 Vận hành lưu trú
  {
    label: "Vận hành lưu trú",
    href: "/ops",
    icon: Building2,
    children: [
      { label: "Bảng Điều Khiển", href: "/ops", icon: UserCheck },
      { label: "Booking Center", href: "/bookings", icon: CalendarCheck },
      { label: "Khách hàng", href: "/customers", icon: Users },
      { label: "Danh mục Chỗ nghỉ", href: "/settings/properties", icon: Building },
      { label: "Khai báo lưu trú", href: "/stays/declarations", icon: FileText },
    ],
  },
  // 🛎 Dịch vụ
  {
    label: "Dịch vụ",
    href: "/services",
    icon: Plane,
    children: [
      { label: "Đơn dịch vụ", href: "/services", icon: Receipt },
      { label: "Báo cáo dịch vụ", href: "/services/reports", icon: BarChart3 },
    ],
  },
  // 💬 Tin nhắn (OTA + WhatsApp)
  {
    label: "Tin nhắn",
    href: "/ota-messages",
    icon: MessageSquare,
  },
  // 📧 Email nội bộ
  {
    label: "Email",
    href: "/email",
    icon: Mail,
    children: [
      { label: "Hộp thư đến", href: "/email/inbox", icon: Mail },
      { label: "Tài khoản", href: "/email/accounts", icon: Settings },
    ],
  },
  // 🤝 OTA & Đối soát
  {
    label: "OTA & Đối soát",
    href: "/ota-payouts",
    icon: CreditCard,
    children: [
      { label: "OTA Payout", href: "/ota-payouts", icon: CreditCard },
      { label: "Case Center", href: "/disputes", icon: AlertTriangle },
    ],
  },
  // 💼 Công nợ
  {
    label: "Công nợ",
    href: "/host-payables",
    icon: PiggyBank,
    children: [
      { label: "Đặt cọc & Trả trước", href: "/host-deposits", icon: Wallet },
      { label: "Host - Danh sách", href: "/host-payables", icon: Receipt },
      { label: "Host - Báo cáo tuổi nợ", href: "/host-payables/aging", icon: Clock },
      { label: "Host - Quyết toán", href: "/host-payables/settlement", icon: FileCheck },
      { label: "Dịch vụ - Quyết toán", href: "/services/payables", icon: FileCheck },
    ],
  },
  // 💰 Tài chính & Dòng tiền
  {
    label: "Tài chính & Dòng tiền",
    href: "/settlements/history",
    icon: Wallet,
    children: [
      { label: "Lịch sử quyết toán", href: "/settlements/history", icon: History },
      { label: "Đề xuất thanh toán", href: "/payments/requests", icon: ClipboardCheck },
      { label: "Thu tiền", href: "/collections", icon: Wallet },
      { label: "Chi tiền", href: "/payments/cashout", icon: ArrowDownLeft },
      { label: "Chuyển khoản nội bộ", href: "/settings/cash-transfers", icon: ArrowRightLeft },
      { label: "Tài khoản tiền", href: "/settings/cash-accounts", icon: Landmark },
      { label: "Quy tắc mapping", href: "/settings/mapping-rules", icon: GitBranch },
      { label: "Sổ cái", href: "/settings/ledger-entries", icon: BookOpen },
      { label: "Kỳ kế toán", href: "/settings/accounting-periods", icon: Calendar },
    ],
  },
  // 📊 Báo cáo
  {
    label: "Báo cáo",
    href: "/reports",
    icon: BarChart3,
    children: [
      { label: "P&L", href: "/reports/pnl", icon: BarChart3 },
      { label: "Cashflow", href: "/reports/cashflow", icon: Wallet },
      { label: "No-Show", href: "/reports/no-show", icon: AlertTriangle },
    ],
  },
  // 📡 Channel Manager
  {
    label: "Channel Manager",
    href: "/channel-manager",
    icon: Link2,
    children: [
      { label: "Channex Integration", href: "/channel-manager/channex", icon: Link2 },
      { label: "Channex", href: "/channel-manager/channex-embed", icon: LayoutGrid },
      { label: "Inventory", href: "/channel-manager/inventory", icon: LayoutGrid },
    ],
  },
  // 🤖 AI Smart Pricing
  {
    label: "AI Smart Pricing",
    href: "/ai-pricing",
    icon: Brain,
    children: [
      { label: "Insights", href: "/ai-pricing/insights", icon: Lightbulb },
      { label: "Recommendations", href: "/ai-pricing/recommendations", icon: ListChecks },
      { label: "Validation", href: "/ai-pricing/validation", icon: ShieldCheck },
    ],
  },
  // 📊 Analytics
  {
    label: "Analytics",
    href: "/analytics",
    icon: BarChart3,
    children: [
      { label: "Control Hub", href: "/analytics/hub", icon: LayoutDashboard },
      { label: "Overview", href: "/analytics/overview", icon: BarChart3 },
      { label: "Revenue", href: "/analytics/revenue", icon: TrendingUp },
      { label: "Host Cost", href: "/analytics/host-cost", icon: Building },
      { label: "Price Spread", href: "/analytics/price-spread", icon: GitBranch },
    ],
  },
  // 💼 OTA Operations
  {
    label: "OTA Operations",
    href: "/ota-operations",
    icon: Briefcase,
    children: [
      { label: "My Tasks", href: "/ota-operations/my-tasks", icon: ListChecks },
      { label: "Projects", href: "/ota-operations/projects", icon: FolderKanban },
      { label: "All Tasks", href: "/ota-operations/tasks", icon: ListChecks },
      { label: "KPI", href: "/ota-operations/kpi", icon: TrendingUp },
    ],
  },
  // 🛡 Kiểm soát & Hệ thống
  {
    label: "Kiểm soát & Hệ thống",
    href: "/approvals",
    icon: Settings,
    children: [
      { label: "Phê duyệt", href: "/approvals", icon: ClipboardCheck },
      { label: "Audit Logs", href: "/audit-logs", icon: History },
    ],
  },
];

/**
 * Sidebar bottom navigation (Settings section, rendered below main nav).
 */
export const sidebarBottomNavigation: NavItem[] = [
  {
    label: "Cài đặt",
    href: "/settings",
    icon: Settings,
    children: [
      { label: "Phân quyền người dùng", href: "/settings/permissions", icon: ShieldCheck },
      { label: "WhatsApp", href: "/settings/whatsapp", icon: MessageCircle },
      { label: "Cấu hình hệ thống", href: "/settings", icon: Settings },
    ],
  },
];

/**
 * Role display labels.
 */
export const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Chủ đầu tư",
  ke_toan: "Kế toán",
  cskh: "CSKH",
  sale: "Vận hành",
};

/**
 * Mobile bottom navigation shortcuts.
 */
export const mobileBottomNavItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, matchPaths: ["/"] },
  { label: "Vận hành", href: "/ops", icon: Building2, matchPaths: ["/ops", "/stays", "/bookings", "/customers"] },
  { label: "Tin nhắn", href: "/ota-messages", icon: MessageSquare, matchPaths: ["/ota-messages"] },
  { label: "Công nợ", href: "/host-payables", icon: PiggyBank, matchPaths: ["/host-payables", "/host-deposits", "/host-payables/settlement", "/host-payables/aging"] },
];
