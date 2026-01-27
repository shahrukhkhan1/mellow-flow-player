
# Hard Reload on App Open for Dev Testing

## Problem
During development, cached assets can cause you to test stale code. You need a way to force the app to reload fresh content.

## Proposed Solutions

### Option 1: Dev Mode Toggle with Cache Bypass (Recommended)

Add a developer mode that:
- Clears all caches on app load when enabled
- Shows current app version for verification
- Provides a manual "Force Refresh" button

**Implementation:**
1. **Update `main.tsx`** to check for dev mode on startup:
   - Check `localStorage.getItem('dev-mode')` 
   - If enabled, clear service worker caches and reload

2. **Add a Dev Tools panel** (hidden behind a gesture like 5 taps on logo):
   - Toggle dev mode on/off
   - Show current build timestamp/version
   - "Clear All Caches" button
   - "Unregister Service Worker" button

3. **Add cache-clearing logic:**
   ```typescript
   // Clear all caches
   if ('caches' in window) {
     const names = await caches.keys();
     await Promise.all(names.map(name => caches.delete(name)));
   }
   
   // Unregister service worker
   const registrations = await navigator.serviceWorker.getRegistrations();
   await Promise.all(registrations.map(r => r.unregister()));
   
   // Force reload
   window.location.reload();
   ```

### Option 2: URL Parameter Trigger

Add support for `?dev=1` or `?reload=1` in the URL:
- When detected, clear caches and reload without the parameter
- Easy to trigger from any device by just modifying the URL

### Option 3: Version Check on Load

1. Add a version endpoint or embed build timestamp
2. On app load, compare with cached version
3. If different, auto-clear and reload

## Recommended Approach

Combine **Option 1 + Option 2**:
- Add a hidden Dev Tools panel accessible via 5-tap gesture
- Also support `?forcereload=1` URL parameter for quick testing
- Display current version/build time in the panel
- Include buttons for: Clear Cache, Unregister SW, Hard Reload

## Files to Modify

1. **`src/main.tsx`** - Add cache check logic on startup
2. **`src/components/DevTools.tsx`** (new) - Dev panel component
3. **`src/pages/Index.tsx`** - Add hidden gesture trigger for dev panel
4. **`vite.config.ts`** - Optionally add build timestamp to env

## Benefits
- No need to manually clear cache through browser/device settings
- Works on iPhone PWA, Android, and desktop
- Can be disabled in production by removing the dev panel trigger
