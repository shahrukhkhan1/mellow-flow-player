import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Trash2, RefreshCw, Power, Bug, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

interface DevToolsProps {
  isOpen: boolean;
  onClose: () => void;
}

// Build timestamp injected at build time
const BUILD_TIME = import.meta.env.VITE_BUILD_TIME || 'development';

export const clearAllCaches = async (): Promise<boolean> => {
  try {
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map(name => caches.delete(name)));
      logger.debug('[DevTools] Cleared all caches:', names);
    }
    return true;
  } catch (error) {
    logger.error('[DevTools] Failed to clear caches:', error);
    return false;
  }
};

export const unregisterServiceWorkers = async (): Promise<boolean> => {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(r => r.unregister()));
      logger.debug('[DevTools] Unregistered service workers:', registrations.length);
    }
    return true;
  } catch (error) {
    logger.error('[DevTools] Failed to unregister service workers:', error);
    return false;
  }
};

export const hardReload = async () => {
  await clearAllCaches();
  await unregisterServiceWorkers();
  window.location.reload();
};

export const DevTools = ({ isOpen, onClose }: DevToolsProps) => {
  const [devMode, setDevMode] = useState(() => 
    localStorage.getItem('dev-mode') === 'true'
  );
  const [isClearing, setIsClearing] = useState(false);

  const handleDevModeToggle = (enabled: boolean) => {
    setDevMode(enabled);
    localStorage.setItem('dev-mode', enabled.toString());
    toast.success(enabled ? 'Dev mode enabled - caches will clear on next load' : 'Dev mode disabled');
  };

  const handleClearCaches = async () => {
    setIsClearing(true);
    const success = await clearAllCaches();
    setIsClearing(false);
    if (success) {
      toast.success('All caches cleared');
    } else {
      toast.error('Failed to clear caches');
    }
  };

  const handleUnregisterSW = async () => {
    setIsClearing(true);
    const success = await unregisterServiceWorkers();
    setIsClearing(false);
    if (success) {
      toast.success('Service workers unregistered');
    } else {
      toast.error('Failed to unregister service workers');
    }
  };

  const handleHardReload = async () => {
    toast.info('Clearing caches and reloading...');
    await hardReload();
  };

  const formatBuildTime = (timestamp: string) => {
    if (timestamp === 'development') return 'Development build';
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-auto max-h-[80vh] overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            <SheetTitle>Developer Tools</SheetTitle>
          </div>
          <SheetDescription>
            Debug tools for development and testing
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 pb-6">
          {/* Version Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bug className="w-4 h-4" />
                Build Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Build Time</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {formatBuildTime(BUILD_TIME)}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Environment</span>
                <Badge variant={import.meta.env.DEV ? 'secondary' : 'default'}>
                  {import.meta.env.DEV ? 'Development' : 'Production'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Dev Mode Toggle */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Auto-Clear on Load</CardTitle>
              <CardDescription className="text-xs">
                When enabled, caches will be cleared automatically when the app opens
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm">Dev Mode</span>
                <Switch
                  checked={devMode}
                  onCheckedChange={handleDevModeToggle}
                />
              </div>
            </CardContent>
          </Card>

          {/* Cache Actions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Cache Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={handleClearCaches}
                disabled={isClearing}
              >
                <Trash2 className="w-4 h-4" />
                Clear All Caches
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={handleUnregisterSW}
                disabled={isClearing}
              >
                <Power className="w-4 h-4" />
                Unregister Service Workers
              </Button>
              <Button
                variant="default"
                className="w-full justify-start gap-2"
                onClick={handleHardReload}
              >
                <RefreshCw className="w-4 h-4" />
                Hard Reload (Clear All + Refresh)
              </Button>
            </CardContent>
          </Card>

          {/* URL Hint */}
          <Card className="bg-muted/50">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">
                <strong>Tip:</strong> You can also add <code className="bg-background px-1 rounded">?forcereload=1</code> to the URL to trigger a hard reload automatically.
              </p>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
};
