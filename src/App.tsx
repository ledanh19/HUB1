import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { MainLayout } from "@/components/layout/MainLayout";
import { AppInitializer } from "@/components/layout/AppInitializer";
import { SessionExpiredModal } from "@/components/system/SessionExpiredModal";
import { ThemeProvider } from "next-themes";
import { queryClient } from "@/lib/queryClient";
import { realtimeManager } from "@/lib/realtimeManager";
import { lazyPage, registerRoutePreload } from "@/lib/lazyPage";
import { registerChunkPreloadersFromRoutePreloads } from "@/lib/navigation/routePreloaders";
// Import prefetchers to ensure they're registered at startup
import "@/lib/navigation/routePrefetchRegistry";
import { validateRouteGovernance } from "@/lib/navigation/routeGovernance";

// ── Eagerly loaded (critical path — always needed) ──
import AuthPage from "./pages/AuthPage";
import AccessDeniedPage from "./pages/AccessDeniedPage";
import NotFound from "./pages/NotFound";

// ── Public pages (Google OAuth Branding / Verification) ──
const PublicHomePage = lazyPage(() => import("./pages/public/PublicHomePage"));
const PrivacyPolicyPage = lazyPage(() => import("./pages/public/PrivacyPolicyPage"));
const TermsPage = lazyPage(() => import("./pages/public/TermsPage"));

