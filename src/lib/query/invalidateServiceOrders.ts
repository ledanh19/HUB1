import type { QueryClient } from "@tanstack/react-query";

/**
 * Centralized cache invalidation for service orders.
 * Covers: list page, stats cards, booking-scoped queries.
 * Uses prefix matching (exact=false is default in react-query v5).
 */
export async function invalidateServiceOrders(
  queryClient: QueryClient,
  unifiedBookingId?: string
) {
  await queryClient.invalidateQueries({ queryKey: ["service_orders"] });
  await queryClient.invalidateQueries({ queryKey: ["service_order_stats"] });

  if (unifiedBookingId) {
    await queryClient.invalidateQueries({
      queryKey: ["audit_logs", unifiedBookingId],
    });
  }
}
