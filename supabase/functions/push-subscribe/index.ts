/**
 * PUSH-SUBSCRIBE EDGE FUNCTION
 *
 * Handles Web Push subscription management:
 * - Subscribe: Save push subscription endpoint to database
 * - Unsubscribe: Remove subscription from database
 * - Status: Check subscription status
 *
 * Security: Requires authenticated user (JWT)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================
// TYPES
// ============================================

interface SubscribeRequest {
  action: "subscribe";
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

interface UnsubscribeRequest {
  action: "unsubscribe";
  endpoint: string;
}

interface StatusRequest {
  action: "status";
}

type RequestBody = SubscribeRequest | UnsubscribeRequest | StatusRequest;

// ============================================
// CORS HEADERS
// ============================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create Supabase client with user's JWT
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", details: authError?.message }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const { action } = body;

    console.log(`[push-subscribe] Action: ${action} for user: ${user.id}`);

    // Route to handler based on action
    switch (action) {
      case "subscribe":
        return handleSubscribe(supabase, user.id, body as SubscribeRequest);

      case "unsubscribe":
        return handleUnsubscribe(supabase, user.id, body as UnsubscribeRequest);

      case "status":
        return handleStatus(supabase, user.id);

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
    }
  } catch (error) {
    console.error("[push-subscribe] Error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// ============================================
// HANDLERS
// ============================================

async function handleSubscribe(
  supabase: any,
  userId: string,
  body: SubscribeRequest
): Promise<Response> {
  const { endpoint, p256dh, auth, userAgent } = body;

  // Validate required fields
  if (!endpoint || !p256dh || !auth) {
    return new Response(
      JSON.stringify({
        error: "Missing required fields: endpoint, p256dh, auth",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Validate endpoint URL
  try {
    new URL(endpoint);
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid endpoint URL" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Use service role for database operations
  const supabaseServiceUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const serviceClient = createClient(supabaseServiceUrl, supabaseServiceKey);

  // Upsert subscription using the helper function
  const { data, error } = await serviceClient.rpc("upsert_push_subscription", {
    p_user_id: userId,
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: userAgent || null,
  });

  if (error) {
    console.error("[push-subscribe] Database error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to save subscription", details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  console.log(`[push-subscribe] Subscription saved: ${data}`);

  return new Response(
    JSON.stringify({
      success: true,
      subscriptionId: data,
      message: "Push subscription activated",
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

async function handleUnsubscribe(
  supabase: any,
  userId: string,
  body: UnsubscribeRequest
): Promise<Response> {
  const { endpoint } = body;

  if (!endpoint) {
    return new Response(
      JSON.stringify({ error: "Missing required field: endpoint" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Use service role for database operations
  const supabaseServiceUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const serviceClient = createClient(supabaseServiceUrl, supabaseServiceKey);

  // Deactivate subscription (soft delete)
  const { error } = await serviceClient
    .from("push_subscriptions")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("endpoint", endpoint)
    .eq("user_id", userId);

  if (error) {
    console.error("[push-subscribe] Delete error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to remove subscription", details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  console.log(`[push-subscribe] Subscription deactivated for user: ${userId}`);

  return new Response(
    JSON.stringify({
      success: true,
      message: "Push subscription deactivated",
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

async function handleStatus(
  supabase: any,
  userId: string
): Promise<Response> {
  // Use service role for database operations
  const supabaseServiceUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const serviceClient = createClient(supabaseServiceUrl, supabaseServiceKey);

  // Get active subscriptions count
  const { data, error, count } = await serviceClient
    .from("push_subscriptions")
    .select("id, endpoint, created_at, last_used_at", { count: "exact" })
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) {
    console.error("[push-subscribe] Status query error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to get status", details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      subscriptions: data || [],
      count: count || 0,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}
