import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Settings2, Waves } from 'lucide-react';
import { EqualizerPreset } from '@/hooks/useAudioEffects';

interface EqualizerPanelProps {
  currentPreset: EqualizerPreset;
  onPresetChange: (preset: EqualizerPreset) => void;
  reverbEnabled: boolean;
  reverbAmount: number;
  onReverbToggle: () => void;
  onReverbAmountChange: (amount: number) => void;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
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
}: EqualizerPanelProps) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="rounded-full">
          <Settings2 className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Audio Effects</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Equalizer Presets */}
          <div className="space-y-3">
            <label className="text-sm font-medium flex items-center gap-2">
              <Waves className="w-4 h-4" />
              Equalizer Presets
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.value}
                  variant={currentPreset === preset.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onPresetChange(preset.value)}
                  className="w-full"
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
              >
                {reverbEnabled ? 'ON' : 'OFF'}
              </Button>
            </div>
            {reverbEnabled && (
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

          {/* Playback Speed (Slowed Effect) */}
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
                  onClick={() => onPlaybackRateChange(0.8)}
                  className="flex-1"
                >
                  Slowed
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