// ── Lazy-loaded pages (route-level code splitting) ──
const DashboardV2 = lazyPage(() => import("./pages/DashboardV2"));
const DashboardLegacy = lazyPage(() => import("./pages/Dashboard"));
const BookingsPage = lazyPage(() => import("./pages/BookingsPage"));
const BookingDetailPage = lazyPage(() => import("./pages/BookingDetailPage"));
const MobileCollectPaymentPage = lazyPage(() => import("./pages/mobile/MobileCollectPaymentPage"));
const MobileAddServicePage = lazyPage(() => import("./pages/mobile/MobileAddServicePage"));
const MobileAllocateRoomPage = lazyPage(() => import("./pages/mobile/MobileAllocateRoomPage"));
const MobileCreateDepositPage = lazyPage(() => import("./pages/mobile/MobileCreateDepositPage"));
const MobileAddExtraChargePage = lazyPage(() => import("./pages/mobile/MobileAddExtraChargePage"));
const StaysPage = lazyPage(() => import("./pages/StaysPage"));
const DeclarationListPage = lazyPage(() => import("./pages/DeclarationListPage"));
const PartnersPage = lazyPage(() => import("./pages/PartnersPage"));
const CustomersPage = lazyPage(() => import("./pages/CustomersPage"));
const CollectionsPage = lazyPage(() => import("./pages/CollectionsPage"));
const OtaPayoutsPage = lazyPage(() => import("./pages/OtaPayoutsPage"));
const OtaPayoutDetailPage = lazyPage(() => import("./pages/OtaPayoutDetailPage"));
const DisputesPage = lazyPage(() => import("./pages/DisputesPage"));
const DisputeDetailPage = lazyPage(() => import("./pages/DisputeDetailPage"));
const HostPayablesPage = lazyPage(() => import("./pages/HostPayablesPage"));
const HostPayablesAgingPage = lazyPage(() => import("./pages/HostPayablesAgingPage"));
const HostPayableDetailPage = lazyPage(() => import("./pages/HostPayableDetailPage"));
const HostDepositsPage = lazyPage(() => import("./pages/HostDepositsPage"));
const ReportsPnlPage = lazyPage(() => import("./pages/ReportsPnlPage"));
const ReportsCashflowPage = lazyPage(() => import("./pages/ReportsCashflowPage"));
const DataHealthPage = lazyPage(() => import("./pages/DataHealthPage"));
const FinancePeriodsPage = lazyPage(() => import("./pages/FinancePeriodsPage"));
const AuditLogsPage = lazyPage(() => import("./pages/AuditLogsPage"));
const NoShowReportPage = lazyPage(() => import("./pages/NoShowReportPage"));
const ServiceOrdersPage = lazyPage(() => import("./pages/ServiceOrdersPage"));
const ServiceOrderDetailPage = lazyPage(() => import("./pages/ServiceOrderDetailPage"));
const ServiceReportsPage = lazyPage(() => import("./pages/ServiceReportsPage"));
const ServicePayablesPage = lazyPage(() => import("./pages/ServicePayablesPage"));
const CollectionReportsPage = lazyPage(() => import("./pages/CollectionReportsPage"));
const ApprovalsPage = lazyPage(() => import("./pages/ApprovalsPage"));
const HostSettlementPage = lazyPage(() => import("./pages/HostSettlementPage"));
const PaymentRequestsPage = lazyPage(() => import("./pages/PaymentRequestsPage"));
const CashOutPage = lazyPage(() => import("./pages/CashOutPage"));
const SettlementHistoryPage = lazyPage(() => import("./pages/SettlementHistoryPage"));
const SettingsPage = lazyPage(() => import("./pages/SettingsPage"));
const ChannexIntegrationPage = lazyPage(() => import("./pages/ChannexIntegrationPage"));
const OtaMessagesPage = lazyPage(() => import("./pages/OtaMessagesPage"));
const InventoryPage = lazyPage(() => import("./pages/InventoryPage"));
const MappingsPage = lazyPage(() => import("./pages/MappingsPage"));
const SyncJobsPage = lazyPage(() => import("./pages/SyncJobsPage"));
const ChannelManagerPage = lazyPage(() => import("./pages/ChannelManagerPage"));
const ChannexEmbedPage = lazyPage(() => import("./pages/ChannexEmbedPage"));
const AIPricingInsightsPage = lazyPage(() => import("./pages/AIPricingInsightsPage"));
const AIPricingRecommendationsPage = lazyPage(() => import("./pages/AIPricingRecommendationsPage"));
const AIPricingValidationPage = lazyPage(() => import("./pages/AIPricingValidationPage"));
const PropertyCatalogPage = lazyPage(() => import("./pages/PropertyCatalogPage"));
const DocumentationPage = lazyPage(() => import("./pages/DocumentationPage"));
const CashAccountsPage = lazyPage(() => import("./pages/CashAccountsPage"));
const MappingRulesPage = lazyPage(() => import("./pages/MappingRulesPage"));
const LedgerEntriesPage = lazyPage(() => import("./pages/LedgerEntriesPage"));
const CashTransfersPage = lazyPage(() => import("./pages/CashTransfersPage"));
const AccountingPeriodsPage = lazyPage(() => import("./pages/AccountingPeriodsPage"));
const WhatsAppSettingsPage = lazyPage(() => import("./pages/settings/WhatsAppSettingsPage"));
// Ops Module (3-layer mobile navigation)
const OpsOverviewPage = lazyPage(() => import("./pages/ops/OpsOverviewPage"));
const OpsBookingListPage = lazyPage(() => import("./pages/ops/OpsBookingListPage"));
// OTA Operations Module
const OtaProjectsPage = lazyPage(() => import("./pages/ota-operations/ProjectsPage"));
const OtaTasksPage = lazyPage(() => import("./pages/ota-operations/TasksPage"));
const OtaMyTasksPage = lazyPage(() => import("./pages/ota-operations/MyTasksPage"));
const OtaKpiPage = lazyPage(() => import("./pages/ota-operations/KpiPage"));
const OtaTaskDetailPage = lazyPage(() => import("./pages/ota-operations/TaskDetailPage"));
const OtaProjectDetailPage = lazyPage(() => import("./pages/ota-operations/ProjectDetailPage"));
// Analytics Module
const AnalyticsOverviewPage = lazyPage(() => import("./pages/analytics").then(m => ({ default: m.AnalyticsOverviewPage })));
const RevenueAnalyticsPage = lazyPage(() => import("./pages/analytics").then(m => ({ default: m.RevenueAnalyticsPage })));
const HostCostAnalyticsPage = lazyPage(() => import("./pages/analytics").then(m => ({ default: m.HostCostAnalyticsPage })));
const PriceSpreadAnalyticsPage = lazyPage(() => import("./pages/analytics").then(m => ({ default: m.PriceSpreadAnalyticsPage })));
const ControlHubAnalyticsPage = lazyPage(() => import("./pages/analytics").then(m => ({ default: m.ControlHubAnalyticsPage })));
// Email Module
const EmailAccountsPage = lazyPage(() => import("./pages/email").then(m => ({ default: m.EmailAccountsPage })));
const EmailInboxPage = lazyPage(() => import("./pages/email").then(m => ({ default: m.EmailInboxPage })));
const EmailThreadDetailPage = lazyPage(() => import("./pages/email").then(m => ({ default: m.EmailThreadDetailPage })));

