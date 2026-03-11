import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Graded correctness scoring functions
function calculateSelloutRiskScore(finalOccupancyPct: number, soldOutEarly: boolean): number {
  if (soldOutEarly) return 1.0;
  if (finalOccupancyPct >= 90) return 0.7;
  if (finalOccupancyPct >= 70) return 0.4;
  return 0.0;
}

function calculateVacancySeverityScore(finalRemainingPct: number): number {
  if (finalRemainingPct > 30) return 1.0;
  if (finalRemainingPct >= 15) return 0.7;
  if (finalRemainingPct > 0) return 0.4;
  return 0.0;
}

function classifyOutcome(
  signalClass: string,
  finalOccupancyPct: number,
  soldOutEarly: boolean
): string {
  const wasSelloutRisk = signalClass === 'SELL_OUT_RISK';
  const wasVacancyRisk = signalClass === 'VACANCY_RISK';
  const actualSellout = finalOccupancyPct >= 90 || soldOutEarly;
  const actualVacancy = finalOccupancyPct < 70;

  if (wasSelloutRisk && actualSellout) return 'TRUE_POSITIVE';
  if (wasSelloutRisk && !actualSellout) return 'FALSE_POSITIVE';
  if (wasVacancyRisk && actualVacancy) return 'TRUE_POSITIVE';
  if (wasVacancyRisk && !actualVacancy) return 'FALSE_POSITIVE';
  if (!wasSelloutRisk && !wasVacancyRisk && !actualSellout && !actualVacancy) return 'TRUE_NEGATIVE';
  if (!wasSelloutRisk && actualSellout) return 'FALSE_NEGATIVE';
  if (!wasVacancyRisk && actualVacancy) return 'FALSE_NEGATIVE';
  
  return 'TRUE_NEGATIVE';
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const today = new Date().toISOString().split('T')[0];

    console.log(`[AI Pricing Outcome Evaluation] Starting evaluation for dates before ${today}`);

    // 1. Find all shadow signals for past stay dates that don't have outcomes yet
    const { data: pendingSignals, error: signalsError } = await supabase
      .from('ai_pricing_shadow_signals')
      .select(`
        *,
        ai_pricing_validation_outcomes (id)
      `)
      .lt('stay_date', today)
      .order('stay_date', { ascending: true });

    if (signalsError) {
      throw signalsError;
    }

    // Filter to signals without outcomes
    const signalsToEvaluate = (pendingSignals || []).filter(
      (s: { ai_pricing_validation_outcomes: unknown[] }) => !s.ai_pricing_validation_outcomes || s.ai_pricing_validation_outcomes.length === 0
    );

    console.log(`[AI Pricing Outcome Evaluation] Found ${signalsToEvaluate.length} signals to evaluate`);

    if (signalsToEvaluate.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pending signals to evaluate", evaluated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Group signals by property and stay_date to batch-fetch actual outcomes
    const signalsByPropertyDate = new Map<string, typeof signalsToEvaluate>();
    for (const signal of signalsToEvaluate) {
      const key = `${signal.property_id}:${signal.stay_date}`;
      if (!signalsByPropertyDate.has(key)) {
        signalsByPropertyDate.set(key, []);
      }
      signalsByPropertyDate.get(key)!.push(signal);
    }

    const evaluationResults: {
      signal_id: string;
      final_occupancy_pct: number;
      final_remaining_inventory: number;
      sold_out_at: string | null;
      had_booking_surge: boolean;
      had_late_pickup: boolean;
      sellout_risk_score: number;
      vacancy_severity_score: number;
      classification: string;
      context_tag: string;
      weighted_accuracy_score: number;
      evaluated_at: string;
    }[] = [];

    // 3. For each property/date, calculate actual outcome from inventory_cells + bookings
    for (const [key, signals] of signalsByPropertyDate) {
      const [propertyId, stayDate] = key.split(':');
      
      // Get actual inventory data for this date
      const { data: inventoryData } = await supabase
        .from('inventory_cells')
        .select('availability, rate')
        .eq('property_id', propertyId)
        .eq('date', stayDate);

      // Get bookings that cover this stay date
      const { data: bookingsData } = await supabase
        .from('bookings_mirror')
        .select('id, booking_status, created_at')
        .eq('channex_property_id', propertyId)
        .lte('check_in_date', stayDate)
        .gt('check_out_date', stayDate)
        .in('booking_status', ['CONFIRMED', 'MODIFIED']);

      // Calculate actual metrics
      const totalInventory = signals[0].total_inventory;
      const actualBookings = bookingsData?.length || 0;
      const finalRemainingInventory = Math.max(0, totalInventory - actualBookings);
      const finalOccupancyPct = totalInventory > 0 
        ? (actualBookings / totalInventory) * 100 
        : 0;
      const finalRemainingPct = totalInventory > 0 
        ? (finalRemainingInventory / totalInventory) * 100 
        : 0;

      // Check for early sell-out (sold out before D-1)
      let soldOutAt: string | null = null;
      if (actualBookings >= totalInventory) {
        // Find when inventory became 0
        const sortedBookings = (bookingsData || []).sort((a: { created_at: string }, b: { created_at: string }) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        if (sortedBookings.length >= totalInventory) {
          const lastBookingForFull = sortedBookings[totalInventory - 1];
          if (lastBookingForFull) {
            const soldOutDate = new Date(lastBookingForFull.created_at);
            const stayDateObj = new Date(stayDate);
            const daysBeforeStay = Math.floor((stayDateObj.getTime() - soldOutDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysBeforeStay >= 1) {
              soldOutAt = lastBookingForFull.created_at;
            }
          }
        }
      }

      // Check for booking surge (>50% of bookings in last 48h before check-in)
      const checkInTime = new Date(stayDate).getTime();
      const last48h = checkInTime - (48 * 60 * 60 * 1000);
      const lateBookings = (bookingsData || []).filter((b: { created_at: string }) => 
        new Date(b.created_at).getTime() >= last48h
      );
      const hadBookingSurge = actualBookings > 0 && lateBookings.length / actualBookings > 0.5;
      const hadLatePickup = lateBookings.length > 0;

      // Evaluate each signal for this property/date
      for (const signal of signals) {
        const soldOutEarly = !!soldOutAt;
        const classification = classifyOutcome(signal.signal_class, finalOccupancyPct, soldOutEarly);
        const selloutRiskScore = calculateSelloutRiskScore(finalOccupancyPct, soldOutEarly);
        const vacancySeverityScore = calculateVacancySeverityScore(finalRemainingPct);

        // Weighted accuracy score
        const isCorrect = classification === 'TRUE_POSITIVE' || classification === 'TRUE_NEGATIVE';
        const weight = signal.signal_class === 'SELL_OUT_RISK' ? 1.5 : 
                       signal.signal_class === 'VACANCY_RISK' ? 1.3 : 1.0;
        const weightedAccuracyScore = isCorrect ? weight : 0;

        evaluationResults.push({
          signal_id: signal.id,
          final_occupancy_pct: finalOccupancyPct,
          final_remaining_inventory: finalRemainingInventory,
          sold_out_at: soldOutAt,
          had_booking_surge: hadBookingSurge,
          had_late_pickup: hadLatePickup,
          sellout_risk_score: selloutRiskScore,
          vacancy_severity_score: vacancySeverityScore,
          classification,
          context_tag: 'NORMAL', // Can be enhanced with external event detection
          weighted_accuracy_score: weightedAccuracyScore,
          evaluated_at: new Date().toISOString(),
        });
      }
    }

    // 4. Insert all evaluation results
    if (evaluationResults.length > 0) {
      const { error: insertError } = await supabase
        .from('ai_pricing_validation_outcomes')
        .insert(evaluationResults);

      if (insertError) {
        throw insertError;
      }
    }

    console.log(`[AI Pricing Outcome Evaluation] Successfully evaluated ${evaluationResults.length} signals`);

    // 5. Generate summary
    const summary = {
      evaluated: evaluationResults.length,
      truePositive: evaluationResults.filter(r => r.classification === 'TRUE_POSITIVE').length,
      falsePositive: evaluationResults.filter(r => r.classification === 'FALSE_POSITIVE').length,
      trueNegative: evaluationResults.filter(r => r.classification === 'TRUE_NEGATIVE').length,
      falseNegative: evaluationResults.filter(r => r.classification === 'FALSE_NEGATIVE').length,
    };

    return new Response(
      JSON.stringify({ 
        message: "Outcome evaluation completed", 
        ...summary,
        details: evaluationResults.slice(0, 10) // Return first 10 for debugging
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("[AI Pricing Outcome Evaluation] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
