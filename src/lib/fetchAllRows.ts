/**
 * fetchAllRows — Generic Supabase pagination helper.
 *
 * Loops through pages of `pageSize` (default 1000) until fewer than
 * `pageSize` rows are returned. Returns ALL rows concatenated.
 *
 * Usage:
 *   const rows = await fetchAllRows((from, to) =>
 *     supabase.from("my_table").select("*").eq("org_id", orgId).range(from, to)
 *   );
 *
 * Guards:
 *   - Max pages (default 20) to prevent runaway loops (DEV warning)
 *   - Throws on Supabase errors
 *
 * @param buildQuery - Factory that returns a Supabase query with .range(from, to)
 * @param opts - Optional { pageSize, maxPages }
 */

interface FetchAllRowsOptions {
    pageSize?: number;
    maxPages?: number;
}

export async function fetchAllRows<T = any>(
    buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
    opts?: FetchAllRowsOptions,
): Promise<T[]> {
    const pageSize = opts?.pageSize ?? 1000;
    const maxPages = opts?.maxPages ?? 20;
    const all: T[] = [];

    for (let page = 0; page < maxPages; page++) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await buildQuery(from, to);
        if (error) throw error;
        if (!data || data.length === 0) break;

        all.push(...data);

        if (data.length < pageSize) break; // Last page
    }

    if (import.meta.env.DEV && all.length >= maxPages * pageSize) {
        console.warn(
            `[fetchAllRows] Hit maxPages (${maxPages}) — ${all.length} rows fetched. ` +
            `Data may be truncated. Increase maxPages if needed.`
        );
    }

    return all;
}
