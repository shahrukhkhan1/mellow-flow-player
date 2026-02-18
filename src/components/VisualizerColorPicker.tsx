import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Palette } from 'lucide-react';

export type VisualizerColorScheme = 'default' | 'sunset' | 'ocean' | 'neon' | 'fire' | 'ice' | 'forest' | 'candy';

interface VisualizerColorPickerProps {
  currentScheme: VisualizerColorScheme;
  onSchemeChange: (scheme: VisualizerColorScheme) => void;
  className?: string;
}

const COLOR_SCHEMES: { id: VisualizerColorScheme; label: string; colors: string[] }[] = [
  { id: 'default', label: 'Purple', colors: ['#8B5CF6', '#A78BFA', '#6D28D9'] },
  { id: 'sunset', label: 'Sunset', colors: ['#F97316', '#EF4444', '#F59E0B'] },
  { id: 'ocean', label: 'Ocean', colors: ['#06B6D4', '#3B82F6', '#8B5CF6'] },
  { id: 'neon', label: 'Neon', colors: ['#22D3EE', '#A3E635', '#F472B6'] },
  { id: 'fire', label: 'Fire', colors: ['#EF4444', '#F97316', '#FBBF24'] },
  { id: 'ice', label: 'Ice', colors: ['#93C5FD', '#C4B5FD', '#E0E7FF'] },
  { id: 'forest', label: 'Forest', colors: ['#22C55E', '#16A34A', '#A3E635'] },
  { id: 'candy', label: 'Candy', colors: ['#EC4899', '#F472B6', '#A855F7'] },
];

export const VisualizerColorPicker = ({ currentScheme, onSchemeChange, className }: VisualizerColorPickerProps) => {
  const current = COLOR_SCHEMES.find(s => s.id === currentScheme) || COLOR_SCHEMES[0];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-8 px-2 gap-1.5 text-xs ${className || ''}`}
          title="Change visualizer colors"
        >
          <Palette className="w-3.5 h-3.5" />
          <div className="flex gap-0.5">
            {current.colors.map((c, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
            ))}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="end">
        <p className="text-xs font-medium text-muted-foreground mb-2">Visualizer Colors</p>
        <div className="grid grid-cols-2 gap-1.5">
          {COLOR_SCHEMES.map((scheme) => (
            <button
              key={scheme.id}
              onClick={() => onSchemeChange(scheme.id)}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-all ${
                currentScheme === scheme.id
                  ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                  : 'hover:bg-muted text-foreground'
              }`}
            >
              <div className="flex gap-0.5 shrink-0">
                {scheme.colors.map((c, i) => (
                  <div key={i} className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
                ))}
              </div>
              {scheme.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
