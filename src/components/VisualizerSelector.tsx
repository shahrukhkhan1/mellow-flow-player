import { Button } from '@/components/ui/button';
import { BarChart3, Activity, Circle, Sparkles, Zap, Radio } from 'lucide-react';

interface VisualizerSelectorProps {
  currentType: 'bars' | 'wave' | 'circular' | 'spectrum' | 'particles' | 'waveform';
  onTypeChange: (type: 'bars' | 'wave' | 'circular' | 'spectrum' | 'particles' | 'waveform') => void;
}

export const VisualizerSelector = ({ currentType, onTypeChange }: VisualizerSelectorProps) => {
  const visualizers = [
    { type: 'bars' as const, icon: BarChart3, label: 'Bars' },
    { type: 'wave' as const, icon: Activity, label: 'Wave' },
    { type: 'circular' as const, icon: Circle, label: 'Circular' },
    { type: 'spectrum' as const, icon: Sparkles, label: 'Spectrum' },
    { type: 'particles' as const, icon: Zap, label: 'Particles' },
    { type: 'waveform' as const, icon: Radio, label: 'Waveform' },
  ];

  return (
    <div className="grid grid-cols-3 md:flex gap-2 justify-center">
      {visualizers.map(({ type, icon: Icon, label }) => (
        <Button
          key={type}
          variant={currentType === type ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onTypeChange(type)}
          className="gap-2"
        >
          <Icon className="w-4 h-4" />
          <span className="hidden sm:inline">{label}</span>
        </Button>
      ))}
    </div>
  );
};
