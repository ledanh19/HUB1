/**
 * Helper to safely execute Supabase queries with large .in() arrays.
 *
 * PostgreSQL has a practical limit of ~32,767 bind parameters.
 * This utility splits the ID array into chunks and merges results.
 */

const CHUNK_SIZE = 500; // Safe well under PostgreSQL limit

/**
 * Execute a Supabase SELECT query with chunked .in() to avoid PostgreSQL parameter limits.
 * Returns merged results from all chunks.
 *
 * @example
 * const segments = await chunkedIn(
 *   (chunk) => supabase
 *     .from("host_supply_segments")
 *     .select("*")
 *     .in("unified_booking_id", chunk),
 *   bookingIds
 * );
 */
export async function chunkedIn<T>(
  buildQuery: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: any }>,
  allIds: string[]
): Promise<T[]> {
  if (allIds.length === 0) return [];

  if (allIds.length <= CHUNK_SIZE) {
    const { data, error } = await buildQuery(allIds);
    if (error) throw error;
    return data || [];
  }

  const results: T[] = [];
  for (let i = 0; i < allIds.length; i += CHUNK_SIZE) {
    const chunk = allIds.slice(i, i + CHUNK_SIZE);
    const { data, error } = await buildQuery(chunk);
    if (error) throw error;
    if (data) results.push(...data);
  }
  return results;
}

/**
 * Execute a Supabase UPDATE with chunked .in() to avoid PostgreSQL parameter limits.
 * Returns total count of affected rows.
 */
export async function chunkedUpdate(
  buildQuery: (chunk: string[]) => PromiseLike<{ error: any; count?: number | null }>,
  allIds: string[]
): Promise<number> {
  if (allIds.length === 0) return 0;

  let totalCount = 0;
  for (let i = 0; i < allIds.length; i += CHUNK_SIZE) {
    const chunk = allIds.slice(i, i + CHUNK_SIZE);
    const { error, count } = await buildQuery(chunk);
    if (error) throw error;
    totalCount += count || 0;
  }
  return totalCount;
}
