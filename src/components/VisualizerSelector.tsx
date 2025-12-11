import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, Activity, Circle, Sparkles, Zap, Radio } from 'lucide-react';

interface VisualizerSelectorProps {
  currentType: 'bars' | 'wave' | 'circular' | 'spectrum' | 'particles' | 'waveform' | 'rings' | 'galaxy';
  onTypeChange: (type: 'bars' | 'wave' | 'circular' | 'spectrum' | 'particles' | 'waveform' | 'rings' | 'galaxy') => void;
  compact?: boolean;
  className?: string;
}

export const VisualizerSelector = ({ currentType, onTypeChange, compact = false, className }: VisualizerSelectorProps) => {
  const visualizers = [
    { type: 'bars' as const, icon: BarChart3, label: 'Bars' },
    { type: 'wave' as const, icon: Activity, label: 'Wave' },
    { type: 'circular' as const, icon: Circle, label: 'Circular' },
    { type: 'spectrum' as const, icon: Sparkles, label: 'Spectrum' },
    { type: 'particles' as const, icon: Zap, label: 'Particles' },
    { type: 'waveform' as const, icon: Radio, label: 'Waveform' },
    { type: 'rings' as const, icon: Circle, label: 'Rings' },
    { type: 'galaxy' as const, icon: Sparkles, label: 'Galaxy' },
  ];

  if (compact) {
    return (
      <Select value={currentType} onValueChange={onTypeChange}>
        <SelectTrigger className={`w-40 h-9 text-sm ${className || ''}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {visualizers.map((vis) => (
            <SelectItem key={vis.type} value={vis.type} className="text-sm">
              <div className="flex items-center gap-2">
                <vis.icon className="w-4 h-4" />
                {vis.label}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className={`grid grid-cols-4 md:flex gap-2 justify-center ${className || ''}`}>
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