/** Desktop → StaysPage (full table), Mobile → OpsOverviewPage (3-layer KPI) */
function OpsRouteSwitch() {
  const isMobile = window.matchMedia("(max-width: 639px)").matches;
  if (isMobile) return <OpsOverviewPage />;
  return <StaysPage />;
}

// ── FIX #5: Register route preloads for sidebar hover prefetching ──
const routePreloads: [string, () => Promise<any>][] = [
  ["/", () => import("./pages/DashboardV2")],
  ["/dashboard-legacy", () => import("./pages/Dashboard")],
  ["/bookings", () => import("./pages/BookingsPage")],
  ["/stays", () => import("./pages/StaysPage")],
  ["/ops", () => import("./pages/ops/OpsOverviewPage")],
  ["/declarations", () => import("./pages/DeclarationListPage")],
  ["/stays/declarations", () => import("./pages/DeclarationListPage")], // sidebar uses this path
  ["/partners", () => import("./pages/PartnersPage")],
  ["/customers", () => import("./pages/CustomersPage")],
  ["/collections", () => import("./pages/CollectionsPage")],
  ["/ota-payouts", () => import("./pages/OtaPayoutsPage")],
  ["/disputes", () => import("./pages/DisputesPage")],
  ["/host-payables", () => import("./pages/HostPayablesPage")],
  ["/host-payables/aging", () => import("./pages/HostPayablesAgingPage")],
  ["/host-deposits", () => import("./pages/HostDepositsPage")],
  ["/host-payables/settlement", () => import("./pages/HostSettlementPage")],
  ["/reports/pnl", () => import("./pages/ReportsPnlPage")],
  ["/reports/cashflow", () => import("./pages/ReportsCashflowPage")],
  ["/reports/collections", () => import("./pages/CollectionReportsPage")],
  ["/reports/no-show", () => import("./pages/NoShowReportPage")],
  ["/payments/requests", () => import("./pages/PaymentRequestsPage")],
  ["/payments/cashout", () => import("./pages/CashOutPage")],
  ["/services/orders", () => import("./pages/ServiceOrdersPage")],
  ["/services/reports", () => import("./pages/ServiceReportsPage")],
  ["/services/payables", () => import("./pages/ServicePayablesPage")],
  ["/approvals", () => import("./pages/ApprovalsPage")],
  ["/settings", () => import("./pages/SettingsPage")],
  ["/settings/permissions", () => import("./pages/SettingsPage")],
  ["/settings/properties", () => import("./pages/PropertyCatalogPage")],
  ["/settings/cash-accounts", () => import("./pages/CashAccountsPage")],
  ["/settings/mapping-rules", () => import("./pages/MappingRulesPage")],
  ["/settings/ledger-entries", () => import("./pages/LedgerEntriesPage")],
  ["/settings/cash-transfers", () => import("./pages/CashTransfersPage")],
  ["/settings/accounting-periods", () => import("./pages/AccountingPeriodsPage")],
  ["/settings/whatsapp", () => import("./pages/settings/WhatsAppSettingsPage")],
  ["/inventory", () => import("./pages/InventoryPage")],
  ["/channel-manager/inventory", () => import("./pages/InventoryPage")], // sidebar uses this path
  ["/channel-manager/channex", () => import("./pages/ChannexIntegrationPage")],
  ["/channel-manager/channex-embed", () => import("./pages/ChannexEmbedPage")],
  ["/ota-operations/projects", () => import("./pages/ota-operations/ProjectsPage")],
  ["/ota-operations/my-tasks", () => import("./pages/ota-operations/MyTasksPage")],
  ["/ota-operations/tasks", () => import("./pages/ota-operations/TasksPage")],
  ["/ota-operations/kpi", () => import("./pages/ota-operations/KpiPage")],
  ["/analytics", () => import("./pages/analytics").then(m => ({ default: m.AnalyticsOverviewPage }))],
  ["/ai-pricing/insights", () => import("./pages/AIPricingInsightsPage")],
  ["/ai-pricing/recommendations", () => import("./pages/AIPricingRecommendationsPage")],
  ["/ai-pricing/validation", () => import("./pages/AIPricingValidationPage")],
  ["/ota-messages", () => import("./pages/OtaMessagesPage")],
  ["/settlements/history", () => import("./pages/SettlementHistoryPage")],
  ["/audit-logs", () => import("./pages/AuditLogsPage")],
  ["/email/inbox", () => import("./pages/email").then(m => ({ default: m.EmailInboxPage }))],
  ["/email/accounts", () => import("./pages/email").then(m => ({ default: m.EmailAccountsPage }))],
  // Mobile task pages — preload for instant navigation from booking detail
  ["/bookings/:id/service/add", () => import("./pages/mobile/MobileAddServicePage")],
  ["/bookings/:id/payment/add", () => import("./pages/mobile/MobileCollectPaymentPage")],
  ["/bookings/:id/allocation/add", () => import("./pages/mobile/MobileAllocateRoomPage")],
  ["/bookings/:id/deposit/add", () => import("./pages/mobile/MobileCreateDepositPage")],
  ["/bookings/:id/extra-charge/add", () => import("./pages/mobile/MobileAddExtraChargePage")],
];
routePreloads.forEach(([path, factory]) => registerRoutePreload(path, factory));
// ── Also register for click-time chunk preloading (navigateHoldAndPrefetch) ──
registerChunkPreloadersFromRoutePreloads(routePreloads);

