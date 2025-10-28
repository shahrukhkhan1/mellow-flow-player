import { useState, useEffect } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Button } from '@/components/ui/button';
import { X, Download } from 'lucide-react';
import { toast } from 'sonner';

export const PWAInstallPrompt = () => {
  const { isInstallable, isInstalled, promptInstall } = usePWAInstall();
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if user has dismissed the prompt before
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      setIsDismissed(true);
    }
  }, []);

  const handleInstall = async () => {
    const success = await promptInstall();
    if (success) {
      toast.success('App installed successfully!');
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  if (!isInstallable || isInstalled || isDismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 safe-bottom">
      <div className="bg-card border border-primary/30 rounded-2xl p-4 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center flex-shrink-0">
            <Download className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold mb-1">Install Pocket MP3</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Install our app for quick access and offline playback
            </p>
            <div className="flex gap-2">
              <Button 
                onClick={handleInstall}
                size="sm"
                className="bg-gradient-to-br from-primary to-primary-glow"
              >
                Install App
              </Button>
              <Button 
                onClick={handleDismiss}
                variant="ghost"
                size="sm"
              >
                Maybe Later
              </Button>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            className="flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
