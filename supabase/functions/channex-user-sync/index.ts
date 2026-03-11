import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChannexProperty {
  id: string;
  type: string;
  attributes: {
    title?: string;
    name?: string;
    status?: string;
    currency?: string;
    country?: string;
    city?: string;
    address?: string;
    timezone?: string;
    is_active?: boolean;
    email?: string;
    phone?: string;
    settings?: Record<string, unknown>;
  };
}

interface SyncResult {
  user_synced: boolean;
  properties_synced: number;
  errors: string[];
}

// Generate a deterministic user ID from API key using Web Crypto
async function generateUserIdFromApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const CHANNEX_USER_API_KEY = Deno.env.get("CHANNEX_USER_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!CHANNEX_USER_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing required environment variables");
      return new Response(
        JSON.stringify({ error: "Missing configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request body for options
    let options: { include_properties?: boolean; sync_all?: boolean } = { 
      include_properties: true,
      sync_all: false 
    };
    try {
      const body = await req.json();
      options = { ...options, ...body };
    } catch {
      // Use defaults
    }

    console.log("Starting Channex user sync with options:", options);

    const result: SyncResult = {
      user_synced: false,
      properties_synced: 0,
      errors: [],
    };

    // Generate user ID from API key (since Channex doesn't have /users/me endpoint)
    const channexUserId = await generateUserIdFromApiKey(CHANNEX_USER_API_KEY);
    const apiKeyLast4 = CHANNEX_USER_API_KEY.slice(-4);

    console.log("Generated Channex user ID:", channexUserId);

    // ========================================
    // STEP 1: Fetch properties to get user context
    // ========================================
    console.log("Fetching Channex properties...");

    let page = 1;
    const limit = 100;
    let hasMore = true;
    const allProperties: ChannexProperty[] = [];
    let firstPropertyTimezone: string | null = null;
    let firstPropertyEmail: string | null = null;

    while (hasMore) {
      const propertiesUrl = new URL("https://app.channex.io/api/v1/properties");
      propertiesUrl.searchParams.append("pagination[page]", String(page));
      propertiesUrl.searchParams.append("pagination[limit]", String(limit));

      console.log(`Fetching properties page ${page}...`);

      const propertiesResponse = await fetch(propertiesUrl.toString(), {
        method: "GET",
        headers: {
          "user-api-key": CHANNEX_USER_API_KEY,
          "Content-Type": "application/json",
        },
      });

      if (!propertiesResponse.ok) {
        const errorText = await propertiesResponse.text();
        console.error("Channex API error (properties):", propertiesResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: "Failed to fetch properties from Channex", details: errorText }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const propertiesData = await propertiesResponse.json();
      const properties: ChannexProperty[] = propertiesData.data || [];
      
      // Extract timezone and email from first property
      if (properties.length > 0 && !firstPropertyTimezone) {
        firstPropertyTimezone = properties[0].attributes.timezone || null;
        firstPropertyEmail = properties[0].attributes.email || null;
      }

      allProperties.push(...properties);

      // Check if there are more pages
      const meta = propertiesData.meta;
      if (meta && meta.total && properties.length > 0) {
        const totalPages = Math.ceil(meta.total / limit);
        hasMore = page < totalPages;
        page++;
      } else {
        hasMore = false;
      }

      // Safety limit
      if (page > 50) {
        console.warn("Reached maximum page limit for properties");
        break;
      }
    }

    console.log(`Fetched ${allProperties.length} properties from Channex`);

    // ========================================
    // STEP 2: Create/Update user record
    // ========================================
    const userRecord = {
      channex_user_id: channexUserId,
      email: firstPropertyEmail,
      name: `Channex Account (****${apiKeyLast4})`,
      phone: null,
      avatar_url: null,
      company_name: allProperties.length > 0 ? allProperties[0].attributes.title : null,
      timezone: firstPropertyTimezone,
      locale: null,
      is_active: true,
      subscription_plan: null,
      subscription_status: "active",
      api_key_last_4: apiKeyLast4,
      properties_count: allProperties.length,
      settings: {},
      last_synced_at: new Date().toISOString(),
      raw_data: { api_key_last_4: apiKeyLast4, properties_count: allProperties.length },
    };

    const { error: userError } = await supabase
      .from("channex_users")
      .upsert(userRecord, {
        onConflict: "channex_user_id",
      });

    if (userError) {
      console.error("Error upserting user:", userError);
      result.errors.push(`User upsert error: ${userError.message}`);
    } else {
      result.user_synced = true;
      console.log("User synced successfully:", channexUserId);
    }

    // ========================================
    // STEP 3: Upsert user-property relationships
    // ========================================
    if (options.include_properties) {
      for (const property of allProperties) {
        const propertyRecord = {
          channex_user_id: channexUserId,
          channex_property_id: property.id,
          property_name: property.attributes.title || property.attributes.name || null,
          property_status: property.attributes.status || "active",
          is_primary: false,
        };

        const { error: propError } = await supabase
          .from("channex_user_properties")
          .upsert(propertyRecord, {
            onConflict: "channex_user_id,channex_property_id",
          });

        if (propError) {
          console.error("Error upserting property relationship:", propError);
          result.errors.push(`Property ${property.id}: ${propError.message}`);
        } else {
          result.properties_synced++;
        }
      }

      console.log(`Synced ${result.properties_synced} property relationships`);
    }

    // ========================================
    // STEP 4: Return result
    // ========================================
    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: channexUserId,
          email: firstPropertyEmail,
          name: userRecord.name,
          company_name: userRecord.company_name,
          timezone: firstPropertyTimezone,
          is_active: true,
          properties_count: allProperties.length,
        },
        ...result,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Unexpected error in user sync:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
