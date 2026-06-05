import { useEffect, useState } from 'react';
import {
  isPremium,
  onPremiumChange,
  openPremiumModal,
  fetchRemotePremium,
  activatePremiumRemote,
  deactivatePremiumRemote,
  setPremium,
  type PremiumPlan,
} from '@/lib/premium';
import { supabase } from '@/integrations/supabase/client';

export const usePremium = () => {
  const [premium, setPremiumState] = useState<boolean>(() => isPremium());

  useEffect(() => onPremiumChange(setPremiumState), []);

  // Sync from DB on mount and on auth changes.
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const { active, plan } = await fetchRemotePremium();
      if (cancelled) return;
      if (active) setPremium(true, plan ?? 'monthly');
      // If not active remotely but signed in, trust DB and clear local cache.
      else {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && isPremium()) setPremium(false);
      }
    };
    sync();
    const { data: sub } = supabase.auth.onAuthStateChange(() => sync());
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  return {
    isPremium: premium,
    requirePremium: (reason?: string): boolean => {
      if (premium) return true;
      openPremiumModal(reason);
      return false;
    },
    activate: (plan: PremiumPlan = 'monthly') => activatePremiumRemote(plan),
    deactivate: () => deactivatePremiumRemote(),
  };
};
