import { useState, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { Search, Link2, Calendar, User, Building2, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface BookingResult {
  unified_booking_id: string;
  guest_name: string | null;
  guest_phone: string | null;
  ota_booking_code: string | null;
  ota_source: string | null;
  pms_property_name: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  nights: number | null;
  booking_status: string | null;
}

interface LinkBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  waCustomerPhone?: string | null;
}

export function LinkBookingDialog({
  open,
  onOpenChange,
  conversationId,
  waCustomerPhone,
}: LinkBookingDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<BookingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const queryClient = useQueryClient();

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);

    try {
      const query = searchQuery.trim();
      
      // Search by booking code, guest name, or phone
      const { data, error } = await supabase
        .from('bookings_mirror')
        .select('unified_booking_id, guest_name, guest_phone, ota_booking_code, ota_source, pms_property_name, check_in_date, check_out_date, nights, booking_status')
        .or(`guest_name.ilike.%${query}%,ota_booking_code.ilike.%${query}%,guest_phone.ilike.%${query}%`)
        .order('check_in_date', { ascending: false })
        .limit(20);

      if (error) throw error;
      setResults(data || []);
    } catch (err) {
      console.error('Error searching bookings:', err);
      toast.error('Lỗi tìm kiếm booking');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const handleLink = useCallback(async (booking: BookingResult) => {
    setIsLinking(true);
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ unified_booking_id: booking.unified_booking_id })
        .eq('id', conversationId);

      if (error) throw error;

      toast.success(`Đã liên kết với booking ${booking.ota_booking_code || booking.unified_booking_id.slice(0, 8)}`);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      onOpenChange(false);
      setSearchQuery('');
      setResults([]);
    } catch (err) {
      console.error('Error linking booking:', err);
      toast.error('Lỗi liên kết booking');
    } finally {
      setIsLinking(false);
    }
  }, [conversationId, queryClient, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Liên kết Booking
          </DialogTitle>
          <DialogDescription>
            Tìm và liên kết booking với hội thoại WhatsApp
            {waCustomerPhone && (
              <span className="ml-1 font-mono text-primary">
                (+{waCustomerPhone.replace(/^\+/, '')})
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Search input */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Tên khách, mã booking, SĐT..."
              className="pl-9"
              autoFocus
            />
          </div>
          <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Tìm'}
          </Button>
        </div>

        {/* Results */}
        <ScrollArea className="max-h-[400px]">
          {results.length === 0 && !isSearching && searchQuery && (
            <div className="text-center text-muted-foreground py-8 text-sm">
              Không tìm thấy booking phù hợp
            </div>
          )}

          <div className="space-y-2">
            {results.map((booking) => (
              <button
                key={booking.unified_booking_id}
                onClick={() => handleLink(booking)}
                disabled={isLinking}
                className={cn(
                  "w-full text-left p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors",
                  isLinking && "opacity-50 pointer-events-none"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 flex-1 min-w-0">
                    {/* Guest name */}
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm truncate">
                        {booking.guest_name || 'Không rõ tên'}
                      </span>
                    </div>

                    {/* Booking code + OTA */}
                    <div className="flex items-center gap-2">
                      {booking.ota_booking_code && (
                        <Badge variant="outline" className="text-micro px-1.5 py-0">
                          {booking.ota_booking_code}
                        </Badge>
                      )}
                      {booking.ota_source && (
                        <Badge variant="secondary" className="text-micro px-1.5 py-0">
                          {booking.ota_source}
                        </Badge>
                      )}
                      {booking.booking_status && (
                        <Badge 
                          variant={booking.booking_status === 'confirmed' ? 'default' : 'secondary'} 
                          className="text-micro px-1.5 py-0"
                        >
                          {booking.booking_status}
                        </Badge>
                      )}
                    </div>

                    {/* Dates + Property */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {booking.check_in_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(parseISO(booking.check_in_date), 'dd/MM')}
                          {booking.check_out_date && ` → ${format(parseISO(booking.check_out_date), 'dd/MM')}`}
                        </span>
                      )}
                      {booking.pms_property_name && (
                        <span className="flex items-center gap-1 truncate">
                          <Building2 className="h-3 w-3" />
                          {booking.pms_property_name}
                        </span>
                      )}
                    </div>
                  </div>

                  <Link2 className="h-4 w-4 text-primary shrink-0 mt-1" />
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
