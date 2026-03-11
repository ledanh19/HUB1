import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BookingRoomLine {
  id: string;
  line_index: number;
  line_key: string;
  pms_booking_id: string;
  check_in_date: string;
  check_out_date: string;
  nights: number;
  amount: number | null;
  room_type: string | null;
  rate_plan: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
}

export function useBookingRoomLines(unifiedBookingId: string | null) {
  return useQuery({
    queryKey: ['booking-room-lines', unifiedBookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!unifiedBookingId) return [];

      // First get the pms_booking_id from bookings_mirror
      const { data: booking, error: bookingError } = await supabase
        .from('bookings_mirror')
        .select('pms_booking_id')
        .eq('unified_booking_id', unifiedBookingId)
        .maybeSingle();

      if (bookingError) throw bookingError;
      if (!booking?.pms_booking_id) return [];

      // Then fetch room lines
      const { data, error } = await supabase
        .from('booking_room_lines_mirror')
        .select('*')
        .eq('pms_booking_id', booking.pms_booking_id)
        .order('line_index');

      if (error) throw error;
      return (data || []) as BookingRoomLine[];
    },
    enabled: !!unifiedBookingId,
  });
}

// Helper to calculate multi-room coverage
export function calculateMultiRoomCoverage(
  roomLines: BookingRoomLine[],
  segments: { date_from: string; date_to: string; room_line_index?: number | null }[]
) {
  if (roomLines.length === 0) {
    return { isMultiRoom: false, roomCount: 1, roomCoverages: [] };
  }

  const roomCoverages = roomLines.map((roomLine, index) => {
    // Get segments assigned to this room line
    const roomSegments = segments.filter(s => s.room_line_index === index);
    
    // Calculate nights covered
    let coveredNights = 0;
    roomSegments.forEach(seg => {
      const from = new Date(seg.date_from);
      const to = new Date(seg.date_to);
      coveredNights += Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    });

    return {
      lineIndex: index,
      totalNights: roomLine.nights,
      coveredNights,
      missingNights: roomLine.nights - coveredNights,
      isComplete: coveredNights >= roomLine.nights,
      roomType: roomLine.room_type,
      amount: roomLine.amount,
    };
  });

  return {
    isMultiRoom: roomLines.length > 1,
    roomCount: roomLines.length,
    roomCoverages,
    totalRequired: roomLines.reduce((sum, r) => sum + r.nights, 0),
    totalCovered: roomCoverages.reduce((sum, r) => sum + r.coveredNights, 0),
    totalMissing: roomCoverages.reduce((sum, r) => sum + r.missingNights, 0),
    allComplete: roomCoverages.every(r => r.isComplete),
  };
}
