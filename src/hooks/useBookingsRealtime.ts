import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * @deprecated useBookingsRealtime removed — useRealtimeSystem in MainLayout handles all realtime.
 * Only useSyncStatusRealtime remains for ChannexIntegrationPage.
 */

/**
 * Hook to subscribe to sync status updates
 */
export function useSyncStatusRealtime(onUpdate?: (payload: any) => void) {
  const queryClient = useQueryClient();
  // Store callback in ref to avoid resubscribing on every render
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    const channel = supabase
      .channel("sync_status_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sync_runs",
        },
        (payload) => {
          console.log("sync_runs change:", payload);
          queryClient.invalidateQueries({ queryKey: ["sync-runs"] });
          queryClient.invalidateQueries({ queryKey: ["sync-state"] });
          
          onUpdateRef.current?.(payload);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sync_state",
        },
        (payload) => {
          console.log("sync_state change:", payload);
          queryClient.invalidateQueries({ queryKey: ["sync-state"] });
          
          onUpdateRef.current?.(payload);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "webhook_events",
        },
        (payload) => {
          console.log("webhook_events change:", payload);
          queryClient.invalidateQueries({ queryKey: ["webhook-events"] });
          
          onUpdateRef.current?.(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
   
  }, [queryClient]);
}
