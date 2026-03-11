import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createAuditLog } from "@/hooks/useAuditLog";
import { keepPrevious } from "@/lib/query-helpers";
import { AN_GIA_GROUP_ID } from "./useAnGiaProperties";

// Service status matching spec
export type ServiceStatus = 'DRAFT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

// Service provider types
export type ServiceProvider = 'ROOMRISE' | 'HOST' | 'PARTNER';

export interface ServiceOrder {
  id: string;
  unified_booking_id: string | null;
  service_id: string;
  partner_id: string | null;
  sale_price: number;
  cost_price: number;
  pax: number;
  service_date_time: string;
  status: string; // DB status - we'll map to our ServiceStatus
  collector_type: string; // DB collector_type - who collects payment
  service_provider_type: string; // Who provides the service: ROOMRISE | HOST | PARTNER
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  service_catalog?: {
    service_name: string;
    service_type: string;
  };
  partners?: {
    partner_name: string;
  };
  unified_bookings?: {
    guest_name: string;
    check_in_date: string;
    source: string;
    host_property_name: string | null;
    ota_booking_code: string | null;
  };
  profiles?: {
    full_name: string;
  };
  // Derived payment data
  amount_collected?: number;
  amount_remaining?: number;
  payment_status?: 'UNPAID' | 'PARTIAL' | 'PAID';
  // Derived provider name
  provider_name?: string;
}

export interface ServiceOrderFilters {
  dateFrom?: string;
  dateTo?: string;
  serviceType?: string;
  partnerId?: string;
  serviceProvider?: string;
  serviceStatus?: string;
  paymentStatus?: string;
  bookingId?: string;
  search?: string;
}

// Map DB status to display status
const mapDbStatus = (dbStatus: string): string => {
  const statusMap: Record<string, string> = {
    'NEW': 'DRAFT',
    'CONFIRMED': 'CONFIRMED',
    'ASSIGNED': 'IN_PROGRESS',
    'DONE': 'COMPLETED',
    'CANCELLED': 'CANCELLED',
    'NO_SHOW': 'CANCELLED',
  };
  return statusMap[dbStatus] || dbStatus;
};

