import { Button } from '@/components/ui/button';
import { Circle, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RecordingMode } from '@/hooks/useVideoRecorder';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface RecordingControlsProps {
  isRecording: boolean;
  recordingTime: string;
  onToggleRecording: () => void;
  recordingMode?: RecordingMode;
  onModeChange?: (mode: RecordingMode) => void;
  compact?: boolean;
}

export const RecordingControls = ({
  isRecording,
  recordingTime,
  onToggleRecording,
  recordingMode = 'single',
  onModeChange,
  compact = false,
}: RecordingControlsProps) => {
  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        {/* Mode selector - only show when not recording */}
        {!isRecording && onModeChange && (
          <Select value={recordingMode} onValueChange={(value) => onModeChange(value as RecordingMode)}>
            <SelectTrigger className="h-8 w-[90px] text-xs bg-background/80 backdrop-blur border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single" className="text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  1 Track
                </span>
              </SelectItem>
              <SelectItem value="continuous" className="text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Playlist
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        )}
        
        <Button
          variant={isRecording ? 'destructive' : 'outline'}
          size="sm"
          onClick={onToggleRecording}
          className={cn(
            'gap-2 h-8 px-3',
            isRecording && 'animate-pulse'
          )}
          title={isRecording ? 'Stop recording (R)' : `Record ${recordingMode === 'single' ? 'this track' : 'playlist'} (R)`}
        >
          {isRecording ? (
            <>
              <Square className="w-3 h-3 fill-current" />
              <span className="font-mono text-xs">{recordingTime}</span>
            </>
          ) : (
            <>
              <Circle className="w-3 h-3 fill-red-500 text-red-500" />
              <span className="hidden sm:inline text-xs">REC</span>
            </>
          )}
        </Button>
        
        {/* Mode indicator when recording */}
        {isRecording && (
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded font-medium",
            recordingMode === 'single' 
              ? "bg-primary/20 text-primary" 
              : "bg-green-500/20 text-green-500"
          )}>
            {recordingMode === 'single' ? '1 Track' : 'Playlist'}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {/* Mode selector - only show when not recording */}
      {!isRecording && onModeChange && (
        <Select value={recordingMode} onValueChange={(value) => onModeChange(value as RecordingMode)}>
          <SelectTrigger className="w-[120px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                Single Track
              </span>
            </SelectItem>
            <SelectItem value="continuous">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Playlist
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      )}
      
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
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-destructive">
            {recordingTime}
          </span>
          <span className={cn(
            "text-xs px-2 py-0.5 rounded font-medium",
            recordingMode === 'single' 
              ? "bg-primary/20 text-primary" 
              : "bg-green-500/20 text-green-500"
          )}>
            {recordingMode === 'single' ? 'Single Track' : 'Playlist Mode'}
          </span>
        </div>
      )}
    </div>
  );
};
