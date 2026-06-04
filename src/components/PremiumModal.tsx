import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Crown, Sparkles, Film, Orbit, Wand2, Infinity as InfinityIcon } from 'lucide-react';
import { CHECKOUT_URL, onPremiumModalOpen, setPremium, isPremium } from '@/lib/premium';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Tier = 'monthly' | 'yearly';

const FEATURES: { icon: typeof Film; label: string; free: boolean; pro: boolean }[] = [
  { icon: Wand2, label: 'Unlimited offline library', free: true, pro: true },
  { icon: Sparkles, label: 'EQ, reverb & enhancer presets', free: true, pro: true },
  { icon: Film, label: 'Video Export Suite (1080p, YT/TikTok)', free: false, pro: true },
  { icon: Orbit, label: '8D Spatial Audio preset', free: false, pro: true },
  { icon: Crown, label: 'Custom artwork & metadata editor', free: false, pro: true },
  { icon: InfinityIcon, label: 'Priority cloud sync', free: false, pro: true },
];

export const PremiumModal = () => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>();
  const [tier, setTier] = useState<Tier>('monthly');

  useEffect(() => onPremiumModalOpen((r) => {
    if (isPremium()) return;
    setReason(r);
    setOpen(true);
  }), []);

  const price = tier === 'monthly' ? '₹499' : '₹3,999';
  const sub = tier === 'monthly' ? '/ month' : '/ year · save 33%';

  const handleCheckout = () => {
    window.open(CHECKOUT_URL, '_blank', 'noopener,noreferrer');
  };

  const handleActivate = () => {
    setPremium(true);
    setOpen(false);
    toast.success('Creator Pro activated', { description: 'All premium features are now unlocked.' });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        {/* Hero */}
        <div className="relative px-6 pt-6 pb-5 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border-b border-border/60">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-glow">
              <Crown className="w-4 h-4 text-white" />
            </div>
            <span className="text-xs uppercase tracking-wider font-semibold text-primary">Creator Pro</span>
          </div>
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-2xl font-bold">Unlock the full studio</DialogTitle>
            <DialogDescription>
              {reason
                ? `${reason} is a Pro feature. Upgrade to keep creating without limits.`
                : 'Pro-level export, spatial audio and customization.'}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Tier toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-muted">
            {(['monthly', 'yearly'] as Tier[]).map((t) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                className={cn(
                  'rounded-md px-3 py-2 text-sm font-medium transition',
                  tier === t ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t === 'monthly' ? 'Monthly' : 'Yearly'}
                {t === 'yearly' && (
                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">-33%</span>
                )}
              </button>
            ))}
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold">{price}</span>
            <span className="text-sm text-muted-foreground">{sub}</span>
          </div>

          {/* Comparison */}
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <div className="grid grid-cols-[1fr_64px_64px] items-center px-4 py-2 bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              <span>Feature</span>
              <span className="text-center">Free</span>
              <span className="text-center text-primary">Pro</span>
            </div>
            <ul className="divide-y divide-border/60">
              {FEATURES.map(({ icon: Icon, label, free, pro }) => (
                <li key={label} className="grid grid-cols-[1fr_64px_64px] items-center px-4 py-2.5 text-sm">
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                    {label}
                  </span>
                  <span className="text-center">
                    {free ? <Check className="w-4 h-4 mx-auto text-muted-foreground" /> : <span className="text-muted-foreground/40">—</span>}
                  </span>
                  <span className="text-center">
                    {pro && <Check className="w-4 h-4 mx-auto text-primary" />}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* CTA */}
          <div className="space-y-2">
            <Button
              className="w-full h-11 text-base font-semibold gap-2 bg-gradient-to-r from-primary to-primary-glow hover:opacity-90"
              onClick={handleCheckout}
            >
              <Crown className="w-4 h-4" />
              Continue to checkout · {price}
            </Button>
            <Button
              variant="ghost"
              className="w-full h-9 text-xs text-muted-foreground"
              onClick={handleActivate}
            >
              I've already paid — activate Pro
            </Button>
            <p className="text-[10px] text-center text-muted-foreground">
              Secure checkout via Razorpay / Stripe. Cancel anytime.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
