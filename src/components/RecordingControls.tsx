import { Button } from '@/components/ui/button';
import { Circle, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RecordingControlsProps {
  isRecording: boolean;
  recordingTime: string;
  onToggleRecording: () => void;
  compact?: boolean;
}

export const RecordingControls = ({
  isRecording,
  recordingTime,
  onToggleRecording,
  compact = false,
}: RecordingControlsProps) => {
  if (compact) {
    return (
      <Button
        variant={isRecording ? 'destructive' : 'outline'}
        size="sm"
        onClick={onToggleRecording}
        className={cn(
          'gap-2 h-8 px-3',
          isRecording && 'animate-pulse'
        )}
        title={isRecording ? 'Stop recording' : 'Record visualizer video'}
      >
        {isRecording ? (
          <>
            <Square className="w-3 h-3 fill-current" />
            <span className="font-mono text-xs">{recordingTime}</span>
          </>
        ) : (
          <>
            <Circle className="w-3 h-3 fill-red-500 text-red-500" />
            <span className="hidden sm:inline text-xs">Record</span>
          </>
        )}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={isRecording ? 'destructive' : 'outline'}
        size="sm"
        onClick={onToggleRecording}
        className={cn(
          'gap-2',
          isRecording && 'animate-pulse'
        )}
        title={isRecording ? 'Stop recording' : 'Record visualizer video'}
      >
        {isRecording ? (
          <>
            <Square className="w-4 h-4 fill-current" />
            <span>Stop</span>
          </>
        ) : (
          <>
            <Circle className="w-4 h-4 fill-red-500 text-red-500" />
            <span>Record</span>
          </>
        )}
      </Button>
      {isRecording && (
        <span className="text-sm font-mono text-destructive">
          {recordingTime}
        </span>
      )}
    </div>
  );
};