// ── DEV: Validate all heavy routes have preloaders + prefetchers ──
validateRouteGovernance();

const LegacyHostSettlementRedirect = () => {
  const location = useLocation();
  return <Navigate to={`/host-payables/settlement${location.search}`} replace />;
};

// Initialize realtime manager once at app startup
realtimeManager.initialize();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SessionExpiredModal />
        <AppInitializer>
          <TooltipProvider>
            <Sonner />
            <BrowserRouter>
              <Routes>
                {/* ── Public routes (no layout shell) ── */}
                <Route path="/docs" element={<DocumentationPage />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/403" element={<AccessDeniedPage />} />
                {/* ── Public pages for Google OAuth Branding / Verification ── */}
                <Route path="/about" element={<PublicHomePage />} />
                <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                <Route path="/terms" element={<TermsPage />} />

                {/* ── Legacy redirects (no auth needed) ── */}
                <Route path="/deposits-prepaids" element={<Navigate to="/payments/requests?type=HOST_DEPOSIT" replace />} />
                <Route path="/host-payables/deposits-prepaids" element={<Navigate to="/payments/requests?type=HOST_DEPOSIT" replace />} />
                <Route path="/payments/outgoing" element={<Navigate to="/payments/requests" replace />} />
                <Route path="/integrations/channex" element={<Navigate to="/channel-manager/channex" replace />} />
                <Route path="/integrations/inventory" element={<Navigate to="/channel-manager/inventory" replace />} />

                {/* ══════════════════════════════════════════════════════
                PROTECTED LAYOUT ROUTE
                MainLayout renders ONCE — Sidebar/Header/Realtime stay
                mounted across ALL child navigations.
                ══════════════════════════════════════════════════════ */}
                <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
                  <Route index element={<DashboardV2 />} />
                  <Route path="dashboard-legacy" element={<DashboardLegacy />} />
                  <Route path="bookings" element={<BookingsPage />} />
                  <Route path="bookings/:id" element={<BookingDetailPage />} />
                  {/* Mobile task pages — full-screen form flows */}
                  <Route path="bookings/:id/payment/add" element={<MobileCollectPaymentPage />} />
                  <Route path="bookings/:id/service/add" element={<MobileAddServicePage />} />
                  <Route path="bookings/:id/allocation/add" element={<MobileAllocateRoomPage />} />
                  <Route path="bookings/:id/deposit/add" element={<MobileCreateDepositPage />} />
                  <Route path="bookings/:id/extra-charge/add" element={<MobileAddExtraChargePage />} />
                  <Route path="stays" element={<Navigate to="/ops" replace />} />
                  <Route path="stays/declarations" element={<DeclarationListPage />} />
                  {/* Ops: desktop → StaysPage (full table), mobile → 3-layer KPI */}
                  <Route path="ops" element={<OpsRouteSwitch />} />
                  <Route path="ops/list/:status" element={<OpsBookingListPage />} />
                  {/* Partners */}
                  <Route path="partners" element={<Navigate to="/partners/hosts" replace />} />
                  <Route path="partners/hosts" element={<PartnersPage />} />
                  <Route path="customers" element={<CustomersPage />} />
                  {/* Services */}
                  <Route path="services" element={<Navigate to="/services/orders" replace />} />
                  <Route path="services/orders" element={<ServiceOrdersPage />} />
                  <Route path="services/orders/:orderId" element={<ServiceOrderDetailPage />} />
                  <Route path="services/reports" element={<ServiceReportsPage />} />
                  <Route path="services/payables" element={<ServicePayablesPage />} />
                  {/* Collections */}
                  <Route path="collections" element={<CollectionsPage />} />
                  <Route path="collections/reports" element={<CollectionReportsPage />} />
                  {/* OTA Payouts */}
                  <Route path="ota-payouts" element={<OtaPayoutsPage />} />
                  <Route path="ota-payouts/:id" element={<OtaPayoutDetailPage />} />
                  {/* Disputes */}
                  <Route path="disputes" element={<DisputesPage />} />
                  <Route path="disputes/:id" element={<DisputeDetailPage />} />
                  {/* Host Payables */}
                  <Route path="host-payables" element={<HostPayablesPage />} />
                  <Route path="host-payables/aging" element={<HostPayablesAgingPage />} />
                  <Route path="host-payables/:id" element={<HostPayableDetailPage />} />
                  <Route path="host-payables/settlement" element={<HostSettlementPage />} />
                  <Route path="host-deposits" element={<HostDepositsPage />} />
                  <Route path="host-settlement" element={<LegacyHostSettlementRedirect />} />
                  {/* Reports */}
                  <Route path="reports" element={<Navigate to="/reports/pnl" replace />} />
                  <Route path="reports/pnl" element={<ReportsPnlPage />} />
                  <Route path="reports/cashflow" element={<ReportsCashflowPage />} />
                  <Route path="reports/no-show" element={<NoShowReportPage />} />
                  <Route path="reports/collections" element={<CollectionReportsPage />} />
                  <Route path="reports/services" element={<ServiceReportsPage />} />
                  {/* System */}
                  <Route path="data-health" element={<DataHealthPage />} />
                  <Route path="finance/periods" element={<FinancePeriodsPage />} />
                  <Route path="audit-logs" element={<AuditLogsPage />} />
                  <Route path="approvals" element={<ApprovalsPage />} />
                  {/* Payments */}
                  <Route path="payments" element={<Navigate to="/payments/requests" replace />} />
                  <Route path="payments/requests" element={<PaymentRequestsPage />} />
                  <Route path="payments/cashout" element={<CashOutPage />} />
                  <Route path="settlements/history" element={<SettlementHistoryPage />} />
                  {/* Settings */}
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="settings/permissions" element={<SettingsPage />} />
                  <Route path="settings/properties" element={<PropertyCatalogPage />} />
                  <Route path="settings/cash-accounts" element={<CashAccountsPage />} />
                  <Route path="settings/mapping-rules" element={<MappingRulesPage />} />
                  <Route path="settings/ledger-entries" element={<LedgerEntriesPage />} />
                  <Route path="settings/cash-transfers" element={<CashTransfersPage />} />
                  <Route path="settings/accounting-periods" element={<AccountingPeriodsPage />} />
                  <Route path="settings/whatsapp" element={<WhatsAppSettingsPage />} />
                  <Route path="property-catalog" element={<PropertyCatalogPage />} />
                  {/* Channel Manager */}
                  <Route path="channel-manager" element={<ChannelManagerPage />} />
                  <Route path="channel-manager/channex" element={<ChannexIntegrationPage />} />
                  <Route path="channel-manager/channex-embed" element={<ChannexEmbedPage />} />
                  <Route path="channel-manager/inventory" element={<InventoryPage />} />
                  <Route path="channel-manager/mappings" element={<MappingsPage />} />
                  <Route path="channel-manager/sync-jobs" element={<SyncJobsPage />} />
                  {/* OTA Operations */}
                  <Route path="ota-operations" element={<Navigate to="/ota-operations/my-tasks" replace />} />
                  <Route path="ota-operations/my-tasks" element={<OtaMyTasksPage />} />
                  <Route path="ota-operations/projects" element={<OtaProjectsPage />} />
                  <Route path="ota-operations/projects/:projectId" element={<OtaProjectDetailPage />} />
                  <Route path="ota-operations/tasks" element={<OtaTasksPage />} />
                  <Route path="ota-operations/tasks/:taskId" element={<OtaTaskDetailPage />} />
                  <Route path="ota-operations/kpi" element={<OtaKpiPage />} />
                  {/* AI Smart Pricing */}
                  <Route path="ai-pricing" element={<Navigate to="/ai-pricing/insights" replace />} />
                  <Route path="ai-pricing/insights" element={<AIPricingInsightsPage />} />
                  <Route path="ai-pricing/recommendations" element={<AIPricingRecommendationsPage />} />
                  <Route path="ai-pricing/validation" element={<AIPricingValidationPage />} />
                  {/* Analytics Module */}
                  <Route path="analytics" element={<Navigate to="/analytics/hub" replace />} />
                  <Route path="analytics/hub" element={<ControlHubAnalyticsPage />} />
                  <Route path="analytics/overview" element={<AnalyticsOverviewPage />} />
                  <Route path="analytics/revenue" element={<RevenueAnalyticsPage />} />
                  <Route path="analytics/host-cost" element={<HostCostAnalyticsPage />} />
                  <Route path="analytics/price-spread" element={<PriceSpreadAnalyticsPage />} />
                  {/* Email Module */}
                  <Route path="email" element={<Navigate to="/email/inbox" replace />} />
                  <Route path="email/accounts" element={<EmailAccountsPage />} />
                  <Route path="email/inbox" element={<EmailInboxPage />} />
                  <Route path="email/thread/:id" element={<EmailThreadDetailPage />} />
                  {/* Messaging */}
                  <Route path="ota-messages" element={<OtaMessagesPage />} />
                </Route>

                {/* ── Catch-all ── */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </AppInitializer>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