export const useServiceOrders = (filters?: ServiceOrderFilters) => {
  return useQuery({
    queryKey: ["service_orders", filters],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPrevious,
    queryFn: async () => {
      const buildBaseQuery = () => {
        let q = supabase
          .from("service_orders")
          .select(`
            *,
            service_catalog(service_name, service_type),
            partners(partner_name)
          `)
          // Server-side scoping: filter by property_group_id instead of client-side fan-out
          .eq("property_group_id", AN_GIA_GROUP_ID)
          .order("created_at", { ascending: false });

        // Date filters are based on "Ngày tạo" (created_at) like Booking Center
        if (filters?.dateFrom) {
          q = q.gte("created_at", `${filters.dateFrom}T00:00:00+07:00`);
        }
        if (filters?.dateTo) {
          q = q.lte("created_at", `${filters.dateTo}T23:59:59+07:00`);
        }
        if (filters?.partnerId) {
          q = q.eq("partner_id", filters.partnerId);
        }

        return q;
      };

      // Fetch service orders — single query, no client-side fan-out
      let orders: any[] = [];

      if (filters?.bookingId) {
        const { data, error } = await buildBaseQuery().eq("unified_booking_id", filters.bookingId);
        if (error) throw error;
        orders = data || [];
      } else {
        const { data, error } = await buildBaseQuery();
        if (error) throw error;
        orders = data || [];
      }

      let result = orders || [];

      // Filter by service type if provided
      if (filters?.serviceType) {
        result = result.filter(
          (order: any) => order.service_catalog?.service_type === filters.serviceType
        );
      }

      // Filter by service status (map to DB status)
      if (filters?.serviceStatus) {
        const dbStatuses: Record<string, string[]> = {
          'DRAFT': ['NEW'],
          'CONFIRMED': ['CONFIRMED'],
          'IN_PROGRESS': ['ASSIGNED'],
          'COMPLETED': ['DONE'],
          'CANCELLED': ['CANCELLED', 'NO_SHOW'],
        };
        const allowedStatuses = dbStatuses[filters.serviceStatus] || [filters.serviceStatus];
        result = result.filter((order: any) => allowedStatuses.includes(order.status));
      }

      // Filter by service provider type
      if (filters?.serviceProvider) {
        result = result.filter((order: any) => order.service_provider_type === filters.serviceProvider);
      }

      // Fetch booking info for all orders
      const bookingIds = [...new Set(result.filter(o => o.unified_booking_id).map(o => o.unified_booking_id))];
      let bookingsMap: Record<string, any> = {};

      if (bookingIds.length > 0) {
        const { data: bookings } = await supabase
          .from("unified_bookings")
          .select("unified_booking_id, guest_name, check_in_date, source, host_property_name, ota_booking_code")
          .in("unified_booking_id", bookingIds);

        if (bookings) {
          bookingsMap = bookings.reduce((acc, b) => {
            acc[b.unified_booking_id] = b;
            return acc;
          }, {} as Record<string, any>);
        }
      }

      // Fetch all SERVICE collections from hotel_collects by booking_id
      // Note: hotel_collects.related_id may be null, so we aggregate by booking level
      let collectionsMapByBooking: Record<string, number> = {};
      let collectionsMapByOrder: Record<string, number> = {};

      if (bookingIds.length > 0) {
        const { data: collections } = await supabase
          .from("hotel_collects")
          .select("unified_booking_id, related_id, amount_collected, status")
          .eq("related_type", "SERVICE")
          .neq("status", "VOIDED")
          .in("unified_booking_id", bookingIds);

        if (collections) {
          collections.forEach(c => {
            // If related_id exists, map to specific order
            if (c.related_id) {
              if (!collectionsMapByOrder[c.related_id]) {
                collectionsMapByOrder[c.related_id] = 0;
              }
              collectionsMapByOrder[c.related_id] += c.amount_collected || 0;
            }
            // Aggregate by booking ONLY for unallocated collections (related_id is null)
            if (c.unified_booking_id && !c.related_id) {
              if (!collectionsMapByBooking[c.unified_booking_id]) {
                collectionsMapByBooking[c.unified_booking_id] = 0;
              }
              collectionsMapByBooking[c.unified_booking_id] += c.amount_collected || 0;
            }
          });
        }
      }

      // Calculate total expected services per booking for pro-rating
      const servicesPerBooking: Record<string, { total: number; count: number }> = {};
      result.forEach((order: any) => {
        if (order.unified_booking_id) {
          if (!servicesPerBooking[order.unified_booking_id]) {
            servicesPerBooking[order.unified_booking_id] = { total: 0, count: 0 };
          }
          servicesPerBooking[order.unified_booking_id].total += order.sale_price || 0;
          servicesPerBooking[order.unified_booking_id].count += 1;
        }
      });

      // Enrich orders with derived data
      const enrichedOrders = result.map((order: any) => {
        let amountCollected = 0;

        // First check if there's a direct order-level collection
        if (collectionsMapByOrder[order.id]) {
          amountCollected = collectionsMapByOrder[order.id];
        } else if (order.unified_booking_id && collectionsMapByBooking[order.unified_booking_id]) {
          // Pro-rate booking-level collections based on this order's proportion
          const bookingServices = servicesPerBooking[order.unified_booking_id];
          if (bookingServices && bookingServices.total > 0) {
            const proportion = (order.sale_price || 0) / bookingServices.total;
            amountCollected = Math.round(collectionsMapByBooking[order.unified_booking_id] * proportion);
          }
        }

        const amountRemaining = Math.max(0, (order.sale_price || 0) - amountCollected);
        let paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID' = 'UNPAID';

        if (amountCollected >= (order.sale_price || 0)) {
          paymentStatus = 'PAID';
        } else if (amountCollected > 0) {
          paymentStatus = 'PARTIAL';
        }

        return {
          ...order,
          unified_bookings: bookingsMap[order.unified_booking_id] || null,
          amount_collected: amountCollected,
          amount_remaining: amountRemaining,
          payment_status: paymentStatus,
        };
      });

      // Filter by payment status
      if (filters?.paymentStatus) {
        return enrichedOrders.filter((order: any) => order.payment_status === filters.paymentStatus);
      }

      // Filter by search
      if (filters?.search) {
        const searchLower = filters.search.toLowerCase();
        return enrichedOrders.filter((order: any) =>
          order.unified_booking_id?.toLowerCase().includes(searchLower) ||
          order.unified_bookings?.guest_name?.toLowerCase().includes(searchLower) ||
          order.service_catalog?.service_name?.toLowerCase().includes(searchLower)
        );
      }

      return enrichedOrders as ServiceOrder[];
    },
  });
};

