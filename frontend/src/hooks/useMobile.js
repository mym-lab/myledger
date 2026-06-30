// ─── useMobile.js ─────────────────────────────────────────────────────────────
// Returns true when viewport width is below the given breakpoint (default 768px).
// Re-evaluates on window resize so components respond live.

import { useState, useEffect } from 'react';

export function useMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [breakpoint]);

  return isMobile;
}
