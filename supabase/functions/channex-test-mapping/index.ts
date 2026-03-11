import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestMappingRequest {
  type: 'property' | 'room_type' | 'rate_plan';
  channexId: string;
  propertyId?: string;
}

interface TestResult {
  valid: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const CHANNEX_API_KEY = Deno.env.get('CHANNEX_API_KEY');
    if (!CHANNEX_API_KEY) {
      throw new Error('CHANNEX_API_KEY not configured');
    }

    const body: TestMappingRequest = await req.json();
    const { type, channexId, propertyId } = body;

    console.log(`[Test Mapping] Testing ${type}: ${channexId}`);

    let result: TestResult;

    switch (type) {
      case 'property': {
        // Test if property exists in Channex
        const response = await fetch(`https://app.channex.io/api/v1/properties/${channexId}`, {
          headers: {
            'Authorization': `Bearer ${CHANNEX_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          result = {
            valid: true,
            data: {
              title: data.data?.attributes?.title,
              currency: data.data?.attributes?.currency,
              timezone: data.data?.attributes?.timezone,
            },
          };
          console.log(`[Test Mapping] Property ${channexId} is valid:`, data.data?.attributes?.title);
        } else if (response.status === 404) {
          result = { valid: false, error: 'Property not found in Channex' };
          console.log(`[Test Mapping] Property ${channexId} not found`);
        } else {
          const errorText = await response.text();
          result = { valid: false, error: `Channex API error: ${response.status}` };
          console.error(`[Test Mapping] Error:`, errorText);
        }
        break;
      }

      case 'room_type': {
        // Test if room type exists in Channex
        const response = await fetch(`https://app.channex.io/api/v1/room_types/${channexId}`, {
          headers: {
            'Authorization': `Bearer ${CHANNEX_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          result = {
            valid: true,
            data: {
              title: data.data?.attributes?.title,
              occupancy: data.data?.attributes?.default_occupancy,
              count_of_rooms: data.data?.attributes?.count_of_rooms,
            },
          };
          console.log(`[Test Mapping] Room type ${channexId} is valid:`, data.data?.attributes?.title);
        } else if (response.status === 404) {
          result = { valid: false, error: 'Room type not found in Channex' };
          console.log(`[Test Mapping] Room type ${channexId} not found`);
        } else {
          result = { valid: false, error: `Channex API error: ${response.status}` };
        }
        break;
      }

      case 'rate_plan': {
        // Test if rate plan exists in Channex
        const response = await fetch(`https://app.channex.io/api/v1/rate_plans/${channexId}`, {
          headers: {
            'Authorization': `Bearer ${CHANNEX_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          result = {
            valid: true,
            data: {
              title: data.data?.attributes?.title,
              currency: data.data?.attributes?.currency,
              sell_mode: data.data?.attributes?.sell_mode,
            },
          };
          console.log(`[Test Mapping] Rate plan ${channexId} is valid:`, data.data?.attributes?.title);
        } else if (response.status === 404) {
          result = { valid: false, error: 'Rate plan not found in Channex' };
          console.log(`[Test Mapping] Rate plan ${channexId} not found`);
        } else {
          result = { valid: false, error: `Channex API error: ${response.status}` };
        }
        break;
      }

      default:
        result = { valid: false, error: `Unknown mapping type: ${type}` };
    }

    // Update mapping status in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const tableName = type === 'property' ? 'property_mappings' :
                      type === 'room_type' ? 'room_type_mappings' : 'rate_plan_mappings';
    const idColumn = type === 'property' ? 'channex_property_id' :
                     type === 'room_type' ? 'channex_room_type_id' : 'channex_rate_plan_id';

    const { error: updateError } = await supabase
      .from(tableName)
      .update({
        status: result.valid ? 'MAPPED' : 'INVALID',
        validation_error: result.error || null,
        last_validated_at: new Date().toISOString(),
      })
      .eq(idColumn, channexId);

    if (updateError) {
      console.error(`[Test Mapping] Failed to update status:`, updateError);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Test Mapping] Error:', errorMessage);
    return new Response(JSON.stringify({ 
      valid: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
