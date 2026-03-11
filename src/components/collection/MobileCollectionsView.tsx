import { memo, useMemo } from "react";
import {
    MobileTaskPage,
    MobileTaskHeader,
    MobileTaskBody,
    MobileListItem,
    MobileDetailHero,
    MobileSectionCard,
    MobileTaskFooter,
    MobileSheet,
} from "@/components/mobile";
import { StatusBadge } from "@/components/ui/status-badge";
import { PaymentMethodIcon } from "@/components/ui/payment-method-icon";
import { Button } from "@/components/ui/button";
import {
    Home,
    Receipt,
    Plane,
    ArrowDownLeft,
    RotateCcw,
    XCircle,
    Plus,
    ExternalLink,
    Wallet,
    type LucideIcon,
} from "lucide-react";
import { useMobileStackNavigation } from "@/hooks/mobile/useMobileStackNavigation";
import { usePreservedScroll } from "@/hooks/mobile/usePreservedScroll";
import { useBottomSheetState } from "@/hooks/mobile/useBottomSheetState";
import { getPaymentMethodLabel, getProviderLabel } from "@/constants/paymentMethods";
import type { HotelCollect } from "@/hooks/useCollections";
import { useNavigate } from "react-router-dom";

// ── Types ──
interface CollectionWithBooking extends HotelCollect {
    booking?: {
        guest_name: string;
        host_property_name: string | null;
        pms_property_name: string | null;
        payment_type: string;
        check_in_date: string;
        check_out_date: string;
        total_amount_net: number | null;
        source?: string;
        ota_booking_code?: string | null;
    } | null;
}

// ── Constants ──
const currencyFormatter = new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
});
const fmtCurrency = (n: number) => currencyFormatter.format(n);

const bucketConfig: Record<string, { label: string; icon: LucideIcon; color: string }> = {
    ROOM: { label: "Tiền phòng", icon: Home, color: "text-info" },
    EXTRA: { label: "Phụ phí", icon: Receipt, color: "text-warning" },
    SERVICE: { label: "Dịch vụ", icon: Plane, color: "text-primary" },
    OTA_PAYOUT: { label: "OTA Payout", icon: ArrowDownLeft, color: "text-success" },
    HOST_DEPOSIT_REFUND: { label: "Thu hoàn cọc Host", icon: RotateCcw, color: "text-info" },
    HOST_PREPAID_REFUND: { label: "Thu hoàn trả trước Host", icon: RotateCcw, color: "text-info" },
};

function getStatusDisplay(collection: HotelCollect, isVoided: boolean) {
    if (collection.collection_type === "VOID") return { label: "VOID", variant: "default" as const };
    if (collection.collection_type === "REFUND") return { label: "REFUND", variant: "warning" as const };
    if (isVoided) return { label: "Hủy", variant: "default" as const };
    return { label: "Đã thu", variant: "success" as const };
}

function getCollectorDisplay(collection: any): { label: string; variant: "success" | "info" | "warning" | "default" } {
    const payeeType = collection.payee_type;
    if (payeeType === "HOST") return { label: "Host thu", variant: "warning" };
    if (payeeType === "SERVICE_PARTNER") return { label: "NCC thu", variant: "default" };
    return { label: "Roomrise thu", variant: "info" };
}

// ═══════════════════════════════════════════════
// Props from parent CollectionsPage
// ═══════════════════════════════════════════════
interface MobileCollectionsViewProps {
    collections: CollectionWithBooking[];
    filteredCollections: CollectionWithBooking[];
    isLoading: boolean;
    voidedSet: Set<string>;
    /** KPI data */
    todayNet: number;
    monthNet: number;
    /** Permission flags */
    canPerformActions: boolean;
    canRefund: boolean;
    canVoid: boolean;
    /** Action handlers */
    onCreateOpen: () => void;
    onRefundOpen: (collection: HotelCollect) => void;
    onVoidOpen: (collection: HotelCollect) => void;
    /** Related collections lookup */
    getRelatedCollections: (id: string) => HotelCollect[];
}

