import { useEffect } from 'react';
import { activatePremiumRemote, type PremiumPlan } from '@/lib/premium';
import { toast } from 'sonner';

/**
 * Detects ?pro=success&plan=monthly|yearly on app load (Stripe redirect),
 * activates Pro for the signed-in user, and cleans the URL.
 */
export const PremiumSuccessHandler = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('pro') !== 'success') return;
    const plan = (params.get('plan') === 'yearly' ? 'yearly' : 'monthly') as PremiumPlan;

    (async () => {
      const ok = await activatePremiumRemote(plan);
      toast.success('Welcome to Creator Pro 🎉', {
        description: ok
          ? `Your ${plan} plan is now active across all your devices.`
          : 'Pro is unlocked on this device. Sign in to sync across devices.',
      });
    })();

    // Clean URL
    params.delete('pro');
    params.delete('plan');
    const q = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (q ? `?${q}` : ''));
  }, []);

  return null;
};
