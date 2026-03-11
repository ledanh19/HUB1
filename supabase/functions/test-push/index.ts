/**
 * TEST-PUSH EDGE FUNCTION
 *
 * Test endpoint to trigger a push notification manually.
 * Returns detailed diagnostics for debugging iOS PWA push.
 *
 * Test pushes use event_type='PUSH_TEST' which:
 * - Is NOT inserted into notification feed
 * - Uses minimal payload (title, body, data.type, data.ts)
 * - Returns failures[] array with per-subscription details
 *
 * Security: Requires authenticated user (JWT)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function generateRequestId(): string {
  return `test_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = generateRequestId();

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log(`[test-push][${requestId}] Missing authorization header`);
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header", requestId }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create client with user's JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      console.log(`[test-push][${requestId}] Auth error:`, authError?.message);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized", details: authError?.message, requestId }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[test-push][${requestId}] Test push for user: ${user.id}`);

    // Minimal test payload as per requirements
    const idempotencyKey = `test:${user.id}:${Date.now()}`;

    const pushRequestBody = {
      event_type: "PUSH_TEST",
      idempotency_key: idempotencyKey,
      recipient_user_ids: [user.id],
      payload: {
        title: "Roomrise Test",
        body: "Hello from push test",
        data: {
          type: "TEST",
          ts: Date.now(),
        },
      },
      source_table: "test_push",
      source_record_id: requestId,
      debug: true,
    };

    console.log(`[test-push][${requestId}] Calling send-push...`);

    let pushResult: any = null;
    let pushError: Error | null = null;

    try {
      const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify(pushRequestBody),
      });

      if (!pushResponse.ok) {
        const errorText = await pushResponse.text();
        pushError = new Error(`HTTP ${pushResponse.status}: ${errorText}`);
      } else {
        pushResult = await pushResponse.json();
      }
    } catch (fetchErr) {
      pushError = fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr));
    }

    // Log result
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    try {
      await serviceClient.from("debug_push_logs").insert({
        request_id: requestId,
        user_id: user.id,
        event_type: "PUSH_TEST",
        endpoint_host: pushResult?.failures?.[0]?.endpointShort || null,
        status_code: pushResult?.failures?.[0]?.statusCode || null,
        response_body: pushResult?.failures?.[0]?.bodySnippet || null,
        vapid_fingerprint: pushResult?.vapidFingerprint || null,
        ttl: "60",
        encoding: "json",
        success: pushResult?.sent > 0,
        error_message: pushError?.message || pushResult?.failures?.[0]?.reason || null,
      });
    } catch (logErr) {
      console.warn(`[test-push][${requestId}] Failed to log to debug_push_logs:`, logErr);
    }

    if (pushError) {
      console.error(`[test-push][${requestId}] send-push error:`, pushError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to send push",
          details: pushError.message,
          requestId,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[test-push][${requestId}] Push result:`, JSON.stringify(pushResult));

    // Build standardized response
    const response: Record<string, unknown> = {
      success: true,
      requestId,
      userId: user.id,
      summary: {
        total: pushResult?.total || 0,
        sent: pushResult?.sent || 0,
        failed: pushResult?.failed || 0,
        expired: pushResult?.expired || 0,
        duplicates: pushResult?.duplicates || 0,
      },
      failures: pushResult?.failures || [],
    };

    // Include resubscribe flags
    if (pushResult?.needResubscribe) {
      response.needResubscribe = true;
      response.reason = "SUBSCRIPTION_GONE";
    }

    // Include VAPID debug info
    if (pushResult?.vapidFingerprint) {
      response.vapidFingerprint = pushResult.vapidFingerprint;
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error(`[test-push][${requestId}] Error:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
        requestId,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
