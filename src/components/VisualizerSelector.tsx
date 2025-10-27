import { Button } from '@/components/ui/button';
import { BarChart3, Activity, Circle, Waves } from 'lucide-react';

interface VisualizerSelectorProps {
  currentType: 'bars' | 'wave' | 'circular' | 'spectrum';
  onTypeChange: (type: 'bars' | 'wave' | 'circular' | 'spectrum') => void;
}

export const VisualizerSelector = ({ currentType, onTypeChange }: VisualizerSelectorProps) => {
  const visualizers = [
    { type: 'bars' as const, icon: BarChart3, label: 'Bars' },
    { type: 'wave' as const, icon: Activity, label: 'Wave' },
    { type: 'circular' as const, icon: Circle, label: 'Circular' },
    { type: 'spectrum' as const, icon: Waves, label: 'Spectrum' },
  ];

  return (
    <div className="flex gap-2 justify-center">
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