/**
 * Mobile-only Collections view.
 *
 * Renders a native-like task flow:
 *  List → Detail (push) → Action sheets
 *
 * Includes scroll preservation on back navigation.
 */
export const MobileCollectionsView = memo(function MobileCollectionsView({
    filteredCollections,
    voidedSet,
    todayNet,
    monthNet,
    canPerformActions,
    canRefund,
    canVoid,
    onCreateOpen,
    onRefundOpen,
    onVoidOpen,
    getRelatedCollections,
}: MobileCollectionsViewProps) {
    const nav = useMobileStackNavigation({ paramName: "cid" });
    const { scrollRef, saveScroll } = usePreservedScroll({
        key: "collections-list",
        enabled: nav.currentView === "list",
    });
    const actionSheet = useBottomSheetState();
    const navigate = useNavigate();

    // Find selected collection for detail view
    const selectedCollection = useMemo(() => {
        if (!nav.selectedId) return null;
        return filteredCollections.find((c) => c.id === nav.selectedId) || null;
    }, [nav.selectedId, filteredCollections]);

    // ── DETAIL VIEW ──
    if (nav.currentView === "detail" && selectedCollection) {
        const isVoided = voidedSet.has(selectedCollection.id);
        const status = getStatusDisplay(selectedCollection, isVoided);
        const bucket = bucketConfig[selectedCollection.related_type] || {
            label: selectedCollection.related_type || "N/A",
            icon: Receipt,
            color: "text-muted-foreground",
        };
        const collector = getCollectorDisplay(selectedCollection);
        const amount = Math.abs(Number(selectedCollection.amount_collected));
        const isRefund = selectedCollection.collection_type === "REFUND";
        const relatedCols = getRelatedCollections(selectedCollection.id);

        // Determine available actions
        const canRefundThis =
            canPerformActions &&
            canRefund &&
            selectedCollection.collection_type === "COLLECT" &&
            !isVoided;
        const canVoidThis =
            canPerformActions &&
            canVoid &&
            selectedCollection.collection_type === "COLLECT" &&
            !isVoided;
        const hasActions = canRefundThis || canVoidThis;

        // Build action items for sheet
        const actionItems: Array<{
            label: string;
            icon: LucideIcon;
            onClick: () => void;
            destructive?: boolean;
        }> = [];
        if (canRefundThis) {
            actionItems.push({
                label: "Hoàn tiền",
                icon: RotateCcw,
                onClick: () => {
                    actionSheet.close();
                    onRefundOpen(selectedCollection);
                },
            });
        }
        if (canVoidThis) {
            actionItems.push({
                label: "Hủy thu (VOID)",
                icon: XCircle,
                onClick: () => {
                    actionSheet.close();
                    onVoidOpen(selectedCollection);
                },
                destructive: true,
            });
        }

        return (
            <MobileTaskPage variant="detail">
                <MobileTaskHeader
                    title="Chi tiết thu tiền"
                    onBack={nav.goBack}
                />

                <MobileDetailHero
                    label={
                        <span className={isRefund ? "text-warning" : isVoided ? "text-muted-foreground line-through" : "text-success"}>
                            {isRefund ? "-" : "+"}{fmtCurrency(amount)}
                        </span>
                    }
                    badge={
                        <StatusBadge variant={status.variant} size="sm">
                            {status.label}
                        </StatusBadge>
                    }
                    items={[
                        {
                            label: "Loại thu",
                            value: (
                                <span className="flex items-center gap-1.5">
                                    <bucket.icon className={`h-3.5 w-3.5 ${bucket.color}`} />
                                    {bucket.label}
                                </span>
                            ),
                        },
                        {
                            label: "Ngày thu",
                            value: new Date(
                                selectedCollection.collected_at || selectedCollection.created_at
                            ).toLocaleDateString("vi-VN"),
                        },
                        {
                            label: "Phương thức",
                            value: (
                                <span className="flex items-center gap-1.5">
                                    <PaymentMethodIcon
                                        code={selectedCollection.payment_method || ""}
                                        className="h-3.5 w-3.5 text-muted-foreground"
                                    />
                                    {getPaymentMethodLabel(selectedCollection.payment_method || "")}
                                </span>
                            ),
                        },
                        {
                            label: "Người thu",
                            value: (
                                <StatusBadge variant={collector.variant} size="sm">
                                    {collector.label}
                                </StatusBadge>
                            ),
                        },
                    ]}
                />

                <MobileTaskBody>
                    <div className="space-y-2">
                        {/* Booking Info */}
                        <MobileSectionCard title="Thông tin đặt phòng">
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Booking</span>
                                    <button
                                        onClick={() =>
                                            selectedCollection.related_type === "OTA_PAYOUT"
                                                ? undefined
                                                : navigate(`/bookings/${selectedCollection.unified_booking_id}`)
                                        }
                                        className="font-medium text-primary hover:underline"
                                    >
                                        {selectedCollection.unified_booking_id.slice(0, 12)}…
                                    </button>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Khách</span>
                                    <span className="font-medium">
                                        {selectedCollection.related_type === "OTA_PAYOUT"
                                            ? "OTA Payout"
                                            : selectedCollection.booking?.guest_name || "—"}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Chỗ nghỉ</span>
                                    <span className="font-medium truncate max-w-[180px]">
                                        {selectedCollection.booking?.host_property_name ||
                                            selectedCollection.booking?.pms_property_name ||
                                            "—"}
                                    </span>
                                </div>
                            </div>
                        </MobileSectionCard>

                        {/* Payment Details */}
                        {selectedCollection.payment_method === "PAYMENT_LINK" &&
                            (selectedCollection as any).payment_link_url && (
                                <MobileSectionCard title="Link thanh toán">
                                    <a
                                        href={(selectedCollection as any).payment_link_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-primary flex items-center gap-1.5 break-all"
                                    >
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                        {(selectedCollection as any).payment_link_url}
                                    </a>
                                </MobileSectionCard>
                            )}

                        {/* Notes */}
                        {(selectedCollection.receipt || selectedCollection.note) && (
                            <MobileSectionCard title="Ghi chú">
                                <div className="space-y-2 text-sm">
                                    {selectedCollection.receipt && (
                                        <div>
                                            <p className="text-muted-foreground text-micro">Reference</p>
                                            <p className="font-medium">{selectedCollection.receipt}</p>
                                        </div>
                                    )}
                                    {selectedCollection.note && (
                                        <div>
                                            <p className="text-muted-foreground text-micro">Ghi chú</p>
                                            <p className="font-medium">{selectedCollection.note}</p>
                                        </div>
                                    )}
                                </div>
                            </MobileSectionCard>
                        )}

                        {/* Related collections (refunds/voids) */}
                        {relatedCols.length > 0 && (
                            <MobileSectionCard
                                title="Giao dịch liên quan"
                                count={relatedCols.length}
                            >
                                <div className="space-y-2">
                                    {relatedCols.map((rc) => (
                                        <div
                                            key={rc.id}
                                            className="flex items-center justify-between text-sm px-2 py-1.5 rounded-lg bg-muted/30"
                                        >
                                            <div className="flex items-center gap-2">
                                                <StatusBadge
                                                    variant={
                                                        rc.collection_type === "REFUND"
                                                            ? "warning"
                                                            : "default"
                                                    }
                                                    size="sm"
                                                >
                                                    {rc.collection_type}
                                                </StatusBadge>
                                                <span className="text-xs text-muted-foreground">
                                                    {new Date(
                                                        rc.collected_at || rc.created_at
                                                    ).toLocaleDateString("vi-VN")}
                                                </span>
                                            </div>
                                            <span className="font-medium tabular-nums text-warning">
                                                -{fmtCurrency(Math.abs(Number(rc.amount_collected)))}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </MobileSectionCard>
                        )}
                    </div>
                </MobileTaskBody>

                {/* Actions footer */}
                {hasActions && (
                    <MobileTaskFooter>
                        <div className="flex gap-2">
                            {canRefundThis && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 text-warning border-warning/30"
                                    onClick={() => onRefundOpen(selectedCollection)}
                                >
                                    <RotateCcw className="h-4 w-4 mr-1.5" />
                                    Hoàn tiền
                                </Button>
                            )}
                            {canVoidThis && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => onVoidOpen(selectedCollection)}
                                >
                                    <XCircle className="h-4 w-4 mr-1.5" />
                                    VOID
                                </Button>
                            )}
                        </div>
                    </MobileTaskFooter>
                )}
            </MobileTaskPage>
        );
    }

    // ── LIST VIEW ──
    return (
        <MobileTaskPage variant="list">
            <MobileTaskHeader
                title="Thu tiền"
                subtitle={`Hôm nay: ${fmtCurrency(todayNet)} · Tháng: ${fmtCurrency(monthNet)}`}
                rightActions={
                    canPerformActions ? (
                        <button
                            onClick={onCreateOpen}
                            className="w-10 h-10 flex items-center justify-center text-white rounded-full hover:bg-white/15 transition-colors active:scale-95"
                        >
                            <Plus className="h-5 w-5" />
                        </button>
                    ) : undefined
                }
            />

            <MobileTaskBody ref={scrollRef} padding="none">
                {filteredCollections.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <Wallet className="h-10 w-10 mb-3" />
                        <p className="text-sm">Chưa có giao dịch</p>
                    </div>
                ) : (
                    <div className="space-y-2 px-3 py-3">
                        {filteredCollections.map((collection) => {
                            const isVoided = voidedSet.has(collection.id);
                            const bucket = bucketConfig[collection.related_type] || {
                                label: collection.related_type || "N/A",
                                icon: Receipt,
                                color: "text-muted-foreground",
                            };
                            const BucketIcon = bucket.icon;
                            const status = getStatusDisplay(collection, isVoided);
                            const amount = Math.abs(Number(collection.amount_collected));
                            const isRefund = collection.collection_type === "REFUND";

                            return (
                                <MobileListItem
                                    key={collection.id}
                                    leading={
                                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center bg-muted/50`}>
                                            <BucketIcon className={`h-4 w-4 ${bucket.color}`} />
                                        </div>
                                    }
                                    title={
                                        collection.related_type === "OTA_PAYOUT"
                                            ? "OTA Payout"
                                            : collection.booking?.guest_name || "—"
                                    }
                                    subtitle={bucket.label}
                                    trailing={
                                        <div className="text-right">
                                            <p className={`text-sm font-bold tabular-nums ${isRefund ? "text-warning" : isVoided ? "text-muted-foreground line-through" : "text-success"
                                                }`}>
                                                {isRefund ? "-" : "+"}{fmtCurrency(amount)}
                                            </p>
                                            <StatusBadge variant={status.variant} size="sm">
                                                {status.label}
                                            </StatusBadge>
                                        </div>
                                    }
                                    meta={
                                        <>
                                            <span>{getPaymentMethodLabel(collection.payment_method || "")}</span>
                                            <span>·</span>
                                            <span>
                                                {new Date(
                                                    collection.collected_at || collection.created_at
                                                ).toLocaleDateString("vi-VN")}
                                            </span>
                                        </>
                                    }
                                    onClick={() => {
                                        saveScroll();
                                        nav.goToDetail(collection.id);
                                    }}
                                    dimmed={isVoided}
                                    showChevron
                                />
                            );
                        })}
                    </div>
                )}
            </MobileTaskBody>
        </MobileTaskPage>
    );
});
