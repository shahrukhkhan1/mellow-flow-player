// Premium status — DB-backed for signed-in users, localStorage fallback otherwise.
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

const KEY = 'pocket-mp3-premium';
const PLAN_KEY = 'pocket-mp3-premium-plan';
const EVT = 'pocket-mp3-premium-changed';
const OPEN_EVT = 'pocket-mp3-premium-open';

export type PremiumPlan = 'monthly' | 'yearly';

// ============ Stripe Payment Links ============
// Paste your Stripe Payment Link URLs here.
// In Stripe Dashboard → Payment Links → After payment → Redirect, set:
//   Monthly: https://pocket-mp3.lovable.app/?pro=success&plan=monthly
//   Yearly:  https://pocket-mp3.lovable.app/?pro=success&plan=yearly
export const STRIPE_MONTHLY_URL = 'https://buy.stripe.com/REPLACE_WITH_MONTHLY_LINK';
export const STRIPE_YEARLY_URL  = 'https://buy.stripe.com/REPLACE_WITH_YEARLY_LINK';

export const buildCheckoutUrl = (
  plan: PremiumPlan,
  userId?: string | null,
  email?: string | null,
): string => {
  const base = plan === 'yearly' ? STRIPE_YEARLY_URL : STRIPE_MONTHLY_URL;
  const url = new URL(base);
  if (userId) url.searchParams.set('client_reference_id', userId);
  if (email) url.searchParams.set('prefilled_email', email);
  return url.toString();
};

// ============ Local cache ============
export const isPremium = (): boolean => {
  try { return localStorage.getItem(KEY) === 'true'; } catch { return false; }
};

export const getCachedPlan = (): PremiumPlan | null => {
  try { return (localStorage.getItem(PLAN_KEY) as PremiumPlan) || null; } catch { return null; }
};

export const setPremium = (value: boolean, plan: PremiumPlan = 'monthly') => {
  try {
    if (value) {
      localStorage.setItem(KEY, 'true');
      localStorage.setItem(PLAN_KEY, plan);
    } else {
      localStorage.removeItem(KEY);
      localStorage.removeItem(PLAN_KEY);
    }
  } catch {}
  window.dispatchEvent(new CustomEvent(EVT, { detail: value }));
};

export const onPremiumChange = (cb: (v: boolean) => void) => {
  const handler = (e: Event) => cb((e as CustomEvent<boolean>).detail);
  window.addEventListener(EVT, handler);
  return () => window.removeEventListener(EVT, handler);
};

export const openPremiumModal = (reason?: string) => {
  window.dispatchEvent(new CustomEvent(OPEN_EVT, { detail: reason }));
};

export const onPremiumModalOpen = (cb: (reason?: string) => void) => {
  const handler = (e: Event) => cb((e as CustomEvent<string | undefined>).detail);
  window.addEventListener(OPEN_EVT, handler);
  return () => window.removeEventListener(OPEN_EVT, handler);
};

// ============ DB sync ============
export const fetchRemotePremium = async (): Promise<{ active: boolean; plan: PremiumPlan | null }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { active: false, plan: null };
  const { data, error } = await supabase
    .from('premium_subscriptions')
    .select('plan')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error || !data) return { active: false, plan: null };
  return { active: true, plan: data.plan as PremiumPlan };
};

export const activatePremiumRemote = async (plan: PremiumPlan): Promise<boolean> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // No session — just cache locally.
    setPremium(true, plan);
    return true;
  }
  const { error } = await supabase
    .from('premium_subscriptions')
    .upsert({ user_id: user.id, plan }, { onConflict: 'user_id' });
  if (error) {
    logger.error('[premium] upsert failed', error);
    setPremium(true, plan); // fall back to local
    return false;
  }
  setPremium(true, plan);
  return true;
};

export const deactivatePremiumRemote = async (): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('premium_subscriptions').delete().eq('user_id', user.id);
  }
  setPremium(false);
};
