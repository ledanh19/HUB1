import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { property_id, property_name } = await req.json();

    if (!property_id) {
      return new Response(
        JSON.stringify({ error: "property_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("CHANNEX_USER_API_KEY");
    if (!apiKey) {
      console.error("CHANNEX_USER_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Channex API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Requesting one-time token for property: ${property_id}`);

    // Call Channex API to get one-time token
    const response = await fetch("https://app.channex.io/api/v1/auth/one_time_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "user-api-key": apiKey,
      },
      body: JSON.stringify({
        one_time_token: {
          property_id: property_id,
          username: property_name || "User",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Channex API error: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: `Channex API error: ${response.status}`, details: errorText }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("One-time token received successfully");

    // Extract the token from the response
    // Channex returns: { data: { token: "..." }, meta: { message: "..." } }
    const token = data?.data?.token || data?.data?.attributes?.token || data?.token;

    if (!token) {
      console.error("Token not found in response:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "Token not found in response", raw: data }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ token, property_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in channex-one-time-token:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
