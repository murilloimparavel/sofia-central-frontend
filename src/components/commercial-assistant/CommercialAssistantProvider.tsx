import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { CommercialAssistantContext } from './CommercialAssistantContext';

export function CommercialAssistantProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpenState] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const setIsOpen = useCallback((open: boolean) => setOpenState(open), []);
  const toggle = useCallback(() => setOpenState(current => !current), []);
  const value = useMemo(
    () => ({ isOpen, setIsOpen, toggle, mobileTriggerRef }),
    [isOpen, setIsOpen, toggle],
  );

  return (
    <CommercialAssistantContext.Provider value={value}>
      {children}
    </CommercialAssistantContext.Provider>
  );
}
