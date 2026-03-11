import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChannexWebhook {
  id: string;
  attributes: {
    callback_url: string;
    event_mask: string;
    is_active: boolean;
    headers?: Record<string, string>;
  };
  relationships?: {
    property?: { data?: { id: string } };
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(`[REGISTER-WEBHOOKS][${requestId}] Starting webhook registration`);

  try {
    const CHANNEX_USER_API_KEY = Deno.env.get("CHANNEX_USER_API_KEY");
    const CHANNEX_API_KEY = Deno.env.get("CHANNEX_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const WEBHOOK_SECRET = Deno.env.get("CHANNEX_WEBHOOK_SECRET");
    
    // Use CHANNEX_API_KEY as primary (it owns existing webhooks), fallback to USER key
    const API_KEY = CHANNEX_API_KEY || CHANNEX_USER_API_KEY;

    if (!API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: "Missing configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!WEBHOOK_SECRET) {
      return new Response(
        JSON.stringify({ error: "CHANNEX_WEBHOOK_SECRET not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[REGISTER-WEBHOOKS][${requestId}] Using API key: ${API_KEY === CHANNEX_API_KEY ? 'CHANNEX_API_KEY' : 'CHANNEX_USER_API_KEY'}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request body for options
    let forceReregister = false;
    try {
      const body = await req.json();
      forceReregister = body?.force === true;
    } catch { /* no body */ }

    // Webhook URLs WITH secret as query parameter
    const messageWebhookUrl = `${SUPABASE_URL}/functions/v1/channex-messages-webhook?webhook_secret=${WEBHOOK_SECRET}`;
    const bookingWebhookUrl = `${SUPABASE_URL}/functions/v1/channex-webhook?webhook_secret=${WEBHOOK_SECRET}`;
    const ariWebhookUrl = `${SUPABASE_URL}/functions/v1/channex-ari-webhook?webhook_secret=${WEBHOOK_SECRET}`;
    const webhookHeaders = { "x-webhook-secret": WEBHOOK_SECRET };

    // Step 1: Get ALL properties
    const { data: mappings, error: mappingsError } = await supabase
      .from("channex_mappings")
      .select("channex_property_id")
      .not("channex_property_id", "is", null);

    if (mappingsError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch properties", details: mappingsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const propertyIds = [...new Set(mappings?.map(m => m.channex_property_id) || [])];
    console.log(`[REGISTER-WEBHOOKS][${requestId}] Found ${propertyIds.length} unique properties`);

    // Step 2: Get ALL existing webhooks (with pagination, using BOTH keys)
    async function fetchAllWebhooks(apiKey: string): Promise<ChannexWebhook[]> {
      const all: ChannexWebhook[] = [];
      let page = 1;
      while (true) {
        const resp = await fetch(
          `https://app.channex.io/api/v1/webhooks?pagination[page]=${page}&pagination[limit]=100`, {
          headers: { "user-api-key": apiKey, "Content-Type": "application/json" },
        });
        if (!resp.ok) break;
        const data = await resp.json();
        const items: ChannexWebhook[] = data.data || [];
        all.push(...items);
        if (items.length < 100) break;
        page++;
      }
      return all;
    }

    // Fetch with primary key
    let existingWebhooks = await fetchAllWebhooks(API_KEY);
    console.log(`[REGISTER-WEBHOOKS][${requestId}] Found ${existingWebhooks.length} webhooks with primary key`);
    
    // Also fetch with secondary key if different
    if (CHANNEX_USER_API_KEY && CHANNEX_API_KEY && CHANNEX_USER_API_KEY !== CHANNEX_API_KEY) {
      const secondaryWebhooks = await fetchAllWebhooks(CHANNEX_USER_API_KEY);
      console.log(`[REGISTER-WEBHOOKS][${requestId}] Found ${secondaryWebhooks.length} webhooks with secondary key`);
      // Merge, avoiding duplicates
      const existingIds = new Set(existingWebhooks.map(w => w.id));
      for (const wh of secondaryWebhooks) {
        if (!existingIds.has(wh.id)) {
          existingWebhooks.push(wh);
        }
      }
      console.log(`[REGISTER-WEBHOOKS][${requestId}] Total unique webhooks: ${existingWebhooks.length}`);
    }

    // Step 3: If force, delete ALL existing webhooks for our Supabase URL
    let deletedCount = 0;
    if (forceReregister) {
      console.log(`[REGISTER-WEBHOOKS][${requestId}] Force mode: deleting ALL our webhooks`);
      
      for (const webhook of existingWebhooks) {
        const url = webhook.attributes.callback_url || "";
        if (url.includes("htfpjqkhtjbalaodymwb") || url.includes(SUPABASE_URL!)) {
          // Try deleting with both keys
          for (const key of [API_KEY, CHANNEX_USER_API_KEY].filter(Boolean) as string[]) {
            try {
              const delRes = await fetch(`https://app.channex.io/api/v1/webhooks/${webhook.id}`, {
                method: "DELETE",
                headers: { "user-api-key": key },
              });
              if (delRes.ok || delRes.status === 204) {
                deletedCount++;
                break; // Success, no need to try other key
              }
            } catch { /* continue */ }
          }
          await new Promise(r => setTimeout(r, 30));
        }
      }
      console.log(`[REGISTER-WEBHOOKS][${requestId}] Deleted ${deletedCount} webhooks, waiting 2s...`);
      await new Promise(r => setTimeout(r, 2000));
    }

    // Map webhooks by property (only when NOT force)
    const webhooksByProperty = new Map<string, ChannexWebhook[]>();
    if (!forceReregister) {
      for (const webhook of existingWebhooks) {
        const propertyId = webhook.relationships?.property?.data?.id;
        if (propertyId) {
          const list = webhooksByProperty.get(propertyId) || [];
          list.push(webhook);
          webhooksByProperty.set(propertyId, list);
        }
      }
    }

    // Step 4: Register webhooks
    const results = {
      messages: { created: [] as string[], updated: [] as string[], skipped: [] as string[], errors: [] as string[], reactivated: [] as string[] },
      bookings: { created: [] as string[], updated: [] as string[], skipped: [] as string[], errors: [] as string[], reactivated: [] as string[] },
      ari: { created: [] as string[], updated: [] as string[], skipped: [] as string[], errors: [] as string[], reactivated: [] as string[] },
    };

    const ourBaseUrls: Record<string, string> = {
      message: `${SUPABASE_URL}/functions/v1/channex-messages-webhook`,
      booking: `${SUPABASE_URL}/functions/v1/channex-webhook`,
      ari: `${SUPABASE_URL}/functions/v1/channex-ari-webhook`,
    };

    async function registerWebhook(
      propertyId: string, 
      webhookUrl: string, 
      eventMask: string, 
      resultBucket: { created: string[], updated: string[], skipped: string[], errors: string[], reactivated: string[] }
    ) {
      const existingPropertyWebhooks = webhooksByProperty.get(propertyId) || [];
      const baseUrl = ourBaseUrls[eventMask] || "";
      
      const existing = existingPropertyWebhooks.find(wh => 
        wh.attributes.callback_url.startsWith(baseUrl) && 
        wh.attributes.event_mask === eventMask
      );

      if (existing) {
        if (existing.attributes.is_active && !forceReregister) {
          resultBucket.skipped.push(propertyId);
          return;
        }
        
        // Update to re-enable
        try {
          const updateResponse = await fetch(`https://app.channex.io/api/v1/webhooks/${existing.id}`, {
            method: "PUT",
            headers: { "user-api-key": API_KEY!, "Content-Type": "application/json" },
            body: JSON.stringify({
              webhook: { callback_url: webhookUrl, is_active: true, send_data: true, headers: webhookHeaders },
            }),
          });
          if (updateResponse.ok) {
            resultBucket.reactivated.push(propertyId);
          } else {
            resultBucket.errors.push(`${propertyId} (update): ${await updateResponse.text()}`);
          }
        } catch (e) {
          resultBucket.errors.push(`${propertyId} (update): ${e}`);
        }
        return;
      }

      // Create new webhook
      const createResponse = await fetch("https://app.channex.io/api/v1/webhooks", {
        method: "POST",
        headers: { "user-api-key": API_KEY!, "Content-Type": "application/json" },
        body: JSON.stringify({
          webhook: {
            property_id: propertyId,
            callback_url: webhookUrl,
            event_mask: eventMask,
            is_active: true,
            send_data: true,
            headers: webhookHeaders,
          },
        }),
      });

      if (createResponse.ok) {
        resultBucket.created.push(propertyId);
      } else {
        const errorText = await createResponse.text();
        
        // If "already exists", find via per-property filter and update
        if (errorText.includes("only one webhook")) {
          console.log(`[REGISTER-WEBHOOKS] Already exists for ${propertyId}/${eventMask}, finding to update...`);
          try {
            // Try finding with both keys
            let foundTarget: ChannexWebhook | null = null;
            for (const key of [API_KEY, CHANNEX_USER_API_KEY].filter(Boolean) as string[]) {
              const findResp = await fetch(
                `https://app.channex.io/api/v1/webhooks?filter[property_id]=${propertyId}&pagination[limit]=50`, {
                headers: { "user-api-key": key, "Content-Type": "application/json" },
              });
              if (findResp.ok) {
                const findData = await findResp.json();
                const found: ChannexWebhook[] = findData.data || [];
                const target = found.find(wh => wh.attributes.callback_url.startsWith(baseUrl));
                if (target) { foundTarget = target; break; }
              }
            }
            
            if (foundTarget) {
              // Try updating with both keys
              let updated = false;
              for (const key of [API_KEY, CHANNEX_USER_API_KEY].filter(Boolean) as string[]) {
                const updateResp = await fetch(`https://app.channex.io/api/v1/webhooks/${foundTarget.id}`, {
                  method: "PUT",
                  headers: { "user-api-key": key, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    webhook: { callback_url: webhookUrl, is_active: true, send_data: true, headers: webhookHeaders },
                  }),
                });
                if (updateResp.ok) {
                  resultBucket.reactivated.push(propertyId);
                  updated = true;
                  break;
                }
              }
              if (!updated) {
                resultBucket.errors.push(`${propertyId}: exists, found, but update failed with both keys`);
              }
            } else {
              // Can't find - the webhook exists but belongs to a different account
              // Just log as "exists_external" and accept it (it's already active)
              resultBucket.skipped.push(propertyId);
              console.log(`[REGISTER-WEBHOOKS] ${propertyId}/${eventMask}: webhook exists externally, assuming active`);
            }
          } catch (findErr) {
            resultBucket.errors.push(`${propertyId} (find): ${findErr}`);
          }
        } else {
          resultBucket.errors.push(`${propertyId}: ${errorText}`);
        }
      }
    }

    for (const propertyId of propertyIds) {
      try {
        await registerWebhook(propertyId, messageWebhookUrl, "message", results.messages);
        await registerWebhook(propertyId, bookingWebhookUrl, "booking", results.bookings);
        await registerWebhook(propertyId, ariWebhookUrl, "ari", results.ari);
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        results.messages.errors.push(`${propertyId}: ${errorMessage}`);
      }
    }

    console.log(`[REGISTER-WEBHOOKS][${requestId}] Completed:`, results);

    return new Response(
      JSON.stringify({
        success: true,
        force_reregister: forceReregister,
        total_properties: propertyIds.length,
        deleted: deletedCount,
        messages: { created: results.messages.created.length, reactivated: results.messages.reactivated.length, skipped: results.messages.skipped.length, errors: results.messages.errors.length },
        bookings: { created: results.bookings.created.length, reactivated: results.bookings.reactivated.length, skipped: results.bookings.skipped.length, errors: results.bookings.errors.length },
        ari: { created: results.ari.created.length, reactivated: results.ari.reactivated.length, skipped: results.ari.skipped.length, errors: results.ari.errors.length },
        details: results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[REGISTER-WEBHOOKS][${requestId}] Unexpected error:`, error);
    return new Response(
      JSON.stringify({ error: errorMessage, request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});