export const useServiceOrderById = (orderId: string) => {
  return useQuery({
    queryKey: ["service_order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select(`
          *,
          service_catalog(service_name, service_type, description),
          partners(partner_name, phone, email)
        `)
        .eq("id", orderId)
        .single();

      if (error) throw error;

      // Fetch booking info
      let bookingData = null;
      if (data.unified_booking_id) {
        const { data: booking } = await supabase
          .from("unified_bookings")
          .select("unified_booking_id, guest_name, check_in_date, source, host_property_name, ota_booking_code, is_settled")
          .eq("unified_booking_id", data.unified_booking_id)
          .single();
        bookingData = booking;
      }

      // Fetch collections for this booking (SERVICE type)
      let amountCollected = 0;
      if (data.unified_booking_id) {
        // First try to find direct order-level collection
        const { data: orderCollections } = await supabase
          .from("hotel_collects")
          .select("amount_collected, status")
          .eq("related_type", "SERVICE")
          .eq("related_id", orderId)
          .neq("status", "VOIDED");

        if (orderCollections && orderCollections.length > 0) {
          amountCollected = orderCollections.reduce((sum, c) => sum + (c.amount_collected || 0), 0);
        } else {
          // Fallback: fetch unallocated SERVICE collections for this booking and pro-rate
          const { data: bookingCollections } = await supabase
            .from("hotel_collects")
            .select("amount_collected, status, related_id")
            .eq("related_type", "SERVICE")
            .eq("unified_booking_id", data.unified_booking_id)
            .neq("status", "VOIDED")
            .is("related_id", null);

          // Get all service orders for this booking to calculate proportion
          const { data: allOrders } = await supabase
            .from("service_orders")
            .select("id, sale_price")
            .eq("unified_booking_id", data.unified_booking_id);

          const totalServiceAmount = allOrders?.reduce((sum, o) => sum + (o.sale_price || 0), 0) || 0;
          const totalCollected = bookingCollections?.reduce((sum, c) => sum + (c.amount_collected || 0), 0) || 0;

          if (totalServiceAmount > 0) {
            const proportion = (data.sale_price || 0) / totalServiceAmount;
            amountCollected = Math.round(totalCollected * proportion);
          }
        }
      }

      const amountRemaining = Math.max(0, (data.sale_price || 0) - amountCollected);
      let paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID' = 'UNPAID';

      if (amountCollected >= (data.sale_price || 0)) {
        paymentStatus = 'PAID';
      } else if (amountCollected > 0) {
        paymentStatus = 'PARTIAL';
      }

      return {
        ...data,
        unified_bookings: bookingData,
        amount_collected: amountCollected,
        amount_remaining: amountRemaining,
        payment_status: paymentStatus,
      } as ServiceOrder;
    },
    enabled: !!orderId,
  });
};

export const useServiceOrdersByBooking = (bookingId: string) => {
  return useQuery({
    queryKey: ["service_orders", "booking", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select(`
          *,
          service_catalog(service_name, service_type),
          partners(partner_name)
        `)
        .eq("unified_booking_id", bookingId)
        .order("service_date_time", { ascending: true });

      if (error) throw error;

      // Fetch all SERVICE collections for this booking
      const collectionsMapByOrder: Record<string, number> = {};

      const { data: collections } = await supabase
        .from("hotel_collects")
        .select("related_id, amount_collected, status")
        .eq("related_type", "SERVICE")
        .eq("unified_booking_id", bookingId)
        .neq("status", "VOIDED");

      if (collections) {
        collections.forEach((c: any) => {
          if (c.related_id) {
            collectionsMapByOrder[c.related_id] = (collectionsMapByOrder[c.related_id] || 0) + (c.amount_collected || 0);
          }
        });
      }

      // Only pro-rate booking-level collections that are NOT linked to a specific service order
      const unallocatedBookingCollections =
        collections?.filter((c: any) => !c.related_id).reduce((sum: number, c: any) => sum + (c.amount_collected || 0), 0) || 0;

      // Total service amount for pro-rating unallocated booking-level collections
      const totalServiceAmount = data?.reduce((sum, o) => sum + (o.sale_price || 0), 0) || 0;

      return data?.map((order: any) => {
        let amountCollected = 0;

        if (collectionsMapByOrder[order.id]) {
          amountCollected = collectionsMapByOrder[order.id];
        } else if (totalServiceAmount > 0) {
          const proportion = (order.sale_price || 0) / totalServiceAmount;
          amountCollected = Math.round(unallocatedBookingCollections * proportion);
        }

        const amountRemaining = Math.max(0, (order.sale_price || 0) - amountCollected);
        let paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID' = 'UNPAID';

        if (amountCollected >= (order.sale_price || 0)) {
          paymentStatus = 'PAID';
        } else if (amountCollected > 0) {
          paymentStatus = 'PARTIAL';
        }

        return {
          ...order,
          amount_collected: amountCollected,
          amount_remaining: amountRemaining,
          payment_status: paymentStatus,
        };
      }) as ServiceOrder[];
    },
    enabled: !!bookingId,
  });
};

export const useCreateServiceOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      unified_booking_id?: string;
      service_id: string;
      partner_id?: string;
      service_date_time: string;
      pax: number;
      sale_price: number;
      cost_price: number;
      collector_type: string;
      service_provider_type: string; // ROOMRISE | HOST | PARTNER
      note?: string;
      customer_name?: string;
    }) => {
      // Validation - partner_id required when service_provider_type is HOST or PARTNER
      if ((data.service_provider_type === 'HOST' || data.service_provider_type === 'PARTNER') && !data.partner_id) {
        throw new Error("Vui lòng chọn đối tác/Host cung cấp dịch vụ");
      }
      if (data.sale_price <= 0) {
        throw new Error("Số tiền phải lớn hơn 0");
      }

      const { data: user } = await supabase.auth.getUser();

      // Map collector_type for DB
      const dbCollectorType = data.collector_type === 'PARTNER' ? 'SERVICE_PARTNER' : data.collector_type;

      const { data: order, error } = await supabase
        .from("service_orders")
        .insert({
          unified_booking_id: data.unified_booking_id || null,
          service_id: data.service_id,
          partner_id: data.service_provider_type !== 'ROOMRISE' ? data.partner_id : null,
          service_date_time: data.service_date_time,
          pax: data.pax,
          sale_price: data.sale_price,
          cost_price: data.cost_price,
          collector_type: dbCollectorType,
          service_provider_type: data.service_provider_type,
          note: data.note || null,
          status: "NEW",
          created_by: user?.user?.id,
          property_group_id: AN_GIA_GROUP_ID,
        })
        .select()
        .single();

      if (error) throw error;
      return order;
    },
    onSuccess: (_, variables) => {
      // Invalidate all service order queries including booking-specific ones
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
      if (variables.unified_booking_id) {
        queryClient.invalidateQueries({ queryKey: ["service_orders", "booking", variables.unified_booking_id] });
      }
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      toast.success("Tạo đơn dịch vụ thành công");
    },
    onError: (error: Error) => {
      toast.error("Lỗi: " + error.message);
    },
  });
};

export const useUpdateServiceOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      id: string;
      note?: string;
      status?: string;
      sale_price?: number;
      cost_price?: number;
      partner_id?: string;
      service_id?: string;
      service_date_time?: string;
      pax?: number;
    }) => {
      // Get current order to check rules
      const { data: currentOrder, error: fetchError } = await supabase
        .from("service_orders")
        .select("status, sale_price, unified_booking_id")
        .eq("id", data.id)
        .single();

      if (fetchError) throw fetchError;

      // Rule: Cannot change price after DONE/COMPLETED
      if (data.sale_price !== undefined && currentOrder.status === 'DONE') {
        throw new Error("Không thể sửa giá sau khi đơn dịch vụ đã hoàn thành. Vui lòng tạo giao dịch điều chỉnh.");
      }

      // Rule: Cannot CANCEL if has collections (need to check hotel_collects)
      if (data.status === 'CANCELLED') {
        // Check for direct order-level collections
        const { data: orderCollections } = await supabase
          .from("hotel_collects")
          .select("amount_collected")
          .eq("related_type", "SERVICE")
          .eq("related_id", data.id)
          .neq("status", "VOIDED");

        let totalCollected = orderCollections?.reduce((sum, c) => sum + (c.amount_collected || 0), 0) || 0;

        // Also check booking-level SERVICE collections if no direct matches
        if (totalCollected === 0 && currentOrder.unified_booking_id) {
          const { data: bookingCollections } = await supabase
            .from("hotel_collects")
            .select("amount_collected")
            .eq("related_type", "SERVICE")
            .eq("unified_booking_id", currentOrder.unified_booking_id)
            .neq("status", "VOIDED");

          totalCollected = bookingCollections?.reduce((sum, c) => sum + (c.amount_collected || 0), 0) || 0;
        }

        if (totalCollected > 0) {
          throw new Error("Không thể hủy đơn dịch vụ đã thu tiền. Vui lòng hoàn tiền trước.");
        }
      }

      const updateData: any = {};
      if (data.note !== undefined) updateData.note = data.note;
      if (data.status !== undefined) {
        // Map display status to DB status
        const statusMap: Record<string, string> = {
          'DRAFT': 'NEW',
          'CONFIRMED': 'CONFIRMED',
          'IN_PROGRESS': 'ASSIGNED',
          'COMPLETED': 'DONE',
          'CANCELLED': 'CANCELLED',
        };
        updateData.status = statusMap[data.status] || data.status;
      }
      if (data.sale_price !== undefined) updateData.sale_price = data.sale_price;
      if (data.cost_price !== undefined) updateData.cost_price = data.cost_price;
      if (data.partner_id !== undefined) updateData.partner_id = data.partner_id;
      if (data.service_id !== undefined) updateData.service_id = data.service_id;
      if (data.service_date_time !== undefined) updateData.service_date_time = data.service_date_time;
      if (data.pax !== undefined) updateData.pax = data.pax;

      const { error } = await supabase
        .from("service_orders")
        .update(updateData)
        .eq("id", data.id);

      if (error) throw error;

      // Return booking id for cache invalidation
      return { unified_booking_id: currentOrder.unified_booking_id, newStatus: data.status };
    },
    // OPTIMISTIC UPDATE
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["service_orders"] });
      await queryClient.cancelQueries({ queryKey: ["service_order", variables.id] });

      const previousOrders = queryClient.getQueryData(["service_orders"]);
      const previousOrder = queryClient.getQueryData(["service_order", variables.id]);

      // Optimistically update order
      queryClient.setQueryData(["service_orders"], (old: any[] | undefined) => {
        if (!old) return old;
        return old.map(order =>
          order.id === variables.id
            ? { ...order, ...variables, _isOptimistic: true }
            : order
        );
      });

      queryClient.setQueryData(["service_order", variables.id], (old: any) => {
        if (!old) return old;
        return { ...old, ...variables, _isOptimistic: true };
      });

      return { previousOrders, previousOrder };
    },
    onError: (error: Error, variables, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(["service_orders"], context.previousOrders);
      }
      if (context?.previousOrder) {
        queryClient.setQueryData(["service_order", variables.id], context.previousOrder);
      }
      toast.error("Lỗi: " + error.message);
    },
    onSuccess: (result) => {
      toast.success("Cập nhật thành công");
      // Partial invalidation
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["service_orders"] });
        queryClient.invalidateQueries({ queryKey: ["service_order"] });
        if (result?.unified_booking_id) {
          queryClient.invalidateQueries({ queryKey: ["service_orders", "booking", result.unified_booking_id] });
        }
      }, 100);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      }, 500);
    },
  });
};

// Delete service order (only NEW/DRAFT status and no payments)
export const useDeleteServiceOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      // Get current order to check rules
      const { data: currentOrder, error: fetchError } = await supabase
        .from("service_orders")
        .select("id, status, sale_price, unified_booking_id, note")
        .eq("id", orderId)
        .single();

      if (fetchError) throw fetchError;

      // Rule: Cannot delete if status is DONE/COMPLETED
      if (currentOrder.status === 'DONE') {
        throw new Error("Không thể xóa đơn dịch vụ đã hoàn thành");
      }

      // Check for collections
      let totalCollected = 0;

      // Check ONLY collections linked to THIS specific service order
      const { data: orderCollections } = await supabase
        .from("hotel_collects")
        .select("amount_collected")
        .eq("related_type", "SERVICE")
        .eq("related_id", orderId)
        .neq("status", "VOIDED");

      totalCollected = orderCollections?.reduce((sum, c) => sum + (c.amount_collected || 0), 0) || 0;

      if (totalCollected > 0) {
        throw new Error("Không thể xóa đơn dịch vụ đã thu tiền. Vui lòng hoàn tiền trước.");
      }

      const { data: deletedOrder, error } = await supabase
        .from("service_orders")
        .delete()
        .eq("id", orderId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!deletedOrder) {
        throw new Error("Xóa không thành công. Bạn không có quyền xóa hoặc đơn dịch vụ đã bị thay đổi.");
      }

      // Audit log
      await createAuditLog({
        action: "Xóa đơn dịch vụ",
        entity: "service_orders",
        entityId: orderId,
        beforeData: currentOrder,
        afterData: null,
      });

      // Return booking id for cache invalidation
      return { unified_booking_id: currentOrder.unified_booking_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
      queryClient.invalidateQueries({ queryKey: ["service_order"] });
      if (result?.unified_booking_id) {
        queryClient.invalidateQueries({ queryKey: ["service_orders", "booking", result.unified_booking_id] });
      }
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      toast.success("Đã xóa đơn dịch vụ");
    },
    onError: (error: Error) => {
      toast.error("Lỗi: " + error.message);
    },
  });
};

// Stats for reporting
export const useServiceOrderStats = (filters?: { dateFrom?: string; dateTo?: string }) => {
  return useQuery({
    queryKey: ["service_order_stats", filters],
    queryFn: async () => {
      const buildBaseQuery = () => {
        let q = supabase
          .from("service_orders")
          .select(`
            *,
            service_catalog(service_name, service_type),
            partners(partner_name)
          `)
          // Server-side scoping: same as list query
          .eq("property_group_id", AN_GIA_GROUP_ID);

        if (filters?.dateFrom) {
          q = q.gte("created_at", `${filters.dateFrom}T00:00:00+07:00`);
        }
        if (filters?.dateTo) {
          q = q.lte("created_at", `${filters.dateTo}T23:59:59+07:00`);
        }

        return q;
      };

      const { data, error } = await buildBaseQuery();
      if (error) throw error;

      const orders = data || [];

      // Get unique booking IDs
      const bookingIds = [...new Set(orders.filter(o => o.unified_booking_id).map(o => o.unified_booking_id))];

      // Fetch all SERVICE collections by booking
      let collectionsMapByBooking: Record<string, number> = {};
      let collectionsMapByOrder: Record<string, number> = {};

      if (bookingIds.length > 0) {
        const { data: collections } = await supabase
          .from("hotel_collects")
          .select("unified_booking_id, related_id, amount_collected, status")
          .eq("related_type", "SERVICE")
          .neq("status", "VOIDED")
          .in("unified_booking_id", bookingIds);

        if (collections) {
          collections.forEach(c => {
            if (c.related_id) {
              if (!collectionsMapByOrder[c.related_id]) {
                collectionsMapByOrder[c.related_id] = 0;
              }
              collectionsMapByOrder[c.related_id] += c.amount_collected || 0;
            }
            if (c.unified_booking_id) {
              if (!collectionsMapByBooking[c.unified_booking_id]) {
                collectionsMapByBooking[c.unified_booking_id] = 0;
              }
              collectionsMapByBooking[c.unified_booking_id] += c.amount_collected || 0;
            }
          });
        }
      }

      // Calculate total services per booking for pro-rating
      const servicesPerBooking: Record<string, number> = {};
      orders.forEach((order: any) => {
        if (order.unified_booking_id) {
          if (!servicesPerBooking[order.unified_booking_id]) {
            servicesPerBooking[order.unified_booking_id] = 0;
          }
          servicesPerBooking[order.unified_booking_id] += order.sale_price || 0;
        }
      });

      // Calculate stats with proper collection mapping
      const total = orders.length;
      const totalPhaiThu = orders.reduce((sum: number, o: any) => sum + (o.sale_price || 0), 0);

      // Calculate totalDaThu from all booking collections (deduplicated)
      const totalDaThu = Object.values(collectionsMapByBooking).reduce((sum, val) => sum + val, 0);
      const totalConLai = Math.max(0, totalPhaiThu - totalDaThu);
      const totalCost = orders.reduce((sum: number, o: any) => sum + (o.cost_price || 0), 0);

      let paidCount = 0;
      let partialCount = 0;
      let unpaidCount = 0;
      let completedWithDebt = 0;

      orders.forEach((order: any) => {
        let collected = 0;
        if (collectionsMapByOrder[order.id]) {
          collected = collectionsMapByOrder[order.id];
        } else if (order.unified_booking_id && collectionsMapByBooking[order.unified_booking_id]) {
          const totalForBooking = servicesPerBooking[order.unified_booking_id] || 1;
          const proportion = (order.sale_price || 0) / totalForBooking;
          collected = Math.round(collectionsMapByBooking[order.unified_booking_id] * proportion);
        }

        if (collected >= (order.sale_price || 0)) {
          paidCount++;
        } else if (collected > 0) {
          partialCount++;
        } else {
          unpaidCount++;
        }

        // Warning: COMPLETED/DONE with remaining amount
        if (order.status === 'DONE' && collected < (order.sale_price || 0)) {
          completedWithDebt++;
        }
      });

      const byType: Record<string, { count: number; value: number }> = {};
      const byProvider: Record<string, { count: number; value: number }> = {};
      const byPartner: Record<string, { count: number; value: number }> = {};
      const byStatus: Record<string, number> = {};
      const byMonth: Record<string, { count: number; value: number }> = {};

      orders.forEach((order: any) => {
        const type = order.service_catalog?.service_type || "OTHER";
        const provider = order.collector_type || "ROOMRISE";
        const status = order.status || "NEW";
        const partnerName = order.partners?.partner_name || "Không xác định";
        const month = (order.created_at || order.service_date_time || "").slice(0, 7) || "Unknown";

        if (!byType[type]) byType[type] = { count: 0, value: 0 };
        byType[type].count++;
        byType[type].value += order.sale_price || 0;

        if (!byProvider[provider]) byProvider[provider] = { count: 0, value: 0 };
        byProvider[provider].count++;
        byProvider[provider].value += order.sale_price || 0;

        if (!byPartner[partnerName]) byPartner[partnerName] = { count: 0, value: 0 };
        byPartner[partnerName].count++;
        byPartner[partnerName].value += order.sale_price || 0;

        if (!byMonth[month]) byMonth[month] = { count: 0, value: 0 };
        byMonth[month].count++;
        byMonth[month].value += order.sale_price || 0;

        byStatus[status] = (byStatus[status] || 0) + 1;
      });

      return {
        total,
        totalPhaiThu,
        totalDaThu,
        totalConLai,
        totalCost,
        totalValue: totalPhaiThu, // alias for reports page
        margin: totalPhaiThu - totalCost,
        paidCount,
        partialCount,
        unpaidCount,
        completedWithDebt,
        byType,
        byProvider,
        byPartner,
        byStatus,
        byMonth,
      };
    },
  });
};
