import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Film, Image as ImageIcon, Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AspectRatio,
  GoogleFont,
  GOOGLE_FONTS,
  GRADIENT_PRESETS,
  VideoExportConfig,
  ensureGoogleFont,
  gradientToCss,
  saveVideoExportConfig,
} from '@/lib/videoExportConfig';
import { cn } from '@/lib/utils';

interface VideoExportSuiteProps {
  config: VideoExportConfig;
  onChange: (cfg: VideoExportConfig) => void;
  compact?: boolean;
}

export const VideoExportSuite = ({ config, onChange, compact = true }: VideoExportSuiteProps) => {
  const fileRef = useRef<HTMLInputElement>(null);

  // Preload chosen font for canvas + preview.
  useEffect(() => {
    ensureGoogleFont(config.overlay.font);
  }, [config.overlay.font]);

  const update = (patch: Partial<VideoExportConfig>) => {
    const next = { ...config, ...patch } as VideoExportConfig;
    onChange(next);
    saveVideoExportConfig(next);
  };

  const updateBg = (patch: Partial<VideoExportConfig['background']>) => {
    update({ background: { ...config.background, ...patch } });
  };

  const updateOverlay = (patch: Partial<VideoExportConfig['overlay']>) => {
    update({ overlay: { ...config.overlay, ...patch } });
  };

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image or GIF');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Image must be under 8MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateBg({ type: 'image', imageDataUrl: String(reader.result) });
      toast.success('Background image set');
    };
    reader.readAsDataURL(file);
  };

  return (
    <Sheet>
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn('gap-1.5', compact ? 'h-8 px-2 text-xs' : 'h-9 px-3 text-sm')}
            >
              <Film className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>Video Export Suite</p>
        </TooltipContent>
      </Tooltip>

      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Film className="w-5 h-5 text-primary" />
            Video Export Suite
          </SheetTitle>
          <SheetDescription>
            Configure aspect ratio, background and overlays for 1080p video capture.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Aspect Ratio */}
          <section className="space-y-2">
            <Label className="text-sm font-semibold">Aspect Ratio</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: '16:9' as AspectRatio, label: '16:9 Landscape', sub: 'YouTube' },
                  { id: '9:16' as AspectRatio, label: '9:16 Vertical', sub: 'TikTok / Shorts' },
                ]
              ).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => update({ aspectRatio: r.id })}
                  className={cn(
                    'rounded-lg border p-3 text-left transition',
                    config.aspectRatio === r.id
                      ? 'border-primary bg-primary/10 ring-1 ring-primary'
                      : 'border-border hover:border-primary/50',
                  )}
                >
                  <div className="flex items-center justify-center mb-2">
                    <div
                      className={cn(
                        'bg-gradient-to-br from-primary/40 to-primary/10 rounded',
                        r.id === '16:9' ? 'w-14 h-8' : 'w-6 h-10',
                      )}
                    />
                  </div>
                  <div className="text-xs font-medium">{r.label}</div>
                  <div className="text-[10px] text-muted-foreground">{r.sub}</div>
                </button>
              ))}
            </div>
          </section>

          <Separator />

          {/* Background */}
          <section className="space-y-3">
            <Label className="text-sm font-semibold">Background</Label>
            <div className="grid grid-cols-3 gap-2">
              {GRADIENT_PRESETS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => updateBg({ type: 'gradient', gradientId: g.id })}
                  className={cn(
                    'rounded-lg border-2 p-1 transition',
                    config.background.type === 'gradient' && config.background.gradientId === g.id
                      ? 'border-primary ring-1 ring-primary'
                      : 'border-border hover:border-primary/50',
                  )}
                  title={g.label}
                >
                  <div
                    className="w-full h-14 rounded"
                    style={{ background: gradientToCss(g) }}
                  />
                  <div className="text-[10px] mt-1 text-center text-muted-foreground">
                    {g.label}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.currentTarget.value = '';
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-3.5 h-3.5" />
                {config.background.type === 'image' ? 'Change image' : 'Upload image / GIF'}
              </Button>
              {config.background.type === 'image' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => updateBg({ type: 'gradient', imageDataUrl: undefined })}
                  title="Remove image"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>

            {config.background.type === 'image' && config.background.imageDataUrl && (
              <div className="rounded-md overflow-hidden border border-border">
                <img
                  src={config.background.imageDataUrl}
                  alt="Custom background"
                  className="w-full h-24 object-cover"
                />
                <div className="text-[10px] text-muted-foreground px-2 py-1 bg-muted/40 flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" /> Animated GIFs render their live frame during capture.
                </div>
              </div>
            )}
          </section>

          <Separator />

          {/* Overlay */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Text Overlay</Label>
              <Switch
                checked={config.overlay.enabled}
                onCheckedChange={(v) => updateOverlay({ enabled: v })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ve-title" className="text-xs">Track title</Label>
              <Input
                id="ve-title"
                placeholder="Auto from current track"
                value={config.overlay.title}
                onChange={(e) => updateOverlay({ title: e.target.value })}
                disabled={!config.overlay.enabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ve-artist" className="text-xs">Artist name</Label>
              <Input
                id="ve-artist"
                placeholder="Auto from current track"
                value={config.overlay.artist}
                onChange={(e) => updateOverlay({ artist: e.target.value })}
                disabled={!config.overlay.enabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ve-handle" className="text-xs">Social handle</Label>
              <Input
                id="ve-handle"
                placeholder="@yourname"
                value={config.overlay.handle}
                onChange={(e) => updateOverlay({ handle: e.target.value })}
                disabled={!config.overlay.enabled}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label className="text-xs">Font</Label>
                <Select
                  value={config.overlay.font}
                  onValueChange={(v) => updateOverlay({ font: v as GoogleFont })}
                  disabled={!config.overlay.enabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GOOGLE_FONTS.map((f) => (
                      <SelectItem key={f} value={f}>
                        <span style={{ fontFamily: `"${f}", sans-serif` }}>{f}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.overlay.color}
                    onChange={(e) => updateOverlay({ color: e.target.value })}
                    disabled={!config.overlay.enabled}
                    className="h-10 w-12 rounded border border-input bg-background cursor-pointer"
                  />
                  <Input
                    value={config.overlay.color}
                    onChange={(e) => updateOverlay({ color: e.target.value })}
                    disabled={!config.overlay.enabled}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Position</Label>
              <div className="grid grid-cols-2 gap-2">
                {(['top', 'bottom'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={!config.overlay.enabled}
                    onClick={() => updateOverlay({ position: p })}
                    className={cn(
                      'rounded-md border p-2 text-xs capitalize transition disabled:opacity-50',
                      config.overlay.position === p
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50',
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <p className="text-[11px] text-muted-foreground">
            Output is rendered at {config.aspectRatio === '16:9' ? '1920×1080' : '1080×1920'} @ 60fps.
            Press <kbd className="px-1 rounded bg-muted">R</kbd> while a track is playing to start the recording.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
};
