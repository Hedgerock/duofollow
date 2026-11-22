import { createContext, useContext, useMemo, useState } from 'react';

import type { ReactNode } from 'react';

function createOwnership() {
  let active: { id: string; close: () => void } | null = null;
  return {
    claim(id: string, close: () => void) {
      const previous = active;
      active = { id, close };
      if (previous && previous.id !== id) previous.close();
      return previous !== null;
    },
    release(id: string) {
      if (active?.id === id) active = null;
    },
  };
}

const TooltipContext = createContext({ enabled: true, ownership: createOwnership() });

/** Coordinates hint ownership without updating every row when the pointer moves. */
export function TooltipProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [ownership] = useState(createOwnership);
  const value = useMemo(() => ({ enabled, ownership }), [enabled, ownership]);
  return <TooltipContext value={value}>{children}</TooltipContext>;
}

export function useTooltips() {
  return useContext(TooltipContext);
}
