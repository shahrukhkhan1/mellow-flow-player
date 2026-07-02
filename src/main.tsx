import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { logger } from "@/lib/logger";

// Check for force reload URL parameter
const urlParams = new URLSearchParams(window.location.search);
const forceReload = urlParams.get('forcereload') === '1';

// Check if dev mode is enabled
const devMode = localStorage.getItem('dev-mode') === 'true';
const STALE_ASSET_RELOAD_KEY = 'pocket-mp3-stale-asset-reload';

const clearBrowserCaches = async () => {
  if ('caches' in window) {
    const names = await caches.keys();
    await Promise.all(names.map(name => caches.delete(name)));
    logger.debug('[Startup] Cleared caches:', names);
  }

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(r => r.unregister()));
    logger.debug('[Startup] Unregistered service workers:', registrations.length);
  }
};

// Recover from stale PWA caches serving an old index that points to deleted
// hashed JS/CSS files after a Vercel/Lovable deployment.
window.addEventListener('error', (event) => {
  const target = event.target as HTMLElement | null;
  const url = target instanceof HTMLScriptElement
    ? target.src
    : target instanceof HTMLLinkElement
      ? target.href
      : '';

  if (!url || !/\/assets\/.*\.(js|css)(\?|$)/.test(url)) return;
  if (sessionStorage.getItem(STALE_ASSET_RELOAD_KEY) === '1') return;

  sessionStorage.setItem(STALE_ASSET_RELOAD_KEY, '1');
  clearBrowserCaches().finally(() => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('forcereload', '1');
    window.location.replace(nextUrl.toString());
  });
}, true);

// Perform cache clear if force reload or dev mode is enabled
const performStartupCacheClear = async () => {
  if (!forceReload && !devMode) return;

  logger.debug('[Startup] Cache clear triggered:', { forceReload, devMode });

  try {
    await clearBrowserCaches();

    // If triggered by URL param, remove it and reload
    if (forceReload) {
      urlParams.delete('forcereload');
      const newUrl = urlParams.toString() 
        ? `${window.location.pathname}?${urlParams.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      window.location.reload();
      return; // Stop execution, page will reload
    }
  } catch (error) {
    logger.error('[Startup] Failed to clear caches:', error);
  }
};

// Run cache clear before rendering (async IIFE)
(async () => {
  await performStartupCacheClear();
  createRoot(document.getElementById("root")!).render(<App />);
})();
