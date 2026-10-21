import { useEffect, useState } from 'react';

/** The current time, refreshed every second while `active` is true. */
export default function useNow(active = true, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);

  return now;
}
