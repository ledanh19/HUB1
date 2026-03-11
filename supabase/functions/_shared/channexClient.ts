/**
 * Shared Channex API client with rate limiting and retry logic.
 * 
 * PMS SOT §8.7:
 * - 429: respect Retry-After header, retry up to MAX_RETRIES
 * - 5xx: exponential backoff (1s, 2s, 4s)
 * - Timeout: 30s per request
 */

const CHANNEX_BASE_URL = "https://app.channex.io/api/v1";
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;

export interface ChannexRequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  params?: Record<string, string>;
  apiKey?: string;
  maxRetries?: number;
}

export interface ChannexResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
  retries: number;
}

/**
 * Make a Channex API call with automatic retry on 429 / 5xx.
 */
export async function channexFetch<T = unknown>(
  options: ChannexRequestOptions
): Promise<ChannexResponse<T>> {
  const apiKey = options.apiKey || Deno.env.get("CHANNEX_API_KEY");
  if (!apiKey) {
    throw new Error("CHANNEX_API_KEY not configured");
  }

  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const url = new URL(`${CHANNEX_BASE_URL}${options.path}`);

  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    "user-api-key": apiKey,
    "Content-Type": "application/json",
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url.toString(), {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 429 Too Many Requests — respect Retry-After
      if (response.status === 429) {
        const retryAfter = parseInt(
          response.headers.get("Retry-After") || "5",
          10
        );
        const waitMs = Math.min(retryAfter * 1000, 60_000); // Cap at 60s
        console.warn(
          `[channexClient] 429 rate limited, waiting ${waitMs}ms (attempt ${attempt + 1}/${maxRetries + 1})`
        );
        if (attempt < maxRetries) {
          await sleep(waitMs);
          continue;
        }
        // Last attempt — still 429, throw
        throw new Error(
          `Channex API rate limited after ${maxRetries + 1} attempts`
        );
      }

      // 5xx Server Error — exponential backoff
      if (response.status >= 500 && attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.warn(
          `[channexClient] ${response.status} server error, backoff ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries + 1})`
        );
        await sleep(backoffMs);
        continue;
      }

      // Parse response body
      let data: T;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = (await response.text()) as unknown as T;
      }

      return {
        ok: response.ok,
        status: response.status,
        data,
        retries: attempt,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Abort = timeout
      if (lastError.name === "AbortError") {
        lastError = new Error(
          `Channex API request timeout after ${REQUEST_TIMEOUT_MS}ms`
        );
      }

      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.warn(
          `[channexClient] Request error: ${lastError.message}, retrying in ${backoffMs}ms`
        );
        await sleep(backoffMs);
        continue;
      }
    }
  }

  throw lastError || new Error("Channex API: max retries exceeded");
}

/**
 * Channex PUT /restrictions payload format.
 * Per Channex API docs: https://docs.channex.io/api-v.1-documentation/restrictions
 */
export interface ChannexRestrictionValue {
  property_id: string;       // Channex property UUID
  rate_plan_id: string;      // Channex rate plan UUID
  date_from: string;         // YYYY-MM-DD
  date_to: string;           // YYYY-MM-DD
  // Restrictions — all optional, only include changed fields
  rate?: number;
  availability?: number;
  stop_sell?: boolean;
  closed_to_arrival?: boolean;
  closed_to_departure?: boolean;
  min_stay_arrival?: number;
  min_stay_through?: number;
  max_stay?: number;
  max_availability?: number;
  availability_offset?: number;
}

/**
 * Push restrictions to Channex.
 * Uses PUT /restrictions endpoint.
 * Max 500 values per request (Channex limit).
 */
export async function pushRestrictionsToChannex(
  values: ChannexRestrictionValue[],
  apiKey?: string
): Promise<{ ok: boolean; status: number; data: unknown; batches: number }> {
  const BATCH_SIZE = 500;
  let lastResult: ChannexResponse | null = null;
  let batchCount = 0;

  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const batch = values.slice(i, i + BATCH_SIZE);
    batchCount++;

    const result = await channexFetch({
      method: "PUT",
      path: "/restrictions",
      body: { values: batch },
      apiKey,
    });

    lastResult = result;

    if (!result.ok) {
      console.error(
        `[channexClient] Push batch ${batchCount} failed: ${result.status}`,
        result.data
      );
      return { ok: false, status: result.status, data: result.data, batches: batchCount };
    }

    console.log(
      `[channexClient] Push batch ${batchCount} success: ${batch.length} values`
    );
  }

  return {
    ok: true,
    status: lastResult?.status || 200,
    data: lastResult?.data,
    batches: batchCount,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
