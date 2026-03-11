import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Convert URL-safe base64 to Uint8Array for key validation
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  let padding = "";
  const remainder = base64String.length % 4;
  if (remainder === 2) padding = "==";
  else if (remainder === 3) padding = "=";
  
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Get fingerprint (last 8 chars) of VAPID public key
 */
function getVapidFingerprint(publicKey: string): string {
  if (!publicKey || publicKey.length < 8) return 'INVALID';
  return publicKey.substring(publicKey.length - 8);
}

/**
 * Get short version identifier from VAPID key
 */
function getVapidVersion(publicKey: string): string {
  if (!publicKey || publicKey.length < 16) return 'v0';
  return `v1_${publicKey.substring(0, 8)}${publicKey.substring(publicKey.length - 8)}`;
}

/**
 * Validate VAPID keys format
 * Public key: 65 bytes (0x04 prefix + 32 bytes x + 32 bytes y)
 * Private key: 32 bytes (raw scalar d)
 */
function validateVapidKeys(publicKey: string, privateKey: string): {
  valid: boolean;
  error?: string;
  publicKeyBytes?: number;
  privateKeyBytes?: number;
} {
  try {
    const publicKeyBytes = urlBase64ToUint8Array(publicKey);
    const privateKeyBytes = urlBase64ToUint8Array(privateKey);
    
    console.log(`[VAPID] Key sizes - Public: ${publicKeyBytes.length}, Private: ${privateKeyBytes.length}`);
    
    // Check private key (should be 32 bytes)
    if (privateKeyBytes.length !== 32) {
      return {
        valid: false,
        error: `VAPID_PRIVATE_KEY invalid: ${privateKeyBytes.length} bytes, expected 32 bytes. Private key should be ~43 characters. Generate new keys with: npx web-push generate-vapid-keys`,
        publicKeyBytes: publicKeyBytes.length,
        privateKeyBytes: privateKeyBytes.length,
      };
    }
    
    // Check public key (should be 65 bytes starting with 0x04)
    if (publicKeyBytes.length !== 65) {
      return {
        valid: false,
        error: `VAPID_PUBLIC_KEY invalid: ${publicKeyBytes.length} bytes, expected 65 bytes. Public key should be ~87 characters. Generate new keys with: npx web-push generate-vapid-keys`,
        publicKeyBytes: publicKeyBytes.length,
        privateKeyBytes: privateKeyBytes.length,
      };
    }
    
    // Check uncompressed EC point prefix
    if (publicKeyBytes[0] !== 0x04) {
      return {
        valid: false,
        error: `VAPID_PUBLIC_KEY invalid format: expected 0x04 prefix (uncompressed EC point), got 0x${publicKeyBytes[0].toString(16)}`,
        publicKeyBytes: publicKeyBytes.length,
        privateKeyBytes: privateKeyBytes.length,
      };
    }
    
    console.log(`[VAPID] Keys validated successfully - public: ${publicKeyBytes.length} bytes, private: ${privateKeyBytes.length} bytes`);
    
    return {
      valid: true,
      publicKeyBytes: publicKeyBytes.length,
      privateKeyBytes: privateKeyBytes.length,
    };
  } catch (error) {
    return {
      valid: false,
      error: `Key validation error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@roomrise.vn';
    
    console.log(`[VAPID] Reading keys - public exists: ${!!vapidPublicKey}, private exists: ${!!vapidPrivateKey}`);
    console.log(`[VAPID] Key lengths - public: ${vapidPublicKey?.length || 0} chars, private: ${vapidPrivateKey?.length || 0} chars`);
    
    if (!vapidPublicKey) {
      console.error('[VAPID] VAPID_PUBLIC_KEY not configured in secrets');
      return new Response(
        JSON.stringify({ 
          error: 'VAPID public key not configured',
          configured: false,
          hint: 'Set VAPID_PUBLIC_KEY in Supabase secrets',
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    if (!vapidPrivateKey) {
      console.error('[VAPID] VAPID_PRIVATE_KEY not configured in secrets');
      return new Response(
        JSON.stringify({ 
          error: 'VAPID private key not configured',
          configured: false,
          hint: 'Set VAPID_PRIVATE_KEY in Supabase secrets',
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    // Validate key formats
    const validation = validateVapidKeys(vapidPublicKey, vapidPrivateKey);
    
    if (!validation.valid) {
      console.error(`[VAPID] Key validation failed: ${validation.error}`);
      return new Response(
        JSON.stringify({ 
          error: 'VAPID keys invalid format',
          details: validation.error,
          configured: false,
          publicKeyBytes: validation.publicKeyBytes,
          privateKeyBytes: validation.privateKeyBytes,
          hint: 'Generate new keys with: npx web-push generate-vapid-keys',
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const fingerprint = getVapidFingerprint(vapidPublicKey);
    const version = getVapidVersion(vapidPublicKey);

    console.log(`[VAPID] ✓ Keys valid - fingerprint: ...${fingerprint}, version: ${version}`);
    
    return new Response(
      JSON.stringify({ 
        publicKey: vapidPublicKey,
        fingerprint: fingerprint,
        version: version,
        subject: vapidSubject,
        configured: true,
        valid: true,
        keySizes: {
          public: validation.publicKeyBytes,
          private: validation.privateKeyBytes,
        },
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('[VAPID] Error getting VAPID key:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
        configured: false,
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
