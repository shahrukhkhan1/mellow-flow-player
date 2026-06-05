
## Goal

Replace the placeholder Razorpay link with two real Stripe Payment Links (monthly + yearly). Store Pro status per-user in the database so it syncs across devices for signed-in users.

## How it works

1. You paste two Stripe Payment Link URLs (one monthly, one yearly) into `src/lib/premium.ts`.
2. In Stripe Dashboard, set the **success URL** of each link to: `https://pocket-mp3.lovable.app/?pro=success&plan=monthly` (and `plan=yearly` for the other).
3. When the user clicks **Upgrade Monthly** or **Upgrade Yearly** in the Premium modal, we open the matching Stripe link in a new tab (with `?client_reference_id=<userId>&prefilled_email=<email>` appended so Stripe ties the payment to the user).
4. When Stripe redirects back with `?pro=success`, the app marks the signed-in user as Pro in the database and shows a confirmation toast.

## Database

New table `premium_subscriptions`:
- `user_id` (PK, references auth.users)
- `plan` ('monthly' | 'yearly')
- `activated_at`, `updated_at`
- RLS: users can read/insert/update only their own row.

`usePremium` hook reads from this table when signed in, falls back to localStorage when signed out (existing behavior preserved).

## UI changes

- `PremiumModal`: split CTA into two buttons — "Upgrade Monthly ₹499" and "Upgrade Yearly ₹3,999". Each opens its respective Stripe link.
- Keep the "I've already paid — activate Pro" manual override for testing.
- Add a top-level success-redirect handler in `App.tsx` that detects `?pro=success`, writes the row, cleans the URL, and toasts.

## Files

- `src/lib/premium.ts` — add `STRIPE_MONTHLY_URL`, `STRIPE_YEARLY_URL` constants (placeholders for you to fill), helper to build checkout URL with user id/email.
- `src/hooks/usePremium.ts` — read/write `premium_subscriptions` when authenticated; keep localStorage fallback.
- `src/components/PremiumModal.tsx` — two CTAs.
- `src/App.tsx` (or root) — handle `?pro=success` redirect.
- New migration creating `premium_subscriptions` table + RLS + grants.

## How to make yourself Pro right now (no Stripe needed)

Open the player → click any locked feature (Video Export button or 8D Spatial Audio preset) → in the modal that opens, scroll to the bottom and click **"I've already paid — activate Pro"**. Everything unlocks instantly. After this plan ships, that same button will also write your Pro flag to the database so it persists across devices when you're signed in.

## What I'll need from you after implementation

The two Stripe Payment Link URLs. Paste them in chat and I'll drop them into `src/lib/premium.ts`. Make sure each link's **After payment → Don't show confirmation page → Redirect** is set to the URLs above.
