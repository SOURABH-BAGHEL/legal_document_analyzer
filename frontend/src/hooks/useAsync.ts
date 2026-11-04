import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../services/api";

/** Load data on mount (and when deps change) with loading/error state and a reload function. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  const reload = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const result = await run();
      if (id === latest.current) setData(result);
    } catch (err) {
      if (id === latest.current) setError(errorMessage(err));
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}
