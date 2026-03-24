import { useState, useCallback, useRef } from 'react';

export interface CursorState {
  created_at: string;
  id: string;
}

interface UseCursorPaginationOptions<T> {
  pageSize?: number;
  queryFn: (cursor: CursorState | null, pageSize: number) => Promise<T[]>;
}

interface UseCursorPaginationResult<T> {
  items: T[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  reset: () => void;
  refresh: () => void;
}

export function useCursorPagination<T extends { created_at: string; id: string }>(
  options: UseCursorPaginationOptions<T>
): UseCursorPaginationResult<T> {
  const { pageSize = 50, queryFn } = options;
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<CursorState | null>(null);
  const initialLoadDone = useRef(false);

  const fetchPage = useCallback(async (cursor: CursorState | null, append: boolean) => {
    setLoading(true);
    try {
      const data = await queryFn(cursor, pageSize + 1);
      const hasNext = data.length > pageSize;
      const pageData = hasNext ? data.slice(0, pageSize) : data;

      setHasMore(hasNext);

      if (pageData.length > 0) {
        const last = pageData[pageData.length - 1];
        cursorRef.current = { created_at: last.created_at, id: last.id };
      }

      if (append) {
        setItems(prev => [...prev, ...pageData]);
      } else {
        setItems(pageData);
      }
    } catch (err) {
      console.error('Cursor pagination error:', err);
    } finally {
      setLoading(false);
    }
  }, [queryFn, pageSize]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchPage(cursorRef.current, true);
    }
  }, [loading, hasMore, fetchPage]);

  const reset = useCallback(() => {
    cursorRef.current = null;
    setItems([]);
    setHasMore(true);
    initialLoadDone.current = false;
  }, []);

  const refresh = useCallback(() => {
    cursorRef.current = null;
    fetchPage(null, false);
  }, [fetchPage]);

  // Auto-load first page
  if (!initialLoadDone.current && !loading) {
    initialLoadDone.current = true;
    fetchPage(null, false);
  }

  return { items, loading, hasMore, loadMore, reset, refresh };
}
