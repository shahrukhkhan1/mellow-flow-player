import { Button } from '@/components/ui/button';
import { Circle, Square, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RecordingMode, Resolution } from '@/hooks/useVideoRecorder';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface RecordingControlsProps {
  isRecording: boolean;
  recordingTime: string;
  onToggleRecording: () => void;
  recordingMode?: RecordingMode;
  onModeChange?: (mode: RecordingMode) => void;
  resolution?: Resolution;
  onResolutionChange?: (res: Resolution) => void;
  compact?: boolean;
}

export const RecordingControls = ({
  isRecording,
  recordingTime,
  onToggleRecording,
  recordingMode = 'single',
  onModeChange,
  resolution = '1080p',
  onResolutionChange,
  compact = false,
}: RecordingControlsProps) => {
  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        {/* Settings - only show when not recording */}
        {!isRecording && (
          <>
            {/* Resolution selector */}
            {onResolutionChange && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Select value={resolution} onValueChange={(value) => onResolutionChange(value as '1080p' | '720p')}>
                    <SelectTrigger className="h-8 w-[70px] text-xs bg-background/80 backdrop-blur border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1080p" className="text-xs">
                        <span className="flex items-center gap-1.5">
                          <Monitor className="w-3 h-3" />
                          1080p
                        </span>
                      </SelectItem>
                      <SelectItem value="720p" className="text-xs">
                        <span className="flex items-center gap-1.5">
                          <Monitor className="w-3 h-3" />
                          720p
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Video resolution (YouTube ready)</p>
                </TooltipContent>
              </Tooltip>
            )}
            
            {/* Mode selector */}
            {onModeChange && (
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
          </>
        )}
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isRecording ? 'destructive' : 'outline'}
              size="sm"
              onClick={onToggleRecording}
              className={cn(
                'gap-2 h-8 px-3',
                isRecording && 'animate-pulse'
              )}
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
          </TooltipTrigger>
          <TooltipContent>
            <p>{isRecording ? 'Stop recording (R)' : `Record ${resolution} video (R)`}</p>
          </TooltipContent>
        </Tooltip>
        
        {/* Status indicator when recording */}
        {isRecording && (
          <div className="flex items-center gap-1">
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded font-medium",
              "bg-red-500/20 text-red-400"
            )}>
              {resolution}
            </span>
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded font-medium",
              recordingMode === 'single' 
                ? "bg-primary/20 text-primary" 
                : "bg-green-500/20 text-green-500"
            )}>
              {recordingMode === 'single' ? '1 Track' : 'Playlist'}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Full version
  return (
    <div className="flex items-center gap-3">
      {/* Settings - only show when not recording */}
      {!isRecording && (
        <>
          {/* Resolution selector */}
          {onResolutionChange && (
            <Select value={resolution} onValueChange={(value) => onResolutionChange(value as '1080p' | '720p')}>
              <SelectTrigger className="w-[100px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1080p">
                  <span className="flex items-center gap-2">
                    <Monitor className="w-4 h-4" />
                    1080p HD
                  </span>
                </SelectItem>
                <SelectItem value="720p">
                  <span className="flex items-center gap-2">
                    <Monitor className="w-4 h-4" />
                    720p
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          )}
          
          {/* Mode selector */}
          {onModeChange && (
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
        </>
      )}
      
      <Button
        variant={isRecording ? 'destructive' : 'outline'}
        size="sm"
        onClick={onToggleRecording}
        className={cn(
          'gap-2',
          isRecording && 'animate-pulse'
        )}
        title={isRecording ? 'Stop recording' : `Record ${resolution} visualizer video`}
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
          <span className="text-xs px-2 py-0.5 rounded font-medium bg-red-500/20 text-red-400">
            {resolution}
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
