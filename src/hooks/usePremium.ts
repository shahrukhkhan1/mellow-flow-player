import { useEffect, useState } from 'react';
import { isPremium, onPremiumChange, openPremiumModal, setPremium } from '@/lib/premium';

export const usePremium = () => {
  const [premium, setPremiumState] = useState<boolean>(() => isPremium());

  useEffect(() => onPremiumChange(setPremiumState), []);

  return {
    isPremium: premium,
    requirePremium: (reason?: string): boolean => {
      if (premium) return true;
      openPremiumModal(reason);
      return false;
    },
    activate: () => setPremium(true),
    deactivate: () => setPremium(false),
  };
};
