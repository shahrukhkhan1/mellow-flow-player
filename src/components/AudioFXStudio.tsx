import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sliders, Disc3, Cloud, Radio, Sparkles, Music4, Gauge, Orbit, RotateCcw } from 'lucide-react';
import { AmbienceLayer, FXStylePreset } from '@/hooks/useAudioFXStudio';
import { isIOSDevice } from '@/lib/utils';

interface AudioFXStudioProps {
  // pitch & speed
  pitchSemitones: number;
  onPitchChange: (semitones: number) => void;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  baseBPM: number;
  onBaseBPMChange: (bpm: number) => void;
  // pan
  stereoPan: number;
  onStereoPanChange: (pan: number) => void;
  spatial8DEnabled: boolean;
  // ambience
  ambience: Record<AmbienceLayer, { enabled: boolean; volume: number }>;
  onAmbienceChange: (layer: AmbienceLayer, patch: { enabled?: boolean; volume?: number }) => void;
  // presets & state
  onApplyStylePreset: (preset: FXStylePreset) => void;
  onReset: () => void;
  isBypassMode: boolean;
}

const AMBIENCE_META: { key: AmbienceLayer; label: string; icon: typeof Disc3 }[] = [
  { key: 'vinyl', label: 'Vinyl Crackle', icon: Disc3 },
  { key: 'rain', label: 'Soft Rain', icon: Cloud },
  { key: 'hiss', label: 'Tape Hiss', icon: Radio },
];

export const AudioFXStudio = ({
  pitchSemitones,
  onPitchChange,
  playbackRate,
  onPlaybackRateChange,
  baseBPM,
  onBaseBPMChange,
  stereoPan,
  onStereoPanChange,
  spatial8DEnabled,
  ambience,
  onAmbienceChange,
  onApplyStylePreset,
  onReset,
  isBypassMode,
}: AudioFXStudioProps) => {
  const disabled = isBypassMode || isIOSDevice();
  const bpm = Math.round(baseBPM * playbackRate);
  const anyActive = pitchSemitones !== 0 || playbackRate !== 1 || spatial8DEnabled ||
    Math.abs(stereoPan) > 0.01 || Object.values(ambience).some(a => a.enabled);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="rounded-full relative" title="Audio FX Studio">
          <Sliders className="w-4 h-4" />
          {anyActive && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Audio FX Studio
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={onReset} title="Reset FX Studio">
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {disabled && isIOSDevice() && (
            <div className="p-3 rounded-lg bg-muted border border-border">
              <p className="text-sm text-muted-foreground">
                🍎 iOS uses native audio playback. FX Studio effects are unavailable, but ambience layers still work.
              </p>
            </div>
          )}

          {/* Style Presets */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Style Presets
            </label>
            <div className="grid grid-cols-1 gap-2">
              <Button
                variant="outline"
                className="justify-start h-auto py-3"
                onClick={() => onApplyStylePreset('slowed-reverb')}
                disabled={disabled}
              >
                <Disc3 className="w-4 h-4 mr-2 text-primary" />
                <div className="text-left">
                  <div className="font-medium">Slowed & Reverb</div>
                  <div className="text-xs text-muted-foreground">0.80x · -2 st · vinyl crackle</div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="justify-start h-auto py-3"
                onClick={() => onApplyStylePreset('nightcore')}
                disabled={disabled}
              >
                <Gauge className="w-4 h-4 mr-2 text-primary" />
                <div className="text-left">
                  <div className="font-medium">Sped Up (Nightcore)</div>
                  <div className="text-xs text-muted-foreground">1.25x · +3 st · bright</div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="justify-start h-auto py-3"
                onClick={() => onApplyStylePreset('8d-spatial')}
                disabled={disabled}
              >
                <Orbit className="w-4 h-4 mr-2 text-primary" />
                <div className="text-left">
                  <div className="font-medium">8D Spatial Audio</div>
                  <div className="text-xs text-muted-foreground">rotating stereo pan · light reverb</div>
                </div>
              </Button>
            </div>
          </div>

          {/* Pitch */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-2">
                <Music4 className="w-4 h-4" />
                Pitch Shift
              </label>
              <span className="text-xs font-medium tabular-nums">
                {pitchSemitones > 0 ? '+' : ''}{pitchSemitones.toFixed(0)} st
              </span>
            </div>
            <Slider
              value={[pitchSemitones]}
              min={-12}
              max={12}
              step={1}
              onValueChange={(v) => onPitchChange(v[0])}
              disabled={disabled}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>-12</span><span>0</span><span>+12</span>
            </div>
          </div>

          {/* Speed / BPM */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-2">
                <Gauge className="w-4 h-4" />
                Playback Speed
              </label>
              <span className="text-xs font-medium tabular-nums">
                {playbackRate.toFixed(2)}x · {bpm} BPM
              </span>
            </div>
            <Slider
              value={[playbackRate]}
              min={0.5}
              max={2}
              step={0.05}
              onValueChange={(v) => onPlaybackRateChange(v[0])}
              disabled={disabled}
            />
            <div className="flex items-center gap-2 pt-1">
              <label className="text-[11px] text-muted-foreground whitespace-nowrap">Base BPM</label>
              <input
                type="number"
                min={40}
                max={240}
                value={baseBPM}
                onChange={(e) => onBaseBPMChange(Math.max(40, Math.min(240, parseInt(e.target.value || '120', 10))))}
                className="w-16 h-7 px-2 text-xs rounded border border-input bg-background"
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs ml-auto"
                onClick={() => onPlaybackRateChange(1)}
              >
                Reset speed
              </Button>
            </div>
          </div>

          {/* Stereo / 8D */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-2">
                <Orbit className="w-4 h-4" />
                Stereo Pan
              </label>
              <span className="text-xs font-medium tabular-nums">
                {spatial8DEnabled ? '8D auto' : (stereoPan === 0 ? 'C' : stereoPan < 0 ? `L ${Math.round(-stereoPan * 100)}` : `R ${Math.round(stereoPan * 100)}`)}
              </span>
            </div>
            <Slider
              value={[stereoPan]}
              min={-1}
              max={1}
              step={0.05}
              onValueChange={(v) => onStereoPanChange(v[0])}
              disabled={disabled || spatial8DEnabled}
            />
          </div>

          {/* Lo-Fi Ambience Mixer */}
          <div className="space-y-3">
            <label className="text-sm font-medium flex items-center gap-2">
              <Disc3 className="w-4 h-4 text-primary" />
              Lo-Fi Ambience Mixer
            </label>
            <div className="space-y-3 p-3 rounded-lg bg-muted/50 border border-border/50">
              {AMBIENCE_META.map(({ key, label, icon: Icon }) => {
                const state = ambience[key];
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </label>
                      <Switch
                        checked={state.enabled}
                        onCheckedChange={(checked) => onAmbienceChange(key, { enabled: checked })}
                      />
                    </div>
                    <Slider
                      value={[state.volume]}
                      min={0}
                      max={1}
                      step={0.05}
                      onValueChange={(v) => onAmbienceChange(key, { volume: v[0] })}
                      disabled={!state.enabled}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
