import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Settings2, Waves, RotateCcw, Sparkles, Volume2, Music2 } from 'lucide-react';
import { EqualizerPreset, EnhancerPreset } from '@/hooks/useAudioEffects';
import { isIOSDevice } from '@/lib/utils';

interface EqualizerPanelProps {
  currentPreset: EqualizerPreset;
  onPresetChange: (preset: EqualizerPreset) => void;
  reverbEnabled: boolean;
  reverbAmount: number;
  onReverbToggle: () => void;
  onReverbAmountChange: (amount: number) => void;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  onResetSettings: () => void;
  isBypassMode?: boolean;
  // Sound enhancer props
  enhancerEnabled?: boolean;
  enhancerPreset?: EnhancerPreset;
  loudnessAmount?: number;
  stereoWidth?: number;
  bassBoost?: number;
  onEnhancerChange?: (settings: { loudness?: number; stereoWidth?: number; bassBoost?: number; enabled?: boolean; preset?: EnhancerPreset }) => void;
}

const PRESETS: { value: EqualizerPreset; label: string }[] = [
  { value: 'flat', label: 'Flat' },
  { value: 'bass', label: 'Bass Boost' },
  { value: 'treble', label: 'Treble' },
  { value: 'vocal', label: 'Vocal' },
  { value: 'rock', label: 'Rock' },
  { value: 'pop', label: 'Pop' },
  { value: 'jazz', label: 'Jazz' },
  { value: 'classical', label: 'Classical' },
  { value: 'hiphop', label: 'Hip Hop' },
  { value: 'trap', label: 'Trap' },
  { value: 'drill', label: 'Drill' },
  { value: 'lofi', label: 'Lo-Fi' },
];

const ENHANCER_PRESETS: { value: EnhancerPreset; label: string; icon?: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'studio', label: 'Studio', icon: '🎧' },
  { value: 'live', label: 'Live', icon: '🎤' },
  { value: 'intimate', label: 'Intimate', icon: '🌙' },
];

export const EqualizerPanel = ({
  currentPreset,
  onPresetChange,
  reverbEnabled,
  reverbAmount,
  onReverbToggle,
  onReverbAmountChange,
  playbackRate,
  onPlaybackRateChange,
  onResetSettings,
  isBypassMode = false,
  enhancerEnabled = false,
  enhancerPreset = 'off',
  loudnessAmount = 0.5,
  stereoWidth = 0.3,
  bassBoost = 2,
  onEnhancerChange,
}: EqualizerPanelProps) => {
  const effectsDisabled = isBypassMode || isIOSDevice();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="rounded-full relative">
          <Settings2 className="w-4 h-4" />
          {enhancerEnabled && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Audio Effects</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onResetSettings}
              title="Reset all settings"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Effects Mode Banner */}
          {effectsDisabled && isIOSDevice() && (
            <div className="p-3 rounded-lg bg-muted border border-border">
              <p className="text-sm text-muted-foreground">
                🍎 iOS uses native audio for background playback. Audio effects unavailable on this device.
              </p>
            </div>
          )}

          {/* Sound Enhancer */}
          <div className="space-y-3">
            <label className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Sound Enhancer
            </label>
            
            {/* Enhancer Presets */}
            <div className="grid grid-cols-4 gap-2">
              {ENHANCER_PRESETS.map((preset) => (
                <Button
                  key={preset.value}
                  variant={enhancerPreset === preset.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onEnhancerChange?.({ preset: preset.value })}
                  className="w-full text-xs"
                  disabled={effectsDisabled}
                >
                  {preset.icon ? `${preset.icon} ` : ''}{preset.label}
                </Button>
              ))}
            </div>

            {/* Manual controls when enhancer is enabled */}
            {enhancerEnabled && !effectsDisabled && (
              <div className="space-y-3 p-3 rounded-lg bg-muted/50 border border-border/50">
                {/* Loudness */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Volume2 className="w-3 h-3" />
                      Loudness
                    </label>
                    <span className="text-xs font-medium">{Math.round(loudnessAmount * 100)}%</span>
                  </div>
                  <Slider
                    value={[loudnessAmount]}
                    min={0}
                    max={1}
                    step={0.05}
                    onValueChange={(v) => onEnhancerChange?.({ loudness: v[0], preset: 'custom' })}
                  />
                </div>

                {/* Bass Boost */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Music2 className="w-3 h-3" />
                      Bass Boost
                    </label>
                    <span className="text-xs font-medium">{bassBoost.toFixed(1)} dB</span>
                  </div>
                  <Slider
                    value={[bassBoost]}
                    min={0}
                    max={6}
                    step={0.5}
                    onValueChange={(v) => onEnhancerChange?.({ bassBoost: v[0], preset: 'custom' })}
                  />
                </div>

                {/* Stereo Width */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">🔊 Stereo Width</label>
                    <span className="text-xs font-medium">{Math.round(stereoWidth * 100)}%</span>
                  </div>
                  <Slider
                    value={[stereoWidth]}
                    min={0}
                    max={1}
                    step={0.05}
                    onValueChange={(v) => onEnhancerChange?.({ stereoWidth: v[0], preset: 'custom' })}
                  />
                </div>
              </div>
            )}
          </div>
          
          {/* Equalizer Presets */}
          <div className="space-y-3">
            <label className="text-sm font-medium flex items-center gap-2">
              <Waves className="w-4 h-4" />
              Equalizer Presets
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.value}
                  variant={currentPreset === preset.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onPresetChange(preset.value)}
                  className="w-full"
                  disabled={effectsDisabled}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Reverb Effect */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Reverb Effect</label>
              <Button
                variant={reverbEnabled ? 'default' : 'outline'}
                size="sm"
                onClick={onReverbToggle}
                disabled={effectsDisabled}
              >
                {reverbEnabled ? 'ON' : 'OFF'}
              </Button>
            </div>
            {reverbEnabled && !effectsDisabled && (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Amount</label>
                <Slider
                  value={[reverbAmount]}
                  min={0}
                  max={1}
                  step={0.1}
                  onValueChange={(v) => onReverbAmountChange(v[0])}
                />
              </div>
            )}
          </div>

          {/* Playback Speed */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Playback Speed</label>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Slower</span>
                <span className="text-foreground font-medium">{playbackRate.toFixed(2)}x</span>
                <span>Faster</span>
              </div>
              <Slider
                value={[playbackRate]}
                min={0.5}
                max={2}
                step={0.05}
                onValueChange={(v) => onPlaybackRateChange(v[0])}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onPlaybackRateChange(0.8);
                    onReverbToggle();
                    if (!reverbEnabled) onReverbAmountChange(0.7);
                  }}
                  className="flex-1"
                >
                  Slowed + Reverb
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPlaybackRateChange(1)}
                  className="flex-1"
                >
                  Normal
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPlaybackRateChange(1.25)}
                  className="flex-1"
                >
                  Fast
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
