// Simple simulated premium status flag persisted to localStorage.
// Components subscribe via the `pocket-mp3-premium-changed` window event.

const KEY = 'pocket-mp3-premium';
const EVT = 'pocket-mp3-premium-changed';
const OPEN_EVT = 'pocket-mp3-premium-open';

export type PremiumPlan = 'creator-pro-monthly' | 'creator-pro-yearly';

export const isPremium = (): boolean => {
  try { return localStorage.getItem(KEY) === 'true'; } catch { return false; }
};

export const setPremium = (value: boolean) => {
  try {
    if (value) localStorage.setItem(KEY, 'true');
    else localStorage.removeItem(KEY);
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

// Replace with a real Stripe / Razorpay payment link when going live.
export const CHECKOUT_URL =
  'https://razorpay.com/payment-link/'; // placeholder; user can swap
