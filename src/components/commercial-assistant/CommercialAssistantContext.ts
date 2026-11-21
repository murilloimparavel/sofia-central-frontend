import { createContext, useContext, type RefObject } from 'react';

export interface CommercialAssistantContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggle: () => void;
  mobileTriggerRef: RefObject<HTMLButtonElement | null>;
}

export const CommercialAssistantContext = createContext<CommercialAssistantContextValue | null>(null);

export function useCommercialAssistantContext() {
  return useContext(CommercialAssistantContext);
}
