import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// =========================================================================
// Types
// =========================================================================
export interface WhatsAppIntegration {
  id: string;
  tenant_id: string;
  phone_number_id: string;
  waba_id: string;
  display_phone: string | null;
  verify_token: string;
  app_secret_ref: string;
  access_token_ref: string;
  status: 'active' | 'inactive';
  webhook_url: string | null;
  last_webhook_received_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppHealthInfo {
  connected: boolean;
  last_webhook_received_at: string | null;
  signature_invalid_24h: number;
  last_error: string | null;
  total_webhooks_24h: number;
}

export interface SaveIntegrationPayload {
  waba_id: string;
  phone_number_id: string;
  display_phone?: string;
  verify_token: string;
  access_token_ref: string;
  app_secret_ref: string;
}

// =========================================================================
// GET integration for current tenant
// =========================================================================
export function useWhatsAppIntegration() {
  const { user } = useAuth();

  return useQuery<WhatsAppIntegration | null>({
    queryKey: ['whatsapp-integration', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('whatsapp_integrations' as any)
        .select('*')
        .eq('tenant_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data as unknown) as WhatsAppIntegration | null;
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}

// =========================================================================
// SAVE (create or update) integration
// =========================================================================
export function useSaveWhatsAppIntegration() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SaveIntegrationPayload) => {
      if (!user?.id) throw new Error('Not authenticated');

      // Normalize phone_number_id to digits only
      const normalizedPhoneNumberId = payload.phone_number_id.replace(/[^\d]/g, '');

      if (!normalizedPhoneNumberId) {
        throw new Error('Phone Number ID phải chứa ít nhất 1 chữ số');
      }

      // Check if integration already exists for this tenant
      const { data: existing } = await supabase
        .from('whatsapp_integrations' as any)
        .select('id')
        .eq('tenant_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (existing) {
        // UPDATE — only update provided fields, keep existing secret_refs if blank
        const updatePayload: Record<string, unknown> = {
          waba_id: payload.waba_id.trim(),
          phone_number_id: normalizedPhoneNumberId,
          verify_token: payload.verify_token.trim(),
          updated_at: new Date().toISOString(),
        };

        if (payload.display_phone) {
          updatePayload.display_phone = payload.display_phone.trim();
        }

        // Only update secret refs if provided (non-empty)
        if (payload.access_token_ref.trim()) {
          updatePayload.access_token_ref = payload.access_token_ref.trim();
        }
        if (payload.app_secret_ref.trim()) {
          updatePayload.app_secret_ref = payload.app_secret_ref.trim();
        }

        const { data, error } = await supabase
          .from('whatsapp_integrations' as any)
          .update(updatePayload)
          .eq('id', (existing as any).id)
          .select()
          .single();

        if (error) throw error;
        return (data as unknown) as WhatsAppIntegration;
      } else {
        // CREATE — all fields required
        if (!payload.access_token_ref.trim()) {
          throw new Error('Access Token Ref bắt buộc khi tạo mới');
        }
        if (!payload.app_secret_ref.trim()) {
          throw new Error('App Secret Ref bắt buộc khi tạo mới');
        }

        const { data, error } = await supabase
          .from('whatsapp_integrations' as any)
          .insert({
            tenant_id: user.id,
            waba_id: payload.waba_id.trim(),
            phone_number_id: normalizedPhoneNumberId,
            display_phone: payload.display_phone?.trim() || null,
            verify_token: payload.verify_token.trim(),
            access_token_ref: payload.access_token_ref.trim(),
            app_secret_ref: payload.app_secret_ref.trim(),
            status: 'active',
          })
          .select()
          .single();

        if (error) throw error;
        return (data as unknown) as WhatsAppIntegration;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-integration'] });
      toast.success('Đã lưu cấu hình WhatsApp');
    },
    onError: (error: Error) => {
      toast.error(`Lỗi: ${error.message}`);
    },
  });
}

// =========================================================================
// Test send (hello_world template)
// =========================================================================
export function useTestSendWhatsApp() {
  return useMutation({
    mutationFn: async ({ toPhone, phoneNumberId }: { toPhone: string; phoneNumberId: string }) => {
      // Normalize phone (remove non-digits)
      const normalizedPhone = toPhone.replace(/[^\d]/g, '');
      if (!normalizedPhone || normalizedPhone.length < 8) {
        throw new Error('Số điện thoại không hợp lệ');
      }

      const { data, error } = await supabase.functions.invoke('whatsapp-test-send', {
        body: {
          to_phone: normalizedPhone,
          phone_number_id: phoneNumberId,
          template_name: 'hello_world',
          language: 'en_US',
        },
      });

      if (error) throw error;

      // Edge function may return error in body
      if (data?.error) {
        throw new Error(data.error);
      }

      return data;
    },
    onSuccess: () => {
      toast.success('Tin nhắn test đã được gửi thành công!');
    },
    onError: (error: Error) => {
      toast.error(`Gửi test thất bại: ${error.message}`);
    },
  });
}

// =========================================================================
// Webhook health check — query webhook_events_log for stats
// =========================================================================
export function useWhatsAppHealth(phoneNumberId: string | null | undefined) {
  return useQuery<WhatsAppHealthInfo>({
    queryKey: ['whatsapp-health', phoneNumberId],
    queryFn: async () => {
      if (!phoneNumberId) {
        return {
          connected: false,
          last_webhook_received_at: null,
          signature_invalid_24h: 0,
          last_error: null,
          total_webhooks_24h: 0,
        };
      }

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Get latest webhook event
      const { data: latestEvent } = await supabase
        .from('webhook_events_log' as any)
        .select('received_at, signature_valid, processing_status, error_message')
        .eq('phone_number_id', phoneNumberId)
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const event = latestEvent as Record<string, any> | null;

      // Count signature failures in last 24h
      const { count: invalidCount } = await supabase
        .from('webhook_events_log' as any)
        .select('id', { count: 'exact', head: true })
        .eq('phone_number_id', phoneNumberId)
        .eq('signature_valid', false)
        .gte('received_at', twentyFourHoursAgo);

      // Count total webhooks in last 24h
      const { count: totalCount } = await supabase
        .from('webhook_events_log' as any)
        .select('id', { count: 'exact', head: true })
        .eq('phone_number_id', phoneNumberId)
        .gte('received_at', twentyFourHoursAgo);

      return {
        connected: !!event,
        last_webhook_received_at: event?.received_at ?? null,
        signature_invalid_24h: invalidCount ?? 0,
        last_error: event?.error_message ?? null,
        total_webhooks_24h: totalCount ?? 0,
      };
    },
    enabled: !!phoneNumberId,
    staleTime: 60_000,
    refetchInterval: 60_000, // Auto-refresh every minute
  });
}

// =========================================================================
// Generate a random verify token
// =========================================================================
export function generateVerifyToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'rr_verify_';
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
