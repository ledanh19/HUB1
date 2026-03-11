import { useState, useMemo, useCallback } from "react";

interface UseTablePaginationOptions {
  /** Default page size */
  defaultPageSize?: number;
  /** Reset to page 1 when this value changes (e.g. filter dependency) */
  resetDeps?: any[];
}

/**
 * useTablePagination — manages client-side pagination state.
 *
 * Usage:
 * ```ts
 * const { page, pageSize, setPage, setPageSize, paginate, totalPages, displayedCount } =
 *   useTablePagination(filteredData, { defaultPageSize: 10 });
 *
 * // In render:
 * {paginate(filteredData).map(row => <TableRow ... />)}
 * <DataTablePagination currentPage={page} totalPages={totalPages} ... />
 * ```
 */
export function useTablePagination<T>(
  data: T[],
  options: UseTablePaginationOptions = {}
) {
  const { defaultPageSize = 10, resetDeps = [] } = options;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  // Reset page when dependencies change (filters, search, etc.)
  const depsKey = JSON.stringify(resetDeps);
  const [prevDepsKey, setPrevDepsKey] = useState(depsKey);
  if (depsKey !== prevDepsKey) {
    setPrevDepsKey(depsKey);
    if (page !== 1) setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));

  // Clamp page if it exceeds total
  const safePage = Math.min(page, totalPages);
  if (safePage !== page) {
    setPage(safePage);
  }

  const paginate = useCallback(
    (items: T[]) => {
      const start = (safePage - 1) * pageSize;
      return items.slice(start, start + pageSize);
    },
    [safePage, pageSize]
  );

  const paginatedData = useMemo(
    () => paginate(data),
    [data, paginate]
  );

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  return {
    page: safePage,
    pageSize,
    setPage,
    setPageSize: handlePageSizeChange,
    totalPages,
    paginatedData,
    paginate,
    displayedCount: paginatedData.length,
    totalCount: data.length,
  };
}
