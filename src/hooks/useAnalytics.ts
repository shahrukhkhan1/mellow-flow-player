import { useEffect } from 'react';
import { logger } from '@/lib/logger';

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

export const useAnalytics = () => {
  useEffect(() => {
    // Track page view
    trackPageView();
  }, []);

  const trackPageView = () => {
    if (window.gtag) {
      window.gtag('event', 'page_view', {
        page_path: window.location.pathname,
      });
    }
  };

  const trackEvent = (
    action: string,
    category: string,
    label?: string,
    value?: number
  ) => {
    if (window.gtag) {
      window.gtag('event', action, {
        event_category: category,
        event_label: label,
        value: value,
      });
    }
    
    logger.debug('[Analytics]', { action, category, label, value });
  };

  const trackPlayback = (action: 'play' | 'pause' | 'next' | 'previous', trackTitle?: string) => {
    trackEvent(action, 'playback', trackTitle);
  };

  const trackFeature = (feature: string, action: string) => {
    trackEvent(action, 'feature', feature);
  };

  const trackError = (error: string, fatal: boolean = false) => {
    if (window.gtag) {
      window.gtag('event', 'exception', {
        description: error,
        fatal,
      });
    }
  };

  return {
    trackPageView,
    trackEvent,
    trackPlayback,
    trackFeature,
    trackError,
  };
};
